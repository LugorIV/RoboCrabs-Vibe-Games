window.CrabRunHazards = {
  create(ctx, visuals) {
    const T = ctx.THREE;
    const { gull, gullMarker, catfish } = visuals;
    const warningTime = 0.95;
    const diveTime = 0.65;
    const recoveryTime = 1.05;
    const restTime = 2.2;
    const diveStart = new T.Vector3();
    const aim = new T.Vector3();
    let phase = "cruise";
    let phaseTime = 0;
    let targetX = 0;
    let targetY = 0;
    let targetZ = 0;
    let headRest = null;

    function reset(startZ) {
      phase = "cruise";
      phaseTime = 0;
      gull.object.position.set(0, 4.8, startZ - 12);
      gull.object.visible = true;
      catfish.position.set(0, -.05, startZ + 7);
      catfish.visible = false;
      gullMarker.visible = false;
      headRest = null;
    }

    function enterOcean(startZ) {
      phase = "cruise";
      phaseTime = 0;
      gull.object.visible = false;
      catfish.position.set(0, -.05, startZ + 7);
      catfish.visible = true;
      gullMarker.visible = false;
    }

    function hide() {
      gull.object.visible = false;
      catfish.visible = false;
      gullMarker.visible = false;
    }

    function setTarget(stage, crab, speed, groundAt) {
      targetX = crab.position.x;
      const remaining = phase === "warning" ? Math.max(0, warningTime - phaseTime) : warningTime;
      targetZ = crab.position.z - speed * (remaining + diveTime);
      targetY = stage === "beach" ? groundAt(targetX, targetZ) : 0;
      gullMarker.position.set(targetX, targetY > 0 ? targetY + .025 : -.23, targetZ);
      gullMarker.visible = true;
    }

    function touches(crab, enemy) {
      const playerBottom = crab.position.y;
      const playerTop = playerBottom + .8;
      const enemyBottom = enemy.position.y;
      const enemyTop = enemyBottom + .9;
      return Math.hypot(crab.position.x - enemy.position.x, crab.position.z - enemy.position.z) < 1.15 &&
        playerBottom < enemyTop && playerTop > enemyBottom;
    }

    function dipBird(amount) {
      const head = gull.node("head");
      if (!head) return;
      if (!headRest) headRest = head.rotation.clone();
      head.rotation.copy(headRest);
      head.rotation.x -= .72 * amount;
    }

    function update(stage, dt, elapsed, crab, speed, groundAt) {
      const bird = stage === "beach";
      const enemy = bird ? gull.object : catfish;
      if (!enemy.visible) return false;
      phaseTime += dt;

      if (phase === "cruise") {
        if (bird) {
          enemy.position.x += (crab.position.x - enemy.position.x) * Math.min(1, dt * 1.5);
          enemy.position.y = 4.8 + Math.sin(elapsed * 3.5) * .18;
          enemy.position.z = crab.position.z - 12;
        } else {
          enemy.position.x += (crab.position.x - enemy.position.x) * Math.min(1, dt * 1.35);
          enemy.position.y = -.05 + Math.sin(elapsed * 3) * .1;
          enemy.position.z = crab.position.z + 7;
        }
        if (phaseTime >= restTime) {
          phase = "warning";
          phaseTime = 0;
          setTarget(stage, crab, speed, groundAt);
        }
      } else if (phase === "warning") {
        setTarget(stage, crab, speed, groundAt);
        aim.set(targetX, bird ? targetY + 4.8 : .25, bird ? targetZ - 2.6 : targetZ + 2.8);
        enemy.position.lerp(aim, Math.min(1, dt * 5));
        gullMarker.scale.setScalar(1 + .06 * Math.sin(elapsed * 12));
        if (phaseTime >= warningTime) {
          phase = "dive";
          phaseTime = 0;
          diveStart.copy(enemy.position);
        }
      } else if (phase === "dive") {
        const t = Math.min(1, phaseTime / diveTime);
        const eased = t * t * (3 - 2 * t);
        aim.set(targetX, bird ? targetY + .22 : .3, targetZ);
        enemy.position.lerpVectors(diveStart, aim, eased);
        gullMarker.scale.setScalar(1 + .045 * Math.sin(elapsed * 17));
        if (bird) dipBird(Math.sin(Math.PI * t));
        if (touches(crab, enemy)) return true;
        if (t >= 1) {
          phase = "recover";
          phaseTime = 0;
          gullMarker.visible = false;
        }
      } else {
        aim.set(crab.position.x, bird ? 4.8 : -.05, bird ? crab.position.z - 12 : crab.position.z + 7);
        enemy.position.lerp(aim, Math.min(1, dt * 1.8));
        if (bird) dipBird(0);
        if (phaseTime >= recoveryTime) {
          phase = "cruise";
          phaseTime = 0;
        }
      }

      if (bird) {
        const diving = phase === "warning" || phase === "dive";
        gull.face(diving ? targetX - enemy.position.x : 0, diving ? targetZ - enemy.position.z : -1);
        gull.move(elapsed >= 50 ? 5.1 : 3.4);
        if (phase === "dive") dipBird(Math.sin(Math.PI * Math.min(1, phaseTime / diveTime)));
      }
      return false;
    }

    return { reset, enterOcean, hide, update };
  }
};
