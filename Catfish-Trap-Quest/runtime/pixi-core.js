(function () {
  var DEFAULT_BACKGROUND = 0x0f172a;
  var READY_ATTR = "data-game-ready";

  function resolveRoot(root) {
    if (root && root.nodeType === 1) return root;
    if (typeof root === "string" && root.trim()) {
      return document.querySelector(root);
    }
    return document.getElementById("game-root") || document.body;
  }

  function parsePixels(value) {
    var number = parseFloat(value);
    return Number.isFinite(number) ? number : 0;
  }

  function readRootSize(root) {
    var style = window.getComputedStyle ? window.getComputedStyle(root) : null;
    var paddingLeft = parsePixels(style && style.paddingLeft);
    var paddingRight = parsePixels(style && style.paddingRight);
    var paddingTop = parsePixels(style && style.paddingTop);
    var paddingBottom = parsePixels(style && style.paddingBottom);
    var fallbackWidth = window.innerWidth || document.documentElement.clientWidth || 1;
    var fallbackHeight = window.innerHeight || document.documentElement.clientHeight || 1;
    var width = Math.max(1, Math.floor((root.clientWidth || fallbackWidth) - paddingLeft - paddingRight));
    var height = Math.max(1, Math.floor((root.clientHeight || fallbackHeight) - paddingTop - paddingBottom));
    return { width: width, height: height };
  }

  function ensureCanvas(root, providedCanvas) {
    var canvas = providedCanvas || root.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "game-canvas";
      root.prepend(canvas);
    }
    canvas.setAttribute("data-pixi-canvas", "1");
    canvas.style.display = "block";
    canvas.style.maxWidth = "none";
    canvas.style.maxHeight = "none";
    canvas.style.transform = "none";
    root.setAttribute("data-renderer-owned-canvas", "pixi");
    root.setAttribute("data-shell-sizes-canvas", "0");
    return canvas;
  }

  function removeLegacyPlaceholder(root) {
    if (!root || !root.querySelectorAll) return;
    var placeholders = root.querySelectorAll("#vibe-placeholder");
    Array.prototype.forEach.call(placeholders, function (node) {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function setCanvasCssSize(canvas, size) {
    canvas.style.width = size.width + "px";
    canvas.style.height = size.height + "px";
  }

  function createStatus(root) {
    var status = {
      runtime: "pixi",
      renderMode: "2d",
      ready: false,
      rendererReady: false,
      error: null,
      events: [],
      restarts: 0,
      prunedChildren: 0,
      layerCounts: {},
    };
    window.__VIBE_2D_STATUS__ = status;
    if (root) root.setAttribute("data-vibe-runtime", "pixi");
    return status;
  }

  function emit(status, name, detail) {
    var event = { name: String(name || "event"), detail: detail || null, at: Date.now() };
    status.events.push(event);
    if (status.events.length > 40) status.events.shift();
    try {
      window.dispatchEvent(new CustomEvent("vibe:game2d:" + event.name, { detail: event.detail }));
    } catch (_error) {
      // CustomEvent can be unavailable in older embedded browsers.
    }
  }

  function createInput(target) {
    if (window.GameInput && typeof window.GameInput.createInput === "function") {
      var options = target && target.target
        ? target
        : { target: target || window };
      if (!options.controls) options.controls = window.GameInput.declarationRequired ? [] : "standard_2d";
      return window.GameInput.createInput(options);
    }
    var keys = Object.create(null);
    var pressed = Object.create(null);
    var released = Object.create(null);
    var pointer = {
      x: 0,
      y: 0,
      down: false,
      pressed: false,
      released: false,
    };
    var prevent = {
      ArrowUp: true,
      ArrowDown: true,
      ArrowLeft: true,
      ArrowRight: true,
      Space: true,
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

    function setKey(code, down, event) {
      code = normalizeKeyCode(code);
      if (!code) return;
      if (prevent[code] && event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (down && !keys[code]) pressed[code] = true;
      if (!down && keys[code]) released[code] = true;
      keys[code] = !!down;
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
        forward: -axis.y,
      };
    }

    function pointerPosition(event) {
      var rect = target.getBoundingClientRect();
      var source = event.touches && event.touches[0] ? event.touches[0] : event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : event;
      pointer.x = Math.max(0, source.clientX - rect.left);
      pointer.y = Math.max(0, source.clientY - rect.top);
    }

    window.addEventListener("keydown", function (event) { setKey(event.code || event.key, true, event); });
    window.addEventListener("keyup", function (event) { setKey(event.code || event.key, false, event); });
    target.addEventListener("pointerdown", function (event) {
      pointerPosition(event);
      if (!pointer.down) pointer.pressed = true;
      pointer.down = true;
      try { target.focus({ preventScroll: true }); } catch (_error) {}
    });
    target.addEventListener("pointermove", pointerPosition);
    window.addEventListener("pointerup", function (event) {
      pointerPosition(event);
      if (pointer.down) pointer.released = true;
      pointer.down = false;
    });
    target.addEventListener("touchstart", function (event) {
      pointerPosition(event);
      if (!pointer.down) pointer.pressed = true;
      pointer.down = true;
      event.preventDefault();
    }, { passive: false });
    target.addEventListener("touchmove", function (event) {
      pointerPosition(event);
      event.preventDefault();
    }, { passive: false });
    target.addEventListener("touchend", function (event) {
      pointerPosition(event);
      if (pointer.down) pointer.released = true;
      pointer.down = false;
      event.preventDefault();
    }, { passive: false });

    document.addEventListener("pointerdown", function (event) {
      var button = event.target && event.target.closest ? event.target.closest("[data-vkey]") : null;
      if (!button) return;
      setKey(button.getAttribute("data-vkey"), true, event);
    });
    document.addEventListener("pointerup", function (event) {
      var button = event.target && event.target.closest ? event.target.closest("[data-vkey]") : null;
      if (!button) return;
      setKey(button.getAttribute("data-vkey"), false, event);
    });

    return {
      keys: keys,
      pointer: pointer,
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
        pressed = Object.create(null);
        released = Object.create(null);
        pointer.pressed = false;
        pointer.released = false;
      },
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
    } catch (_error) {
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
    } catch (_error) {
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
    } catch (_error) {
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

  function createHudSetter(root) {
    return function setHud(values) {
      Object.keys(values || {}).forEach(function (key) {
        var value = values[key];
        var nodes = root.querySelectorAll('[data-hud="' + key + '"], #' + key);
        if (!nodes.length) {
          var created = createHudChip(root, key, value);
          if (created) applyHudValue(created, value);
          return;
        }
        Array.prototype.forEach.call(nodes, function (node) {
          applyHudValue(node, value);
        });
      });
    };
  }

  // Spawn-placement registry: stops games stacking spawns on one point.
  // claim() keeps a requested position when its centre is at least the two
  // radii apart from every prior claim, otherwise walks a golden-angle spiral
  // to the nearest clear spot; scatter() rejection-samples a batch inside an
  // area. Per-mount state; distances are plain 2D.
  var PLACEMENT_GOLDEN_ANGLE = 2.399963229728653;

  function createPlacementRegistry(size) {
    var claims = [];

    function boundValue(value, fallback) {
      var number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    }

    function placementRadius(value) {
      var radius = Number(value);
      return Number.isFinite(radius) && radius > 0 ? radius : 1;
    }

    function clearanceAt(x, y, radius) {
      var worst = Infinity;
      for (var index = 0; index < claims.length; index += 1) {
        var other = claims[index];
        var dx = x - other.x;
        var dy = y - other.y;
        var gap = Math.sqrt(dx * dx + dy * dy) - (radius + other.radius);
        if (gap < worst) worst = gap;
      }
      return worst;
    }

    function isFree(x, y, radius) {
      return clearanceAt(x, y, radius) >= 0;
    }

    function register(x, y, radius, label) {
      claims.push({
        x: x,
        y: y,
        radius: radius,
        label: label === undefined || label === null ? null : String(label)
      });
      return { x: x, y: y };
    }

    function claim(position, radius, label) {
      try {
        if (!position || typeof position !== "object") return position;
        var x = Number(position.x);
        var y = Number(position.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return position;
        var claimedRadius = placementRadius(radius);
        if (isFree(x, y, claimedRadius)) return register(x, y, claimedRadius, label);
        var step = Math.max(claimedRadius, 1);
        var best = null;
        var bestClearance = -Infinity;
        for (var probe = 1; probe <= 32; probe += 1) {
          var angle = probe * PLACEMENT_GOLDEN_ANGLE;
          var distance = step * Math.sqrt(probe);
          var candidateX = x + Math.cos(angle) * distance;
          var candidateY = y + Math.sin(angle) * distance;
          var clearance = clearanceAt(candidateX, candidateY, claimedRadius);
          if (clearance >= 0) return register(candidateX, candidateY, claimedRadius, label);
          if (clearance > bestClearance) {
            bestClearance = clearance;
            best = { x: candidateX, y: candidateY };
          }
        }
        return register(best ? best.x : x, best ? best.y : y, claimedRadius, label);
      } catch (_error) {
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
        var fallbackWidth = size && Number.isFinite(size.width) && size.width > 1 ? size.width : 800;
        var fallbackHeight = size && Number.isFinite(size.height) && size.height > 1 ? size.height : 600;
        var minX = boundValue(area.minX, 0);
        var maxX = boundValue(area.maxX, fallbackWidth);
        var minY = boundValue(area.minY, 0);
        var maxY = boundValue(area.maxY, fallbackHeight);
        if (maxX < minX) { var swapX = minX; minX = maxX; maxX = swapX; }
        if (maxY < minY) { var swapY = minY; minY = maxY; maxY = swapY; }
        var pointRadius = minDistance / 2;
        for (var index = 0; index < total; index += 1) {
          var placed = null;
          for (var attempt = 0; attempt < 40; attempt += 1) {
            var x = minX + Math.random() * (maxX - minX);
            var y = minY + Math.random() * (maxY - minY);
            if (isFree(x, y, pointRadius)) {
              placed = register(x, y, pointRadius, options.label);
              break;
            }
          }
          if (!placed) {
            placed = claim({
              x: minX + Math.random() * (maxX - minX),
              y: minY + Math.random() * (maxY - minY)
            }, pointRadius, options.label);
          }
          results.push(placed);
        }
        return results;
      } catch (_error) {
        return results;
      }
    }

    function reset() {
      claims.length = 0;
      return true;
    }

    return { claim: claim, scatter: scatter, reset: reset };
  }

  function normalizeAssetVariant(options) {
    return String((options && (options.variant || options.species || options.subject)) || "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-");
  }

  function assetId(name, options) {
    if (options && options.id !== undefined) return String(options.id);
    var variant = normalizeAssetVariant(options);
    return variant ? name + "-" + variant : name;
  }

  function wrapAssetBuilder(PIXI, name, builder) {
    function wrapped(options) {
      var result = builder(PIXI, options || {});
      if (!result) throw new Error("Generated asset builder " + name + " did not return a display object.");
      if (!result.diyAsset) {
        result.diyAsset = {
          id: assetId(name, options),
          width: 0,
          height: 0,
          fallback: false,
        };
      }
      return result;
    }
    ["static", "moving", "action"].forEach(function (mode) {
      if (typeof builder[mode] !== "function") return;
      wrapped[mode] = function (options) {
        var result = builder[mode](PIXI, options || {});
        if (!result) throw new Error("Generated asset builder " + name + "." + mode + " did not return a display object.");
        if (!result.diyAsset) {
          result.diyAsset = {
            id: assetId(name, options),
            width: 0,
            height: 0,
            fallback: false,
          };
        }
        return result;
      };
    });
    return wrapped;
  }

  function bindAssets(PIXI) {
    var sdkMethodNames = {
      getPlacement: true,
      getAnimation: true,
      animate: true,
      setAnimation: true,
      playAction: true,
    };
    var predefined = window.Game2DAssets || {};
    var generated = window.Game2DGeneratedAssets || {};
    var merged = {};
    [predefined, generated].forEach(function (source) {
      Object.keys(source || {}).forEach(function (key) {
        if (typeof source[key] !== "function") return;
        merged[key] = sdkMethodNames[key] ? source[key] : wrapAssetBuilder(PIXI, key, source[key]);
      });
    });
    if (predefined && typeof predefined === "object" && typeof Object.setPrototypeOf === "function") {
      Object.setPrototypeOf(merged, predefined);
    }
    // The kid's edited assets (runtime/asset-library.js) replace the factories they are bound to.
    var library = window.DIYAssetLibrary;
    if (library && typeof library.bindPixi === "function") {
      try { library.bindPixi(PIXI, merged); } catch (_error) {}
    }
    return merged;
  }

  function createLayers(PIXI, stage) {
    var layers = {
      background: new PIXI.Container(),
      world: new PIXI.Container(),
      effects: new PIXI.Container(),
      ui: new PIXI.Container(),
    };
    Object.keys(layers).forEach(function (key) {
      layers[key].label = key;
      stage.addChild(layers[key]);
    });
    return layers;
  }

  function destroyDisplayObject(child) {
    if (!child || typeof child.destroy !== "function") return;
    try {
      child.destroy({ children: true });
    } catch (_error) {
      try { child.destroy(true); } catch (_innerError) {}
    }
  }

  function shouldForceDestroy(options) {
    return !!(options && options.forceDestroy === true);
  }

  function removeDisplayObject(layer, child, destroy) {
    if (!layer || !child) return false;
    try {
      if (typeof layer.removeChild === "function") {
        layer.removeChild(child);
      } else if (Array.isArray(layer.children)) {
        var idx = layer.children.indexOf(child);
        if (idx !== -1) layer.children.splice(idx, 1);
      }
      if (destroy) destroyDisplayObject(child);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function clearLayerChildren(layer, options) {
    options = options || {};
    var forceDestroy = shouldForceDestroy(options);
    var children = layer && Array.isArray(layer.children) ? layer.children.slice() : [];
    if (layer && typeof layer.removeChildren === "function") {
      try {
        children = layer.removeChildren();
      } catch (_error) {}
    } else {
      children.forEach(function (child) { removeDisplayObject(layer, child, false); });
    }
    if (forceDestroy) children.forEach(destroyDisplayObject);
    return children.length;
  }

  function createLayerLifecycle(layers, status) {
    var generation = 0;
    var resetDepth = 0;
    var pendingEnd = 0;
    var addedDuringReset = false;

    function recordCounts() {
      var counts = {};
      Object.keys(layers).forEach(function (key) {
        counts[key] = layers[key] && Array.isArray(layers[key].children) ? layers[key].children.length : 0;
      });
      status.layerCounts = counts;
    }

    function markChild(child) {
      if (child && (typeof child === "object" || typeof child === "function")) {
        child.__vibe2dGeneration = generation;
      }
    }

    Object.keys(layers).forEach(function (key) {
      var layer = layers[key];
      if (!layer || typeof layer.addChild !== "function" || layer.__vibe2dAddChildWrapped) return;
      var originalAddChild = layer.addChild;
      layer.addChild = function () {
        for (var i = 0; i < arguments.length; i++) markChild(arguments[i]);
        if (resetDepth > 0) addedDuringReset = true;
        var result = originalAddChild.apply(layer, arguments);
        recordCounts();
        return result;
      };
      layer.__vibe2dAddChildWrapped = true;
    });

    function pruneOlderGenerations() {
      if (!addedDuringReset) {
        recordCounts();
        return 0;
      }
      var removed = 0;
      Object.keys(layers).forEach(function (key) {
        var layer = layers[key];
        var children = layer && Array.isArray(layer.children) ? layer.children.slice() : [];
        var hasCurrent = children.some(function (child) {
          return child && child.__vibe2dGeneration === generation;
        });
        if (!hasCurrent) return;
        children.forEach(function (child) {
          var childGeneration = child && typeof child.__vibe2dGeneration === "number" ? child.__vibe2dGeneration : 0;
          if (childGeneration < generation && removeDisplayObject(layer, child, false)) {
            removed += 1;
          }
        });
      });
      status.prunedChildren += removed;
      recordCounts();
      return removed;
    }

    function begin(reason) {
      if (pendingEnd) {
        window.clearTimeout(pendingEnd);
        pendingEnd = 0;
      }
      if (resetDepth === 0) {
        generation += 1;
        addedDuringReset = false;
        status.restarts += 1;
        status.restartReason = reason || "reset";
      }
      resetDepth += 1;
      return generation;
    }

    function end() {
      if (resetDepth > 0) resetDepth -= 1;
      if (resetDepth > 0) return 0;
      return pruneOlderGenerations();
    }

    function run(reason, fn) {
      begin(reason);
      try {
        return fn();
      } finally {
        end();
      }
    }

    function schedule(reason) {
      begin(reason);
      pendingEnd = window.setTimeout(function () {
        pendingEnd = 0;
        end();
      }, 0);
    }

    recordCounts();
    return {
      begin: begin,
      end: end,
      run: run,
      schedule: schedule,
      recordCounts: recordCounts,
    };
  }

  // V3 input: the game declares every control, so the kit binds none of its own.
  function declaredControlsOnly() {
    var kit = window.GameInput;
    return Boolean(kit && kit.declarationRequired);
  }

  function isRestartControl(target) {
    var node = target && target.closest ? target.closest("button,[role='button'],[data-action],[data-vibe-action]") : null;
    if (!node) return false;
    if (declaredControlsOnly()) {
      // A V3 button restarts only when the game marks it data-action="restart".
      var action = node.getAttribute("data-vibe-action") || node.getAttribute("data-action");
      return String(action || "").toLowerCase() === "restart";
    }
    var text = [
      node.getAttribute("data-action"),
      node.getAttribute("data-vibe-action"),
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      node.textContent,
    ].join(" ");
    return /\b(restart|retry|again|reset|reboot|play again|try again|continue)\b/i.test(text);
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

  function renderFallback(root, message) {
    var fallback = document.createElement("div");
    fallback.className = "game2d-fallback";
    fallback.setAttribute("role", "status");
    fallback.style.cssText = [
      "position:absolute",
      "left:50%",
      "top:50%",
      "transform:translate(-50%,-50%)",
      "z-index:100",
      "max-width:min(88vw,380px)",
      "padding:18px",
      "border-radius:8px",
      "background:rgba(15,23,42,0.92)",
      "color:white",
      "font:15px/1.45 system-ui,sans-serif",
      "text-align:center",
    ].join(";");
    fallback.textContent = message;
    root.appendChild(fallback);
  }

  function errorMessage(error) {
    if (error && error.message) return String(error.message);
    return String(error);
  }

  function isDestroyedPixiDisplayObjectError(message) {
    return /(?:this\._position is null|_position[^.\n]{0,80}null|Cannot read properties of null \(reading ['"]x['"]\)|Cannot read properties of null \(reading ['"]y['"]\))/i.test(String(message || ""));
  }

  function normalizeRuntimeError(error) {
    var originalMessage = errorMessage(error);
    if (!isDestroyedPixiDisplayObjectError(originalMessage)) {
      return { error: error, message: originalMessage, originalMessage: originalMessage, normalized: false };
    }

    var message = [
      "A destroyed Pixi display object was reused.",
      "Use ctx.clearLayers() or ctx.clearLayer() to remove objects during reset;",
      "only use forceDestroy:true when no game state keeps references.",
      "Original error: " + originalMessage,
    ].join(" ");
    var wrapped = new Error(message);
    wrapped.name = "PixiDisplayObjectReuseError";
    try { wrapped.cause = error; } catch (_causeError) {}
    if (error && error.stack) {
      wrapped.stack = wrapped.name + ": " + message + "\nCaused by: " + error.stack;
    }
    return { error: wrapped, message: message, originalMessage: originalMessage, normalized: true };
  }

  async function mount(options) {
    // Normalize legacy call shapes (mount(rootElement, callback)) the same
    // way three-core does: honor the intent instead of silently dropping the
    // game callback, and flag the misuse on status for validation.
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
        "Game2DCore.mount(root, callback) is a legacy call shape; use " +
        "Game2DCore.mount({ root, createGame }) instead."
      );
    }
    var root = resolveRoot(options.root);
    if (!root) return null;
    removeLegacyPlaceholder(root);
    var status = createStatus(root);
    status.legacyMountSignature = usedLegacySignature;
    status.gameCallbackProvided = typeof options.createGame === "function";
    var PIXI = window.PIXI || globalThis.PIXI;
    if (!PIXI || !PIXI.Application) {
      status.error = "PixiJS runtime did not load.";
      renderFallback(root, status.error);
      return null;
    }

    var canvas = ensureCanvas(root, options.canvas);
    var size = readRootSize(root);
    setCanvasCssSize(canvas, size);
    var background = typeof options.background === "number" ? options.background : DEFAULT_BACKGROUND;
    var app = new PIXI.Application();

    try {
      if (typeof app.init === "function") {
        await app.init({
          canvas: canvas,
          width: size.width,
          height: size.height,
          background: background,
          backgroundColor: background,
          antialias: true,
          resolution: 1,
          autoDensity: false,
        });
      } else {
        app = new PIXI.Application({
          view: canvas,
          width: size.width,
          height: size.height,
          backgroundColor: background,
          antialias: true,
          resolution: 1,
          autoDensity: false,
        });
      }

      var rendererCanvas = app.canvas || app.view || canvas;
      if (rendererCanvas !== canvas && rendererCanvas && !rendererCanvas.parentNode) {
        root.prepend(rendererCanvas);
      }
      rendererCanvas.setAttribute("data-pixi-canvas", "1");
      setCanvasCssSize(rendererCanvas, size);
      status.rendererReady = true;

      var layers = createLayers(PIXI, app.stage);
      var lifecycle = createLayerLifecycle(layers, status);
      var setHud = window.VibeGameUI
        ? window.VibeGameUI.configure(options.hud) : createHudSetter(root);
      var input = createInput({ target: root, controls: options.controls });
      var placement = createPlacementRegistry(size);
      var markedReady = false;
      var game = null;
      var resetToken = 0;

      function reportRuntimeError(error, phase) {
        var normalized = normalizeRuntimeError(error);
        status.error = normalized.message;
        emit(status, "error", {
          message: status.error,
          originalMessage: normalized.originalMessage,
          normalized: normalized.normalized,
          phase: phase || "runtime",
        });
        return normalized.error;
      }

      function markReady() {
        if (markedReady) return;
        markedReady = true;
        status.ready = true;
        root.setAttribute(READY_ATTR, "true");
        emit(status, "ready", { width: size.width, height: size.height });
      }

      function resize() {
        var nextSize = readRootSize(root);
        if (nextSize.width === size.width && nextSize.height === size.height) return;
        size.width = nextSize.width;
        size.height = nextSize.height;
        if (app.renderer && typeof app.renderer.resize === "function") {
          app.renderer.resize(size.width, size.height);
        }
        setCanvasCssSize(rendererCanvas, size);
        if (game && typeof game.onResize === "function") {
          game.onResize(size);
        }
      }

      function clearLayer(layerOrName, options) {
        var layer = typeof layerOrName === "string" ? layers[layerOrName] : layerOrName;
        var removed = clearLayerChildren(layer, options);
        lifecycle.recordCounts();
        return removed;
      }

      function clearLayers(options) {
        var removed = 0;
        Object.keys(layers).forEach(function (key) {
          removed += clearLayerChildren(layers[key], options);
        });
        lifecycle.recordCounts();
        return removed;
      }

      function resetGame(reason) {
        if (!game || typeof game.reset !== "function") return false;
        resetToken += 1;
        var resetReason = reason || "reset";
        var result = lifecycle.run(resetReason, function () {
          emit(status, "restart_triggered", { reason: resetReason });
          return game.reset(ctx);
        });
        return result === undefined ? true : result;
      }

      function fallbackRestart(reason, token) {
        window.setTimeout(function () {
          if (resetToken === token) resetGame(reason);
        }, 0);
      }

      var ctx = {
        PIXI: PIXI,
        app: app,
        stage: app.stage,
        layers: layers,
        input: input,
        assets: bindAssets(PIXI),
        size: size,
        setHud: setHud,
        placement: placement,
        emit: function (name, detail) { emit(status, name, detail); },
        markReady: markReady,
        clearLayer: clearLayer,
        clearLayers: clearLayers,
        beginReset: lifecycle.begin,
        endReset: lifecycle.end,
        restart: resetGame,
      };

      // Feature kits (DIYKit.extend) add their helpers to ctx before the game starts.
      ((window.DIYKit && window.DIYKit.extensions) || []).forEach(function (extend) {
        try {
          extend(ctx, { renderer: "pixi" });
        } catch (error) {
          if (typeof console !== "undefined" && console.warn) console.warn("DIYKit extension failed", error);
        }
      });
      game = typeof options.createGame === "function" ? options.createGame(ctx) || {} : {};
      document.addEventListener("click", function (event) {
        if (!isRestartControl(event.target)) return;
        var token = resetToken;
        lifecycle.schedule("restart-control");
        fallbackRestart("restart-control", token);
      }, true);
      window.addEventListener("keydown", function (event) {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (restartKeys(input).indexOf(event.code) === -1) return;
        var reason = event.code === "KeyR" ? "key-r" : "key";
        var token = resetToken;
        lifecycle.schedule(reason);
        fallbackRestart(reason, token);
      }, true);
      if (window.GameUI && typeof window.GameUI.onRestart === "function") {
        try { window.GameUI.onRestart(function () { resetGame("game-ui"); }); } catch (_error) {}
      }
      window.addEventListener("resize", function () { window.setTimeout(resize, 30); });
      if (typeof ResizeObserver === "function") {
        try {
          new ResizeObserver(function () { resize(); }).observe(root);
        } catch (_error) {}
      }

      // Cheap scene status for the headless boot smoke: total child count
      // (empty-scene detection — the pixi analog of the three-family
      // drawCalls/meshes check) and a coarse position signature (the
      // input-responsiveness probe compares it before/after synthetic input).
      var prevScenePositions = new Map();
      var prevSceneAt = 0;
      var SCENE_PARTS_CAP = 200;
      function updateSceneStatus() {
        try {
          var total = 0;
          var parts = [];
          var queue = [];
          var positions = new Map();
          var maxDelta = 0;
          function enqueue(children) {
            for (var i = 0; i < children.length && queue.length < SCENE_PARTS_CAP; i += 1) {
              var child = children[i];
              if (child && child.visible !== false && child.renderable !== false) queue.push(child);
            }
          }
          Object.keys(layers).forEach(function (key) {
            var layer = layers[key];
            var children = layer && Array.isArray(layer.children) ? layer.children : [];
            total += children.length;
            enqueue(children);
          });
          // Walk groups breadth-first so sibling player/scenery containers are
          // both observed. Catalog art is one object: its internal parts must
          // neither exhaust the cap nor make an idle character look like movement.
          for (var i = 0; i < queue.length; i += 1) {
            var child = queue[i];
            var point = child.getGlobalPosition();
            var x = point.x;
            var y = point.y;
            positions.set(child, { x: x, y: y });
            parts.push(
              Math.round(x) + "," + Math.round(y) + "," + Math.round((child.rotation || 0) * 100)
            );
            // Match objects by identity, not list index: removing/reordering a
            // stationary platform is not evidence of motion.
            var previous = prevScenePositions.get(child);
            if (previous) {
              maxDelta = Math.max(maxDelta, Math.hypot(x - previous.x, y - previous.y));
            }
            if (!child.diyAsset && Array.isArray(child.children)) {
              enqueue(child.children);
            }
          }
          status.stageChildren = total;
          status.stageSignature = parts.join("|");
          // Peak movement speed of any tracked object since start (px/s):
          // the headless check reads it to tell a frozen game from a live one.
          // It is 0, not undefined, once tracking has run: a frozen game must read as frozen.
          var now = Date.now();
          if (prevSceneAt && now > prevSceneAt) {
            if (typeof status.motionRate !== "number") status.motionRate = 0;
            var rate = maxDelta / ((now - prevSceneAt) / 1000);
            if (rate > (status.motionRate || 0)) status.motionRate = Math.round(rate);
          }
          prevScenePositions = positions;
          prevSceneAt = now;
        } catch (_error) {}
      }

      var sceneStatusFrame = 0;
      app.ticker.add(function (ticker) {
        try {
          resize();
          var deltaMS = ticker && typeof ticker.deltaMS === "number" ? ticker.deltaMS : 16.667;
          var dt = Math.min(0.05, Math.max(0, deltaMS / 1000));
          if (game && typeof game.update === "function") game.update(dt, ctx);
          if (game && typeof game.render === "function") game.render(dt, ctx);
          markReady();
          sceneStatusFrame += 1;
          if (sceneStatusFrame % 10 === 1) updateSceneStatus();
        } catch (error) {
          throw reportRuntimeError(error, "ticker");
        } finally {
          input.endFrame();
        }
      });

      return { app: app, ctx: ctx, game: game, reset: resetGame, clearLayers: clearLayers };
    } catch (error) {
      var runtimeError = normalizeRuntimeError(error);
      status.error = runtimeError.message;
      renderFallback(root, "Pixi game failed to start: " + status.error);
      throw runtimeError.error;
    }
  }

  window.Game2DCore = {
    mount: mount,
    createInput: createInput,
    readRootSize: readRootSize,
  };
})();
