(function () {
  Game2DCore.mount({ hud: "custom", createGame(ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "lilita-one", body: "nunito", hud: "bar", lives: "pips", title: "ribbon", pause: "top-right", primary: "#f04f3f", secondary: "#ffd34e" });
    ctx.input.setControls({ controls: [] });
    ctx.assets.background("sunny-lagoon", { fit: "cover" });
    const board = new PIXI.Graphics();
    const rangeArt = new PIXI.Graphics();
    const effects = new PIXI.Graphics();
    ctx.layers.world.addChild(board);
    ctx.layers.world.addChild(rangeArt);
    const fish = [];
    const towers = [];
    const bolts = [];
    const towerArt = {
      bubble: "reef-bubble-crab-3d",
      cannon: "reef-cannon-crab-3d",
      net: "reef-net-coral-3d",
      spike: "reef-puffer-spike-3d",
      sonar: "reef-sonar-shell-3d",
      bloom: "reef-kelp-bloom-3d", crabTank: "crab-tank-tower", crabHeli: "crab-helicopter-tower", crabJet: "crab-fighter-jet", crabCarrier: "crab-aircraft-carrier-tower"
    };
    const fishArt = ["blue-catfish", "gold-catfish", "violet-catfish"];
    const enemyTint = [0x7df9ff, 0xffe56b, 0xd8a7ff];
    const worlds = window.createReefWorlds(ctx);
    const boardArt = window.createReefBoardArt(ctx, worlds, board, rangeArt);
    const fishViews = Array.from({ length: 72 }, (_, i) => {
      const view = ctx.assets.sprite(fishArt[i % fishArt.length], { size: 52 });
      view.visible = false;
      view._fishKind = i % fishArt.length;
      ctx.layers.world.addChild(view);
      return view;
    });
    const bosses = window.createCatfishBosses(ctx, fishViews);
    const fishSpawner = window.createReefCatfishSpawners(ctx, fishViews, fishArt, enemyTint, bosses);
    const towerViews = Array.from({ length: 64 }, () => {
      const views = {};
      for (const [type, key] of Object.entries(towerArt)) {
        const view = ctx.assets.sprite(key, { size: type === "crabJet" ? 82 : type === "crabCarrier" ? 100 : 62 });
        view.visible = false;
        ctx.layers.world.addChild(view);
        views[type] = view;
      }
      return views;
    });
    const carrierMeter = window.createCrabCarrierMeter(ctx);
    const heliShots = window.createCrabHelicopterShots(ctx), carrierFlights = window.createCrabCarrierFlights(ctx);
    const upgradeArt = boardArt.upgradeArt;
    boardArt.attachUpgradeArt();
    const healthArt = new PIXI.Graphics();
    ctx.layers.world.addChild(healthArt);
    ctx.layers.world.addChild(effects);
    let W = 360, H = 640, top = 110, height = 400, points = [], lengths = [], routeLength = 1, boardWidth = 360;
    let shells = 100, lives = 100, wave = 0, waveSize = 0, leftToSpawn = 0, spawnClock = 0, waveSpawnRate = 1, moabPenalty = { pending: false };
    let running = false, active = false, ended = false, kills = 0;
    let bossMusicActive = false;
    let waveButton = null, quiz = null, quizBeforeGameOver = false, freePlayMode = null;
    const endOverlay = document.getElementById("game-over"), crabFacts = window.createCrabFactDisplay(ctx), crabBadge = window.createCrabBadgeBoost(ctx);
    function layout(size) {
      W = size.width; H = size.height; boardWidth = freePlayMode && freePlayMode.active ? freePlayMode.sidebar.playWidth(size) : W;
      top = Math.max(94, H * .16);
      height = Math.max(200, H - top - 105);
      const at = (x, y) => ({ x: x * boardWidth, y: top + y * height });
      points = worlds.route(at);
      routeLength = 0;
      lengths = [];
      for (let i = 1; i < points.length; i++) {
        const n = Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
        lengths.push(n); routeLength += n;
      }
      towers.forEach(tower => {
        tower.x = tower.nx * boardWidth;
        tower.y = top + tower.ny * height;
        towerViews[tower.slot][tower.type].position.set(tower.x, tower.y);
      });
      drawBoard();
      drawSelectedRange();
      carrierMeter.update(towers);
      crabFacts.layout(size); if (quiz) quiz.layout(size); crabBadge.layout(size); if (freePlayMode) freePlayMode.sidebar.layout(size, freePlayMode.active, top + 52);
    }
    function route(t) {
      let distance = Math.max(0, Math.min(1, t)) * routeLength;
      for (let i = 0; i < lengths.length; i++) {
        if (distance <= lengths[i] || i === lengths.length - 1) {
          const f = Math.min(1, distance / lengths[i]);
          return { x: points[i].x + (points[i+1].x - points[i].x) * f,
            y: points[i].y + (points[i+1].y - points[i].y) * f,
            angle: Math.atan2(points[i+1].y - points[i].y, points[i+1].x - points[i].x) };
        }
        distance -= lengths[i];
      }
    }
    function hud() {
      ctx.ui.hud.score(shells);
      ctx.ui.hud.lives(lives, 100);
      ctx.ui.hud.bar("Wave " + Math.max(1, wave), wave ? waveSize - leftToSpawn - fish.length : 0, waveSize || 4);
    }
    function syncBossMusic() {
      bossMusicActive = window.syncReefBossMusic(ctx, fish, wave, quiz, bossMusicActive);
    }
    function updateWaveButton() {
      if (waveButton) {
        waveButton.disabled = !active || running || ended || (quiz && quiz.active);
        waveButton.hidden = !!(freePlayMode && freePlayMode.active);
      }
    }
    function startWave() {
      if (!active || running || ended || (quiz && quiz.active)) return;
      wave++;
      moabPenalty.pending = quiz.takeWavePenalty();
      waveSpawnRate = moabPenalty.pending ? 1.15 : 1;
      crabBadge.beginWave();
      carrierMeter.beginWave(towers, wave);
      waveSize = 4 + Math.min(36, wave * 2);
      leftToSpawn = waveSize;
      spawnClock = .1 / waveSpawnRate;
      running = true; crabFacts.hide(); updateWaveButton();
      ctx.sfx.play("water.bubble_01");
      hud();
    }
    waveButton = ctx.ui.button("Start Wave", startWave, { at: "top-left" });
    updateWaveButton();
    let selectedTower = "bubble";
    let focusedTower = null;
    const buildTools = [
      { id: "bubble", label: "Bubble", icon: "🫧", cost: 50 },
      { id: "crabCarrier", label: "Crab Aircraft Carrier", icon: "🛳️", cost: 300 },
      { id: "cannon", label: "Cannon", icon: "💥", cost: 75 },
      { id: "net", label: "Net", icon: "🕸️", cost: 65 },
      { id: "spike", label: "Spikes", icon: "⭐", cost: 45 },
      { id: "sonar", label: "Sonar", icon: "🐚", cost: 85 },
      { id: "bloom", label: "Kelp bloom", icon: "🌺", cost: 60 }, { id: "crabTank", label: "Crab tank", icon: "🦀", cost: 90 }, { id: "crabHeli", label: "Crab heli", icon: "🚁", cost: 90 }, { id: "crabJet", label: "Crab jet", icon: "✈️", cost: 90 },
      { id: "worlds", label: "Worlds", icon: "🌍" }
    ];
    let toolbar;
    function showBuildTools() {
      focusedTower = null;
      drawSelectedRange();
      toolbar.setItems(freePlayMode ? freePlayMode.items() : buildTools);
      toolbar.select(selectedTower);
    }
    const upgradeRules = window.createReefUpgradeRules();
    function drawSelectedRange() {
      boardArt.drawSelectedRange(focusedTower, towers, W, upgradeRules);
    }
    const drawBoard = () => boardArt.drawBoard(W, H, top, points, towers);
    function showUpgradeTools(tower) {
      focusedTower = tower;
      drawSelectedRange();
      toolbar.setItems(upgradeRules.itemsFor(tower));
    }
    function upgradeFocused(id) {
      if (!focusedTower) return;
      const result = upgradeRules.purchase(focusedTower, id.slice("upgrade-".length), shells);
      const p = focusedTower;
      if (!result.ok) {
        ctx.ui.popup(result.message, p.x, p.y);
        return;
      }
      if (!freePlayMode || !freePlayMode.active) shells = result.cash;
      ctx.sfx.play("ui.pluck_02");
      ctx.fx.burst(p.x, p.y);
      ctx.ui.popup(result.path.name + " tier " + result.tier + "!", p.x, p.y);
      showUpgradeTools(focusedTower);
      drawBoard(); hud();
    }
    function sellFocusedTower() {
      if (!focusedTower) return;
      const tower = focusedTower;
      const refund = Math.floor(tower.invested * .7);
      shells += refund;
      towers.splice(towers.indexOf(tower), 1);
      towerViews[tower.slot][tower.type].visible = false;
      focusedTower = null;
      showBuildTools();
      ctx.ui.popup("Sold for " + refund + " shells", tower.x, tower.y);
      drawBoard(); hud();
    }
    toolbar = ctx.ui.toolbar(buildTools, {
      selected: selectedTower,
      onSelect: id => {
        if (quiz && quiz.active) { quiz.handle(id); updateWaveButton(); }
        else if (freePlayMode && freePlayMode.handle(id)) toolbar.select(selectedTower);
        else if (id === "worlds") toolbar.setItems(worlds.choices);
        else if (id.startsWith("world-")) {
          if (running) ctx.ui.banner("Finish this wave before changing worlds!");
          else {
            worlds.select(id.slice(6));
            layout(ctx.size);
            ctx.ui.banner("Welcome to " + worlds.name + "!");
          }
          showBuildTools();
        }
        else if (id === "back") showBuildTools();
        else if (id === "sell") sellFocusedTower();
        else if (id.startsWith("upgrade-")) upgradeFocused(id);
        else {
          selectedTower = id;
          focusedTower = null;
          ctx.ui.banner(id === "crabCarrier" ? "Aircraft carrier selected! Place it off the path." : id + " tower selected. Place anywhere off the path!");
        }
      }
    });
    freePlayMode = window.createReefFreePlayMode(ctx, buildTools, {
      onEnable: () => { shells = Math.max(shells, 999999); updateWaveButton(); layout(ctx.size); showBuildTools(); hud(); },
      spawn: kind => fishSpawner.chosen(kind, { wave, routeLength, fish, start: points[0] }),
      onSend: () => { running = true; crabFacts.hide(); syncBossMusic(); }
    });
    quiz = window.createReefQuiz(ctx, items => items ? toolbar.setItems(items) : (showBuildTools(), quizBeforeGameOver && lives <= 0 && finish()), undefined, () => crabBadge.award());
    function distanceToRoute(x, y) {
      let nearest = Infinity;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
        nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
      }
      return nearest;
    }
    function place(x, y) {
      const costs = { bubble: 50, cannon: 75, net: 65, spike: 45, sonar: 85, bloom: 60, crabTank: 90, crabHeli: 90, crabJet: 90, crabCarrier: 300 };
      const cost = costs[selectedTower];
      const tooClose = towers.some(tower => Math.hypot(tower.x - x, tower.y - y) < 58);
      const margin = selectedTower === "crabCarrier" ? 52 : 34;
      if (x < margin || x > boardWidth - margin || y < top + margin || y > top + height - margin || distanceToRoute(x, y) < 58 || tooClose) {
        ctx.sfx.play("impact.bonk_cartoon_synth_03");
        ctx.ui.popup("Place off the path with room!", x, y);
        return;
      }
      if ((!freePlayMode || !freePlayMode.active) && shells < cost) {
        ctx.sfx.play("impact.bonk_cartoon_synth_03");
        ctx.ui.popup("Need " + cost + " shells!", x, y);
        return;
      }
      const slot = towerViews.findIndex(views => !Object.values(views).some(view => view.visible));
      if (slot < 0) {
        ctx.ui.popup("No more room for towers!", x, y);
        return;
      }
      if (!freePlayMode || !freePlayMode.active) shells -= cost;
      const tower = { slot, x, y, nx: x / boardWidth, ny: (y - top) / height,
        type: selectedTower, cooldown: .25, invested: cost, ...carrierMeter.newTower(selectedTower, wave),
        upgrades: { damage: 0, range: 0, fire: 0 } };
      towers.push(tower);
      towerViews[slot][selectedTower].visible = true;
      towerViews[slot][selectedTower].position.set(x, y);
      ctx.sfx.play("ui.pluck_02");
      ctx.fx.burst(x, y);
      drawBoard(); hud();
    }
    function spawn() {
      return fishSpawner.normal({ wave, routeLength, fish, start: points[0],
        index: waveSize - leftToSpawn, penalty: moabPenalty, onBoss: syncBossMusic });
    }
    function finish() {
      ended = true; active = false; running = false; crabBadge.finishWave();
      updateWaveButton();
      ctx.music.stop({ fade: 1 });
      ctx.sfx.play("jingle.lose_soft_synth_01");
      ctx.emit("lose");
      if (freePlayMode) freePlayMode.button.hidden = true;
      const card = ctx.ui.gameOver({ score: kills });
      const screen = card && card.closest(".diy-screen");
      if (screen) endOverlay.appendChild(screen);
      endOverlay.hidden = false;
    }
    function removeFish(enemy, escaped) {
      if (ended) return;
      enemy.view.visible = false; if (enemy.shieldView) enemy.shieldView.visible = false;
      fish.splice(fish.indexOf(enemy), 1);
      if (escaped) {
        const escapedDamage = enemy.bossKind ? 20 : enemy.kind === 2 ? 5 : enemy.kind === 1 ? 3 : 1;
        lives = Math.max(0, lives - escapedDamage); ctx.sfx.play("creature.burble_02");
        ctx.fx.shake(.22); quizBeforeGameOver = lives <= 0; quiz.show(); updateWaveButton();
      } else {
        bosses.pop(enemy, fish, fishViews);
        shells += 15;
        kills++;
        ctx.sfx.play("jingle.win_hit_15", { volume: .45 });
        ctx.ui.popup("+15 shells", enemy.view.x, enemy.view.y);
        ctx.fx.burst(enemy.view.x, enemy.view.y);
      }
      syncBossMusic();
      hud();
    }
    function update(dt) {
      if (!active || ended || (quiz && quiz.active)) return;
      carrierMeter.update(towers);
      heliShots.update(dt); carrierFlights.update(dt); crabFacts.update(dt);
      if (ctx.input.pointer.pressed) {
        const { x, y } = ctx.input.pointer; if (freePlayMode && freePlayMode.sidebar.handlePointer(x, y)) return;
        const tower = towers.find(item => Math.hypot(x - item.x, y - item.y) < (item.type === "crabCarrier" ? 54 : 36));
        if (tower) {
          showUpgradeTools(tower);
          ctx.ui.banner("Upgrade this tower: damage, range, or fire rate!");
        } else {
          showBuildTools();
          place(x, y);
        }
      }
      if (!running) return;
      if (leftToSpawn > 0) {
        spawnClock -= dt;
        if (spawnClock <= 0) {
          if (spawn()) leftToSpawn--;
          spawnClock = Math.max(.34, 1.18 - Math.min(.72, wave * .035)) / waveSpawnRate;
        }
      }
      for (const enemy of [...fish]) {
        if (enemy.slowTimer > 0) enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        const speedFactor = enemy.slowTimer > 0 ? .48 : 1;
        enemy.progress += enemy.speed * speedFactor * dt;
        const pos = route(enemy.progress);
        enemy.view.position.set(pos.x, pos.y);
        enemy.view.rotation = pos.angle;
        if (enemy.progress >= 1) {
          removeFish(enemy, true);
          if (quiz && quiz.active) return;
        }
      }
      if (ended) return;
      for (const tower of towers) {
        tower.cooldown -= dt;
        if (tower.cooldown > 0) continue;
        if (tower.type === "crabCarrier" && tower.carrierJets <= 0) continue;
        const p = tower;
        const spec = upgradeRules.statsFor(tower, W);
        let target = null, best = Infinity;
        for (const enemy of fish) {
          const d = Math.hypot(enemy.view.x - p.x, enemy.view.y - p.y);
          if (d < spec.range && d < best) { best = d; target = enemy; }
        }
        if (!target) continue;
        if (tower.type === "crabJet") towerViews[tower.slot].crabJet.rotation = Math.atan2(target.view.y - p.y, target.view.x - p.x);
        tower.cooldown = spec.cooldown;
        const hitX = target.view.x, hitY = target.view.y;
        if (tower.type === "crabHeli" || tower.type === "crabJet") heliShots.fire(p.x, p.y, hitX, hitY); else if (tower.type === "crabCarrier") carrierMeter.launch(tower, carrierFlights, p.x, p.y, hitX, hitY); else bolts.push({ x: p.x, y: p.y, tx: hitX, ty: hitY, life: .17, ...spec });
        if (tower.type === "net") target.slowTimer = 1.8;
        const radius = tower.type === "crabTank" ? 76 : tower.type === "cannon" ? 48 : tower.type === "sonar" ? 64 : tower.type === "crabHeli" ? 38 : tower.type === "crabJet" ? 46 : tower.type === "crabCarrier" ? 86 : 0;
        const splashRocket = tower.type === "crabHeli" || tower.type === "crabJet" || tower.type === "crabCarrier";
        const splashDamage = splashRocket || radius > 0;
        const hits = fish.filter(enemy => enemy === target ||
          (radius && Math.hypot(enemy.view.x - hitX, enemy.view.y - hitY) < radius));
        for (const enemy of hits) {
          if (tower.type === "sonar") enemy.slowTimer = Math.max(enemy.slowTimer, 1.3);
          bosses.damage(enemy, crabBadge.applyDamage(enemy === target ? spec.damage : 1), splashDamage);
          if (enemy.hp <= 0) removeFish(enemy, false);
        }
        ctx.sfx.play(tower.type === "cannon" || tower.type === "crabTank" || tower.type === "crabHeli" || tower.type === "crabJet" || tower.type === "crabCarrier" ? "impact.bonk_cartoon_synth_03" : "ui.bubble_pop_synth_02", { volume: .26 });
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        bolts[i].life -= dt;
        if (bolts[i].life <= 0) bolts.splice(i, 1);
      }
      bosses.drawHealthBars(fish, healthArt);
      effects.clear();
      for (const b of bolts) {
        const alpha = b.life / .17;
        effects.beginPath().moveTo(b.x, b.y).lineTo(b.tx, b.ty).stroke({ width: b.width, color: b.color, alpha });
        effects.circle(b.tx, b.ty, b.radius).fill({ color: 0xffffff, alpha });
        effects.circle(b.tx, b.ty, b.radius + (1 - alpha) * 14).stroke({ color: b.color, width: 2, alpha: alpha * .7 });
        if (b.radius > 9) effects.circle(b.tx, b.ty, b.radius * 2).stroke({ color: b.color, width: 2, alpha: alpha * .65 });
      }
      bosses.drawEffects(dt, effects);
      if ((!freePlayMode || !freePlayMode.active) && leftToSpawn === 0 && fish.length === 0) {
        running = false; waveSpawnRate = 1; crabBadge.finishWave();
        updateWaveButton();
        if (wave % 5 === 0) { quiz.show(); updateWaveButton(); } else crabFacts.show(wave);
      }
    }
    function reset() {
      endOverlay.hidden = true;
      shells = 100; lives = 100; wave = 0; waveSize = 0; leftToSpawn = 0; spawnClock = 0; waveSpawnRate = 1; moabPenalty.pending = false; quizBeforeGameOver = false;
      if (freePlayMode) freePlayMode.reset(); layout(ctx.size);
      heliShots.reset(); carrierFlights.reset(); running = false; ended = false; active = true; kills = 0; crabFacts.hide(); quiz.hide(); crabBadge.reset();
      updateWaveButton();
      fish.length = 0; towers.length = 0; bolts.length = 0;
      carrierMeter.update(towers);
      focusedTower = null;
      drawSelectedRange();
      fishViews.forEach(v => { v.visible = false; v.scale.x = 1; v.tint = 0xffffff; });
      bosses.reset();
      towerViews.forEach(views => Object.values(views).forEach(v => { v.visible = false; }));
      selectedTower = "bubble";
      showBuildTools();
      effects.clear(); healthArt.clear(); drawBoard(); hud();
      bossMusicActive = false;
      ctx.music.play("music.short_theme_melon_it_rock_rhythm_4", { fade: 1 });
    }
    layout(ctx.size);
    hud();
    const pauseButton = ctx.ui.button("Pause", () => ctx.ui.pause(), { at: "top-left" });
    pauseButton.hidden = true;
    ctx.ui.title({ title: "Crab Reef Defense", subtitle: "Fun fact: some crabs eat other crabs! Pick a world and build reef towers.", pause: false }).then(() => {
      pauseButton.hidden = false;
      reset();
    });
    return { update, render() {}, reset, onResize: layout };
  }});
})();
