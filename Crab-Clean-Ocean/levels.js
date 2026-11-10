(function () {
  const names = [
    "Sunlit Reef", "Blue Reef", "Twilight Reef", "Dusky Reef", "Dark Reef",
    "Deep Reef", "Kelp Forest", "Coral Canyon", "Turtle Cove", "Ocean Trench"
  ];
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function positions(level, total, width, bounds) {
    const columns = width < 500 ? 3 : 4;
    const rows = Math.ceil(total / columns);
    const spanX = bounds.right - bounds.left;
    const spanY = bounds.bottom - bounds.top;
    const points = [];

    for (let i = 0; i < total; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      let fx = (col + 0.5) / columns;
      let fy = (row + 0.5) / rows;
      switch ((level - 1) % names.length) {
        case 1:
          if (row % 2 === 1) fx = 1 - fx;
          break;
        case 2:
          fx += row % 2 === 0 ? 0.12 : -0.12;
          break;
        case 3:
          fx += Math.sin(row * 1.7) * 0.11;
          break;
        case 4:
          fy += col % 2 === 0 ? -0.09 : 0.09;
          break;
        case 5:
          fx += Math.sin((row + col) * 1.3) * 0.13;
          fy += Math.cos((row - col) * 1.1) * 0.06;
          break;
        case 6:
          fx = 0.5 + (fx - 0.5) * (0.78 + Math.sin(row * 0.8) * 0.16);
          fy += Math.sin(col * 1.7 + row) * 0.045;
          break;
        case 7:
          if (row % 2 === 1) fx = 1 - fx;
          fx += Math.sin(row * 1.4) * 0.08;
          break;
        case 8:
          fx += Math.cos(row * 1.1 + col) * 0.17;
          fy += Math.sin(col * 1.8 + row * 0.6) * 0.06;
          break;
        case 9:
          fx += Math.sin((row + 1) * (col + 1)) * 0.14;
          fy += (col % 2 === 0 ? -0.08 : 0.08) + Math.cos(row) * 0.035;
          break;
      }
      fx = clamp(fx, 0.07, 0.93);
      fy = clamp(fy, 0.08, 0.92);
      let x = bounds.left + spanX * fx;
      let y = bounds.top + spanY * fy;
      if (Math.hypot(x - width / 2, y - (bounds.top + bounds.bottom) / 2) < 48) {
        y = clamp(y + 55, bounds.top + 20, bounds.bottom - 12);
      }
      points.push({ x, y });
    }
    return points;
  }

  function createQuizUi(ctx, onChoose) {
    const layer = new PIXI.Container();
    layer.visible = false;
    const cards = [0, 1, 2].map(index => {
      const view = new PIXI.Container();
      const background = new PIXI.Graphics();
      const label = new PIXI.Text({ text: "", style: {
        fontFamily: ctx.ui.fonts.body, fontSize: 18, fontWeight: "700",
        fill: 0x07516b, wordWrap: true, wordWrapWidth: 250
      } });
      view.addChild(background, label);
      view.eventMode = "static";
      view.cursor = "pointer";
      view.on("pointertap", () => onChoose(index));
      view.visible = false;
      layer.addChild(view);
      return { view, background, label };
    });

    function layout(choices, width, height) {
      const margin = 14;
      const cardWidth = Math.max(44, Math.min(width - margin * 2,
        width < 500 ? 310 : Math.min(270, Math.max(205, width * 0.28))));
      const top = height < 380 ? Math.max(50, height * 0.14) : Math.min(height * 0.28, 180);
      const bottom = Math.max(top + 90, height - (height < 720 ? 105 : 125));
      const roomHeight = Math.max(90, bottom - top);
      const gap = 10;
      const cardHeight = Math.max(44, Math.min(64, (roomHeight - gap * 2) / 3));
      const maxX = Math.max(margin, width - margin - cardWidth);
      const maxY = Math.max(top, bottom - cardHeight);
      const order = [0, 1, 2];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const placements = [];
      for (const index of order) {
        let spot = null;
        for (let attempt = 0; attempt < 300 && !spot; attempt++) {
          const xPos = margin + Math.random() * Math.max(0, maxX - margin);
          const yPos = top + Math.random() * Math.max(0, maxY - top);
          const clear = placements.every(p =>
            xPos + cardWidth + gap <= p.x || p.x + cardWidth + gap <= xPos ||
            yPos + cardHeight + gap <= p.y || p.y + cardHeight + gap <= yPos);
          if (clear) spot = { index, x: xPos, y: yPos };
        }
        if (!spot) break;
        placements.push(spot);
      }
      if (placements.length < 3) {
        placements.length = 0;
        const rowGap = Math.max(0, (roomHeight - cardHeight * 3) / 2);
        order.forEach((index, row) => placements.push({
          index,
          x: margin + Math.random() * Math.max(0, maxX - margin),
          y: top + row * (cardHeight + rowGap)
        }));
      }
      placements.forEach(({ index, x: xPos, y: yPos }) => {
        const card = cards[index];
        card.label.text = (index + 1) + ". " + choices[index];
        card.label.style.wordWrapWidth = Math.max(40, cardWidth - 28);
        card.label.x = 14;
        card.label.y = Math.max(6, (cardHeight - card.label.height) / 2);
        card.background.clear()
          .rect(0, 0, cardWidth, cardHeight).fill(0xe8fbff)
          .rect(0, 0, cardWidth, cardHeight).stroke({ width: 3, color: 0x1686bc });
        card.view.position.set(xPos, yPos);
        card.view.hitArea = new PIXI.Rectangle(0, 0, cardWidth, cardHeight);
        card.view.visible = true;
      });
      layer.visible = true;
    }

    return { layer, cards, layout };
  }

  function layoutItems(items, total, level, width, bounds) {
    const points = positions(level, total, width, bounds);
    points.forEach((point, i) => {
      const item = items[i];
      item.x = point.x;
      item.y = point.y;
      item.view.position.set(item.x, item.y);
    });
  }

  function drawDepthTint(graphics, width, height, level, levelCount) {
    const progress = (level - 1) / Math.max(1, levelCount - 1);
    graphics.clear().rect(0, 0, width, height)
      .fill({ color: 0x00152c, alpha: 0.035 + progress * 0.38 });
  }

  const boostTypes = [
    { id: "speed", label: "Swim faster", icon: "⚡", costs: [30, 50, 75, 105, 140, 180] },
    { id: "reach", label: "Cleanup reach", icon: "🫧", costs: [25, 45, 70, 100, 135] },
    { id: "time", label: "Extra reef time", icon: "⏱️", costs: [25, 45, 70, 100] },
    { id: "shells", label: "Shell bonus", icon: "🐚", costs: [35, 60, 90, 125] }
  ];

  function createBoostShop(ctx, hooks) {
    let toolbar = null;

    function refresh() {
      if (!toolbar) return;
      boostTypes.forEach(boost => {
        const cost = boost.costs[hooks.levels[boost.id]];
        toolbar.setCost(boost.id, cost == null ? "MAX" : cost + " shells");
        toolbar.setDisabled(boost.id, cost == null || hooks.getShells() < cost);
      });
    }

    function choose(id) {
      if (id === "continue") {
        hooks.onContinue();
        return;
      }
      const boost = boostTypes.find(item => item.id === id);
      if (!boost) return;
      const cost = boost.costs[hooks.levels[id]];
      if (cost == null || hooks.getShells() < cost) return;
      hooks.onPurchase(id, cost);
      refresh();
    }

    function open() {
      if (toolbar) toolbar.remove();
      const options = boostTypes.map(boost => {
        const cost = boost.costs[hooks.levels[boost.id]];
        return {
          id: boost.id,
          label: boost.label,
          icon: boost.icon,
          cost: cost == null ? "MAX" : cost + " shells"
        };
      });
      options.push({
        id: "continue",
        label: hooks.isFinal() ? "Finish reef" : "Next reef",
        icon: "🌊"
      });
      toolbar = ctx.ui.toolbar(options, { onSelect: choose, selected: "continue" });
      refresh();
    }

    function remove() {
      if (toolbar) toolbar.remove();
      toolbar = null;
    }

    return { open, remove };
  }

  window.ReefLevelLayout = { names, positions, layoutItems, drawDepthTint };
  window.ReefQuizLayout = { createQuizUi };
  window.ReefBoostShop = { create: createBoostShop };
})();
