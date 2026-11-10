(function () {
  window.createCrabBadgeBoost = function (ctx) {
    const view = new PIXI.Container();
    const panel = new PIXI.Graphics();
    const icon = ctx.assets.sprite("crab-speed-badge", { size: 34 });
    const label = new PIXI.Text({ text: "CRAB +10%", style: {
      fontFamily: ctx.ui.fonts.display,
      fontSize: 16,
      fontWeight: "bold",
      fill: "#823a36"
    } });
    view.addChild(panel, icon, label);
    ctx.layers.ui.addChild(view);
    view.visible = false;

    let x = 0;
    let y = 0;
    let pending = false;
    let active = false;

    function layout(size) {
      const width = Math.min(158, size.width - 16);
      const top = Math.max(94, size.height * 0.16);
      x = Math.max(8, size.width - width - 8);
      y = Math.max(8, Math.min(top + 7, size.height - 52));
      panel.clear();
      panel.rect(0, 0, width, 44).fill(0xfff6dc)
        .stroke({ width: 3, color: 0x14879a });
      icon.position.set(21, 22);
      label.position.set(43, 12);
      view.position.set(x, y);
    }

    function refresh() {
      view.visible = pending || active;
    }

    function center() {
      return { x: x + 79, y: y + 22 };
    }

    function award() {
      if (pending || active) return;
      pending = true;
      refresh();
      ctx.ui.banner("Crab badge earned! +10% tower damage next wave!");
    }

    function beginWave() {
      if (!pending) return;
      pending = false;
      active = true;
      refresh();
      const p = center();
      ctx.fx.burst(p.x, p.y);
      ctx.ui.popup("+10% tower damage!", p.x, p.y);
      ctx.ui.banner("Crab badge boost: +10% tower damage this wave!");
    }

    function finishWave() {
      active = false;
      refresh();
    }

    function reset() {
      pending = false;
      active = false;
      refresh();
    }

    function applyDamage(amount) {
      return active ? amount * 1.1 : amount;
    }

    return { layout, award, beginWave, finishWave, reset, applyDamage };
  };
})();
