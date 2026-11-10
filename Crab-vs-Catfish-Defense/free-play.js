(function () {
  const sendTools = [
    { id: "send-blue", label: "Blue catfish", shortLabel: "Blue", picture: "blue-catfish" },
    { id: "send-gold", label: "Gold catfish", shortLabel: "Gold", picture: "gold-catfish" },
    { id: "send-violet", label: "Violet catfish", shortLabel: "Violet", picture: "violet-catfish" },
    { id: "send-moab", label: "MOAB catfish", shortLabel: "MOAB", picture: "moab-catfish" },
    { id: "send-bfb", label: "BFB catfish", shortLabel: "BFB", picture: "bfb-catfish" },
    { id: "send-zomg", label: "ZOMG catfish", shortLabel: "ZOMG", picture: "zomg-catfish" },
    { id: "send-bad", label: "BAD catfish", shortLabel: "BAD", picture: "bad-catfish" }
  ];

  window.createReefCatfishSpawners = function (ctx, fishViews, fishArt, enemyTint, bosses) {
    const variants = { blue: 0, gold: 1, violet: 2 };

    function normal(state, chosenVariant) {
      const wave = Math.max(1, state.wave);
      const variant = chosenVariant === undefined ?
        (wave % 5 === 0 ? 2 : wave % 3 === 0 ? 1 : 0) : chosenVariant;
      const preferred = fishViews.find(candidate => !candidate.visible &&
        fishArt[variant] === fishArt[candidate._fishKind || 0]);
      const view = preferred || (chosenVariant === undefined ?
        fishViews.find(candidate => !candidate.visible) : null);
      if (!view) return false;
      const maxHp = 2 + Math.floor(wave * 1.45) + variant * 2;
      const speed = Math.min(210, 62 + wave * 5.5 + Math.sqrt(wave) * 7);
      if (chosenVariant === undefined && bosses.spawn(wave, speed / state.routeLength,
        state.fish, state.start, state.index, view, state.penalty)) {
        state.onBoss();
        return true;
      }
      const enemy = { view, progress: 0, hp: maxHp, maxHp,
        speed: speed / state.routeLength, slowTimer: 0 };
      state.fish.push(enemy);
      view.visible = true;
      view.tint = enemyTint[variant];
      view.position.set(state.start.x, state.start.y);
      return true;
    }

    function chosen(kind, state) {
      if (Object.prototype.hasOwnProperty.call(variants, kind)) {
        return normal(state, variants[kind]);
      }
      const wave = Math.max(1, state.wave);
      const speed = Math.min(210, 62 + wave * 5.5 + Math.sqrt(wave) * 7);
      return bosses.spawn(wave, speed / state.routeLength, state.fish,
        state.start, state.fish.length, null, null, kind);
    }

    return { normal, chosen };
  };

  window.createReefFreePlayMode = function (ctx, buildTools, hooks) {
    let active = false;
    const button = ctx.ui.button("Free Play", () => {
      if (active) return;
      active = true;
      button.hidden = true;
      hooks.onEnable();
      ctx.ui.banner("Free Play! Unlimited shells—choose a catfish to send it down the path!");
    }, { at: "top-right" });
    button.hidden = true;

    const mode = {
      button,
      get active() { return active; },
      items() { return buildTools; },
      handle(id) {
        if (!active || !id.startsWith("send-")) return false;
        const kind = id.slice(5);
        if (!hooks.spawn(kind)) ctx.ui.banner("No more " + kind.toUpperCase() + " catfish ready yet!");
        else hooks.onSend(kind);
        return true;
      },
      reset() {
        active = false;
        button.hidden = false;
      }
    };
    mode.sidebar = createSidebar(ctx, kind => mode.handle("send-" + kind));
    return mode;
  };

  function createSidebar(ctx, deploy) {
    const view = new PIXI.Container();
    const panel = new PIXI.Graphics();
    const title = new PIXI.Text({ text: "DEPLOY CATFISH", style: {
      fontFamily: ctx.ui.fonts.display, fontSize: 16, fontWeight: "bold", fill: "#15566b"
    } });
    view.addChild(panel, title);
    const rows = sendTools.map(item => {
      const bg = new PIXI.Graphics();
      const icon = ctx.assets.sprite(item.picture, { size: 32 });
      const label = new PIXI.Text({ text: item.shortLabel, style: {
        fontFamily: ctx.ui.fonts.display, fontSize: 16, fontWeight: "bold", fill: "#164f67"
      } });
      label.anchor.set(0, 0.5);
      view.addChild(bg, icon, label);
      return { item, bg, icon, label };
    });
    ctx.layers.ui.addChild(view);
    view.visible = false;

    const rowHeight = 46;
    const headerHeight = 40;
    const padding = 7;
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;
    let active = false;

    function playWidth(size) {
      const side = Math.min(160, Math.max(126, size.width * 0.34));
      return Math.max(150, size.width - side);
    }

    function layout(size, enabled, top) {
      active = !!enabled;
      view.visible = active;
      if (!active) return;
      width = size.width - playWidth(size);
      height = headerHeight + rows.length * rowHeight + padding;
      x = size.width - width;
      y = top;
      view.position.set(x, y);
      panel.clear();
      panel.rect(0, 0, width, height).fill(0xfff3d6)
        .stroke({ width: 3, color: 0x14879a });
      title.anchor.set(0.5, 0.5);
      title.position.set(width / 2, 20);
      rows.forEach((row, index) => {
        const rowY = headerHeight + index * rowHeight;
        row.bg.clear();
        row.bg.rect(4, rowY, width - 8, 44).fill(0xfffdf1)
          .stroke({ width: 2, color: 0x7dc9c5 });
        row.icon.position.set(23, rowY + 22);
        row.label.position.set(43, rowY + 22);
      });
    }

    function handlePointer(px, py) {
      if (!active || px < x || px > x + width || py < y || py > y + height) return false;
      const localY = py - y - headerHeight;
      const index = Math.floor(localY / rowHeight);
      if (index >= 0 && index < rows.length && localY % rowHeight < 44) {
        deploy(rows[index].item.id.slice(5));
      }
      return true;
    }

    return { playWidth, layout, handlePointer };
  }
})();
