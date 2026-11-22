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
    const spanX = Math.max(1, bounds.right - bounds.left);
    const spanY = Math.max(1, bounds.bottom - bounds.top);
    const padX = Math.min(18, spanX * 0.08);
    const padY = Math.min(18, spanY * 0.06);
    const minX = bounds.left + padX, maxX = bounds.right - padX;
    const minY = bounds.top + padY, maxY = bounds.bottom - padY;
    const centerX = (bounds.left + bounds.right) / 2;
    const centerY = (bounds.top + bounds.bottom) / 2;
    const keepOut = Math.min(66, Math.min(spanX, spanY) * 0.22);
    const targetGap = clamp(Math.sqrt(spanX * spanY / Math.max(1, total)) * 0.48, 32, 58);
    const points = [];

    // Random candidates are spaced apart when possible, while keeping the
    // player's starting spot clear and every item inside the swim area.
    for (let i = 0; i < total; i++) {
      let best = null, bestClearance = -1;
      for (let attempt = 0; attempt < 120; attempt++) {
        const candidate = {
          x: minX + Math.random() * Math.max(0, maxX - minX),
          y: minY + Math.random() * Math.max(0, maxY - minY)
        };
        if (Math.hypot(candidate.x - centerX, candidate.y - centerY) < keepOut) continue;
        const clearance = points.length ? Math.min(...points.map(point =>
          Math.hypot(candidate.x - point.x, candidate.y - point.y))) : Infinity;
        if (clearance > bestClearance) {
          best = candidate;
          bestClearance = clearance;
        }
        if (clearance >= targetGap) break;
      }
      if (!best) {
        best = {
          x: minX + Math.random() * Math.max(0, maxX - minX),
          y: minY + Math.random() * Math.max(0, maxY - minY)
        };
      }
      points.push(best);
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
      const margin = 10;
      const gap = 8;
      const cardWidth = Math.min(270, Math.max(44,
        (width - margin * 2 - gap * 2) / 3));
      const cardHeight = Math.min(112, Math.max(76, height * 0.15));
      const rowWidth = cardWidth * 3 + gap * 2;
      const firstX = Math.max(margin, (width - rowWidth) / 2);
      const yPos = clamp(height * 0.56 - cardHeight / 2,
        48, Math.max(48, height - cardHeight - 100));

      // Keep the answer choices in one predictable horizontal row. Their
      // narrow phone-sized cards wrap the labels but remain easy to tap.
      choices.forEach((choice, index) => {
        const card = cards[index];
        card.label.text = (index + 1) + ". " + choice;
        card.label.style.wordWrapWidth = Math.max(40, cardWidth - 24);
        card.label.x = 12;
        card.label.y = Math.max(6, (cardHeight - card.label.height) / 2);
        card.background.clear()
          .rect(0, 0, cardWidth, cardHeight).fill(0xe8fbff)
          .rect(0, 0, cardWidth, cardHeight).stroke({ width: 3, color: 0x1686bc });
        card.view.position.set(firstX + index * (cardWidth + gap), yPos);
        card.view.hitArea = new PIXI.Rectangle(0, 0, cardWidth, cardHeight);
        card.view.visible = true;
      });
      layer.visible = true;
    }

    return { layer, cards, layout };
  }

  let laidOutLevel = null, laidOutTotal = -1;
  function layoutItems(items, total, level, width, bounds, forceReroll) {
    const reroll = forceReroll || level !== laidOutLevel || total !== laidOutTotal ||
      items.slice(0, total).some(item => !Number.isFinite(item.layoutX) || !Number.isFinite(item.layoutY));
    if (reroll) {
      const points = positions(level, total, width, bounds);
      points.forEach((point, i) => {
        items[i].layoutX = (point.x - bounds.left) / Math.max(1, bounds.right - bounds.left);
        items[i].layoutY = (point.y - bounds.top) / Math.max(1, bounds.bottom - bounds.top);
      });
      laidOutLevel = level;
      laidOutTotal = total;
    }
    items.slice(0, total).forEach(item => {
      item.x = bounds.left + item.layoutX * (bounds.right - bounds.left);
      item.y = bounds.top + item.layoutY * (bounds.bottom - bounds.top);
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
