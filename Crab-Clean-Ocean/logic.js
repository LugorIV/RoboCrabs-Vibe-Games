(function () {
  Game2DCore.mount({ hud: "custom", createGame(ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "luckiest-guy", body: "nunito", hud: "corners", lives: "count", title: "card", pause: "top-right" });
    ctx.input.setControls({ controls: [
      { id: "left", label: "Swim left", keys: ["ArrowLeft", "KeyA"] },
      { id: "right", label: "Swim right", keys: ["ArrowRight", "KeyD"] },
      { id: "up", label: "Swim up", keys: ["ArrowUp", "KeyW"] },
      { id: "down", label: "Swim down", keys: ["ArrowDown", "KeyS"] }
    ] });
    ctx.assets.background("sunny-reef", { fit: "cover" });
    const depthTint = new PIXI.Graphics();
    const shadow = new PIXI.Graphics();
    const crab = ctx.assets.char0979({ scale: 1 });
    const crabBounds = crab.getLocalBounds();
    const crabSize = Math.max(crabBounds.width, crabBounds.height) || 1;
    crab.scale.set(68 / crabSize);
    const CATFISH_SIZE = 360;
    const catfish = ctx.assets.sprite("big-blue-catfish", { size: CATFISH_SIZE });
    catfish.visible = false;
    let catfishFit = 1;
    const keys = ["trash-bottle", "trash-bag", "trash-can", "trash-net"];
    const SUNNY_LEVELS = 5;
    const LEVEL_COUNT = ReefLevelLayout.names.length;
    const LEVEL_NAMES = ReefLevelLayout.names;
    const DEEP_REEF_ITEMS = 24;
    const MAX_LEVEL_ITEMS = 36;
    const items = Array.from({ length: MAX_LEVEL_ITEMS }, (_, i) => ({
      kind: i % keys.length,
      view: ctx.assets.sprite(keys[i % keys.length], { size: 45 }),
      x: 0, y: 0, active: false
    }));
    const bubbles = new PIXI.Graphics();
    ctx.layers.world.addChild(depthTint);
    ctx.layers.world.addChild(shadow);
    items.forEach(item => ctx.layers.world.addChild(item.view));
    ctx.layers.world.addChild(crab, bubbles, catfish);

    let width = ctx.size.width, height = ctx.size.height;
    let bounds = { left: 38, right: width - 38, top: 110, bottom: height - 120 };
    let x = width / 2, y = height / 2, score = 0, shells = 0, level = 1;
    let remaining = 0, total = 0, seconds = 70, playing = false;
    let elapsed = 0, movingLast = false, transition = 0, musicTrack = null;
    let catfishPopup = 0;
    const CATFISH_POPUP_SECONDS = 1.8;
    let previousDanger = 0;
    const boostLevels = { speed: 0, reach: 0, time: 0, shells: 0 };
    let shopOpen = false;
    let quizOpen = false, quizShownThisLevel = false, quizToolbar = null;
    const quizQuestions = [
      { question: "Where do blue crabs often live?", choices: ["Coastal bays", "Dry deserts", "Tree tops"], answer: 0, fact: "Blue crabs live in coastal bays and estuaries." },
      { question: "How do blue crabs usually move?", choices: ["By flying", "Sideways", "By rolling"], answer: 1, fact: "Blue crabs can scuttle sideways." },
      { question: "What protects a crab's body?", choices: ["Soft feathers", "A hard shell", "Thick fur"], answer: 1, fact: "A hard outer shell protects a blue crab." },
      { question: "How does a crab grow bigger?", choices: ["Molt its shell", "Stretch its claws", "Grow a beak"], answer: 0, fact: "A blue crab molts, shedding its old shell to grow." },
      { question: "What can blue crabs use claws for?", choices: ["Catch food", "Make bubbles", "Build nests"], answer: 0, fact: "Their claws help blue crabs catch and handle food." },
      { question: "How can we help blue crabs?", choices: ["Keep water clean", "Leave litter", "Pour oil"], answer: 0, fact: "Clean water helps blue crabs and other ocean life." }
    ];
    const quizUi = ReefQuizLayout.createQuizUi(ctx, index => {
      if (quizOpen && quizToolbar) quizToolbar.select("answer-" + index);
    });
    const quizLayer = quizUi.layer;
    const quizCards = quizUi.cards;
    ctx.layers.ui.addChild(quizLayer);

    const endOverlay = document.getElementById("game-over");
    const endMessage = document.getElementById("end-message");
    const endScore = document.getElementById("end-score");
    document.getElementById("restart-button").addEventListener("click", () => {
      endOverlay.hidden = true;
      ctx.restart();
    });
    function showEnd(message) {
      endMessage.textContent = message;
      endScore.textContent = "Score: " + score;
      endOverlay.hidden = false;
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    function resize(size) {
      width = size.width;
      height = size.height;
      const bottomSpace = height < 720 ? 105 : 125;
      bounds = { left: 35, right: Math.max(36, width - 35), top: Math.min(115, height * 0.24), bottom: Math.max(180, height - bottomSpace) };
      x = clamp(x, bounds.left, bounds.right);
      y = clamp(y, bounds.top, bounds.bottom);
      catfishFit = Math.max(1, width * 1.3 / CATFISH_SIZE);
      ReefLevelLayout.drawDepthTint(depthTint, width, height, level, LEVEL_COUNT);
      // All items use normalized layout on a resize, so even a narrow reef stays reachable.
      ReefLevelLayout.layoutItems(items, total, level, width, bounds);
      if (quizOpen) quizUi.layout(quizQuestions[(level - 1) % quizQuestions.length].choices, width, height);
    }

    function dangerLevel() {
      return Math.ceil(level / LEVEL_COUNT * 5);
    }

    function boostStatus() {
      return "Boosts: Swim " + boostLevels.speed + " | Reach " + boostLevels.reach +
        " | Time " + boostLevels.time + " | Shells " + boostLevels.shells;
    }

    function hud() {
      ctx.ui.hud.score(score);
      ctx.ui.hud.text("shells", "Shells: " + shells);
      ctx.ui.hud.bar("Ocean health", total - remaining, total);
      ctx.ui.hud.bar("Depth", level, LEVEL_COUNT, {
        label: "REEF: " + LEVEL_NAMES[level - 1], color: "#1686bc"
      });
      const danger = dangerLevel();
      const dangerColor = danger >= 4 ? "#ef4444" : danger >= 3 ? "#f59e0b" : "#22c55e";
      ctx.ui.hud.bar("Danger", danger, 5, {
        label: "DANGER " + danger + "/5",
        color: dangerColor
      });
      ctx.ui.hud.timer(Math.ceil(seconds));
    }

    const boostShop = ReefBoostShop.create(ctx, {
      levels: boostLevels,
      getShells: () => shells,
      isFinal: () => level === LEVEL_COUNT,
      onContinue: finish,
      onPurchase(id, cost) {
        shells -= cost;
        boostLevels[id]++;
        const messages = {
          speed: "Swim speed boost!",
          reach: "Cleanup reach boost!",
          time: "Extra time boost for the next reef!",
          shells: "More shells for every cleanup!"
        };
        ctx.ui.banner(messages[id] + " Rank " + boostLevels[id] + "!", { seconds: 1.6 });
        ctx.sfx.play("pickup.metal_clink_02", { volume: 0.55 });
        ctx.ui.hud.text("shells", "Shells: " + shells);
        ctx.ui.hud.text("shop", boostStatus());
      }
    });

    function startLevel() {
      boostShop.remove();
      if (quizToolbar) {
        quizToolbar.remove();
        quizToolbar = null;
      }
      shopOpen = false;
      quizOpen = false;
      quizShownThisLevel = false;
      ctx.ui.hud.text("shop", null);
      ctx.ui.hud.text("quiz", null);
      quizCards.forEach(card => { card.view.visible = false; });
      const deepReef = level > SUNNY_LEVELS;
      total = level <= SUNNY_LEVELS
        ? 3 + level * 3
        : DEEP_REEF_ITEMS + (level - SUNNY_LEVELS - 1) * 3;
      remaining = total;
      // Later reefs add cleanup targets while keeping enough time to explore.
      seconds = Math.min(70, Math.max(22, 40 - (level - 1) * 2) + boostLevels.time * 6);
      x = width / 2;
      y = (bounds.top + bounds.bottom) / 2;
      items.forEach((item, i) => {
        item.active = i < total;
        item.view.visible = item.active;
      });
      ReefLevelLayout.layoutItems(items, total, level, width, bounds);
      ReefLevelLayout.drawDepthTint(depthTint, width, height, level, LEVEL_COUNT);
      hud();
      const danger = dangerLevel();
      if (danger >= 4 && danger > previousDanger) {
        // A quick rising electronic sting overlays the music as danger climbs.
        ctx.sfx.play("laser.phaser_up_01", { volume: 0.5 });
      }
      previousDanger = danger;
      const nextTrack = deepReef ? "music.the_abyss" : "music.happy_acoustic_loop";
      if (nextTrack !== musicTrack) {
        ctx.music.play(nextTrack, { fade: 1 });
        musicTrack = nextTrack;
      }
      ctx.ui.banner(LEVEL_NAMES[level - 1] + " — Level " + level + "/" + LEVEL_COUNT + "! Collect " + total + "!");
      if (level > 1) ctx.sfx.play("water.splash_06", { volume: 0.55 });
    }

    function reset() {
      endOverlay.hidden = true;
      level = 1;
      score = 0;
      shells = 0;
      boostLevels.speed = 0;
      boostLevels.reach = 0;
      boostLevels.time = 0;
      boostLevels.shells = 0;
      shopOpen = false;
      transition = 0;
      catfishPopup = 0;
      catfish.visible = false;
      catfish.scale.set(catfishFit);
      catfish.rotation = 0;
      musicTrack = null;
      previousDanger = 0;
      playing = true;
      startLevel();
      ctx.sfx.play("jingle.ready_go_synth_02", { volume: 0.6 });
    }

    function collect(item) {
      item.active = false;
      item.view.visible = false;
      remaining--;
      score += 10;
      shells += 10 + boostLevels.shells * 5;
      hud();
      ctx.ui.popup("+10", item.x, item.y);
      ctx.fx.burst(item.x, item.y);
      ctx.sfx.play(["object.bottle_01", "object.cloth_bag_02", "pickup.metal_clink_02", "object.cloth_bag_02"][item.kind], { volume: 0.55 });
      if (remaining === 0) {
        playing = false;
        transition = 1.4;
        ctx.fx.flash();
        ctx.ui.banner("100% healthy! Reef restored!");
      } else if (!quizShownThisLevel && total - remaining >= Math.ceil(total / 2)) {
        openQuiz();
      }
    }

    function openQuiz() {
      if (quizShownThisLevel || remaining === 0) return;
      quizShownThisLevel = true;
      quizOpen = true;
      playing = false;
      const question = quizQuestions[(level - 1) % quizQuestions.length];
      ctx.ui.hud.text("quiz", "Blue crab quiz: " + question.question);
      quizUi.layout(question.choices, width, height);
      quizToolbar = ctx.ui.toolbar(question.choices.map((choice, index) => ({
        id: "answer-" + index,
        label: choice,
        icon: "🦀"
      })), { onSelect: answerQuiz });
      quizToolbar.hide();
      ctx.ui.banner("Blue crab quiz! Choose an answer.", { seconds: 2.5 });
    }

    function answerQuiz(id) {
      if (!quizOpen) return;
      const question = quizQuestions[(level - 1) % quizQuestions.length];
      const choice = Number(id.slice("answer-".length));
      quizOpen = false;
      quizLayer.visible = false;
      quizCards.forEach(card => { card.view.visible = false; });
      if (quizToolbar) {
        quizToolbar.remove();
        quizToolbar = null;
      }
      ctx.ui.hud.text("quiz", null);
      if (choice === question.answer) {
        score += 20;
        shells += 20 + boostLevels.shells * 10;
        hud();
        ctx.ui.banner("Correct! " + question.fact, { seconds: 2.5 });
        ctx.sfx.play("pickup.metal_clink_02", { volume: 0.6 });
        playing = true;
      } else {
        ctx.ui.banner("Wrong answer! A huge sharp-toothed catfish lunges out!", { seconds: 2.5 });
        ctx.fx.shake(0.55); ctx.fx.flash();
        ctx.sfx.play("water.splash_10", { volume: 0.7 });
        catfishPopup = CATFISH_POPUP_SECONDS;
        catfish.visible = true;
        playing = false;
      }
    }

    function openShop() {
      transition = 0;
      playing = false;
      shopOpen = true;
      ctx.ui.hud.timer(null);
      ctx.ui.hud.text("shop", boostStatus());
      ctx.ui.banner("Reef cleared! Choose your boosts, then continue.", { seconds: 4 });
      boostShop.open();
    }

    function finish() {
      if (!shopOpen) return;
      shopOpen = false;
      boostShop.remove();
      ctx.ui.hud.text("shop", null);
      if (level === LEVEL_COUNT) {
        ctx.music.stop({ fade: 1 });
        ctx.sfx.play("jingle.fanfare_01");
        ctx.emit("win");
        showEnd("All 10 reef challenges are clean!");
        ctx.ui.win({ score, stars: 3 });
      } else {
        level++;
        startLevel();
        playing = true;
      }
    }

    function update(dt) {
      elapsed += dt;
      if (catfishPopup > 0) {
        catfishPopup = Math.max(0, catfishPopup - dt);
        if (catfishPopup === 0) {
          catfish.visible = false;
          playing = true;
        }
      }
      if (transition > 0) {
        transition -= dt;
        if (transition <= 0) openShop();
      }
      if (!playing) return;
      let dx = Number(ctx.input.isDown("right")) - Number(ctx.input.isDown("left"));
      let dy = Number(ctx.input.isDown("down")) - Number(ctx.input.isDown("up"));
      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        const length = Math.hypot(dx, dy);
        const swimSpeed = 205 + boostLevels.speed * 22;
        x = clamp(x + dx / length * swimSpeed * dt, bounds.left, bounds.right);
        y = clamp(y + dy / length * swimSpeed * dt, bounds.top, bounds.bottom);
        if (dx !== 0) crab.scale.x = Math.abs(crab.scale.x) * (dx < 0 ? -1 : 1);
        if (!movingLast) ctx.sfx.play("water.goo_01", { volume: 0.18 });
      }
      movingLast = moving;
      seconds = Math.max(0, seconds - dt);
      ctx.ui.hud.timer(Math.ceil(seconds));
      if (seconds <= 0) {
        playing = false;
        ctx.fx.shake(0.4);
        ctx.sfx.play("water.splash_10", { volume: 0.7 });
        ctx.music.stop({ fade: 1 });
        ctx.emit("lose");
        showEnd("Time is up!");
        ctx.ui.gameOver({ score });
        return;
      }
      for (const item of items) {
        if (item.active && Math.hypot(x - item.x, y - item.y) < 37 + boostLevels.reach * 7) {
          collect(item);
          if (!playing) break;
        }
      }
    }

    function render() {
      crab.position.set(x, y + Math.sin(elapsed * 5) * (playing ? 2 : 0));
      shadow.clear().ellipse(x, y + 26, 23, 7).fill({ color: 0x1e8f9d, alpha: 0.18 });
      bubbles.clear();
      if (playing && movingLast) {
        for (let i = 0; i < 3; i++) {
          const t = (elapsed * 1.5 + i / 3) % 1;
          bubbles.circle(x - 13 + i * 12, y + 21 + t * 18, 2 + t * 3)
            .stroke({ color: 0xffffff, width: 1.5, alpha: 1 - t });
        }
      }
      items.forEach((item, i) => {
        if (item.active) item.view.y = item.y + Math.sin(elapsed * 2.5 + i) * 3;
      });
      if (catfishPopup > 0) {
        const popIn = Math.min(1, (CATFISH_POPUP_SECONDS - catfishPopup) / 0.22);
        const easedPop = 1 - Math.pow(1 - popIn, 3);
        catfish.visible = true;
        catfish.position.set(width * 0.45, height * 0.48 + Math.sin(elapsed * 7) * 4);
        catfish.scale.set(catfishFit * easedPop * (1 + Math.sin(Math.PI * popIn) * 0.24));
        catfish.rotation = Math.sin(elapsed * 6) * 0.008;
      } else {
        catfish.visible = false;
      }
    }

    resize(ctx.size);
    ctx.ui.title({ title: "Blue Crab Reef Rescue", subtitle: "Trash in the ocean can hurt or kill blue crabs. Don't litter—help keep their ocean clean as you collect trash!" })
      .then(() => reset());
    return { update, render, reset, onResize: resize };
  } });
})();
