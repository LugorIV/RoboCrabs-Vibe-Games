(function () {
  const names = [
    "Sunlit Reef", "Blue Reef", "Twilight Reef", "Dusky Reef", "Dark Reef",
    "Deep Reef", "Kelp Forest", "Coral Canyon", "Turtle Cove", "Ocean Trench"
  ];
  const questions = [
    { question: "Where do blue crabs often live?", choices: ["Coastal bays", "Dry deserts", "Tree tops"], answer: 0, fact: "Blue crabs live in coastal bays and estuaries." },
    { question: "How do blue crabs usually move?", choices: ["By flying", "Sideways", "By rolling"], answer: 1, fact: "Blue crabs can scuttle sideways." },
    { question: "What protects a crab's body?", choices: ["Soft feathers", "A hard shell", "Thick fur"], answer: 1, fact: "A hard outer shell protects a blue crab." },
    { question: "How does a crab grow bigger?", choices: ["Molt its shell", "Stretch its claws", "Grow a beak"], answer: 0, fact: "A blue crab molts, shedding its old shell to grow." },
    { question: "What can blue crabs use claws for?", choices: ["Catch food", "Make bubbles", "Build nests"], answer: 0, fact: "Their claws help blue crabs catch and handle food." },
    { question: "How can we help blue crabs?", choices: ["Keep water clean", "Leave litter", "Pour oil"], answer: 0, fact: "Clean water helps blue crabs and other ocean life." }
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
        fill: 0x07516b, wordWrap: true, wordWrapWidth: 250, align: "center"
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
      const questionCenter = height * 0.5;
      const top = Math.max(50, questionCenter - 105);
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
          const yPos = bottom - cardHeight - Math.random() * Math.max(0, maxY - top);
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
    { id: "shells", label: "Shell bonus", icon: "🐚", costs: [35, 60, 90, 125] },
    { id: "score", label: "Pearl polish", icon: "💎", costs: [40, 70, 105, 145] },
    { id: "scholar", label: "Ocean scholar", icon: "📘", costs: [35, 60, 90] },
    { id: "shield", label: "Bubble guard", icon: "🛡️", costs: [45, 75, 110, 150, 195] }
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

  function createCharacterRoster(ctx) {
    const choices = [
      { name: "Blue Crab", icon: "🦀", key: "hero-blue-crab" },
      { name: "Clownfish", icon: "🐠", key: "hero-clownfish" },
      { name: "Sea Turtle", icon: "🐢", key: "hero-turtle" },
      { name: "Octopus", icon: "🐙", key: "hero-octopus" },
      { name: "Seahorse", icon: "🐴", key: "hero-seahorse" },
      { name: "Pufferfish", icon: "🐡", key: "hero-pufferfish" },
      { name: "Whale", icon: "🐳", key: "hero-whale" },
      { name: "Jellyfish", icon: "🪼", key: "hero-jellyfish" }
    ];
    const views = choices.map(choice => {
      const view = ctx.assets.sprite(choice.key, { size: 68 });
      view.visible = false;
      return view;
    });
    return { choices, views };
  }

  function createCharacterPicker(ctx, views, choices, onChoose) {
    let toolbar = null;
    let isOpen = false;

    function layout(width, height) {
      const columns = width < 500 ? 4 : 8;
      const rows = Math.ceil(views.length / columns);
      const gapX = Math.min(78, (width - 36) / columns);
      const firstY = Math.min(height * 0.32, 190);
      views.forEach((view, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        view.position.set(width / 2 + (col - (columns - 1) / 2) * gapX,
          firstY + row * Math.min(74, height * 0.12));
      });
    }

    function close() {
      isOpen = false;
      if (toolbar) toolbar.remove();
      toolbar = null;
    }

    function open(width, height) {
      close();
      isOpen = true;
      layout(width, height);
      toolbar = ctx.ui.toolbar(choices.map((choice, index) => ({
        id: "character-" + index,
        label: choice.name,
        icon: choice.icon
      })), {
        onSelect(id) {
          const index = Number(id.slice("character-".length));
          if (!Number.isInteger(index) || !choices[index]) return;
          close();
          onChoose(index);
        }
      });
    }

    return {
      open,
      close,
      resize(width, height) {
        if (isOpen) layout(width, height);
      }
    };
  }

  window.ReefLevelLayout = { names, positions, layoutItems, drawDepthTint };
  window.ReefQuizLayout = { names, questions, createQuizUi };
  window.ReefBoostShop = {
    create: createBoostShop,
    status(levels, shields) {
      return "Swim " + levels.speed + " | Reach " + levels.reach +
        " | Shells " + levels.shells + " | Pearls " + levels.score +
        " | Quiz " + levels.scholar + " | Guards " + shields;
    },
    purchaseMessage(id, rank, shields) {
      const messages = {
        speed: "Swim speed boost!", reach: "Cleanup reach boost!",
        shells: "More shells for every cleanup!", score: "Pearl polish adds cleanup points!",
        scholar: "Ocean scholar boosts quiz prizes!", shield: "Bubble guard charge added!"
      };
      return messages[id] + (id === "shield" ? " Guards: " + shields + "!" : " Rank " + rank + "!");
    }
  };
  window.ReefCharacterPicker = {
    create: createCharacterPicker,
    createRoster: createCharacterRoster
  };
})();
