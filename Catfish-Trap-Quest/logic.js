(function () {
  Game2DCore.mount({ hud: "custom", createGame: function (ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "lilita-one", body: "nunito", hud: "bar", lives: "count", title: "poster", pause: "top-left" });
    ctx.input.setControls({ controls: [
      { id: "left", label: "Steer boat left", keys: ["ArrowLeft", "KeyA"] },
      { id: "right", label: "Steer boat right", keys: ["ArrowRight", "KeyD"] },
      { id: "drop", label: "Cast a net", keys: ["Space", "Enter"] }
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
    var crabLanes = [0.075, 0.27, 0.4, 0.53, 0.66, 0.79];
    for (var c = 0; c < crabLanes.length; c++) {
      var crabArt = ctx.assets.sprite("blue-crab", { size: 60 });
      crabArt.visible = false;
      ctx.layers.world.addChild(crabArt);
      crabs.push({ art: crabArt, active: false, x: 0, y: 0, direction: 1, speed: 80, lane: c, lanePosition: crabLanes[c], kind: "crab", respawn: 0 });
    }
    var swimmers = fish.concat(crabs);

    var nets = [];
    for (var t = 0; t < 3; t++) {
      var netArt = ctx.assets.sprite("river-net", { size: 88 });
      netArt.visible = false;
      ctx.layers.world.addChild(netArt);
      nets.push({ art: netArt, active: false, x: 0, y: 0, speed: 250, catchHalfWidth: 52, catchHalfHeight: 38 });
    }

    var boatDisplaySize = 126;
    var boatSurfaceOffset = (70 - 112 / 2) * (boatDisplaySize / 160);
    var boatDisplayHalfWidth = boatDisplaySize / 2;
    var boatTopClearance = (112 / 2 - 8) * (boatDisplaySize / 160) + 12;
    var player = ctx.assets.sprite("river-fisher-boat", { size: boatDisplaySize });
    ctx.layers.world.addChild(player);

    var catchEffect = new PIXI.Graphics();
    catchEffect.visible = false;
    catchEffect.circle(0, 0, 24).stroke({ width: 3, color: 0xeaffff });
    catchEffect.beginPath().moveTo(-20, -12).lineTo(20, 12)
      .stroke({ width: 2, color: 0x27a9bd, alpha: 0.95 });
    catchEffect.beginPath().moveTo(-20, 12).lineTo(20, -12)
      .stroke({ width: 2, color: 0x27a9bd, alpha: 0.95 });
    catchEffect.beginPath().moveTo(0, -23).lineTo(0, 23)
      .stroke({ width: 2, color: 0x27a9bd, alpha: 0.85 });
    ctx.layers.world.addChild(catchEffect);

    var w = 0, h = 0, left = 0, right = 0, top = 0, bottom = 0;
    var timeLeft = 20, score = 0, catfishCaught = 0, stillTime = 0, playing = false, stream = null;
    var placeCooldown = 0, catchEffectTime = 0, nextQuestionIndex = 0, fishSinceQuestion = 0;
    var facts = [
      {
        fact: "Catfish Have Year-Round Predation",
        question: "When do catfish hunt prey?",
        choices: ["Only in summer", "Only during winter", "In every season", "Only during spawning"],
        answer: 2
      },
      {
        fact: "Catfish Mostly Targeting Smaller Crabs",
        question: "Which crabs do catfish mostly target?",
        choices: ["Mostly smaller crabs", "Mostly the largest crabs", "Only crab eggs", "They do not prey on crabs"],
        answer: 0
      },
      {
        fact: "Catfish Has Fast Population Growth",
        question: "How quickly can catfish populations grow?",
        choices: ["Very slowly", "They cannot reproduce in rivers", "Only one new catfish each year", "They can grow quickly"],
        answer: 3
      }
    ];
    var factQuiz = window.RiverFactQuiz.create(ctx);

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
      for (var j = 0; j < nets.length; j++) {
        nets[j].x = clamp(nets[j].x, left + 32, right - 32);
        nets[j].y = clamp(nets[j].y, top + 48, bottom - 18);
        nets[j].art.x = nets[j].x;
        nets[j].art.y = nets[j].y;
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
      catfishCaught = 0;
      fishSinceQuestion = 0;
      stillTime = 0;
      placeCooldown = 0;
      player.visible = true;
      player.x = clamp(w * 0.5, left + boatDisplayHalfWidth, right - boatDisplayHalfWidth);
      player.y = top - boatSurfaceOffset;
      var limits = fishLimits();
      for (var i = 0; i < swimmers.length; i++) {
        var enemy = swimmers[i];
        enemy.direction = i % 2 === 0 ? 1 : -1;
        enemy.x = limits.min + (i + 1) * (limits.max - limits.min) / (swimmers.length + 1);
        if (enemy === crabs[0]) {
          enemy.direction = -1;
          enemy.x = limits.min;
        }
        enemy.y = swimmerY(enemy);
        enemy.speed = swimmerSpeed(enemy);
        enemy.active = true;
        enemy.respawn = 0;
        enemy.art.visible = enemy.active;
        enemy.art.x = enemy.x;
        enemy.art.y = enemy.y;
        setSwimmerDirection(enemy);
      }
      for (var j = 0; j < nets.length; j++) {
        nets[j].active = false;
        nets[j].art.visible = false;
      }
      catchEffectTime = 0;
      catchEffect.visible = false;
      refreshHud();
      playing = true;
      factQuiz.reset();
      nextQuestionIndex = 0;
      factQuiz.showFact(facts[nextQuestionIndex]);
      ctx.music.play("music.calm_acoustic_loop", { fade: 1 });
      stream = ctx.sfx.loop("ambience.water_loop_01");
    }

    function castNet() {
      var slot = null;
      for (var i = 0; i < nets.length; i++) {
        if (!nets[i].active) { slot = nets[i]; break; }
      }
      if (!slot) {
        ctx.ui.popup("Wait for a net!", player.x, player.y - 38);
        return;
      }
      var startY = player.y + 50;
      for (var j = 0; j < nets.length; j++) {
        var nearby = nets[j];
        if (nearby.active && Math.abs(nearby.x - player.x) < 62 && Math.abs(nearby.y - startY) < 88) {
          ctx.ui.popup("A net is already here!", player.x, player.y - 38);
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
      ctx.ui.popup("Net away!", slot.x, slot.y - 36);
    }

    function showNetCatch(x, y) {
      catchEffect.x = x;
      catchEffect.y = y;
      catchEffect.scale.set(0.7);
      catchEffect.alpha = 1;
      catchEffect.visible = true;
      catchEffectTime = 0.42;
    }

    function loseGame() {
      if (!playing) return;
      playing = false;
      if (stream) { stream.stop(); stream = null; }
      ctx.music.stop({ fade: 1 });
      ctx.emit("lose");
      ctx.ui.gameOver({ score: score });
    }

    function catchSwimmer(enemy, net) {
      enemy.active = false;
      enemy.art.visible = false;
      net.active = false;
      net.art.visible = false;

      if (enemy.kind === "crab") {
        ctx.fx.shake(0.35);
        loseGame();
        return false;
      }

      enemy.respawn = 1.25;
      score += 11;
      catfishCaught += 1;
      fishSinceQuestion += 1;
      refreshHud();
      ctx.sfx.play("water.bubble_02");
      var openedQuestion = false;
      if (fishSinceQuestion >= 5) {
        var askedIndex = nextQuestionIndex;
        openedQuestion = true;
        var handleQuestionAnswer = function (correct) {
          if (!correct) {
            loseGame();
            return;
          }
          nextQuestionIndex = askedIndex + 1;
          fishSinceQuestion = 0;
          if (nextQuestionIndex >= facts.length) {
            playing = false;
            if (stream) { stream.stop(); stream = null; }
            ctx.music.stop({ fade: 1 });
            ctx.emit("win");
            ctx.ui.win({ score: score });
            return;
          }
          factQuiz.showFact(facts[nextQuestionIndex]);
        };
        factQuiz.start(facts[askedIndex], handleQuestionAnswer);
      }
      showNetCatch(net.x, net.y + 12);
      ctx.fx.burst(net.x, net.y + 12);
      ctx.ui.popup("+11", net.x, net.y - 16);
      return openedQuestion;
    }

    function update(dt) {
      if (!playing) return;
      if (factQuiz.update(dt) || !playing) return;
      timeLeft = Math.max(0, timeLeft - dt);
      placeCooldown = Math.max(0, placeCooldown - dt);
      var previousX = player.x;
      var dx = (ctx.input.isDown("right") ? 1 : 0) - (ctx.input.isDown("left") ? 1 : 0);
      player.x = clamp(player.x + dx * 230 * dt, left + boatDisplayHalfWidth, right - boatDisplayHalfWidth);
      player.y = top - boatSurfaceOffset;
      if (Math.abs(player.x - previousX) > 0.5) {
        stillTime = 0;
      } else {
        stillTime += dt;
      }
      if (stillTime >= 5) {
        loseGame();
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

      if (catchEffectTime > 0) {
        catchEffectTime = Math.max(0, catchEffectTime - dt);
        var effectProgress = 1 - catchEffectTime / 0.42;
        catchEffect.scale.set(0.7 + effectProgress * 0.6);
        catchEffect.alpha = 1 - effectProgress;
        if (catchEffectTime <= 0) catchEffect.visible = false;
      }

      if (placeCooldown <= 0 && ctx.input.pressed("drop")) {
        castNet();
        placeCooldown = 0.25;
      }

      for (var t = 0; t < nets.length; t++) {
        var net = nets[t];
        if (!net.active) continue;
        net.y += net.speed * dt;
        net.art.x = net.x;
        net.art.y = net.y;
        var questionStarted = false;
        for (var f = 0; f < swimmers.length; f++) {
          var target = swimmers[f];
          var netCatchY = net.y + 12;
          if (target.active && Math.abs(target.x - net.x) < net.catchHalfWidth && Math.abs(target.y - netCatchY) < net.catchHalfHeight) {
            questionStarted = catchSwimmer(target, net);
            break;
          }
        }
        if (questionStarted) break;
        if (net.active && net.y >= bottom - 18) {
          net.active = false;
          net.art.visible = false;
        }
        if (!playing) break;
      }
    }

    layout(ctx.size);
    refreshHud();
    ctx.ui.title({
      title: "Catfish Net Boat",
      subtitle: "Cast your net to scoop up catfish for points and avoid crabs. Keep moving: if your boat stays still for 5 seconds, the game ends."
    }).then(reset);

    return {
      update: update,
      render: function () {},
      reset: reset,
      onResize: layout
    };
  }});
})();
