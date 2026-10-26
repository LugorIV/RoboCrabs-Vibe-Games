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
    const crab = ctx.assets.sprite("blue-crab", { size: 68 });
    const keys = ["trash-bottle", "trash-bag", "trash-can", "trash-net"];
    const SUNNY_LEVELS = 5;
    const LEVEL_COUNT = SUNNY_LEVELS + 1;
    const DEEP_REEF_ITEMS = 24;
    const items = Array.from({ length: DEEP_REEF_ITEMS }, (_, i) => ({
      kind: i % keys.length,
      view: ctx.assets.sprite(keys[i % keys.length], { size: 45 }),
      x: 0, y: 0, active: false
    }));
    const bubbles = new PIXI.Graphics();
    ctx.layers.world.addChild(depthTint);
    ctx.layers.world.addChild(shadow);
    items.forEach(item => ctx.layers.world.addChild(item.view));
    ctx.layers.world.addChild(crab, bubbles);

    let width = ctx.size.width, height = ctx.size.height;
    let bounds = { left: 38, right: width - 38, top: 110, bottom: height - 120 };
    let x = width / 2, y = height / 2, score = 0, shells = 0, level = 1;
    let remaining = 0, total = 0, seconds = 70, playing = false;
    let elapsed = 0, movingLast = false, transition = 0, musicTrack = null;
    let previousDanger = 0;
    let speedLevel = 0, reachLevel = 0, shopOpen = false, shopToolbar = null;
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
    const speedCosts = [30, 55, 80];
    const reachCosts = [25, 50];

    function drawDepthTint() {
      const progress = (level - 1) / Math.max(1, LEVEL_COUNT - 1);
      const darkness = 0.035 + progress * 0.38;
      depthTint.clear().rect(0, 0, width, height)
        .fill({ color: 0x00152c, alpha: darkness });
    }

    function resize(size) {
      width = size.width;
      height = size.height;
      const bottomSpace = height < 720 ? 105 : 125;
      bounds = { left: 35, right: Math.max(36, width - 35), top: Math.min(115, height * 0.24), bottom: Math.max(180, height - bottomSpace) };
      x = clamp(x, bounds.left, bounds.right);
      y = clamp(y, bounds.top, bounds.bottom);
      drawDepthTint();
      // All items use normalized layout on a resize, so even a narrow reef stays reachable.
      layoutItems();
    }

    function layoutItems() {
      const columns = width < 500 ? 3 : 4;
      const rows = Math.ceil(total / columns);
      const spanX = bounds.right - bounds.left;
      const spanY = bounds.bottom - bounds.top;
      items.forEach((item, i) => {
        if (i >= total) return;
        const col = i % columns, row = Math.floor(i / columns);
        let fx = (col + 0.5) / columns;
        let fy = (row + 0.5) / rows;
        // Each reef has its own swim pattern: staggered shoals, waves, lanes, or zigzags.
        switch ((level - 1) % LEVEL_COUNT) {
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
        }
        fx = clamp(fx, 0.07, 0.93);
        fy = clamp(fy, 0.08, 0.92);
        item.x = bounds.left + spanX * fx;
        item.y = bounds.top + spanY * fy;
        // Keep the crab's starting spot clear on every layout.
        if (Math.hypot(item.x - width / 2, item.y - (bounds.top + bounds.bottom) / 2) < 48) {
          item.y = clamp(item.y + 55, bounds.top + 20, bounds.bottom - 12);
        }
        item.view.position.set(item.x, item.y);
      });
    }

    function dangerLevel() {
      return Math.ceil(level / LEVEL_COUNT * 5);
    }

    function hud() {
      ctx.ui.hud.score(score);
      ctx.ui.hud.text("shells", "Shells: " + shells);
      ctx.ui.hud.bar("Ocean health", total - remaining, total);
      const depthName = level > SUNNY_LEVELS ? "DEPTH: Deep Reef" : "DEPTH: Reef";
      ctx.ui.hud.bar("Depth", level, LEVEL_COUNT, { label: depthName, color: "#1686bc" });
      const danger = dangerLevel();
      const dangerColor = danger >= 4 ? "#ef4444" : danger >= 3 ? "#f59e0b" : "#22c55e";
      ctx.ui.hud.bar("Danger", danger, 5, {
        label: "DANGER " + danger + "/5",
        color: dangerColor
      });
      ctx.ui.hud.timer(Math.ceil(seconds));
    }

    function startLevel() {
      if (shopToolbar) {
        shopToolbar.remove();
        shopToolbar = null;
      }
      shopOpen = false;
      ctx.ui.hud.text("shop", null);
      const deepReef = level > SUNNY_LEVELS;
      total = deepReef ? DEEP_REEF_ITEMS : 3 + level * 3;
      remaining = total;
      // Start with 40 seconds and remove 5 seconds on each later level.
      seconds = 40 - (level - 1) * 5;
      x = width / 2;
      y = (bounds.top + bounds.bottom) / 2;
      items.forEach((item, i) => {
        item.active = i < total;
        item.view.visible = item.active;
      });
      layoutItems();
      drawDepthTint();
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
      const depthNames = ["Sunlit Reef", "Blue Reef", "Twilight Reef", "Dusky Reef", "Dark Reef", "Deep Reef"];
      if (deepReef) {
        ctx.ui.banner("Deep Reef — hardest level! Collect 24!");
      } else {
        ctx.ui.banner(depthNames[level - 1] + " — Level " + level + "/" + LEVEL_COUNT);
      }
      if (level > 1) ctx.sfx.play("water.splash_06", { volume: 0.55 });
    }

    function reset() {
      endOverlay.hidden = true;
      level = 1;
      score = 0;
      shells = 0;
      speedLevel = 0;
      reachLevel = 0;
      shopOpen = false;
      transition = 0;
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
      shells += 10;
      hud();
      ctx.ui.popup("+10", item.x, item.y);
      ctx.fx.burst(item.x, item.y);
      ctx.sfx.play(["object.bottle_01", "object.cloth_bag_02", "pickup.metal_clink_02", "object.cloth_bag_02"][item.kind], { volume: 0.55 });
      if (remaining === 0) {
        playing = false;
        transition = 1.4;
        ctx.fx.flash();
        ctx.ui.banner("100% healthy! Reef restored!");
      }
    }

    function openShop() {
      transition = 0;
      playing = false;
      shopOpen = true;
      ctx.ui.hud.timer(null);
      ctx.ui.hud.text("shop", "Shop: Speed " + speedLevel + "/3, cleanup " + reachLevel + "/2");
      ctx.ui.banner("Reef cleared! Spend shells on upgrades, then continue.", { seconds: 4 });
      shopToolbar = ctx.ui.toolbar([
        { id: "speed", label: "Swim faster", icon: "⚡", cost: speedCosts[speedLevel] + " shells" },
        { id: "reach", label: "Cleanup reach", icon: "🫧", cost: reachCosts[reachLevel] + " shells" },
        { id: "continue", label: level === LEVEL_COUNT ? "Finish reef" : "Next reef", icon: "🌊" }
      ], { onSelect: chooseShopItem, selected: "continue" });
      updateShopButtons();
    }

    function updateShopButtons() {
      if (!shopToolbar) return;
      const speedCost = speedCosts[speedLevel];
      const reachCost = reachCosts[reachLevel];
      shopToolbar.setCost("speed", speedCost == null ? "MAX" : speedCost + " shells");
      shopToolbar.setCost("reach", reachCost == null ? "MAX" : reachCost + " shells");
      shopToolbar.setDisabled("speed", speedCost == null || shells < speedCost);
      shopToolbar.setDisabled("reach", reachCost == null || shells < reachCost);
    }

    function chooseShopItem(id) {
      if (!shopOpen) return;
      if (id === "continue") {
        finish();
        return;
      }
      if (id === "speed" && speedCosts[speedLevel] != null) {
        const cost = speedCosts[speedLevel];
        if (shells < cost) return;
        shells -= cost;
        speedLevel++;
        ctx.ui.banner("Swim speed upgraded!", { seconds: 1.6 });
      } else if (id === "reach" && reachCosts[reachLevel] != null) {
        const cost = reachCosts[reachLevel];
        if (shells < cost) return;
        shells -= cost;
        reachLevel++;
        ctx.ui.banner("Cleanup reach upgraded!", { seconds: 1.6 });
      } else {
        return;
      }
      ctx.sfx.play("pickup.metal_clink_02", { volume: 0.55 });
      ctx.ui.hud.text("shells", "Shells: " + shells);
      ctx.ui.hud.text("shop", "Shop: Speed " + speedLevel + "/3, cleanup " + reachLevel + "/2");
      updateShopButtons();
    }

    function finish() {
      if (!shopOpen) return;
      shopOpen = false;
      if (shopToolbar) {
        shopToolbar.remove();
        shopToolbar = null;
      }
      ctx.ui.hud.text("shop", null);
      if (level === LEVEL_COUNT) {
        ctx.music.stop({ fade: 1 });
        ctx.sfx.play("jingle.fanfare_01");
        ctx.emit("win");
        showEnd("All 6 reef challenges are clean!");
        ctx.ui.win({ score, stars: 3 });
      } else {
        level++;
        startLevel();
        playing = true;
      }
    }

    function update(dt) {
      elapsed += dt;
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
        const swimSpeed = 205 + speedLevel * 50;
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
        if (item.active && Math.hypot(x - item.x, y - item.y) < 37 + reachLevel * 12) collect(item);
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
    }

    resize(ctx.size);
    ctx.ui.title({ title: "Blue Crab Reef Rescue", subtitle: "Collect ocean trash as you dive through six reefs. Every level gets darker and harder!" })
      .then(() => reset());
    return { update, render, reset, onResize: resize };
  } });
})();
