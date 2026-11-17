(function () {
  window.createCrabFactDisplay = function (ctx) {
    const panel = new PIXI.Container();
    const background = new PIXI.Graphics();
    const factText = new PIXI.Text({
      text: "",
      style: {
        fontFamily: ctx.ui.fonts.body,
        fontSize: 18,
        fontWeight: "700",
        fill: "#173e52",
        align: "center",
        wordWrap: true,
        wordWrapWidth: 300,
        breakWords: true,
        lineHeight: 24
      }
    });
    const backButton = new PIXI.Graphics();
    const backLabel = new PIXI.Text({ text: "Back to Reef", style: {
      fontFamily: ctx.ui.fonts.display,
      fontSize: 18,
      fontWeight: "bold",
      fill: "#ffffff",
      align: "center"
    } });
    backLabel.anchor.set(0.5);
    const crabA = ctx.assets.sprite("overhead-crab-tower", { size: 38 });
    const crabB = ctx.assets.sprite("overhead-crab-tower", { size: 38 });
    panel.addChild(background, crabA, crabB, factText, backButton, backLabel);
    ctx.layers.world.addChild(panel);
    panel.visible = false;
    crabA.visible = false;
    crabB.visible = false;

    const facts = [
      "A female blue crab can carry as many as 8 million eggs in one brood.",
      "Blue crabs swim using paddle-shaped back legs.",
      "A crab grows by shedding its hard shell and making a bigger one.",
      "Some crabs can regrow a lost leg after several molts.",
      "Blue crabs use their claws to catch food and defend themselves.",
      "Many crabs hide under sand, rocks, or sea grass to stay safe.",
      "Crabs have eyes on stalks that can look around in many directions."
    ];
    let shuffledFacts = [];
    let previousFact = "";
    let message = "";
    let cardWidth = 0;
    let iconY = 0;
    let buttonY = 0;
    let buttonWidth = 0;
    let feastTime = 0;

    function nextFact() {
      if (shuffledFacts.length === 0) {
        shuffledFacts = facts.slice();
        for (let i = shuffledFacts.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledFacts[i], shuffledFacts[j]] = [shuffledFacts[j], shuffledFacts[i]];
        }
        if (shuffledFacts.length > 1 && shuffledFacts[shuffledFacts.length - 1] === previousFact) {
          [shuffledFacts[0], shuffledFacts[shuffledFacts.length - 1]] =
            [shuffledFacts[shuffledFacts.length - 1], shuffledFacts[0]];
        }
      }
      previousFact = shuffledFacts.pop();
      return previousFact;
    }

    function layout(size) {
      cardWidth = Math.min(size.width - 24, 440);
      factText.style.wordWrapWidth = Math.max(160, cardWidth - 28);
      factText.text = message;
      factText.position.set(14, 12);
      iconY = factText.height + 22;
      buttonY = iconY + 48;
      buttonWidth = Math.min(220, cardWidth - 32);
      const buttonX = (cardWidth - buttonWidth) / 2;
      const cardHeight = buttonY + 60;
      background.clear();
      background.rect(0, 0, cardWidth, cardHeight)
        .fill(0xfff8df)
        .stroke({ width: 4, color: 0x14879a });
      backButton.clear();
      backButton.roundRect(buttonX, buttonY, buttonWidth, 48, 12)
        .fill(0x13889a)
        .stroke({ width: 3, color: 0x0d6577 });
      backLabel.position.set(cardWidth / 2, buttonY + 24);
      const centerX = cardWidth / 2;
      const progress = Math.min(1, feastTime / 0.7);
      crabA.position.set(centerX - 42 + progress * 28, iconY + 18);
      crabB.position.set(centerX + 42 - progress * 28, iconY + 18);
      const y = Math.max(8, Math.min((size.height - cardHeight) / 2, size.height - cardHeight - 72));
      panel.position.set((size.width - cardWidth) / 2, y);
    }

    function show(wave) {
      message = `Wave ${wave} complete!\n\nBlue-crab fact: ${nextFact()}`;
      panel.visible = true;
      crabA.visible = true;
      crabB.visible = true;
      feastTime = 0;
      layout(ctx.size);
    }

    function hide() {
      panel.visible = false;
      crabA.visible = false;
      crabB.visible = false;
      message = "";
      feastTime = 0;
    }

    function handlePointer(x, y) {
      if (!panel.visible) return false;
      const localX = x - panel.x;
      const localY = y - panel.y;
      const buttonLeft = (cardWidth - buttonWidth) / 2;
      if (localX >= buttonLeft && localX <= buttonLeft + buttonWidth &&
          localY >= buttonY && localY <= buttonY + 48) {
        hide();
      }
      return true;
    }

    function update(dt) {
      if (!panel.visible || feastTime >= 1.3) return;
      feastTime += dt;
      const progress = Math.min(1, feastTime / 0.7);
      const centerX = cardWidth / 2;
      crabA.position.set(centerX - 42 + progress * 28, iconY + 18);
      crabB.position.set(centerX + 42 - progress * 28, iconY + 18);
      if (feastTime >= 0.7) crabB.visible = false;
      crabA.scale.set(1 + Math.sin(feastTime * 18) * 0.08);
      if (feastTime >= 1.3) crabA.visible = false;
    }

    return { show, hide, update, layout, handlePointer };
  };

  window.createReefQuiz = function (ctx, onItems, onWrong = () => {}, onFastQuiz = () => {}) {
    const panel = new PIXI.Container();
    const background = new PIXI.Graphics();
    const heading = new PIXI.Text({ text: "REEF QUIZ", style: {
      fontFamily: ctx.ui.fonts.display, fontSize: 22, fontWeight: "bold", fill: "#b64236"
    } });
    const questionText = new PIXI.Text({ text: "", style: {
      fontFamily: ctx.ui.fonts.body, fontSize: 21, fontWeight: "700", fill: "#173e52",
      wordWrap: true, breakWords: true, lineHeight: 27
    } });
    const feedback = new PIXI.Text({ text: "", style: {
      fontFamily: ctx.ui.fonts.body, fontSize: 17, fontWeight: "700", fill: "#176b70",
      wordWrap: true, breakWords: true, lineHeight: 22
    } });
    panel.addChild(background, heading, questionText, feedback);
    ctx.layers.ui.addChild(panel);
    panel.visible = false;

    const questions = [
      { text: "Which legs help a blue crab swim?", answers: [["Claws", false], ["Paddle-shaped back legs", true], ["Front legs", false]] },
      { text: "How does a crab make room to grow?", answers: [["It sheds its old shell", true], ["It grows a new claw", false], ["It changes color", false]] },
      { text: "Where are a crab's eyes?", answers: [["On its tail", false], ["Under its shell", false], ["On eye stalks", true]] },
      { text: "What can a crab use its claws for?", answers: [["Catching food and defense", true], ["Flying", false], ["Making bubbles", false]] },
      { text: "What can help a crab stay hidden?", answers: [["Bright sunlight", false], ["Sand, rocks, or sea grass", true], ["Open water", false]] }
    ];
    let active = false;
    let stage = "answer";
    let deck = [];
    let index = 0;
    let score = 0;
    let missedQuestion = false;
    let options = [];
    let correctId = "";
    let correctAnswer = "";
    let cardWidth = 0;
    let questionStartedAt = 0;
    let allAnswersFast = true;
    let scareElapsed = 0;
    let scareDuration = 2.1;
    let scareImpactPlayed = false;
    let scareSecondLungePlayed = false;
    let sharkBaseScale = 1;
    const scareOverlay = new PIXI.Container();
    const scareBackdrop = new PIXI.Graphics();
    const scareFlash = new PIXI.Graphics();
    const scareTitlePanel = new PIXI.Graphics();
    const shark = ctx.assets.sprite("quiz-jumpscare-shark", { size: 340 });
    const scareTitle = new PIXI.Text({ text: "SHARK ATTACK!", style: {
      fontFamily: ctx.ui.fonts.display, fontSize: 28, fontWeight: "bold", fill: "#ffffff",
      align: "center"
    } });
    scareTitle.anchor.set(0.5);
    scareOverlay.addChild(scareBackdrop, scareFlash, shark, scareTitlePanel, scareTitle);
    ctx.layers.ui.addChild(scareOverlay);
    scareOverlay.visible = false;

    function layoutScare(size) {
      scareBackdrop.clear();
      scareBackdrop.rect(0, 0, size.width, size.height).fill(0x061521);
      scareFlash.clear();
      scareFlash.rect(0, 0, size.width, size.height).fill(0xd91d3b);
      scareFlash.alpha = 0;
      sharkBaseScale = Math.max(0.6, Math.min(3.2, (size.width * 0.98) / 280, (size.height * 0.72) / 190));
      shark.scale.set(sharkBaseScale);
      shark.position.set(size.width * 0.4, size.height * 0.53);
      const titleWidth = Math.min(260, size.width - 32);
      const titleY = Math.max(18, size.height * 0.09);
      scareTitlePanel.clear();
      scareTitlePanel.roundRect((size.width - titleWidth) / 2, titleY, titleWidth, 58, 14)
        .fill(0x8f1730).stroke({ width: 4, color: 0xff4d64 });
      scareTitle.position.set(size.width / 2, titleY + 29);
    }

    function hideSharkScare() {
      scareOverlay.visible = false;
      scareElapsed = 0;
      scareImpactPlayed = scareSecondLungePlayed = false;
      scareFlash.alpha = 0;
      shark.rotation = 0;
      shark.scale.set(sharkBaseScale);
    }

    function showSharkScare() {
      layoutScare(ctx.size);
      scareOverlay.visible = true;
      scareElapsed = 0;
      scareImpactPlayed = scareSecondLungePlayed = false;
      shark.position.set(ctx.size.width + 170 * sharkBaseScale, ctx.size.height * 0.53);
      shark.scale.set(sharkBaseScale * 0.34);
      shark.rotation = -0.14;
      scareFlash.alpha = 0.94;
      ctx.fx.shake(0.8);
      ctx.fx.flash();
      ctx.sfx.play("creature.roar_05", { volume: 0.9, pitch: 0.82 });
    }

    function updateScare(dt) {
      if (!scareOverlay.visible) return;
      scareElapsed += dt;
      const size = ctx.size;
      const centerX = size.width * 0.4;
      const centerY = size.height * 0.53;
      const approach = Math.min(1, scareElapsed / 0.42);
      const ease = 1 - Math.pow(1 - approach, 3);
      const startX = size.width + 170 * sharkBaseScale;
      if (scareElapsed <= 0.42) {
        shark.position.set(startX + (centerX - startX) * ease, centerY);
        shark.scale.set(sharkBaseScale * (0.34 + 0.96 * ease));
        shark.rotation = -0.14 * (1 - ease);
      } else {
        const secondLunge = Math.max(0, 1 - Math.abs(scareElapsed - 1.12) / 0.15);
        shark.position.set(centerX - secondLunge * size.width * 0.035,
          centerY + Math.sin(scareElapsed * 10) * size.height * 0.008);
        shark.scale.set(sharkBaseScale * (1.3 + secondLunge * 0.08 + Math.sin(scareElapsed * 15) * 0.025));
        shark.rotation = Math.sin(scareElapsed * 13) * 0.025 - secondLunge * 0.025;
      }
      scareFlash.alpha = Math.max(0, 0.94 * (1 - scareElapsed / 0.18));
      if (!scareImpactPlayed && scareElapsed >= 0.3) {
        scareImpactPlayed = true;
        ctx.sfx.play("impact.hit_03", { volume: 0.95 });
        ctx.fx.shake(0.58);
      }
      if (!scareSecondLungePlayed && scareElapsed >= 0.97) {
        scareSecondLungePlayed = true;
        ctx.fx.shake(0.34);
      }
      if (scareElapsed >= scareDuration) hideSharkScare();
    }

    function shuffle(list) {
      const result = list.slice();
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }

    function layout(size) {
      cardWidth = Math.max(180, Math.min(size.width - 24, 480));
      const textWidth = Math.max(150, cardWidth - 32);
      questionText.style.wordWrapWidth = textWidth;
      feedback.style.wordWrapWidth = textWidth;
      heading.position.set(16, 14);
      questionText.position.set(16, 55);
      feedback.position.set(16, 166);
      background.clear();
      background.rect(0, 0, cardWidth, 244).fill(0xfff8df)
        .stroke({ width: 4, color: 0x14879a });
      panel.position.set((size.width - cardWidth) / 2, Math.max(8, (size.height - 244) / 2 - 20));
      layoutScare(size);
    }

    function askQuestion() {
      const item = deck[index];
      const shuffledAnswers = shuffle(item.answers);
      correctId = "";
      correctAnswer = "";
      options = shuffledAnswers.map((answer, i) => {
        const id = "answer-" + i;
        if (answer[1]) { correctId = id; correctAnswer = answer[0]; }
        return { id, label: answer[0], icon: ["A", "B", "C"][i] };
      });
      stage = "answer";
      heading.text = "CRAB QUIZ - " + (index + 1) + " / 5";
      questionText.text = item.text;
      feedback.text = "Answer each question within 5 seconds for a crab badge!";
      questionStartedAt = Date.now();
      onItems(options);
    }

    function show() {
      hideSharkScare();
      active = true;
      stage = "answer";
      deck = shuffle(questions);
      index = 0;
      score = 0;
      allAnswersFast = true;
      panel.visible = true;
      layout(ctx.size);
      askQuestion();
    }

    function answer(id) {
      if (stage !== "answer") return;
      const picked = options.find((choice) => choice.id === id);
      if (!picked) return;
      const answeredFast = Date.now() - questionStartedAt <= 5000;
      if (!answeredFast) allAnswersFast = false;
      const speedNote = answeredFast ? " Fast answer!" : " Over 5 seconds.";
      if (id === correctId) {
        score++;
        feedback.text = "Correct! " + correctAnswer + " is right." + speedNote;
      } else {
        feedback.text = "Good try! The answer is " + correctAnswer + "." + speedNote;
        missedQuestion = true;
        ctx.ui.banner("MOAB + 15% faster spawns next wave!");
        showSharkScare();
        onWrong();
      }
      stage = "feedback";
      onItems([{ id: "quiz-next", label: index === 4 ? "Finish Quiz" : "Next Question", icon: "OK" }]);
    }

    function next() {
      if (stage !== "feedback") return;
      if (index < 4) {
        index++;
        askQuestion();
        return;
      }
      stage = "complete";
      heading.text = "QUIZ COMPLETE";
      questionText.text = "You got " + score + " out of 5 right!";
      if (allAnswersFast) {
        feedback.text = "All five answers were under 5 seconds! Crab badge earned: +10% tower damage next wave.";
        onFastQuiz();
      } else {
        feedback.text = "The crab badge needs all five answers under 5 seconds. Try again next reef quiz!";
      }
      onItems([{ id: "quiz-return", label: "Back to Reef", icon: "OK" }]);
    }

    function finish() {
      if (stage !== "complete") return;
      active = false;
      hideSharkScare();
      panel.visible = false;
      onItems(null);
    }

    function handle(id) {
      if (!active) return false;
      if (stage === "answer") answer(id);
      else if (stage === "feedback" && id === "quiz-next") next();
      else if (stage === "complete" && id === "quiz-return") finish();
      return true;
    }

    function hide() {
      const wasActive = active;
      active = false;
      hideSharkScare();
      missedQuestion = false;
      panel.visible = false;
      if (wasActive) onItems(null);
    }

    function takeWavePenalty() {
      const missed = missedQuestion;
      missedQuestion = false;
      return missed;
    }

    return { show, hide, layout, update: updateScare, handle, takeWavePenalty, get active() { return active; } };
  };
})();

