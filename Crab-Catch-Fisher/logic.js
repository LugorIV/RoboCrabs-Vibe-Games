(function () {
  Game2DCore.mount({ hud: "custom", createGame(ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "lilita-one", body: "nunito", hud: "bar", lives: "bar", title: "ribbon", pause: "bottom-right" });
    ctx.input.setControls({ controls: [
      { id: "left", label: "Move left", keys: ["ArrowLeft", "KeyA"] },
      { id: "right", label: "Move right", keys: ["ArrowRight", "KeyD"] },
      { id: "cast", label: "Cast", keys: ["Space"] },
      { id: "keep", label: "Keep", keys: ["KeyK"] },
      { id: "release", label: "Put Back", keys: ["KeyR"] }
    ] });
    const bg = ctx.assets.background("sunny-crab-pier", { fit: "cover" });
    const world = ctx.layers.world;
    const sea = new PIXI.Graphics();
    const pier = new PIXI.Graphics();
    const questionPanel = new PIXI.Graphics();
    const questionLabel = new PIXI.Text({
      text: "",
      style: {
        fontFamily: ctx.ui.fonts.body,
        fontSize: 16,
        fill: 0x123b55,
        align: "center",
        wordWrap: true,
        wordWrapWidth: 300
      }
    });
    const line = new PIXI.Graphics();
    const hook = new PIXI.Graphics();
    const fisher = ctx.assets.sprite("fisher", { size: 112 });
    const rod = ctx.assets.sprite("fishing-rod", { size: 112 });
    const catfish = ctx.assets.sprite("catfish", { size: 360 });
    const corals = Array.from({ length: 14 }, () => ctx.assets.sprite("sea-coral", { size: 92 }));
    const coralTints = [0xff6b8a, 0xff9f68, 0xffd166, 0x7bdff2, 0xb8f26a, 0xc77dff, 0xff7eb6];
    world.addChild(sea, pier, ...corals, questionPanel, questionLabel);
    const crabs = Array.from({ length: 18 }, (_, i) => {
      const isBig = i % 2 === 1;
      const size = isBig ? 112 : 76;
      const view = ctx.assets.sprite("crab-blue", { size });
      world.addChild(view);
      return { view, x: 0, y: 0, vx: 0, active: true, phase: i * 1.7, isBig };
    });
    world.addChild(line, hook, fisher, rod, catfish);
    catfish.visible = false;
    questionPanel.visible = false;
    questionLabel.visible = false;
    let w = 0, h = 0, surface = 0, bottom = 0, anchor = 0;
    let playerX = 0;
    let hookY = 0, mode = "idle", caught = null, score = 0, lossCount = 0, pointsInRow = 0;
    let running = false, elapsed = 0, choice = null, maxHealth = 10, health = 10, scareTime = 0;
    let scareAfter = "idle";
    let spawnTimer = 2.5;
    let quizShown = false;
    let rangeQuizShown = false;
    let babyCrabQuizShown = false;
    let crabCatchCount = 0;
    let crabsSinceQuiz = 0;
    let blueCrabQuestionPending = false;
    let blueCrabQuestionIndex = 0;
    let questionText = "";
    let questionActive = false;
    const isQuestionMode = m => ["question", "habitat-question", "range-question", "baby-crab-question", "blue-crab-question"].includes(m);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function updateCrabTally() {
      ctx.ui.hud.bar("Crabs since quiz", crabsSinceQuiz, 10);
    }
    function resetCrabTally() {
      crabsSinceQuiz = 0;
      updateCrabTally();
    }
    function resetCrab(c, i) {
      c.x = clamp(30 + ((i + 0.5) / crabs.length) * (w - 60), 30, w - 30);
      c.y = surface + 55 + (i % 4) * Math.max(34, (bottom - surface - 100) / 4);
      c.y = clamp(c.y, surface + 48, bottom - 30);
      c.vx = (i % 2 ? -1 : 1) * (38 + i * 5);
      c.active = true;
      c.respawn = 0;
      c.view.scale.set(1);
      c.view.position.set(c.x, c.y);
      c.view.visible = true;
    }
    function spawnCrab() {
      const slot = crabs.findIndex(c => !c.active && !c.view.visible);
      if (slot >= 0) resetCrab(crabs[slot], slot);
    }
    function placeFisher() {
      // Position from the artwork's actual bounds so the shoes rest on the
      // pier top instead of bobbing around an arbitrary sprite center.
      const bounds = fisher.getLocalBounds();
      const groundY = surface - 15;
      fisher.position.set(
        playerX - (bounds.x + bounds.width / 2),
        groundY - (bounds.y + bounds.height)
      );
    }
    function layout() {
      w = ctx.size.width; h = ctx.size.height;
      surface = clamp(h * 0.37, 150, h * 0.48);
      bottom = h - Math.max(104, h * 0.15);
      const pierRight = w * 0.43;
      if (!playerX) playerX = clamp(w * 0.52 - 145, 50, Math.max(50, pierRight - 50));
      playerX = clamp(playerX, 50, Math.max(50, pierRight - 50));
      anchor = playerX + 145;
      // Keep the swimming area as uninterrupted water so the pier remains the only deck surface.
      sea.clear().rect(0, surface, w, h - surface).fill(0x21c9cf);
      sea.rect(0, bottom + 20, w, h - bottom).fill({ color: 0xf5d38e, alpha: 0.78 });
      pier.clear().roundRect(0, surface - 15, w * 0.43, 24, 7).fill(0xc3834c).stroke({ color: 0x754d3e, width: 3 });
      pier.rect(w * 0.1, surface + 7, 15, Math.min(88, bottom - surface)).fill(0x956744);
      corals.forEach((coral, i) => {
        const spread = corals.length - 1;
        coral.position.set(w * (0.035 + (i / spread) * 0.93), bottom - 18);
        coral.scale.set(i % 3 === 1 ? 0.78 : i % 3 === 2 ? 0.92 : 1);
        coral.tint = coralTints[i % coralTints.length];
      });
      const panelWidth = Math.min(w - 24, 560);
      questionLabel.style.wordWrapWidth = panelWidth - 28;
      questionLabel.position.set((w - panelWidth) / 2 + 14, 72);
      const panelHeight = Math.max(56, questionLabel.height + 24);
      questionPanel.clear().roundRect((w - panelWidth) / 2, 60, panelWidth, panelHeight, 12)
        .fill(0xfff7d6).stroke({ color: 0x9b623e, width: 3 });
      questionPanel.visible = questionActive;
      questionLabel.visible = questionActive;
      placeFisher();
      rod.position.set(anchor - 65, surface - 75);
      catfish.position.set(w * 0.56, surface + Math.min(150, (bottom - surface) * 0.48));
      if (mode === "idle") hookY = surface + 14;
      crabs.forEach((c, i) => {
        c.y = clamp(c.y || surface + 65, surface + 42, bottom - 25);
        c.x = clamp(30 + ((i + 0.5) / crabs.length) * (w - 60), 30, w - 30);
      });
    }
    function drawHook() {
      line.clear().moveTo(anchor, surface - 53).lineTo(anchor, hookY).stroke({ color: 0x324f65, width: 2 });
      hook.clear().moveTo(anchor, hookY - 2).lineTo(anchor, hookY + 12)
        .bezierCurveTo(anchor + 13, hookY + 19, anchor + 15, hookY + 5, anchor + 9, hookY + 5)
        .stroke({ color: 0xe9f9fa, width: 4 });
    }
    function startRound() {
      playerX = clamp(w * 0.52 - 145, 50, Math.max(50, w * 0.43 - 50));
      anchor = playerX + 145;
      score = 0; lossCount = 0; health = maxHealth; pointsInRow = 0; elapsed = 0; spawnTimer = 2.5;
      quizShown = false;
      rangeQuizShown = false;
      babyCrabQuizShown = false;
      crabCatchCount = 0;
      crabsSinceQuiz = 0;
      blueCrabQuestionPending = false;
      blueCrabQuestionIndex = 0;
      questionActive = false;
      mode = "idle"; caught = null; scareTime = 0; scareAfter = "idle"; running = true;
      catfish.visible = false; catfish.scale.set(1);
      questionPanel.visible = false;
      questionLabel.visible = false;
      if (choice) { choice.remove(); choice = null; }
      crabs.forEach(c => { c.active = false; c.view.visible = false; c.respawn = 0; });
      crabs.slice(0, 16).forEach((c, i) => resetCrab(c, i));
      hookY = surface + 14;
      ctx.ui.hud.score(0); ctx.ui.hud.lives(health, maxHealth); ctx.ui.hud.combo(0);
      updateCrabTally();
      ctx.music.play("music.ukulele_song");
      ctx.sfx.play("jingle.ready_go_synth_02");
    }
    function cast() {
      if (!running || mode !== "idle") return;
      mode = "down";
      ctx.sfx.play("water.plop_01");
    }
    function showCrabActions() {
      mode = "choice";
      choice = ctx.ui.toolbar([
        { id: "keep", label: "Keep Crab", picture: ctx.assets.pictureUrl("crab-blue") },
        { id: "release", label: "Put Back", icon: "💧" }
      ], { onSelect: choose });
    }
    function askQuestion(text) {
      questionText = text;
      questionLabel.text = text;
      questionActive = true;
      questionPanel.visible = true;
      questionLabel.visible = true;
      layout();
    }
    function answerCatfish(answer) {
      if (mode !== "question" || !caught) return;
      resetCrabTally();
      if (choice) { choice.remove(); choice = null; }
      questionActive = false;
      if (answer === "catfish-yes") {
        ctx.ui.banner("Yes! Some catfish eat crabs.");
        ctx.ui.popup("Correct!", anchor, surface + 42);
        ctx.sfx.play("pickup.soft_chime_03");
        health = maxHealth;
        ctx.ui.hud.lives(health, maxHealth);
        showCrabActions();
      } else {
        health = Math.max(0, health - 6);
        ctx.ui.hud.lives(health, maxHealth);
        ctx.ui.banner("Not quite! The right answer is: Yes, sometimes.");
        ctx.sfx.play("water.bubble_01");
        showCrabActions();
      }
    }
    function grab(c) {
      caught = c; c.active = false;
      crabCatchCount += 1;
      if (crabCatchCount % 2 === 0) blueCrabQuestionPending = true;
      c.view.position.set(anchor, surface + 37);
      c.view.scale.set(c.isBig ? 1.35 : 1);
      ctx.sfx.play("pickup.soft_chime_03");
      if (!c.isBig) {
        mode = "question";
        askQuestion("Baby crab! Can a catfish eat crabs?");
        choice = ctx.ui.toolbar([
          { id: "catfish-yes", label: "Yes, sometimes" },
          { id: "catfish-no", label: "No, never" },
          { id: "catfish-plants", label: "Only sea plants" },
          { id: "catfish-air", label: "Only air bubbles" }
        ], { onSelect: answerCatfish });
        return;
      }
      ctx.ui.banner("Big blue crab");
      showCrabActions();
    }
    function crabPoints(c, action) {
      if (!c.isBig && action === "release") return 10;
      // Keeping a small crab still costs a life.
      if (!c.isBig) return -3;
      // Keeping a big blue crab earns points, but releasing one is harmless.
      if (action === "keep") return 4;
      if (action === "release") return 0;
      return null;
    }
    function showBlueCrabQuiz() {
      const question = window.BLUE_CRAB_QUESTIONS[blueCrabQuestionIndex % window.BLUE_CRAB_QUESTIONS.length];
      blueCrabQuestionIndex += 1;
      mode = "blue-crab-question";
      askQuestion(question.text);
      choice = ctx.ui.toolbar(question.answers, { onSelect: answerBlueCrabQuiz });
      showBlueCrabQuiz.current = question;
    }
    function answerBlueCrabQuiz(answer) {
      if (mode !== "blue-crab-question") return;
      resetCrabTally();
      const question = showBlueCrabQuiz.current;
      if (choice) { choice.remove(); choice = null; }
      questionActive = false;
      mode = "idle";
      if (question && answer === question.correct) {
        score += 3; pointsInRow += 1;
        ctx.ui.hud.score(score); ctx.ui.hud.combo(pointsInRow);
        ctx.ui.banner(question.right); ctx.ui.popup("+3", anchor, surface + 42);
        ctx.sfx.play("pickup.soft_chime_03");
      } else {
        pointsInRow = 0; ctx.ui.hud.combo(0);
        const rightAnswer = question && question.answers.find(item => item.id === question.correct);
        ctx.ui.banner(`Not quite! The right answer is: ${rightAnswer ? rightAnswer.label : question.right}`);
        ctx.sfx.play("water.bubble_01");
      }
    }
    function showHabitatQuiz() {
      quizShown = true;
      mode = "habitat-question";
      askQuestion("True or false: Crabs eat crabs.");
      choice = ctx.ui.toolbar([
        { id: "crabs-true", label: "True" },
        { id: "crabs-false", label: "False" },
        { id: "crabs-sometimes", label: "Only in winter" },
        { id: "crabs-never", label: "Only when flying" }
      ], { onSelect: answerHabitat });
    }
    function answerHabitat(answer) {
      if (mode !== "habitat-question") return;
      resetCrabTally();
      if (choice) { choice.remove(); choice = null; }
      questionActive = false;
      mode = "idle";
      if (answer === "crabs-true") {
        score += 3;
        pointsInRow += 1;
        health = maxHealth;
        ctx.ui.hud.score(score);
        ctx.ui.hud.lives(health, maxHealth);
        ctx.ui.hud.combo(pointsInRow);
        ctx.ui.banner("Correct! Crabs sometimes eat other crabs.");
        ctx.ui.popup("+3", anchor, surface + 42);
        ctx.sfx.play("pickup.soft_chime_03");
        showBabyCrabQuizAt40();
      } else {
        pointsInRow = 0;
        ctx.ui.hud.combo(0);
        scareAfter = "idle";
        mode = "scare";
        scareTime = 1.15;
        health = Math.max(0, health - 6);
        ctx.ui.hud.lives(health, maxHealth);
        catfish.visible = true;
        catfish.scale.set(0.18);
        ctx.ui.banner("Wrong answer! The right answer is: True. SURPRISE CATFISH!");
        ctx.fx.shake(0.55);
        ctx.fx.flash();
        ctx.sfx.play("creature.screech_01", { volume: 0.8 });
      }
    }
    function showRangeQuizAt20() {
      if (rangeQuizShown || score < 20) return false;
      rangeQuizShown = true;
      mode = "range-question";
      askQuestion("Where are blue crabs native to?");
      choice = ctx.ui.toolbar([
        { id: "range-western-atlantic", label: "Western Atlantic" },
        { id: "range-eastern-pacific", label: "Eastern Pacific" },
        { id: "range-indian", label: "Indian Ocean" },
        { id: "range-arctic", label: "Arctic Ocean" }
      ], { onSelect: answerRangeQuiz });
      return true;
    }
    function answerRangeQuiz(answer) {
      if (mode !== "range-question") return;
      resetCrabTally();
      if (choice) { choice.remove(); choice = null; }
      questionActive = false;
      if (answer === "range-western-atlantic") {
        mode = "idle";
        score += 3;
        pointsInRow += 1;
        ctx.ui.hud.score(score);
        ctx.ui.hud.combo(pointsInRow);
        ctx.ui.banner("Correct! They range from Nova Scotia to Argentina.");
        ctx.ui.popup("+3", anchor, surface + 42);
        ctx.sfx.play("pickup.soft_chime_03");
      } else {
        // The catfish scare belongs only to the 10-point habitat question.
        mode = "idle";
        pointsInRow = 0;
        ctx.ui.hud.combo(0);
        health = Math.max(0, health - 6);
        ctx.ui.hud.lives(health, maxHealth);
        ctx.ui.banner("Not quite! The right answer is: Western Atlantic.");
        ctx.sfx.play("water.bubble_01");
      }
    }
    function showBabyCrabQuizAt40() {
      if (babyCrabQuizShown || score < 40) return false;
      babyCrabQuizShown = true;
      mode = "baby-crab-question";
      askQuestion("Which sea animal often eats baby crabs?");
      choice = ctx.ui.toolbar([
        { id: "baby-crabs-fish", label: "Bigger blue crabs" },
        { id: "baby-crabs-seaweed", label: "Seaweed" },
        { id: "baby-crabs-sunlight", label: "Sunlight" },
        { id: "baby-crabs-shells", label: "Empty shells" }
      ], { onSelect: answerBabyCrabQuiz });
      return true;
    }
    function answerBabyCrabQuiz(answer) {
      if (mode !== "baby-crab-question") return;
      resetCrabTally();
      if (choice) { choice.remove(); choice = null; }
      questionActive = false;
      mode = "idle";
      if (answer === "baby-crabs-fish") {
        score += 3;
        pointsInRow += 1;
        ctx.ui.hud.score(score);
        ctx.ui.hud.combo(pointsInRow);
        ctx.ui.banner("Correct! Many bigger fish eat baby crabs.");
        ctx.ui.popup("+3", anchor, surface + 42);
        ctx.sfx.play("pickup.soft_chime_03");
      } else {
        pointsInRow = 0;
        ctx.ui.hud.combo(0);
        ctx.ui.banner("Not quite! The right answer is: Bigger blue crabs.");
        ctx.sfx.play("water.bubble_01");
      }
    }
    function choose(action) {
      if (mode !== "choice" || !caught) return;
      const c = caught;
      const previousScore = score;
      const points = crabPoints(c, action);
      if (points === null) return;
      crabsSinceQuiz = Math.min(10, crabsSinceQuiz + 1);
      updateCrabTally();
      if (points !== 0) {
        score += points;
        ctx.ui.hud.score(score);
      }
      if (action === "keep" && !c.isBig) {
        lossCount += 1;
        health = Math.max(0, health - 1);
        pointsInRow = 0;
        ctx.ui.hud.lives(health, maxHealth);
        ctx.ui.hud.combo(0);
        ctx.sfx.play("water.bubble_01");
        c.view.visible = false;
        c.respawn = 0;
        if (health <= 0) {
          lose();
          return;
        }
            } else {
              if (points > 0) {
                pointsInRow += 1;
                ctx.ui.hud.combo(pointsInRow);
              }
              if (action === "keep" && c.isBig) {
                ctx.ui.banner("Kept the big blue crab!");
                ctx.ui.popup("+4", anchor, surface + 42);
              } else if (action === "release" && c.isBig) {
                // Releasing a big blue crab shows the prompt, but changes neither
                // the score nor the ongoing round.
                ctx.ui.banner("You do not want to eat it?");
              } else {
                ctx.ui.popup("Good job!", anchor, surface + 42);
              }
              ctx.sfx.play(action === "keep" ? "pickup.soft_chime_03" : "water.plop_02");
        c.active = false;
        c.x = anchor; c.y = clamp(surface + 80, surface + 45, bottom - 25);
        c.view.scale.set(1);
        c.view.visible = false;
      }
      caught = null; mode = "idle"; hookY = surface + 14;
      if (choice) { choice.remove(); choice = null; }
      if (blueCrabQuestionPending) {
        blueCrabQuestionPending = false;
        showBlueCrabQuiz();
        return;
      }
      if (!showBabyCrabQuizAt40() && !showRangeQuizAt20() && !quizShown && previousScore < 10 && score >= 10 && score <= 20) {
        showHabitatQuiz();
      }
    }
    function finish() {
      running = false; mode = "done";
      if (choice) { choice.remove(); choice = null; }
      ctx.music.stop({ fade: 1 });
      ctx.sfx.play("jingle.levelup_pizzicato_14");
      ctx.fx.flash();
      ctx.emit("win");
      ctx.ui.win({ score });
    }
    function lose() {
      running = false; mode = "done";
      questionActive = false;
      caught = null; scareTime = 0;
      catfish.visible = false;
      questionPanel.visible = false;
      questionLabel.visible = false;
      if (choice) { choice.remove(); choice = null; }
      ctx.music.stop({ fade: 1 });
      ctx.fx.shake(0.5);
      ctx.emit("lose");
      ctx.ui.gameOver({ score });
    }
    function update(dt) {
      if (!running) return;
      elapsed += dt;
      if (!isQuestionMode(mode) && mode !== "choice" && mode !== "scare") {
        const steer = (ctx.input.isDown("right") ? 1 : 0) - (ctx.input.isDown("left") ? 1 : 0);
        if (steer !== 0) {
          playerX += steer * 220 * dt;
          playerX = clamp(playerX, 50, Math.max(50, w * 0.43 - 50));
          anchor = playerX + 145;
        }
      }
      // Keep the question card visible until an answer handler clears it.
      questionPanel.visible = questionActive;
      questionLabel.visible = questionActive;
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnCrab();
        spawnTimer += 2.5;
      }
      if (mode === "scare") {
        scareTime -= dt;
        const progress = clamp(1 - scareTime / 1.15, 0, 1);
        const pop = progress < 0.28 ? progress / 0.28 : 1;
        catfish.scale.set(0.18 + pop * 1.45);
        catfish.rotation = Math.sin((1.15 - scareTime) * 28) * 0.05;
        if (scareTime <= 0) {
          catfish.visible = false;
          catfish.rotation = 0;
          if (scareAfter === "choice" && caught) showCrabActions();
          else mode = "idle";
          scareAfter = "idle";
        }
        return;
      }
      if (ctx.input.pressed("keep")) choose("keep");
      if (ctx.input.pressed("release")) choose("release");
      if (mode === "choice") return;
      if (health <= 0) { lose(); return; }
      if (ctx.input.pressed("cast")) cast();
      if (mode === "down") {
        hookY += 340 * dt;
        if (hookY >= bottom) { hookY = bottom; mode = "up"; ctx.sfx.play("machine.click_01"); }
      } else if (mode === "up") {
        hookY -= 190 * dt;
        for (const c of crabs) {
          // Match the catch zone to the crab's actual size so small crabs stay
          // precise while big crabs are not unfairly hard to hook.
          const halfWidth = c.isBig ? 48 : 30;
          const halfHeight = c.isBig ? 34 : 24;
          if (c.active && Math.abs(c.x - anchor) < halfWidth && Math.abs(c.y - hookY) < halfHeight) {
            grab(c); break;
          }
        }
        if (mode === "up" && hookY <= surface + 14) { mode = "idle"; hookY = surface + 14; }
      }
      for (let i = 0; i < crabs.length; i++) {
        const c = crabs[i];
        if (!c.active) continue;
        c.x += c.vx * dt;
        if (c.x < 28 || c.x > w - 28) { c.x = clamp(c.x, 28, w - 28); c.vx *= -1; }
        c.view.position.set(c.x, c.y + Math.sin(elapsed * 2 + c.phase) * 5);
        c.view.scale.x = c.vx > 0 ? 1 : -1;
        c.view.scale.y = 1;
      }
      // Keep the fisher's feet locked to the pier while movement still shifts
      // the whole person naturally from side to side.
      placeFisher();
      rod.x = anchor - 65;
      rod.y = surface - 75;
      rod.rotation = mode === "down" ? 0.13 : mode === "up" ? -0.09 : 0;
    }
    layout();
    crabs.forEach(resetCrab);
    ctx.ui.title({ title: "Crab Catch Pier", subtitle: "Directions: keep the big crabs, and put baby crabs back in the water." }).then(() => startRound());
    return { update, render: drawHook, reset: startRound, onResize: layout };
  } });
})();
