(function () {
  function defaultStatus() {
    return {
      mounted: false,
      firstFrameRendered: false,
      rafTicks: 0,
      rendererSize: { width: 0, height: 0 },
      objectCount: 0,
      lastError: null,
      lastErrorCode: null,
      userMessage: null,
      webglAvailable: null,
      contextLost: false,
      rendererDisposed: false,
      phase: "idle",
      canvasSize: null,
      rootSize: null,
      canvasConnected: null,
      rendererOptions: null,
      rendererConsoleMessages: [],
      rendererFailureDetail: null,
      errorName: null,
      errorMessage: null,
      errorStack: null,
      contextLostAt: null,
      contextRestoredAt: null,
      rendererCreatedAt: null,
      rendererDisposedAt: null,
      mountStartedAt: null,
      legacyMountSignature: false,
      gameCallbackProvided: null,
      restarts: 0,
      restartReason: null,
      outcome: null,
      outcomeAt: null,
      objective: null,
      cameraFit: null
    };
  }

  var status = window.__VIBE_3D_STATUS__ || defaultStatus();
  window.__VIBE_3D_STATUS__ = status;
  var activeContext = null;

  function getThree() {
    return window.THREE || globalThis.THREE;
  }

  function getRoot(target) {
    if (typeof target === "string") return document.querySelector(target);
    return target || document.getElementById("game-root") || document.body;
  }

  function createCanvas(root, canvas) {
    var target = canvas || root.querySelector("canvas");
    if (!target) {
      target = document.createElement("canvas");
      target.id = "game-canvas";
      root.appendChild(target);
    }
    return target;
  }

  function removeLegacyPlaceholder(root) {
    if (!root || !root.querySelectorAll) return;
    var placeholders = root.querySelectorAll("#vibe-placeholder");
    Array.prototype.forEach.call(placeholders, function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function readSize(root, canvas) {
    var canvasRect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (canvasRect && canvasRect.width > 0 && canvasRect.height > 0) {
      return {
        width: Math.max(1, Math.floor(canvasRect.width)),
        height: Math.max(1, Math.floor(canvasRect.height))
      };
    }

    var rect = root.getBoundingClientRect ? root.getBoundingClientRect() : null;
    var width = Math.max(1, Math.floor((rect && rect.width) || root.clientWidth || window.innerWidth || 1));
    var height = Math.max(1, Math.floor((rect && rect.height) || root.clientHeight || window.innerHeight || 1));
    var style = window.getComputedStyle ? window.getComputedStyle(root) : null;
    if (style) {
      width -= (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      height -= (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    }
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  function countObjects(scene) {
    var count = 0;
    if (scene && scene.traverse) scene.traverse(function () { count += 1; });
    return count;
  }

  function showFallback(root, message) {
    if (!root) return;
    if (root.querySelectorAll) {
      var existing = root.querySelectorAll(".game3d-fallback");
      Array.prototype.forEach.call(existing, function (node) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
    }
    var panel = document.createElement("div");
    panel.className = "game3d-fallback";
    panel.textContent = message || "The 3D scene could not start.";
    root.appendChild(panel);
  }

  function isRepairableRuntimeErrorCode(code) {
    return code !== "webgl_context_unavailable" &&
      code !== "webgl_context_null" &&
      code !== "webgl_context_lost";
  }

  function postRuntimeErrorToHost(error, code, message) {
    if (!isRepairableRuntimeErrorCode(code)) return;
    try {
      var host = window.__CODE_LOVABLE_HOST__;
      if (!host || typeof host.postRuntimeError !== "function") return;
      host.postRuntimeError(error || message || "3D runtime error", {
        source: "Game3DCore",
        code: code || "three_runtime_error",
        message: message || null,
        stack: error && error.stack ? error.stack : null
      });
    } catch (_error) {
      // Runtime telemetry must not mask the original game error.
    }
  }

  function readRect(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") return null;
    try {
      var rect = node.getBoundingClientRect();
      return {
        width: Math.max(0, Math.floor(rect.width || 0)),
        height: Math.max(0, Math.floor(rect.height || 0))
      };
    } catch (error) {
      return null;
    }
  }

  function updateElementStatus(root, canvas) {
    status.rootSize = readRect(root);
    status.canvasSize = readRect(canvas);
    status.canvasConnected = !!(canvas && canvas.isConnected !== false);
  }

  function stringifyConsoleArg(value) {
    if (typeof value === "string") return value;
    if (value && typeof value.message === "string") return value.message;
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function captureRendererConsoleMessages(callback) {
    var messages = [];
    var consoleObject = typeof console !== "undefined" ? console : null;
    var originalError = consoleObject && consoleObject.error;
    var originalWarn = consoleObject && consoleObject.warn;
    function wrap(level, originalFn) {
      return function () {
        var text = Array.prototype.map.call(arguments, stringifyConsoleArg).join(" ");
        if (/WebGLRenderer|WebGL context|GL_VENDOR|GL_RENDERER|Sandboxed|BindToCurrentSequence/i.test(text)) {
          messages.push({
            level: level,
            message: text.slice(0, 1600),
            at: Date.now()
          });
        }
        if (typeof originalFn === "function") {
          return originalFn.apply(consoleObject, arguments);
        }
        return undefined;
      };
    }
    try {
      if (consoleObject) {
        consoleObject.error = wrap("error", originalError);
        consoleObject.warn = wrap("warn", originalWarn);
      }
      return { value: callback(), messages: messages };
    } catch (error) {
      error.__vibeRendererConsoleMessages = messages;
      throw error;
    } finally {
      try {
        if (consoleObject && originalError) consoleObject.error = originalError;
        if (consoleObject && originalWarn) consoleObject.warn = originalWarn;
      } catch (error) {}
    }
  }

  function setRuntimeError(root, error, code) {
    var message = error && error.message ? error.message : String(error || "The 3D scene could not start.");
    var userMessage = code === "webgl_context_unavailable"
      ? "3D preview could not allocate a WebGL context. Collecting browser and iframe diagnostics..."
      : message;
    status.lastError = message;
    status.lastErrorCode = code || "three_runtime_error";
    status.userMessage = userMessage;
    status.errorName = error && error.name ? String(error.name).slice(0, 120) : null;
    status.errorMessage = message;
    status.errorStack = error && error.stack ? String(error.stack).slice(0, 2000) : null;
    if (error && error.__vibeRendererConsoleMessages) {
      status.rendererConsoleMessages = error.__vibeRendererConsoleMessages.slice(0, 6);
      status.rendererFailureDetail = status.rendererConsoleMessages
        .map(function (entry) { return entry.level + ": " + entry.message; })
        .join("\n")
        .slice(0, 3000);
    }
    status.phase = code || "three_runtime_error";
    postRuntimeErrorToHost(error, status.lastErrorCode, message);
    showFallback(root, userMessage);
    window.__thumbnailReady = true;
    return message;
  }

  function disposeRenderer(renderer) {
    if (!renderer) return;
    try {
      if (typeof renderer.dispose === "function") renderer.dispose();
    } catch (error) {
      // Cleanup must not mask the original runtime error.
    }
    try {
      if (typeof renderer.forceContextLoss === "function") renderer.forceContextLoss();
    } catch (error) {
      // Some browser/Three combinations do not expose explicit context loss.
    }
    status.rendererDisposed = true;
    status.rendererDisposedAt = Date.now();
    status.phase = "renderer_disposed";
  }

  function disposeObjectMaterial(material) {
    if (!material) return;
    if (Array.isArray(material)) {
      for (var index = 0; index < material.length; index += 1) {
        disposeObjectMaterial(material[index]);
      }
      return;
    }
    try {
      if (typeof material.dispose === "function") material.dispose();
    } catch (error) {
      // Material disposal must not abort a restart teardown.
    }
  }

  // Full-rebuild teardown for ctx.restart(): remove and dispose EVERYTHING in
  // the scene (kit lighting included; the rebuild re-adds it) so restarted
  // games do not leak geometry, materials, or shadow maps.
  function disposeSceneChildren(scene) {
    if (!scene || !Array.isArray(scene.children)) return 0;
    var removed = 0;
    var children = scene.children.slice();
    for (var index = 0; index < children.length; index += 1) {
      var child = children[index];
      if (!child) continue;
      try {
        if (typeof child.traverse === "function") {
          child.traverse(function (node) {
            if (!node) return;
            try {
              if (node.geometry && typeof node.geometry.dispose === "function") node.geometry.dispose();
            } catch (error) {
              // Geometry disposal must not abort a restart teardown.
            }
            disposeObjectMaterial(node.material);
            try {
              if (node.isLight && typeof node.dispose === "function") node.dispose();
            } catch (error) {
              // Light disposal must not abort a restart teardown.
            }
          });
        }
      } catch (error) {
        // Even if traversal throws, still detach the child below.
      }
      try {
        scene.remove(child);
        removed += 1;
      } catch (error) {
        // Keep tearing down the remaining children.
      }
    }
    return removed;
  }

  function createInput(target) {
    if (window.GameInput && typeof window.GameInput.createInput === "function") {
      var options = target && target.target
        ? target
        : { target: target || window };
      if (!options.controls) options.controls = window.GameInput.declarationRequired ? [] : "three_move";
      return window.GameInput.createInput(options);
    }
    // Fallback keyboard input (GameInput absent): accept the same options
    // object shape and listen on its target element.
    if (target && target.target) target = target.target;
    var keys = {};
    var pressed = {};
    var released = {};
    var prevent = {
      ArrowUp: true,
      ArrowDown: true,
      ArrowLeft: true,
      ArrowRight: true,
      Space: true
    };
    function normalizeKeyCode(code) {
      var raw = String(code || "");
      var lower = raw.toLowerCase();
      if (!raw) return "";
      if (raw === " " || lower === "spacebar" || lower === "space") return "Space";
      if (lower === "enter") return "Enter";
      if (lower === "escape" || lower === "esc") return "Escape";
      if (lower === "shift") return "ShiftLeft";
      if (lower === "arrowup" || lower === "up") return "ArrowUp";
      if (lower === "arrowdown" || lower === "down") return "ArrowDown";
      if (lower === "arrowleft" || lower === "left") return "ArrowLeft";
      if (lower === "arrowright" || lower === "right") return "ArrowRight";
      if (/^key[a-z]$/.test(lower)) return "Key" + lower.slice(3).toUpperCase();
      if (/^digit[0-9]$/.test(lower)) return "Digit" + lower.slice(5);
      if (/^[a-z]$/.test(lower)) return "Key" + lower.toUpperCase();
      if (/^[0-9]$/.test(raw)) return "Digit" + raw;
      return raw;
    }
    function down(event) {
      var code = normalizeKeyCode(event.code || event.key);
      if (prevent[code]) event.preventDefault();
      if (!keys[code]) pressed[code] = true;
      keys[code] = true;
    }
    function up(event) {
      var code = normalizeKeyCode(event.code || event.key);
      if (prevent[code]) event.preventDefault();
      keys[code] = false;
      released[code] = true;
    }
    function axis2d() {
      var x = 0;
      var y = 0;
      if (keys.ArrowLeft || keys.KeyA) x -= 1;
      if (keys.ArrowRight || keys.KeyD) x += 1;
      if (keys.ArrowUp || keys.KeyW) y -= 1;
      if (keys.ArrowDown || keys.KeyS) y += 1;
      return { x: x, y: y };
    }
    function movement() {
      var axis = axis2d();
      return {
        x: axis.x,
        y: axis.y,
        z: axis.y,
        dx: axis.x,
        dy: axis.y,
        horizontal: axis.x,
        vertical: axis.y,
        right: axis.x,
        forward: -axis.y
      };
    }
    (target || window).addEventListener("keydown", down);
    (target || window).addEventListener("keyup", up);
    return {
      keys: keys,
      isDown: function (code) { return !!keys[normalizeKeyCode(code)]; },
      isPressed: function (code) { return !!keys[normalizeKeyCode(code)]; },
      pressed: function (code) { return !!pressed[normalizeKeyCode(code)]; },
      released: function (code) { return !!released[normalizeKeyCode(code)]; },
      releasedKey: function (code) { return !!released[normalizeKeyCode(code)]; },
      anyDown: function (codes) {
        return (codes || []).some(function (code) { return !!keys[normalizeKeyCode(code)]; });
      },
      axis2d: axis2d,
      getAxis: axis2d,
      getAxis2d: axis2d,
      getAxis2D: axis2d,
      getMovement: movement,
      lookDelta: function () { return { x: 0, y: 0 }; },
      getLookDelta: function () { return { x: 0, y: 0 }; },
      endFrame: function () {
        pressed = {};
        released = {};
      },
      dispose: function () {
        (target || window).removeEventListener("keydown", down);
        (target || window).removeEventListener("keyup", up);
      }
    };
  }

  // Kit-styled HUD chips: setHud() keeps writing into game-supplied
  // [data-hud]/#id nodes when they exist; for keys with no matching node it
  // creates a styled chip inside a kit-owned .vibe-hud bar so scores render
  // without hand-written markup. Chip value spans carry data-hud, so later
  // setHud calls hit the existing fast path.
  function prettifyHudLabel(key) {
    var text = String(key || "")
      .replace(/[_\-]+/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) return String(key || "");
    return text.replace(/(^|\s)[a-z]/g, function (match) {
      return match.toUpperCase();
    });
  }

  function ensureHudStyle() {
    if (document.getElementById("vibe-hud-style")) return;
    var style = document.createElement("style");
    style.id = "vibe-hud-style";
    style.textContent = [
      ".vibe-hud{",
      "--vibe-hud-bg:rgba(12,14,24,0.55);",
      "--vibe-hud-fg:#ffffff;",
      "--vibe-hud-accent:#7dd3fc;",
      "position:absolute;top:10px;left:50%;transform:translateX(-50%);",
      "display:flex;gap:8px;z-index:30;pointer-events:none;",
      "}",
      ".vibe-hud-chip{",
      "background:var(--vibe-hud-bg);color:var(--vibe-hud-fg);",
      "border-radius:999px;padding:4px 12px;",
      "font:inherit;font-size:13px;font-weight:600;line-height:1.3;white-space:nowrap;",
      "-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);",
      "}",
      ".vibe-hud-label{",
      "opacity:0.72;text-transform:uppercase;font-size:10px;",
      "letter-spacing:0.06em;margin-right:6px;",
      "}",
      ".vibe-hud-value{font-variant-numeric:tabular-nums;color:var(--vibe-hud-accent);}"
    ].join("");
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureHudBar(root) {
    if (!root || typeof root.appendChild !== "function") return null;
    var bar = null;
    try {
      bar = root.querySelector ? root.querySelector(".vibe-hud") : null;
    } catch (error) {
      bar = null;
    }
    if (bar) return bar;
    ensureHudStyle();
    bar = document.createElement("div");
    bar.className = "vibe-hud";
    root.appendChild(bar);
    return bar;
  }

  function kitHudChipFor(node) {
    if (!node || typeof node.closest !== "function") return null;
    try {
      return node.closest("[data-vibe-hud-owned]");
    } catch (error) {
      return null;
    }
  }

  function createHudChip(root, key, value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "object") return null;
    try {
      var bar = ensureHudBar(root);
      if (!bar) return null;
      var chip = document.createElement("div");
      chip.className = "vibe-hud-chip";
      chip.setAttribute("data-vibe-hud-owned", "1");
      var label = document.createElement("span");
      label.className = "vibe-hud-label";
      label.textContent = prettifyHudLabel(key);
      var valueNode = document.createElement("span");
      valueNode.className = "vibe-hud-value";
      valueNode.setAttribute("data-hud", key);
      chip.appendChild(label);
      chip.appendChild(valueNode);
      bar.appendChild(chip);
      return valueNode;
    } catch (error) {
      return null;
    }
  }

  function applyHudValue(node, value) {
    var chip = kitHudChipFor(node);
    if (chip) {
      var cleared = value === null || value === undefined;
      chip.style.display = cleared ? "none" : "";
      if (cleared) return;
    }
    node.textContent = String(value);
  }

  // setHud observers let the objective tracker watch the score values games
  // already report, without asking generated code for a second bookkeeping API.
  var hudObservers = [];

  function setHud(values) {
    if (window.VibeGameUI) window.VibeGameUI.setHud(values || {});
    var hudRoot = (activeContext && activeContext.root) || document.getElementById("game-root") || document.body;
    Object.keys(window.VibeGameUI ? {} : values || {}).forEach(function (key) {
      var value = values[key];
      var node = document.querySelector("[data-hud='" + key + "'], #" + key);
      if (!node) {
        node = createHudChip(hudRoot, key, value);
        if (!node) return;
      }
      applyHudValue(node, value);
    });
    for (var observerIndex = 0; observerIndex < hudObservers.length; observerIndex++) {
      try { hudObservers[observerIndex](values || {}); } catch (error) {}
    }
  }

  /* Kit-owned goal loop. The scaffold declares GAME.winCondition
     ({ type, count, targetAssetId, label }) and mount passes it through; the
     runner renders a goal-progress HUD chip, auto-tracks the mechanical goal
     shapes, and fires a win/lose overlay — so every game keeps a working,
     visible goal even when the generated body never wires one. Auto progress
     tracking stands down the moment game code drives ctx.objective manually;
     the overlay and HUD chip stay kit-owned either way.

     Auto-tracking signals per type:
     - collect/defeat: objects makeAsset-tagged with the matching role (or
       winCondition.targetAssetId) that leave the scene or turn invisible
       count as collected/defeated.
     - reach: player-tagged object within reach radius of the goal-tagged
       object, armed only after the two have actually been apart.
     - survive: run clock (resets with ctx.restart()).
     - score: the largest numeric score/points value games pass to setHud. */
  var WIN_CONDITION_TYPES = ["collect", "reach", "defeat", "survive", "score"];
  var OBJECTIVE_OVERLAY_ID = "vibe-objective-outcome";
  var OBJECTIVE_MIN_ELAPSED_SECONDS = 3;
  var OBJECTIVE_SCAN_INTERVAL_SECONDS = 0.5;
  var OBJECTIVE_REACH_RADIUS = 2.75;

  function normalizeWinCondition(raw) {
    if (!raw || typeof raw !== "object") return null;
    var type = String(raw.type || "").toLowerCase();
    if (WIN_CONDITION_TYPES.indexOf(type) === -1) return null;
    var count = Math.round(Number(raw.count));
    if (!Number.isFinite(count) || count <= 0) count = 0;
    return {
      type: type,
      count: count,
      targetAssetId: String(raw.targetAssetId || "").trim().toLowerCase(),
      label: String(raw.label || "").trim().slice(0, 40)
    };
  }

  function ensureObjectiveStyle() {
    if (document.getElementById("vibe-objective-style")) return;
    var style = document.createElement("style");
    style.id = "vibe-objective-style";
    style.textContent = [
      "#" + OBJECTIVE_OVERLAY_ID + "{position:fixed;inset:0;z-index:2147482600;display:flex;align-items:center;justify-content:center;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
      "#" + OBJECTIVE_OVERLAY_ID + " .voc-card{pointer-events:auto;background:rgba(12,14,24,.9);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:16px;padding:22px 28px;max-width:min(92vw,420px);text-align:center;box-shadow:0 16px 44px rgba(0,0,0,.45);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}",
      "#" + OBJECTIVE_OVERLAY_ID + " .voc-title{font-size:26px;font-weight:800;margin-bottom:8px}",
      "#" + OBJECTIVE_OVERLAY_ID + "[data-outcome='win'] .voc-title{color:#86efac}",
      "#" + OBJECTIVE_OVERLAY_ID + "[data-outcome='lose'] .voc-title{color:#fca5a5}",
      "#" + OBJECTIVE_OVERLAY_ID + " .voc-detail{font-size:14px;opacity:.85;margin-bottom:16px}",
      "#" + OBJECTIVE_OVERLAY_ID + " .voc-actions{display:flex;gap:10px;justify-content:center}",
      "#" + OBJECTIVE_OVERLAY_ID + " button{border:1px solid rgba(255,255,255,.4);border-radius:999px;background:rgba(59,130,246,.85);color:#fff;font:700 14px/1 system-ui,sans-serif;padding:10px 18px;cursor:pointer}",
      "#" + OBJECTIVE_OVERLAY_ID + " button.voc-secondary{background:rgba(255,255,255,.12)}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function createObjectiveRunner(bound) {
    var condition = null;
    var objectiveText = "";
    var manual = false;
    var outcome = null;
    var progressValue = 0;
    var baselineSeen = 0;
    var prevLive = -1;
    var scoreSeen = 0;
    var runElapsed = 0;
    var scanAccum = 0;
    var reachArmed = false;
    var lastHudText = null;
    var hudObserver = null;
    var disposed = false;
    var playerScratch = null;
    var goalScratch = null;

    function targetValue() {
      if (!condition) return 0;
      if (condition.type === "survive") return condition.count || 60;
      if (condition.type === "collect" || condition.type === "defeat") {
        if (manual || !baselineSeen) return condition.count || baselineSeen;
        // Never demand more items than the game ever spawned.
        return condition.count ? Math.min(condition.count, baselineSeen) : baselineSeen;
      }
      return condition.count || 0;
    }

    function describe() {
      if (!condition) return null;
      return {
        type: condition.type,
        label: condition.label || null,
        target: targetValue() || null,
        progress: progressValue,
        outcome: outcome
      };
    }

    function syncStatus() {
      bound.status.objective = describe();
    }

    function matchesTarget(data, role) {
      if (!data) return false;
      if (
        condition.targetAssetId &&
        String(data.vibeAssetId || "").trim().toLowerCase() === condition.targetAssetId
      ) {
        return true;
      }
      return String(data.vibeGameRole || "") === role;
    }

    function objectIsLive(object) {
      var node = object;
      while (node) {
        if (node.visible === false) return false;
        if (node === bound.scene) return true;
        node = node.parent;
      }
      return false;
    }

    function countLive(role) {
      var count = 0;
      bound.scene.traverse(function (node) {
        if (!node || !node.userData) return;
        if (!matchesTarget(node.userData, role)) return;
        if (objectIsLive(node)) count += 1;
      });
      return count;
    }

    function hudText() {
      if (!condition || condition.type === "reach") return null;
      var target = targetValue();
      if (!target) return null;
      var shown = Math.min(progressValue, target);
      if (condition.type === "survive") return shown + "/" + target + "s";
      return shown + "/" + target;
    }

    function updateHud() {
      var text = hudText();
      if (text === lastHudText) return;
      lastHudText = text;
      if (text != null) bound.setHud({ goal: text });
    }

    function removeOverlay() {
      var node = document.getElementById(OBJECTIVE_OVERLAY_ID);
      if (node && node.parentNode) node.parentNode.removeChild(node);
    }

    function renderOverlay(result) {
      if (!document || !document.body) return;
      removeOverlay();
      ensureObjectiveStyle();
      var root = document.createElement("div");
      root.id = OBJECTIVE_OVERLAY_ID;
      root.setAttribute("data-vibe-objective-outcome", result);
      root.setAttribute("data-outcome", result);
      var card = document.createElement("div");
      card.className = "voc-card";
      card.setAttribute("role", "status");
      var title = document.createElement("div");
      title.className = "voc-title";
      title.textContent = result === "win" ? "You win!" : "Game over";
      card.appendChild(title);
      var detailText = objectiveText || objectiveDetailFallback();
      if (detailText) {
        var detail = document.createElement("div");
        detail.className = "voc-detail";
        detail.textContent = detailText;
        card.appendChild(detail);
      }
      var actions = document.createElement("div");
      actions.className = "voc-actions";
      var restartButton = document.createElement("button");
      restartButton.type = "button";
      restartButton.textContent = "Play again";
      restartButton.addEventListener("click", function () {
        if (typeof bound.requestRestart === "function") bound.requestRestart("objective-" + result);
      });
      actions.appendChild(restartButton);
      if (result === "win") {
        var keepButton = document.createElement("button");
        keepButton.type = "button";
        keepButton.className = "voc-secondary";
        keepButton.textContent = "Keep playing";
        keepButton.addEventListener("click", removeOverlay);
        actions.appendChild(keepButton);
      }
      card.appendChild(actions);
      root.appendChild(card);
      document.body.appendChild(root);
    }

    function objectiveDetailFallback() {
      if (!condition) return "";
      var described = describe();
      if (!described || !described.target) return "";
      return "Goal: " + described.progress + "/" + described.target +
        (condition.label ? " " + condition.label : "");
    }

    function finish(result) {
      if (disposed || !condition || outcome) return;
      outcome = result;
      bound.status.outcome = result;
      bound.status.outcomeAt = Date.now();
      syncStatus();
      updateHud();
      renderOverlay(result);
    }

    function autoWinReady() {
      return runElapsed > OBJECTIVE_MIN_ELAPSED_SECONDS;
    }

    function updateCountedGoal(role) {
      var live = countLive(role);
      if (prevLive === -1) {
        prevLive = live;
        baselineSeen = live;
      }
      if (live > baselineSeen) baselineSeen = live;
      if (live < prevLive) progressValue += prevLive - live;
      prevLive = live;
      var target = targetValue();
      if (autoWinReady() && target > 0 && progressValue >= target) finish("win");
    }

    function updateReach() {
      var player = null;
      var goal = null;
      bound.scene.traverse(function (node) {
        var data = node && node.userData;
        if (!data) return;
        if (!player && String(data.vibeGameRole || "") === "player") player = node;
        if (!goal && matchesTarget(data, "goal")) goal = node;
      });
      if (!player || !goal || player === goal) return;
      if (!objectIsLive(goal)) return;
      if (!playerScratch) playerScratch = new bound.THREE.Vector3();
      if (!goalScratch) goalScratch = new bound.THREE.Vector3();
      player.getWorldPosition(playerScratch);
      goal.getWorldPosition(goalScratch);
      var distance = playerScratch.distanceTo(goalScratch);
      if (distance > OBJECTIVE_REACH_RADIUS * 2) reachArmed = true;
      if (reachArmed && autoWinReady() && distance <= OBJECTIVE_REACH_RADIUS) finish("win");
    }

    function update(dt) {
      if (disposed || !condition || outcome) return;
      runElapsed += Number(dt) || 0;
      if (condition.type === "survive") {
        progressValue = Math.floor(runElapsed);
        updateHud();
        if (progressValue >= targetValue()) finish("win");
        return;
      }
      if (manual) return;
      if (condition.type === "score") {
        if (scoreSeen > progressValue) {
          progressValue = Math.floor(scoreSeen);
          syncStatus();
          updateHud();
        }
        var scoreTarget = targetValue();
        if (autoWinReady() && scoreTarget > 0 && progressValue >= scoreTarget) finish("win");
        return;
      }
      scanAccum += Number(dt) || 0;
      if (scanAccum < OBJECTIVE_SCAN_INTERVAL_SECONDS) return;
      scanAccum = 0;
      var before = progressValue;
      if (condition.type === "collect") updateCountedGoal("collectible");
      else if (condition.type === "defeat") updateCountedGoal("hazard");
      else if (condition.type === "reach") updateReach();
      if (progressValue !== before) syncStatus();
      updateHud();
    }

    function manualWinCheck() {
      var target = targetValue();
      if (target > 0 && progressValue >= target) finish("win");
    }

    var api = {
      describe: describe,
      progress: function (amount) {
        if (!condition || outcome || disposed) return describe();
        manual = true;
        var step = Number(amount);
        progressValue += Number.isFinite(step) && step !== 0 ? step : 1;
        if (progressValue < 0) progressValue = 0;
        syncStatus();
        updateHud();
        manualWinCheck();
        return describe();
      },
      setProgress: function (value) {
        if (!condition || outcome || disposed) return describe();
        manual = true;
        var next = Number(value);
        progressValue = Number.isFinite(next) && next > 0 ? next : 0;
        syncStatus();
        updateHud();
        manualWinCheck();
        return describe();
      },
      complete: function () {
        manual = true;
        finish("win");
        return describe();
      },
      fail: function () {
        manual = true;
        finish("lose");
        return describe();
      }
    };

    function configure(rawCondition, rawObjectiveText) {
      condition = normalizeWinCondition(rawCondition);
      objectiveText = String(rawObjectiveText || "").replace(/\s+/g, " ").trim().slice(0, 140);
      if (condition && condition.type === "score" && !hudObserver) {
        hudObserver = function (values) {
          if (disposed || manual || outcome) return;
          var value = Number(values && (values.score != null ? values.score : values.points));
          if (Number.isFinite(value) && value > scoreSeen) scoreSeen = value;
        };
        hudObservers.push(hudObserver);
      }
      syncStatus();
      updateHud();
    }

    function reset() {
      outcome = null;
      manual = false;
      progressValue = 0;
      baselineSeen = 0;
      prevLive = -1;
      scoreSeen = 0;
      runElapsed = 0;
      scanAccum = 0;
      reachArmed = false;
      lastHudText = null;
      bound.status.outcome = null;
      bound.status.outcomeAt = null;
      syncStatus();
      updateHud();
      removeOverlay();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      removeOverlay();
      if (hudObserver) {
        var index = hudObservers.indexOf(hudObserver);
        if (index !== -1) hudObservers.splice(index, 1);
        hudObserver = null;
      }
    }

    return {
      api: api,
      configure: configure,
      update: update,
      reset: reset,
      dispose: dispose
    };
  }

  // Style plans arrive model-authored, so lighting values show up as numbers,
  // numeric strings, or nested { color, intensity } objects. Anything that is
  // not a finite positive number must fall back instead of reaching the
  // shader: an object-valued intensity multiplies to NaN and silently renders
  // the whole scene black.
  function lightIntensityValue(value, fallback) {
    if (value && typeof value === "object") value = value.intensity;
    var intensity = Number(value);
    if (!Number.isFinite(intensity) || intensity <= 0) return fallback;
    return Math.min(intensity, 8);
  }

  function lightColorValue(value, fallback) {
    if (value && typeof value === "object" && typeof value.color !== "undefined") value = value.color;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^#?[0-9a-fA-F]{6}$/.test(value.trim())) {
      return parseInt(value.trim().replace(/^#/, ""), 16);
    }
    return fallback;
  }

  function addDefaultLighting(THREE, scene, options) {
    var ambient = new THREE.AmbientLight(
      lightColorValue(options && options.ambientColor, 0xffffff),
      lightIntensityValue(options && options.ambientIntensity, 0.68)
    );
    var directional = new THREE.DirectionalLight(
      lightColorValue(options && options.directionalColor, 0xffffff),
      lightIntensityValue(options && options.directionalIntensity, 1.25)
    );
    directional.position.set(7, 12, 8);
    // ctx.look.apply (three-look.js) replaces exactly these two lights.
    [ambient, directional].forEach(function (light) {
      if (light.userData && typeof light.userData === "object") light.userData.vibeKitDefaultLight = true;
    });
    scene.add(ambient);
    scene.add(directional);
    return { ambient: ambient, directional: directional };
  }

  function yawForDirection(dir) {
    var x = Number(dir && dir.x) || 0;
    var z = Number(dir && dir.z) || 0;
    if (Math.abs(x) + Math.abs(z) < 0.000001) return 0;
    return Math.atan2(-x, -z);
  }

  function faceDirection(object, dir) {
    if (!object || !object.rotation) return object;
    var x = Number(dir && dir.x) || 0;
    var z = Number(dir && dir.z) || 0;
    if (Math.abs(x) + Math.abs(z) < 0.000001) return object;
    object.rotation.y = yawForDirection({ x: x, z: z });
    return object;
  }

  function forwardFromYaw(THREE, yaw) {
    var vector = new THREE.Vector3(-Math.sin(yaw || 0), 0, -Math.cos(yaw || 0));
    return vector.normalize ? vector.normalize() : vector;
  }

  // Ground move for an axis2d() value as the camera shows it: right/D is always
  // screen-right, up/W away from the camera (up the screen when looking down).
  function cameraMove(THREE, camera, axis) {
    var x = Number(axis && axis.x) || 0;
    var y = Number(axis && axis.y) || 0;
    var rightX = 1;
    var rightZ = 0;
    if (camera && camera.matrixWorld) {
      if (typeof camera.updateMatrixWorld === "function") camera.updateMatrixWorld();
      var e = camera.matrixWorld.elements;
      var flat = Math.hypot(e[0], e[2]);
      if (flat > 0.000001) {
        rightX = e[0] / flat;
        rightZ = e[2] / flat;
      }
    }
    // Screen-up on the ground is worldUp x screenRight = (rightZ, 0, -rightX).
    var moveX = rightX * x - rightZ * y;
    var moveZ = rightZ * x + rightX * y;
    var length = Math.hypot(moveX, moveZ);
    if (length > 1) {
      moveX /= length;
      moveZ /= length;
    }
    return new THREE.Vector3(moveX, 0, moveZ);
  }

  function normalizedForwardAxis(axis) {
    var value = String(axis || "-Z").trim().toUpperCase();
    if (value === "-Z" || value === "+Z" || value === "+X" || value === "-X") return value;
    return "-Z";
  }

  function axisYaw(axis) {
    switch (normalizedForwardAxis(axis)) {
      case "-Z": return 0;
      case "+Z": return Math.PI;
      case "-X": return -Math.PI / 2;
      case "+X":
      default: return Math.PI / 2;
    }
  }

  function orientForward(THREE, object, sourceAxis) {
    if (!THREE) throw new Error("THREE global is not available.");
    if (!object) throw new Error("orientForward requires an Object3D.");
    var existingData = object.userData || {};
    var existingAssetData = existingData.asset || {};
    var existingOrientation = existingAssetData.orientation || existingData.orientation || {};
    var normalizedAxis = normalizedForwardAxis(
      sourceAxis ||
      existingOrientation.sourceForwardAxis ||
      existingAssetData.sourceForwardAxis ||
      existingData.sourceForwardAxis
    );
    var orientation = { sourceForwardAxis: normalizedAxis, forwardAxis: "-Z" };
    var placement = existingAssetData.placement || existingData.placement || null;
    if (placement && typeof placement === "object") {
      placement.forwardAxis = "-Z";
      placement.orientation = orientation;
      placement.anchors = placement.anchors && typeof placement.anchors === "object" ? placement.anchors : {};
      if (!placement.anchors.forward) placement.anchors.forward = "-Z";
    }
    var assetData = Object.assign({}, existingAssetData, {
      placement: placement,
      forwardAxis: "-Z",
      sourceForwardAxis: normalizedAxis,
      orientation: orientation
    });
    var userData = Object.assign({}, existingData, {
      asset: assetData,
      placement: placement,
      orientation: orientation,
      forwardAxis: "-Z",
      sourceForwardAxis: normalizedAxis
    });
    object.userData = userData;
    // Pack factories hand out models already normalized to -Z forward (their
    // userData.orientation.forwardAxis is stamped "-Z"); re-orienting one is a
    // no-op. This must NOT fall through to the wrapper path: Object3D.add
    // reparents, so wrapping an object that is already in the scene silently
    // detaches it when the caller discards the returned wrapper — the player
    // simply vanishes with no error.
    if (existingOrientation && existingOrientation.forwardAxis === "-Z") {
      return object;
    }
    if (object.parent) {
      // Already parented (typically scene.add ran first): rotate in place and
      // hand the same object back instead of re-wrapping it out of the scene.
      if (object.rotation) object.rotation.y = (object.rotation.y || 0) + axisYaw(normalizedAxis);
      return object;
    }
    var wrapper = new THREE.Group();
    wrapper.name = object.name || "";
    if (object.position && wrapper.position && typeof wrapper.position.copy === "function") {
      wrapper.position.copy(object.position);
      if (typeof object.position.set === "function") object.position.set(0, 0, 0);
    }
    if (object.rotation) object.rotation.y = (object.rotation.y || 0) + axisYaw(normalizedAxis);
    wrapper.add(object);
    wrapper.userData = userData;
    return wrapper;
  }

  function orientForwardAsset(first, second, third) {
    var THREE = first && first.Group ? first : getThree();
    var object = first && first.Group ? second : first;
    var sourceAxis = first && first.Group ? third : second;
    return orientForward(THREE, object, sourceAxis);
  }

  function getPlacement(object) {
    var current = object || null;
    while (current) {
      var data = current.userData || {};
      if (data.asset && data.asset.placement) return data.asset.placement;
      if (data.placement) return data.placement;
      current = current.parent || null;
    }
    return null;
  }

  function numeric(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function scaledColliderDimensions(THREE, object, placement, options) {
    var collider = (options && options.collider) || (placement && placement.collider) || {};
    var footprint = (placement && placement.footprint) || {};
    var width = numeric(collider.width, numeric(footprint.width, 1));
    var height = numeric(collider.height, numeric(footprint.height, 1));
    var depth = numeric(collider.depth, numeric(footprint.depth, 1));
    var scale = new THREE.Vector3(1, 1, 1);
    if (object && typeof object.getWorldScale === "function") object.getWorldScale(scale);
    else if (object && object.scale) scale.copy(object.scale);
    var dimensions = {
      width: Math.max(0.001, width * Math.abs(numeric(scale.x, 1))),
      height: Math.max(0.001, height * Math.abs(numeric(scale.y, 1))),
      depth: Math.max(0.001, depth * Math.abs(numeric(scale.z, 1)))
    };
    // Catalog metadata can claim a bigger body than the mesh has (a low, long
    // rodent tagged with an upright footprint) and games rescale assets by
    // their visual height, so the collider grew past the geometry and hit an
    // island the player visibly cleared (2026-09-04). Never exceed the mesh.
    if (!(options && options.collider) && object && object.isObject3D) {
      var geometryBox = new THREE.Box3().setFromObject(object);
      if (!geometryBox.isEmpty()) {
        var size = geometryBox.getSize(new THREE.Vector3());
        dimensions.width = Math.min(dimensions.width, Math.max(0.001, size.x));
        dimensions.height = Math.min(dimensions.height, Math.max(0.001, size.y));
        dimensions.depth = Math.min(dimensions.depth, Math.max(0.001, size.z));
      }
    }
    return dimensions;
  }

  function assetTypeForPlacementObject(object) {
    var current = object || null;
    while (current) {
      var data = current.userData || {};
      if (data.asset && data.asset.type) return String(data.asset.type);
      current = current.parent || null;
    }
    return "";
  }

  function worldPositionForObject(THREE, object) {
    var position = new THREE.Vector3();
    if (!object) return position;
    if (typeof object.getWorldPosition === "function") return object.getWorldPosition(position);
    if (object.position) position.copy(object.position);
    return position;
  }

  function colliderBox(object, options) {
    options = options || {};
    var THREE = options.THREE || getThree();
    if (!THREE) throw new Error("THREE global is not available.");
    if (!object || !object.position) throw new Error("colliderBox requires a THREE.Object3D.");
    if (typeof object.updateMatrixWorld === "function") object.updateMatrixWorld(true);
    var placement = options.placement || getPlacement(object) || {};
    var hasDeclaredDimensions = !!(
      (placement.collider &&
        (placement.collider.width || placement.collider.height || placement.collider.depth)) ||
      (placement.footprint &&
        (placement.footprint.width || placement.footprint.height || placement.footprint.depth)) ||
      (options.collider &&
        (options.collider.width || options.collider.height || options.collider.depth))
    );
    if (!hasDeclaredDimensions && object.isObject3D) {
      // Raw meshes/groups without placement metadata (freehand platforms,
      // hand-built props) must collide as their TRUE geometry. The old
      // fallback fabricated a 1x1x1 box at the object's center, so a 6x6
      // platform was a phantom cube: players rested 0.65 above the deck and
      // fell through it mid-platform ("the collision box of the ground is
      // not being created", 2026-07-14).
      var geometryBox = new THREE.Box3().setFromObject(object);
      if (!geometryBox.isEmpty()) {
        var geometryInflate = Math.max(0, numeric(options.inflate, 0));
        if (geometryInflate > 0) geometryBox.expandByScalar(geometryInflate);
        return geometryBox;
      }
    }
    var dimensions = scaledColliderDimensions(THREE, object, placement, options);
    var anchor = options.anchor || placement.anchor || {};
    var position = options.position || worldPositionForObject(THREE, object);
    var anchorX = numeric(anchor.x, 0);
    var anchorY = numeric(anchor.y, 0);
    var anchorZ = numeric(anchor.z, 0);
    var centerX = numeric(position.x, 0) + anchorX;
    var centerZ = numeric(position.z, 0) + anchorZ;
    var assetType = String(options.assetType || assetTypeForPlacementObject(object)).toLowerCase();
    var placementKind = String(placement.kind || "").toLowerCase();
    var mode = String(options.mode || (placement.collider && placement.collider.mode) || "").toLowerCase();
    var baseY = numeric(position.y, 0) + anchorY;
    var minY = baseY;
    var maxY = baseY + dimensions.height;
    if (assetType === "terrain" || placementKind === "surface" || mode === "surface" || options.surface === true) {
      minY = baseY - dimensions.height;
      maxY = baseY;
    } else if (options.centered === true || mode === "trigger") {
      minY = baseY - dimensions.height / 2;
      maxY = baseY + dimensions.height / 2;
    }
    var inflate = Math.max(0, numeric(options.inflate, 0));
    return new THREE.Box3(
      new THREE.Vector3(
        centerX - dimensions.width / 2 - inflate,
        minY - inflate,
        centerZ - dimensions.depth / 2 - inflate
      ),
      new THREE.Vector3(
        centerX + dimensions.width / 2 + inflate,
        maxY + inflate,
        centerZ + dimensions.depth / 2 + inflate
      )
    );
  }

  function isBox3Like(value) {
    return !!(
      value
      && value.min
      && value.max
      && typeof value.intersectsBox === "function"
    );
  }

  function solidEntriesFor(solid) {
    if (!solid) return [];
    if (Array.isArray(solid)) return solid;
    if (solid.solids && Array.isArray(solid.solids)) return solid.solids;
    if (solid.tiles && Array.isArray(solid.tiles)) return solid.tiles;
    var solidObject = solid.object || solid.group || solid;
    var data = solidObject && solidObject.userData ? solidObject.userData : {};
    if (Array.isArray(data.terrainSolids)) return data.terrainSolids;
    if (data.terrain && Array.isArray(data.terrain.solids)) return data.terrain.solids;
    if (Array.isArray(data.terrainTiles)) return data.terrainTiles;
    return [solid];
  }

  function solidBoxFor(solid, bound) {
    if (!solid) return null;
    if (isBox3Like(solid)) return solid;
    if (solid.box && isBox3Like(solid.box)) return solid.box;
    var solidObject = solid.object || solid;
    if (!solidObject || !solidObject.position) return null;
    var solidOptions = solid.object ? solid : {};
    if (solid.boxOptions) solidOptions = Object.assign({}, solidOptions, solid.boxOptions);
    return colliderBox(solidObject, Object.assign({}, bound, solidOptions));
  }

  function setMoveVector(target, move) {
    move = move || {};
    var x = numeric(move.x, 0);
    var z = numeric(move.z, 0);
    var length = Math.sqrt(x * x + z * z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    if (target && typeof target.set === "function") {
      target.set(x, 0, z);
    } else if (target) {
      target.x = x;
      target.y = 0;
      target.z = z;
    }
    return target;
  }

  function createPhysicsHelpers(bound) {
    bound = bound || {};
    return {
      colliderBox: function (object, options) {
        return colliderBox(object, Object.assign({}, bound, options || {}));
      },
      createKinematicBody: function (object, options) {
        options = options || {};
        var THREE = options.THREE || bound.THREE || getThree();
        if (!THREE) throw new Error("THREE global is not available.");
        if (!object || !object.position) throw new Error("createKinematicBody requires a THREE.Object3D.");
        var pendingMove = new THREE.Vector3(0, 0, 0);
        var spawnPosition = object.position.clone
          ? object.position.clone()
          : new THREE.Vector3(numeric(object.position.x, 0), numeric(object.position.y, 0), numeric(object.position.z, 0));
        // Report the body's per-frame config and its peak ground speed to the
        // kit status: the headless check rejects per-second values pasted into
        // per-frame fields (moveSpeed 7.2 = 430 units/s, one keypress into the
        // void, 2026-09-04).
        function reportBodyStep(dt, startX, startZ) {
          var kitStatus = typeof window !== "undefined" ? window.__VIBE_3D_STATUS__ : null;
          if (!kitStatus) return;
          var seconds = Math.max(1 / 240, numeric(dt, 1 / 60));
          var moved = Math.hypot(object.position.x - startX, object.position.z - startZ);
          var info =
            kitStatus.kinematicBody ||
            (kitStatus.kinematicBody = { peakSpeed: 0, minY: Infinity, everGrounded: false, steps: 0 });
          info.moveSpeed = body.moveSpeed;
          info.gravity = body.gravity;
          info.jumpPower = body.jumpPower;
          info.steps += 1;
          var rate = Math.round((moved / seconds) * 10) / 10;
          if (rate > info.peakSpeed) info.peakSpeed = rate;
          // A body that never lands, or falls far, with no input has no floor under its spawn.
          var y = numeric(object.position.y, 0);
          if (y < info.minY) info.minY = Math.round(y * 100) / 100;
          if (body.onGround) info.everGrounded = true;
        }
        var body = {
          object: object,
          velocity: options.velocity || new THREE.Vector3(0, 0, 0),
          pendingMove: pendingMove,
          onGround: false,
          gravity: numeric(options.gravity, 0.015),
          jumpPower: numeric(options.jumpPower, 0.25),
          moveSpeed: numeric(options.moveSpeed, 0.1),
          colliderOptions: options.colliderOptions || {},
          colliderBox: function (boxOptions) {
            return colliderBox(object, Object.assign({}, bound, body.colliderOptions, boxOptions || {}));
          },
          isGrounded: function () {
            return !!body.onGround;
          },
          reset: function (position) {
            var nextPosition = position || spawnPosition;
            if (object.position.copy && nextPosition && typeof nextPosition.x !== "undefined") {
              object.position.copy(nextPosition);
            } else if (nextPosition) {
              object.position.x = numeric(nextPosition.x, object.position.x);
              object.position.y = numeric(nextPosition.y, object.position.y);
              object.position.z = numeric(nextPosition.z, object.position.z);
            }
            if (body.velocity && typeof body.velocity.set === "function") body.velocity.set(0, 0, 0);
            else body.velocity = new THREE.Vector3(0, 0, 0);
            setMoveVector(body.pendingMove, null);
            body.onGround = false;
            return body;
          },
          jump: function (power) {
            if (!body.onGround) return false;
            body.velocity.y = numeric(power, body.jumpPower);
            body.onGround = false;
            return true;
          },
          move: function (dir) {
            setMoveVector(body.pendingMove, dir);
            return body;
          },
          update: function (first, second) {
            var updateOptions = {};
            var solids = [];
            var dt = 1 / 60;
            if (Array.isArray(first)) {
              solids = first;
              dt = numeric(second, dt);
            } else if (typeof first === "number") {
              dt = first;
              if (Array.isArray(second)) {
                solids = second;
              } else if (second && typeof second === "object") {
                updateOptions = second;
                solids = Array.isArray(updateOptions.solids) ? updateOptions.solids : [];
              }
            } else if (first && typeof first === "object") {
              updateOptions = first;
              dt = numeric(updateOptions.dt, dt);
              solids = Array.isArray(updateOptions.solids) ? updateOptions.solids : [];
            }
            var result = body.step(dt, {
              move: updateOptions.move || body.pendingMove,
              solids: solids,
              jumpPressed: !!updateOptions.jumpPressed,
              jumpPower: updateOptions.jumpPower
            });
            setMoveVector(body.pendingMove, null);
            return result;
          },
          step: function (dt, stepOptions) {
            stepOptions = stepOptions || {};
            var stepStartX = numeric(object.position.x, 0);
            var stepStartZ = numeric(object.position.z, 0);
            var timeScale = Math.max(0.1, Math.min(4, numeric(dt, 1 / 60) * 60));
            var move = stepOptions.move || {};
            if (stepOptions.jumpPressed) body.jump(stepOptions.jumpPower);
            var moveX = numeric(move.x, 0);
            var moveZ = numeric(move.z, 0);
            // The contract is a UNIT direction — the body applies moveSpeed.
            // Games regularly pass pre-scaled vectors (direction × their own
            // speed constant → speed² ≈ frozen player while the camera still
            // swings, "controls don't work", 2026-07-14) or raw key diagonals
            // (length √2 → 41% speed boost). Re-normalize outside the analog
            // deflection band instead of moving at the wrong speed.
            var moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
            if (moveLength > 1.0001 || (moveLength > 0 && moveLength < 0.25)) {
              moveX /= moveLength;
              moveZ /= moveLength;
            }
            object.position.x += moveX * body.moveSpeed * timeScale;
            object.position.z += moveZ * body.moveSpeed * timeScale;
            var previousBox = body.colliderBox();
            body.velocity.y -= body.gravity * timeScale;
            object.position.y += body.velocity.y * timeScale;
            body.onGround = false;
            var solids = Array.isArray(stepOptions.solids) ? stepOptions.solids : [];
            solids.forEach(function (solid) {
              solidEntriesFor(solid).forEach(function (solidEntry) {
                var playerBox = body.colliderBox();
                var solidBox = solidBoxFor(solidEntry, bound);
                if (!solidBox) return;
                if (!playerBox.intersectsBox(solidBox)) return;
                var overlapX = Math.min(playerBox.max.x - solidBox.min.x, solidBox.max.x - playerBox.min.x);
                var overlapY = Math.min(playerBox.max.y - solidBox.min.y, solidBox.max.y - playerBox.min.y);
                var overlapZ = Math.min(playerBox.max.z - solidBox.min.z, solidBox.max.z - playerBox.min.z);
                var wasAbove = previousBox.min.y >= solidBox.max.y - Math.max(0.12, Math.abs(body.velocity.y * timeScale) + 0.04);
                if (body.velocity.y <= 0 && wasAbove && overlapY <= Math.max(overlapX, overlapZ) + 0.2) {
                  object.position.y += solidBox.max.y - playerBox.min.y;
                  body.velocity.y = 0;
                  body.onGround = true;
                  return;
                }
                if (overlapX < overlapZ) {
                  object.position.x += playerBox.min.x < solidBox.min.x ? -overlapX : overlapX;
                } else {
                  object.position.z += playerBox.min.z < solidBox.min.z ? -overlapZ : overlapZ;
                }
              });
            });
            reportBodyStep(dt, stepStartX, stepStartZ);
            return {
              onGround: body.onGround,
              velocity: body.velocity,
              box: body.colliderBox()
            };
          }
        };
        return body;
      }
    };
  }

  function getAnimation(object) {
    var current = object || null;
    while (current) {
      var data = current.userData || {};
      if (data.assetAnimation && typeof data.assetAnimation.update === "function") return data.assetAnimation;
      current = current.parent || null;
    }
    var found = null;
    if (object && typeof object.traverse === "function") {
      object.traverse(function (child) {
        if (found) return;
        var data = child && child.userData ? child.userData : {};
        if (data.assetAnimation && typeof data.assetAnimation.update === "function") found = data.assetAnimation;
      });
    }
    return found;
  }

  function animationTime(elapsed) {
    var value = Number(elapsed);
    if (Number.isFinite(value)) return value;
    return typeof performance !== "undefined" && performance.now ? performance.now() * 0.001 : Date.now() * 0.001;
  }

  function animateAsset(object, mode, elapsed) {
    var api = getAnimation(object);
    if (!api) return object;
    if (typeof elapsed === "undefined" && typeof mode === "number") {
      elapsed = mode;
      mode = null;
    }
    api.update(mode || api.state || "idle", animationTime(elapsed));
    return object;
  }

  function setAssetAnimation(object, mode) {
    var api = getAnimation(object);
    if (!api) return object;
    if (typeof api.setState === "function") api.setState(mode);
    else api.state = mode || "idle";
    return object;
  }

  function playAssetAction(object, elapsed, duration) {
    var api = getAnimation(object);
    if (!api) return object;
    if (typeof api.playAction === "function") api.playAction(animationTime(elapsed), duration);
    else api.update("action", animationTime(elapsed));
    return object;
  }

  function positiveNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function normalizeTerrainAxis(axis) {
    var value = String(axis || "z").trim().toLowerCase();
    return value === "x" || value === "y" || value === "z" ? value : "z";
  }

  function terrainDimensionKey(axis) {
    if (axis === "x") return "width";
    if (axis === "y") return "height";
    return "depth";
  }

  function terrainAxisSpan(placement, axis) {
    var key = terrainDimensionKey(axis);
    var footprint = positiveNumber(placement && placement.footprint && placement.footprint[key]);
    var collider = positiveNumber(placement && placement.collider && placement.collider[key]);
    if (footprint && collider) return Math.min(footprint, collider);
    return footprint || collider || 1;
  }

  function terrainIsSolid(placement) {
    return String(placement && placement.collider && placement.collider.mode || "").toLowerCase() === "solid";
  }

  function terrainSpacingForAxis(placement, axis, requestedSpacing, allowGaps, overlapValue) {
    var span = terrainAxisSpan(placement, axis);
    var requested = positiveNumber(requestedSpacing) || span;
    if (allowGaps) return Math.max(0.001, requested);
    var overlap = positiveNumber(overlapValue) || Math.max(0.01, span * 0.01);
    return Math.max(0.001, Math.min(requested, span) - overlap);
  }

  function normalizeTerrainTileForTiling(tile, placement) {
    var tiling = placement && placement.tiling;
    if (!tile || !tiling || tiling.allowGaps === true) return tile;
    if (tile.rotation && typeof tile.rotation.set === "function") {
      tile.rotation.set(0, 0, 0);
    } else if (tile.rotation) {
      tile.rotation.x = 0;
      tile.rotation.y = 0;
      tile.rotation.z = 0;
    }
    return tile;
  }

  function terrainAnchorCoordinate(anchor, axis) {
    if (typeof anchor === "number") return Number.isFinite(anchor) ? anchor : 0;
    if (anchor && anchor.position) return Number(anchor.position[axis]) || 0;
    if (anchor && typeof anchor[axis] !== "undefined") return Number(anchor[axis]) || 0;
    return 0;
  }

  function normalizeTerrainHelperOptions(primary, secondary) {
    if (typeof primary === "function" || typeof primary === "string") {
      var options = Object.assign({}, secondary || {});
      options.factory = primary;
      return options;
    }
    return primary || {};
  }

  function terrainVector3(THREE, value) {
    if (!value) return null;
    if (value.isVector3 && typeof value.clone === "function") return value.clone();
    if (Array.isArray(value)) {
      return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    }
    if (typeof value === "object") {
      return new THREE.Vector3(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
    }
    return null;
  }

  function terrainMaterialBakeKey(material) {
    if (!material || Array.isArray(material) || !material.color) return null;
    var type = material.type || "";
    if (
      type !== "MeshStandardMaterial" &&
      type !== "MeshLambertMaterial" &&
      type !== "MeshPhongMaterial" &&
      type !== "MeshBasicMaterial"
    ) {
      return null;
    }
    if (material.map || material.transparent === true || material.alphaTest) return null;
    return [
      type,
      material.flatShading ? 1 : 0,
      typeof material.metalness === "number" ? material.metalness : "",
      typeof material.roughness === "number" ? material.roughness : "",
      material.emissive && material.emissive.getHex ? material.emissive.getHex() : 0,
      material.side || 0
    ].join("|");
  }

  function concatFloat32(chunks, total) {
    var merged = new Float32Array(total);
    var offset = 0;
    for (var index = 0; index < chunks.length; index += 1) {
      merged.set(chunks[index], offset);
      offset += chunks[index].length;
    }
    return merged;
  }

  // Procedural terrain tiles arrive as dozens of tiny per-decoration meshes
  // (a 6x6 sub-grid plus tufts/stripes), so boards of a few hundred tiles cost
  // tens of thousands of draw calls. Bake each static tile into one mesh per
  // material bucket using vertex colors. Fail-open: any unexpected material,
  // skinned/animated content, or missing THREE API returns the tile unbaked.
  function bakeTerrainTile(THREE, tile) {
    try {
      if (!THREE || !THREE.BufferGeometry || !THREE.Matrix4) return tile;
      if (!tile || !tile.isObject3D) return tile;
      if (tile.userData && tile.userData.terrainTileBaked) return tile;
      var inverseRoot = new THREE.Matrix4();
      if (typeof inverseRoot.invert !== "function") return tile;
      tile.updateMatrixWorld(true);
      inverseRoot.copy(tile.matrixWorld).invert();
      var bakeable = [];
      var blocked = false;
      tile.traverse(function (node) {
        if (blocked || node === tile) return;
        if (node.isSkinnedMesh) {
          blocked = true;
          return;
        }
        if (!node.isMesh) return;
        var geometry = node.geometry;
        if (!geometry || !geometry.isBufferGeometry || typeof geometry.toNonIndexed !== "function") {
          blocked = true;
          return;
        }
        var key = terrainMaterialBakeKey(node.material);
        if (key === null) {
          blocked = true;
          return;
        }
        bakeable.push({ node: node, key: key });
      });
      if (blocked || bakeable.length < 2) return tile;

      var buckets = {};
      var bucketKeys = [];
      for (var index = 0; index < bakeable.length; index += 1) {
        var entry = bakeable[index];
        var geometry = entry.node.geometry.index
          ? entry.node.geometry.toNonIndexed()
          : entry.node.geometry.clone();
        var matrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, entry.node.matrixWorld);
        geometry.applyMatrix4(matrix);
        var position = geometry.getAttribute("position");
        var normal = geometry.getAttribute("normal");
        if (!position || !normal || position.count !== normal.count) return tile;
        var bucket = buckets[entry.key];
        if (!bucket) {
          bucket = buckets[entry.key] = {
            material: entry.node.material,
            positions: [],
            normals: [],
            colors: [],
            vertexCount: 0,
            receiveShadow: false,
            castShadow: false
          };
          bucketKeys.push(entry.key);
        }
        bucket.positions.push(position.array);
        bucket.normals.push(normal.array);
        var color = entry.node.material.color;
        var colors = new Float32Array(position.count * 3);
        for (var vertex = 0; vertex < position.count; vertex += 1) {
          colors[vertex * 3] = color.r;
          colors[vertex * 3 + 1] = color.g;
          colors[vertex * 3 + 2] = color.b;
        }
        bucket.colors.push(colors);
        bucket.vertexCount += position.count;
        bucket.receiveShadow = bucket.receiveShadow || entry.node.receiveShadow === true;
        bucket.castShadow = bucket.castShadow || entry.node.castShadow === true;
      }

      var bakedMeshes = [];
      for (var keyIndex = 0; keyIndex < bucketKeys.length; keyIndex += 1) {
        var mergedBucket = buckets[bucketKeys[keyIndex]];
        var mergedGeometry = new THREE.BufferGeometry();
        mergedGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(concatFloat32(mergedBucket.positions, mergedBucket.vertexCount * 3), 3)
        );
        mergedGeometry.setAttribute(
          "normal",
          new THREE.BufferAttribute(concatFloat32(mergedBucket.normals, mergedBucket.vertexCount * 3), 3)
        );
        mergedGeometry.setAttribute(
          "color",
          new THREE.BufferAttribute(concatFloat32(mergedBucket.colors, mergedBucket.vertexCount * 3), 3)
        );
        var mergedMaterial = mergedBucket.material.clone();
        mergedMaterial.color = new THREE.Color(0xffffff);
        mergedMaterial.vertexColors = true;
        mergedMaterial.needsUpdate = true;
        var mergedMesh = new THREE.Mesh(mergedGeometry, mergedMaterial);
        mergedMesh.receiveShadow = mergedBucket.receiveShadow;
        mergedMesh.castShadow = mergedBucket.castShadow;
        bakedMeshes.push(mergedMesh);
      }
      if (!bakedMeshes.length) return tile;

      for (var childIndex = tile.children.length - 1; childIndex >= 0; childIndex -= 1) {
        tile.remove(tile.children[childIndex]);
      }
      for (var meshIndex = 0; meshIndex < bakedMeshes.length; meshIndex += 1) {
        tile.add(bakedMeshes[meshIndex]);
      }
      tile.userData = Object.assign({}, tile.userData || {}, {
        terrainTileBaked: true,
        terrainTileBakedMeshCount: bakedMeshes.length,
        terrainTileSourceMeshCount: bakeable.length
      });
      return tile;
    } catch (error) {
      return tile;
    }
  }

  // TILE VARIATION (grid-repetition look, 2026-07-10): identical repeated
  // floor tiles read as an obvious checkerboard. Nudge each tile's material
  // color by a deterministic per-tile factor in [1 - amount, 1 + amount]
  // (default amount 0.04; `tileVariation: 0` or `false` disables). Draw calls
  // stay flat either way: baked tiles already own per-tile cloned materials
  // with vertex colors (bakeTerrainTile), so multiplying material.color is
  // free, and unbaked tiles clone each unique material once per tile so
  // shared factory materials are never mutated. Mesh count never changes.
  function terrainTileVariationAmount(options) {
    var raw = options ? options.tileVariation : undefined;
    if (raw === false || raw === 0) return 0;
    var amount = positiveNumber(raw);
    if (amount === null) amount = 0.04;
    return Math.min(0.2, amount);
  }

  function applyTerrainTileVariation(tile, amount, seed) {
    if (!amount || !tile || typeof tile.traverse !== "function") return tile;
    try {
      var wave = Math.sin((numeric(seed, 0) + 1) * 12.9898) * 43758.5453;
      var unit = wave - Math.floor(wave);
      var factor = 1 + (unit * 2 - 1) * amount;
      var baked = !!(tile.userData && tile.userData.terrainTileBaked);
      var sourceMaterials = [];
      var variedMaterials = [];
      tile.traverse(function (node) {
        if (!node || !node.isMesh) return;
        var material = node.material;
        if (!material || Array.isArray(material)) return;
        if (!material.color || typeof material.color.multiplyScalar !== "function") return;
        if (baked) {
          // bakeTerrainTile already cloned this material for this tile;
          // its white base color multiplies the baked vertex colors.
          material.color.multiplyScalar(factor);
          material.needsUpdate = true;
          return;
        }
        var known = sourceMaterials.indexOf(material);
        if (known !== -1) {
          node.material = variedMaterials[known];
          return;
        }
        if (typeof material.clone !== "function") return;
        var varied = material.clone();
        varied.color.multiplyScalar(factor);
        varied.needsUpdate = true;
        sourceMaterials.push(material);
        variedMaterials.push(varied);
        node.material = varied;
      });
    } catch (error) { /* variation is cosmetic; fail open */ }
    return tile;
  }

  // GROUND APRON (floating-platform look, 2026-07-10): a finite tiled floor
  // ends in a hard edge against the sky, so ground-level games read as
  // floating islands. One large visual-only plane just below the surface top
  // meets the fog and sells "real ground" for a single extra draw call.
  //
  // Hard constraints (pinned by test_vibe_v2_runtime_kit_prompt_contract.py):
  // - VISUAL-ONLY: the apron is never pushed into the solid registration
  //   arrays (tiles/solidTiles/terrainSolids) and carries no placement
  //   metadata, the same no-registration rule every visual-only kit object
  //   follows, so it can never become an accidental collider.
  // - FrontSide ONLY: the boot-smoke camera_void probe (invariant #13) casts
  //   rays from BELOW the world and relies on hitting nothing when the camera
  //   falls into the void; THREE raycasting culls back faces of FrontSide
  //   materials, so the apron stays invisible to those rays. A DoubleSide (or
  //   BackSide) apron would mask void detection — never change the side.
  // - AUTO gating: with no explicit `apron` option the apron renders only
  //   when the surface's world top sits near ground level (|topY| <= 1.5), so
  //   elevated/floating platforms stay apron-free. `apron: false` disables.
  //   An explicit `apron: { color, size }` object forces it, unless it
  //   carries `auto: true` (scaffold-injected color hints keep AUTO gating).
  function createTerrainApron(THREE, group, options, bound, tiles) {
    try {
      var requested = options ? options.apron : undefined;
      if (requested === false) return null;
      if (!THREE || !THREE.Mesh || !THREE.PlaneGeometry || !THREE.Color) return null;
      var MaterialClass = THREE.MeshLambertMaterial || THREE.MeshStandardMaterial;
      if (!MaterialClass || typeof THREE.FrontSide === "undefined") return null;
      if (!group || typeof group.add !== "function") return null;
      var apronOptions = requested && typeof requested === "object" ? requested : {};
      var forced = requested === true || (!!requested && apronOptions.auto !== true);

      var topLocalY = null;
      for (var index = 0; index < tiles.length; index += 1) {
        var tileY = numeric(tiles[index] && tiles[index].position && tiles[index].position.y, 0);
        topLocalY = topLocalY === null ? tileY : Math.max(topLocalY, tileY);
      }
      if (topLocalY === null) topLocalY = 0;
      var groupWorldY = numeric(group.position && group.position.y, 0);
      if (typeof group.getWorldPosition === "function" && THREE.Vector3) {
        try {
          groupWorldY = numeric(group.getWorldPosition(new THREE.Vector3()).y, groupWorldY);
        } catch (worldError) { /* fall back to the local position */ }
      }
      if (!forced && Math.abs(groupWorldY + topLocalY) > 1.5) return null;

      var sceneNode = group;
      while (sceneNode.parent) sceneNode = sceneNode.parent;
      if (sceneNode === group || (!sceneNode.isScene && !sceneNode.fog && !sceneNode.background)) {
        sceneNode = (options && options.scene) || (options && options.parent) || (bound && bound.scene) || null;
      }
      var fog = sceneNode && sceneNode.fog ? sceneNode.fog : null;

      var color;
      if (apronOptions.color !== undefined && apronOptions.color !== null) {
        color = new THREE.Color(apronOptions.color);
      } else if (fog && fog.color) {
        color = new THREE.Color(fog.color).multiplyScalar(0.9);
      } else if (sceneNode && sceneNode.background && sceneNode.background.isColor) {
        color = new THREE.Color(sceneNode.background).multiplyScalar(0.8);
      } else {
        color = new THREE.Color("#3a3a4e");
      }

      var size = positiveNumber(apronOptions.size);
      if (!size) {
        var fogFar = fog ? positiveNumber(fog.far) : null;
        size = fogFar ? Math.max(600, fogFar * 4) : 600;
      }

      var material = new MaterialClass({ color: color, side: THREE.FrontSide });
      var apron = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
      apron.rotation.x = -Math.PI / 2;
      // Slightly below the walkable top so it never z-fights the tiles.
      apron.position.y = topLocalY - 0.05;
      apron.castShadow = false;
      apron.receiveShadow = false;
      apron.userData = {
        terrainApron: true,
        visualOnly: true
      };
      group.add(apron);
      return apron;
    } catch (error) {
      return null;
    }
  }

  function createTerrainHelpers(bound) {
    bound = bound || {};
    return {
      createContinuousSurface: function (options, legacyOptions) {
        options = normalizeTerrainHelperOptions(options, legacyOptions);
        var THREE = options.THREE || bound.THREE || getThree();
        if (!THREE) throw new Error("THREE global is not available.");
        var assets = options.assets || bound.assets || {};
        var factory = options.factory;
        if (typeof factory === "string") factory = assets[factory];
        if (typeof factory !== "function") {
          throw new Error("createContinuousSurface requires a generated asset factory.");
        }

        var factoryOptions = options.factoryOptions || options.assetOptions || options.options || {};
        var firstTile = factory(THREE, factoryOptions);
        if (!firstTile || !firstTile.position) {
          throw new Error("createContinuousSurface factory must return a THREE.Object3D.");
        }
        var placement = options.placement || getPlacement(firstTile) || {};
        var tiling = placement.tiling || {};
        if (tiling.continuous !== true && options.requireContinuous !== false) {
          throw new Error("createContinuousSurface requires placement.tiling.continuous metadata.");
        }

        var axis = normalizeTerrainAxis(options.axis || tiling.axis || "z");
        var requestedSpacing = positiveNumber(options.spacing) || positiveNumber(tiling.spacing);
        var allowGaps = tiling.allowGaps === true;
        var spacing = terrainSpacingForAxis(placement, axis, requestedSpacing, allowGaps, options.overlap);

        var coverage = positiveNumber(options.coverageLength) || positiveNumber(options.length) || spacing * 5;
        var explicitCount = positiveNumber(options.count);
        var count = explicitCount ? Math.max(1, Math.floor(explicitCount)) : Math.max(3, Math.ceil(coverage / spacing) + 2);
        var group = options.group || new THREE.Group();
        var solids = Array.isArray(options.solids) ? options.solids : [];
        var tiles = [];
        var solidTiles = [];
        var solidTerrain = terrainIsSolid(placement);
        var bakeTiles = options.bakeTiles !== false;

        function addTile(tile, index) {
          if (bakeTiles) tile = bakeTerrainTile(THREE, tile);
          normalizeTerrainTileForTiling(tile, placement);
          var offset = (index - (count - 1) / 2) * spacing;
          tile.position[axis] = offset;
          tile.userData = Object.assign({}, tile.userData || {}, {
            continuousTerrainTile: true,
            continuousTerrainAxis: axis,
            continuousTerrainSpacing: spacing
          });
          group.add(tile);
          tiles.push(tile);
          if (solidTerrain) {
            solidTiles.push(tile);
            solids.push(tile);
          }
        }

        addTile(firstTile, 0);
        for (var index = 1; index < count; index += 1) {
          var tile = factory(THREE, factoryOptions);
          if (!tile || !tile.position) {
            throw new Error("createContinuousSurface factory must return a THREE.Object3D.");
          }
          addTile(tile, index);
        }

        group.userData = Object.assign({}, group.userData || {}, {
          terrain: {
            continuous: true,
            axis: axis,
            spacing: spacing,
            coverageLength: coverage,
            tileCount: count
          },
          terrainTiles: tiles,
          terrainSolids: solidTiles,
          placement: placement
        });

        var parent = options.parent || options.scene || bound.scene;
        if (parent && parent.add && group.parent !== parent) parent.add(group);

        var api = {
          group: group,
          tiles: tiles,
          placement: placement,
          spacing: spacing,
          axis: axis,
          solids: solids,
          solidTiles: solidTiles,
          updateAround: function (anchor) {
            var center = terrainAnchorCoordinate(anchor, axis);
            var half = spacing * count / 2;
            var cycle = spacing * count;
            tiles.forEach(function (tile) {
              var value = Number(tile.position[axis]) || 0;
              while (value < center - half) value += cycle;
              while (value > center + half) value -= cycle;
              tile.position[axis] = value;
            });
            return api;
          },
          scroll: function (delta) {
            var amount = Number(delta) || 0;
            tiles.forEach(function (tile) {
              tile.position[axis] = (Number(tile.position[axis]) || 0) + amount;
            });
            return api.updateAround(0);
          }
        };
        return api;
      },
      createTiledSurface: function (options, legacyOptions) {
        options = normalizeTerrainHelperOptions(options, legacyOptions);
        var THREE = options.THREE || bound.THREE || getThree();
        if (!THREE) throw new Error("THREE global is not available.");
        var assets = options.assets || bound.assets || {};
        var factory = options.factory;
        if (typeof factory === "string") factory = assets[factory];
        if (typeof factory !== "function") {
          throw new Error("createTiledSurface requires a generated asset factory.");
        }

        var factoryOptions = options.factoryOptions || options.assetOptions || options.options || {};
        var firstTile = factory(THREE, factoryOptions);
        if (!firstTile || !firstTile.position) {
          throw new Error("createTiledSurface factory must return a THREE.Object3D.");
        }
        var placement = options.placement || getPlacement(firstTile) || {};
        var tiling = placement.tiling || {};
        var allowGaps = tiling.allowGaps === true;
        var axisX = normalizeTerrainAxis(options.axisX || options.xAxis || "x");
        var axisZ = normalizeTerrainAxis(options.axisZ || options.zAxis || "z");
        if (axisX === axisZ) axisZ = axisX === "z" ? "x" : "z";
        var spacingX = terrainSpacingForAxis(
          placement,
          axisX,
          positiveNumber(options.spacingX) || positiveNumber(tiling.spacingX) || (tiling.axis === axisX ? tiling.spacing : null),
          allowGaps,
          options.overlapX || options.overlap
        );
        var spacingZ = terrainSpacingForAxis(
          placement,
          axisZ,
          positiveNumber(options.spacingZ) || positiveNumber(tiling.spacingZ) || (tiling.axis === axisZ ? tiling.spacing : null),
          allowGaps,
          options.overlapZ || options.overlap
        );
        var coverageWidth = positiveNumber(options.coverageWidth) || positiveNumber(options.width) || spacingX * 5;
        var coverageDepth = positiveNumber(options.coverageDepth) || positiveNumber(options.depth) || positiveNumber(options.length) || spacingZ * 5;
        var explicitColumns = positiveNumber(options.columns) || positiveNumber(options.countX);
        var explicitRows = positiveNumber(options.rows) || positiveNumber(options.countZ);
        var columns = explicitColumns ? Math.max(1, Math.floor(explicitColumns)) : Math.max(1, Math.ceil(coverageWidth / spacingX));
        var rows = explicitRows ? Math.max(1, Math.floor(explicitRows)) : Math.max(1, Math.ceil(coverageDepth / spacingZ));
        var group = options.group || new THREE.Group();
        var solids = Array.isArray(options.solids) ? options.solids : [];
        var tiles = [];
        var solidTiles = [];
        var solidTerrain = terrainIsSolid(placement);
        var firstTileUsed = false;

        var bakeTiles = options.bakeTiles !== false;
        var tileVariation = terrainTileVariationAmount(options);

        function nextTile() {
          if (!firstTileUsed) {
            firstTileUsed = true;
            return bakeTiles ? bakeTerrainTile(THREE, firstTile) : firstTile;
          }
          var tile = factory(THREE, factoryOptions);
          if (!tile || !tile.position) {
            throw new Error("createTiledSurface factory must return a THREE.Object3D.");
          }
          return bakeTiles ? bakeTerrainTile(THREE, tile) : tile;
        }

        for (var row = 0; row < rows; row += 1) {
          for (var column = 0; column < columns; column += 1) {
            var tile = nextTile();
            normalizeTerrainTileForTiling(tile, placement);
            if (tileVariation) applyTerrainTileVariation(tile, tileVariation, row * columns + column);
            tile.position[axisX] = (column - (columns - 1) / 2) * spacingX;
            tile.position[axisZ] = (row - (rows - 1) / 2) * spacingZ;
            tile.userData = Object.assign({}, tile.userData || {}, {
              tiledTerrainTile: true,
              tiledTerrainColumn: column,
              tiledTerrainRow: row,
              tiledTerrainSpacingX: spacingX,
              tiledTerrainSpacingZ: spacingZ
            });
            group.add(tile);
            tiles.push(tile);
            if (solidTerrain) {
              solidTiles.push(tile);
              solids.push(tile);
            }
          }
        }

        group.userData = Object.assign({}, group.userData || {}, {
          terrain: {
            tiled: true,
            axes: [axisX, axisZ],
            spacingX: spacingX,
            spacingZ: spacingZ,
            coverageWidth: coverageWidth,
            coverageDepth: coverageDepth,
            columns: columns,
            rows: rows,
            tileCount: tiles.length
          },
          terrainTiles: tiles,
          terrainSolids: solidTiles,
          placement: placement
        });

        var parent = options.parent || options.scene || bound.scene;
        if (parent && parent.add && group.parent !== parent) parent.add(group);

        // Ground apron: created after the group is parented so the world top
        // Y (AUTO gate) and scene fog/background (color derivation) are real.
        // Visual-only — never enters tiles/solidTiles/solids.
        var apron = createTerrainApron(THREE, group, options, bound, tiles);

        var api = {
          group: group,
          tiles: tiles,
          placement: placement,
          spacingX: spacingX,
          spacingZ: spacingZ,
          axes: [axisX, axisZ],
          columns: columns,
          rows: rows,
          apron: apron,
          solids: solids,
          solidTiles: solidTiles,
          updateAround: function (anchor) {
            group.position[axisX] = terrainAnchorCoordinate(anchor, axisX);
            group.position[axisZ] = terrainAnchorCoordinate(anchor, axisZ);
            return api;
          },
          scroll: function (delta) {
            if (typeof delta === "number") {
              group.position[axisZ] = (Number(group.position[axisZ]) || 0) + delta;
            } else if (delta && typeof delta === "object") {
              group.position[axisX] = (Number(group.position[axisX]) || 0) + (Number(delta[axisX]) || 0);
              group.position[axisZ] = (Number(group.position[axisZ]) || 0) + (Number(delta[axisZ]) || 0);
            }
            return api;
          }
        };
        return api;
      },
      createPathSurface: function (options, legacyOptions) {
        options = normalizeTerrainHelperOptions(options, legacyOptions);
        var THREE = options.THREE || bound.THREE || getThree();
        if (!THREE) throw new Error("THREE global is not available.");
        var assets = options.assets || bound.assets || {};
        var factory = options.factory;
        if (typeof factory === "string") factory = assets[factory];
        if (typeof factory !== "function") {
          throw new Error("createPathSurface requires a generated asset factory.");
        }

        var rawPoints = Array.isArray(options.points) ? options.points : [];
        var pathPoints = rawPoints.map(function (point) {
          return terrainVector3(THREE, point);
        }).filter(function (point) {
          return !!point;
        });
        if (pathPoints.length < 2) {
          throw new Error("createPathSurface requires at least two path points.");
        }

        var factoryOptions = options.factoryOptions || options.assetOptions || options.options || {};
        var firstTile = factory(THREE, factoryOptions);
        if (!firstTile || !firstTile.position) {
          throw new Error("createPathSurface factory must return a THREE.Object3D.");
        }
        var placement = options.placement || getPlacement(firstTile) || {};
        var tiling = placement.tiling || {};
        var closed = options.closed === true;
        var axis = normalizeTerrainAxis(options.axis || tiling.axis || "z");
        var requestedSpacing = positiveNumber(options.spacing) || positiveNumber(tiling.spacing);
        var allowGaps = tiling.allowGaps === true;
        var spacing = terrainSpacingForAxis(placement, axis, requestedSpacing, allowGaps, options.overlap);
        var curve = new THREE.CatmullRomCurve3(pathPoints, closed, options.curveType || "catmullrom");
        var pathLength = positiveNumber(options.coverageLength) || positiveNumber(options.length) || curve.getLength();
        var explicitSegments = positiveNumber(options.segments) || positiveNumber(options.count);
        var count = explicitSegments
          ? Math.max(2, Math.floor(explicitSegments))
          : Math.max(2, Math.ceil(pathLength / spacing) + (closed ? 0 : 1));
        var group = options.group || new THREE.Group();
        var solids = Array.isArray(options.solids) ? options.solids : [];
        var tiles = [];
        var solidTiles = [];
        var solidTerrain = terrainIsSolid(placement);
        var firstTileUsed = false;

        var bakeTiles = options.bakeTiles !== false;

        function nextTile() {
          if (!firstTileUsed) {
            firstTileUsed = true;
            return bakeTiles ? bakeTerrainTile(THREE, firstTile) : firstTile;
          }
          var tile = factory(THREE, factoryOptions);
          if (!tile || !tile.position) {
            throw new Error("createPathSurface factory must return a THREE.Object3D.");
          }
          return bakeTiles ? bakeTerrainTile(THREE, tile) : tile;
        }

        for (var index = 0; index < count; index += 1) {
          var tile = nextTile();
          normalizeTerrainTileForTiling(tile, placement);
          var t = closed ? index / count : index / Math.max(1, count - 1);
          var point = curve.getPointAt(Math.max(0, Math.min(1, t)));
          var tangent = curve.getTangentAt(Math.max(0, Math.min(1, t)));
          tile.position.copy(point);
          if (tile.rotation && Number.isFinite(tangent.x) && Number.isFinite(tangent.z)) {
            var yaw = Math.atan2(tangent.x, tangent.z);
            if (typeof tile.rotation.set === "function") tile.rotation.set(tile.rotation.x || 0, yaw, tile.rotation.z || 0);
            else tile.rotation.y = yaw;
          }
          tile.userData = Object.assign({}, tile.userData || {}, {
            pathTerrainTile: true,
            pathTerrainIndex: index,
            pathTerrainSpacing: spacing,
            pathTerrainClosed: closed
          });
          group.add(tile);
          tiles.push(tile);
          if (solidTerrain) {
            solidTiles.push(tile);
            solids.push(tile);
          }
        }

        group.userData = Object.assign({}, group.userData || {}, {
          terrain: {
            path: true,
            closed: closed,
            spacing: spacing,
            pathLength: pathLength,
            tileCount: tiles.length
          },
          terrainTiles: tiles,
          terrainSolids: solidTiles,
          placement: placement
        });

        var parent = options.parent || options.scene || bound.scene;
        if (parent && parent.add && group.parent !== parent) parent.add(group);

        var api = {
          group: group,
          tiles: tiles,
          placement: placement,
          spacing: spacing,
          pathLength: pathLength,
          solids: solids,
          solidTiles: solidTiles,
          updateAround: function () {
            return api;
          },
          scroll: function () {
            return api;
          }
        };
        return api;
      }
    };
  }

  function bindAssets() {
    var merged = {
      orientForward: orientForwardAsset,
      getPlacement: getPlacement,
      getAnimation: getAnimation,
      animate: animateAsset,
      setAnimation: setAssetAnimation,
      playAction: playAssetAction
    };
    var predefined = window.Game3DAssets || {};
    Object.keys(predefined).forEach(function (key) {
      if (typeof predefined[key] === "function") merged[key] = predefined[key];
    });
    var generated = window.Game3DGeneratedAssets || {};
    Object.keys(generated).forEach(function (key) {
      if (typeof generated[key] === "function") merged[key] = generated[key];
    });
    if (predefined && typeof predefined === "object" && typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(merged, predefined);
    }
    // Library picks (runtime/asset-library.js) point a bound factory at another catalog model.
    var library = window.DIYAssetLibrary;
    if (library && typeof library.bindThree === "function") {
      try { library.bindThree(merged); } catch (_error) {}
    }
    return merged;
  }

  // V3 input: the game declares every control, so the kit binds none of its own.
  function declaredControlsOnly() {
    var kit = window.GameInput;
    return Boolean(kit && kit.declarationRequired);
  }

  // Restart-control detection mirrors pixi-core's isRestartControl, minus
  // "continue": in 3D games a Continue button usually means next level, not
  // restart.
  var RESTART_CONTROL_TEXT = /\b(restart|retry|again|reset|reboot|play again|try again)\b/i;

  function isRestartControlNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (declaredControlsOnly()) {
      // A V3 button restarts only when the game marks it data-action="restart".
      var action = node.getAttribute
        ? node.getAttribute("data-vibe-action") || node.getAttribute("data-action")
        : "";
      return String(action || "").toLowerCase() === "restart";
    }
    var tag = String(node.tagName || "").toUpperCase();
    var role = "";
    try {
      role = node.getAttribute ? String(node.getAttribute("role") || "") : "";
    } catch (error) {
      role = "";
    }
    if (tag !== "BUTTON" && tag !== "A" && role.toLowerCase() !== "button") return false;
    return RESTART_CONTROL_TEXT.test(String(node.textContent || "").trim());
  }

  function findRestartControl(target) {
    var node = target;
    for (var depth = 0; node && depth <= 3; depth += 1) {
      if (isRestartControlNode(node)) return node;
      node = node.parentElement || null;
    }
    return null;
  }

  // Keys that restart: the V3 input kit binds only the game's declared "restart"
  // action (R may be a shooter's reload); older input kits keep R.
  function restartKeys(input) {
    if (!declaredControlsOnly()) return ["KeyR"];
    var controls = input && typeof input.getControls === "function" ? input.getControls() : [];
    for (var i = 0; i < controls.length; i += 1) {
      if (controls[i] && controls[i].id === "restart" && Array.isArray(controls[i].keys)) {
        return controls[i].keys;
      }
    }
    return [];
  }

  // Spawn-placement registry: stops games stacking spawns on one point.
  // claim() keeps a requested position when its centre is at least the two
  // radii apart from every prior claim, otherwise walks a golden-angle spiral
  // to the nearest clear spot; scatter() rejection-samples a batch inside an
  // area. Per-mount state; distances are on the XZ plane.
  var PLACEMENT_GOLDEN_ANGLE = 2.399963229728653;

  // Kid color words → hex for assetRef.palette recoloring. Hex strings pass
  // through. Unknown values no-op so a bad palette can never break a boot.
  var PALETTE_COLOR_WORDS = {
    pink: 0xff7bac,
    red: 0xe53935,
    orange: 0xfb8c00,
    yellow: 0xfdd835,
    green: 0x43a047,
    teal: 0x26a69a,
    cyan: 0x29b6f6,
    blue: 0x1e88e5,
    purple: 0x8e24aa,
    brown: 0x795548,
    black: 0x263238,
    white: 0xf5f5f5,
    gray: 0x9e9e9e,
    grey: 0x9e9e9e,
    gold: 0xd4af37,
    silver: 0xc0c0c0,
  };

  function paletteColorValue(palette) {
    if (typeof palette === "number" && isFinite(palette)) return palette;
    var text = String(palette || "").trim().toLowerCase();
    if (!text) return null;
    if (/^#?[0-9a-f]{6}$/.test(text)) return parseInt(text.replace(/^#/, ""), 16);
    return Object.prototype.hasOwnProperty.call(PALETTE_COLOR_WORDS, text)
      ? PALETTE_COLOR_WORDS[text]
      : null;
  }

  function applyAssetPalette(THREE, object, palette) {
    var hex = paletteColorValue(palette);
    if (hex === null || !object || typeof object.traverse !== "function") return object;
    var target = new THREE.Color(hex);
    object.traverse(function (node) {
      if (!node.isMesh || !node.material) return;
      var materials = Array.isArray(node.material) ? node.material : [node.material];
      var tinted = materials.map(function (material) {
        if (!material || !material.color || typeof material.color.lerp !== "function") {
          return material;
        }
        // Clone per instance: pack factories share materials across
        // instances, so tinting a shared material would recolor every copy
        // of that asset in the scene.
        var copy = material.__vibePaletteTinted ? material : material.clone();
        copy.__vibePaletteTinted = true;
        copy.color.lerp(target, 0.85);
        return copy;
      });
      node.material = Array.isArray(node.material) ? tinted : tinted[0];
    });
    return object;
  }

  function createPlacementRegistry() {
    var claims = [];

    function placementRadius(value) {
      var radius = Number(value);
      return Number.isFinite(radius) && radius > 0 ? radius : 1;
    }

    function clearanceAt(x, z, radius) {
      var worst = Infinity;
      for (var index = 0; index < claims.length; index += 1) {
        var other = claims[index];
        var dx = x - other.x;
        var dz = z - other.z;
        var gap = Math.sqrt(dx * dx + dz * dz) - (radius + other.radius);
        if (gap < worst) worst = gap;
      }
      return worst;
    }

    function isFree(x, z, radius) {
      return clearanceAt(x, z, radius) >= 0;
    }

    function register(x, y, z, radius, label) {
      claims.push({
        x: x,
        z: z,
        radius: radius,
        label: label === undefined || label === null ? null : String(label)
      });
      return { x: x, y: y, z: z };
    }

    function claim(position, radius, label) {
      try {
        if (!position || typeof position !== "object") return position;
        var x = Number(position.x);
        var z = Number(position.z);
        var y = Number(position.y);
        if (!Number.isFinite(y)) y = 0;
        if (!Number.isFinite(x) || !Number.isFinite(z)) return position;
        var claimedRadius = placementRadius(radius);
        if (isFree(x, z, claimedRadius)) return register(x, y, z, claimedRadius, label);
        var step = Math.max(claimedRadius, 1);
        var best = null;
        var bestClearance = -Infinity;
        for (var probe = 1; probe <= 32; probe += 1) {
          var angle = probe * PLACEMENT_GOLDEN_ANGLE;
          var distance = step * Math.sqrt(probe);
          var candidateX = x + Math.cos(angle) * distance;
          var candidateZ = z + Math.sin(angle) * distance;
          var clearance = clearanceAt(candidateX, candidateZ, claimedRadius);
          if (clearance >= 0) return register(candidateX, y, candidateZ, claimedRadius, label);
          if (clearance > bestClearance) {
            bestClearance = clearance;
            best = { x: candidateX, z: candidateZ };
          }
        }
        return register(best ? best.x : x, y, best ? best.z : z, claimedRadius, label);
      } catch (error) {
        return position;
      }
    }

    function scatter(count, options) {
      var results = [];
      try {
        options = options || {};
        var total = Math.floor(Number(count));
        if (!Number.isFinite(total) || total <= 0) return results;
        var minDistance = Number(options.minDistance);
        if (!Number.isFinite(minDistance) || minDistance <= 0) minDistance = 2;
        var area = options.area && typeof options.area === "object" ? options.area : {};
        var minX = numeric(area.minX, -20);
        var maxX = numeric(area.maxX, 20);
        var minZ = numeric(area.minZ, -20);
        var maxZ = numeric(area.maxZ, 20);
        if (maxX < minX) { var swapX = minX; minX = maxX; maxX = swapX; }
        if (maxZ < minZ) { var swapZ = minZ; minZ = maxZ; maxZ = swapZ; }
        var pointRadius = minDistance / 2;
        for (var index = 0; index < total; index += 1) {
          var placed = null;
          for (var attempt = 0; attempt < 40; attempt += 1) {
            var x = minX + Math.random() * (maxX - minX);
            var z = minZ + Math.random() * (maxZ - minZ);
            if (isFree(x, z, pointRadius)) {
              placed = register(x, 0, z, pointRadius, options.label);
              break;
            }
          }
          if (!placed) {
            placed = claim({
              x: minX + Math.random() * (maxX - minX),
              y: 0,
              z: minZ + Math.random() * (maxZ - minZ)
            }, pointRadius, options.label);
          }
          results.push(placed);
        }
        return results;
      } catch (error) {
        return results;
      }
    }

    function reset() {
      claims.length = 0;
      return true;
    }

    return { claim: claim, scatter: scatter, reset: reset };
  }

  // Fixed-camera framing, ctx.fitCameraTo(bounds, options): aims a camera that
  // does not follow the player so the play area fills the frame at the current
  // aspect, with options.up (the world direction the up control moves the
  // player) pointing up the screen. The kit re-fits it on every resize.
  var CAMERA_FIT_UP = { "-z": [0, -1], "+z": [0, 1], z: [0, 1], "-x": [-1, 0], "+x": [1, 0], x: [1, 0] };
  var CAMERA_FIT_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  // The fit the headless check reads through Game3DCore.framing().
  var activeCameraFit = null;

  function fitRound(value) {
    return Math.round(value * 10000) / 10000;
  }

  function fitDot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function fitCombine(terms) {
    var out = [0, 0, 0];
    terms.forEach(function (term) {
      for (var axis = 0; axis < 3; axis += 1) out[axis] += term[0][axis] * term[1];
    });
    return out;
  }

  function cameraFitBox(THREE, bounds) {
    var box = null;
    if (bounds && bounds.isObject3D) {
      if (typeof bounds.updateMatrixWorld === "function") bounds.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(bounds);
    } else if (bounds && bounds.min && bounds.max) {
      var a = [numeric(bounds.min.x, NaN), numeric(bounds.min.y, 0), numeric(bounds.min.z, NaN)];
      var b = [numeric(bounds.max.x, NaN), numeric(bounds.max.y, 0), numeric(bounds.max.z, NaN)];
      box = new THREE.Box3(
        new THREE.Vector3(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])),
        new THREE.Vector3(Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]))
      );
    }
    var values = box ? [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z] : [];
    var finite = values.length === 6 && values.every(function (value) { return Number.isFinite(value); });
    if (!finite || box.max.x < box.min.x || box.max.z < box.min.z) {
      throw new TypeError(
        "ctx.fitCameraTo(bounds) needs a THREE.Box3, { min: {x, y, z}, max: {x, y, z} } or an Object3D with meshes."
      );
    }
    return box;
  }

  function cameraFitUp(up) {
    if (up && typeof up === "object") {
      var x = numeric(up.x, 0);
      var z = numeric(up.z, 0);
      var length = Math.hypot(x, z);
      if (length > 0.000001) return [x / length, z / length];
    }
    var named = CAMERA_FIT_UP[String(up == null ? "-z" : up).trim().toLowerCase()];
    if (named) return named.slice();
    throw new TypeError('ctx.fitCameraTo up must be "-z", "+z", "-x", "+x" or { x, z }.');
  }

  // The up direction turned `yaw` radians about +Y (a player turning the view).
  function cameraFitTurned(up, yaw) {
    if (!yaw) return up;
    var c = Math.cos(yaw);
    var s = Math.sin(yaw);
    return [up[0] * c + up[1] * s, up[1] * c - up[0] * s];
  }

  // What the camera frames: the play area, or (zoomed in) a smaller box around the focus.
  function cameraFitFramed(fit) {
    var box = fit.box;
    if (!(fit.zoom > 1) || !fit.focus) return box;
    var halfX = (box.max.x - box.min.x) / (2 * fit.zoom);
    var halfZ = (box.max.z - box.min.z) / (2 * fit.zoom);
    var x = Math.max(box.min.x + halfX, Math.min(box.max.x - halfX, fit.focus.x));
    var z = Math.max(box.min.z + halfZ, Math.min(box.max.z - halfZ, fit.focus.z));
    return new fit.THREE.Box3(
      new fit.THREE.Vector3(x - halfX, box.min.y, z - halfZ),
      new fit.THREE.Vector3(x + halfX, box.max.y, z + halfZ)
    );
  }

  // view.adjust({ turn, tilt, zoom, at }): turn radians about +Y, tilt degrees added, zoom a
  // factor (above 1 moves in, up to 4x) keeping the ground point `at` {x, z} where it is.
  function adjustCameraFit(fit, change) {
    fit.yaw = (fit.yaw + numeric(change.turn, 0)) % (Math.PI * 2);
    fit.tilt = Math.max(0, Math.min(60, fit.tilt + numeric(change.tilt, 0)));
    var factor = numeric(change.zoom, 1);
    if (!(factor > 0) || factor === 1) return;
    var box = fit.box;
    var focus = fit.focus || { x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2 };
    var at = change.at && Number.isFinite(change.at.x) && Number.isFinite(change.at.z) ? change.at : focus;
    var zoom = Math.max(1, Math.min(4, fit.zoom * factor));
    var keep = fit.zoom / zoom;
    fit.focus = zoom > 1 ? { x: at.x + (focus.x - at.x) * keep, z: at.z + (focus.z - at.z) * keep } : null;
    fit.zoom = zoom;
  }

  // Camera axes for a view leaning `tilt` degrees back from straight down, with
  // the horizontal `up` [x, z] pointing up the screen (away from the viewer).
  function cameraFitBasis(up, tilt) {
    var angle = (tilt * Math.PI) / 180;
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    var forward = [up[0] * s, -c, up[1] * s];
    var screenUp = [up[0] * c, s, up[1] * c];
    var right = [
      forward[1] * screenUp[2] - forward[2] * screenUp[1],
      forward[2] * screenUp[0] - forward[0] * screenUp[2],
      forward[0] * screenUp[1] - forward[1] * screenUp[0]
    ];
    return { forward: forward, up: screenUp, right: right };
  }

  function cameraFitCorners(box) {
    var corners = [];
    [box.min.x, box.max.x].forEach(function (x) {
      [box.min.y, box.max.y].forEach(function (y) {
        [box.min.z, box.max.z].forEach(function (z) { corners.push([x, y, z]); });
      });
    });
    return corners;
  }

  // Closest perspective camera on these axes with every corner inside the
  // frame (tx, ty: tangents of the half field of view, less the margin).
  function solvePerspectiveFit(corners, basis, tx, ty, near) {
    var minA = Infinity, maxB = -Infinity, minC = Infinity, maxD = -Infinity, minDepth = Infinity;
    corners.forEach(function (corner) {
      var x = fitDot(corner, basis.right);
      var y = fitDot(corner, basis.up);
      var depth = fitDot(corner, basis.forward);
      minA = Math.min(minA, x + tx * depth);
      maxB = Math.max(maxB, x - tx * depth);
      minC = Math.min(minC, y + ty * depth);
      maxD = Math.max(maxD, y - ty * depth);
      minDepth = Math.min(minDepth, depth);
    });
    var along = Math.min((minA - maxB) / (2 * tx), (minC - maxD) / (2 * ty), minDepth - 2 * near);
    return fitCombine([
      [basis.right, (minA + maxB) / 2],
      [basis.up, (minC + maxD) / 2],
      [basis.forward, along]
    ]);
  }

  // Ground the frame's corners reach at the play area's floor, capped near the
  // play area so a view up to the horizon stays usable for spawn edges.
  function cameraFitVisible(fit, position, basis, halfWidth, halfHeight, perspective) {
    var box = fit.box;
    var center = [(box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2];
    var reach = 4 * Math.max(1, Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z));
    var xs = [];
    var zs = [];
    CAMERA_FIT_CORNERS.forEach(function (corner) {
      var offset = fitCombine([[basis.right, corner[0] * halfWidth], [basis.up, corner[1] * halfHeight]]);
      var origin = perspective ? position : fitCombine([[position, 1], [offset, 1]]);
      var dir = perspective ? fitCombine([[basis.forward, 1], [offset, 1]]) : basis.forward;
      var t = dir[1] < -0.000001 ? (box.min.y - origin[1]) / dir[1] : Infinity;
      if (!(t > 0)) t = Infinity;
      var point = fitCombine([[origin, 1], [dir, Math.min(t, 1e6)]]);
      var dx = point[0] - center[0];
      var dz = point[2] - center[2];
      var distance = Math.hypot(dx, dz);
      var shrink = distance > reach ? reach / distance : 1;
      xs.push(center[0] + dx * shrink);
      zs.push(center[2] + dz * shrink);
    });
    return {
      minX: fitRound(Math.min.apply(null, xs)),
      maxX: fitRound(Math.max.apply(null, xs)),
      minZ: fitRound(Math.min.apply(null, zs)),
      maxZ: fitRound(Math.max.apply(null, zs))
    };
  }

  function createCameraFit(THREE, camera, bounds, options, scene) {
    options = options || {};
    if (!camera || !camera.isCamera) throw new TypeError("ctx.fitCameraTo needs a THREE camera.");
    var box = cameraFitBox(THREE, bounds);
    var up = cameraFitUp(options.up);
    var player = options.player && typeof options.player.getWorldPosition === "function" ? options.player : null;
    return {
      THREE: THREE,
      camera: camera,
      scene: scene || null,
      box: box,
      up: up,
      tilt: Math.max(0, Math.min(60, numeric(options.tilt, 30))),
      margin: Math.max(0, Math.min(0.3, numeric(options.margin, 0.02))),
      yaw: 0,
      zoom: 1,
      focus: null,
      player: player,
      view: { bounds: box, up: new THREE.Vector3(up[0], 0, up[1]), visible: null }
    };
  }

  // Places and aims fit.camera for a frame of size {width, height}; returns
  // fit.view with view.visible updated (the ground rectangle on screen).
  function applyCameraFit(fit, size) {
    var THREE = fit.THREE;
    var camera = fit.camera;
    var aspect = Math.max(0.05, numeric(size && size.width, 1) / Math.max(1, numeric(size && size.height, 1)));
    var up = cameraFitTurned(fit.up, fit.yaw);
    var basis = cameraFitBasis(up, fit.tilt);
    var corners = cameraFitCorners(cameraFitFramed(fit));
    fit.view.up.set(up[0], 0, up[1]);
    var near = Math.max(0.001, numeric(camera.near, 0.1));
    var perspective = !camera.isOrthographicCamera;
    var position;
    var halfWidth;
    var halfHeight;
    if (perspective) {
      halfHeight = Math.tan((Math.max(1, Math.min(170, numeric(camera.fov, 60))) * Math.PI) / 360);
      halfWidth = halfHeight * aspect;
      camera.aspect = aspect;
      camera.zoom = 1;
      position = solvePerspectiveFit(corners, basis, halfWidth * (1 - fit.margin), halfHeight * (1 - fit.margin), near);
    } else {
      var lo = [Infinity, Infinity, Infinity];
      var hi = [-Infinity, -Infinity, -Infinity];
      corners.forEach(function (corner) {
        [basis.right, basis.up, basis.forward].forEach(function (axis, index) {
          var value = fitDot(corner, axis);
          lo[index] = Math.min(lo[index], value);
          hi[index] = Math.max(hi[index], value);
        });
      });
      halfHeight = Math.max((hi[1] - lo[1]) / 2, (hi[0] - lo[0]) / 2 / aspect, 0.001) / (1 - fit.margin);
      halfWidth = halfHeight * aspect;
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.zoom = 1;
      var back = near + 1 + (hi[2] - lo[2]) + Math.max(halfWidth, halfHeight);
      position = fitCombine([
        [basis.right, (lo[0] + hi[0]) / 2],
        [basis.up, (lo[1] + hi[1]) / 2],
        [basis.forward, lo[2] - back]
      ]);
    }
    var farthest = 0;
    corners.forEach(function (corner) {
      farthest = Math.max(farthest, fitDot(corner, basis.forward) - fitDot(position, basis.forward));
    });
    if (!(numeric(camera.far, 0) > farthest * 1.25)) camera.far = farthest * 1.25 + 1;
    camera.position.set(position[0], position[1], position[2]);
    var back3 = basis.forward.map(function (value) { return -value; });
    camera.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(basis.right[0], basis.right[1], basis.right[2]),
        new THREE.Vector3(basis.up[0], basis.up[1], basis.up[2]),
        new THREE.Vector3(back3[0], back3[1], back3[2])
      )
    );
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    // The check compares the camera the game renders with against this one.
    fit.fitted = {
      projection: matrixValues(camera.projectionMatrix),
      view: matrixValues(new THREE.Matrix4().copy(camera.matrixWorld).invert())
    };
    // Updated in place, so a game holding view.visible sees each re-fit.
    fit.view.visible = Object.assign(
      fit.view.visible || {},
      cameraFitVisible(fit, position, basis, halfWidth, halfHeight, perspective)
    );
    return fit.view;
  }

  function recordCameraFit(fit) {
    var box = fit.box;
    var previous = status.cameraFit;
    status.cameraFit = {
      bounds: {
        min: [fitRound(box.min.x), fitRound(box.min.y), fitRound(box.min.z)],
        max: [fitRound(box.max.x), fitRound(box.max.y), fitRound(box.max.z)]
      },
      up: [fitRound(fit.up[0]), 0, fitRound(fit.up[1])],
      tilt: fit.tilt,
      camera: fit.camera.isOrthographicCamera ? "orthographic" : "perspective",
      visible: Object.assign({}, fit.view.visible),
      fits: (previous && previous.fits ? previous.fits : 0) + 1
    };
  }

  function matrixValues(matrix) {
    var values = [];
    var elements = matrix && matrix.elements ? matrix.elements : [];
    for (var index = 0; index < elements.length; index += 1) values.push(Number(elements[index]));
    return values;
  }

  // What the headless check measures: the fitted bounds, the camera as last
  // rendered, and where the player is (options.player, else a role "player").
  function cameraFitSnapshot() {
    var fit = activeCameraFit;
    if (!fit) return null;
    var player = fit.player;
    if (!player && fit.scene && typeof fit.scene.traverse === "function") {
      fit.scene.traverse(function (node) {
        if (!player && node && node.userData && node.userData.vibeGameRole === "player") player = node;
      });
    }
    var position = null;
    if (player && typeof player.getWorldPosition === "function") {
      var world = player.getWorldPosition(new fit.THREE.Vector3());
      position = [fitRound(world.x), fitRound(world.y), fitRound(world.z)];
    }
    return {
      bounds: status.cameraFit ? status.cameraFit.bounds : null,
      up: [fit.up[0], 0, fit.up[1]],
      projection: matrixValues(fit.camera.projectionMatrix),
      view: matrixValues(fit.camera.matrixWorldInverse),
      fitted: fit.fitted || null,
      player: position
    };
  }

  function mount(options) {
    // Normalize legacy call shapes. Generated code has shipped
    // mount(rootElement, callback); silently dropping that callback rendered
    // an empty sky that passed every boot check while no game code ever ran.
    // Honor the intent, and flag it on status so validation can see it.
    var legacyCallback = null;
    for (var argIndex = 1; argIndex < arguments.length; argIndex += 1) {
      if (typeof arguments[argIndex] === "function") {
        legacyCallback = arguments[argIndex];
        break;
      }
    }
    var usedLegacySignature = false;
    if (typeof options === "function") {
      options = { createGame: options };
      usedLegacySignature = true;
    } else if (
      typeof options === "string" ||
      (options && typeof options === "object" && typeof options.nodeType === "number")
    ) {
      options = { root: options };
      usedLegacySignature = true;
    }
    options = options || {};
    if (legacyCallback && typeof options.createGame !== "function") {
      options.createGame = legacyCallback;
      usedLegacySignature = true;
    }
    if (usedLegacySignature && typeof console !== "undefined" && console.warn) {
      console.warn(
        "Game3DCore.mount(root, callback) is a legacy call shape; use " +
        "Game3DCore.mount({ root, createGame }) instead."
      );
    }
    var root = getRoot(options.root);
    if (!root) return null;
    if (activeContext && typeof activeContext.stop === "function") {
      try { activeContext.stop(); } catch (error) {}
    }
    status.mounted = true;
    status.firstFrameRendered = false;
    status.rafTicks = 0;
    status.lastError = null;
    status.lastErrorCode = null;
    status.userMessage = null;
    status.errorName = null;
    status.errorMessage = null;
    status.errorStack = null;
    status.rendererConsoleMessages = [];
    status.rendererFailureDetail = null;
    status.contextLost = false;
    status.contextLostAt = null;
    status.contextRestoredAt = null;
    status.rendererDisposed = false;
    status.rendererDisposedAt = null;
    status.rendererCreatedAt = null;
    status.mountStartedAt = Date.now();
    status.restarts = 0;
    status.restartReason = null;
    status.outcome = null;
    status.outcomeAt = null;
    status.objective = null;
    status.cameraFit = null;
    activeCameraFit = null;
    status.phase = "mounting";
    status.legacyMountSignature = usedLegacySignature;
    status.gameCallbackProvided = typeof options.createGame === "function";
    removeLegacyPlaceholder(root);

    try {
      var THREE = getThree();
      if (!THREE) throw new Error("THREE global is not available.");
      var canvas = createCanvas(root, options.canvas);
      updateElementStatus(root, canvas);
      var renderer = null;
      var rendererOptions = {
        antialias: options.antialias !== false,
        alpha: !!options.alpha
      };
      status.rendererOptions = rendererOptions;
      status.phase = "creating_renderer";
      try {
        renderer = captureRendererConsoleMessages(function () {
          return new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: rendererOptions.antialias,
            alpha: rendererOptions.alpha
          });
        });
        status.rendererConsoleMessages = renderer.messages;
        renderer = renderer.value;
        status.webglAvailable = true;
        status.rendererCreatedAt = Date.now();
        status.phase = "renderer_created";
      } catch (rendererError) {
        status.webglAvailable = false;
        updateElementStatus(root, canvas);
        setRuntimeError(
          root,
          rendererError,
          /webgl|context/i.test(String(rendererError && rendererError.message || rendererError))
            ? "webgl_context_unavailable"
            : "three_renderer_init_failed"
        );
        return null;
      }
      var pixelRatio = options.pixelRatio || (options.useDevicePixelRatio ? Math.min(window.devicePixelRatio || 1, options.maxPixelRatio || 2) : 1);
      renderer.setPixelRatio(pixelRatio);
      renderer.setClearColor(options.clearColor || 0x89c7f7, options.alpha ? 0 : 1);

      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.maxWidth = "100%";
      canvas.style.maxHeight = "100%";
      canvas.style.transform = "none";

      var scene = options.scene || new THREE.Scene();

      // Background, fog, and default lighting are grouped so the full
      // rebuild in ctx.restart() can re-run exactly what mount set up.
      function applySceneDefaults() {
        scene.background = options.background instanceof THREE.Color
          ? options.background
          : new THREE.Color(options.background || 0x89c7f7);
        if (options.fog !== false) {
          var fog = options.fog && typeof options.fog === "object" ? options.fog : {};
          scene.fog = new THREE.Fog(
            fog.color || options.fogColor || options.background || 0x89c7f7,
            fog.near || options.fogNear || 35,
            fog.far || options.fogFar || 120
          );
        }
        var lighting = options.lighting && typeof options.lighting === "object" ? options.lighting : {};
        var ambientStyle = lighting.ambient;
        var directionalStyle = lighting.directional;
        addDefaultLighting(THREE, scene, {
          ambientIntensity: ambientStyle || lighting.ambientIntensity,
          ambientColor:
            (ambientStyle && typeof ambientStyle === "object" ? ambientStyle.color : undefined) ||
            lighting.ambientColor,
          directionalIntensity: directionalStyle || lighting.directionalIntensity,
          directionalColor:
            (directionalStyle && typeof directionalStyle === "object" ? directionalStyle.color : undefined) ||
            lighting.directionalColor
        });
      }
      applySceneDefaults();

      var size = readSize(root, canvas);
      var camera = options.camera || new THREE.PerspectiveCamera(options.fov || 60, size.width / size.height, options.near || 0.1, options.far || 1000);
      if (!options.camera) {
        camera.position.set(0, 5, 10);
        camera.lookAt(0, 1, 0);
      }

      var ctx = null;
      var cameraFit = null;
      function resize() {
        // Unpin the last px size first, or readSize measures it and the canvas never grows.
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        size = readSize(root, canvas);
        updateElementStatus(root, canvas);
        renderer.setSize(size.width, size.height, false);
        canvas.style.width = size.width + "px";
        canvas.style.height = size.height + "px";
        camera.aspect = size.width / size.height;
        if (camera.updateProjectionMatrix) camera.updateProjectionMatrix();
        status.rendererSize = { width: size.width, height: size.height };
        // Re-fit before the game's onResize, so a game that re-frames there wins.
        if (cameraFit) {
          applyCameraFit(cameraFit, size);
          recordCameraFit(cameraFit);
        }
        if (ctx) {
          ctx.size = { width: size.width, height: size.height };
          if (ctx.onResize) ctx.onResize(size);
        }
      }

      var clock = new THREE.Clock();
      if (window.VibeGameUI) window.VibeGameUI.configure(options.hud);
      var inputOptions = { target: canvas, controls: options.controls };
      if (options.controlsHints != null) inputOptions.hints = options.controlsHints;
      if (options.objective != null) inputOptions.objective = options.objective;
      var input = createInput(inputOptions);
      var running = true;
      var rafId = null;
      var cleanedUp = false;
      var intentionalContextRelease = false;
      var elapsedTime = 0;
      var updateCallbacks = [];
      var assets = bindAssets();
      var placement = createPlacementRegistry();
      ctx = {
        THREE: THREE,
        root: root,
        canvas: canvas,
        renderer: renderer,
        scene: scene,
        camera: camera,
        clock: clock,
        input: input,
        assets: assets,
        terrain: createTerrainHelpers({ THREE: THREE, scene: scene, assets: assets }),
        physics: createPhysicsHelpers({ THREE: THREE }),
        placement: placement,
        applyPalette: function (object, palette) {
          return applyAssetPalette(THREE, object, palette);
        },
        status: status,
        size: { width: size.width, height: size.height },
        setHud: setHud,
        yawForDirection: yawForDirection,
        faceDirection: faceDirection,
        forwardFromYaw: function (yaw) { return forwardFromYaw(THREE, yaw); },
        cameraMove: function (axis, view) {
          return cameraMove(THREE, view || ctx.camera, axis || input.axis2d());
        },
        addDefaultLighting: function (opts) { return addDefaultLighting(THREE, scene, opts); },
        markReady: function () {
          status.firstFrameRendered = true;
          window.__thumbnailReady = true;
        },
        onUpdate: function (callback) {
          if (typeof callback !== "function") {
            throw new TypeError("ctx.onUpdate(callback) requires a function.");
          }
          updateCallbacks.push(callback);
          return function unsubscribeUpdate() {
            ctx.offUpdate(callback);
          };
        },
        offUpdate: function (callback) {
          var index = updateCallbacks.indexOf(callback);
          if (index < 0) return false;
          updateCallbacks.splice(index, 1);
          return true;
        },
        // Frame a fixed camera on the play area; see applyCameraFit.
        fitCameraTo: function (bounds, fitOptions) {
          var fit = createCameraFit(THREE, camera, bounds, fitOptions, scene);
          applyCameraFit(fit, size);
          cameraFit = fit;
          activeCameraFit = fit;
          recordCameraFit(fit);
          // Turning and zooming this view (the spin gestures); kept on every re-fit.
          Object.defineProperty(fit.view, "adjust", {
            configurable: true,
            value: function (change) {
              if (cameraFit !== fit) return fit.view;
              adjustCameraFit(fit, change || {});
              applyCameraFit(fit, size);
              return fit.view;
            }
          });
          return fit.view;
        },
        stop: function () {
          cleanup();
        },
        restart: function (reason) {
          return restartGame(reason);
        },
        onResize: null
      };
      var objectiveRunner = createObjectiveRunner({
        THREE: THREE,
        scene: scene,
        setHud: setHud,
        status: status,
        requestRestart: function (reason) { return restartGame(reason); }
      });
      ctx.objective = objectiveRunner.api;
      objectiveRunner.configure(options.winCondition, options.objective);
      activeContext = ctx;
      status.phase = "game_creating";

      function onContextLost(event) {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (intentionalContextRelease || cleanedUp || status.rendererDisposed) {
          if (activeContext === ctx) {
            status.contextLost = false;
            status.phase = status.rendererDisposed ? "renderer_disposed" : "stopped";
          }
          return;
        }
        status.contextLost = true;
        status.contextLostAt = Date.now();
        status.webglAvailable = false;
        setRuntimeError(root, "WebGL context was lost in this preview.", "webgl_context_lost");
        cleanup({ disposeRenderer: false, keepContextListeners: true, fromContextLoss: true });
      }

      function onContextRestored() {
        status.contextLost = false;
        status.contextRestoredAt = Date.now();
        status.webglAvailable = true;
        status.phase = "context_restored";
      }

      function cleanup(cleanupOptions) {
        cleanupOptions = cleanupOptions || {};
        if (cleanedUp) return;
        cleanedUp = true;
        intentionalContextRelease = cleanupOptions.fromContextLoss !== true;
        running = false;
        objectiveRunner.dispose();
        if (rafId !== null && typeof cancelAnimationFrame === "function") {
          try { cancelAnimationFrame(rafId); } catch (error) {}
        }
        input.dispose();
        updateCallbacks.length = 0;
        window.removeEventListener("resize", resize);
        window.removeEventListener("pagehide", cleanup);
        window.removeEventListener("beforeunload", cleanup);
        window.removeEventListener("keydown", onRestartKeydown, true);
        if (document && document.removeEventListener) {
          document.removeEventListener("click", onRestartClick, true);
        }
        if (canvas && canvas.removeEventListener && !cleanupOptions.keepContextListeners) {
          canvas.removeEventListener("webglcontextlost", onContextLost);
          canvas.removeEventListener("webglcontextrestored", onContextRestored);
        }
        if (ctx.resizeObserver) ctx.resizeObserver.disconnect();
        if (activeCameraFit === cameraFit) activeCameraFit = null;
        if (cleanupOptions.disposeRenderer !== false) disposeRenderer(renderer);
        else status.phase = "stopped";
        if (activeContext === ctx) activeContext = null;
      }

      resize();
      window.addEventListener("resize", resize);
      window.addEventListener("pagehide", cleanup);
      window.addEventListener("beforeunload", cleanup);
      if (canvas && canvas.addEventListener) {
        canvas.addEventListener("webglcontextlost", onContextLost, false);
        canvas.addEventListener("webglcontextrestored", onContextRestored, false);
      }
      if (window.ResizeObserver) {
        ctx.resizeObserver = new ResizeObserver(resize);
        ctx.resizeObserver.observe(root);
      }
      // Feature kits (DIYKit.extend) add their helpers to ctx before the game starts.
      ((window.DIYKit && window.DIYKit.extensions) || []).forEach(function (extend) {
        try {
          extend(ctx, { renderer: "three" });
        } catch (error) {
          if (typeof console !== "undefined" && console.warn) console.warn("DIYKit extension failed", error);
        }
      });
      var game = options.createGame ? options.createGame(ctx) : null;
      ctx.game = game;
      status.phase = "running";
      if (game && typeof game.onResize === "function") ctx.onResize = game.onResize;

      // ctx.restart(reason): restart parity with pixi-core. Fast path calls
      // game.reset(ctx); otherwise tear the whole scene down and rebuild it
      // exactly the way mount did. The 300ms reentrancy guard absorbs the kit
      // listener and a game-wired listener both reacting to the same click.
      var lastRestartAt = 0;

      function restartGame(reason) {
        if (cleanedUp) return false;
        var now = Date.now();
        if (now - lastRestartAt < 300) return false;
        lastRestartAt = now;
        status.restarts += 1;
        status.restartReason = String(reason || "reset");
        objectiveRunner.reset();
        if (game && typeof game.reset === "function") {
          try {
            game.reset(ctx);
            return true;
          } catch (resetError) {
            // A throwing game.reset falls through to the full rebuild.
          }
        }
        try {
          disposeSceneChildren(scene);
          applySceneDefaults();
          if (clock && typeof clock.start === "function") clock.start();
          elapsedTime = 0;
          placement.reset();
          game = null;
          ctx.game = null;
          ctx.onResize = null;
          // The rebuilt game frames its camera again.
          if (activeCameraFit === cameraFit) activeCameraFit = null;
          cameraFit = null;
          status.cameraFit = null;
          game = options.createGame ? options.createGame(ctx) : null;
          ctx.game = game;
          if (game && typeof game.onResize === "function") ctx.onResize = game.onResize;
          return true;
        } catch (error) {
          setRuntimeError(root, error, "three_runtime_error");
          return false;
        }
      }

      function onRestartKeydown(event) {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (restartKeys(input).indexOf(event.code) === -1) return;
        restartGame(event.code === "KeyR" ? "key-r" : "key");
      }

      function onRestartClick(event) {
        if (event.defaultPrevented) return;
        if (!findRestartControl(event.target)) return;
        restartGame("button");
      }

      window.addEventListener("keydown", onRestartKeydown, true);
      if (document && document.addEventListener) {
        document.addEventListener("click", onRestartClick, true);
      }

      function tick() {
        if (!running) return;
        rafId = requestAnimationFrame(tick);
        try {
          var dt = Math.min(0.05, clock.getDelta ? clock.getDelta() : 0.016);
          elapsedTime += dt;
          if (updateCallbacks.length) {
            var callbacks = updateCallbacks.slice();
            for (var i = 0; i < callbacks.length; i++) {
              callbacks[i](dt, elapsedTime, ctx);
            }
          }
          if (game && typeof game.update === "function") game.update(dt, ctx);
          if (game && typeof game.render === "function") game.render(dt, ctx);
          objectiveRunner.update(dt);
          // A 3D look draws the frame itself when it post-processes; otherwise draw as always.
          var look = ctx.look;
          if (!(look && typeof look.renderFrame === "function" && look.renderFrame(scene, camera, dt) === true)) {
            renderer.render(scene, camera);
          }
          status.rafTicks += 1;
          status.objectCount = countObjects(scene);
          status.phase = "running";
          ctx.markReady();
          input.endFrame();
        } catch (error) {
          setRuntimeError(root, error, "three_runtime_error");
          cleanup();
        }
      }
      tick();
      return ctx;
    } catch (error) {
      var code = /webgl|context/i.test(String(error && error.message || error))
        ? "webgl_context_unavailable"
        : "three_runtime_error";
      setRuntimeError(root, error, code);
      if (ctx && typeof ctx.stop === "function") {
        try { ctx.stop(); } catch (cleanupError) {}
      } else if (typeof renderer !== "undefined" && renderer) {
        disposeRenderer(renderer);
      }
      return null;
    }
  }

  function stopActive() {
    if (!activeContext || typeof activeContext.stop !== "function") return false;
    try {
      activeContext.stop();
      return true;
    } catch (error) {
      return false;
    }
  }

  window.Game3DCore = {
    mount: mount,
    stopActive: stopActive,
    createInput: createInput,
    createObjectiveRunner: createObjectiveRunner,
    setHud: setHud,
    yawForDirection: yawForDirection,
    faceDirection: faceDirection,
    orientForward: orientForwardAsset,
    getPlacement: getPlacement,
    assets: {
      orientForward: orientForwardAsset,
      getPlacement: getPlacement,
      getAnimation: getAnimation,
      animate: animateAsset,
      setAnimation: setAssetAnimation,
      playAction: playAssetAction
    },
    physics: createPhysicsHelpers(),
    terrain: createTerrainHelpers(),
    forwardFromYaw: function (yaw) {
      var THREE = getThree();
      if (!THREE) throw new Error("THREE global is not available.");
      return forwardFromYaw(THREE, yaw);
    },
    // ctx.fitCameraTo without a mounted game: size is the frame {width, height}.
    fitCamera: function (camera, bounds, fitOptions, size) {
      var THREE = getThree();
      if (!THREE) throw new Error("THREE global is not available.");
      return applyCameraFit(createCameraFit(THREE, camera, bounds, fitOptions, null), size);
    },
    framing: cameraFitSnapshot,
    cameraMove: function (axis, camera) {
      var THREE = getThree();
      if (!THREE) throw new Error("THREE global is not available.");
      return cameraMove(THREE, camera, axis);
    },
    status: status
  };
})();

window.DIYKit = window.DIYKit || { libraryBase: "https://cdn.diy.org/vibe-library/v1", extensions: [], extend: function (fn) { this.extensions.push(fn); } };
/* 3D look presets (DIYKit feature part, appended to three-core.js).
   ctx.look.apply(id, { quality, size }) replaces the kit's two default lights with a tuned
   look: tone mapping, sky, sun shadows fitted to the play area, environment light, fog and
   optional bloom/colour grade. ctx.look.material(kind, { color }) makes tuned materials.
   DIYKit.graphics lets a settings menu choose the quality tier. Never throws into a game. */
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  // The prompt only tells games to call ctx.look when their kit contains this marker.
  var LOOK3D_VERSION = 1;
  var kit = window.DIYKit = window.DIYKit || {
    libraryBase: "https://cdn.diy.org/vibe-library/v1",
    extensions: [],
    extend: function (fn) { this.extensions.push(fn); }
  };

  var DEFAULT_LOOK = "sunny-day";
  var LEVELS = ["low", "medium", "high"];
  // pixels: drawing-buffer budget; post-processing (HDR, 4x MSAA) gets its own, smaller one.
  var TIERS = {
    low: { pixelRatio: 1, pixels: 2.1e6, shadows: false, shadowSize: 0, post: false, envSize: 256, outlines: false },
    medium: { pixelRatio: 1.5, pixels: 2.6e6, shadows: true, shadowSize: 1024, post: false, envSize: 256, outlines: true },
    high: { pixelRatio: 2, pixels: 4.2e6, postPixels: 2.1e6, shadows: true, shadowSize: 2048, post: true, envSize: 512, outlines: true }
  };
  // Distance fog scales with the play distance (camera to play area plus its radius).
  var DEFAULT_PLAY_RADIUS = 25;

  // Sky colours are as they should look on screen (sRGB); the kit converts them through
  // the preset's tone mapping, so a sky looks the same at any exposure or quality.
  var PRESETS = {
    "sunny-day": {
      tone: "neutral", exposure: 1,
      sky: { top: 0x2f7fd8, horizon: 0xb9defb, bottom: 0x7d9cb8, curve: 0.5, clouds: 0.45,
        cloud: 0xffffff, cloudShade: 0xc3d1e4, sun: 0xfff3dc, sunSize: 1.4, glow: 0.5 },
      sun: { color: 0xfff1d8, intensity: 3.1, elevation: 52, azimuth: 35, softness: 2.5, shadow: 0.8 },
      hemi: { sky: 0xd6ebff, ground: 0x76825a, intensity: 1.6 },
      env: 0.2,
      fog: { near: 1.3, far: 4.5 },
      post: { bloom: [0.18, 0.4, 0.95], saturation: 1.05, contrast: 1.03 }
    },
    "golden-hour": {
      tone: "aces", exposure: 1.25,
      sky: { top: 0x3c4f8f, horizon: 0xffb27a, bottom: 0x6a4a52, curve: 0.45, clouds: 0.3,
        cloud: 0xffd1a6, cloudShade: 0x9a6a7a, sun: 0xffc27a, sunSize: 1.8, glow: 1.6 },
      sun: { color: 0xffb36b, intensity: 3.2, elevation: 13, azimuth: -62, softness: 3, shadow: 0.8 },
      hemi: { sky: 0xffd2b0, ground: 0x5d4a5a, intensity: 1.3 },
      env: 0.25,
      fog: { near: 1.1, far: 4 },
      post: { bloom: [0.3, 0.5, 0.85], saturation: 1.08, contrast: 1.05, tint: 0xfff0e0 }
    },
    overcast: {
      tone: "neutral", exposure: 1.05,
      sky: { top: 0x8794a6, horizon: 0xc7ced6, bottom: 0x8a9096, curve: 0.8, clouds: 0.85,
        cloud: 0xd9dee4, cloudShade: 0x9aa3ae, sun: 0xf2f2f2, sunSize: -1, glow: 0.12 },
      sun: { color: 0xf0f2f5, intensity: 1.5, elevation: 60, azimuth: 30, softness: 6, shadow: 0.4 },
      hemi: { sky: 0xe0e6ee, ground: 0x7c7f73, intensity: 2.1 },
      env: 0.25,
      fog: { near: 0.9, far: 3.2 },
      post: { bloom: null, saturation: 0.92, contrast: 1.02 }
    },
    night: {
      tone: "aces", exposure: 1.3, dark: true,
      sky: { top: 0x0d1430, horizon: 0x2b3a66, bottom: 0x101422, curve: 0.55, clouds: 0.12,
        cloud: 0x3a4670, cloudShade: 0x1c2240, sun: 0xe4ecff, sunSize: 2.2, glow: 0.35, stars: 1 },
      sun: { color: 0xa9bfff, intensity: 2, elevation: 40, azimuth: 25, softness: 2.5, shadow: 0.7 },
      hemi: { sky: 0x4a5f9a, ground: 0x1d2236, intensity: 1.7 },
      env: 0.3,
      fog: { density: 0.45 },
      post: { bloom: [0.55, 0.5, 0.7], saturation: 0.95, contrast: 1.04 }
    },
    "spooky-fog": {
      tone: "aces", exposure: 1.2, dark: true,
      sky: { top: 0x26302c, horizon: 0x6a786c, bottom: 0x2a2f2c, curve: 0.7, clouds: 0.5,
        cloud: 0x7d8a7e, cloudShade: 0x3a443e, sun: 0xd8e8b0, sunSize: 2.4, glow: 0.4 },
      sun: { color: 0xc8dca0, intensity: 1.5, elevation: 35, azimuth: 120, softness: 4, shadow: 0.6 },
      hemi: { sky: 0x8a9a88, ground: 0x2c302a, intensity: 1.6 },
      env: 0.25,
      fog: { density: 0.65 },
      post: { bloom: [0.35, 0.5, 0.75], saturation: 0.75, contrast: 1.06, vignette: 0.35 }
    },
    underwater: {
      tone: "neutral", exposure: 1,
      sky: { top: 0x7fe0f0, horizon: 0x1f7f9c, bottom: 0x0c2f4a, curve: 0.6, clouds: 0,
        cloud: 0xffffff, cloudShade: 0xffffff, sun: 0xc8fbff, sunSize: -1, glow: 0.6 },
      sun: { color: 0xb8f4ff, intensity: 2.2, elevation: 65, azimuth: 20, softness: 4, shadow: 0.6 },
      hemi: { sky: 0x7fdcea, ground: 0x123a4a, intensity: 2.3 },
      env: 0.25,
      fog: { density: 0.7 },
      post: { bloom: [0.25, 0.6, 0.85], saturation: 0.95, contrast: 1.02, tint: 0xe6fbff }
    },
    space: {
      tone: "aces", exposure: 1.1, dark: true,
      sky: { top: 0x0b0d22, horizon: 0x1a1640, bottom: 0x0b0d22, curve: 0.6, clouds: 0,
        cloud: 0xffffff, cloudShade: 0xffffff, sun: 0xffffff, sunSize: 1.2, glow: 0.5, stars: 1.6 },
      sun: { color: 0xffffff, intensity: 3.6, elevation: 35, azimuth: 50, softness: 1, shadow: 0.8 },
      hemi: { sky: 0x4a4d8a, ground: 0x15142a, intensity: 1.6 },
      env: 0.2,
      fog: null,
      post: { bloom: [0.5, 0.45, 0.7], saturation: 1.05, contrast: 1.06, vignette: 0.25 }
    },
    snow: {
      tone: "neutral", exposure: 1.1,
      sky: { top: 0x7aa7d6, horizon: 0xe4eef7, bottom: 0xdfe8f0, curve: 0.55, clouds: 0.35,
        cloud: 0xffffff, cloudShade: 0xc9d4e2, sun: 0xffffff, sunSize: 1.4, glow: 0.45 },
      sun: { color: 0xfafcff, intensity: 2.8, elevation: 30, azimuth: 40, softness: 3, shadow: 0.7 },
      hemi: { sky: 0xdcebff, ground: 0xe6eef6, intensity: 1.5 },
      env: 0.2,
      fog: { near: 0.8, far: 3 },
      post: { bloom: [0.2, 0.4, 0.95], saturation: 0.96, contrast: 1.02, tint: 0xf2f8ff }
    },
    desert: {
      tone: "aces", exposure: 1.15,
      sky: { top: 0x3a7cc4, horizon: 0xf3dcb4, bottom: 0xc9a77a, curve: 0.45, clouds: 0.1,
        cloud: 0xffffff, cloudShade: 0xe8d6bd, sun: 0xfff2d0, sunSize: 1.5, glow: 0.8 },
      sun: { color: 0xffe8c4, intensity: 3.5, elevation: 58, azimuth: 30, softness: 1.5, shadow: 0.85 },
      hemi: { sky: 0xd8e6f2, ground: 0xc69e6e, intensity: 1.4 },
      env: 0.2,
      fog: { near: 1, far: 3.6, color: 0xeed9b8 },
      post: { bloom: [0.2, 0.4, 0.9], saturation: 1.05, contrast: 1.04, tint: 0xfff4e6 }
    },
    "cozy-indoors": {
      tone: "aces", exposure: 1.2,
      sky: { top: 0x3b2a20, horizon: 0x8a5d3c, bottom: 0x2a1d16, curve: 0.8, clouds: 0,
        cloud: 0xffffff, cloudShade: 0xffffff, sun: 0xffd9a0, sunSize: -1, glow: 0.3 },
      sun: { color: 0xffd8a8, intensity: 2.3, elevation: 42, azimuth: -45, softness: 4, shadow: 0.7 },
      hemi: { sky: 0xffe2c0, ground: 0x6b4a36, intensity: 1.6 },
      env: 0.3, room: true,
      fog: null,
      post: { bloom: [0.35, 0.5, 0.8], saturation: 1.02, contrast: 1.03, tint: 0xfff0dc, vignette: 0.25 }
    },
    "neon-city": {
      tone: "aces", exposure: 1.35, dark: true,
      sky: { top: 0x120a2e, horizon: 0x8a2a7a, bottom: 0x160a24, curve: 0.5, clouds: 0.15,
        cloud: 0x5a2a6a, cloudShade: 0x24123a, sun: 0xd8c8ff, sunSize: 1.6, glow: 0.3, stars: 0.35 },
      sun: { color: 0xb49cff, intensity: 2, elevation: 45, azimuth: 30, softness: 2, shadow: 0.7 },
      hemi: { sky: 0x7a4ab8, ground: 0x24123a, intensity: 2.2 },
      env: 0.3,
      fog: { density: 0.35 },
      post: { bloom: [0.85, 0.55, 0.6], saturation: 1.12, contrast: 1.05, vignette: 0.2 }
    },
    toon: {
      tone: "neutral", exposure: 1.05,
      sky: { top: 0x2f9be8, horizon: 0xbff0ff, bottom: 0x8cc4e0, curve: 0.45, clouds: 0.5,
        cloud: 0xffffff, cloudShade: 0xdbe9f7, sun: 0xfffbe8, sunSize: 1.8, glow: 0.4 },
      sun: { color: 0xfff6e2, intensity: 3, elevation: 55, azimuth: 30, softness: 1, shadow: 0.55 },
      hemi: { sky: 0xe2f4ff, ground: 0x8fa070, intensity: 1.7 },
      env: 0.12,
      fog: { near: 1.6, far: 5 },
      post: { bloom: [0.15, 0.4, 0.95], saturation: 1.15, contrast: 1.02 }
    },
    blocky: {
      tone: "neutral", exposure: 1,
      sky: { top: 0x6f9fff, horizon: 0xbdd5ff, bottom: 0x9ab4e0, curve: 0.6, clouds: 0.38, blocky: true,
        cloud: 0xffffff, cloudShade: 0xffffff, sun: 0xfffbe0, sunSize: 2.2, glow: 0.3 },
      sun: { color: 0xfffae6, intensity: 2.9, elevation: 55, azimuth: 30, softness: 1, shadow: 0.6 },
      hemi: { sky: 0xdde8ff, ground: 0x7f8a60, intensity: 1.7 },
      env: 0.15,
      fog: { near: 1.2, far: 3.5 },
      post: { bloom: null, saturation: 1.05, contrast: 1.02 }
    },
    candy: {
      tone: "neutral", exposure: 1.05,
      sky: { top: 0xb58cf0, horizon: 0xffd1ea, bottom: 0xe0b6d8, curve: 0.5, clouds: 0.5,
        cloud: 0xfff4fb, cloudShade: 0xf2b8dc, sun: 0xfff0f6, sunSize: 1.6, glow: 0.5 },
      sun: { color: 0xfff0f4, intensity: 2.8, elevation: 50, azimuth: 35, softness: 3, shadow: 0.5 },
      hemi: { sky: 0xffe0f2, ground: 0xb9e6d2, intensity: 1.7 },
      env: 0.2,
      fog: { near: 1.2, far: 4, color: 0xffd6ec },
      post: { bloom: [0.25, 0.5, 0.9], saturation: 1.1, contrast: 1.02, tint: 0xfff4fa }
    }
  };

  var MATERIAL_KINDS = ["toon", "glossy", "metal", "glow", "water", "foliage"];

  // ---- colour and tone mapping (CPU copies of three r182's shader curves) ----

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function numberOr(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function srgbToLinear(value) {
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(value) {
    value = clamp(value, 0, 1);
    return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
  }

  function hexToLinear(hex) {
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(function (byte) {
      return srgbToLinear(byte / 255);
    });
  }

  function linearToHex(rgb) {
    return rgb.reduce(function (hex, value) {
      return hex * 256 + Math.round(linearToSrgb(value) * 255);
    }, 0);
  }

  // GLSL mat3 is column-major: m = [column0, column1, column2].
  function mul3(m, v) {
    return [0, 1, 2].map(function (row) {
      return m[0][row] * v[0] + m[1][row] * v[1] + m[2][row] * v[2];
    });
  }

  var ACES_IN = [[0.59719, 0.076, 0.0284], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]];
  var ACES_OUT = [[1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]];
  var REC2020_TO_SRGB = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
  var SRGB_TO_REC2020 = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956]];
  var AGX_INSET = [
    [0.856627153315983, 0.137318972929847, 0.11189821299995],
    [0.0951212405381588, 0.761241990602591, 0.0767994186031903],
    [0.0482516061458583, 0.101439036467562, 0.811302368396859]
  ];
  var AGX_OUTSET = [
    [1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
    [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
    [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]
  ];

  var TONE_CURVES = {
    aces: function (rgb, exposure) {
      var v = mul3(ACES_IN, rgb.map(function (x) { return x * exposure / 0.6; }));
      v = v.map(function (x) {
        return (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081);
      });
      return mul3(ACES_OUT, v).map(function (x) { return clamp(x, 0, 1); });
    },
    agx: function (rgb, exposure) {
      var v = mul3(AGX_INSET, mul3(SRGB_TO_REC2020, rgb.map(function (x) { return x * exposure; })));
      v = v.map(function (x) {
        x = clamp((Math.log2(Math.max(x, 1e-10)) + 12.47393) / (4.026069 + 12.47393), 0, 1);
        var x2 = x * x;
        var x4 = x2 * x2;
        return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
      });
      v = mul3(AGX_OUTSET, v).map(function (x) { return Math.pow(Math.max(0, x), 2.2); });
      return mul3(REC2020_TO_SRGB, v).map(function (x) { return clamp(x, 0, 1); });
    },
    neutral: function (rgb, exposure) {
      var color = rgb.map(function (x) { return x * exposure; });
      var low = Math.min(color[0], color[1], color[2]);
      var offset = low < 0.08 ? low - 6.25 * low * low : 0.04;
      color = color.map(function (x) { return x - offset; });
      var peak = Math.max(color[0], color[1], color[2]);
      if (peak < 0.76) return color;
      var d = 0.24;
      var newPeak = 1 - d * d / (peak + d - 0.76);
      var g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
      return color.map(function (x) {
        x *= newPeak / peak;
        return x + (newPeak - x) * g;
      });
    }
  };

  function toneMap(tone, rgb, exposure) {
    return (TONE_CURVES[tone] || TONE_CURVES.neutral)(rgb, exposure);
  }

  // Linear radiance that the tone curve maps onto a wanted on-screen colour. Each output
  // channel rises with its own input, so channel-by-channel bisection rounds converge.
  function radianceFor(tone, displayHex, exposure) {
    var target = hexToLinear(displayHex).map(function (x) { return clamp(x, 0.0005, 0.96); });
    var guess = target.map(function (x) { return x / exposure; });
    for (var round = 0; round < 10; round += 1) {
      for (var channel = 0; channel < 3; channel += 1) {
        var low = 0;
        var high = 64;
        for (var step = 0; step < 36; step += 1) {
          guess[channel] = (low + high) / 2;
          if (toneMap(tone, guess, exposure)[channel] < target[channel]) low = guess[channel];
          else high = guess[channel];
        }
        guess[channel] = (low + high) / 2;
      }
    }
    return guess;
  }

  // ---- quality tiers: auto-detection, frame-time probe and the settings API ----

  var graphics = {
    choice: "auto",
    listeners: [],
    active: null
  };

  function validLevel(level) {
    return LEVELS.indexOf(level) >= 0;
  }

  function notifyGraphics() {
    if (graphics.active) graphics.active.refreshTier();
    var tier = graphics.active ? graphics.active.tier() : null;
    graphics.listeners.slice().forEach(function (listener) {
      try { listener({ choice: graphics.choice, tier: tier }); } catch (error) { /* a menu bug is not ours */ }
    });
  }

  kit.graphics = {
    levels: ["auto"].concat(LEVELS),
    // The player's choice: "auto" (detected) or a fixed tier.
    get: function () { return graphics.choice; },
    set: function (level) {
      level = String(level || "").toLowerCase();
      if (level !== "auto" && !validLevel(level)) return false;
      if (level === graphics.choice) return true;
      graphics.choice = level;
      notifyGraphics();
      return true;
    },
    // The tier the running game uses now ("low" | "medium" | "high"), or null before a look.
    current: function () { return graphics.active ? graphics.active.tier() : null; },
    onChange: function (listener) {
      if (typeof listener !== "function") return function () {};
      graphics.listeners.push(listener);
      return function () {
        var index = graphics.listeners.indexOf(listener);
        if (index >= 0) graphics.listeners.splice(index, 1);
      };
    }
  };

  function glContext(renderer) {
    try {
      var gl = renderer && typeof renderer.getContext === "function" ? renderer.getContext() : null;
      return gl && typeof gl.getParameter === "function" ? gl : null;
    } catch (error) {
      return null;
    }
  }

  function gpuName(gl) {
    try {
      var firefox = typeof navigator !== "undefined" && /firefox/i.test(String(navigator.userAgent || ""));
      var debug = firefox ? null : gl.getExtension("WEBGL_debug_renderer_info");
      return String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
    } catch (error) {
      return "";
    }
  }

  // First guess from the device; the frame-time probe can lower it.
  function detectTier(renderer) {
    var gl = glContext(renderer);
    if (!gl) return { tier: "medium", software: false, gpu: "" };
    var name = gpuName(gl);
    if (/swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(name)) {
      return { tier: "low", software: true, gpu: name };
    }
    var maxTexture = 0;
    try { maxTexture = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0; } catch (error) { maxTexture = 0; }
    var nav = typeof navigator !== "undefined" ? navigator : {};
    var memory = Number(nav.deviceMemory) || 0;
    var cores = Number(nav.hardwareConcurrency) || 0;
    if ((maxTexture && maxTexture < 4096) || (memory && memory <= 2) || (cores && cores <= 2)) {
      return { tier: "low", software: false, gpu: name };
    }
    if (/mali-[2-4]\d\d|mali-t[0-7]\d\d|adreno[^0-9]*[2-4]\d\d\b|powervr sgx/i.test(name)) {
      return { tier: "low", software: false, gpu: name };
    }
    var weak = /intel.*hd graphics [2-5]\d{2,3}\b|adreno[^0-9]*5\d\d\b|mali-t8/i.test(name);
    var coarse = false;
    try { coarse = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches); } catch (error) { coarse = false; }
    return { tier: coarse || weak ? "medium" : "high", software: false, gpu: name };
  }

  function lowerTier(tier) {
    var index = LEVELS.indexOf(tier);
    return index > 0 ? LEVELS[index - 1] : LEVELS[0];
  }

  function minTier(a, b) {
    return LEVELS[Math.min(LEVELS.indexOf(a), LEVELS.indexOf(b))];
  }

  // ---- shaders ----

  var NOISE_GLSL = [
    "float lookHash( vec2 p ) {",
    "  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );",
    "  p3 += dot( p3, p3.yzx + 33.33 );",
    "  return fract( ( p3.x + p3.y ) * p3.z );",
    "}",
    "float lookNoise( vec2 p ) {",
    "  vec2 i = floor( p );",
    "  vec2 f = fract( p );",
    "  f = f * f * ( 3.0 - 2.0 * f );",
    "  return mix( mix( lookHash( i ), lookHash( i + vec2( 1.0, 0.0 ) ), f.x ),",
    "    mix( lookHash( i + vec2( 0.0, 1.0 ) ), lookHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );",
    "}"
  ].join("\n");

  var SKY_VERTEX = [
    "varying vec3 vLookDir;",
    "void main() {",
    "  vLookDir = position;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
    "}"
  ].join("\n");

  var SKY_FRAGMENT = [
    "uniform vec3 top;",
    "uniform vec3 horizon;",
    "uniform vec3 bottom;",
    "uniform float curve;",
    "uniform vec3 sunDir;",
    "uniform vec3 sunColor;",
    "uniform float sunSize;",
    "uniform float sunGlow;",
    "uniform vec3 cloudColor;",
    "uniform vec3 cloudShade;",
    "uniform float cloudCover;",
    "uniform float cloudBlocky;",
    "uniform float stars;",
    "varying vec3 vLookDir;",
    NOISE_GLSL,
    "float lookHash3( vec3 p3 ) {",
    "  p3 = fract( p3 * 0.1031 );",
    "  p3 += dot( p3, p3.zyx + 31.32 );",
    "  return fract( ( p3.x + p3.y ) * p3.z );",
    "}",
    "float lookFbm( vec2 p ) {",
    "  float value = 0.0;",
    "  float amp = 0.5;",
    "  for ( int i = 0; i < 5; i ++ ) {",
    "    value += amp * lookNoise( p );",
    "    p = p * 2.02 + vec2( 17.3, 9.1 );",
    "    amp *= 0.5;",
    "  }",
    "  return value;",
    "}",
    "void main() {",
    "  vec3 dir = normalize( vLookDir );",
    "  float h = dir.y;",
    "  vec3 color = h >= 0.0",
    "    ? mix( horizon, top, pow( clamp( h, 0.0, 1.0 ), curve ) )",
    "    : mix( horizon, bottom, pow( clamp( - h * 3.0, 0.0, 1.0 ), 0.6 ) );",
    "  float facing = dot( dir, sunDir );",
    "  float above = smoothstep( -0.05, 0.02, h );",
    "  color += sunColor * sunGlow * ( 0.25 * pow( max( facing, 0.0 ), 6.0 ) + pow( max( facing, 0.0 ), 60.0 ) ) * above;",
    "  if ( cloudCover > 0.0 && h > 0.0 ) {",
    "    vec2 uv = dir.xz / ( h + 0.18 ) * 1.6;",
    "    float blocky = step( 0.5, cloudBlocky );",
    "    float n = mix( lookFbm( uv ), lookFbm( floor( uv * 3.0 ) * 0.7 ), blocky );",
    "    float threshold = mix( 0.75, 0.3, cloudCover );",
    "    float cover = smoothstep( threshold, threshold + mix( 0.2, 0.01, blocky ), n ) * smoothstep( 0.0, 0.2, h );",
    "    float lit = mix( smoothstep( 0.2, 0.8, lookFbm( uv * 1.7 + 4.0 ) * 0.7 + 0.3 * max( facing, 0.0 ) ), 1.0, blocky );",
    "    color = mix( color, mix( cloudShade, cloudColor, lit ), cover );",
    "  }",
    "  if ( stars > 0.0 && h > 0.0 ) {",
    "    vec3 cell = floor( dir * 140.0 );",
    "    float star = step( 0.9972, lookHash3( cell ) ) * ( 0.5 + 0.5 * lookHash3( cell + 7.0 ) );",
    "    color += vec3( star * stars * 2.0 * smoothstep( 0.02, 0.25, h ) );",
    "  }",
    "  if ( sunSize > 0.0 ) {",
    "    float disc = smoothstep( cos( sunSize ), cos( sunSize * 0.6 ), facing ) * above;",
    "    color = mix( color, sunColor * 8.0, disc );",
    "  }",
    "  gl_FragColor = vec4( color, 1.0 );",
    "}"
  ].join("\n");

  // Colour grade on linear HDR before the tone mapping pass.
  var GRADE_SHADER = {
    name: "LookGradeShader",
    uniforms: {
      tDiffuse: { value: null },
      saturation: { value: 1 },
      contrast: { value: 1 },
      tint: { value: null },
      vignette: { value: 0 }
    },
    vertexShader: [
      "varying vec2 vUv;",
      "void main() {",
      "  vUv = uv;",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
      "}"
    ].join("\n"),
    fragmentShader: [
      "uniform sampler2D tDiffuse;",
      "uniform float saturation;",
      "uniform float contrast;",
      "uniform vec3 tint;",
      "uniform float vignette;",
      "varying vec2 vUv;",
      "void main() {",
      "  vec4 texel = texture2D( tDiffuse, vUv );",
      "  vec3 color = max( texel.rgb * tint, vec3( 0.0 ) );",
      "  float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );",
      "  color = max( mix( vec3( luma ), color, saturation ), vec3( 0.0 ) );",
      "  color = 0.18 * pow( color / 0.18, vec3( contrast ) );",
      "  vec2 offset = vUv - 0.5;",
      "  color *= 1.0 - vignette * dot( offset, offset ) * 1.6;",
      "  gl_FragColor = vec4( color, texel.a );",
      "}"
    ].join("\n")
  };

  var WATER_VERTEX = [
    "vec4 lookWorld = vec4( transformed, 1.0 );",
    "#ifdef USE_INSTANCING",
    "  lookWorld = instanceMatrix * lookWorld;",
    "#endif",
    "vLookWorld = ( modelMatrix * lookWorld ).xyz;"
  ].join("\n");

  var WATER_NORMAL = [
    "vec2 lookP = vLookWorld.xz * 0.45;",
    "vec2 lookA = vec2( lookTime * 0.32, lookTime * 0.21 );",
    "vec2 lookB = vec2( - lookTime * 0.23, lookTime * 0.37 );",
    "float lookH0 = lookNoise( lookP + lookA ) * 0.6 + lookNoise( lookP * 2.3 + lookB ) * 0.4;",
    "float lookHx = lookNoise( lookP + vec2( 0.06, 0.0 ) + lookA ) * 0.6 + lookNoise( ( lookP + vec2( 0.06, 0.0 ) ) * 2.3 + lookB ) * 0.4;",
    "float lookHz = lookNoise( lookP + vec2( 0.0, 0.06 ) + lookA ) * 0.6 + lookNoise( ( lookP + vec2( 0.0, 0.06 ) ) * 2.3 + lookB ) * 0.4;",
    "vec3 lookN = normalize( vec3( ( lookH0 - lookHx ) * lookWaves, 1.0, ( lookH0 - lookHz ) * lookWaves ) );",
    "normal = normalize( ( viewMatrix * vec4( lookN, 0.0 ) ).xyz );"
  ].join("\n");

  var FOLIAGE_VERTEX = [
    "vec3 lookOrigin = vec3( modelMatrix[ 3 ][ 0 ], 0.0, modelMatrix[ 3 ][ 2 ] );",
    "#ifdef USE_INSTANCING",
    "  lookOrigin += vec3( instanceMatrix[ 3 ][ 0 ], 0.0, instanceMatrix[ 3 ][ 2 ] );",
    "#endif",
    "float lookBend = lookSway * min( max( transformed.y, 0.0 ), 3.0 );",
    "float lookPhase = lookTime * 1.7 + lookOrigin.x * 0.37 + lookOrigin.z * 0.53;",
    "transformed.x += sin( lookPhase ) * lookBend;",
    "transformed.z += cos( lookPhase * 0.83 ) * lookBend * 0.6;"
  ].join("\n");

  // Grows with view depth, so the outline stays about the same width on screen.
  var OUTLINE_VERTEX = [
    "float lookScale = max( length( vec3( modelMatrix[ 0 ][ 0 ], modelMatrix[ 0 ][ 1 ], modelMatrix[ 0 ][ 2 ] ) ), 0.0001 );",
    "float lookDepth = isOrthographic ? 12.0 : max( - ( modelViewMatrix * vec4( transformed, 1.0 ) ).z, 0.1 );",
    "transformed += normalize( lookOutlineNormal ) * ( lookOutline * lookDepth / lookScale );"
  ].join("\n");

  // ---- the per-game look ----

  function warnOnce(state, key, error) {
    if (state.warned[key]) return;
    state.warned[key] = true;
    if (typeof console !== "undefined" && console.warn) console.warn("ctx.look: " + key, error || "");
  }

  function createLook(ctx) {
    var THREE = ctx.THREE;
    var renderer = ctx.renderer;
    var scene = ctx.scene;
    var state = {
      warned: {},
      id: null,
      preset: null,
      options: {},
      gameQuality: "auto",
      detected: null,
      probed: null,
      tier: null,
      hemi: null,
      sun: null,
      sunDir: new THREE.Vector3(0, 1, 0),
      env: null,
      fog: null,
      fogDistance: 0,
      composer: null,
      postWanted: false,
      renderPass: null,
      gradePass: null,
      composerSize: "",
      sizeKey: "",
      time: { value: 0 },
      // Look-made shiny materials keep full sky reflections whatever the preset's env level.
      reflections: { value: 1 },
      renderHook: false,
      applied: 0,
      probe: null,
      seen: typeof WeakSet === "function" ? new WeakSet() : null,
      scanFrame: 0,
      outlineMaterial: null,
      outlineNormals: typeof WeakMap === "function" ? new WeakMap() : null,
      toonGradient: null
    };
    // The kit's default lights (three-core marks them); apply() replaces them.
    var tmp = {
      vector: new THREE.Vector3(),
      vector2: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      eye: new THREE.Vector3(),
      size: new THREE.Vector2()
    };

    function glReady() {
      return !!(glContext(renderer) && renderer.capabilities && typeof renderer.getRenderTarget === "function");
    }

    function effectiveTier() {
      if (graphics.choice !== "auto") return graphics.choice;
      if (!state.detected) state.detected = detectTier(renderer);
      var tier = state.probed || state.detected.tier;
      if (state.gameQuality !== "auto") {
        tier = state.detected.software ? minTier(state.gameQuality, "low") : state.gameQuality;
      }
      return tier;
    }

    // ---- lights ----

    function removeKitLights() {
      (scene.children || []).slice().forEach(function (child) {
        if (child && child.isLight && child.userData && child.userData.vibeKitDefaultLight) {
          scene.remove(child);
        }
      });
    }

    function ensureLights() {
      if (!state.hemi || state.hemi.parent !== scene) {
        state.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
        state.hemi.name = "look-hemisphere";
        scene.add(state.hemi);
      }
      if (!state.sun || state.sun.parent !== scene) {
        state.sun = new THREE.DirectionalLight(0xffffff, 1);
        state.sun.name = "look-sun";
        scene.add(state.sun);
      }
    }

    function configureLights(preset) {
      ensureLights();
      var hemi = state.hemi;
      hemi.color.setHex(preset.hemi.sky);
      hemi.groundColor.setHex(preset.hemi.ground);
      hemi.intensity = preset.hemi.intensity;
      var sun = state.sun;
      var sunCfg = preset.sun;
      var options = state.options.sun || {};
      var elevation = numberOr(options.elevation, sunCfg.elevation) * Math.PI / 180;
      var azimuth = numberOr(options.azimuth, sunCfg.azimuth) * Math.PI / 180;
      state.sunDir.set(
        Math.cos(elevation) * Math.sin(azimuth),
        Math.sin(elevation),
        Math.cos(elevation) * Math.cos(azimuth)
      ).normalize();
      sun.color.setHex(sunCfg.color);
      sun.intensity = sunCfg.intensity;
      sun.position.copy(state.sunDir).multiplyScalar(50);
      if (sun.shadow) {
        sun.shadow.radius = sunCfg.softness;
        if ("intensity" in sun.shadow) sun.shadow.intensity = sunCfg.shadow;
        sun.shadow.bias = -0.0004;
      }
    }

    // ---- tone mapping, sky, environment, fog ----

    function configureRenderer(preset) {
      var tones = { aces: "ACESFilmicToneMapping", agx: "AgXToneMapping", neutral: "NeutralToneMapping" };
      var mapping = THREE[tones[preset.tone]];
      if (mapping !== undefined) renderer.toneMapping = mapping;
      renderer.toneMappingExposure = preset.exposure;
      if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    function radianceColor(preset, hex) {
      var rgb = radianceFor(preset.tone, hex, preset.exposure);
      return new THREE.Color(rgb[0], rgb[1], rgb[2]);
    }

    function skyMaterial(preset) {
      var sky = preset.sky;
      var sunRgb = hexToLinear(sky.sun);
      return new THREE.ShaderMaterial({
        name: "LookSky",
        uniforms: {
          top: { value: radianceColor(preset, sky.top) },
          horizon: { value: radianceColor(preset, sky.horizon) },
          bottom: { value: radianceColor(preset, sky.bottom) },
          curve: { value: sky.curve },
          sunDir: { value: state.sunDir.clone() },
          sunColor: { value: new THREE.Color(sunRgb[0], sunRgb[1], sunRgb[2]) },
          sunSize: { value: sky.sunSize > 0 ? sky.sunSize * Math.PI / 180 : -1 },
          sunGlow: { value: sky.glow || 0 },
          cloudColor: { value: radianceColor(preset, sky.cloud) },
          cloudShade: { value: radianceColor(preset, sky.cloudShade) },
          cloudCover: { value: sky.clouds || 0 },
          cloudBlocky: { value: sky.blocky ? 1 : 0 },
          stars: { value: sky.stars || 0 }
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false
      });
    }

    function disposeEnvironment() {
      var env = state.env;
      state.env = null;
      if (!env) return;
      [env.background, env.lighting].forEach(function (target) {
        if (target && typeof target.dispose === "function") {
          try { target.dispose(); } catch (error) { /* already gone with the context */ }
        }
      });
      if (scene.background === (env.background && env.background.texture)) scene.background = null;
      if (scene.environment === (env.lighting && env.lighting.texture)) scene.environment = null;
    }

    function buildEnvironment(preset, tier) {
      disposeEnvironment();
      state.reflections.value = clamp(0.9 / Math.max(preset.env, 0.05), 1, 6);
      var horizon = preset.sky.horizon;
      if (!glReady() || typeof THREE.PMREMGenerator !== "function") {
        scene.background = new THREE.Color(horizon);
        scene.environment = null;
        return;
      }
      var generator = null;
      var skyScene = null;
      var room = null;
      try {
        generator = new THREE.PMREMGenerator(renderer);
        skyScene = new THREE.Scene();
        skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), skyMaterial(preset)));
        var size = TIERS[tier].envSize;
        var background = generator.fromScene(skyScene, 0, 0.1, 100, { size: size });
        var lighting = background;
        if (preset.room && typeof THREE.RoomEnvironment === "function") {
          room = new THREE.RoomEnvironment();
          lighting = generator.fromScene(room, 0.04, 0.1, 100, { size: 256 });
        }
        state.env = { background: background, lighting: lighting };
        scene.background = background.texture;
        scene.environment = lighting.texture;
        if ("environmentIntensity" in scene) scene.environmentIntensity = preset.env;
        if ("backgroundBlurriness" in scene) scene.backgroundBlurriness = 0;
        if ("backgroundIntensity" in scene) scene.backgroundIntensity = 1;
      } catch (error) {
        warnOnce(state, "environment unavailable", error);
        disposeEnvironment();
        scene.background = new THREE.Color(horizon);
        scene.environment = null;
      } finally {
        if (skyScene) {
          skyScene.traverse(function (node) {
            if (node.geometry) node.geometry.dispose();
            if (node.material) node.material.dispose();
          });
        }
        if (room && typeof room.dispose === "function") room.dispose();
        if (generator) {
          try { generator.dispose(); } catch (error) { /* nothing to free */ }
        }
      }
    }

    // On screen fog must match the sky's horizon: tone mapped colour when drawing straight
    // to the screen (fog is mixed after tone mapping), radiance when post-processing.
    function fogColor(preset) {
      var hex = preset.fog && preset.fog.color !== undefined ? preset.fog.color : preset.sky.horizon;
      if (state.composer) return radianceColor(preset, hex);
      return new THREE.Color(hex);
    }

    function configureFog(preset) {
      var fog = preset.fog;
      if (!fog) {
        scene.fog = null;
        state.fog = null;
        return;
      }
      state.fog = fog.density !== undefined
        ? new THREE.FogExp2(0xffffff, 0.01)
        : new THREE.Fog(0xffffff, 10, 100);
      state.fog.color.copy(fogColor(preset));
      scene.fog = state.fog;
      state.fogDistance = 0;
      updateFogDistance(playDistance(ctx.camera), true);
    }

    function updateFogDistance(distance, force) {
      var fog = state.fog;
      var cfg = state.preset && state.preset.fog;
      if (!fog || !cfg || scene.fog !== fog) return;
      var next = force || !state.fogDistance
        ? distance
        : state.fogDistance + (distance - state.fogDistance) * 0.05;
      if (!force && Math.abs(next - state.fogDistance) < 0.01) return;
      state.fogDistance = next;
      if (fog.isFogExp2) fog.density = cfg.density / next;
      else {
        fog.near = cfg.near * next;
        fog.far = cfg.far * next;
      }
    }

    // ---- play area: the fitCameraTo bounds, else a radius around the camera's target ----

    function fittedArea() {
      var fit = ctx.status && ctx.status.cameraFit;
      var bounds = fit && fit.bounds;
      if (!bounds || !bounds.min || !bounds.max) return null;
      var min = bounds.min;
      var max = bounds.max;
      var radius = Math.hypot(max[0] - min[0], max[2] - min[2]) / 2;
      if (!Number.isFinite(radius)) return null;
      return {
        x: (min[0] + max[0]) / 2,
        y: min[1],
        z: (min[2] + max[2]) / 2,
        radius: Math.max(2, radius + Math.max(0, max[1] - min[1]) * 0.5)
      };
    }

    function followArea(camera) {
      var size = numberOr(state.options.size, 0);
      var radius = size > 0 ? size / 2 : DEFAULT_PLAY_RADIUS;
      var center = tmp.vector.set(0, 0, 0);
      if (camera && camera.isCamera && typeof camera.getWorldDirection === "function") {
        camera.updateMatrixWorld();
        var eye = tmp.vector2.setFromMatrixPosition(camera.matrixWorld);
        var dir = camera.getWorldDirection(tmp.dir);
        var t = dir.y < -0.05 ? (0 - eye.y) / dir.y : -1;
        var reach = Math.max(12, radius * 2);
        if (t > 0 && t < reach * 3) center.copy(eye).addScaledVector(dir, t);
        else center.copy(eye).addScaledVector(dir, Math.min(reach, 15));
        var flat = Math.hypot(dir.x, dir.z);
        // Whole steps of 4 units: a radius that changed every frame would make shadows shimmer.
        var shadowRadius = Math.ceil(clamp(eye.distanceTo(center) * 1.3, 10, Math.max(10, Math.min(radius, 60))) / 4) * 4;
        if (flat > 0.0001) {
          center.x += dir.x / flat * shadowRadius * 0.3;
          center.z += dir.z / flat * shadowRadius * 0.3;
        }
        return { x: center.x, y: 0, z: center.z, radius: radius, shadowRadius: shadowRadius };
      }
      return { x: 0, y: 0, z: 0, radius: radius, shadowRadius: Math.min(radius, 30) };
    }

    function playDistance(camera) {
      var area = fittedArea() || followArea(camera);
      if (!camera || !camera.matrixWorld) return Math.max(8, area.radius * 2);
      var eye = tmp.eye.setFromMatrixPosition(camera.matrixWorld);
      return Math.max(8, Math.hypot(eye.x - area.x, eye.y - area.y, eye.z - area.z) + area.radius);
    }

    // ---- sun shadows fitted to the play area, snapped to shadow texels ----

    function updateShadow(camera) {
      var sun = state.sun;
      if (!sun || !sun.castShadow || !sun.shadow || !sun.shadow.camera) return;
      var area = fittedArea();
      var radius;
      if (area) radius = area.radius;
      else {
        area = followArea(camera);
        radius = area.shadowRadius;
      }
      var mapSize = sun.shadow.mapSize ? sun.shadow.mapSize.x || 1024 : 1024;
      var texel = (radius * 2) / mapSize;
      var dir = state.sunDir;
      var right = tmp.vector.set(0, 1, 0).cross(dir);
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();
      var up = tmp.vector2.copy(dir).cross(right).normalize();
      var u = Math.round((area.x * right.x + area.y * right.y + area.z * right.z) / texel) * texel;
      var v = Math.round((area.x * up.x + area.y * up.y + area.z * up.z) / texel) * texel;
      var w = Math.round((area.x * dir.x + area.y * dir.y + area.z * dir.z) / texel) * texel;
      var cx = right.x * u + up.x * v + dir.x * w;
      var cy = right.y * u + up.y * v + dir.y * w;
      var cz = right.z * u + up.z * v + dir.z * w;
      var distance = radius * 2 + 30;
      sun.target.position.set(cx, cy, cz);
      sun.target.updateMatrixWorld();
      sun.position.set(cx + dir.x * distance, cy + dir.y * distance, cz + dir.z * distance);
      var cam = sun.shadow.camera;
      var far = distance + radius * 2 + 30;
      if (cam.right !== radius || cam.far !== far) {
        cam.left = -radius;
        cam.right = radius;
        cam.top = radius;
        cam.bottom = -radius;
        cam.near = 0.5;
        cam.far = far;
        cam.updateProjectionMatrix();
        sun.shadow.normalBias = texel * 1.5;
      }
    }

    // Lets meshes cast and receive the sun's shadow unless the game already chose, or
    // marked a subtree with userData.lookShadows = false. Adds toon outlines when wanted.
    function scanScene(force) {
      if (!force && state.scanFrame++ % 30 !== 0) return;
      var shadows = !!(state.sun && state.sun.castShadow);
      var outlines = TIERS[state.tier] && TIERS[state.tier].outlines;
      if (!shadows && !outlines) return;
      var stack = [scene];
      while (stack.length) {
        var node = stack.pop();
        if (!node || (node.userData && node.userData.lookShadows === false)) continue;
        var children = node.children || [];
        for (var index = 0; index < children.length; index += 1) stack.push(children[index]);
        if (!node.isMesh || node.userData.lookOutline) continue;
        if (state.seen) {
          if (state.seen.has(node)) continue;
          state.seen.add(node);
        }
        if (shadows) flagShadows(node);
        if (outlines) addOutline(node);
      }
    }

    function flagShadows(mesh) {
      var geometry = mesh.geometry;
      // Without normals r182's shadow normal bias turns NaN: such a mesh never receives.
      var normals = !!(geometry && geometry.attributes && geometry.attributes.normal);
      if (!normals) mesh.receiveShadow = false;
      if (mesh.castShadow || mesh.receiveShadow) return;
      var material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material || material.isShaderMaterial || material.isPointsMaterial) return;
      // A game's own sky dome or skybox (inside-out) must never shade the world.
      if (material.side === THREE.BackSide) return;
      var kind = material.userData && material.userData.lookKind;
      var unlit = !!material.isMeshBasicMaterial;
      var seeThrough = material.transparent && material.opacity < 0.6;
      mesh.receiveShadow = !unlit && normals;
      if (geometry && !geometry.boundingBox && typeof geometry.computeBoundingBox === "function") {
        try { geometry.computeBoundingBox(); } catch (error) { return; }
      }
      var box = geometry && geometry.boundingBox;
      var flat = false;
      if (box) {
        var scale = mesh.scale || { x: 1, y: 1, z: 1 };
        var sx = (box.max.x - box.min.x) * Math.abs(scale.x);
        var sy = (box.max.y - box.min.y) * Math.abs(scale.y);
        var sz = (box.max.z - box.min.z) * Math.abs(scale.z);
        var thin = Math.min(sx, sy, sz);
        var wide = Math.max(sx, sy, sz);
        flat = (wide > 6 && thin < wide * 0.03) || wide > 400;
      }
      // Thousands of instances (grass, pebbles) cost more in the shadow pass than they add.
      var crowd = mesh.isInstancedMesh && mesh.count > 1000;
      mesh.castShadow = !seeThrough && !flat && !crowd && kind !== "water" && kind !== "glow";
    }

    // ---- toon outlines: an inverted hull child that ignores rays and bounds ----

    function outlineNormals(geometry) {
      var cached = state.outlineNormals && state.outlineNormals.get(geometry);
      if (cached) return cached;
      var position = geometry.attributes && geometry.attributes.position;
      if (!position || position.count > 20000) return null;
      var sums = {};
      var normal = geometry.attributes.normal;
      var keys = new Array(position.count);
      for (var i = 0; i < position.count; i += 1) {
        var key = Math.round(position.getX(i) * 1000) + "," + Math.round(position.getY(i) * 1000) + "," + Math.round(position.getZ(i) * 1000);
        keys[i] = key;
        var sum = sums[key] || (sums[key] = [0, 0, 0]);
        if (normal) {
          sum[0] += normal.getX(i);
          sum[1] += normal.getY(i);
          sum[2] += normal.getZ(i);
        } else {
          sum[0] += position.getX(i);
          sum[1] += position.getY(i);
          sum[2] += position.getZ(i);
        }
      }
      var data = new Float32Array(position.count * 3);
      for (var j = 0; j < position.count; j += 1) {
        var total = sums[keys[j]];
        var length = Math.hypot(total[0], total[1], total[2]);
        if (length < 1e-6) {
          data[j * 3 + 1] = 1;
          continue;
        }
        data[j * 3] = total[0] / length;
        data[j * 3 + 1] = total[1] / length;
        data[j * 3 + 2] = total[2] / length;
      }
      var attribute = new THREE.BufferAttribute(data, 3);
      if (state.outlineNormals) state.outlineNormals.set(geometry, attribute);
      return attribute;
    }

    function outlineMaterial() {
      if (state.outlineMaterial) return state.outlineMaterial;
      var material = new THREE.MeshBasicMaterial({ color: 0x1b1b2a, side: THREE.BackSide });
      material.name = "LookOutline";
      material.onBeforeCompile = function (shader) {
        shader.uniforms.lookOutline = { value: 0.0035 };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute vec3 lookOutlineNormal;\nuniform float lookOutline;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + OUTLINE_VERTEX);
      };
      material.customProgramCacheKey = function () { return "look-outline-1"; };
      state.outlineMaterial = material;
      return material;
    }

    function addOutline(mesh) {
      var material = Array.isArray(mesh.material) ? null : mesh.material;
      if (!material || !material.userData || !material.userData.lookOutline) return;
      if (mesh.isSkinnedMesh || mesh.isInstancedMesh || !mesh.geometry) return;
      var hasHull = (mesh.children || []).some(function (child) {
        return child && child.userData && child.userData.lookOutline;
      });
      if (hasHull) return;
      var geometry = mesh.geometry;
      var normals = outlineNormals(geometry);
      if (!normals) return;
      if (!geometry.attributes.lookOutlineNormal) geometry.setAttribute("lookOutlineNormal", normals);
      var hull = new THREE.Mesh(geometry, outlineMaterial());
      hull.name = "look-outline";
      hull.userData.lookOutline = true;
      hull.raycast = function () {};
      hull.castShadow = false;
      hull.receiveShadow = false;
      mesh.add(hull);
    }

    // ---- post-processing (high tier, when the add-ons bundle loaded) ----

    function disposeComposer() {
      var composer = state.composer;
      state.composer = null;
      state.renderPass = null;
      state.gradePass = null;
      if (!composer) return;
      try {
        (composer.passes || []).forEach(function (pass) {
          if (pass && typeof pass.dispose === "function") pass.dispose();
        });
        if (typeof composer.dispose === "function") composer.dispose();
      } catch (error) { /* context may already be gone */ }
    }

    function postAvailable() {
      return typeof THREE.EffectComposer === "function" && typeof THREE.RenderPass === "function" &&
        typeof THREE.OutputPass === "function" && glReady();
    }

    // Built on the first frame three-core draws through renderFrame, so a kit without that
    // hook never gets post-processing (and its fog stays matched to the direct path).
    function ensureComposer() {
      if (!state.postWanted || state.composer || !state.renderHook) return;
      var post = state.preset.post || {};
      try {
        renderer.getSize(tmp.size);
        var ratio = renderer.getPixelRatio();
        // 4x MSAA in HDR is costly: only for small buffers, FXAA otherwise.
        var msaa = tmp.size.x * tmp.size.y * ratio * ratio <= 1.05e6;
        var target = new THREE.WebGLRenderTarget(
          Math.max(1, Math.floor(tmp.size.x * ratio)),
          Math.max(1, Math.floor(tmp.size.y * ratio)),
          { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 }
        );
        var composer = new THREE.EffectComposer(renderer, target);
        composer.setPixelRatio(ratio);
        composer.setSize(tmp.size.x, tmp.size.y);
        state.renderPass = new THREE.RenderPass(scene, ctx.camera);
        composer.addPass(state.renderPass);
        if (post.bloom && typeof THREE.UnrealBloomPass === "function") {
          composer.addPass(new THREE.UnrealBloomPass(
            new THREE.Vector2(tmp.size.x, tmp.size.y), post.bloom[0], post.bloom[1], post.bloom[2]
          ));
        }
        if (typeof THREE.ShaderPass === "function") {
          var grade = new THREE.ShaderPass(GRADE_SHADER);
          var tint = hexToLinear(post.tint === undefined ? 0xffffff : post.tint);
          grade.uniforms.saturation.value = numberOr(post.saturation, 1);
          grade.uniforms.contrast.value = numberOr(post.contrast, 1);
          grade.uniforms.tint.value = new THREE.Vector3(tint[0], tint[1], tint[2]);
          grade.uniforms.vignette.value = numberOr(post.vignette, 0);
          composer.addPass(grade);
          state.gradePass = grade;
        }
        composer.addPass(new THREE.OutputPass());
        if (!msaa && typeof THREE.FXAAPass === "function") composer.addPass(new THREE.FXAAPass());
        state.composer = composer;
        state.composerMsaa = msaa;
        state.composerSize = tmp.size.x + "x" + tmp.size.y + "@" + ratio;
      } catch (error) {
        warnOnce(state, "post-processing unavailable", error);
        state.postWanted = false;
        disposeComposer();
      }
      if (state.fog) state.fog.color.copy(fogColor(state.preset));
      report();
    }

    // ---- tiers ----

    function setPixelRatio(config) {
      if (state.options.pixelRatio === false || typeof renderer.setPixelRatio !== "function") return;
      var area = 1;
      if (typeof renderer.getSize === "function") {
        renderer.getSize(tmp.size);
        area = Math.max(1, tmp.size.x * tmp.size.y);
      }
      var budget = state.postWanted && config.postPixels ? config.postPixels : config.pixels;
      var ratio = Math.min(window.devicePixelRatio || 1, config.pixelRatio, Math.sqrt(budget / area));
      ratio = Math.max(1, Math.round(ratio * 4) / 4);
      var current = typeof renderer.getPixelRatio === "function" ? renderer.getPixelRatio() : null;
      if (current !== ratio) renderer.setPixelRatio(ratio);
      state.sizeKey = area + "@" + (window.devicePixelRatio || 1);
    }

    function applyTier() {
      var preset = state.preset;
      if (!preset) return;
      var tier = effectiveTier();
      var config = TIERS[tier];
      state.tier = tier;
      disposeComposer();
      state.postWanted = !!(config.post && state.options.post !== false && postAvailable());
      setPixelRatio(config);
      var shadows = config.shadows && state.options.shadows !== false && !!renderer.shadowMap;
      if (renderer.shadowMap) {
        renderer.shadowMap.enabled = shadows;
        if (THREE.PCFShadowMap !== undefined) renderer.shadowMap.type = THREE.PCFShadowMap;
      }
      var sun = state.sun;
      if (sun) {
        sun.castShadow = shadows;
        if (shadows && sun.shadow && sun.shadow.mapSize && sun.shadow.mapSize.x !== config.shadowSize) {
          sun.shadow.mapSize.set(config.shadowSize, config.shadowSize);
          if (sun.shadow.map) {
            sun.shadow.map.dispose();
            sun.shadow.map = null;
          }
        }
      }
      ensureComposer();
      if (state.fog) state.fog.color.copy(fogColor(preset));
      if (shadows) {
        updateShadow(ctx.camera);
        scanScene(true);
      }
      if (config.outlines) scanScene(true);
      report();
    }

    function report() {
      if (!ctx.status) return;
      ctx.status.look = {
        id: state.id,
        tier: state.tier,
        choice: graphics.choice,
        detected: state.detected ? state.detected.tier : null,
        probed: state.probed,
        shadows: !!(state.sun && state.sun.castShadow),
        environment: !!state.env,
        post: !!state.composer,
        applied: state.applied
      };
    }

    // Frame-time probe: after a warm-up, 2 s of frames; a slow device steps down a tier.
    function startProbe() {
      if (state.probe || !state.detected || state.detected.software || !glReady()) return;
      state.probe = { frames: 0, samples: [], last: 0, rounds: 0 };
    }

    function probeFrame() {
      var probe = state.probe;
      if (!probe || graphics.choice !== "auto" || state.gameQuality !== "auto") return;
      if (typeof document !== "undefined" && document.hidden) {
        probe.last = 0;
        return;
      }
      var now = typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      var gap = probe.last ? now - probe.last : 0;
      probe.last = now;
      probe.frames += 1;
      if (probe.frames <= 40 || !gap || gap > 250) return;
      probe.samples.push(gap);
      var spent = probe.samples.reduce(function (sum, value) { return sum + value; }, 0);
      if (spent < 2000) return;
      var sorted = probe.samples.slice().sort(function (a, b) { return a - b; });
      var median = sorted[Math.floor(sorted.length / 2)];
      probe.rounds += 1;
      probe.frames = 0;
      probe.samples = [];
      var tier = state.tier;
      if (median > 26 && tier !== "low") {
        state.probed = median > 45 ? "low" : lowerTier(tier);
        applyTier();
        notifyListenersOnly();
      }
      if (probe.rounds >= 2 || state.tier === "low" || median <= 26) state.probe = null;
    }

    function notifyListenersOnly() {
      graphics.listeners.slice().forEach(function (listener) {
        try { listener({ choice: graphics.choice, tier: state.tier }); } catch (error) { /* ignore */ }
      });
    }

    // ---- per frame ----

    function frame(dt, camera) {
      state.time.value += Number.isFinite(dt) ? dt : 0.016;
      if (!state.preset) return;
      // A kit restart (or a game clearing its scene) removed the look's lights: put it back.
      if (state.sun && state.sun.parent !== scene && state.hemi && state.hemi.parent !== scene) {
        applyLook(state.id, state.options);
      }
      if (typeof renderer.getSize === "function") {
        renderer.getSize(tmp.size);
        if (tmp.size.x * tmp.size.y + "@" + (window.devicePixelRatio || 1) !== state.sizeKey) {
          setPixelRatio(TIERS[state.tier] || TIERS.medium);
        }
      }
      updateShadow(camera);
      if (state.fog) updateFogDistance(playDistance(camera), false);
      scanScene(false);
    }

    function onUpdate(dt) {
      try {
        if (!state.renderHook) frame(dt, ctx.camera);
        probeFrame();
      } catch (error) {
        warnOnce(state, "frame update failed", error);
      }
    }

    var updateHooked = false;

    function hookUpdates() {
      if (updateHooked || typeof ctx.onUpdate !== "function") return;
      updateHooked = true;
      ctx.onUpdate(onUpdate);
    }

    // ---- materials ----

    function colorOf(value, fallback) {
      try {
        if (value && value.isColor) return value.clone();
        if (value !== undefined && value !== null && value !== "") return new THREE.Color(value);
      } catch (error) { /* fall through */ }
      return new THREE.Color(fallback);
    }

    function toonGradient() {
      if (state.toonGradient) return state.toonGradient;
      var texture = new THREE.DataTexture(new Uint8Array([70, 160, 255]), 3, 1, THREE.RedFormat);
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      state.toonGradient = texture;
      return texture;
    }

    // Shader additions for look materials; uniforms are shared, so one update moves them all.
    function shaderPatch(material, key, patch) {
      material.onBeforeCompile = function (shader) {
        shader.uniforms.lookTime = state.time;
        shader.uniforms.lookReflections = state.reflections;
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform float lookTime;\nuniform float lookReflections;")
          .replace("#include <lights_fragment_maps>", "#include <lights_fragment_maps>\nradiance *= lookReflections;");
        if (patch) patch(shader);
      };
      material.customProgramCacheKey = function () { return key; };
    }

    function makeMaterial(kind, options) {
      options = options || {};
      var color = colorOf(options.color, 0xffffff);
      var material;
      if (kind === "toon") {
        material = new THREE.MeshToonMaterial({ color: color, gradientMap: toonGradient() });
        material.userData.lookOutline = options.outline !== false;
      } else if (kind === "glossy") {
        material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.16, metalness: 0 });
        shaderPatch(material, "look-glossy-1", null);
      } else if (kind === "metal") {
        material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 1 });
        shaderPatch(material, "look-metal-1", null);
      } else if (kind === "glow") {
        material = new THREE.MeshBasicMaterial({ color: color });
        material.color.multiplyScalar(numberOr(options.intensity, 2.5));
      } else if (kind === "water") {
        material = new THREE.MeshStandardMaterial({
          color: color, roughness: 0.08, metalness: 0, transparent: true,
          opacity: numberOr(options.opacity, 0.85)
        });
        var waves = numberOr(options.waves, 1);
        shaderPatch(material, "look-water-1", function (shader) {
          shader.uniforms.lookWaves = { value: 3.5 * waves };
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vLookWorld;")
            .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n" + WATER_VERTEX);
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nuniform float lookWaves;\nvarying vec3 vLookWorld;\n" + NOISE_GLSL)
            .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + WATER_NORMAL);
        });
      } else if (kind === "foliage") {
        material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, metalness: 0 });
        var sway = numberOr(options.wind, 1) * 0.05;
        material.onBeforeCompile = function (shader) {
          shader.uniforms.lookTime = state.time;
          shader.uniforms.lookSway = { value: sway };
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nuniform float lookTime;\nuniform float lookSway;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + FOLIAGE_VERTEX);
        };
        material.customProgramCacheKey = function () { return "look-foliage-1"; };
      } else {
        warnOnce(state, 'unknown material "' + kind + '", using "glossy"');
        return makeMaterial("glossy", options);
      }
      material.name = "look-" + kind;
      material.userData.lookKind = kind;
      if (options.opacity !== undefined && kind !== "water") {
        material.transparent = numberOr(options.opacity, 1) < 1;
        material.opacity = numberOr(options.opacity, 1);
      }
      return material;
    }

    // ---- public API ----

    var api = {
      version: LOOK3D_VERSION,
      presets: Object.keys(PRESETS),
      materials: MATERIAL_KINDS.slice(),
      id: null,
      quality: null,
      sun: null,
      hemi: null,
      apply: function (id, options) {
        try {
          applyLook(id, options);
        } catch (error) {
          warnOnce(state, "apply failed", error);
        }
        return api;
      },
      material: function (kind, options) {
        try {
          return makeMaterial(String(kind || "glossy"), options);
        } catch (error) {
          warnOnce(state, "material failed", error);
          return new THREE.MeshStandardMaterial({ color: colorOf(options && options.color, 0xffffff) });
        }
      },
      // Three-core calls this each frame; true means the look drew the frame (post-processing).
      renderFrame: function (frameScene, frameCamera, dt) {
        state.renderHook = true;
        try {
          frame(dt, frameCamera);
          ensureComposer();
          var composer = state.composer;
          if (!composer || frameScene !== scene) return false;
          renderer.getSize(tmp.size);
          var ratio = renderer.getPixelRatio();
          var key = tmp.size.x + "x" + tmp.size.y + "@" + ratio;
          if (key !== state.composerSize && state.composerMsaa &&
            tmp.size.x * tmp.size.y * ratio * ratio > 1.05e6) {
            disposeComposer();
            ensureComposer();
            composer = state.composer;
            if (!composer) return false;
          } else if (key !== state.composerSize) {
            composer.setPixelRatio(ratio);
            composer.setSize(tmp.size.x, tmp.size.y);
            state.composerSize = key;
          }
          state.renderPass.scene = frameScene;
          state.renderPass.camera = frameCamera;
          composer.render(dt);
          return true;
        } catch (error) {
          warnOnce(state, "post-processing failed, drawing without it", error);
          state.postWanted = false;
          disposeComposer();
          if (state.fog && state.preset) state.fog.color.copy(fogColor(state.preset));
          report();
          return false;
        }
      },
      refreshTier: function () {
        try { applyTier(); } catch (error) { warnOnce(state, "quality change failed", error); }
        api.quality = state.tier;
      },
      tier: function () { return state.tier; },
      dispose: function () {
        disposeComposer();
        disposeEnvironment();
      }
    };

    function optionsKey(options) {
      try { return JSON.stringify(options); } catch (error) { return String(Math.random()); }
    }

    function applyLook(id, options) {
      options = options && typeof options === "object" ? options : {};
      var key = String(id || "");
      var preset = PRESETS[key];
      if (!preset) {
        warnOnce(state, 'unknown look "' + key + '", using "' + DEFAULT_LOOK + '"');
        key = DEFAULT_LOOK;
        preset = PRESETS[key];
      }
      // A game that calls apply every frame must not rebuild the sky every frame.
      var same = key === state.id && optionsKey(options) === optionsKey(state.options);
      if (same && state.sun && state.sun.parent === scene && state.hemi && state.hemi.parent === scene) {
        return;
      }
      state.applied += 1;
      var quality = String(options.quality || "auto").toLowerCase();
      state.gameQuality = validLevel(quality) ? quality : "auto";
      state.options = options;
      state.id = key;
      state.preset = preset;
      graphics.active = api;
      removeKitLights();
      configureLights(preset);
      configureRenderer(preset);
      var tier = effectiveTier();
      state.tier = tier;
      buildEnvironment(preset, tier);
      disposeComposer();
      configureFog(preset);
      if (state.seen && typeof WeakSet === "function") state.seen = new WeakSet();
      applyTier();
      hookUpdates();
      startProbe();
      api.id = key;
      api.quality = state.tier;
      api.sun = state.sun;
      api.hemi = state.hemi;
    }

    return api;
  }

  kit.look3d = {
    version: LOOK3D_VERSION,
    presets: PRESETS,
    tiers: TIERS,
    toneMap: toneMap,
    radianceFor: radianceFor,
    hexToLinear: hexToLinear,
    linearToHex: linearToHex,
    detectTier: detectTier
  };

  kit.extend(function (ctx, info) {
    if (!info || info.renderer !== "three" || !ctx || !ctx.THREE || !ctx.scene || !ctx.renderer) return;
    if (ctx.status) ctx.status.look = null;
    graphics.active = null;
    ctx.look = createLook(ctx);
  });
})();

/* DIY model library (three.js): rigged, animated library models in one line.
   ctx.models.spawn(id) returns a handle at once with a placeholder box sized from the
   manifest, and swaps the real model in when its GLB arrives from DIYKit.libraryBase.
   The game never waits: no loader, no network or a broken file keeps the placeholder.
   Manifest entries come from DIYKit.modelData (the engine embeds the ones a game uses).
   Models with a far version spawn it with { lod: 1 }; ctx.models.colliders(handle) gives
   collision boxes. Pack nodes keep their extras as userData (h.node, h.nodes). */
(function () {
  var K = (window.DIYKit = window.DIYKit || {
    libraryBase: "https://cdn.diy.org/vibe-library/v1",
    extensions: [],
    extend: function (fn) { this.extensions.push(fn); },
  });
  var MODELS_KIT_VERSION = 2;
  K.modelsKitVersion = MODELS_KIT_VERSION;
  K.credits = K.credits || [];
  K.modelData = K.modelData || {};
  var warned = {};
  // GLB loads still on their way; the test-run waits on them before its screenshots.
  var inflight = [];
  K.modelsSettled = function () { return Promise.all(inflight.slice()); };
  var LOCOMOTION = ["walk", "run", "sprint", "swim", "fly", "crawl"];
  var LOOPING = ["idle", "walk", "run", "sprint", "swim", "fly", "crawl", "dance"];
  var UPLOAD_URL = /^https:\/\/cdn\.diy\.org\/(?:dev\/|prod\/)?projects\/vibecode\/[A-Za-z0-9._\/-]+\.glb$/;

  function warn(key, message) {
    if (warned[key]) return;
    warned[key] = true;
    try { if (typeof console !== "undefined" && console.warn) console.warn("[DIY models] " + message); } catch (_e) {}
  }

  function addCredit(entry) {
    if (entry && entry.credit && K.credits.indexOf(entry.credit) === -1) K.credits.push(entry.credit);
  }

  function readPosition(target, pos) {
    if (Array.isArray(pos)) target.set(Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0);
    else if (pos && typeof pos === "object") target.set(Number(pos.x) || 0, Number(pos.y) || 0, Number(pos.z) || 0);
    else target.set(0, 0, 0);
  }

  // One GLB load per file, prepared once and cloned per handle.
  function createLibrary(THREE, ctx) {
    var templates = {};
    var loader = null;
    var checked = false;

    function gltfLoader() {
      if (!checked) {
        checked = true;
        if (typeof THREE.GLTFLoader === "function") {
          try { loader = new THREE.GLTFLoader(); } catch (_e) { loader = null; }
        }
        if (!loader) warn("loader", "three-addons is not loaded: models stay as placeholders.");
      }
      return loader;
    }

    // Library files sit under DIYKit.libraryBase; a kid's own upload is a full URL in the game's
    // CDN folder (env-prefixed), the only other place the game may fetch from.
    function url(path) {
      var text = String(path || "");
      if (/^https:\/\//.test(text)) return UPLOAD_URL.test(text) ? text : "";
      return String(K.libraryBase || "").replace(/\/+$/, "") + "/" + text.replace(/^\/+/, "");
    }

    // Flat-shaded models arrive without normals: rebuild them (r182 shadows read them) and shade flat.
    function prepare(scene, entry) {
      scene.traverse(function (o) {
        if (!o.isMesh) return;
        var g = o.geometry;
        if (g && !g.attributes.normal) {
          try { g.computeVertexNormals(); } catch (_e) {}
        }
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
          if (m && entry && entry.flat) { m.flatShading = true; m.needsUpdate = true; }
        });
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.isSkinnedMesh) o.frustumCulled = false;
      });
    }

    function load(path, entry) {
      var key = String(path || "");
      if (templates[key]) return templates[key].promise;
      var record = { ready: false, scene: null, clips: [], skinned: false, warmed: false, promise: null };
      templates[key] = record;
      record.promise = new Promise(function (resolve) {
        var l = gltfLoader();
        if (!l || !key || !url(key)) { resolve(record); return; }
        try {
          l.load(url(key), function (gltf) {
            try {
              record.scene = gltf.scene || (gltf.scenes && gltf.scenes[0]) || null;
              record.clips = gltf.animations || [];
              if (record.scene) {
                prepare(record.scene, entry);
                record.scene.traverse(function (o) { if (o.isSkinnedMesh) record.skinned = true; });
                record.ready = true;
                warmUp(record);
              }
            } catch (_e) {
              record.ready = false;
            }
            resolve(record);
          }, undefined, function () {
            warn("load:" + key, "could not load " + key + " (the placeholder stays).");
            resolve(record);
          });
        } catch (_e) {
          resolve(record);
        }
      });
      inflight.push(record.promise);
      record.promise.then(function () { inflight.splice(inflight.indexOf(record.promise), 1); });
      return record.promise;
    }

    function cloneScene(record) {
      var utils = THREE.SkeletonUtils;
      if (record.skinned && utils && typeof utils.clone === "function") return utils.clone(record.scene);
      if (record.skinned) warn("skeletonutils", "SkeletonUtils is missing: animated copies share one skeleton.");
      return record.scene.clone(true);
    }

    // Shaders for a new model build while a tiny copy sits out of sight, not when it first shows.
    // A hidden copy drawn for two frames compiles the model's shaders before it shows.
    // (No renderer.compileAsync: after a lost WebGL context its timer throws out of reach.)
    function warmUp(record) {
      if (record.warmed || !ctx.scene) return;
      try {
        var gl = ctx.renderer && ctx.renderer.getContext && ctx.renderer.getContext();
        if (gl && gl.isContextLost && gl.isContextLost()) return;
      } catch (_e) {}
      record.warmed = true;
      var warm = cloneScene(record);
      warm.position.set(0, -500, 0);
      warm.scale.setScalar(0.001);
      ctx.scene.add(warm);
      var frames = 2;
      var off = ctx.onUpdate(function () {
        frames -= 1;
        if (frames > 0) return;
        if (warm.parent) warm.parent.remove(warm);
        if (typeof off === "function") off();
      });
    }

    return { load: load, cloneScene: cloneScene, warmUp: warmUp };
  }

  // Clip names, roles and moments: the model's own, then its shared packs.
  function clipInfo(entries) {
    var byName = {};
    var roles = {};
    entries.forEach(function (e) {
      if (!e) return;
      (e.anims || []).forEach(function (a) {
        if (a && a.name && !byName[a.name]) byName[a.name] = { anim: a, entry: e };
      });
      var clips = e.clips || {};
      Object.keys(clips).forEach(function (role) { if (!roles[role]) roles[role] = clips[role]; });
    });
    return { byName: byName, roles: roles };
  }

  function createModels(ctx, THREE) {
    var lib = createLibrary(THREE, ctx);
    var active = [];
    var pools = {};
    var api = {};
    var v1 = new THREE.Vector3();
    var v2 = new THREE.Vector3();
    var q1 = new THREE.Quaternion();
    var q2 = new THREE.Quaternion();

    function data(id) {
      var entry = K.modelData[id];
      if (!entry) warn("data:" + id, "no library model '" + id + "' in this game (a placeholder shows).");
      return entry || null;
    }

    // { lod: 1 } picks the far version a model comes with (entry.lod1); the model otherwise.
    function lodOf(entry, options) {
      return entry && entry.lod1 && options && Number(options.lod) === 1 ? 1 : 0;
    }

    function pathOf(entry, lod) {
      return lod === 1 ? entry.lod1 : entry.path;
    }

    function info(h) {
      if (!h._info) {
        var packs = ((h.entry && h.entry.packs) || []).map(function (pid) { return K.modelData[pid] || null; });
        h._info = clipInfo([h.entry].concat(packs));
      }
      return h._info;
    }

    function colorOf(value) {
      try {
        var c = new THREE.Color();
        if (typeof value === "number") c.setHex(value);
        else c.setStyle(String(value));
        return c;
      } catch (_e) {
        return null;
      }
    }

    function unhide(record) {
      (record.hidden || []).forEach(function (x) { x.visible = true; });
      record.hidden = null;
    }

    // The model's own parts, never the things attached to it (a hat's nodes or a pet's bones).
    function ownTraverse(h, fn) {
      if (!h.model) return;
      var attached = h._attached.map(function (r) { return r.object; });
      (function walk(o) {
        if (attached.indexOf(o) >= 0) return;
        fn(o);
        for (var i = 0; i < o.children.length; i += 1) walk(o.children[i]);
      })(h.model);
    }

    // Found once per model (hit spheres ask every frame).
    function ownObject(h, name) {
      if (!h.model) return null;
      if (!h._own || h._own.model !== h.model) h._own = { model: h.model, found: Object.create(null) };
      if (name in h._own.found) return h._own.found[name];
      var found = null;
      ownTraverse(h, function (o) { if (!found && o.name === name) found = o; });
      h._own.found[name] = found;
      return found;
    }

    // ---- handles
    function makeHandle(id, entry, options) {
      var holder = new THREE.Group();
      holder.name = "model-" + id;
      var h = {
        id: id, entry: entry, object: holder, position: holder.position, rotation: holder.rotation,
        ready: false, model: null, mixer: null, placeholder: null,
        _clips: [], _actions: {}, _current: null, _currentName: "", _lastTime: 0, _oneShot: null, _hold: false,
        _listeners: {}, _attached: [], _pending: [], _scale: 1, _colors: null, _moveSpeed: null,
        _wheels: null, _released: false, _parts: false, _hair: null, _info: null,
      };
      var size = (entry && entry.size) || [1, 1, 1];
      var box = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.05, size[0] || 1), Math.max(0.05, size[1] || 1), Math.max(0.05, size[2] || 1)),
        new THREE.MeshLambertMaterial({ color: 0xb8b0c8, transparent: true, opacity: 0.55 })
      );
      box.position.y = (size[1] || 1) / 2;
      box.name = "model-placeholder";
      holder.add(box);
      h.placeholder = box;
      addMethods(h);
      place(h, options);
      return h;
    }

    function place(h, options) {
      var entry = h.entry || {};
      var baseHeight = entry.height || (entry.size && entry.size[1]) || 1;
      h._scale = Number(options.scale) || (Number(options.height) > 0 ? Number(options.height) / baseHeight : 1);
      h.object.scale.setScalar(h._scale);
      readPosition(h.object.position, options.position);
      h.object.rotation.set(0, typeof options.rotationY === "number" ? options.rotationY : 0, 0);
      h.object.visible = true;
      if (options.colors) h._colors = Object.assign({}, options.colors);
      if (options.add !== false && ctx.scene) ctx.scene.add(h.object);
    }

    function addMethods(h) {
      h.on = function (name, fn) {
        if (typeof fn === "function") (h._listeners[name] = h._listeners[name] || []).push(fn);
        return h;
      };
      h.off = function (name, fn) {
        var list = h._listeners[name] || [];
        if (list.indexOf(fn) >= 0) list.splice(list.indexOf(fn), 1);
        return h;
      };
      h.face = function (x, z) {
        var dx = Number(x) || 0;
        var dz = Number(z) || 0;
        if (Math.abs(dx) + Math.abs(dz) > 1e-6) h.object.rotation.y = Math.atan2(-dx, -dz);
        return h;
      };
      h.bone = function (name) {
        var bones = (h.entry && h.entry.bones) || {};
        return ownObject(h, bones[name] || name);
      };
      // A named node of the model (null until it loads); a pack's node extras are its userData.
      h.node = function (name) { return ownObject(h, String(name || "")); };
      // Every node whose name starts with prefix: "socket_", "anim_", "screen_", "state_"...
      h.nodes = function (prefix) {
        var start = String(prefix || "");
        var out = [];
        ownTraverse(h, function (o) { if (o !== h.model && o.name && o.name.indexOf(start) === 0) out.push(o); });
        return out;
      };
      // Front wheels turn on their steer_ pivots (radians; + turns left).
      h.steer = function (angle) {
        h._steerAngle = Number(angle) || 0;
        if (h.ready) steerNow(h);
        return h;
      };
      // Wheels spin for this ground speed (m/s; negative backs up), instead of move(speed).
      h.roll = function (speed) {
        h._moveSpeed = null;
        h._wheelSpeed = Number(speed) || 0;
        return h;
      };
      h.clips = function () { return Object.keys(info(h).byName); };
      h.play = function (name, opts) {
        if (h._released) return h;
        if (!h.ready) h._pending.push([name, opts || {}]);
        else play(h, name, opts || {});
        return h;
      };
      h.move = function (speed) {
        h._moveSpeed = Math.max(0, Number(speed) || 0);
        if (h.ready) move(h);
        return h;
      };
      h.stop = function () {
        if (h.mixer) h.mixer.stopAllAction();
        h._current = null;
        h._currentName = "";
        h._oneShot = null;
        h._hold = false;
        h._moveSpeed = null;
        return h;
      };
      h.attach = function (bone, thing, opts) {
        var target = thing && thing.object && thing.object.isObject3D ? thing.object : thing;
        if (!target || !target.isObject3D) return null;
        var record = {
          bone: String(bone || ""), object: target, opts: opts || {},
          size: thing && thing.object ? thing._scale : target.scale.x, entry: (thing && thing.entry) || null,
        };
        h._attached.push(record);
        attachNow(h, record);
        return thing;
      };
      h.detach = function (thing) {
        var target = thing && thing.object ? thing.object : thing;
        h._attached = h._attached.filter(function (r) {
          if (r.object !== target) return true;
          if (r.object.parent) r.object.parent.remove(r.object);
          unhide(r);
          return false;
        });
        return h;
      };
      h.colors = function (map) {
        h._colors = Object.assign({}, h._colors || {}, map || {});
        if (h.ready) applyColors(h);
        return h;
      };
      h.hitSpheres = function () { return spheres(h); };
      h.release = function () { release(h); };
      // fn(h) once the model is in (at once when it already is).
      h.whenReady = function (fn) {
        if (typeof fn !== "function") return h;
        if (h.ready) { try { fn(h); } catch (_e) {} } else h.on("ready", function () { fn(h); });
        return h;
      };
    }

    function steerNow(h) {
      if (!h._steerNodes || h._steerNodes.model !== h.model) {
        var list = [];
        ownTraverse(h, function (o) { if (o.name && o.name.indexOf("steer_") === 0) list.push(o); });
        h._steerNodes = { model: h.model, list: list };
      }
      h._steerNodes.list.forEach(function (o) { o.rotation.y = h._steerAngle || 0; });
    }

    function emit(h, name, detail) {
      (h._listeners[name] || []).slice().forEach(function (fn) {
        try { fn(detail, h); } catch (e) { warn("listener:" + name, "a '" + name + "' listener threw: " + (e && e.message)); }
      });
    }

    // ---- clips
    function findClip(h, name) {
      for (var i = 0; i < h._clips.length; i += 1) if (h._clips[i].name === name) return h._clips[i];
      return null;
    }

    function action(h, name) {
      if (h._actions[name]) return h._actions[name];
      var clip = findClip(h, name);
      if (!clip || !h.mixer) return null;
      h._actions[name] = h.mixer.clipAction(clip);
      return h._actions[name];
    }

    function play(h, nameOrRole, opts) {
      var roles = info(h).roles;
      var name = roles[nameOrRole] || String(nameOrRole || "");
      var a = action(h, name);
      if (!a) {
        var meta = info(h).byName[name];
        if (meta && meta.entry !== h.entry && meta.entry.path) {
          // A shared clip pack loads the first time one of its clips is asked for; the
          // latest clip asked for plays when it arrives.
          var path = meta.entry.path;
          h._wanted = [name, opts];
          h._packWait = h._packWait || {};
          if (h._packWait[path]) return;
          h._packWait[path] = true;
          lib.load(path, meta.entry).then(function (record) {
            delete h._packWait[path];
            if (!record.ready || h._released) return;
            record.clips.forEach(function (c) { if (!findClip(h, c.name)) h._clips.push(c); });
            var wanted = h._wanted;
            h._wanted = null;
            if (wanted && action(h, wanted[0])) play(h, wanted[0], wanted[1]);
          });
        } else {
          warn("clip:" + h.id + ":" + name, "'" + h.id + "' has no clip or role '" + nameOrRole + "'.");
        }
        return;
      }
      var anim = (info(h).byName[name] || {}).anim || {};
      var loop = opts.loop !== undefined ? Boolean(opts.loop) : Boolean(anim.loop);
      var fade = opts.fade !== undefined ? Math.max(0, Number(opts.fade) || 0) : 0.2;
      var speed = opts.speed !== undefined ? Number(opts.speed) || 1 : 1;
      if (!opts.fromMove) {
        h._moveSpeed = opts.keepMoving ? h._moveSpeed : null;
        h._hold = false;
      }
      if (h._current === a && !opts.restart) {
        a.setEffectiveTimeScale(speed);
        return;
      }
      a.reset();
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      a.clampWhenFinished = !loop;
      a.setEffectiveTimeScale(speed);
      a.setEffectiveWeight(1);
      a.play();
      if (h._current && h._current !== a) {
        if (fade > 0) a.crossFadeFrom(h._current, fade, false);
        else h._current.stop();
      }
      h._current = a;
      h._currentName = name;
      h._lastTime = 0;
      h._oneShot = loop ? null : a;
    }

    // Natural ground speed (world units per second) of a clip at this handle's current size.
    function naturalSpeed(h, name) {
      var meta = info(h).byName[name];
      var own = (h.entry && h.entry.height) || 1.8;
      var height = own * h.object.scale.y;
      if (!meta || !meta.anim || !(meta.anim.speed > 0)) return 1.4 * (height / 1.8);
      return meta.anim.speed * (height / (meta.entry.height || own));
    }

    // Walk, run or sprint picked by speed, played at the rate that keeps the feet in step.
    function move(h) {
      var speed = h._moveSpeed;
      if (speed === null || h._oneShot || h._hold) return;
      var roles = info(h).roles;
      if (h._wheels && h._wheels.length) h._wheelSpeed = speed;
      if (speed < 0.05) {
        if (roles.idle && h._currentName !== roles.idle) play(h, roles.idle, { fade: 0.25, loop: true, fromMove: true });
        return;
      }
      var best = null;
      var current = null;
      LOCOMOTION.forEach(function (role) {
        var name = roles[role];
        if (!name || (best && best.name === name)) return;
        var ratio = speed / naturalSpeed(h, name);
        var option = { name: name, ratio: ratio, cost: Math.abs(Math.log(ratio)) };
        if (name === h._currentName) current = option;
        if (!best || option.cost < best.cost) best = option;
      });
      if (!best) return;
      // Stay in the playing gait while it still fits, so the feet don't flicker between gaits.
      var pick = current && current.ratio > 0.7 && current.ratio < 1.45 ? current : best;
      if (pick.name !== h._currentName) play(h, pick.name, { fade: 0.25, loop: true, fromMove: true });
      var a = h._actions[pick.name];
      if (a) a.setEffectiveTimeScale(Math.max(0.5, Math.min(2, pick.ratio)));
    }

    // Moments (hit, step, land) fire as the playing clip passes them.
    function moments(h) {
      var a = h._current;
      if (!a || !h._currentName) return;
      var meta = (info(h).byName[h._currentName] || {}).anim;
      var t = a.time;
      var last = h._lastTime;
      h._lastTime = t;
      if (!meta || t === last) return;
      var wrapped = t < last;
      function passed(at) {
        if (typeof at !== "number") return false;
        return wrapped ? at > last || at <= t : at > last && at <= t;
      }
      if (passed(meta.hit)) emit(h, "hit", h._currentName);
      if (passed(meta.land)) emit(h, "land", h._currentName);
      (meta.steps || []).forEach(function (s) { if (passed(s)) emit(h, "step", h._currentName); });
    }

    function swapIn(h, record, built) {
      if (h._released) return;
      var model = built || lib.cloneScene(record);
      model.name = "model-" + h.id + "-mesh";
      h.model = model;
      h._clips = record.clips.slice();
      h._actions = {};
      h.mixer = new THREE.AnimationMixer(model);
      h.mixer.addEventListener("finished", function (event) {
        var clip = event && event.action && event.action.getClip ? event.action.getClip() : null;
        var name = clip ? clip.name : "";
        if (event.action === h._oneShot) {
          h._oneShot = null;
          // After a death the body stays down until the game plays something else.
          if ((info(h).byName[name] || {}).anim && info(h).byName[name].anim.role === "die") h._hold = true;
        }
        emit(h, "end", name);
      });
      if (h.placeholder && h.placeholder.parent) h.placeholder.parent.remove(h.placeholder);
      h.object.add(model);
      h._wheels = ((h.entry && h.entry.wheels) || []).map(function (n) { return model.getObjectByName(n); }).filter(Boolean);
      h.ready = true;
      if (h._steerAngle) steerNow(h);
      lib.warmUp(record);
      applyColors(h);
      h._attached.forEach(function (r) { attachNow(h, r); });
      var pending = h._pending;
      h._pending = [];
      pending.forEach(function (p) { play(h, p[0], p[1]); });
      if (!h._current) {
        if (h._moveSpeed !== null) move(h);
        else if (info(h).roles.idle) play(h, info(h).roles.idle, { fade: 0, loop: true, fromMove: true });
      }
      emit(h, "ready", h.id);
    }

    function track(h) {
      if (active.indexOf(h) === -1) active.push(h);
    }

    // The game's own 3D assets (Assets tab or save_model_look): a library model or an upload,
    // maybe with a look (colours, things on slots, hair and outfit). An asset the kid made from
    // a library model the game spawns by id (its libraryModel) stands in for that id.
    function gameAsset(key) {
      var assets = window.DIYAssetLibrary && window.DIYAssetLibrary.assets;
      if (!assets) return null;
      var entry = K.modelData[key] ? null : assets[key];
      if (!entry) {
        Object.keys(assets).some(function (name) {
          if (assets[name] && assets[name].libraryModel === key) entry = assets[name];
          return Boolean(entry);
        });
      }
      return entry && (entry.kind === "glb" || entry.kind === "look") ? entry : null;
    }

    function uploadData(key, base) {
      var meta = base.meta || {};
      var height = Number(meta.height) || 1;
      var roles = meta.clips || {};
      var roleOf = {};
      Object.keys(roles).forEach(function (role) { roleOf[roles[role]] = role; });
      var id = "asset:" + key;
      K.modelData[id] = {
        path: base.url, height: height, size: meta.size || [height * 0.5, height, height * 0.5],
        clips: roles, bones: meta.bones || {}, regions: meta.regions || {},
        anims: (meta.clipNames || []).map(function (name) {
          return { name: name, d: 0, role: roleOf[name], loop: LOOPING.indexOf(roleOf[name]) >= 0 };
        }),
      };
      return id;
    }

    // Built from plain library models only, so an asset never resolves through itself.
    // `character`: the game asked for a modular character (ctx.models.character).
    function spawnAsset(key, asset, options, character) {
      var look = asset.kind === "look" ? asset.look || {} : {};
      var base = asset.kind === "look" ? look : asset;
      var id = base.model || (base.url ? uploadData(asset.key || key, base) : null);
      if (!id) return null;
      var opts = Object.assign({}, options, { colors: Object.assign({}, look.colors || {}, options.colors || {}) });
      var modular = look.hair || look.outfit || (character && K.modelData[id] && K.modelData[id].gender);
      var h = modular
        ? buildCharacter(id, Object.assign(opts, { hair: look.hair || opts.hair, outfit: look.outfit || opts.outfit }))
        : spawnModel(id, opts);
      (look.attachments || []).forEach(function (thing) {
        if (thing && thing.model) h.attach(thing.slot, spawnModel(thing.model, { add: false }), thing.at || {});
      });
      h.assetKey = asset.key || key;
      return h;
    }

    api.spawn = function (id, options) {
      options = options || {};
      var asset = gameAsset(id);
      return (asset && spawnAsset(id, asset, options, false)) || spawnModel(id, options);
    };

    function spawnModel(id, options) {
      var entry = data(id);
      var lod = lodOf(entry, options);
      var poolKey = lod ? id + "#lod1" : id;
      var pool = pools[poolKey];
      var h;
      if (pool && pool.length) {
        h = pool.pop();
        h._released = false;
        h._listeners = {};
        h._pending = [];
        h._colors = null;
        h._moveSpeed = null;
        h._hold = false;
        h._oneShot = null;
        h._wheelSpeed = 0;
        if (h._steerAngle) h.steer(0);
        place(h, options);
        applyColors(h);
        h._current = null;
        h._currentName = "";
        if (info(h).roles.idle) play(h, info(h).roles.idle, { fade: 0, loop: true, fromMove: true });
      } else {
        h = makeHandle(id, entry || { size: [1, 1, 1], height: 1 }, options);
        h._pool = poolKey;
        if (entry) {
          addCredit(entry);
          lib.load(pathOf(entry, lod), entry).then(function (record) { if (record.ready) swapIn(h, record); });
        }
      }
      track(h);
      return h;
    }

    function release(h) {
      if (h._released) return;
      h._released = true;
      if (h.mixer) h.mixer.stopAllAction();
      h._current = null;
      h._currentName = "";
      h._attached.forEach(function (r) { if (r.object.parent) r.object.parent.remove(r.object); unhide(r); });
      h._attached = [];
      if (h.object.parent) h.object.parent.remove(h.object);
      if (active.indexOf(h) >= 0) active.splice(active.indexOf(h), 1);
      var poolKey = h._pool || h.id;
      if (h.ready && !h._parts) (pools[poolKey] = pools[poolKey] || []).push(h);
    }

    // ---- attachments (look level 2): things on bones, upright and at their own size. Things made
    // to be worn (wear: hats, glasses, quivers) are sized to the head and sit on it, on the face
    // or behind the back; arms without a hand bone hold things at their measured tip.
    function attachNow(h, record) {
      var o = record.object;
      var opts = record.opts;
      if (!h.ready) {
        var size = (h.entry && h.entry.size) || [1, 1, 1];
        o.position.set(0, record.bone === "head" ? size[1] : size[1] * 0.6, 0);
        h.object.add(o);
        return;
      }
      // Placed again once a clip has posed the body (see the tick), so it stands upright in it.
      if (!record.aligned) h._realign = true;
      var bone = h.bone(record.bone);
      if (!bone) {
        warn("bone:" + h.id + ":" + record.bone, "'" + h.id + "' has no bone '" + record.bone + "'.");
        h.object.add(o);
        return;
      }
      h.object.updateMatrixWorld(true);
      var entry = h.entry || {};
      var head = entry.head || null;
      if (head && h._hair && h._hair.head) head = withHair(head, h._hair.head);
      var thing = record.entry || {};
      var wear = thing.wear || null;
      var at = opts.at || (record.bone === "head" ? (wear && wear.fit === "face" ? "face" : "top")
        : record.bone === "back" && entry.back ? "back" : "bone");
      var local = [0, 0, 0];
      if (head && at === "top") local = head.top;
      else if (head && at === "center") local = head.center;
      else if (head && at === "face") local = head.face || head.center;
      else if (at === "back" && entry.back) local = entry.back;
      else if (at === "bone" && entry.tips && entry.tips[record.bone]) local = entry.tips[record.bone];
      bone.add(o);
      o.position.set(local[0] || 0, local[1] || 0, local[2] || 0);
      bone.getWorldQuaternion(q1);
      h.object.getWorldQuaternion(q2);
      bone.getWorldScale(v1);
      h.object.getWorldScale(v2);
      var boneScale = v1.x || 1;
      // Things stand upright in the body's pose (library models are re-pivoted, so a weapon slot's
      // own frame would hold them sideways); { align: "bone" } keeps the bone's frame instead.
      var keepBone = opts.align === "bone";
      if (keepBone) o.quaternion.identity();
      else o.quaternion.copy(q1).invert().multiply(q2);
      var size = thing.size || null;
      var own = record.size || 1;
      // A worn thing fits its head: the head's width over the share of the thing's width it fills.
      if (wear && head && head.width && size && size[0] && (at === "top" || at === "face")) {
        own = Math.min(5, Math.max(0.2, head.width / ((Number(wear.head) || 1) * size[0])));
      }
      // A worn hat replaces the hat the model was made with (KayKit helmets, hoods...).
      if (wear && wear.fit === "hat" && at === "top" && head && head.hats && !record.hidden) {
        record.hidden = [];
        ownTraverse(h, function (x) {
          if (head.hats.indexOf(x.name) >= 0 && x.visible) { x.visible = false; record.hidden.push(x); }
        });
      }
      var s = (Number(opts.scale) || 1) * own;
      o.scale.setScalar((s * v2.x) / boneScale);
      // A hat sinks its share (wear.sink) of its own height below the head's top; glasses and back
      // things are centred on the face or the back.
      var shift = [0, 0, 0];
      if (wear && size && at === "top") shift[1] = -(Number(wear.sink) || 0) * size[1] * s;
      if (size && (at === "face" || at === "back")) shift = [0, (-size[1] * s) / 2, (size[2] * s) / 2];
      var offset = Array.isArray(opts.offset) ? opts.offset : [0, 0, 0];
      v1.set(shift[0] + (Number(offset[0]) || 0), shift[1] + (Number(offset[1]) || 0), shift[2] + (Number(offset[2]) || 0));
      if (v1.lengthSq() > 0) {
        v1.multiplyScalar(v2.x).applyQuaternion(q2).applyQuaternion(q1.clone().invert()).divideScalar(boneScale);
        o.position.add(v1);
      }
      if (Array.isArray(opts.rotation)) {
        o.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rotation[0] || 0, opts.rotation[1] || 0, opts.rotation[2] || 0)));
      }
    }

    // Hair makes a character's head taller and wider (both share the head bone): hats sit on it.
    function withHair(head, hair) {
      if (!head.top || !head.center || !hair.top) return head;
      var up = [0, 1, 2].map(function (k) { return head.top[k] - head.center[k]; });
      var len = Math.hypot(up[0], up[1], up[2]) || 1;
      var lift = [0, 1, 2].reduce(function (sum, k) { return sum + ((hair.top[k] - head.top[k]) * up[k]) / len; }, 0);
      var out = Object.assign({}, head, { width: Math.max(head.width || 0, hair.width || 0) });
      if (lift > 0) out.top = head.top.map(function (x, k) { return x + (up[k] / len) * lift; });
      return out;
    }

    // ---- recolours (look level 1): a region is materials, meshes or baked vertex colours
    var tintCache = {};
    var geometryCache = {};
    var greyCache = typeof WeakMap === "function" ? new WeakMap() : null;

    // A picture turned grey (lifted so dark pictures still take a colour), for tinting.
    function greyMap(texture) {
      if (!texture || !texture.image || !greyCache || typeof document === "undefined") return null;
      if (greyCache.has(texture)) return greyCache.get(texture);
      var out = null;
      try {
        var img = texture.image;
        var canvas = document.createElement("canvas");
        canvas.width = Math.min(512, img.width || 0);
        canvas.height = Math.min(512, img.height || 0);
        var c2 = canvas.width && canvas.height ? canvas.getContext("2d") : null;
        if (c2) {
          c2.drawImage(img, 0, 0, canvas.width, canvas.height);
          var px = c2.getImageData(0, 0, canvas.width, canvas.height);
          for (var i = 0; i < px.data.length; i += 4) {
            var l = 0.3 * px.data[i] + 0.59 * px.data[i + 1] + 0.11 * px.data[i + 2];
            px.data[i] = px.data[i + 1] = px.data[i + 2] = Math.min(255, 70 + l * 0.85);
          }
          c2.putImageData(px, 0, 0);
          out = new THREE.CanvasTexture(canvas);
          out.flipY = texture.flipY;
          out.colorSpace = texture.colorSpace;
          out.wrapS = texture.wrapS;
          out.wrapT = texture.wrapT;
        }
      } catch (_e) {
        out = null;
      }
      greyCache.set(texture, out);
      return out;
    }

    function tinted(original, value) {
      var key = original.uuid + "|" + value;
      if (tintCache[key]) return tintCache[key];
      var color = colorOf(value);
      var m = original.clone();
      if (color) {
        var grey = m.map ? greyMap(m.map) : null;
        if (grey) m.map = grey;
        m.color = color;
      }
      m.userData = Object.assign({}, m.userData, { diyOriginal: original });
      tintCache[key] = m;
      return m;
    }

    function originalMaterial(m) {
      return (m && m.userData && m.userData.diyOriginal) || m;
    }

    function linear(value) {
      var c = colorOf(value);
      return c ? [c.r, c.g, c.b] : null;
    }

    // Baked colours: one recoloured copy of the geometry per look, shared by every handle with it.
    function recolourGeometry(mesh, changes) {
      var original = (mesh.geometry.userData && mesh.geometry.userData.diyOriginal) || mesh.geometry;
      if (!original.attributes.color || !changes.length) { mesh.geometry = original; return; }
      var key = original.uuid + "|" + JSON.stringify(changes);
      if (!geometryCache[key]) {
        var copy = original.clone();
        copy.userData = Object.assign({}, copy.userData, { diyOriginal: original });
        var a = copy.attributes.color;
        var rules = changes.map(function (c) { return { from: c.from.map(linear).filter(Boolean), to: linear(c.to) }; });
        for (var i = 0; i < a.count; i += 1) {
          for (var r = 0; r < rules.length; r += 1) {
            if (!rules[r].to) continue;
            var hit = rules[r].from.some(function (f) {
              return Math.abs(a.getX(i) - f[0]) < 0.012 && Math.abs(a.getY(i) - f[1]) < 0.012 && Math.abs(a.getZ(i) - f[2]) < 0.012;
            });
            if (hit) { a.setXYZ(i, rules[r].to[0], rules[r].to[1], rules[r].to[2]); break; }
          }
        }
        a.needsUpdate = true;
        geometryCache[key] = copy;
      }
      mesh.geometry = geometryCache[key];
    }

    function applyColors(h) {
      if (!h.model) return;
      var regions = (h.entry && h.entry.regions) || {};
      var wanted = h._colors || {};
      var labels = Object.keys(wanted).filter(function (label) {
        if (wanted[label] === null || wanted[label] === undefined || wanted[label] === "") return false;
        if (!regions[label]) { warn("region:" + h.id + ":" + label, "'" + h.id + "' has no colour region '" + label + "'."); return false; }
        return true;
      });
      var vertexChanges = labels
        .filter(function (label) { return regions[label].colors; })
        .map(function (label) { return { from: regions[label].colors, to: String(wanted[label]) }; });
      ownTraverse(h, function (o) {
        if (!o.isMesh) return;
        // A mesh with several materials loads as a group named after the model's node.
        var names = [o.name, o.parent ? o.parent.name : ""];
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        var next = mats.map(function (m) {
          if (!m) return m;
          var base = originalMaterial(m);
          var value = null;
          labels.forEach(function (label) {
            var r = regions[label];
            var onMesh = (r.meshes || []).some(function (n) { return names.indexOf(n) >= 0; });
            if ((r.materials || []).indexOf(base.name) >= 0 || onMesh) value = String(wanted[label]);
          });
          return value ? tinted(base, value) : base;
        });
        o.material = Array.isArray(o.material) ? next : next[0];
        if (o.geometry && (o.geometry.attributes.color || (o.geometry.userData && o.geometry.userData.diyOriginal))) recolourGeometry(o, vertexChanges);
      });
    }

    // ---- hit spheres that follow the bones (world space, scaled with the handle)
    function spheres(h) {
      var out = h._sphereList || (h._sphereList = []);
      out.length = 0;
      var list = (h.entry && h.entry.hit) || [];
      h.object.updateMatrixWorld(true);
      h.object.getWorldScale(v2);
      var scale = v2.x || 1;
      if (!h.ready || !list.length) {
        var size = (h.entry && h.entry.size) || [1, 1, 1];
        v1.set(0, (size[1] || 1) / 2, 0).applyMatrix4(h.object.matrixWorld);
        out.push({ x: v1.x, y: v1.y, z: v1.z, r: (Math.max(size[0] || 1, size[1] || 1, size[2] || 1) / 2) * scale });
        return out;
      }
      list.forEach(function (s) {
        var bone = s.bone ? ownObject(h, s.bone) : null;
        var off = s.offset || [0, 0, 0];
        v1.set(off[0] || 0, off[1] || 0, off[2] || 0).applyMatrix4(bone ? bone.matrixWorld : h.object.matrixWorld);
        out.push({ x: v1.x, y: v1.y, z: v1.z, r: (s.r || 0.2) * scale });
      });
      return out;
    }

    // ---- many copies of a still prop as instances (trees, rocks): one draw call per part
    var instanced = [];
    api.many = function (id, count, options) {
      options = options || {};
      // A game asset (a kept library model or an upload) stands for its model here too.
      var asset = gameAsset(id);
      if (asset) {
        var base = asset.kind === "look" ? asset.look || {} : asset;
        id = base.model || (base.url ? uploadData(asset.key || id, base) : id);
      }
      var n = Math.max(1, Math.min(5000, Math.floor(Number(count) || 1)));
      var entry = data(id) || { size: [1, 1, 1], height: 1 };
      addCredit(entry);
      var size = entry.size || [1, 1, 1];
      var group = new THREE.Group();
      group.name = "models-" + id;
      var hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      var matrices = [];
      for (var i = 0; i < n; i += 1) matrices.push(hidden.clone());
      var batch = { meshes: [], dirty: true };
      var tmp = new THREE.Matrix4();
      function write(index) {
        batch.meshes.forEach(function (im) {
          im.setMatrixAt(index, tmp.multiplyMatrices(matrices[index], im.userData.local));
          im.instanceMatrix.needsUpdate = true;
        });
        batch.dirty = true;
      }
      function build(parts) {
        batch.meshes.forEach(function (m) { group.remove(m); });
        batch.meshes = parts.map(function (p) {
          var im = new THREE.InstancedMesh(p.geometry, p.material, n);
          im.castShadow = true;
          im.receiveShadow = true;
          im.userData.local = p.local;
          group.add(im);
          return im;
        });
        for (var k = 0; k < n; k += 1) write(k);
      }
      var box = new THREE.BoxGeometry(size[0] || 1, size[1] || 1, size[2] || 1);
      box.translate(0, (size[1] || 1) / 2, 0);
      build([{ geometry: box, material: new THREE.MeshLambertMaterial({ color: 0xb8b0c8 }), local: new THREE.Matrix4() }]);
      var baseScale = Number(options.height) > 0 ? Number(options.height) / (entry.height || size[1] || 1) : 1;
      var at = new THREE.Vector3();
      var turn = new THREE.Quaternion();
      var up = new THREE.Vector3(0, 1, 0);
      var scaleV = new THREE.Vector3();
      var result = {
        object: group,
        count: n,
        set: function (index, x, y, z, rotationY, scale) {
          if (!(index >= 0 && index < n)) return result;
          var s = (Number(scale) || 1) * baseScale;
          matrices[index].compose(at.set(Number(x) || 0, Number(y) || 0, Number(z) || 0), turn.setFromAxisAngle(up, Number(rotationY) || 0), scaleV.set(s, s, s));
          write(index);
          return result;
        },
        hide: function (index) {
          if (index >= 0 && index < n) { matrices[index].copy(hidden); write(index); }
          return result;
        },
      };
      instanced.push(batch);
      var path = pathOf(entry, lodOf(entry, options));
      if (path) {
        lib.load(path, entry).then(function (record) {
          if (!record.ready) return;
          var parts = [];
          record.scene.updateMatrixWorld(true);
          record.scene.traverse(function (o) {
            if (o.isMesh && !o.isSkinnedMesh) parts.push({ geometry: o.geometry, material: o.material, local: o.matrixWorld.clone() });
          });
          if (parts.length) build(parts);
        });
      }
      if (options.add !== false && ctx.scene) ctx.scene.add(group);
      return result;
    };

    // ---- modular characters (look level 3): body, outfit and hair on one skeleton
    api.character = function (baseId, options) {
      options = options || {};
      var asset = gameAsset(baseId);
      return (asset && spawnAsset(baseId, asset, options, true)) || buildCharacter(baseId, options);
    };

    function buildCharacter(baseId, options) {
      var base = data(baseId);
      var h = makeHandle(baseId, base || { size: [0.6, 1.8, 0.4], height: 1.8 }, options);
      h._parts = true;
      h._hair = options.hair ? data(options.hair) : null;
      track(h);
      if (!base) return h;
      addCredit(base);
      var gender = base.gender || "male";
      var outfitId = options.outfit ? (K.modelData[options.outfit] ? options.outfit : "outfit." + options.outfit) : null;
      var outfit = outfitId ? data(outfitId) : null;
      var body = outfit && base.parts && base.parts.head ? data(base.parts.head) : base;
      var parts = [];
      function add(pid) {
        var e = pid ? data(pid) : null;
        if (e && parts.indexOf(e) === -1) { parts.push(e); addCredit(e); }
      }
      if (outfit) ((outfit.outfit && outfit.outfit[gender]) || []).forEach(add);
      add(options.hair);
      add(options.eyebrows !== undefined ? options.eyebrows : base.parts && base.parts.eyebrows);
      add(options.beard);
      if (!body) return h;
      // The body's colour regions (the head's, with an outfit) join the parts' (hair, outfit...).
      var regions = Object.assign({}, (body === base ? base.regions : body.regions) || {});
      parts.forEach(function (p) {
        Object.keys(p.regions || {}).forEach(function (label) {
          var merged = Object.assign({ materials: [] }, regions[label] || {});
          merged.materials = (merged.materials || []).concat(p.regions[label].materials || []);
          regions[label] = merged;
        });
      });
      // An outfit's own hood is a hat too: a worn hat hides it.
      var hats = ((base.head && base.head.hats) || []).slice();
      parts.forEach(function (p) { ((p.head && p.head.hats) || []).forEach(function (n) { hats.push(n); }); });
      var head = base.head && hats.length ? Object.assign({}, base.head, { hats: hats }) : base.head;
      h.entry = Object.assign({}, base, { regions: regions, head: head });
      var loads = [lib.load(body.path, body)].concat(parts.map(function (p) { return lib.load(p.path, p); }));
      Promise.all(loads).then(function (records) {
        var root = records[0];
        if (!root.ready || h._released) return;
        var model = lib.cloneScene(root);
        var bones = {};
        model.traverse(function (o) { if (o.isBone) bones[o.name] = o; });
        records.slice(1).forEach(function (record) {
          if (!record.ready) return;
          var part = lib.cloneScene(record);
          var meshes = [];
          part.traverse(function (o) { if (o.isSkinnedMesh) meshes.push(o); });
          meshes.forEach(function (mesh) {
            var mapped = mesh.skeleton.bones.map(function (b) { return bones[b.name] || b; });
            mesh.bind(new THREE.Skeleton(mapped, mesh.skeleton.boneInverses), mesh.bindMatrix);
            model.add(mesh);
          });
        });
        swapIn(h, { ready: true, scene: model, clips: root.clips, skinned: true, warmed: root.warmed }, model);
      });
      return h;
    }

    api.preload = function (ids, options) {
      (Array.isArray(ids) ? ids : [ids]).forEach(function (id) {
        // An id the kid's asset stands in for loads that asset's model instead.
        var asset = gameAsset(id);
        var base = asset ? (asset.kind === "look" ? asset.look || {} : asset) : null;
        var entry = K.modelData[(base && base.model) || id];
        if (entry && entry.path) lib.load(pathOf(entry, lodOf(entry, options)), entry);
      });
    };
    api.info = function (id) { return K.modelData[id] || null; };
    api.has = function (id) { return Boolean(K.modelData[id]); };

    // Collision boxes (THREE.Box3, world space) for a handle where it stands now, or for an id
    // placed at { position, rotationY, scale } (instances of many()). The pack's collision
    // pieces when it made some; else the box of what shows (or of the model's size).
    api.colliders = function (target, at) {
      var h = target && target.object && target.object.isObject3D ? target : null;
      var entry = h ? h.entry : K.modelData[String(target || "")] || null;
      var matrix = new THREE.Matrix4();
      if (h) {
        h.object.updateMatrixWorld(true);
        matrix.copy(h.object.matrixWorld);
      } else {
        at = at || {};
        var where = new THREE.Vector3();
        readPosition(where, at.position);
        var s = Number(at.scale) || 1;
        matrix.compose(where, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Number(at.rotationY) || 0), new THREE.Vector3(s, s, s));
      }
      var boxes = (entry && entry.colliderBoxes) || [];
      if (!boxes.length && h) {
        var shown = new THREE.Box3().setFromObject(h.object);
        return shown.isEmpty() ? [] : [shown];
      }
      if (!boxes.length) {
        var size = (entry && entry.size) || [1, 1, 1];
        boxes = [[-size[0] / 2, 0, -size[2] / 2, size[0] / 2, size[1], size[2] / 2]];
      }
      return boxes.map(function (b) {
        return new THREE.Box3(new THREE.Vector3(b[0], b[1], b[2]), new THREE.Vector3(b[3], b[4], b[5])).applyMatrix4(matrix);
      });
    };

    // One tick for every model: gaits, mixers, moments, wheels and instance bounds.
    ctx.onUpdate(function (dt) {
      for (var i = active.length - 1; i >= 0; i -= 1) {
        var h = active[i];
        if (!h.object.parent) {
          active.splice(i, 1);
          continue;
        }
        if (!h.ready || !h.object.visible) continue;
        if (h._moveSpeed !== null) move(h);
        if (h.mixer) h.mixer.update(dt);
        // Things put on stood upright in whatever pose the bones had (the rest pose before a
        // clip has played): after a posed frame they are placed again, once, upright in it.
        if (h._realign && h._current) {
          h._realign = false;
          h._attached.forEach(function (r) {
            if (r.aligned) return;
            r.aligned = true;
            attachNow(h, r);
          });
        }
        moments(h);
        if (h._wheels && h._wheels.length && h._wheelSpeed) {
          for (var w = 0; w < h._wheels.length; w += 1) {
            // A pack's wheel says its radius (node extras); 0.35 m otherwise.
            var radius = Number(h._wheels[w].userData && h._wheels[w].userData.radius) || 0.35;
            h._wheels[w].rotation.x -= (h._wheelSpeed * dt) / Math.max(0.05, radius * h.object.scale.y);
          }
        }
      }
      for (var b = 0; b < instanced.length; b += 1) {
        if (!instanced[b].dirty) continue;
        instanced[b].dirty = false;
        instanced[b].meshes.forEach(function (im) { if (typeof im.computeBoundingSphere === "function") im.computeBoundingSphere(); });
      }
    });

    return api;
  }

  K.extend(function (ctx, info) {
    if (!info || info.renderer !== "three" || !ctx) return;
    var THREE = ctx.THREE || window.THREE;
    if (!THREE || typeof ctx.onUpdate !== "function") return;
    Object.keys(K.modelData).forEach(function (id) { addCredit(K.modelData[id]); });
    ctx.models = createModels(ctx, THREE);
    // The asset library (runtime/asset-library.js) builds the game's own 3D assets through it.
    K.models = ctx.models;
  });
})();

/* Follow cameras and camera spin (DIYKit feature part, appended to three-core.js).
   ctx.followCamera(target, { view, distance, height, smooth, spin }) moves ctx.camera after the
   target every frame: "chase" behind it (turning with it), "high" above and behind (not turning),
   "side" from the side like a side-scroller, "top" straight down over it, "first-person" at its
   eyes (the target is hidden). Distances scale with the target's size.
   spin (also an option of ctx.fitCameraTo): true lets the player turn, tilt and zoom the camera
   with a drag, two fingers, the scroll wheel or a trackpad swipe; when the game uses mouse or
   touch presses itself, a plain drag stays the game's and the right or middle button turns it.
   "drag" always lets a plain drag turn it. Never throws into a game. */
(function () {
  "use strict";
  if (typeof window === "undefined") return;
  // The prompt only offers ctx.followCamera (and spin) when the kit carries this marker.
  var CAMERA_KIT_VERSION = 2;
  var kit = window.DIYKit = window.DIYKit || {
    libraryBase: "https://cdn.diy.org/vibe-library/v1",
    extensions: [],
    extend: function (fn) { this.extensions.push(fn); }
  };

  // Offsets in units of the target's height (a 1.8 m person reads as 1).
  var VIEWS = {
    chase: { back: 4, up: 1.8, look: 0.7, ahead: 2, turn: true },
    high: { back: 5, up: 5, look: 0.3, ahead: 0, turn: false },
    side: { back: 7, up: 1.2, look: 0.6, ahead: 0, turn: false },
    top: { back: 0.01, up: 9, look: 0, ahead: 0, turn: false },
    "first-person": { back: 0, up: 0.9, look: 0.9, ahead: 6, turn: true, eyes: true }
  };
  var DEFAULT_VIEW = "chase";
  // Spin: radians per dragged pixel, and how far a plain press moves before it turns anything.
  var TURN_PER_PIXEL = 0.008;
  var LIFT_PER_PIXEL = 0.005;
  var DRAG_START_PX = 6;
  // A follow camera stays between these angles above the horizon (radians).
  var MIN_LIFT = 0.08;
  var MAX_LIFT = 1.45;

  function warn(message) {
    try { console.warn("[DIY camera] " + message); } catch (_e) {}
  }

  // Press events a game listens for when it uses the mouse or touch itself.
  var PRESS_EVENT = /^(?:pointer|mouse)(?:down|up|move)$|^touch(?:start|end|move)$|^(?:dbl)?click$/;

  // Whether the game uses mouse or touch presses: its own press listeners on the canvas, bubbling
  // ones on the page (the kit's own there capture), or mouse buttons and drag-look read through
  // ctx.input. Watching starts before createGame, after the kit's input is set up.
  function watchPresses(ctx) {
    var used = false;
    function wrap(target, anyPhase) {
      if (!target || typeof target.addEventListener !== "function") return;
      var add = target.addEventListener;
      target.addEventListener = function (type, _fn, options) {
        var capture = options === true || Boolean(options && options.capture);
        if (PRESS_EVENT.test(String(type)) && (anyPhase || !capture)) used = true;
        return add.apply(this, arguments);
      };
    }
    wrap(ctx.canvas, true);
    if (ctx.root !== ctx.canvas) wrap(ctx.root, false);
    wrap(window, false);
    if (typeof document !== "undefined" && document) {
      wrap(document, false);
      wrap(document.body, false);
    }
    var input = ctx.input;
    if (input) {
      ["isDown", "down", "actionDown", "pressed", "released"].forEach(function (name) {
        var read = input[name];
        if (typeof read !== "function") return;
        input[name] = function (key) {
          if (/^Mouse/.test(String(key))) used = true;
          return read.apply(this, arguments);
        };
      });
      if (typeof input.lookDelta === "function") {
        var look = input.lookDelta;
        input.lookDelta = function () {
          used = true;
          return look.apply(this, arguments);
        };
      }
    }
    return function () {
      var canvas = ctx.canvas;
      return used || Boolean(canvas && (canvas.onpointerdown || canvas.onmousedown || canvas.ontouchstart || canvas.onclick));
    };
  }

  // Pointer gestures that turn and zoom the camera, for one view at a time:
  // handlers { mode (the spin option), turn(yaw, lift), zoom(factor, clientX, clientY) }.
  function createSpin(ctx, usesPresses) {
    var canvas = ctx.canvas || (ctx.renderer && ctx.renderer.domElement) || null;
    var owner = null;
    var touches = {};
    var drag = null;
    var pair = null;
    var listening = false;

    function reset() {
      touches = {};
      drag = null;
      pair = null;
    }

    function pairOf() {
      var ids = Object.keys(touches);
      if (ids.length < 2) return null;
      var a = touches[ids[0]];
      var b = touches[ids[1]];
      return {
        distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2
      };
    }

    function plainTurns() {
      return owner.mode === "drag" || (owner.mode === true && !usesPresses());
    }

    function call(name, a, b, c) {
      try {
        owner[name](a, b, c);
      } catch (error) {
        warn("spin failed: " + (error && error.message ? error.message : error));
      }
    }

    function down(event) {
      if (!owner || event.target !== canvas) return;
      if (event.pointerType === "touch") {
        touches[event.pointerId] = { x: event.clientX, y: event.clientY };
        if (Object.keys(touches).length >= 2) {
          // Two fingers turn and zoom the camera; the game does not see them.
          drag = null;
          pair = pairOf();
          event.stopPropagation();
          return;
        }
      }
      var plain = event.pointerType === "touch" || event.button === 0;
      if (plain ? !plainTurns() : event.button !== 1 && event.button !== 2) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, start: plain ? DRAG_START_PX : 2 };
    }

    function move(event) {
      if (!owner) return;
      if (touches[event.pointerId]) {
        touches[event.pointerId] = { x: event.clientX, y: event.clientY };
        if (pair) {
          var next = pairOf();
          if (!next) return;
          var twist = next.angle - pair.angle;
          if (twist > Math.PI) twist -= Math.PI * 2;
          if (twist < -Math.PI) twist += Math.PI * 2;
          call("turn", twist, (next.y - pair.y) * LIFT_PER_PIXEL);
          if (next.distance !== pair.distance) call("zoom", next.distance / pair.distance, next.x, next.y);
          pair = next;
          event.stopPropagation();
          return;
        }
      }
      if (!drag || event.pointerId !== drag.id) return;
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < drag.start) return;
      drag.moved = true;
      drag.x = event.clientX;
      drag.y = event.clientY;
      // Dragging right swings the near side of the scene right; dragging down looks from higher up.
      call("turn", -dx * TURN_PER_PIXEL, dy * LIFT_PER_PIXEL);
    }

    function up(event) {
      if (touches[event.pointerId]) {
        delete touches[event.pointerId];
        if (pair) {
          event.stopPropagation();
          if (Object.keys(touches).length < 2) pair = null;
        }
      }
      if (drag && event.pointerId === drag.id) drag = null;
    }

    function wheel(event) {
      if (!owner) return;
      if (typeof event.preventDefault === "function") event.preventDefault();
      var unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      var dx = (event.deltaX || 0) * unit;
      var dy = (event.deltaY || 0) * unit;
      // A trackpad pinch arrives as a wheel with ctrlKey; a sideways swipe turns.
      if (event.ctrlKey) call("zoom", Math.exp(-dy * 0.01), event.clientX, event.clientY);
      else if (Math.abs(dx) > Math.abs(dy)) call("turn", dx * TURN_PER_PIXEL * 0.5, 0);
      else if (dy) call("zoom", Math.exp(-dy * 0.0015), event.clientX, event.clientY);
    }

    function menu(event) {
      if (owner && typeof event.preventDefault === "function") event.preventDefault();
    }

    function listen() {
      if (listening || !canvas || typeof window.addEventListener !== "function") return;
      listening = true;
      window.addEventListener("pointerdown", down, true);
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", up, true);
      if (typeof canvas.addEventListener === "function") {
        canvas.addEventListener("wheel", wheel, { passive: false });
        canvas.addEventListener("contextmenu", menu);
      }
    }

    return {
      attach: function (handlers) {
        owner = handlers;
        reset();
        listen();
        return handlers;
      },
      detach: function (handlers) {
        if (owner !== handlers) return;
        owner = null;
        reset();
      },
      // The player is turning the camera right now (follow cameras wait to swing back).
      busy: function () { return Boolean((drag && drag.moved) || pair); }
    };
  }

  // Where a screen point lands on the play area's floor, for zooming toward the pointer.
  function groundPoint(ctx, view, clientX, clientY) {
    var canvas = ctx.canvas;
    if (clientX == null || !canvas || typeof canvas.getBoundingClientRect !== "function") return null;
    var rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    var THREE = ctx.THREE;
    var ndc = new THREE.Vector2(
      ((clientX - (rect.left || 0)) / rect.width) * 2 - 1,
      1 - ((clientY - (rect.top || 0)) / rect.height) * 2
    );
    var caster = new THREE.Raycaster();
    caster.setFromCamera(ndc, ctx.camera);
    var floor = view.bounds && view.bounds.min ? view.bounds.min.y : 0;
    var hit = caster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floor), new THREE.Vector3());
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  function spinFixed(ctx, spin, view, mode) {
    return spin.attach({
      mode: mode === "drag" ? "drag" : true,
      turn: function (yaw, lift) { view.adjust({ turn: yaw, tilt: (-lift * 180) / Math.PI }); },
      zoom: function (factor, x, y) { view.adjust({ zoom: factor, at: groundPoint(ctx, view, x, y) }); }
    });
  }

  function createFollow(ctx, spin) {
    var THREE = ctx.THREE;
    var up = new THREE.Vector3(0, 1, 0);
    var at = new THREE.Vector3();
    var ahead = new THREE.Vector3();
    var offset = new THREE.Vector3();
    var want = new THREE.Vector3();
    var look = new THREE.Vector3();
    var box = new THREE.Box3();
    var size = new THREE.Vector3();
    var state = null;

    function scaleOf(target) {
      try {
        box.setFromObject(target);
        if (box.isEmpty()) return 1;
        box.getSize(size);
        return Math.min(6, Math.max(0.4, Math.max(size.y, size.x * 0.6, size.z * 0.6) / 1.8));
      } catch (_e) {
        return 1;
      }
    }

    function hide(target, hidden) {
      if (target && typeof target.visible === "boolean") target.visible = !hidden;
    }

    // The player's turn, tilt and zoom on top of the view's own offset.
    function orbit(view, dt) {
      var moved = state.last ? at.distanceTo(state.last) / Math.max(dt || 0, 0.001) : 0;
      state.last = (state.last || new THREE.Vector3()).copy(at);
      // A chase camera swings back behind the player once it moves and nobody is turning it.
      if (view.turn && !spin.busy() && moved > 0.5 * state.scale) state.yaw *= Math.exp(-2.5 * dt);
      if (Math.abs(state.yaw) < 0.001) state.yaw = 0;
      if (!state.yaw && !state.lift && state.zoom === 1) return;
      var radius = offset.length() * state.zoom;
      var heading = Math.atan2(offset.x, offset.z) + state.yaw;
      var lift = Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) + state.lift;
      lift = Math.max(MIN_LIFT, Math.min(MAX_LIFT, lift));
      offset.set(
        Math.sin(heading) * Math.cos(lift) * radius,
        Math.sin(lift) * radius,
        Math.cos(heading) * Math.cos(lift) * radius
      );
    }

    function step(dt) {
      if (!state || !state.target || typeof state.target.getWorldPosition !== "function") return;
      var view = VIEWS[state.view];
      var k = state.scale;
      state.target.getWorldPosition(at);
      if (view.turn && typeof state.target.getWorldDirection === "function") {
        // Library models face -Z; getWorldDirection gives the object's +Z.
        state.target.getWorldDirection(ahead).negate();
        ahead.y = 0;
        if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1);
        ahead.normalize();
      } else {
        ahead.set(0, 0, -1);
      }
      var back = (state.distance != null ? state.distance : view.back) * k;
      var rise = (state.height != null ? state.height : view.up) * k;
      offset.copy(ahead).multiplyScalar(-back).addScaledVector(up, rise);
      if (!view.eyes) orbit(view, dt);
      want.copy(at).add(offset);
      var lead = view.ahead * k * (view.eyes ? 1 : Math.max(0, Math.cos(state.yaw)));
      look.copy(at).addScaledVector(up, view.look * k).addScaledVector(ahead, lead);
      var camera = ctx.camera;
      if (state.snap || view.eyes) {
        camera.position.copy(want);
        state.snap = false;
      } else {
        camera.position.lerp(want, 1 - Math.exp(-state.smooth * Math.max(0, dt || 0.016)));
      }
      camera.lookAt(look);
    }

    function follow(target, options) {
      options = options || {};
      if (!target || typeof target.getWorldPosition !== "function") {
        warn("followCamera needs a THREE object to follow.");
        return null;
      }
      if (state) stop();
      var view = Object.prototype.hasOwnProperty.call(VIEWS, options.view) ? options.view : DEFAULT_VIEW;
      if (options.view && view !== options.view) warn("unknown view '" + options.view + "'; using " + view + ".");
      state = {
        target: target,
        view: view,
        scale: scaleOf(target),
        distance: typeof options.distance === "number" ? options.distance : null,
        height: typeof options.height === "number" ? options.height : null,
        smooth: typeof options.smooth === "number" ? Math.max(0.5, options.smooth) : 6,
        yaw: 0,
        lift: 0,
        zoom: 1,
        last: null,
        handlers: null,
        snap: true
      };
      if (options.spin) {
        state.handlers = spin.attach({
          mode: options.spin === "drag" ? "drag" : true,
          turn: function (yaw, lift) {
            if (!state) return;
            state.yaw += yaw;
            state.lift = Math.max(-1.2, Math.min(1.2, state.lift + lift));
          },
          zoom: function (factor) {
            if (!state || !(factor > 0)) return;
            state.zoom = Math.max(0.4, Math.min(2.5, state.zoom / factor));
          }
        });
      }
      hide(target, VIEWS[view].eyes);
      state.unsubscribe = ctx.onUpdate(step);
      step(0);
      return api;
    }

    function stop() {
      if (!state) return;
      if (typeof state.unsubscribe === "function") state.unsubscribe();
      if (state.handlers) spin.detach(state.handlers);
      hide(state.target, false);
      state = null;
    }

    var api = {
      setView: function (view) {
        if (!state || !Object.prototype.hasOwnProperty.call(VIEWS, view)) return api;
        hide(state.target, VIEWS[view].eyes);
        state.view = view;
        state.snap = true;
        return api;
      },
      setTarget: function (target) {
        if (!state || !target || typeof target.getWorldPosition !== "function") return api;
        hide(state.target, false);
        state.target = target;
        state.scale = scaleOf(target);
        state.last = null;
        hide(target, VIEWS[state.view].eyes);
        state.snap = true;
        return api;
      },
      stop: stop,
      get view() { return state ? state.view : null; }
    };
    return follow;
  }

  kit.cameraViews = Object.keys(VIEWS);
  kit.extend(function (ctx, info) {
    if (!info || info.renderer !== "three" || !ctx || !ctx.THREE || !ctx.camera || typeof ctx.onUpdate !== "function") return;
    var spin = createSpin(ctx, watchPresses(ctx));
    var follow = createFollow(ctx, spin);
    ctx.followCamera = function (target, options) {
      try {
        return follow(target, options);
      } catch (error) {
        warn("followCamera failed: " + (error && error.message ? error.message : error));
        return null;
      }
    };
    // A fixed camera framed by the kit can spin too (view.adjust in three-core.js).
    var fitCameraTo = ctx.fitCameraTo;
    var fixed = null;
    if (typeof fitCameraTo === "function") {
      ctx.fitCameraTo = function (bounds, options) {
        var view = fitCameraTo.apply(this, arguments);
        if (fixed) spin.detach(fixed);
        fixed = null;
        if (options && options.spin && view && typeof view.adjust === "function") {
          try {
            fixed = spinFixed(ctx, spin, view, options.spin);
          } catch (error) {
            warn("spin failed: " + (error && error.message ? error.message : error));
          }
        }
        return view;
      };
    }
  });
  kit.cameraKitVersion = CAMERA_KIT_VERSION;
})();
