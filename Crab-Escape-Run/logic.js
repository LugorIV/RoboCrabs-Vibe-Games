(function () {
  Game3DCore.mount({ hud: "custom", createGame(ctx) {
    ctx.ui.skin("ocean-bubbles", { display: "luckiest-guy", body: "nunito", hud: "corners", lives: "bar", title: "poster", pause: "top-right" });
    ctx.look.apply("sunny-day");
    ctx.input.setControls({ controls: [
      { id: "left", label: "Snap one lane left", keys: ["ArrowLeft", "KeyA"] },
      { id: "right", label: "Snap one lane right", keys: ["ArrowRight", "KeyD"] },
      { id: "jump", label: "Jump (Space)", keys: ["Space"] }
    ] });

    const T = ctx.THREE;
    const scene = ctx.scene;
    const startZ = 5;
    const laneX = [-2.5, 0, 2.5];
    let crabLane = 1;
    let runSpeed = 5.2;
    const gullWarningTime = 0.95;
    const gullDiveTime = 0.65;
    const gullRecoveryTime = 1.05;
    const gullRestTime = 2.2;
    const courseLength = runSpeed * 200;
    const walls = [];
    const visuals = window.CrabRunVisuals.create(ctx, scene, T, startZ);
    const { fitWorld, edgeMarkers, sandFloor, waterFloor, oceanFloor, asset,
      crab, gull, gullMarker, catfish, fish } = visuals;
    let playing = false;
    let ended = false;
    let elapsed = 0;
    let selectedLevel = 1;
    let unlockedLevel = 1;
    let levelMenuOpen = false;
    let jumpY = 0;
    let jumpSpeed = 0;
    let progress = 0;
    let stage = "beach";
    let gullPhase = "cruise";
    let gullPhaseTimer = 0;
    let gullTargetX = 0;
    let gullTargetY = 0;
    let gullTargetZ = 0;
    const gullDiveStart = new T.Vector3();
    const gullAim = new T.Vector3();
    const wallHeight = 1.49;
    const wallWidth = 6.2;
    const wallDepth = .5;
    const rampLength = 3.15;
    const rampAngle = Math.atan((wallHeight - .1) / rampLength);
    let catfishGap = 8.5;
    function clearWorldItems(items) {
      for (const item of items) scene.remove(item.object);
      items.length = 0;
    }
    function addWalls() {
      const featureLength = wallDepth + 2 * rampLength;
      // Leave enough running room to react and make up to two discrete lane snaps.
      const wallSpacing = featureLength + runSpeed * 2.2;
      const wallCount = Math.ceil(courseLength / wallSpacing) + 1;
      let previousRampSide = Math.random() < 0.5 ? -1 : 1;
      let sameSideCount = 0;
      for (let row = 0; row < wallCount; row++) {
        const z = startZ - (14 + row * wallSpacing);
        let rampSide = Math.random() < 0.5 ? -1 : 1;
        // Shuffle each row's route, but avoid long repeated patterns. The
        // existing spacing still gives enough time to switch outer lanes.
        if (rampSide === previousRampSide && sameSideCount >= 2) {
          rampSide *= -1;
        }
        sameSideCount = rampSide === previousRampSide ? sameSideCount + 1 : 1;
        previousRampSide = rampSide;
        const centerX = rampSide * 1.25;
        const rampX = rampSide * 2.5;
        const wall = asset("parkour-wall");
        wall.position.set(centerX, 0, z);
        const approach = asset("parkour-boards");
        approach.position.set(rampX, wallHeight / 2, z + wallDepth / 2 + rampLength / 2);
        approach.scale.x = .38;
        approach.rotation.x = rampAngle;
        const descent = asset("parkour-boards");
        descent.position.set(rampX, wallHeight / 2, z - wallDepth / 2 - rampLength / 2);
        descent.scale.x = .38;
        descent.rotation.x = -rampAngle;
        const group = new T.Group();
        group.add(wall, approach, descent);
        scene.add(group);
        walls.push({ object: group, x: centerX, rampX, z });
      }
    }
    function wallSupportY(x, z, currentY) {
      for (const wall of walls) {
        const dz = z - wall.z;
        const rampXDistance = Math.abs(x - wall.rampX);
        if (rampXDistance <= 1.35) {
          if (dz > wallDepth / 2 && dz <= wallDepth / 2 + rampLength) {
            return wallHeight * (wallDepth / 2 + rampLength - dz) / rampLength;
          }
          if (Math.abs(dz) <= wallDepth / 2) return wallHeight;
          if (dz < -wallDepth / 2 && dz >= -wallDepth / 2 - rampLength) {
            return wallHeight * (dz + wallDepth / 2 + rampLength) / rampLength;
          }
        }
        const onTop = Math.abs(dz) <= wallDepth / 2 &&
          Math.abs(x - wall.x) <= wallWidth / 2 + .32 &&
          currentY >= wallHeight - .35;
        if (onTop) return wallHeight;
      }
      return 0;
    }
    function nearWall(z, distance) {
      return walls.some((wall) => Math.abs(z - wall.z) < distance);
    }
    function beginGullDive() {
      gullPhase = "warning";
      gullPhaseTimer = 0;
      gullTargetX = crab.position.x;
      gullTargetZ = crab.position.z - runSpeed * (gullWarningTime + gullDiveTime);
      gullTargetY = wallSupportY(gullTargetX, gullTargetZ, crab.position.y);
      gullMarker.position.set(gullTargetX, gullTargetY > 0 ? gullTargetY + .02 : -.23, gullTargetZ);
      gullMarker.scale.setScalar(1);
      gullMarker.visible = true;
    }
    function gullTouchesCrab() {
      const playerBottom = crab.position.y;
      const playerTop = playerBottom + .96;
      const birdBottom = gull.object.position.y;
      const birdTop = birdBottom + .9;
      return Math.hypot(crab.position.x - gull.object.position.x, crab.position.z - gull.object.position.z) < 1.2 &&
        playerBottom < birdTop && playerTop > birdBottom;
    }
    function updateGull(dt) {
      const position = gull.object.position;
      gullPhaseTimer += dt;
      if (gullPhase === "cruise") {
        position.x += (crab.position.x - position.x) * Math.min(1, dt * 1.5);
        position.y = 4.8 + Math.sin(elapsed * 3.5) * .18;
        position.z = crab.position.z - 12;
        if (gullPhaseTimer >= gullRestTime) beginGullDive();
      } else if (gullPhase === "warning") {
        gullAim.set(gullTargetX, gullTargetY + 4.8, gullTargetZ - 2.6);
        position.lerp(gullAim, Math.min(1, dt * 5));
        gullMarker.scale.setScalar(1 + .045 * Math.sin(elapsed * 11));
        if (gullPhaseTimer >= gullWarningTime) {
          gullPhase = "dive";
          gullPhaseTimer = 0;
          gullDiveStart.copy(position);
        }
      } else if (gullPhase === "dive") {
        const t = Math.min(1, gullPhaseTimer / gullDiveTime);
        const eased = t * t * (3 - 2 * t);
        gullAim.set(gullTargetX, gullTargetY + .22, gullTargetZ);
        position.lerpVectors(gullDiveStart, gullAim, eased);
        gullMarker.scale.setScalar(1 + .035 * Math.sin(elapsed * 16));
        if (gullTouchesCrab()) return true;
        if (t >= 1) {
          gullPhase = "recover";
          gullPhaseTimer = 0;
          gullMarker.visible = false;
        }
      } else {
        gullAim.set(crab.position.x, 4.8, crab.position.z - 12);
        position.lerp(gullAim, Math.min(1, dt * 1.8));
        if (gullPhaseTimer >= gullRecoveryTime) {
          gullPhase = "cruise";
          gullPhaseTimer = 0;
        }
      }
      const diving = gullPhase === "warning" || gullPhase === "dive";
      gull.face(diving ? gullTargetX - position.x : 0, diving ? gullTargetZ - position.z : -1);
      gull.move(3.4);
      return false;
    }
    function updateHud() {
      ctx.ui.hud.bar("Run progress", progress, 100, { label: progress + "%" });
      ctx.ui.hud.score(Math.floor(Math.max(0, startZ - crab.position.z) * 10));
      ctx.ui.hud.timer(elapsed);
      const status = ended ? "Run over! Choose Levels to try again." :
        (levelMenuOpen ? "Choose a level to play." :
          (stage === "ocean" ? "Level 2: Ocean Chase" : "Level 1: Beach Run"));
      ctx.ui.hud.text("levelStatus", status);
    }
    function finish() {
      if (ended) return;
      ended = true;
      playing = false;
      gullMarker.visible = false;
      ctx.music.stop({ fade: 1 });
      ctx.fx.shake(.22);
      updateHud();
      ctx.ui.banner("Run over! Choose a level to play again.");
    }
    function steerCrab() {
      const moveLeft = ctx.input.pressed("left");
      const moveRight = ctx.input.pressed("right");
      if (moveLeft !== moveRight) {
        crabLane += moveRight ? 1 : -1;
        crabLane = Math.max(0, Math.min(laneX.length - 1, crabLane));
      }
      crab.position.x = laneX[crabLane];
    }
    function enterOcean() {
      stage = "ocean";
      selectedLevel = 2;
      unlockedLevel = Math.max(unlockedLevel, 2);
      progress = 100;
      clearWorldItems(walls);
      sandFloor.visible = false;
      waterFloor.visible = false;
      oceanFloor.visible = true;
      for (const marker of edgeMarkers) marker.object.visible = false;
      for (const swimmer of fish) swimmer.object.visible = true;
      gull.object.visible = false;
      gullMarker.visible = false;
      crabLane = 1;
      crab.position.set(laneX[crabLane], 0, startZ);
      if (view) view.setTarget(crab);
      jumpY = 0;
      jumpSpeed = 0;
      catfishGap = 8.5;
      catfish.position.set(0, .35, startZ + Math.min(catfishGap, 4.5));
      catfish.visible = true;
      ctx.look.apply("underwater");
      ctx.ui.banner("Beach cleared! Level 2 unlocked!");
      ctx.sfx.play("creature.burble_01");
    }
    function reset() {
      clearWorldItems(walls);
      elapsed = 0;
      progress = 0;
      crabLane = 1;
      levelMenuOpen = false;
      runSpeed = 5.2;
      jumpY = 0;
      jumpSpeed = 0;
      stage = "beach";
      catfishGap = 8.5;
      ended = false;
      playing = true;
      ctx.look.apply("sunny-day");
      crab.position.set(laneX[crabLane], 0, startZ);
      if (view) view.setTarget(crab);
      crab.rotation.y = 0;
      gullPhase = "cruise";
      gullPhaseTimer = 0;
      gull.object.position.set(0, 4.8, startZ - 12);
      gull.object.visible = true;
      gullMarker.visible = false;
      catfish.visible = false;
      for (const swimmer of fish) swimmer.object.visible = false;
      sandFloor.visible = true;
      waterFloor.visible = true;
      oceanFloor.visible = false;
      for (const marker of edgeMarkers) marker.object.visible = true;
      sandFloor.position.z = startZ - 38;
      waterFloor.position.z = startZ - 38;
      oceanFloor.position.z = startZ - 38;
      if (selectedLevel === 2) enterOcean();
      else addWalls();
      updateHud();
      ctx.music.play("music.happy_whistling_ukulele", { fade: 1 });
    }
    function moveGround() {
      sandFloor.position.z = crab.position.z - 38;
      waterFloor.position.z = crab.position.z - 38;
      oceanFloor.position.z = crab.position.z - 38;
      for (const edge of edgeMarkers) edge.object.position.z = crab.position.z - edge.offset;
    }
    function updateBeach(dt) {
      steerCrab();
      if (ctx.input.pressed("jump") && jumpY <= 0 && !nearWall(crab.position.z, 10)) {
        jumpSpeed = 8;
        ctx.sfx.play("jump.jump_retro_12");
      }
      if (jumpY > 0 || jumpSpeed > 0) {
        jumpSpeed -= 18 * dt;
        jumpY += jumpSpeed * dt;
        if (jumpY <= 0) { jumpY = 0; jumpSpeed = 0; }
      }
      crab.position.z -= runSpeed * dt;
      const supportY = wallSupportY(crab.position.x, crab.position.z, crab.position.y);
      crab.position.y = supportY + jumpY;
      progress = Math.min(100, Math.floor(elapsed));
      if (updateGull(dt)) {
        finish();
        return;
      }

      for (let i = walls.length - 1; i >= 0; i--) {
        const wall = walls[i];
        if (wall.z > crab.position.z + 5) {
          scene.remove(wall.object);
          walls.splice(i, 1);
          continue;
        }
        const overlapsWall = Math.abs(crab.position.x - wall.x) < wallWidth / 2 + .32 &&
          Math.abs(crab.position.z - wall.z) < wallDepth / 2 + .45;
        const surfaceY = wallSupportY(crab.position.x, crab.position.z, crab.position.y - jumpY);
        const safelyOnRampOrWall = surfaceY > .05 && Math.abs(crab.position.y - jumpY - surfaceY) < .3;
        if (overlapsWall && !safelyOnRampOrWall) {
          finish();
          return;
        }
      }
      if (progress >= 100) { enterOcean(); return; }
    }
    function updateOcean(dt) {
      steerCrab();
      if (ctx.input.pressed("jump") && jumpY <= 0) {
        jumpSpeed = 8;
        ctx.sfx.play("jump.jump_retro_12");
      }
      if (jumpY > 0 || jumpSpeed > 0) {
        jumpSpeed -= 18 * dt;
        jumpY += jumpSpeed * dt;
        if (jumpY <= 0) { jumpY = 0; jumpSpeed = 0; }
      }
      crab.position.y = jumpY;
      crab.position.z -= runSpeed * dt;
      catfishGap = Math.max(1.25, catfishGap - dt * .18);
      catfish.position.x += (crab.position.x - catfish.position.x) * Math.min(1, dt * 1.35);
      catfish.position.y = .3 + Math.sin(elapsed * 5) * .14;
      catfish.position.z = crab.position.z + Math.min(catfishGap, 4.5);
      for (const swimmer of fish) {
        swimmer.object.position.set(
          swimmer.side * (4.7 + Math.sin(elapsed * 1.2 + swimmer.phase) * .8),
          .8 + Math.sin(elapsed * 2 + swimmer.phase) * .35,
          crab.position.z - swimmer.offset
        );
        swimmer.object.rotation.y = swimmer.side > 0 ? Math.PI : 0;
      }
      if (catfishGap <= 1.3) {
        if (Math.abs(catfish.position.x - crab.position.x) < 1.25 && jumpY < .7) {
          finish();
          return;
        }
        catfishGap = 6.5;
      }
    }
    function update(dt) {
      if (!playing || ended || levelMenuOpen) return;
      dt = Math.min(dt, .05);
      elapsed += dt;
      runSpeed = 5.2 + Math.min(4.8, elapsed * 0.08);
      if (stage === "beach") updateBeach(dt);
      else updateOcean(dt);
      if (ended) return;
      moveGround();
      updateHud();
    }
    function onResize(size) { fitWorld(size); }

    const view = ctx.followCamera(crab, { view: "chase", distance: 8, height: 5 });
    const titleReady = ctx.ui.title({
      title: "Crab Escape Run",
      subtitle: "Tap left or right to snap between lanes, climb the boards, and escape the ocean chase!"
    });
    window.CrabRunMenus.create(ctx, {
      titleReady,
      getUnlockedLevel: () => unlockedLevel,
      onMenuChange(open) { levelMenuOpen = open; updateHud(); },
      onTitleSelectLevel(level) { selectedLevel = level; },
      onSelectLevel(level) { selectedLevel = level; reset(); }
    });
    titleReady.then(reset);
    ctx.markReady();
    return { update, reset, onResize };
  } });
})();
