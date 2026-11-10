(function () {
  window.createCrabHelicopterShots = function (ctx) {
    const shots = Array.from({ length: 40 }, () => {
      const view = ctx.assets.sprite("crab-heli-missile", { size: 20 });
      view.visible = false;
      ctx.layers.world.addChild(view);
      return { view, life: 0, duration: 1, x: 0, y: 0, tx: 0, ty: 0 };
    });
    function fire(x, y, tx, ty) {
      const shot = shots.find(item => !item.view.visible);
      if (!shot) return;
      shot.x = x;
      shot.y = y;
      shot.tx = tx;
      shot.ty = ty;
      shot.life = 0;
      shot.duration = Math.max(.12, Math.hypot(tx - x, ty - y) / 480);
      shot.view.rotation = Math.atan2(ty - y, tx - x);
      shot.view.position.set(x, y);
      shot.view.visible = true;
    }
    function update(dt) {
      for (const shot of shots) {
        if (!shot.view.visible) continue;
        shot.life += dt;
        const t = Math.min(1, shot.life / shot.duration);
        shot.view.position.set(shot.x + (shot.tx - shot.x) * t, shot.y + (shot.ty - shot.y) * t);
        if (t >= 1) shot.view.visible = false;
      }
    }
    function reset() {
      for (const shot of shots) shot.view.visible = false;
    }
    return { fire, update, reset };
  };
  window.createCrabCarrierFlights = function (ctx) {
    const impactArt = new PIXI.Graphics();
    ctx.layers.world.addChild(impactArt);
    const impacts = [];
    const flights = Array.from({ length: 36 }, () => {
      const view = ctx.assets.sprite("crab-fighter-jet", { size: 25 });
      view.visible = false;
      ctx.layers.world.addChild(view);
      return { view, life: 0, duration: 1, x: 0, y: 0, tx: 0, ty: 0, impact: false };
    });
    function fire(x, y, tx, ty, count = 2) {
      const angle = Math.atan2(ty - y, tx - x);
      const jetCount = Math.max(0, Math.min(2, Math.floor(count)));
      let launched = 0;
      for (let i = 0; i < jetCount; i++) {
        const shot = flights.find(item => !item.view.visible);
        if (!shot) break;
        const side = jetCount === 1 ? 0 : i === 0 ? -1 : 1;
        const offsetX = -Math.sin(angle) * side * 7;
        const offsetY = Math.cos(angle) * side * 7;
        shot.x = x + offsetX; shot.y = y + offsetY;
        shot.tx = tx + offsetX; shot.ty = ty + offsetY;
        shot.life = 0;
        shot.duration = Math.max(.2, Math.hypot(tx - x, ty - y) / 520);
        shot.impact = i === jetCount - 1;
        shot.view.rotation = angle;
        shot.view.position.set(shot.x, shot.y);
        shot.view.visible = true;
        launched++;
      }
      return launched;
    }
    function update(dt) {
      for (const shot of flights) {
        if (!shot.view.visible) continue;
        shot.life += dt;
        const t = Math.min(1, shot.life / shot.duration);
        const arc = Math.sin(Math.PI * t) * Math.min(18, Math.hypot(shot.tx - shot.x, shot.ty - shot.y) * .07);
        shot.view.position.set(shot.x + (shot.tx - shot.x) * t + Math.sin(shot.view.rotation) * arc,
          shot.y + (shot.ty - shot.y) * t - Math.cos(shot.view.rotation) * arc);
        if (t >= 1) {
          shot.view.visible = false;
          if (shot.impact) impacts.push({ x: shot.tx, y: shot.ty, life: 0 });
        }
      }
      for (let i = impacts.length - 1; i >= 0; i--) {
        impacts[i].life += dt;
        if (impacts[i].life >= .36) impacts.splice(i, 1);
      }
      impactArt.clear();
      for (const hit of impacts) {
        const progress = hit.life / .36;
        const alpha = 1 - progress;
        impactArt.circle(hit.x, hit.y, 12 + progress * 72)
          .stroke({ width: 4, color: 0xffb648, alpha });
        impactArt.circle(hit.x, hit.y, 5 + (1 - progress) * 7)
          .fill({ color: 0xfff0ae, alpha });
      }
    }
    function reset() {
      flights.forEach(shot => { shot.view.visible = false; });
      impacts.length = 0;
      impactArt.clear();
    }
    return { fire, update, reset };
  };

  window.createCrabCarrierMeter = function (ctx) {
    const art = new PIXI.Graphics();
    const labels = Array.from({ length: 64 }, () => new PIXI.Text({
      text: "",
      style: { fontFamily: ctx.ui.fonts.display, fontSize: 16, fontWeight: "bold", fill: "#164c63" }
    }));
    ctx.layers.world.addChild(art);
    labels.forEach(label => {
      label.anchor.set(0.5, 0);
      label.visible = false;
      ctx.layers.world.addChild(label);
    });
    let previous = "";

    function update(towers) {
      const carriers = towers.filter(tower => tower.type === "crabCarrier");
      const signature = carriers.map(tower => [tower.slot, tower.x, tower.y, tower.carrierJets, tower.carrierMaxJets].join(":" )).join("|");
      if (signature === previous) return;
      previous = signature;
      art.clear();
      labels.forEach(label => { label.visible = false; });
      for (const tower of carriers) {
        const x = tower.x - 46;
        const y = tower.y + 34;
        const fraction = tower.carrierMaxJets > 0 ? tower.carrierJets / tower.carrierMaxJets : 0;
        art.rect(x, y, 92, 30).fill(0xfff5d6).stroke({ width: 2, color: 0x14687b });
        art.rect(x + 10, y + 21, 72, 5).fill(0x9eb9b2);
        if (fraction > 0) art.rect(x + 10, y + 21, 72 * fraction, 5).fill(0xffa849);
        const label = labels[tower.slot];
        label.text = "JETS " + tower.carrierJets;
        label.position.set(tower.x, y + 2);
        label.visible = true;
      }
    }

    return {
      newTower(type, wave) {
        if (type !== "crabCarrier") return {};
        const ready = 2 + wave;
        return { carrierJets: ready, carrierMaxJets: ready, carrierWave: wave };
      },
      beginWave(towers, wave) {
        for (const tower of towers) {
          if (tower.type !== "crabCarrier") continue;
          tower.carrierJets = 2 + wave;
          tower.carrierMaxJets = tower.carrierJets;
          tower.carrierWave = wave;
        }
        update(towers);
      },
      launch(tower, flights, x, y, tx, ty) {
        const ready = Math.min(2, tower.carrierJets);
        if (ready <= 0) return 0;
        const launched = flights.fire(x, y, tx, ty, ready);
        tower.carrierJets = Math.max(0, tower.carrierJets - launched);
        return launched;
      },
      update
    };
  };
})();
