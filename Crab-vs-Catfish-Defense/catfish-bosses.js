(function () {
  window.createCatfishBosses = function (ctx, fishViews) {
    const moabViews = Array.from({ length: 10 }, () => {
      const view = ctx.assets.sprite("moab-catfish", { size: 96 });
      view.visible = false;
      ctx.layers.world.addChild(view);
      return view;
    });
    const bfbViews = Array.from({ length: 6 }, () => {
      const view = ctx.assets.sprite("bfb-catfish", { size: 136 });
      view.visible = false;
      ctx.layers.world.addChild(view);
      return view;
    });
    const zomgViews = Array.from({ length: 4 }, () => {
      const view = ctx.assets.sprite("zomg-catfish", { size: 150 });
      view.visible = false;
      ctx.layers.world.addChild(view);
      return view;
    });
    const badViews = Array.from({ length: 2 }, () => {
      const view = ctx.assets.sprite("bad-catfish", { size: 170 });
      view.visible = false;
      ctx.layers.world.addChild(view);
      return view;
    });
    const bursts = [];
    let lastWave = -1;

    function spawn(wave, baseSpeed, fish, start) {
      if (wave % 5 !== 0 || wave === lastWave) return false;
      // Later boss tiers replace the smaller boss on their special waves.
      const kind = wave % 25 === 0 ? "bad" : wave % 15 === 0 ? "zomg" :
        wave % 10 === 0 ? "bfb" : "moab";
      const pools = { moab: moabViews, bfb: bfbViews, zomg: zomgViews, bad: badViews };
      const pool = pools[kind];
      const view = pool.find(candidate => !candidate.visible);
      if (!view) return false;
      lastWave = wave;
      const stats = {
        moab: { hp: 40 + wave * 5, speed: .53, armor: 1 },
        bfb: { hp: 110 + wave * 7, speed: .43, armor: 2 },
        zomg: { hp: 300 + wave * 12, speed: .35, armor: 3 },
        bad: { hp: 620 + wave * 18, speed: .43, armor: 4 }
      }[kind];
      const enemy = {
        view, progress: 0, hp: stats.hp, maxHp: stats.hp,
        speed: baseSpeed * stats.speed, slowTimer: 0,
        bossKind: kind, armor: stats.armor, wave
      };
      view.visible = true;
      view.position.set(start.x, start.y);
      view.rotation = 0;
      fish.push(enemy);
      const names = {
        moab: "MOAB CATFISH! Break its armor!",
        bfb: "BFB CATFISH! A giant armored fish is here!",
        zomg: "ZOMG CATFISH! A colossal armored blimp is coming!",
        bad: "BAD CATFISH! The mega boss is here!"
      };
      ctx.ui.banner(names[kind]);
      ctx.fx.shake(kind === "bad" ? .35 : .18);
      return true;
    }

    function damage(enemy, amount) {
      enemy.hp -= enemy.bossKind ? Math.max(1, amount - enemy.armor) : amount;
    }

    function addNormalChildren(enemy, fish, fishViews) {
      for (let i = 0; i < 3; i++) {
        const view = fishViews.find(candidate => !candidate.visible);
        if (!view) break;
        const hp = Math.max(4, Math.round(enemy.maxHp * .13));
        const progress = Math.max(0, enemy.progress - i * .05);
        view.visible = true;
        view.position.set(enemy.view.x, enemy.view.y);
        view.rotation = enemy.view.rotation;
        fish.push({
          view, progress, hp, maxHp: hp,
          speed: enemy.speed * 1.34, slowTimer: 0
        });
      }
    }

    function addMoabChildren(enemy, fish) {
      for (let i = 0; i < 2; i++) {
        const view = moabViews.find(candidate => !candidate.visible);
        if (!view) break;
        const hp = Math.round(enemy.maxHp * .27);
        const progress = Math.max(0, enemy.progress - i * .09);
        view.visible = true;
        view.position.set(enemy.view.x, enemy.view.y);
        view.rotation = enemy.view.rotation;
        fish.push({
          view, progress, hp, maxHp: hp,
          speed: enemy.speed * 1.18, slowTimer: 0,
          bossKind: "moab", armor: 1, wave: enemy.wave
        });
      }
    }

    function addBfbChildren(enemy, fish) {
      for (let i = 0; i < 2; i++) {
        const view = bfbViews.find(candidate => !candidate.visible);
        if (!view) break;
        const hp = Math.max(1, Math.round(enemy.maxHp * .28));
        const progress = Math.max(0, enemy.progress - i * .07);
        view.visible = true;
        view.position.set(enemy.view.x, enemy.view.y);
        view.rotation = enemy.view.rotation;
        fish.push({
          view, progress, hp, maxHp: hp,
          speed: enemy.speed * 1.16, slowTimer: 0,
          bossKind: "bfb", armor: 2, wave: enemy.wave
        });
      }
    }

    function addZomgChildren(enemy, fish) {
      for (let i = 0; i < 2; i++) {
        const view = zomgViews.find(candidate => !candidate.visible);
        if (!view) break;
        const hp = Math.max(1, Math.round(enemy.maxHp * .34));
        const progress = Math.max(0, enemy.progress - i * .06);
        view.visible = true;
        view.position.set(enemy.view.x, enemy.view.y);
        view.rotation = enemy.view.rotation;
        fish.push({
          view, progress, hp, maxHp: hp,
          speed: enemy.speed * 1.08, slowTimer: 0,
          bossKind: "zomg", armor: 3, wave: enemy.wave
        });
      }
    }

    function pop(enemy, fish, fishViews) {
      if (!enemy.bossKind) return;
      ctx.sfx.play("explosion.cannon_retro_03");
      ctx.fx.shake(enemy.bossKind === "bad" ? .48 : .32);
      const effects = {
        moab: { radius: 56, color: 0x55dff0 },
        bfb: { radius: 78, color: 0xff713f },
        zomg: { radius: 108, color: 0x8067dc },
        bad: { radius: 132, color: 0xff405c }
      }[enemy.bossKind];
      bursts.push({
        x: enemy.view.x, y: enemy.view.y,
        life: .72, maxLife: .72,
        radius: effects.radius, color: effects.color
      });
      if (enemy.bossKind === "bad") addZomgChildren(enemy, fish);
      else if (enemy.bossKind === "zomg") addBfbChildren(enemy, fish);
      else if (enemy.bossKind === "bfb") addMoabChildren(enemy, fish);
      else addNormalChildren(enemy, fish, fishViews);
    }

    function drawEffects(dt, graphics) {
      for (let i = bursts.length - 1; i >= 0; i--) {
        const burst = bursts[i];
        burst.life -= dt;
        if (burst.life <= 0) {
          bursts.splice(i, 1);
          continue;
        }
        const fade = burst.life / burst.maxLife;
        const progress = 1 - fade;
        const radius = burst.radius * (.28 + progress);
        graphics.circle(burst.x, burst.y, radius).stroke({
          color: burst.color, width: 7 * fade, alpha: fade
        });
        graphics.circle(burst.x, burst.y, radius * .48).fill({
          color: 0xfff0a2, alpha: fade * .52
        });
        for (let ray = 0; ray < 8; ray++) {
          const angle = ray * Math.PI / 4 + progress * .24;
          graphics.beginPath()
            .moveTo(burst.x + Math.cos(angle) * radius * .7, burst.y + Math.sin(angle) * radius * .7)
            .lineTo(burst.x + Math.cos(angle) * radius * 1.35, burst.y + Math.sin(angle) * radius * 1.35)
            .stroke({ color: burst.color, width: 4 * fade, alpha: fade });
        }
      }
    }

    function drawHealthBars(fish, graphics) {
      graphics.clear();
      for (const enemy of fish) {
        const boss = enemy.bossKind, x = enemy.view.x;
        const w = boss ? ({ moab: 56, bfb: 72, zomg: 88, bad: 100 }[boss] || 56) : 32;
        const lift = boss ? ({ moab: 46, bfb: 60, zomg: 66, bad: 74 }[boss] || 46) : 22;
        const y = enemy.view.y - lift;
        const health = Math.max(0, enemy.hp / enemy.maxHp);
        const bossColor = boss === "bad" ? 0xff4967 : boss === "zomg" ? 0x9a7cf0 : 0x56d9ef;
        graphics.roundRect(x - w / 2, y, w, 6, 3).fill({ color: 0x194c62, alpha: .92 });
        graphics.roundRect(x - w / 2, y, w * health, 6, 3).fill(
          boss ? (health < .35 ? 0xff765d : bossColor) :
            (health < .35 ? 0xff765d : 0x8cf29a)
        );
      }
    }

    function reset() {
      lastWave = -1;
      bursts.length = 0;
      moabViews.forEach(view => { view.visible = false; view.rotation = 0; });
      bfbViews.forEach(view => { view.visible = false; view.rotation = 0; });
      zomgViews.forEach(view => { view.visible = false; view.rotation = 0; });
      badViews.forEach(view => { view.visible = false; view.rotation = 0; });
    }

    return { spawn, damage, pop, drawEffects, drawHealthBars, reset };
  };
})();
