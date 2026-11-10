(function () {
  Game3DCore.mount({ hud: "custom", createGame(ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "luckiest-guy", body: "nunito", hud: "corners", lives: "pips", title: "card", pause: "top-left" });
    ctx.look.apply("underwater", { size: 140 });
    ctx.input.setControls({ controls: [
      { id: "left", label: "Lane left", keys: ["ArrowLeft", "KeyA"] },
      { id: "right", label: "Lane right", keys: ["ArrowRight", "KeyD"] },
      { id: "jump", label: "Jump", keys: ["ArrowUp", "KeyW", "Space"] }
    ] });
    const T = ctx.THREE, scene = ctx.scene;
    const mat = (color, type = "toon") => ctx.look.material(type, { color });
    const railMat = mat("#1c8f9b", "metal"), sleeperMat = mat("#7a9b62");
    const groundMat = mat("#2ca6a0", "water"), laneMat = mat("#7bc9a4", "toon");
    const yellow = mat("#ffe78b"), pink = mat("#ff7b9a"), blue = mat("#36b8e1");
    const laneX = [-2.25, 0, 2.25];
    const movingDecor = [], obstacles = [];
    const crabFacts = [
      "Sharks, blue catfish, and some birds eat blue crabs. Blue crabs can also be cannibals: they sometimes eat other blue crabs.",
      "Excess nitrogen and phosphorus runoff can spark heavy algal blooms. When algae die, bacteria break them down and use up oxygen. Low-oxygen dead zones can suffocate crabs and kill bottom-dwelling food sources like clams and worms."
    ];
    const quizBank = [
      { question: "Which fish is named as a blue crab predator?", answers: ["Blue catfish", "Bluegill", "Clownfish"], correct: 0 },
      { question: "What can excess nutrient runoff trigger?", answers: ["Heavy algal blooms", "Stronger tidal currents", "Clearer water"], correct: 0 },
      { question: "Why can dead algae create a dead zone?", answers: ["Bacteria use up oxygen", "Salt levels rise", "Waves stop moving"], correct: 0 }
    ];
    let lane = 1, height = 0, vy = 0, distance = 0, coins = 0;
    let hits = 0, speed = 13, spawnIn = 1.6, playing = false, ended = false;
    let invuln = 0, time = 0, lastSafe = 1, movementShakeIn = 0;
    let nextFactAt = 300, nextQuizAt = 500, factIndex = 0, quizIndex = 0;
    let factActive = false, quizActive = false, quizToolbar = null, runToken = 0, quizzesAnswered = 0;
    function box(w, h, d, material, x, y, z, parent = scene) {
      const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z); parent.add(mesh); return mesh;
    }
    function model(key) {
      return ctx.assets.orientForward(T, ctx.assets.model(key), "+Z");
    }
    // The track runs towards negative Z. Its repeating sleepers and signs scroll towards the crab.
    box(13, .28, 145, groundMat, 0, -.32, -10);
    for (let b = 0; b < 18; b++) {
      const bubble = new T.Mesh(new T.SphereGeometry(.08 + (b % 3) * .035, 10, 8), mat("#b9fff2", "glow"));
      bubble.position.set(-5.5 + (b * 1.37) % 11, 1.2 + (b % 5) * .55, -62 + b * 3.8); scene.add(bubble); movingDecor.push(bubble);
    }
    for (let i = 0; i < 3; i++) {
      const x = laneX[i];
      box(1.93, .13, 145, laneMat, x, -.11, -10);
      for (const side of [-.72, .72]) box(.075, .13, 145, railMat, x + side, .04, -10);
    }
    for (let n = 0; n < 39; n++) {
      const z = -64 + n * 3.4;
      const cluster = new T.Group(); cluster.position.z = z; scene.add(cluster);
      for (const x of laneX) box(1.72, .09, .28, sleeperMat, x, -.015, 0, cluster);
      if (n % 3 === 0) {
        for (const s of [-1, 1]) {
          box(.18, 3.25, .18, blue, s * 5.45, 1.55, 0, cluster);
          box(.85, .58, .14, n % 2 ? yellow : pink, s * 5.45, 2.65, 0, cluster);
        }
      }
      cluster.userData.startZ = z;
      movingDecor.push(cluster);
    }
    const player = model("crab-runner");
    player.position.set(0, 0, 0); player.rotation.y = Math.PI;
    scene.add(player);
    const fish = model("blue-catfish");
    // Keep the chaser in sight without covering the lanes or the runner.
    player.scale.setScalar(.72);
    fish.scale.setScalar(.68); fish.position.set(1.25, 0, 2.6); fish.rotation.y = Math.PI;
    scene.add(fish);
    // A more distant high view keeps the runner visible while revealing hazards sooner.
    ctx.followCamera(player, { view: "high", distance: 17, height: 10 });
    function scoreNow() { return Math.floor(distance) + coins * 25; }
    function refreshHud() {
      ctx.ui.hud.score(scoreNow());
      ctx.ui.hud.lives(3 - hits, 3);
    }
    function showFact() {
      factActive = true;
      const token = runToken;
      const text = crabFacts[factIndex % crabFacts.length];
      factIndex++;
      // The fact card's OK button is the only way back to the run.
      ctx.ui.howToPlay({ title: "Crab Fact!", text }).then(() => {
        if (!factActive || token !== runToken) return;
        factActive = false;
        checkMilestones();
      });
    }
    function askQuiz() {
      quizActive = true;
      const token = runToken;
      const quiz = quizBank[quizIndex % quizBank.length];
      quizIndex++;
      // Shuffle each question's choices so the correct option is not always first.
      const choices = quiz.answers.map((label, index) => ({
        label, correct: index === quiz.correct
      }));
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
      ctx.ui.hud.text("crab-quiz", quiz.question);
      quizToolbar = ctx.ui.toolbar(choices.map((choice, index) => ({
        id: String(index), label: choice.label, icon: ""
      })), {
        onSelect(id) {
          if (!quizActive || token !== runToken) return;
          if (quizToolbar) quizToolbar.remove();
          quizToolbar = null;
          ctx.ui.hud.text("crab-quiz", null);
          if (!choices[Number(id)] || !choices[Number(id)].correct) {
            // A wrong quiz answer ends this run; Play again uses reset() for a fresh run.
            quizActive = false;
            ended = true;
            playing = false;
            ctx.music.stop({ fade: 1 });
            ctx.ui.gameOver({ score: scoreNow() });
            return;
          }
          // Keep the runner stopped after a correct answer until OK is pressed.
          ctx.ui.howToPlay({ title: "Correct!", text: "You got it! Press OK when you're ready to run again." }).then(() => {
            if (!quizActive || token !== runToken) return;
            quizActive = false;
            quizzesAnswered++;
            if (quizzesAnswered >= 3) {
              ended = true; playing = false;
              ctx.music.stop({ fade: 1 });
              ctx.ui.win({ score: scoreNow(), stars: 3 });
            } else {
              checkMilestones();
            }
          });
        }
      });
    }
    function checkMilestones() {
      if (!playing || ended || factActive || quizActive) return;
      const score = scoreNow();
      if (score >= nextFactAt) {
        nextFactAt += 300;
        showFact();
      } else if (score >= nextQuizAt) {
        nextQuizAt += 200;
        askQuiz();
      }
    }
    function clearObstacles() {
      for (const o of obstacles) {
        if (o.handle) o.handle.release();
        else scene.remove(o.mesh);
      }
      obstacles.length = 0;
    }
    function begin() {
      playing = true;
      ctx.sfx.play("machine.whir_start_01");
      ctx.music.play("music.pushing_ahead");
    }
    function reset() {
      runToken++;
      factActive = false; quizActive = false;
      if (quizToolbar) quizToolbar.remove();
      quizToolbar = null;
      ctx.ui.hud.text("crab-quiz", null);
      nextFactAt = 300; nextQuizAt = 500; factIndex = 0; quizIndex = 0;
      clearObstacles();
      for (const piece of movingDecor) piece.position.z = piece.userData.startZ;
      lane = 1; height = 0; vy = 0; distance = 0; coins = 0; hits = 0;
      speed = 13; spawnIn = 1.9; invuln = 0; time = 0; lastSafe = 1; movementShakeIn = 0;
      ended = false; playing = true;
      player.position.set(0, 0, 0); player.visible = true;
      fish.position.set(1.25, 0, 2.6);
      spawnWave(-32);
      refreshHud();
      ctx.music.play("music.pushing_ahead");
    }
    function addObject(kind, which, z) {
      let mesh, handle = null;
      if (kind === "tiny-rock") {
        handle = ctx.models.spawn("subway-rock");
        mesh = handle.object;
        const size = 2.15 + Math.random() * .3;
        mesh.scale.setScalar(size);
        mesh.rotation.y = (Math.random() - .5) * .55;
      } else if (kind === "big-rock") {
        mesh = ctx.assets.item0502(T, { scale: 1 });
        mesh.scale.setScalar(1.8);
        mesh.rotation.y = (Math.random() - .5) * .55;
        // Train-inspired big rock palette: locomotive red, cream, brass, and steel.
        mesh.traverse(part => {
          if (!part.isMesh) return;
          part.material = part.material.clone();
          part.material.color.set(part.material.color.r < .45 ? "#252b35" : "#c94745");
          part.material.metalness = .35;
          part.material.roughness = .5;
        });
        scene.add(mesh);
      } else {
        mesh = model("gold-coin");
        scene.add(mesh);
      }
      mesh.position.set(laneX[which], 0, z);
      obstacles.push({ mesh, handle, kind, which, checked: false });
    }
    function spawnWave(z = -65) {
      // At least one lane is always open. Waves are >= 19m apart at top speed:
      // two lane presses and a jump both fit before the next wave reaches the crab.
      const safe = Math.floor(Math.random() * 3);
      const blocked = [0, 1, 2].filter(i => i !== safe);
      const second = Math.random() < .38 ? blocked[0] : -1;
      for (const i of blocked) {
        if (i === second || (i !== second && Math.random() < .82)) {
          // Most rocks are small and jumpable; occasional boulders must be dodged.
          const kind = Math.random() < .28 ? "big-rock" : "tiny-rock";
          addObject(kind, i, z);
        }
      }
      // Coins mark the clear route; the nearest coin gives an early lane cue.
      for (let k = 0; k < 3; k++) addObject("coin", safe, z - 1 - k * 1.55);
      lastSafe = safe;
    }
    function collide(o) {
      if (invuln > 0) return;
      hits++; invuln = 1.25;
      ctx.sfx.play("impact.bonk_cartoon_synth_03");
      ctx.fx.shake(.38); ctx.fx.flash();
      fish.position.z = 2.6 - hits * .65;
      refreshHud();
      if (hits >= 3) {
        ended = true; playing = false;
        fish.position.z = .9;
        ctx.sfx.play("water.splash_02");
        ctx.music.stop({ fade: 1 });
        ctx.ui.gameOver({ score: Math.floor(distance) + coins * 25 });
      }
    }
    function update(dt) {
      if (!playing || ended || factActive || quizActive) return;
      dt = Math.min(dt, .05);
      time += dt;
      if (ctx.input.pressed("left") && lane > 0) {
        lane--; ctx.sfx.play("weapon.whoosh_03");
      }
      if (ctx.input.pressed("right") && lane < 2) {
        lane++; ctx.sfx.play("weapon.whoosh_03");
      }
      if (ctx.input.pressed("jump") && height <= .01) {
        vy = 8.5; ctx.sfx.play("jump.spring_01");
      }
      const wasAirborne = height > 0;
      vy -= 21 * dt;
      height = Math.max(0, height + vy * dt);
      if (height === 0) {
        if (wasAirborne) ctx.sfx.play("object.wood_tap_light_01");
        vy = 0;
      }
      player.position.x += (laneX[lane] - player.position.x) * Math.min(1, dt * 16);
      player.position.y = height + (height ? 0 : Math.sin(time * 19) * .038);
      player.rotation.z = (laneX[lane] - player.position.x) * -.12;
      movementShakeIn = Math.max(0, movementShakeIn - dt);
      const playerMoving = Math.abs(laneX[lane] - player.position.x) > .06 || height > .02;
      if (!playerMoving) movementShakeIn = 0;
      else if (movementShakeIn === 0 && invuln <= 0) {
        ctx.fx.shake(.07, .13);
        movementShakeIn = .1;
      }
      const fishTargetX = player.position.x + (hits >= 2 ? .65 : 1.25);
      fish.position.x += (fishTargetX - fish.position.x) * Math.min(1, dt * 4);
      fish.position.y = .18 + Math.sin(time * 7) * .13;
      fish.rotation.z = Math.sin(time * 8) * .07;
      invuln = Math.max(0, invuln - dt);
      player.visible = invuln === 0 || Math.floor(invuln * 12) % 2 === 0;
      speed = Math.min(23, 13 + distance / 95);
      const step = speed * dt;
      distance += step;
      for (const piece of movingDecor) {
        piece.position.z += step;
        if (piece.position.z > 65) piece.position.z -= 39 * 3.4;
      }
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawnWave();
        spawnIn = Math.max(1.12, 1.65 - distance / 4000);
      }
      for (let i = obstacles.length - 1; i >= 0; i--) {
        const o = obstacles[i];
        o.mesh.position.z += step;
        if (o.kind === "coin") o.mesh.rotation.y += dt * 4;
        if (!o.checked && Math.abs(o.mesh.position.z) < (o.kind === "coin" ? .65 : 1.35)) {
          if (Math.abs(player.position.x - laneX[o.which]) < .85) {
            if (o.kind === "coin") {
              o.checked = true; coins++;
              ctx.sfx.play("pickup.coin_double_retro_02");
              ctx.ui.popup("+25", o.mesh);
              scene.remove(o.mesh); obstacles.splice(i, 1);
              refreshHud(); continue;
            }
            // Small rocks can be cleared by a jump; big boulders always block the lane.
            if (o.kind === "big-rock" || height < .92) {
              o.checked = true; collide(o);
            }
          }
        }
        if (o.mesh.position.z > 9) {
          if (o.handle) o.handle.release();
          else scene.remove(o.mesh);
          obstacles.splice(i, 1);
        }
      }
      refreshHud();
      if (distance >= 900 && !ended) {
        ended = true; playing = false;
        ctx.music.stop({ fade: 1 });
        ctx.ui.win({ score: scoreNow(), stars: hits === 0 ? 3 : hits === 1 ? 2 : 1 });
      }
      checkMilestones();
    }
    spawnWave(-32);
    refreshHud();
    ctx.ui.title({ title: "Crabway Dash", subtitle: "Swim through three underwater lanes! Jump over tiny rocks, dodge the big boulders, collect coins, and avoid the blue catfish. Reach 900 meters to win!" }).then(begin);
    return { update, reset, onResize() {} };
  } });
})();
