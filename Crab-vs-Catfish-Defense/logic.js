(function () {
  Game2DCore.mount({ hud: "custom", createGame(ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "lilita-one", body: "nunito", hud: "bar", lives: "pips", title: "ribbon", pause: "top-right", primary: "#f04f3f", secondary: "#ffd34e" });
    ctx.input.setControls({ controls: [] });
    ctx.assets.background("sunny-lagoon", { fit: "cover" });
    const board = new PIXI.Graphics();
    const effects = new PIXI.Graphics();
    ctx.layers.world.addChild(board);
    const padCoords = [[.12,.12],[.37,.13],[.53,.25],[.13,.48],[.43,.68],[.59,.69],[.83,.39],[.85,.89]];
    const pads = padCoords.map(() => ({ x: 0, y: 0, tower: null }));
    const fish = [];
    const towers = [];
    const bolts = [];
    const towerArt = {
      bubble: "reef-bubble-crab-3d",
      cannon: "reef-cannon-crab-3d",
      net: "reef-net-coral-3d",
      spike: "reef-puffer-spike-3d",
      sonar: "reef-sonar-shell-3d",
      bloom: "reef-kelp-bloom-3d"
    };
    const fishArt = ["blue-catfish", "gold-catfish", "violet-catfish"];
    const worlds = window.createReefWorlds(ctx);
    const fishViews = Array.from({ length: 72 }, (_, i) => {
      const view = ctx.assets.sprite(fishArt[i % fishArt.length], { size: 52 });
      view.visible = false;
      view._fishKind = i % fishArt.length;
      ctx.layers.world.addChild(view);
      return view;
    });
    const bosses = window.createCatfishBosses(ctx, fishViews);
    const towerViews = pads.map(() => {
      const views = {};
      for (const [type, key] of Object.entries(towerArt)) {
        const view = ctx.assets.sprite(key, { size: 62 });
        view.visible = false;
        ctx.layers.world.addChild(view);
        views[type] = view;
      }
      return views;
    });
    const upgradeArt = new PIXI.Graphics();
    ctx.layers.world.addChild(upgradeArt);
    const healthArt = new PIXI.Graphics();
    ctx.layers.world.addChild(healthArt);
    ctx.layers.world.addChild(effects);
    let W = 360, H = 640, top = 110, height = 400, points = [], lengths = [], routeLength = 1;
    let shells = 100, lives = 5, wave = 0, waveSize = 0, leftToSpawn = 0, spawnClock = 0, autoWaveTimer = 0;
    let running = false, active = false, ended = false, time = 0, kills = 0;
    const endOverlay = document.getElementById("game-over");

    function layout(size) {
      W = size.width; H = size.height;
      top = Math.max(94, H * .16);
      height = Math.max(200, H - top - 105);
      const at = (x, y) => ({ x: x * W, y: top + y * height });
      points = worlds.route(at);
      routeLength = 0;
      lengths = [];
      for (let i = 1; i < points.length; i++) {
        const n = Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
        lengths.push(n); routeLength += n;
      }
      pads.forEach((p, i) => {
        const pos = at(...padCoords[i]);
        p.x = pos.x; p.y = pos.y;
        Object.values(towerViews[i]).forEach(view => view.position.set(p.x, p.y));
      });
      drawBoard();
    }
    function drawBoard() {
      board.clear();
      worlds.drawBackground(board, W, H, points);
      for (let i = 0; i < 18; i++) {
        const x = ((i * 97 + 31) % 997) / 997 * W;
        const y = top * .25 + ((i * 173 + 47) % 991) / 991 * (H - top * .35);
        board.circle(x, y, 2 + (i % 3)).fill({ color: 0xe7ffdc, alpha: .42 });
        board.circle(x - 3, y - 4, 1.2).fill({ color: 0xffffff, alpha: .72 });
      }
      worlds.drawRoute(board, points);
      pads.forEach((p, index) => {
        // Layered oval bevels read like little raised reef platforms from above.
        board.ellipse(p.x, p.y + 11, 31, 23).fill({ color: 0x123f59, alpha: .34 });
        board.ellipse(p.x, p.y + 6, 30, 23).fill(0x176478);
        board.ellipse(p.x, p.y + 3, 29, 22).fill(0xf04f3f);
        board.ellipse(p.x, p.y, 26, 20).fill(0xffd34e);
        board.ellipse(p.x, p.y - 3, 23, 17).fill(0xffefad);
        board.ellipse(p.x, p.y - 2, 20, 14).fill({ color: 0x278b9a, alpha: .88 });
        board.ellipse(p.x, p.y - 2, 20, 14).stroke({ color: p.tower ? 0x183b6b : 0xc6fff0, width: 2, alpha: .95 });
        board.ellipse(p.x - 7, p.y - 10, 8, 2.5).fill({ color: 0xffffff, alpha: .68 });
        for (let dot = 0; dot < 4; dot++) {
          const a = dot * Math.PI / 2 + index * .3;
          board.circle(p.x + Math.cos(a) * 25, p.y + Math.sin(a) * 18, 2.2).fill(0xffffff);
        }
      });
      upgradeArt.clear();
      const upgradeColors = { damage: 0xff7851, range: 0x438ff2, fire: 0xffd34f };
      pads.forEach(p => {
        if (!p.tower) return;
        ["damage", "range", "fire"].forEach((stat, path) => {
          for (let tier = 0; tier < 5; tier++) {
            const x = p.x - 14 + tier * 7;
            const y = p.y + 24 + path * 5;
            upgradeArt.circle(x, y, 1.8).fill({
              color: tier < p.tower.upgrades[stat] ? upgradeColors[stat] : 0x456879,
              alpha: tier < p.tower.upgrades[stat] ? 1 : .78
            });
          }
        });
      });
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
      ctx.ui.hud.lives(lives, 5);
      ctx.ui.hud.bar("Wave " + Math.max(1, wave), wave ? waveSize - leftToSpawn - fish.length : 0, waveSize || 4);
    }
    function startWave() {
      if (!active || running || ended) return;
      wave++;
      waveSize = 4 + Math.min(36, wave * 2);
      leftToSpawn = waveSize;
      spawnClock = .1;
      running = true;
      ctx.sfx.play("water.bubble_01");
      hud();
    }
    let selectedTower = "bubble";
    let focusedTower = null;
    const buildTools = [
      { id: "bubble", label: "Bubble", icon: "🫧", cost: 50 },
      { id: "cannon", label: "Cannon", icon: "💥", cost: 75 },
      { id: "net", label: "Net", icon: "🕸️", cost: 65 },
      { id: "spike", label: "Spikes", icon: "⭐", cost: 45 },
      { id: "sonar", label: "Sonar", icon: "🐚", cost: 85 },
      { id: "bloom", label: "Kelp bloom", icon: "🌺", cost: 60 },
      { id: "wave", label: "Start wave", icon: "🌊" },
      { id: "worlds", label: "Worlds", icon: "🌍" }
    ];
    let toolbar;
    function showBuildTools() {
      focusedTower = null;
      toolbar.setItems(buildTools);
      toolbar.select(selectedTower);
    }
    const upgradeRules = window.createReefUpgradeRules();
    function showUpgradeTools(tower) {
      focusedTower = tower;
      toolbar.setItems(upgradeRules.itemsFor(tower));
    }
    function upgradeFocused(id) {
      if (!focusedTower) return;
      const result = upgradeRules.purchase(focusedTower, id.slice("upgrade-".length), shells);
      const p = pads[focusedTower.pad];
      if (!result.ok) {
        ctx.ui.popup(result.message, p.x, p.y);
        return;
      }
      shells = result.cash;
      ctx.sfx.play("ui.pluck_02");
      ctx.fx.burst(p.x, p.y);
      ctx.ui.popup(result.path.name + " tier " + result.tier + "!", p.x, p.y);
      showUpgradeTools(focusedTower);
      drawBoard(); hud();
    }
    function sellFocusedTower() {
      if (!focusedTower) return;
      const tower = focusedTower, p = pads[tower.pad];
      const refund = Math.floor(tower.invested * .7);
      shells += refund;
      p.tower = null;
      towers.splice(towers.indexOf(tower), 1);
      towerViews[tower.pad][tower.type].visible = false;
      focusedTower = null;
      showBuildTools();
      ctx.ui.popup("Sold for " + refund + " shells", p.x, p.y);
      drawBoard(); hud();
    }
    toolbar = ctx.ui.toolbar(buildTools, {
      selected: selectedTower,
      onSelect: id => {
        if (id === "worlds") toolbar.setItems(worlds.choices);
        else if (id.startsWith("world-")) {
          if (running) ctx.ui.banner("Finish this wave before changing worlds!");
          else {
            worlds.select(id.slice(6));
            layout(ctx.size);
            ctx.ui.banner("Welcome to " + worlds.name + "!");
          }
          showBuildTools();
        }
        else if (id === "wave") startWave();
        else if (id === "back") showBuildTools();
        else if (id === "sell") sellFocusedTower();
        else if (id.startsWith("upgrade-")) upgradeFocused(id);
        else {
          selectedTower = id;
          focusedTower = null;
          ctx.ui.banner(id + " tower selected. Place it on an empty pad.");
        }
      }
    });
    function place(index) {
      const p = pads[index];
      const costs = { bubble: 50, cannon: 75, net: 65, spike: 45, sonar: 85, bloom: 60 };
      const cost = costs[selectedTower];
      if (p.tower || shells < cost) {
        ctx.sfx.play("impact.bonk_cartoon_synth_03");
        ctx.ui.popup(p.tower ? "Occupied!" : "Need " + cost + " shells!", p.x, p.y);
        return;
      }
      shells -= cost;
      const tower = { pad: index, type: selectedTower, cooldown: .25, invested: cost,
        upgrades: { damage: 0, range: 0, fire: 0 } };
      p.tower = tower;
      towers.push(tower);
      towerViews[index][selectedTower].visible = true;
      ctx.sfx.play("ui.pluck_02");
      ctx.fx.burst(p.x, p.y);
      drawBoard(); hud();
    }
    function spawn() {
      const variant = wave % 5 === 0 ? 2 : wave % 3 === 0 ? 1 : 0;
      const view = fishViews.find(v => !v.visible && fishArt[variant] === fishArt[v._fishKind || 0]) || fishViews.find(v => !v.visible);
      if (!view) return false;
      const maxHp = 2 + Math.floor(wave * 1.45) + variant * 2;
      const speed = Math.min(210, 62 + wave * 5.5 + Math.sqrt(wave) * 7);
      if (bosses.spawn(wave, speed / routeLength, fish, points[0])) return true;
      const enemy = { view, progress: 0, hp: maxHp, maxHp, speed: speed / routeLength, slowTimer: 0 };
      fish.push(enemy);
      view.visible = true;
      view.position.set(points[0].x, points[0].y);
      return true;
    }
    function finish() {
      ended = true; active = false; running = false;
      ctx.music.stop({ fade: 1 });
      ctx.sfx.play("jingle.lose_soft_synth_01");
      ctx.emit("lose");
      const card = ctx.ui.gameOver({ score: kills });
      const screen = card && card.closest(".diy-screen");
      if (screen) endOverlay.appendChild(screen);
      endOverlay.hidden = false;
    }
    function removeFish(enemy, escaped) {
      if (ended) return;
      enemy.view.visible = false;
      fish.splice(fish.indexOf(enemy), 1);
      if (escaped) {
        lives--;
        ctx.sfx.play("creature.burble_02");
        ctx.fx.shake(.22);
        if (lives <= 0) finish();
      } else {
        bosses.pop(enemy, fish, fishViews);
        shells += 15;
        kills++;
        ctx.sfx.play("jingle.win_hit_15", { volume: .45 });
        ctx.ui.popup("+15 shells", enemy.view.x, enemy.view.y);
        ctx.fx.burst(enemy.view.x, enemy.view.y);
      }
      hud();
    }
    function update(dt) {
      if (!active || ended) return;
      time += dt;
      if (ctx.input.pointer.pressed) {
        const { x, y } = ctx.input.pointer;
        const index = pads.findIndex(p => Math.hypot(x - p.x, y - p.y) < 30);
        if (index >= 0) {
          if (pads[index].tower) {
            showUpgradeTools(pads[index].tower);
            ctx.ui.banner("Upgrade this tower: damage, range, or fire rate!");
          } else {
            showBuildTools();
            place(index);
          }
        }
      }
      if (!running) {
        if (wave > 0) {
          autoWaveTimer -= dt;
          if (autoWaveTimer <= 0) startWave();
        }
        if (!running) return;
      }
      if (leftToSpawn > 0) {
        spawnClock -= dt;
        if (spawnClock <= 0) {
          if (spawn()) leftToSpawn--;
          spawnClock = Math.max(.34, 1.18 - Math.min(.72, wave * .035));
        }
      }
      for (const enemy of [...fish]) {
        if (enemy.slowTimer > 0) enemy.slowTimer = Math.max(0, enemy.slowTimer - dt);
        const speedFactor = enemy.slowTimer > 0 ? .48 : 1;
        enemy.progress += enemy.speed * speedFactor * dt;
        const pos = route(enemy.progress);
        enemy.view.position.set(pos.x, pos.y);
        enemy.view.rotation = pos.angle;
        if (enemy.progress >= 1) removeFish(enemy, true);
      }
      if (ended) return;
      for (const tower of towers) {
        tower.cooldown -= dt;
        if (tower.cooldown > 0) continue;
        const p = pads[tower.pad];
        const specs = {
          bubble: { range: Math.min(140, Math.max(100, W * .32)), cooldown: .48, damage: 1, color: 0x63eaff, width: 4, radius: 6 },
          cannon: { range: Math.min(170, Math.max(125, W * .42)), cooldown: 1.15, damage: 3, color: 0xffa444, width: 8, radius: 10 },
          net: { range: Math.min(145, Math.max(100, W * .34)), cooldown: .92, damage: 1, color: 0x53d1ad, width: 6, radius: 8 },
          spike: { range: Math.min(110, Math.max(78, W * .27)), cooldown: .25, damage: 1, color: 0xffdc60, width: 3, radius: 5 },
          sonar: { range: Math.min(175, Math.max(125, W * .43)), cooldown: .82, damage: 2, color: 0x72fff0, width: 6, radius: 12 },
          bloom: { range: Math.min(145, Math.max(105, W * .36)), cooldown: .34, damage: 1, color: 0xff74a8, width: 4, radius: 7 }
        };
        const baseSpec = specs[tower.type];
        const spec = {
          ...baseSpec,
          damage: baseSpec.damage + tower.upgrades.damage,
          range: baseSpec.range * (1 + tower.upgrades.range * .18),
          cooldown: Math.max(.13, baseSpec.cooldown * (1 - tower.upgrades.fire * .16))
        };
        let target = null, best = Infinity;
        for (const enemy of fish) {
          const d = Math.hypot(enemy.view.x - p.x, enemy.view.y - p.y);
          if (d < spec.range && d < best) { best = d; target = enemy; }
        }
        if (!target) continue;
        tower.cooldown = spec.cooldown;
        const hitX = target.view.x, hitY = target.view.y;
        bolts.push({ x: p.x, y: p.y, tx: hitX, ty: hitY, life: .17, ...spec });
        if (tower.type === "net") target.slowTimer = 1.8;
        const radius = tower.type === "cannon" ? 48 : tower.type === "sonar" ? 64 : 0;
        const hits = fish.filter(enemy => enemy === target ||
          (radius && Math.hypot(enemy.view.x - hitX, enemy.view.y - hitY) < radius));
        for (const enemy of hits) {
          if (tower.type === "sonar") enemy.slowTimer = Math.max(enemy.slowTimer, 1.3);
          bosses.damage(enemy, enemy === target ? spec.damage : 1);
          if (enemy.hp <= 0) removeFish(enemy, false);
        }
        ctx.sfx.play(tower.type === "cannon" ? "impact.bonk_cartoon_synth_03" : "ui.bubble_pop_synth_02", { volume: .26 });
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
      if (leftToSpawn === 0 && fish.length === 0) {
        running = false;
        if (wave === 1) {
          ctx.ui.banner("Crab fact: Crabs have 10 legs!");
          autoWaveTimer = 4.5;
        } else {
          autoWaveTimer = 3.2;
        }
      }
    }
    function reset() {
      endOverlay.hidden = true;
      shells = 100; lives = 5; wave = 0; waveSize = 0; leftToSpawn = 0; spawnClock = 0; autoWaveTimer = 0;
      running = false; ended = false; active = true; time = 0; kills = 0;
      fish.length = 0; towers.length = 0; bolts.length = 0;
      fishViews.forEach(v => { v.visible = false; v.scale.x = 1; });
      bosses.reset();
      towerViews.forEach(views => Object.values(views).forEach(v => { v.visible = false; }));
      pads.forEach(p => { p.tower = null; });
      selectedTower = "bubble";
      showBuildTools();
      effects.clear(); healthArt.clear(); drawBoard(); hud();
      ctx.music.play("music.be_chillin", { fade: 1 });
    }
    layout(ctx.size);
    hud();
    ctx.ui.title({ title: "Crab Reef Defense", subtitle: "Fun fact: some crabs eat other crabs! Pick a world and build reef towers." }).then(() => reset());
    return { update, render() {}, reset, onResize: layout };
  }});
})();
