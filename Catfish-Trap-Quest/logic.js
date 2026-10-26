(function () {
  Game2DCore.mount({ hud: "custom", createGame: function (ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "lilita-one", body: "nunito", hud: "bar", lives: "count", title: "poster", pause: "top-left" });
    ctx.input.setControls({ controls: [
      { id: "left", label: "Steer boat left", keys: ["ArrowLeft", "KeyA"] },
      { id: "right", label: "Steer boat right", keys: ["ArrowRight", "KeyD"] },
      { id: "drop", label: "Drop a trap", keys: ["Space", "Enter"] }
    ] });

    ctx.assets.background("underwater-current", { fit: "cover" });
    var board = new PIXI.Graphics();
    ctx.layers.world.addChild(board);

    var fish = [];
    var fishLanes = [0.2, 0.32, 0.44, 0.56, 0.68, 0.8];
    for (var i = 0; i < fishLanes.length; i++) {
      var fishArt = ctx.assets.sprite("blue-catfish", { size: 68 });
      fishArt.visible = false;
      ctx.layers.world.addChild(fishArt);
      fish.push({ art: fishArt, active: false, x: 0, y: 0, direction: 1, speed: 55, lane: i, lanePosition: fishLanes[i], kind: "fish", respawn: 0 });
    }

    var crabs = [];
    var crabLanes = [0.14, 0.27, 0.4, 0.53, 0.66, 0.79];
    for (var c = 0; c < crabLanes.length; c++) {
      var crabArt = ctx.assets.sprite("blue-crab", { size: 60 });
      crabArt.visible = false;
      ctx.layers.world.addChild(crabArt);
      crabs.push({ art: crabArt, active: false, x: 0, y: 0, direction: 1, speed: 80, lane: c, lanePosition: crabLanes[c], kind: "crab", respawn: 0 });
    }
    var swimmers = fish.concat(crabs);

    var traps = [];
    for (var t = 0; t < 3; t++) {
      var trapArt = ctx.assets.sprite("river-trap", { size: 66 });
      trapArt.visible = false;
      ctx.layers.world.addChild(trapArt);
      traps.push({ art: trapArt, active: false, x: 0, y: 0, speed: 250 });
    }

    var boatDisplaySize = 126;
    var boatSurfaceOffset = (70 - 112 / 2) * (boatDisplaySize / 160);
    var boatDisplayHalfWidth = boatDisplaySize / 2;
    var boatTopClearance = (112 / 2 - 8) * (boatDisplaySize / 160) + 12;
    var player = ctx.assets.sprite("river-fisher-boat", { size: boatDisplaySize });
    ctx.layers.world.addChild(player);

    var w = 0, h = 0, left = 0, right = 0, top = 0, bottom = 0;
    var timeLeft = 20, score = 0, catches = 0, playing = false, stream = null;
    var placeCooldown = 0;
    var stillTime = 0;

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function swimmerY(swimmer) {
      return top + (bottom - top) * swimmer.lanePosition;
    }

    function swimmerSpeed(swimmer) {
      return (swimmer.kind === "crab" ? 80 : 76) + swimmer.lane * 10;
    }

    function fishLimits() {
      return { min: left + 40, max: right - 40 };
    }

    function layout(size) {
      w = size.width;
      h = size.height;
      var margin = Math.min(26, Math.max(12, w * 0.05));
      left = margin;
      right = Math.max(left + 80, w - margin);
      bottom = h - Math.min(76, h * 0.12);
      var desiredSurface = Math.max(boatTopClearance, h * 0.20);
      var latestSurface = Math.max(boatTopClearance, bottom - Math.max(96, h * 0.34));
      top = Math.min(desiredSurface, latestSurface);

      if (!player.x) player.x = w * 0.5;
      player.x = clamp(player.x, left + boatDisplayHalfWidth, right - boatDisplayHalfWidth);
      player.y = top - boatSurfaceOffset;
      player.visible = true;

      var limits = fishLimits();
      for (var i = 0; i < swimmers.length; i++) {
        var swimmer = swimmers[i];
        swimmer.y = swimmerY(swimmer);
        swimmer.x = clamp(swimmer.x || w * 0.5, limits.min, limits.max);
        swimmer.art.x = swimmer.x;
        swimmer.art.y = swimmer.y;
      }
      for (var j = 0; j < traps.length; j++) {
        traps[j].x = clamp(traps[j].x, left + 32, right - 32);
        traps[j].y = clamp(traps[j].y, top + 48, bottom - 18);
        traps[j].art.x = traps[j].x;
        traps[j].art.y = traps[j].y;
      }

      board.clear();
      board.rect(0, 0, w, top).fill(0x9de7eb);
      board.beginPath().moveTo(0, top);
      for (var waveX = 12; waveX <= w; waveX += 24) {
        board.lineTo(waveX, top + Math.sin(waveX / 18) * 3);
      }
      board.lineTo(w, top).stroke({ color: 0xf0ffff, width: 3, alpha: 0.8 });
      board.roundRect(left, top, right - left, bottom - top, 22)
        .stroke({ color: 0xd6ffff, width: 2, alpha: 0.18 });
      for (var lane = 0; lane < fish.length; lane++) {
        var y = top + (bottom - top) * fish[lane].lanePosition;
        board.beginPath().moveTo(left + 10, y).lineTo(right - 10, y)
          .stroke({ color: 0xe8ffff, width: 1, alpha: 0.13 });
      }
    }

    function refreshHud() {
      ctx.ui.hud.score(score);
      ctx.ui.hud.timer(Math.ceil(timeLeft));
    }

    function setSwimmerDirection(enemy) {
      var baseScale = Math.abs(enemy.art.scale.x) || 1;
      enemy.art.scale.x = baseScale * enemy.direction;
    }

    function spawnSwimmer(enemy, atEdge) {
      var limits = fishLimits();
      enemy.direction = Math.random() < 0.5 ? -1 : 1;
      enemy.x = atEdge
        ? (enemy.direction > 0 ? limits.min : limits.max)
        : limits.min + Math.random() * Math.max(1, limits.max - limits.min);
      enemy.y = swimmerY(enemy);
      enemy.speed = swimmerSpeed(enemy);
      enemy.active = true;
      enemy.respawn = 0;
      enemy.art.visible = true;
      enemy.art.x = enemy.x;
      enemy.art.y = enemy.y;
      setSwimmerDirection(enemy);
    }

    function reset() {
      if (stream) { stream.stop(); stream = null; }
      timeLeft = 20;
      score = 0;
      catches = 0;
      placeCooldown = 0;
      stillTime = 0;
      player.visible = true;
      player.x = clamp(w * 0.5, left + boatDisplayHalfWidth, right - boatDisplayHalfWidth);
      player.y = top - boatSurfaceOffset;
      var limits = fishLimits();
      for (var i = 0; i < swimmers.length; i++) {
        var enemy = swimmers[i];
        enemy.direction = i % 2 === 0 ? 1 : -1;
        enemy.x = limits.min + (i + 1) * (limits.max - limits.min) / (swimmers.length + 1);
        enemy.y = swimmerY(enemy);
        enemy.speed = swimmerSpeed(enemy);
        enemy.active = true;
        enemy.respawn = 0;
        enemy.art.visible = true;
        enemy.art.x = enemy.x;
        enemy.art.y = enemy.y;
        setSwimmerDirection(enemy);
      }
      for (var j = 0; j < traps.length; j++) {
        traps[j].active = false;
        traps[j].art.visible = false;
      }
      refreshHud();
      playing = true;
      stream = ctx.sfx.loop("ambience.water_loop_01");
    }

    function dropTrap() {
      var slot = null;
      for (var i = 0; i < traps.length; i++) {
        if (!traps[i].active) { slot = traps[i]; break; }
      }
      if (!slot) {
        ctx.ui.popup("Wait for a trap!", player.x, player.y - 38);
        return;
      }
      var startY = player.y + 50;
      for (var j = 0; j < traps.length; j++) {
        var nearby = traps[j];
        if (nearby.active && Math.abs(nearby.x - player.x) < 40 && Math.abs(nearby.y - startY) < 76) {
          ctx.ui.popup("Trap already dropping here!", player.x, player.y - 38);
          return;
        }
      }
      slot.x = player.x;
      slot.y = startY;
      slot.speed = 250;
      slot.active = true;
      slot.art.visible = true;
      slot.art.x = slot.x;
      slot.art.y = slot.y;
      ctx.sfx.play("water.plop_01");
      ctx.ui.popup("Trap away!", slot.x, slot.y - 36);
    }

    function catchSwimmer(enemy, trap) {
      enemy.active = false;
      enemy.art.visible = false;
      trap.active = false;
      trap.art.visible = false;

      if (enemy.kind === "crab") {
        playing = false;
        if (stream) { stream.stop(); stream = null; }
        ctx.fx.shake(0.35);
        ctx.emit("lose");
        ctx.ui.gameOver({ score: score });
        return;
      }

      enemy.respawn = 1.25;
      score += 10;
      catches++;
      refreshHud();
      ctx.sfx.play("water.bubble_02");
      ctx.fx.burst(trap.x, trap.y);
      ctx.ui.popup("+10", trap.x, trap.y - 28);
      if (catches >= 8) {
        playing = false;
        if (stream) { stream.stop(); stream = null; }
        ctx.emit("win");
        ctx.ui.win({ score: score, stars: 3 });
      }
    }

    function update(dt) {
      if (!playing) return;
      timeLeft = Math.max(0, timeLeft - dt);
      ctx.ui.hud.timer(Math.ceil(timeLeft));
      if (timeLeft <= 0) {
        playing = false;
        if (stream) { stream.stop(); stream = null; }
        ctx.emit("lose");
        ctx.ui.gameOver({ score: score });
        return;
      }
      placeCooldown = Math.max(0, placeCooldown - dt);
      var dx = (ctx.input.isDown("right") ? 1 : 0) - (ctx.input.isDown("left") ? 1 : 0);
      var previousX = player.x;
      player.x = clamp(player.x + dx * 230 * dt, left + boatDisplayHalfWidth, right - boatDisplayHalfWidth);
      player.y = top - boatSurfaceOffset;
      if (Math.abs(player.x - previousX) > 0.01) {
        stillTime = 0;
      } else {
        stillTime += dt;
      }
      if (stillTime >= 5) {
        playing = false;
        if (stream) { stream.stop(); stream = null; }
        ctx.emit("lose");
        ctx.ui.gameOver({ score: score });
        return;
      }

      var limits = fishLimits();
      for (var i = 0; i < swimmers.length; i++) {
        var enemy = swimmers[i];
        if (!enemy.active) {
          if (enemy.respawn > 0) {
            enemy.respawn -= dt;
            if (enemy.respawn <= 0) spawnSwimmer(enemy, true);
          }
          continue;
        }
        enemy.x += enemy.direction * enemy.speed * dt;
        if (enemy.x <= limits.min) {
          enemy.x = limits.min;
          enemy.direction = 1;
          setSwimmerDirection(enemy);
        } else if (enemy.x >= limits.max) {
          enemy.x = limits.max;
          enemy.direction = -1;
          setSwimmerDirection(enemy);
        }
        enemy.art.x = enemy.x;
        enemy.art.y = swimmerY(enemy);
      }

      if (placeCooldown <= 0 && ctx.input.pressed("drop")) {
        dropTrap();
        placeCooldown = 0.25;
      }

      for (var t = 0; t < traps.length; t++) {
        var trap = traps[t];
        if (!trap.active) continue;
        trap.y += trap.speed * dt;
        trap.art.x = trap.x;
        trap.art.y = trap.y;
        for (var f = 0; f < swimmers.length; f++) {
          var target = swimmers[f];
          if (target.active && Math.abs(target.x - trap.x) < 42 && Math.abs(target.y - trap.y) < 36) {
            catchSwimmer(target, trap);
            break;
          }
        }
        if (trap.active && trap.y >= bottom - 18) {
          trap.active = false;
          trap.art.visible = false;
        }
        if (!playing) break;
      }
    }

    layout(ctx.size);
    refreshHud();
    ctx.ui.title({
      title: "Catfish Trap Boat",
      subtitle: "Trap 8 catfish in 20 seconds to win, but avoid the blue crabs!"
    }).then(reset);

    return {
      update: update,
      render: function () {},
      reset: reset,
      onResize: layout
    };
  }});
})();
