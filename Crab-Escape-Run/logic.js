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
    const courseLength = runSpeed * 200;
    const walls = [];
    const oceanRocks = [];
    const oceanRowSpacing = 12;
    let lastOceanBlock = -1;
    let sameOceanBlockCount = 0;
    const visuals = window.CrabRunVisuals.create(ctx, scene, T, startZ);
    const { fitWorld, edgeMarkers, sandFloor, waterFloor, oceanFloor, asset, addTunnelHoles,
      crab, claws, gull, gullMarker, catfish, fish } = visuals;
    const hazards = window.CrabRunHazards.create(ctx, visuals);
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
    const wallHeight = 1.49;
    const wallWidth = 6.2;
    const wallDepth = .5;
    const rampLength = 3.15;
    const rampAngle = Math.atan((wallHeight - .1) / rampLength);
    function clearWorldItems(items) {
      for (const item of items) scene.remove(item.object);
      items.length = 0;
    }
    function chooseOceanBlock() {
      let blockedLane = Math.floor(Math.random() * laneX.length);
      if (blockedLane === lastOceanBlock && sameOceanBlockCount >= 2) {
        blockedLane = (lastOceanBlock + 1 + Math.floor(Math.random() * 2)) % laneX.length;
      }
      sameOceanBlockCount = blockedLane === lastOceanBlock ? sameOceanBlockCount + 1 : 1;
      lastOceanBlock = blockedLane;
      return blockedLane;
    }
    function placeOceanRock(rock, z) {
      rock.position.set(laneX[chooseOceanBlock()], 0, z);
      rock.rotation.y = Math.random() * Math.PI * 2;
      rock.scale.setScalar(.9);
      rock.visible = true;
    }
    function resetOceanRocks() {
      lastOceanBlock = -1;
      sameOceanBlockCount = 0;
      let z = crab.position.z - 14;
      for (const rock of oceanRocks) {
        placeOceanRock(rock, z);
        z -= oceanRowSpacing;
      }
    }
    function updateOceanRocks() {
      for (const rock of oceanRocks) {
        if (rock.position.z > crab.position.z + 1.8) {
          let furthestZ = Infinity;
          for (const other of oceanRocks) furthestZ = Math.min(furthestZ, other.position.z);
          placeOceanRock(rock, furthestZ - oceanRowSpacing);
        }
        if (Math.abs(crab.position.x - rock.position.x) < 1.08 &&
            Math.abs(crab.position.z - rock.position.z) < 1.15 && jumpY < .7) {
          finish();
          return true;
        }
      }
      return false;
    }
    function addWalls() {
      const featureLength = wallDepth + 2 * rampLength;
      // Leave enough running room to react and make up to two discrete lane snaps.
      const wallSpacing = featureLength + runSpeed * 2.2;
      const wallCount = Math.ceil(courseLength / wallSpacing) + 1;
      let sidePair = [];
      for (let row = 0; row < wallCount; row++) {
        const z = startZ - (14 + row * wallSpacing);
        // Deal routes in shuffled left/right pairs: both ramps stay equally
        // common, with no streak longer than two rows to make route changes fair.
        if (sidePair.length === 0) {
          const firstSide = Math.random() < 0.5 ? -1 : 1;
          sidePair = [firstSide, -firstSide];
        }
        const rampSide = sidePair.shift();
        const centerX = rampSide * 1.25;
        const rampX = rampSide * 2.5;
        const wall = asset("parkour-wall");
        addTunnelHoles(wall);
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
      hazards.hide();
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
      hazards.enterOcean(startZ);
      crabLane = 1;
      crab.position.set(laneX[crabLane], 0, startZ);
      crab.rotation.y = 0;
      if (view) view.setTarget(crab);
      jumpY = 0;
      jumpSpeed = 0;
      if (oceanRocks.length === 0) {
        for (let i = 0; i < 7; i++) oceanRocks.push(asset("beach-rock"));
      }
      resetOceanRocks();
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
      for (const rock of oceanRocks) rock.visible = false;
      ended = false;
      playing = true;
      ctx.look.apply("sunny-day");
      crab.position.set(laneX[crabLane], 0, startZ);
      if (view) view.setTarget(crab);
      crab.rotation.y = 0;
      hazards.reset(startZ);
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
      progress = Math.min(100, Math.floor(elapsed * 2));
      if (hazards.update("beach", dt, elapsed, crab, runSpeed,
          (x, z) => wallSupportY(x, z, crab.position.y))) {
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
      crab.children[0].rotation.z = Math.sin(elapsed * 7.5) * 0.035;
      for (const swimmer of fish) {
        swimmer.object.position.set(
          swimmer.side * (4.7 + Math.sin(elapsed * 1.2 + swimmer.phase) * .8),
          .8 + Math.sin(elapsed * 2 + swimmer.phase) * .35,
          crab.position.z - swimmer.offset
        );
        swimmer.object.rotation.y = swimmer.side > 0 ? Math.PI : 0;
      }
      if (updateOceanRocks()) return;
      if (hazards.update("ocean", dt, elapsed, crab, runSpeed, () => 0)) finish();
    }
    function update(dt) {
      if (!playing || ended || levelMenuOpen) return;
      dt = Math.min(dt, .05);
      elapsed += dt;
      claws.position.y = -.52 + Math.sin(elapsed * 9) * .018;
      claws.rotation.z = Math.sin(elapsed * 4.5) * .012;
      runSpeed = 5.2 + Math.min(4.8, elapsed * 0.08);
      if (stage === "beach") updateBeach(dt);
      else updateOcean(dt);
      if (ended) return;
      moveGround();
      updateHud();
    }
    function onResize(size) { fitWorld(size); }

    const view = ctx.followCamera(crab, { view: "first-person" });
    const titleReady = ctx.ui.title({
      title: "Crab Escape Run",
      subtitle: "Run the beach, then swim forward and dodge coral! Tap left or right to change lanes."
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
