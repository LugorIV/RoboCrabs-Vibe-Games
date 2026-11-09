(function () {
  Game2DCore.mount({ hud: "custom", createGame(ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "lilita-one", body: "nunito", hud: "bar", lives: "bar", title: "ribbon", pause: "bottom-right" });
    ctx.input.setControls({ controls: [
      { id: "cast", label: "Cast", keys: ["Space"] },
      { id: "keep", label: "Keep", keys: ["KeyK"] },
      { id: "release", label: "Put Back", keys: ["KeyR"] }
    ] });
    const bg = ctx.assets.background("sunny-crab-pier", { fit: "cover" });
    const world = ctx.layers.world;
    const sea = new PIXI.Graphics();
    const pier = new PIXI.Graphics();
    const line = new PIXI.Graphics();
    const hook = new PIXI.Graphics();
    const fisher = ctx.assets.sprite("fisher", { size: 112 });
    const rod = ctx.assets.sprite("fishing-rod", { size: 112 });
    const catfish = ctx.assets.sprite("catfish", { size: 360 });
    const corals = Array.from({ length: 8 }, () => ctx.assets.sprite("sea-coral", { size: 92 }));
    world.addChild(sea, pier, ...corals);
    const crabs = Array.from({ length: 8 }, (_, i) => {
      const isBig = i % 2 === 1;
      const size = isBig ? 112 : 76;
      const view = ctx.assets.sprite("crab-blue", { size });
      world.addChild(view);
      return { view, x: 0, y: 0, vx: 0, active: true, phase: i * 1.7, isBig };
    });
    world.addChild(line, hook, fisher, rod, catfish);
    catfish.visible = false;
    let w = 0, h = 0, surface = 0, bottom = 0, anchor = 0;
    let hookY = 0, mode = "idle", caught = null, score = 0, lossCount = 0, pointsInRow = 0;
    let running = false, elapsed = 0, choice = null, maxHealth = 10, health = 10, scareTime = 0;
    let spawnTimer = 4;
    let habitatCount = 0;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function resetCrab(c, i) {
      c.x = clamp(anchor + (i - 3.5) * Math.min(55, w * 0.105), 30, w - 30);
      c.y = surface + 55 + (i % 3) * Math.max(40, (bottom - surface - 100) / 3);
      c.y = clamp(c.y, surface + 48, bottom - 30);
      c.vx = (i % 2 ? -1 : 1) * (38 + i * 5);
      c.active = true;
      c.respawn = 0;
      c.view.scale.set(1);
      c.view.position.set(c.x, c.y);
      c.view.visible = true;
    }
    function spawnCrab() {
      const slot = crabs.findIndex(c => !c.active && !c.view.visible);
      if (slot >= 0) resetCrab(crabs[slot], slot);
    }
    function layout() {
      w = ctx.size.width; h = ctx.size.height;
      surface = clamp(h * 0.37, 150, h * 0.48);
      bottom = h - Math.max(104, h * 0.15);
      anchor = w * 0.52;
      // Keep the swimming area as uninterrupted water so the pier remains the only deck surface.
      sea.clear().rect(0, surface, w, h - surface).fill(0x21c9cf);
      sea.rect(0, bottom + 20, w, h - bottom).fill({ color: 0xf5d38e, alpha: 0.78 });
      pier.clear().roundRect(0, surface - 15, w * 0.43, 24, 7).fill(0xc3834c).stroke({ color: 0x754d3e, width: 3 });
      pier.rect(w * 0.1, surface + 7, 15, Math.min(88, bottom - surface)).fill(0x956744);
      corals.forEach((coral, i) => {
        coral.position.set(w * (0.06 + i * 0.125), bottom - 18);
        coral.scale.set(i % 3 === 1 ? 0.78 : i % 3 === 2 ? 0.92 : 1);
      });
      fisher.position.set(Math.max(50, anchor - 145), surface - 75);
      rod.position.set(anchor - 65, surface - 75);
      catfish.position.set(w * 0.56, surface + Math.min(150, (bottom - surface) * 0.48));
      if (mode === "idle") hookY = surface + 14;
      crabs.forEach((c, i) => {
        c.y = clamp(c.y || surface + 65, surface + 42, bottom - 25);
        c.x = clamp(anchor + (i - 3.5) * Math.min(55, w * 0.105), 30, w - 30);
      });
    }
    function drawHook() {
      line.clear().moveTo(anchor, surface - 53).lineTo(anchor, hookY).stroke({ color: 0x324f65, width: 2 });
      hook.clear().moveTo(anchor, hookY - 2).lineTo(anchor, hookY + 12)
        .bezierCurveTo(anchor + 13, hookY + 19, anchor + 15, hookY + 5, anchor + 9, hookY + 5)
        .stroke({ color: 0xe9f9fa, width: 4 });
    }
    function startRound() {
      score = 0; lossCount = 0; health = maxHealth; pointsInRow = 0; elapsed = 0; spawnTimer = 4;
      habitatCount = 0;
      mode = "idle"; caught = null; scareTime = 0; running = true;
      catfish.visible = false; catfish.scale.set(1);
      if (choice) { choice.remove(); choice = null; }
      crabs.forEach(c => { c.active = false; c.view.visible = false; c.respawn = 0; });
      crabs.slice(0, 6).forEach((c, i) => resetCrab(c, i));
      hookY = surface + 14;
      ctx.ui.hud.score(0); ctx.ui.hud.lives(health, maxHealth); ctx.ui.hud.combo(0);
      ctx.music.play("music.ukulele_song");
      ctx.sfx.play("jingle.ready_go_synth_02");
    }
    function cast() {
      if (!running || mode !== "idle") return;
      mode = "down";
      ctx.sfx.play("water.plop_01");
    }
    function showCrabActions() {
      mode = "choice";
      choice = ctx.ui.toolbar([
        { id: "keep", label: "Keep Crab", picture: ctx.assets.pictureUrl("crab-blue") },
        { id: "release", label: "Put Back", icon: "💧" }
      ], { onSelect: choose });
    }
    function answerCatfish(answer) {
      if (mode !== "question" || !caught) return;
      if (choice) { choice.remove(); choice = null; }
      if (answer === "catfish-yes") {
        ctx.ui.banner("Yes! Some catfish eat crabs.");
        ctx.ui.popup("Correct!", anchor, surface + 42);
        ctx.sfx.play("pickup.soft_chime_03");
        health = maxHealth;
        ctx.ui.hud.lives(health, maxHealth);
        showCrabActions();
      } else {
        mode = "scare";
        scareTime = 1.15;
        health = Math.max(0, health - 6);
        ctx.ui.hud.lives(health, maxHealth);
        catfish.visible = true;
        catfish.scale.set(0.18);
        ctx.ui.banner("Wrong answer... SURPRISE CATFISH!");
        ctx.fx.shake(0.55);
        ctx.fx.flash();
        ctx.sfx.play("creature.screech_01", { volume: 0.8 });
      }
    }
    function grab(c) {
      caught = c; c.active = false;
      c.view.position.set(anchor, surface + 37);
      c.view.scale.set(c.isBig ? 1.35 : 1);
      ctx.sfx.play("pickup.soft_chime_03");
      if (!c.isBig) {
        mode = "question";
        ctx.ui.banner("Baby crab! Can a catfish eat crabs?");
        choice = ctx.ui.toolbar([
          { id: "catfish-yes", label: "Yes, sometimes" },
          { id: "catfish-no", label: "No, never" }
        ], { onSelect: answerCatfish });
        return;
      }
      ctx.ui.banner("Big blue crab");
      showCrabActions();
    }
    function crabPoints(c, action) {
      // Small crabs earn ten points when they are put back.
      if (!c.isBig && action === "release") return 10;
      // Keeping a small crab still costs a life.
      if (!c.isBig) return 0;
      // Keeping a big blue crab earns points, but releasing one is harmless.
      if (action === "keep") return 4;
      if (action === "release") return 0;
      return null;
    }
    function answerHabitat(answer) {
      if (mode !== "habitat-question") return;
      if (choice) { choice.remove(); choice = null; }
      mode = "idle";
      if (answer === "crabs-true") {
        score += 3;
        pointsInRow += 1;
        health = maxHealth;
        ctx.ui.hud.score(score);
        ctx.ui.hud.lives(health, maxHealth);
        ctx.ui.hud.combo(pointsInRow);
        ctx.ui.banner("Correct! Crabs sometimes eat other crabs.");
        ctx.ui.popup("+3", anchor, surface + 42);
        ctx.sfx.play("pickup.soft_chime_03");
      } else {
        pointsInRow = 0;
        ctx.ui.hud.combo(0);
        ctx.ui.banner("Not quite! Crabs sometimes eat other crabs.");
        ctx.sfx.play("water.bubble_01");
      }
    }
    function choose(action) {
      if (mode !== "choice" || !caught) return;
      const c = caught;
      const points = crabPoints(c, action);
      if (points === null) return;
      if (points !== 0) {
        score += points;
        ctx.ui.hud.score(score);
      }
      if (action === "keep" && !c.isBig) {
        lossCount += 1;
        health = Math.max(0, health - 1);
        pointsInRow = 0;
        ctx.ui.hud.lives(health, maxHealth);
        ctx.ui.hud.combo(0);
        ctx.sfx.play("water.bubble_01");
        c.view.visible = false;
        c.respawn = 0;
        if (health <= 0) {
          lose();
          return;
        }
            } else {
              if (points > 0) {
                pointsInRow += 1;
                ctx.ui.hud.combo(pointsInRow);
              }
              if (action === "keep" && c.isBig) {
                ctx.ui.banner("Kept the big blue crab!");
                ctx.ui.popup("+4", anchor, surface + 42);
              } else if (action === "release" && c.isBig) {
                // Releasing a big blue crab shows the prompt, but changes neither
                // the score nor the ongoing round.
                ctx.ui.banner("You don't want to eat it?");
              } else {
                ctx.ui.popup("Good job!", anchor, surface + 42);
              }
              ctx.sfx.play(action === "keep" ? "pickup.soft_chime_03" : "water.plop_02");
        c.active = false;
        c.x = anchor; c.y = clamp(surface + 80, surface + 45, bottom - 25);
        c.view.scale.set(1);
        c.view.visible = false;
      }
      caught = null; mode = "idle"; hookY = surface + 14;
      if (choice) { choice.remove(); choice = null; }
      habitatCount += 1;
      if (habitatCount % 10 === 0) {
        mode = "habitat-question";
        ctx.ui.banner("True or false: Crabs eat crabs.");
        choice = ctx.ui.toolbar([
          { id: "crabs-true", label: "True" },
          { id: "crabs-false", label: "False" }
        ], { onSelect: answerHabitat });
      }
    }
    function finish() {
      running = false; mode = "done";
      if (choice) { choice.remove(); choice = null; }
      ctx.music.stop({ fade: 1 });
      ctx.sfx.play("jingle.levelup_pizzicato_14");
      ctx.fx.flash();
      ctx.emit("win");
      ctx.ui.win({ score });
    }
    function lose() {
      running = false; mode = "done";
      caught = null; scareTime = 0;
      catfish.visible = false;
      if (choice) { choice.remove(); choice = null; }
      ctx.music.stop({ fade: 1 });
      ctx.fx.shake(0.5);
      ctx.emit("lose");
      ctx.ui.gameOver({ score });
    }
    function update(dt) {
      if (!running) return;
      elapsed += dt;
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnCrab();
        spawnTimer += 4;
      }
      if (mode === "scare") {
        scareTime -= dt;
        const progress = clamp(1 - scareTime / 1.15, 0, 1);
        const pop = progress < 0.28 ? progress / 0.28 : 1;
        catfish.scale.set(0.18 + pop * 1.45);
        catfish.rotation = Math.sin((1.15 - scareTime) * 28) * 0.05;
        if (scareTime <= 0) {
          catfish.visible = false;
          catfish.rotation = 0;
          showCrabActions();
        }
        return;
      }
      if (ctx.input.pressed("keep")) choose("keep");
      if (ctx.input.pressed("release")) choose("release");
      if (mode === "choice") return;
      if (health <= 0) { lose(); return; }
      if (ctx.input.pressed("cast")) cast();
      if (mode === "down") {
        hookY += 340 * dt;
        if (hookY >= bottom) { hookY = bottom; mode = "up"; ctx.sfx.play("machine.click_01"); }
      } else if (mode === "up") {
        hookY -= 190 * dt;
        for (const c of crabs) {
          // Match the catch zone to the crab's actual size so small crabs stay
          // precise while big crabs are not unfairly hard to hook.
          const halfWidth = c.isBig ? 48 : 30;
          const halfHeight = c.isBig ? 34 : 24;
          if (c.active && Math.abs(c.x - anchor) < halfWidth && Math.abs(c.y - hookY) < halfHeight) {
            grab(c); break;
          }
        }
        if (mode === "up" && hookY <= surface + 14) { mode = "idle"; hookY = surface + 14; }
      }
      for (let i = 0; i < crabs.length; i++) {
        const c = crabs[i];
        if (!c.active) continue;
        c.x += c.vx * dt;
        if (c.x < 28 || c.x > w - 28) { c.x = clamp(c.x, 28, w - 28); c.vx *= -1; }
        c.view.position.set(c.x, c.y + Math.sin(elapsed * 2 + c.phase) * 5);
        c.view.scale.x = c.vx > 0 ? 1 : -1;
        c.view.scale.y = 1;
      }
      fisher.y = surface - 75 + Math.sin(elapsed * 2) * 2;
      rod.rotation = mode === "down" ? 0.13 : mode === "up" ? -0.09 : 0;
    }
    layout();
    crabs.forEach(resetCrab);
    ctx.ui.title({ title: "Crab Catch Pier", subtitle: "Cast a hook: catch friendly blue crabs, then choose what to do with your catch." }).then(() => startRound());
    return { update, render: drawHook, reset: startRound, onResize: layout };
  } });
})();