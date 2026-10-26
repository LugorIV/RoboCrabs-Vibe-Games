/* Feature kits register with DIYKit.extend(fn); mount() calls fn(ctx, info) before createGame. */
window.DIYKit = window.DIYKit || { libraryBase: "https://cdn.diy.org/vibe-library/v1", extensions: [], extend: function (fn) { this.extensions.push(fn); } };
/* V3 UI: declared controls, and exactly one owner of game information. */
(function () {
  "use strict";
  let owner = "custom";
  let controls = [];
  let press = function () {};
  let panel;
  let hud;
  let releases = [];
  const fields = new Map();
  const touchDevice = window.matchMedia ? window.matchMedia("(pointer: coarse)") : null;
  const ARROWS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };

  function customFields() {
    return Array.from(document.querySelectorAll("[data-hud]"));
  }

  function customHud() {
    return owner === "custom" || customFields().length > 0;
  }

  function remove(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  // A control bound to exactly one arrow direction shows as an arrow button.
  function direction(control) {
    const found = new Set(control.keys.map(function (key) { return ARROWS[key]; }).filter(Boolean));
    return found.size === 1 ? Array.from(found)[0] : null;
  }

  function style() {
    if (document.getElementById("vibe3-ui-style")) return;
    const node = document.createElement("style");
    node.id = "vibe3-ui-style";
    // Colours, corners and fonts follow the game UI kit's skin; the fallbacks are its default skin.
    node.textContent = `
      #vibe3-controls, #vibe3-hud { position:fixed; z-index:10000; pointer-events:none;
        font:700 16px/1.2 var(--ui-body, system-ui, sans-serif); color:var(--ui-ink, #1d2b53); }
      #vibe3-controls { left:12px; right:12px; bottom:calc(12px + env(safe-area-inset-bottom));
        display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:flex-end; gap:10px; }
      #vibe3-controls::before { content:""; order:2; flex:1 1 0; }
      #vibe3-controls button { order:3; }
      #vibe3-controls button[data-dir] { order:1; font-size:0; }
      #vibe3-controls button, #vibe3-hud span { background:var(--ui-surface, #ffffff);
        color:var(--ui-ink, #1d2b53); border:var(--ui-border-w, 3px) solid var(--ui-edge, #1d2b53);
        border-radius:var(--ui-radius-sm, 14px); box-shadow:0 4px 0 var(--ui-shadow, rgba(29,43,83,.35));
        padding:8px 14px; }
      #vibe3-controls button { min-width:56px; min-height:56px; pointer-events:auto; touch-action:none;
        user-select:none; -webkit-user-select:none; font-family:inherit; font-weight:700; opacity:.94;
        display:inline-flex; align-items:center; justify-content:center;
        transition:transform .06s ease-out, box-shadow .06s ease-out; }
      #vibe3-controls button[data-held="true"] { transform:translateY(3px);
        box-shadow:0 1px 0 var(--ui-shadow, rgba(29,43,83,.35));
        background:var(--ui-primary, #ffc83d); color:var(--ui-on-primary, #1d2b53); }
      #vibe3-controls button[data-dir]::before { content:""; width:0; height:0;
        border:11px solid transparent; }
      #vibe3-controls button[data-dir="left"]::before { border-right:16px solid currentColor; border-left:0; }
      #vibe3-controls button[data-dir="right"]::before { border-left:16px solid currentColor; border-right:0; }
      #vibe3-controls button[data-dir="up"]::before { border-bottom:16px solid currentColor; border-top:0; }
      #vibe3-controls button[data-dir="down"]::before { border-top:16px solid currentColor; border-bottom:0; }
      #vibe3-controls button:focus-visible { outline:3px solid var(--ui-accent, #80d8ff); }
      #vibe3-hud { top:calc(12px + env(safe-area-inset-top)); left:12px; right:12px;
        display:flex; flex-wrap:wrap; gap:8px; font-family:var(--ui-display, system-ui, sans-serif);
        font-weight:400; font-size:18px; }
    `;
    document.head.appendChild(node);
  }

  function renderControls() {
    releases.forEach(function (release) { release(); });
    remove(panel);
    panel = null;
    releases = [];
    if (!controls.length || !touchDevice || !touchDevice.matches) return;
    style();
    panel = document.createElement("div");
    panel.id = "vibe3-controls";
    panel.setAttribute("data-custom", String(customHud()));
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", "Game controls");
    controls.forEach(function (control) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = control.label;
      button.setAttribute("aria-label", control.label);
      button.setAttribute("data-action", control.id);
      const dir = direction(control);
      if (dir) button.setAttribute("data-dir", dir);
      const held = new Set();
      function show(down) { button.setAttribute("data-held", String(down)); }
      releases.push(function () { held.clear(); show(false); press(control.id, false); });
      function release(event) {
        held.delete(event.pointerId);
        show(held.size > 0);
        press(control.id, held.size > 0);
      }
      button.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        held.add(event.pointerId);
        button.setPointerCapture(event.pointerId);
        show(true);
        press(control.id, true);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (name) {
        button.addEventListener(name, release);
      });
      button.addEventListener("keydown", function (event) {
        if (event.code !== "Space" && event.code !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        show(true);
        press(control.id, true);
      });
      button.addEventListener("keyup", function (event) {
        if (event.code !== "Space" && event.code !== "Enter") return;
        event.stopPropagation();
        show(false);
        press(control.id, false);
      });
      button.addEventListener("blur", function () { held.clear(); show(false); press(control.id, false); });
      panel.appendChild(button);
    });
    document.body.appendChild(panel);
  }

  function setHud(values) {
    const custom = customHud();
    if (panel) panel.setAttribute("data-custom", String(custom));
    if (custom) {
      remove(hud);
      hud = null;
      fields.clear();
      customFields().forEach(function (node) {
        const key = node.getAttribute("data-hud");
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          node.textContent = values[key] == null ? "" : String(values[key]);
        }
      });
      return;
    }
    Object.keys(values).forEach(function (key) {
      if (values[key] == null) {
        remove(fields.get(key));
        fields.delete(key);
        return;
      }
      if (!hud) {
        style();
        hud = document.createElement("div");
        hud.id = "vibe3-hud";
        document.body.appendChild(hud);
      }
      if (!fields.has(key)) {
        const field = document.createElement("span");
        fields.set(key, field);
        hud.appendChild(field);
      }
      fields.get(key).textContent = key + ": " + String(values[key]);
    });
  }

  window.VibeGameUI = {
    configure: function (mode) {
      owner = mode === "kit" ? "kit" : "custom";
      setHud({});
      return setHud;
    },
    setHud: setHud,
    direction: direction,
    releaseControls: function () { releases.forEach(function (release) { release(); }); },
    setControls: function (next, onPress) {
      controls = next;
      press = onPress;
      renderControls();
    },
    dispose: function () {
      remove(panel);
      remove(hud);
      panel = hud = null;
      controls = [];
      releases = [];
      fields.clear();
    },
  };
  if (touchDevice && touchDevice.addEventListener) {
    touchDevice.addEventListener("change", renderControls);
  }
  window.__VIBE_INPUT_OVERLAY_MANAGED__ = true;
  window.__VIBE_CONTROLS_HINT_MANAGED__ = true;
})();

/* V3 input: raw device state plus explicit actions. No profiles or inferred UI. */
(function () {
  "use strict";
  let shared;
  const aliases = { " ": "Space", Spacebar: "Space", Left: "ArrowLeft", Right: "ArrowRight",
    Up: "ArrowUp", Down: "ArrowDown", Esc: "Escape" };
  function code(value) {
    const text = String(value || "");
    if (aliases[text]) return aliases[text];
    if (/^[a-z]$/i.test(text)) return "Key" + text.toUpperCase();
    if (/^[0-9]$/.test(text)) return "Digit" + text;
    return text;
  }

  function normalize(config) {
    const declared = Array.isArray(config) ? config : (config && config.controls) || [];
    const entries = Array.isArray(declared) ? declared : Object.keys(declared).map(function (id) {
      const value = declared[id];
      return Array.isArray(value) ? { id: id, keys: value } : { ...value, id: id };
    });
    const seen = new Set();
    // One key, one action: a key an earlier action owns is dropped and reported.
    const owners = {};
    const clashes = [];
    const controls = entries.filter(function (entry) {
      if (!entry || !entry.id || seen.has(entry.id) || !Array.isArray(entry.keys)) return false;
      seen.add(entry.id);
      return true;
    }).map(function (entry) {
      const id = String(entry.id);
      const keys = entry.keys.map(code).filter(function (key) {
        if (!owners[key]) owners[key] = id;
        else if (owners[key] !== id) clashes.push({ key: key, kept: owners[key], dropped: id });
        return owners[key] === id;
      });
      return { id: id, label: String(entry.label || entry.id), keys: Array.from(new Set(keys)) };
    }).filter(function (entry) { return entry.keys.length > 0; });
    const restart = controls.find(function (entry) { return entry.id === "restart"; });
    window.__VIBE_INPUT_STATUS__ = { clashes: clashes, restartKeys: restart ? restart.keys : [] };
    return controls;
  }

  function create(options) {
    const target = options.target || window;
    const down = new Set();
    const pressed = new Set();
    const released = new Set();
    const touches = new Set();
    const actionStarts = new Set();
    const actionEnds = new Set();
    const listeners = [];
    const pointer = { x: 0, y: 0, down: false, pressed: false, released: false };
    let controls = [];
    let dragging = null;
    let look = { x: 0, y: 0 };

    function listen(node, name, fn) {
      node.addEventListener(name, fn);
      listeners.push(function () { node.removeEventListener(name, fn); });
    }
    function keysFor(key) {
      const action = controls.find(function (entry) { return entry.id === key; });
      return action ? action.keys : [code(key)];
    }
    function has(set, key) { return keysFor(key).some(function (keyCode) { return set.has(keyCode); }); }
    function touchFor(key) {
      return touches.has(key) || controls.some(function (entry) {
        return touches.has(entry.id) && entry.keys.includes(code(key));
      });
    }
    function isDown(key) { return has(down, key) || touchFor(key); }
    function actionEdge(set, key) {
      return set.has(key) || controls.some(function (entry) {
        return set.has(entry.id) && entry.keys.includes(code(key));
      });
    }
    function change(key, held) {
      if (held && !down.has(key)) pressed.add(key);
      if (!held && down.has(key)) released.add(key);
      if (held) down.add(key); else down.delete(key);
    }
    function pressAction(id, held) {
      if (held && !touches.has(id)) actionStarts.add(id);
      if (!held && touches.has(id)) actionEnds.add(id);
      if (held) touches.add(id); else touches.delete(id);
    }
    function clear() {
      down.forEach(function (key) { released.add(key); });
      touches.forEach(function (key) { actionEnds.add(key); });
      down.clear();
      touches.clear();
      window.VibeGameUI.releaseControls();
      pressed.clear();
      actionStarts.clear();
      dragging = null;
      pointer.released = pointer.down;
      pointer.down = pointer.pressed = false;
      look = { x: 0, y: 0 };
    }
    function keyboard(event, held) {
      if (held && event.target && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
      if (held && event.target && event.target.isContentEditable) return;
      const key = code(event.code || event.key);
      change(key, held);
      if (controls.some(function (entry) { return entry.keys.includes(key); })) event.preventDefault();
    }
    listen(window, "keydown", function (event) { keyboard(event, true); });
    listen(window, "keyup", function (event) { keyboard(event, false); });
    listen(window, "blur", clear);
    listen(document, "visibilitychange", function () { if (document.hidden) clear(); });
    function point(event) {
      const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : { left: 0, top: 0 };
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
    }
    listen(target, "pointerdown", function (event) {
      if (event.target && event.target.closest
          && event.target.closest("button,input,textarea,select,a")) return;
      point(event);
      dragging = event.pointerId;
      pointer.down = pointer.pressed = true;
      change("Mouse" + event.button, true);
    });
    listen(window, "pointermove", function (event) {
      const old = { x: pointer.x, y: pointer.y };
      point(event);
      if (event.pointerId === dragging) {
        look.x += pointer.x - old.x;
        look.y += pointer.y - old.y;
      }
    });
    function pointerUp(event) {
      change("Mouse" + event.button, false);
      if (event.pointerId === dragging) {
        dragging = null;
        pointer.down = false;
        pointer.released = true;
      }
    }
    listen(window, "pointerup", pointerUp);
    listen(window, "pointercancel", clear);

    const api = {
      pointer: pointer,
      isDown: isDown,
      down: isDown,
      actionDown: isDown,
      pressed: function (key) { return has(pressed, key) || actionEdge(actionStarts, key); },
      released: function (key) { return has(released, key) || actionEdge(actionEnds, key); },
      axis2d: function () {
        return {
          x: Number(isDown("right") || isDown("ArrowRight") || isDown("KeyD"))
            - Number(isDown("left") || isDown("ArrowLeft") || isDown("KeyA")),
          y: Number(isDown("down") || isDown("ArrowDown") || isDown("KeyS"))
            - Number(isDown("up") || isDown("ArrowUp") || isDown("KeyW")),
        };
      },
      lookDelta: function () { return { ...look }; },
      setControls: function (config) {
        clear();
        controls = normalize(config);
        window.VibeGameUI.setControls(controls, pressAction);
        return controls;
      },
      getControls: function () {
        return controls.map(function (entry) { return { ...entry, keys: [...entry.keys] }; });
      },
      endFrame: function () {
        pressed.clear(); released.clear(); actionStarts.clear(); actionEnds.clear();
        pointer.pressed = pointer.released = false;
        look = { x: 0, y: 0 };
      },
      dispose: function () {
        clear();
        listeners.forEach(function (off) { off(); });
        window.VibeGameUI.dispose();
        shared = null;
      },
    };
    api.actionPressed = api.pressed;
    api.actionReleased = api.released;
    api.setControls(options.controls || []);
    return api;
  }
  window.GameInput = {
    declarationRequired: true,
    createInput: function (options) {
      options = options || {};
      if (!shared) shared = create(options);
      else if (options.controls) shared.setControls(options.controls);
      return shared;
    },
    configureControls: function (config) { return this.createInput().setControls(config); },
  };
})();

/* DIY game UI kit (diy-ui-kit): ctx.ui (skins, fonts, title, how-to-play, HUD, popups, pause,
   settings, game over) and ctx.fx (shake, flash, burst, tween, hit-stop). It is DOM over the
   canvas, so it works the same over Pixi and three.js, and it never blocks boot: system fonts
   show until the skin's fonts arrive, and keycaps are text until their pictures load. */
(function () {
  "use strict";
  const KIT = window.DIYKit = window.DIYKit || {
    libraryBase: "https://cdn.diy.org/vibe-library/v1",
    extensions: [],
    extend: function (fn) { this.extensions.push(fn); },
  };
  if (KIT.ui) return;

  // BEGIN CATALOG (generated from app/vibe3/library/data; tests/unit/test_vibe3_ui_kit_catalog.py)
  const CATALOG = {
  "fonts": {
    "bangers": {"f":"Bangers","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/bangers.woff2","100 900"]]},
    "luckiest-guy": {"f":"Luckiest Guy","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/luckiest-guy.woff2","100 900"]]},
    "lilita-one": {"f":"Lilita One","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/lilita-one.woff2","100 900"]]},
    "titan-one": {"f":"Titan One","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/titan-one.woff2","100 900"]]},
    "bowlby-one-sc": {"f":"Bowlby One SC","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/bowlby-one-sc.woff2","100 900"]]},
    "chewy": {"f":"Chewy","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/chewy.woff2","100 900"]]},
    "bubblegum-sans": {"f":"Bubblegum Sans","b":"'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif","files":[["fonts/bubblegum-sans.woff2","100 900"]]},
    "spicy-rice": {"f":"Spicy Rice","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/spicy-rice.woff2","100 900"]]},
    "londrina-solid": {"f":"Londrina Solid","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/londrina-solid.woff2","100 900"]]},
    "knewave": {"f":"Knewave","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/knewave.woff2","100 900"]]},
    "boogaloo": {"f":"Boogaloo","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/boogaloo.woff2","100 900"]]},
    "bungee": {"f":"Bungee","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/bungee.woff2","100 900"]]},
    "press-start-2p": {"f":"Press Start 2P","b":"'Courier New', ui-monospace, monospace","files":[["fonts/press-start-2p.woff2","100 900"]]},
    "pixelify-sans": {"f":"Pixelify Sans","b":"'Courier New', ui-monospace, monospace","files":[["fonts/pixelify-sans.woff2","400 700"]]},
    "vt323": {"f":"VT323","b":"'Courier New', ui-monospace, monospace","files":[["fonts/vt323.woff2","100 900"]]},
    "creepster": {"f":"Creepster","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/creepster.woff2","100 900"]]},
    "jolly-lodger": {"f":"Jolly Lodger","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/jolly-lodger.woff2","100 900"]]},
    "orbitron": {"f":"Orbitron","b":"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif","files":[["fonts/orbitron.woff2","400 900"]]},
    "audiowide": {"f":"Audiowide","b":"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif","files":[["fonts/audiowide.woff2","100 900"]]},
    "russo-one": {"f":"Russo One","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/russo-one.woff2","100 900"]]},
    "black-ops-one": {"f":"Black Ops One","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/black-ops-one.woff2","100 900"]]},
    "pirata-one": {"f":"Pirata One","b":"Georgia, 'Times New Roman', serif","files":[["fonts/pirata-one.woff2","100 900"]]},
    "medieval-sharp": {"f":"MedievalSharp","b":"Georgia, 'Times New Roman', serif","files":[["fonts/medieval-sharp.woff2","100 900"]]},
    "cinzel-decorative": {"f":"Cinzel Decorative","b":"Georgia, 'Times New Roman', serif","files":[["fonts/cinzel-decorative.woff2","100 900"]]},
    "special-elite": {"f":"Special Elite","b":"'Courier New', ui-monospace, monospace","files":[["fonts/special-elite.woff2","100 900"]]},
    "permanent-marker": {"f":"Permanent Marker","b":"'Comic Sans MS', 'Chalkboard SE', 'Trebuchet MS', cursive","files":[["fonts/permanent-marker.woff2","100 900"]]},
    "gloria-hallelujah": {"f":"Gloria Hallelujah","b":"'Comic Sans MS', 'Chalkboard SE', 'Trebuchet MS', cursive","files":[["fonts/gloria-hallelujah.woff2","100 900"]]},
    "pacifico": {"f":"Pacifico","b":"'Brush Script MT', 'Comic Sans MS', cursive","files":[["fonts/pacifico.woff2","100 900"]]},
    "modak": {"f":"Modak","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/modak.woff2","100 900"]]},
    "righteous": {"f":"Righteous","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/righteous.woff2","100 900"]]},
    "shrikhand": {"f":"Shrikhand","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/shrikhand.woff2","100 900"]]},
    "passion-one": {"f":"Passion One","b":"'Arial Black', 'Arial Rounded MT Bold', Impact, system-ui, sans-serif","files":[["fonts/passion-one.woff2","100 900"]]},
    "nunito": {"f":"Nunito","b":"'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif","files":[["fonts/nunito.woff2","200 1000"]]},
    "fredoka": {"f":"Fredoka","b":"'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif","files":[["fonts/fredoka.woff2","300 700"]]},
    "baloo-2": {"f":"Baloo 2","b":"'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif","files":[["fonts/baloo-2.woff2","400 800"]]},
    "varela-round": {"f":"Varela Round","b":"'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif","files":[["fonts/varela-round.woff2","400"]]},
    "quicksand": {"f":"Quicksand","b":"'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif","files":[["fonts/quicksand.woff2","300 700"]]},
    "sniglet": {"f":"Sniglet","b":"'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif","files":[["fonts/sniglet.woff2","400"],["fonts/sniglet-bold.woff2","700"]]},
    "patrick-hand": {"f":"Patrick Hand","b":"'Comic Sans MS', 'Chalkboard SE', 'Trebuchet MS', cursive","files":[["fonts/patrick-hand.woff2","400"]]},
    "mali": {"f":"Mali","b":"'Comic Sans MS', 'Chalkboard SE', 'Trebuchet MS', cursive","files":[["fonts/mali.woff2","400"],["fonts/mali-bold.woff2","700"]]},
    "rubik": {"f":"Rubik","b":"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif","files":[["fonts/rubik.woff2","300 900"]]},
    "atkinson-hyperlegible": {"f":"Atkinson Hyperlegible","b":"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif","files":[["fonts/atkinson-hyperlegible.woff2","400"],["fonts/atkinson-hyperlegible-bold.woff2","700"]]},
    "grandstander": {"f":"Grandstander","b":"'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif","files":[["fonts/grandstander.woff2","100 900"]]}
  },
  "skins": {
    "sunny-day": {"d":0,"c":["#8fd8ff","#ffffff","#1d2b53","#ffc83d","#ff6f59","#ef3e4a","#2fbf71"],"df":"lilita-one","bf":"nunito","s":["round","thick","pressed3d","paper","outline"]},
    "candy-pop": {"d":0,"c":["#ffd6ea","#fff5fa","#5b1f4a","#ff5fa2","#5fd8bd","#ff3b6b","#2fb879"],"df":"bubblegum-sans","bf":"fredoka","s":["pill","thick","jelly","candy","outline"]},
    "comic-pow": {"d":0,"c":["#ffe23d","#ffffff","#111111","#e8202a","#1e6fe8","#e8202a","#23b14d"],"df":"bangers","bf":"baloo-2","s":["soft","thick","sticker","comic","3d"]},
    "lantern-festival": {"d":0,"c":["#ffd9a8","#fff4de","#2a0d10","#ec3f36","#ffc93c","#c81d25","#39b862"],"df":"luckiest-guy","bf":"sniglet","s":["round","thick","pressed3d","paper","outline"]},
    "jungle-explorer": {"d":0,"c":["#b7e4a0","#f4e4c1","#2b1d0e","#3aa547","#f2b134","#d9452b","#2f8f3a"],"df":"righteous","bf":"nunito","s":["soft","thick","plank","wood","outline"]},
    "ocean-bubbles": {"d":0,"c":["#7fdcf0","#eafcff","#0b3a5b","#ff7a59","#2ec4d6","#ff4d6d","#1fae86"],"df":"modak","bf":"quicksand","s":["pill","thin","pill","glass","gradient"]},
    "arctic-frost": {"d":0,"c":["#dcf1ff","#f7fcff","#12355b","#3b82f6","#8fe3ff","#ef476f","#22b3a0"],"df":"titan-one","bf":"quicksand","s":["round","thin","pill","ice","gradient"]},
    "pirate-cove": {"d":0,"c":["#9fd3e8","#f3e1b5","#3b2410","#c0392b","#e2a93b","#b3261e","#2e8b57"],"df":"pirata-one","bf":"patrick-hand","s":["soft","thick","plank","parchment","stamp"]},
    "castle-quest": {"d":0,"c":["#c9c3e6","#ece8f4","#2b2140","#6b3fa0","#f2c14e","#c62f3a","#3a9d5d"],"df":"medieval-sharp","bf":"mali","s":["soft","thick","pressed3d","stone","3d"]},
    "marble-myth": {"d":0,"c":["#d7ecf7","#fbf8f1","#23324a","#1f6fb2","#c9a227","#c0392b","#6b8e23"],"df":"cinzel-decorative","bf":"varela-round","s":["square","double","flat","stone","gradient"]},
    "haunted-night": {"d":1,"c":["#2e2340","#3d2e4a","#f3eaff","#8be36b","#f0a33a","#ff5d73","#8be36b"],"df":"creepster","bf":"grandstander","s":["round","thin","glow","glass","glow"]},
    "pumpkin-patch": {"d":0,"c":["#ffd29a","#fff3e2","#3a1f4d","#ff7b1c","#7c4dbd","#d62f3c","#4caf50"],"df":"jolly-lodger","bf":"baloo-2","s":["round","thick","pressed3d","cardboard","outline"]},
    "neon-city": {"d":1,"c":["#0f1030","#1a1b45","#e9f6ff","#00e5ff","#ff3dcb","#ff4d6d","#39ff88"],"df":"orbitron","bf":"rubik","s":["soft","thin","glow","neon","glow"]},
    "rocket-cadet": {"d":0,"c":["#cfd8ff","#ffffff","#1b1f4b","#5b5bf0","#ff9f1c","#f0435a","#22b07d"],"df":"audiowide","bf":"atkinson-hyperlegible","s":["round","thick","pill","metal","gradient"]},
    "arcade-night": {"d":1,"c":["#1b1430","#241a40","#fff7d6","#ffd23f","#3ee0ff","#ff4f6d","#49e36b"],"df":"press-start-2p","bf":"pixelify-sans","s":["square","thick","pixel","pixel","pixel"]},
    "pixel-meadow": {"d":0,"c":["#94dcff","#fff8e7","#24324a","#49b84a","#ffcf40","#e64545","#2e9e44"],"df":"pixelify-sans","bf":"nunito","s":["square","thick","pixel","pixel","pixel"]},
    "steam-works": {"d":0,"c":["#e6cfa8","#f6e7c8","#3a2414","#b8732f","#d9b44a","#b5332e","#5f8f3e"],"df":"bowlby-one-sc","bf":"rubik","s":["soft","double","pressed3d","metal","3d"]},
    "detective-desk": {"d":0,"c":["#e8e0d0","#fbf7ee","#2a2a2a","#8b0000","#c8b89a","#b3001b","#4f7d4f"],"df":"special-elite","bf":"atkinson-hyperlegible","s":["square","thin","flat","paper","stamp"]},
    "desert-dunes": {"d":0,"c":["#f6d79b","#fbecc9","#3b2a1a","#d9692b","#3e4a8a","#c0392b","#4f9a59"],"df":"russo-one","bf":"rubik","s":["soft","thick","pressed3d","metal","stamp"]},
    "toybox-craft": {"d":0,"c":["#ffe7a8","#e9c99a","#2e2014","#2f6fe4","#ff4f4f","#e53935","#2fae4f"],"df":"permanent-marker","bf":"patrick-hand","s":["soft","dashed","sticker","cardboard","stamp"]},
    "storybook-cozy": {"d":0,"c":["#ffe9d6","#fff8ef","#4a3428","#e88a6f","#9cbf8f","#d9534f","#6aa56a"],"df":"londrina-solid","bf":"mali","s":["round","thin","pill","parchment","plain"]},
    "tropical-island": {"d":0,"c":["#8ff0e0","#fffaf0","#134e5e","#ff9f1c","#06d6a0","#ff6b6b","#52b788"],"df":"boogaloo","bf":"baloo-2","s":["round","thick","sticker","paper","3d"]},
    "sports-arena": {"d":0,"c":["#d8f0d0","#ffffff","#14213d","#d62839","#1d4ed8","#d62839","#2a9d4b"],"df":"passion-one","bf":"rubik","s":["square","thick","flat","metal","stamp"]},
    "rainbow-racer": {"d":0,"c":["#fef6ff","#ffffff","#2b1d4f","#ff2d9a","#00c2ff","#ff3b3b","#2ecf5f"],"df":"bungee","bf":"baloo-2","s":["pill","thick","pill","glass","gradient"]},
    "garden-party": {"d":0,"c":["#c9f2b5","#fffdf3","#2f3b1f","#ff6fae","#ffd23f","#e5484d","#4caf50"],"df":"spicy-rice","bf":"sniglet","s":["round","thick","jelly","paper","outline"]},
    "barnyard": {"d":0,"c":["#bfe6ff","#fff4dc","#3d2210","#d83a2f","#f6c445","#c62828","#4caf50"],"df":"chewy","bf":"fredoka","s":["soft","thick","plank","wood","outline"]},
    "volcano-rock": {"d":0,"c":["#ffcf9e","#f2e6dc","#2b1a14","#ff5a1f","#ffc531","#d7263d","#3fa34d"],"df":"knewave","bf":"nunito","s":["soft","thick","pressed3d","stone","3d"]},
    "chalkboard-class": {"d":0,"c":["#f3e9d2","#2f5d46","#f7f7ef","#f6d55c","#8fd3ff","#ff8a80","#b7f08a"],"df":"gloria-hallelujah","bf":"patrick-hand","s":["square","thick","flat","chalkboard","chalk"]},
    "robot-lab": {"d":0,"c":["#e3f4f4","#ffffff","#0f2e3a","#00a6a6","#ffb703","#ef476f","#06d6a0"],"df":"vt323","bf":"rubik","s":["soft","thin","flat","metal","pixel"]},
    "summer-camp": {"d":0,"c":["#cfe8b0","#fbf3dc","#2c2a1a","#e76f24","#2a7a4b","#c0392b","#2a7a4b"],"df":"black-ops-one","bf":"nunito","s":["soft","thick","sticker","cardboard","stamp"]},
    "retro-diner": {"d":0,"c":["#bff0e3","#ffffff","#2b2b2b","#e63946","#3cc9b5","#e63946","#2a9d8f"],"df":"pacifico","bf":"varela-round","s":["pill","thick","pill","metal","3d"]},
    "slime-lab": {"d":0,"c":["#d9ffb8","#f6fff0","#2a1e47","#7ed321","#9b5de5","#ff4d6d","#43c95a"],"df":"modak","bf":"grandstander","s":["pill","thick","jelly","glass","outline"]},
    "groovy-disco": {"d":0,"c":["#ffd27a","#fff1d6","#4a2511","#e8590c","#9bb33b","#c92a2a","#5c940d"],"df":"shrikhand","bf":"grandstander","s":["pill","thick","pill","candy","3d"]}
  },
  "keys": {
    "KeyA": ["keyboard_a","A"],
    "KeyB": ["keyboard_b","B"],
    "KeyC": ["keyboard_c","C"],
    "KeyD": ["keyboard_d","D"],
    "KeyE": ["keyboard_e","E"],
    "KeyF": ["keyboard_f","F"],
    "KeyG": ["keyboard_g","G"],
    "KeyH": ["keyboard_h","H"],
    "KeyI": ["keyboard_i","I"],
    "KeyJ": ["keyboard_j","J"],
    "KeyK": ["keyboard_k","K"],
    "KeyL": ["keyboard_l","L"],
    "KeyM": ["keyboard_m","M"],
    "KeyN": ["keyboard_n","N"],
    "KeyO": ["keyboard_o","O"],
    "KeyP": ["keyboard_p","P"],
    "KeyQ": ["keyboard_q","Q"],
    "KeyR": ["keyboard_r","R"],
    "KeyS": ["keyboard_s","S"],
    "KeyT": ["keyboard_t","T"],
    "KeyU": ["keyboard_u","U"],
    "KeyV": ["keyboard_v","V"],
    "KeyW": ["keyboard_w","W"],
    "KeyX": ["keyboard_x","X"],
    "KeyY": ["keyboard_y","Y"],
    "KeyZ": ["keyboard_z","Z"],
    "Digit0": ["keyboard_0","0"],
    "Digit1": ["keyboard_1","1"],
    "Digit2": ["keyboard_2","2"],
    "Digit3": ["keyboard_3","3"],
    "Digit4": ["keyboard_4","4"],
    "Digit5": ["keyboard_5","5"],
    "Digit6": ["keyboard_6","6"],
    "Digit7": ["keyboard_7","7"],
    "Digit8": ["keyboard_8","8"],
    "Digit9": ["keyboard_9","9"],
    "ArrowUp": ["keyboard_arrow_up","↑"],
    "ArrowDown": ["keyboard_arrow_down","↓"],
    "ArrowLeft": ["keyboard_arrow_left","←"],
    "ArrowRight": ["keyboard_arrow_right","→"],
    "Space": ["keyboard_space","Space"],
    "ShiftLeft": ["keyboard_shift","Shift"],
    "ShiftRight": ["keyboard_shift","Shift"],
    "ControlLeft": ["keyboard_ctrl","Ctrl"],
    "ControlRight": ["keyboard_ctrl","Ctrl"],
    "AltLeft": ["keyboard_alt","Alt"],
    "AltRight": ["keyboard_alt","Alt"],
    "Enter": ["keyboard_enter","Enter"],
    "NumpadEnter": ["keyboard_enter","Enter"],
    "Escape": ["keyboard_escape","Esc"],
    "Tab": ["keyboard_tab","Tab"],
    "Backspace": ["keyboard_backspace","Back"],
    "Comma": ["keyboard_comma",","],
    "Period": ["keyboard_period","."],
    "Slash": ["keyboard_slash_forward","/"],
    "Backslash": ["keyboard_slash_back","\\"],
    "Minus": ["keyboard_minus","-"],
    "Equal": ["keyboard_equals","="],
    "BracketLeft": ["keyboard_bracket_open","["],
    "BracketRight": ["keyboard_bracket_close","]"],
    "Semicolon": ["keyboard_semicolon",";"],
    "Quote": ["keyboard_apostrophe","'"],
    "Backquote": ["keyboard_tilde","~"],
    "group:arrows": ["keyboard_arrows_all","Arrows"],
    "group:arrows-horizontal": ["keyboard_arrows_horizontal","Left/Right"],
    "group:arrows-vertical": ["keyboard_arrows_vertical","Up/Down"],
    "Mouse0": ["mouse_left","Click"],
    "Mouse1": ["mouse_scroll","Middle"],
    "Mouse2": ["mouse_right","Right click"],
    "mouse:move": ["mouse_move","Move"],
    "mouse:scroll": ["mouse_scroll_vertical","Scroll"],
    "mouse:any": ["mouse","Mouse"],
    "touch:tap": ["touch_tap","Tap"],
    "touch:double-tap": ["touch_tap_double","Double tap"],
    "touch:hold": ["touch_tap_hold","Hold"],
    "touch:point": ["touch_finger_one","Touch"],
    "touch:swipe-left": ["touch_swipe_left","Swipe left"],
    "touch:swipe-right": ["touch_swipe_right","Swipe right"],
    "touch:swipe-up": ["touch_swipe_up","Swipe up"],
    "touch:swipe-down": ["touch_swipe_down","Swipe down"],
    "touch:swipe-horizontal": ["touch_swipe_horizontal","Swipe"],
    "touch:swipe-vertical": ["touch_swipe_vertical","Swipe"],
    "touch:drag": ["touch_swipe_move","Drag"],
    "touch:two-fingers": ["touch_two","Two fingers"],
    "touch:pinch-out": ["touch_zoom_in","Spread"],
    "touch:pinch-in": ["touch_zoom_out","Pinch"],
    "touch:rotate-left": ["touch_rotate_left","Turn"],
    "touch:rotate-right": ["touch_rotate_right","Turn"],
    "gamepad:button": ["generic_button_circle","Button"],
    "gamepad:button-square": ["generic_button_square","Button"],
    "gamepad:press": ["generic_button","Press"],
    "gamepad:trigger": ["generic_button_trigger_a","Trigger"],
    "gamepad:stick": ["generic_stick","Stick"],
    "gamepad:stick-left": ["generic_stick_left","Stick left"],
    "gamepad:stick-right": ["generic_stick_right","Stick right"],
    "gamepad:stick-up": ["generic_stick_up","Stick up"],
    "gamepad:stick-down": ["generic_stick_down","Stick down"],
    "gamepad:stick-horizontal": ["generic_stick_horizontal","Stick"],
    "gamepad:stick-vertical": ["generic_stick_vertical","Stick"],
    "gamepad:stick-press": ["generic_stick_press","Press stick"],
    "gamepad:joystick": ["generic_joystick","Joystick"],
    "gamepad:dpad": ["xbox_dpad","D-pad"],
    "gamepad:dpad-up": ["xbox_dpad_up","D-pad up"],
    "gamepad:dpad-down": ["xbox_dpad_down","D-pad down"],
    "gamepad:dpad-left": ["xbox_dpad_left","D-pad left"],
    "gamepad:dpad-right": ["xbox_dpad_right","D-pad right"],
    "gamepad:dpad-horizontal": ["xbox_dpad_horizontal","D-pad"],
    "gamepad:dpad-vertical": ["xbox_dpad_vertical","D-pad"]
  }
  };
  // END CATALOG

  const DEFAULT_SKIN = "sunny-day";
  // Layout picks (the planner chooses per game); the first of each is the classic layout.
  const LAYOUTS = {
    hud: ["corners", "bar", "bottom", "stack", "minimal"],
    lives: ["hearts", "pips", "bar", "count"],
    title: ["card", "poster", "ribbon", "split"],
    pause: ["top-right", "top-left", "bottom-right"],
  };
  const TEXT = {
    play: "Play", howTo: "How to play", ok: "OK", paused: "Paused", resume: "Resume",
    restart: "Restart", settings: "Settings", sound: "Sound", music: "Music",
    graphics: "Graphics", auto: "Auto", low: "Low", medium: "Medium", high: "High",
    done: "Done", gameOver: "Game over", win: "You win!", again: "Play again", next: "Next",
    best: "Best", newBest: "New best!", pause: "Pause", lives: "Lives", time: "Time",
    score: "Score",
  };
  const RADIUS = { round: [22, 14], soft: [12, 9], square: [0, 0], pill: [28, 999] };
  const BORDER = { thick: ["4px", "solid"], thin: ["2px", "solid"], none: ["0px", "solid"],
    double: ["6px", "double"], dashed: ["3px", "dashed"] };
  const TO_MOUSE = { "touch:tap": "Mouse0", "touch:double-tap": "Mouse0", "touch:hold": "Mouse0",
    "touch:point": "Mouse0", "touch:two-fingers": "Mouse2", "touch:pinch-in": "mouse:scroll",
    "touch:pinch-out": "mouse:scroll" };
  const TO_TOUCH = { Mouse0: "touch:tap", Mouse1: "touch:two-fingers", Mouse2: "touch:hold",
    "mouse:move": "touch:drag", "mouse:scroll": "touch:pinch-out", "mouse:any": "touch:tap" };
  const SHAPES = { dot: 0, star: 1, spark: 2, confetti: 3, ring: 4 };
  const POOL = 320;
  const EASE = {
    linear: function (t) { return t; },
    in: function (t) { return t * t; },
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    outBack: function (t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    outBounce: function (t) {
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
      if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
      t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
    },
    outElastic: function (t) {
      return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
    },
  };

  const S = {
    ctx: null, renderer: null, root: null, layers: null, skinId: null, palette: null, dark: false,
    fonts: { display: "system-ui, sans-serif", body: "system-ui, sans-serif" }, families: [],
    fontsReady: null, fontsDone: false, fontWaiters: [], started: false, screen: null, frozen: false,
    lastRestartAt: 0, tickerFn: null, autoLevel: null, perfTime: 0, perfFrames: 0, perfSlow: 0,
    tickerStopped: false, ticks: 0, lastFrameAt: 0, restarts: null, pauseEnabled: true,
    titleWaiters: [], hud: null, pops: null, banner: null, best: 0, tweens: [], shake: null,
    hitStop: 0, slow: 0, slowScale: 1, particles: null, fxCanvas: null, listeners: [],
    origOnUpdate: null, origOffUpdate: null, gated: null, snapScore: false, docks: {},
  };


  // ---------- small helpers ----------
  function noop() {}
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(value, fallback) {
    const n = Number(value);
    return value == null || value === "" || !isFinite(n) ? fallback : n;
  }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function make(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = String(text);
    return node;
  }
  function remove(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }
  function listen(target, name, fn, options) {
    target.addEventListener(name, fn, options);
    S.listeners.push(function () { target.removeEventListener(name, fn, options); });
  }
  function base() { return String(KIT.libraryBase || "").replace(/\/+$/, ""); }
  function smoke() { return Boolean(window.__DIY_BOOT_SMOKE__); }
  function media(query) {
    try { return Boolean(window.matchMedia && window.matchMedia(query).matches); } catch (_e) { return false; }
  }
  function isTouch() { return media("(pointer: coarse)"); }
  function reducedMotion() { return media("(prefers-reduced-motion: reduce)"); }
  function emit(type, detail) {
    try {
      const payload = { type: type };
      Object.keys(detail || {}).forEach(function (key) { payload[key] = detail[key]; });
      window.dispatchEvent(new CustomEvent("diy:ui", { detail: payload }));
    } catch (_e) {}
  }
  function colorString(value, fallback) {
    if (typeof value === "number" && isFinite(value)) {
      return "#" + (0x1000000 + (value & 0xffffff)).toString(16).slice(1);
    }
    if (typeof value === "string" && value) {
      return S.palette && S.palette[value] ? S.palette[value] : value;
    }
    return fallback;
  }
  function rgb(hex) {
    const h = String(hex || "").replace("#", "");
    const full = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : h;
    const n = parseInt(full.slice(0, 6), 16);
    return isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
  }
  function hex(c) {
    return "#" + c.map(function (v) { return (0x100 + Math.round(clamp(v, 0, 255))).toString(16).slice(1); }).join("");
  }
  function mix(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
  }
  function rgba(color, alpha) { const c = rgb(color); return "rgba(" + c.join(",") + "," + alpha + ")"; }
  function luminance(color) {
    const c = rgb(color).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function readable(on, options) {
    return options.reduce(function (best, color) { return contrast(on, color) > contrast(on, best) ? color : best; });
  }

  // ---------- fonts ----------
  const fontLoads = {};
  function fontStack(id) {
    const font = CATALOG.fonts[id];
    return font ? "'" + font.f + "', " + font.b : "system-ui, sans-serif";
  }
  function addFaceRule(family, src, weight) {
    const style = make("style");
    style.textContent = "@font-face{font-family:'" + family + "';src:" + src +
      ";font-weight:" + weight + ";font-display:swap;}";
    document.head.appendChild(style);
  }
  function loadFont(id) {
    if (fontLoads[id]) return fontLoads[id];
    const font = CATALOG.fonts[id];
    if (!font) return Promise.resolve(false);
    fontLoads[id] = Promise.all(font.files.map(function (file) {
      const src = "url(" + base() + "/" + file[0] + ") format('woff2')";
      try {
        if (typeof FontFace === "function" && document.fonts && document.fonts.add) {
          const face = new FontFace(font.f, src, { weight: file[1], style: "normal", display: "swap" });
          document.fonts.add(face);
          return face.load().then(function () { return true; }, function () { return false; });
        }
        addFaceRule(font.f, src, file[1]);
      } catch (_e) {}
      return Promise.resolve(false);
    })).then(function (results) {
      const ok = results.every(Boolean);
      if (ok) refreshTexts();
      return ok;
    });
    return fontLoads[id];
  }
  function loadSkinFonts(ids) {
    const loads = ids.map(loadFont);
    // Fonts never hold the game up: "ready" fires on load or after 3 s with system fonts.
    S.fontsReady = Promise.race([
      Promise.all(loads).then(function (results) { return results.every(Boolean); }),
      new Promise(function (resolve) { setTimeout(function () { resolve(false); }, 3000); }),
    ]);
    const ready = S.fontsReady;
    S.fontsDone = false;
    ready.then(function () {
      if (ready !== S.fontsReady) return;
      S.fontsDone = true;
      const waiters = S.fontWaiters.slice();
      waiters.forEach(function (fn) { try { fn(S.fonts); } catch (_e) {} });
    });
  }
  function usesKitFont(family) {
    const text = Array.isArray(family) ? family.join(",") : String(family || "");
    return S.families.some(function (name) { return text.indexOf(name) >= 0; });
  }
  // Pixi caches text textures by style: a tiny letter-spacing change redraws them in the new font.
  function refreshTexts() {
    const ctx = S.ctx;
    if (!ctx || S.renderer !== "pixi" || !ctx.stage) return;
    const PIXI = ctx.PIXI || window.PIXI;
    try {
      if (PIXI && PIXI.CanvasTextMetrics && PIXI.CanvasTextMetrics.clearMetrics) PIXI.CanvasTextMetrics.clearMetrics();
    } catch (_e) {}
    const stack = [ctx.stage];
    let seen = 0;
    while (stack.length && seen < 5000) {
      const node = stack.pop();
      seen += 1;
      if (!node) continue;
      try {
        if (node.style && typeof node.text === "string" && usesKitFont(node.style.fontFamily)) {
          const spacing = Number(node.style.letterSpacing) || 0;
          const even = Math.round(spacing * 100) / 100;
          node.style.letterSpacing = spacing === even ? even + 0.001 : even;
        }
      } catch (_e) {}
      if (Array.isArray(node.children)) for (let i = 0; i < node.children.length; i += 1) stack.push(node.children[i]);
    }
  }

  // ---------- skin ----------
  function skinVars(skin, display, body) {
    const c = skin.c;
    const p = { bg: c[0], surface: c[1], ink: c[2], primary: c[3], accent: c[4], danger: c[5], good: c[6] };
    const darkest = [p.ink, p.bg, p.surface].reduce(function (a, b) { return luminance(a) < luminance(b) ? a : b; });
    const radius = RADIUS[skin.s[0]] || RADIUS.round;
    const border = BORDER[skin.s[1]] || BORDER.thick;
    const thin = skin.s[1] === "thin" || skin.s[1] === "none";
    const pops = skin.d ? p.primary : "#ffffff";
    return {
      p: p,
      vars: {
        "--ui-bg": p.bg, "--ui-surface": p.surface, "--ui-ink": p.ink, "--ui-primary": p.primary,
        "--ui-accent": p.accent, "--ui-danger": p.danger, "--ui-good": p.good,
        "--ui-on-primary": readable(p.primary, [p.ink, p.surface, "#ffffff", "#141414"]),
        "--ui-on-accent": readable(p.accent, [p.ink, p.surface, "#ffffff", "#141414"]),
        "--ui-on-danger": readable(p.danger, ["#ffffff", "#141414"]),
        "--ui-primary-dark": mix(p.primary, "#000000", 0.32),
        "--ui-primary-light": mix(p.primary, "#ffffff", 0.28),
        "--ui-primary-soft": rgba(p.primary, 0.35),
        "--ui-surface-2": mix(p.surface, p.ink, skin.d ? 0.12 : 0.07),
        "--ui-surface-dark": mix(p.surface, "#000000", 0.25),
        // Solid like every panel (games' own styles use it too): see-through panels were hard to read.
        "--ui-surface-glass": p.surface,
        "--ui-row": rgba(p.ink, 0.07),
        "--ui-edge": thin ? mix(p.ink, p.surface, 0.45) : p.ink,
        "--ui-edge-strong": darkest,
        "--ui-edge-shadow": mix(skin.s[3] === "wood" ? p.surface : darkest, "#000000", 0.25),
        "--ui-shadow": rgba(darkest, 0.35),
        "--ui-dots": rgba(p.ink, 0.12),
        "--ui-backdrop": skin.d ? "rgba(4,4,12,0.6)" : rgba(darkest, 0.42),
        "--ui-backdrop-light": skin.d ? "rgba(4,4,12,0.35)" : rgba(darkest, 0.18),
        "--ui-pop-fill": pops, "--ui-pop-edge": darkest,
        "--ui-radius": radius[0] + "px", "--ui-radius-sm": Math.min(radius[1], 999) + "px",
        "--ui-border-w": border[0], "--ui-border-style": border[1],
        "--ui-display": fontStack(display), "--ui-body": fontStack(body),
      },
    };
  }
  function applySkin(id, options) {
    options = options || {};
    const known = Object.prototype.hasOwnProperty.call(CATALOG.skins, id);
    const skinId = known ? id : (S.skinId || DEFAULT_SKIN);
    if (id != null && !known) {
      try { console.warn("[ui] unknown skin \"" + id + "\"; using " + skinId); } catch (_e) {}
    }
    const skin = CATALOG.skins[skinId] || { d: 0, c: ["#8fd8ff", "#ffffff", "#1d2b53", "#ffc83d", "#ff6f59", "#ef3e4a", "#2fbf71"], df: "", bf: "", s: ["round", "thick", "pressed3d", "paper", "outline"] };
    const display = CATALOG.fonts[options.display] ? options.display : skin.df;
    const body = CATALOG.fonts[options.body] ? options.body : skin.bf;
    const built = skinVars(skin, display, body);
    const rootStyle = document.documentElement.style;
    Object.keys(built.vars).forEach(function (key) { rootStyle.setProperty(key, built.vars[key]); });
    S.skinId = skinId;
    S.palette = built.p;
    S.dark = Boolean(skin.d);
    S.fonts = { display: built.vars["--ui-display"], body: built.vars["--ui-body"] };
    S.families = [display, body].filter(function (fid) { return CATALOG.fonts[fid]; })
      .map(function (fid) { return CATALOG.fonts[fid].f; });
    const root = ensureRoot();
    root.setAttribute("data-skin", skinId);
    root.setAttribute("data-dark", String(S.dark));
    root.setAttribute("data-corners", skin.s[0]);
    root.setAttribute("data-button", skin.s[2]);
    root.setAttribute("data-panel", skin.s[3]);
    root.setAttribute("data-title", skin.s[4]);
    Object.keys(LAYOUTS).forEach(function (part) {
      const choices = LAYOUTS[part];
      const asked = options[part];
      const kept = S.layout && S.layout[part];
      S.layout = S.layout || {};
      S.layout[part] = choices.indexOf(asked) >= 0 ? asked : (kept || choices[0]);
      root.setAttribute(part === "title" ? "data-titlecard" : "data-" + part, S.layout[part]);
    });
    document.documentElement.setAttribute("data-ui-skin", skinId);
    loadSkinFonts([display, body].filter(Boolean));
    emit("skin", { skin: skinId });
    return info();
  }
  function info() {
    return { id: S.skinId, dark: S.dark, colors: Object.assign({}, S.palette), fonts: Object.assign({}, S.fonts) };
  }
  function ensureSkin() { if (!S.skinId) applySkin(null); }

  // ---------- DOM root ----------
  const CSS = `
.diy-ui{position:fixed;inset:0;z-index:9000;pointer-events:none;font-family:var(--ui-body);color:var(--ui-ink);-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
.diy-ui *,.diy-ui *::before,.diy-ui *::after{box-sizing:border-box}
.diy-ui [hidden]{display:none!important}
:where(.diy-ui) :where(button){font:inherit;color:inherit;margin:0}
body.diy-ui-modal #vibe3-controls{visibility:hidden}
.diy-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.diy-hud{position:absolute;z-index:2;top:calc(8px + env(safe-area-inset-top));left:calc(8px + env(safe-area-inset-left));right:calc(8px + env(safe-area-inset-right));display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.diy-hud-col{display:flex;flex-direction:column;gap:6px;align-items:flex-start;min-width:0}
.diy-hud-col.center{align-items:center;flex:1 1 auto}
.diy-hud-col.right{align-items:flex-end}
.diy-hud-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.diy-chip{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:4px 12px;background:var(--ui-surface);color:var(--ui-ink);border:var(--ui-border-w) var(--ui-border-style) var(--ui-edge);border-radius:var(--ui-radius-sm);box-shadow:0 3px 0 var(--ui-shadow);font-family:var(--ui-display);font-size:20px;line-height:1;white-space:nowrap;max-width:46vw;overflow:hidden;text-overflow:ellipsis}
.diy-ui[data-panel=neon] .diy-chip{background:var(--ui-surface-glass);border-color:var(--ui-primary);box-shadow:0 0 12px var(--ui-primary-soft)}
.diy-ui[data-panel=pixel] .diy-chip{border-radius:0}
.diy-score{flex-direction:column;align-items:flex-start;gap:2px;font-size:clamp(26px,7vmin,40px);padding:4px 14px;transition:transform .08s ease-out;transform-origin:left center}
.diy-score b{font-weight:normal;font-variant-numeric:tabular-nums}
.diy-score small{font:600 13px/1 var(--ui-body);opacity:.8}
.diy-score.bump{transform:scale(1.14)}
.diy-combo{background:var(--ui-accent);color:var(--ui-on-accent);font-size:22px;transition:transform .08s ease-out}
.diy-combo.bump{transform:scale(1.25) rotate(-6deg)}
.diy-timer{justify-content:center;min-width:76px;font-size:clamp(22px,6vmin,30px);font-variant-numeric:tabular-nums}
.diy-timer.urgent{background:var(--ui-danger);color:var(--ui-on-danger);animation:diy-throb .5s ease-in-out infinite alternate}
.diy-lives{display:flex;gap:2px;align-items:center;font-family:var(--ui-display);font-size:22px;color:var(--ui-pop-fill);text-shadow:0 2px 0 var(--ui-pop-edge)}
.diy-heart{width:clamp(24px,6.5vmin,32px);height:clamp(24px,6.5vmin,32px);display:block;filter:drop-shadow(0 2px 0 var(--ui-shadow))}
.diy-heart path{fill:var(--ui-danger);stroke:var(--ui-pop-edge);stroke-width:2.2}
.diy-heart.empty path{fill:var(--ui-surface-glass);opacity:.75}
.diy-heart.lost{animation:diy-lose .45s ease-out}
.diy-heart.gain{animation:diy-gain .4s ease-out}
.diy-bar{position:relative;width:clamp(110px,32vw,200px);height:20px;min-height:20px;padding:0;overflow:hidden;font-size:12px}
.diy-bar i{position:absolute;left:0;top:0;bottom:0;width:calc(var(--v,1) * 100%);background:var(--bar,var(--ui-good));transition:width .2s ease-out}
.diy-bar span{position:relative;padding:0 8px;font:700 12px/20px var(--ui-body);color:var(--ui-ink)}
.diy-text{font-size:18px}
.diy-btn.diy-pause{pointer-events:auto;width:46px;height:46px;min-height:0;padding:0;display:grid;place-items:center;border-radius:50%}
.diy-ui[data-corners=square] .diy-btn.diy-pause{border-radius:0}
.diy-pause span{display:flex;gap:6px}
.diy-pause span::before,.diy-pause span::after{content:"";width:7px;height:18px;border-radius:2px;background:currentColor}
.diy-pops{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:3}
.diy-pop{position:absolute;left:0;top:0;transform:translate(-50%,-50%);font-family:var(--ui-display);white-space:nowrap;line-height:1;color:var(--pop,var(--ui-pop-fill));-webkit-text-stroke:.07em var(--ui-pop-edge);paint-order:stroke fill;text-shadow:0 .08em 0 var(--ui-pop-edge),0 .14em .18em rgba(0,0,0,.35);will-change:transform,opacity;opacity:0}
.diy-pop.small{font-size:clamp(20px,5.2vmin,32px)}
.diy-pop.big{font-size:clamp(34px,10vmin,66px);color:var(--pop,var(--ui-primary))}
.diy-pop.go-small{animation:diy-float .85s ease-out forwards}
.diy-pop.go-big{animation:diy-popbig 1.25s ease-out forwards}
.diy-pop svg{position:absolute;left:50%;top:50%;width:3.4em;height:3.4em;margin:-1.7em 0 0 -1.7em;z-index:-1;fill:var(--burst,var(--ui-accent));opacity:.55;animation:diy-spin 1.25s linear forwards}
.diy-banner{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);font-family:var(--ui-display);font-size:clamp(36px,11vmin,84px);line-height:1.05;text-align:center;white-space:nowrap;max-width:94vw;color:var(--ui-primary);-webkit-text-stroke:.07em var(--ui-pop-edge);paint-order:stroke fill;text-shadow:0 .07em 0 var(--ui-pop-edge),0 .14em .24em rgba(0,0,0,.4);animation:diy-banner 1.9s ease forwards}
.diy-flash{position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;background:#fff}
.diy-dock{position:absolute;z-index:5;display:flex;gap:8px;pointer-events:none}
.diy-dock>*{pointer-events:auto}
.diy-dock.top-left{top:calc(64px + env(safe-area-inset-top));left:calc(8px + env(safe-area-inset-left))}
.diy-dock.top-right{top:calc(64px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right))}
.diy-dock.bottom-left{bottom:calc(var(--diy-bottom,12px) + env(safe-area-inset-bottom));left:calc(8px + env(safe-area-inset-left))}
.diy-dock.bottom-right{bottom:calc(var(--diy-bottom,12px) + env(safe-area-inset-bottom));right:calc(8px + env(safe-area-inset-right))}
.diy-dock.bottom{bottom:calc(var(--diy-bottom,12px) + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%)}
.diy-screen{position:absolute;inset:0;z-index:6;display:grid;place-items:center;padding:16px 16px calc(16px + env(safe-area-inset-bottom));background:var(--ui-backdrop);pointer-events:auto;overflow:auto;animation:diy-fade .2s ease-out}
.diy-screen.title{background:var(--ui-backdrop-light);cursor:pointer}
.diy-card{position:relative;display:flex;flex-direction:column;align-items:stretch;gap:12px;width:min(92vw,460px);max-height:100%;overflow:auto;padding:clamp(16px,4.5vmin,28px);text-align:center;color:var(--ui-ink);background:var(--ui-surface);border:var(--ui-border-w) var(--ui-border-style) var(--ui-edge);border-radius:var(--ui-radius);box-shadow:0 8px 0 var(--ui-edge-shadow),0 18px 40px rgba(0,0,0,.35);animation:diy-rise .38s cubic-bezier(.2,1.4,.4,1);cursor:default}
.diy-card h1,.diy-card h2{margin:0;font-family:var(--ui-display);font-weight:normal;line-height:1.02;overflow-wrap:anywhere}
.diy-card h1{font-size:clamp(38px,12vmin,76px)}
.diy-card h2{font-size:clamp(30px,9vmin,52px)}
.diy-tt{color:var(--ui-primary)}
.diy-ui[data-title=outline] .diy-tt{-webkit-text-stroke:.07em var(--ui-edge-strong);paint-order:stroke fill;text-shadow:0 .07em 0 var(--ui-edge-strong),0 .14em .2em var(--ui-shadow)}
.diy-ui[data-title=gradient] .diy-tt{background:linear-gradient(180deg,var(--ui-accent) 0%,var(--ui-primary) 72%);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:.035em var(--ui-edge-strong);filter:drop-shadow(0 .06em 0 var(--ui-edge-strong))}
.diy-ui[data-title=glow] .diy-tt{text-shadow:0 0 .12em var(--ui-primary),0 0 .45em var(--ui-primary),0 .05em 0 rgba(0,0,0,.4)}
.diy-ui[data-title="3d"] .diy-tt{-webkit-text-stroke:.025em var(--ui-edge-strong);text-shadow:.02em .02em 0 var(--ui-edge-strong),.04em .04em 0 var(--ui-edge-strong),.06em .06em 0 var(--ui-edge-strong),.08em .08em 0 var(--ui-edge-strong),.1em .12em .2em var(--ui-shadow)}
.diy-ui[data-title=stamp] .diy-tt{display:inline-block;align-self:center;text-transform:uppercase;letter-spacing:.04em;border:.07em solid currentColor;border-radius:.14em;padding:.06em .28em;transform:rotate(-4deg)}
.diy-ui[data-title=pixel] .diy-tt{text-shadow:.06em 0 0 var(--ui-edge-strong),-.06em 0 0 var(--ui-edge-strong),0 .06em 0 var(--ui-edge-strong),0 -.06em 0 var(--ui-edge-strong),.12em .12em 0 var(--ui-edge-strong)}
.diy-ui[data-title=plain] .diy-tt{color:var(--ui-ink)}
.diy-ui[data-title=chalk] .diy-tt{color:var(--ui-ink);text-shadow:0 0 2px rgba(255,255,255,.55),0 0 1px rgba(255,255,255,.8);letter-spacing:.02em}
.diy-title-art{display:block;max-width:60%;max-height:22vh;margin:0 auto;object-fit:contain;animation:diy-bob 2.4s ease-in-out infinite}
.diy-ui:not([data-title=stamp]) .diy-card h1.diy-tt{animation:diy-bob 3s ease-in-out infinite}
.diy-sub{margin:0;font-size:clamp(16px,4.3vmin,20px);line-height:1.3;opacity:.92}
.diy-credits{margin:0;font-size:12px;line-height:1.35;opacity:.78;overflow-wrap:anywhere;-webkit-user-select:text;user-select:text}
.diy-btn{pointer-events:auto;min-height:50px;padding:10px 22px;font-family:var(--ui-display);font-size:clamp(20px,5.6vmin,28px);letter-spacing:.02em;line-height:1.05;color:var(--ui-on-primary);background:var(--ui-primary);border:var(--ui-border-w) solid var(--ui-edge);border-radius:var(--ui-radius-sm);cursor:pointer;touch-action:manipulation;transition:transform .08s ease-out,box-shadow .08s ease-out,filter .12s}
.diy-btn.alt{background:var(--ui-surface-2);color:var(--ui-ink);font-size:clamp(17px,4.7vmin,22px);min-height:46px}
.diy-btn:hover{filter:brightness(1.06)}
.diy-btn:focus-visible{outline:3px solid var(--ui-accent);outline-offset:3px}
.diy-btns{display:grid;gap:10px}
.diy-btns.two{grid-template-columns:1fr 1fr}
.diy-ui[data-button=pressed3d] .diy-btn{box-shadow:0 6px 0 var(--ui-primary-dark),0 8px 14px var(--ui-shadow)}
.diy-ui[data-button=pressed3d] .diy-btn.alt{box-shadow:0 5px 0 var(--ui-surface-dark),0 7px 12px var(--ui-shadow)}
.diy-ui[data-button=pressed3d] .diy-btn:active{transform:translateY(4px);box-shadow:0 2px 0 var(--ui-primary-dark)}
.diy-ui[data-button=pill] .diy-btn{border-radius:999px;background:linear-gradient(180deg,var(--ui-primary-light),var(--ui-primary));box-shadow:0 5px 14px var(--ui-shadow)}
.diy-ui[data-button=pill] .diy-btn.alt{background:var(--ui-surface-2)}
.diy-ui[data-button=pill] .diy-btn:active{transform:scale(.96)}
.diy-ui[data-button=jelly] .diy-btn{border-radius:999px;box-shadow:inset 0 -6px 0 rgba(0,0,0,.14),inset 0 6px 0 rgba(255,255,255,.35),0 6px 0 var(--ui-primary-dark)}
.diy-ui[data-button=jelly] .diy-btn.alt{box-shadow:inset 0 -5px 0 rgba(0,0,0,.08),inset 0 5px 0 rgba(255,255,255,.4),0 5px 0 var(--ui-surface-dark)}
.diy-ui[data-button=jelly] .diy-btn:active{transform:scale(1.06,.9)}
.diy-ui[data-button=plank] .diy-btn{border-radius:6px;background-image:radial-gradient(circle at 12px 50%,rgba(0,0,0,.35) 2.5px,transparent 3.5px),radial-gradient(circle at calc(100% - 12px) 50%,rgba(0,0,0,.35) 2.5px,transparent 3.5px),repeating-linear-gradient(0deg,rgba(0,0,0,.08) 0 3px,transparent 3px 12px);box-shadow:0 5px 0 var(--ui-primary-dark);transform:rotate(-1deg)}
.diy-ui[data-button=plank] .diy-btn.alt{box-shadow:0 4px 0 var(--ui-surface-dark);transform:rotate(1deg)}
.diy-ui[data-button=plank] .diy-btn:active{transform:translateY(3px) rotate(0)}
.diy-ui[data-button=pixel] .diy-btn{border:0;border-radius:0;margin:4px;box-shadow:0 -4px 0 0 var(--ui-edge-strong),0 4px 0 0 var(--ui-edge-strong),-4px 0 0 0 var(--ui-edge-strong),4px 0 0 0 var(--ui-edge-strong),0 8px 0 0 var(--ui-primary-dark)}
.diy-ui[data-button=pixel] .diy-btn:active{transform:translateY(4px)}
.diy-ui[data-button=glow] .diy-btn{background:transparent;color:var(--ui-primary);border:2px solid var(--ui-primary);box-shadow:0 0 14px var(--ui-primary-soft),inset 0 0 14px var(--ui-primary-soft);text-shadow:0 0 8px var(--ui-primary)}
.diy-ui[data-button=glow] .diy-btn.alt{color:var(--ui-ink);border-color:var(--ui-accent);box-shadow:0 0 10px var(--ui-primary-soft);text-shadow:none}
.diy-ui[data-button=glow] .diy-btn:active{transform:scale(.97)}
.diy-ui[data-button=sticker] .diy-btn{border:4px solid #fff;box-shadow:0 0 0 2px var(--ui-edge-strong),0 6px 0 2px var(--ui-shadow);transform:rotate(-2deg)}
.diy-ui[data-button=sticker] .diy-btn.alt{transform:rotate(1.5deg)}
.diy-ui[data-button=sticker] .diy-btn:active{transform:rotate(0) scale(.97)}
.diy-ui[data-button=flat] .diy-btn:active{filter:brightness(.92);transform:translateY(1px)}
.diy-ui[data-panel=paper] .diy-card{background:linear-gradient(170deg,var(--ui-surface),var(--ui-surface-2));box-shadow:0 8px 0 var(--ui-edge-shadow),0 18px 40px rgba(0,0,0,.3),inset 0 0 0 4px rgba(255,255,255,.45)}
.diy-ui[data-panel=wood] .diy-card{background-color:var(--ui-surface);background-image:repeating-linear-gradient(0deg,transparent 0 30px,rgba(0,0,0,.08) 30px 32px),repeating-linear-gradient(90deg,rgba(0,0,0,.025) 0 2px,transparent 2px 9px),linear-gradient(180deg,rgba(255,255,255,.25),rgba(0,0,0,.08))}
.diy-ui[data-panel=metal] .diy-card,.diy-ui[data-panel=stone] .diy-card{background-color:var(--ui-surface)}
.diy-ui[data-panel=metal] .diy-card{background-image:radial-gradient(circle at 14px 14px,var(--ui-edge) 3px,transparent 4px),radial-gradient(circle at calc(100% - 14px) 14px,var(--ui-edge) 3px,transparent 4px),radial-gradient(circle at 14px calc(100% - 14px),var(--ui-edge) 3px,transparent 4px),radial-gradient(circle at calc(100% - 14px) calc(100% - 14px),var(--ui-edge) 3px,transparent 4px),linear-gradient(180deg,var(--ui-surface),var(--ui-surface-2))}
.diy-ui[data-panel=stone] .diy-card{background-image:radial-gradient(circle at 18% 28%,rgba(0,0,0,.05) 0 22px,transparent 23px),radial-gradient(circle at 78% 66%,rgba(0,0,0,.05) 0 30px,transparent 31px),radial-gradient(circle at 56% 12%,rgba(255,255,255,.3) 0 16px,transparent 17px),linear-gradient(180deg,var(--ui-surface),var(--ui-surface-2))}
.diy-ui[data-panel=candy] .diy-card{background-image:repeating-linear-gradient(-45deg,var(--ui-surface) 0 18px,var(--ui-surface-2) 18px 36px)}
.diy-ui[data-panel=ice] .diy-card{background:linear-gradient(160deg,#ffffff,var(--ui-surface));box-shadow:0 0 0 3px var(--ui-accent),0 14px 34px var(--ui-shadow),inset 0 2px 14px rgba(255,255,255,.85)}
.diy-ui[data-panel=chalkboard] .diy-card{background-color:var(--ui-surface);background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1.6px);background-size:7px 7px;border:10px solid #9a6a3a;border-radius:6px;box-shadow:inset 0 0 30px rgba(0,0,0,.35),0 10px 26px rgba(0,0,0,.35)}
.diy-ui[data-panel=glass] .diy-card{background:var(--ui-surface);box-shadow:0 12px 34px var(--ui-shadow),inset 0 1px 0 rgba(255,255,255,.5)}
.diy-ui[data-panel=parchment] .diy-card{background:radial-gradient(ellipse at center,var(--ui-surface) 55%,var(--ui-surface-2) 100%);box-shadow:0 10px 26px var(--ui-shadow),inset 0 0 28px rgba(120,80,20,.2)}
.diy-ui[data-panel=cardboard] .diy-card{background-color:var(--ui-surface);background-image:repeating-linear-gradient(90deg,rgba(0,0,0,.035) 0 2px,transparent 2px 6px)}
.diy-ui[data-panel=cardboard] .diy-card::before{content:"";position:absolute;top:0;left:50%;width:96px;height:20px;margin-left:-48px;background:rgba(255,255,255,.55);transform:rotate(-3deg);box-shadow:0 1px 2px rgba(0,0,0,.15)}
.diy-ui[data-panel=neon] .diy-card{background:var(--ui-surface-glass);border-color:var(--ui-primary);box-shadow:0 0 0 1px var(--ui-primary),0 0 24px var(--ui-primary-soft),inset 0 0 24px var(--ui-primary-soft)}
.diy-ui[data-panel=pixel] .diy-card{border:0;border-radius:0;margin:6px;box-shadow:0 -6px 0 0 var(--ui-edge-strong),0 6px 0 0 var(--ui-edge-strong),-6px 0 0 0 var(--ui-edge-strong),6px 0 0 0 var(--ui-edge-strong),0 12px 0 0 var(--ui-shadow)}
.diy-ui[data-panel=comic] .diy-card{background-color:var(--ui-surface);background-image:radial-gradient(var(--ui-dots) 1.2px,transparent 1.7px);background-size:9px 9px;box-shadow:8px 8px 0 var(--ui-edge-strong)}
.diy-howto{display:grid;gap:8px;text-align:left}
.diy-howto-row{display:flex;align-items:center;gap:12px;min-height:44px;padding:4px 10px;border-radius:min(var(--ui-radius-sm),14px);background:var(--ui-row)}
.diy-keys{display:flex;flex-wrap:wrap;gap:4px;flex:0 0 auto;max-width:62%}
.diy-key{display:inline-grid;place-items:center;width:40px;height:40px;color:var(--ui-ink)}
.diy-key svg{width:100%;height:100%;display:block}
.diy-key svg .k{fill:currentColor}
.diy-key svg .h{fill:var(--ui-primary)}
.diy-key.text{width:auto;min-width:38px;height:34px;margin:3px 0;padding:0 8px;border:2px solid currentColor;border-radius:8px;box-shadow:0 3px 0 currentColor;font:700 15px/1 var(--ui-body)}
.diy-touchbtn{width:40px;height:40px;background:var(--ui-surface);border:2px solid var(--ui-edge);border-radius:var(--ui-radius-sm);box-shadow:0 3px 0 var(--ui-shadow)}
.diy-touchbtn::before{content:"";width:0;height:0;border:8px solid transparent}
.diy-touchbtn[data-dir=left]::before{border-right:12px solid var(--ui-ink);border-left:0}
.diy-touchbtn[data-dir=right]::before{border-left:12px solid var(--ui-ink);border-right:0}
.diy-touchbtn[data-dir=up]::before{border-bottom:12px solid var(--ui-ink);border-top:0}
.diy-touchbtn[data-dir=down]::before{border-top:12px solid var(--ui-ink);border-bottom:0}
.diy-row-text{font-size:17px;line-height:1.2;overflow-wrap:anywhere}
.diy-stars{display:flex;justify-content:center;gap:6px}
.diy-star{width:clamp(40px,12vmin,58px);height:clamp(40px,12vmin,58px)}
.diy-star path{fill:var(--ui-row);stroke:var(--ui-edge-strong);stroke-width:2.5;stroke-linejoin:round}
.diy-star.on path{fill:#ffcf33}
.diy-star.on{animation:diy-gain .5s ease-out both}
.diy-result{font-family:var(--ui-display);font-size:clamp(48px,15vmin,88px);line-height:1;color:var(--ui-primary);font-variant-numeric:tabular-nums}
.diy-best{margin:0;font-size:16px}
.diy-best em{display:inline-block;margin-right:8px;padding:3px 10px;border-radius:10px;background:var(--ui-accent);color:var(--ui-on-accent);font:normal 18px/1.1 var(--ui-display);animation:diy-throb .6s ease-in-out infinite alternate}
.diy-set-row{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;font-size:17px}
.diy-set-row input[type=range]{width:55%;height:32px;accent-color:var(--ui-primary);pointer-events:auto}
.diy-seg{display:flex;border:2px solid var(--ui-edge);border-radius:var(--ui-radius-sm);overflow:hidden}
.diy-seg button{min-height:42px;min-width:44px;padding:4px 8px;border:0;border-left:2px solid var(--ui-row);background:var(--ui-surface);color:var(--ui-ink);font:600 14px var(--ui-body);cursor:pointer;pointer-events:auto}
.diy-seg button:first-child{border-left:0}
.diy-seg button[aria-pressed=true]{background:var(--ui-primary);color:var(--ui-on-primary)}
@media (max-width:420px){.diy-set-row{flex-wrap:wrap}.diy-set-row input[type=range]{width:100%}.diy-seg{width:100%}.diy-seg button{flex:1}}
@media (max-height:480px){.diy-screen{padding:8px}.diy-card{gap:7px;padding:12px 16px;width:min(92vw,560px)}.diy-card h1{font-size:clamp(28px,11vmin,52px)}.diy-card h2{font-size:clamp(24px,9vmin,40px)}.diy-howto{grid-template-columns:1fr 1fr;gap:6px}.diy-howto-row{min-height:34px;padding:2px 8px}.diy-key{width:30px;height:30px}.diy-btn{min-height:42px;padding:6px 18px}.diy-title-art{max-height:16vh}}
.diy-ui[data-hud=bar] .diy-hud{top:0;left:0;right:0;padding:6px calc(10px + env(safe-area-inset-right)) 6px calc(10px + env(safe-area-inset-left));padding-top:calc(6px + env(safe-area-inset-top));align-items:center;background:var(--ui-surface);border-bottom:var(--ui-border-w) var(--ui-border-style) var(--ui-edge);box-shadow:0 3px 0 var(--ui-shadow)}
.diy-ui[data-hud=bar] .diy-hud-col{flex-direction:row;align-items:center}
.diy-ui[data-hud=bar] .diy-hud .diy-chip{background:transparent;border:0;box-shadow:none;min-height:30px}
.diy-ui[data-hud=bar] .diy-hud .diy-bar{background:var(--ui-row)}
.diy-ui[data-hud=stack] .diy-hud{flex-direction:column;align-items:flex-start;right:auto}
.diy-ui[data-hud=stack] .diy-hud-col.center,.diy-ui[data-hud=stack] .diy-hud-col.right{align-items:flex-start;flex:0 0 auto}
.diy-ui[data-hud=stack] .diy-pause{position:fixed;top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right))}
.diy-ui[data-hud=minimal] .diy-hud-col.left{position:absolute;left:50%;transform:translateX(-50%);align-items:center}
.diy-ui[data-hud=minimal] .diy-score{align-items:center;font-size:clamp(34px,9vmin,56px);transform-origin:center}
@media (pointer:fine){
.diy-ui[data-hud=bottom] .diy-hud{top:auto;bottom:calc(8px + env(safe-area-inset-bottom));align-items:flex-end}
.diy-ui[data-hud=bottom] .diy-hud-col{flex-direction:column-reverse}
.diy-ui[data-pause=bottom-right] .diy-pause{position:fixed;right:calc(8px + env(safe-area-inset-right));bottom:calc(8px + env(safe-area-inset-bottom))}
}
.diy-lives.diy-bar{color:var(--ui-ink);text-shadow:none}
.diy-pip{width:clamp(16px,4.5vmin,22px);height:clamp(16px,4.5vmin,22px)}
.diy-ui[data-titlecard=poster] .diy-screen.title .diy-card{width:min(96vw,760px)}
.diy-ui[data-titlecard=poster] .diy-screen.title .diy-card h1{font-size:clamp(48px,16vmin,120px)}
.diy-ui[data-titlecard=poster] .diy-screen.title .diy-howto{justify-content:center;grid-template-columns:repeat(auto-fit,minmax(150px,max-content))}
.diy-ui[data-titlecard=ribbon] .diy-screen.title{padding-left:0;padding-right:0}
.diy-ui[data-titlecard=ribbon] .diy-screen.title .diy-card{width:100%;max-width:none;border-radius:0;border-left:0;border-right:0;padding-left:max(16px,8vw);padding-right:max(16px,8vw)}
@media (min-width:720px){
.diy-ui[data-titlecard=split] .diy-screen.title .diy-card{display:grid;grid-template-columns:1fr 1fr;grid-auto-flow:row dense;column-gap:28px;align-items:center;width:min(94vw,880px);text-align:left}
.diy-ui[data-titlecard=split] .diy-screen.title .diy-card>h1,.diy-ui[data-titlecard=split] .diy-screen.title .diy-card>.diy-title-art,.diy-ui[data-titlecard=split] .diy-screen.title .diy-card>.diy-sub{grid-column:1}
.diy-ui[data-titlecard=split] .diy-screen.title .diy-card>.diy-howto,.diy-ui[data-titlecard=split] .diy-screen.title .diy-card>.diy-btns{grid-column:2}
}
.diy-toolbar{position:absolute;z-index:2;left:50%;bottom:calc(10px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:8px;max-width:calc(100vw - 20px);overflow-x:auto;padding:6px;pointer-events:auto;background:var(--ui-surface);border:var(--ui-border-w) var(--ui-border-style) var(--ui-edge);border-radius:var(--ui-radius);box-shadow:0 4px 0 var(--ui-shadow)}
.diy-toolbar .diy-tool{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:64px;min-height:58px;padding:6px 10px;font-size:clamp(14px,3.6vmin,17px);background:var(--ui-row);color:var(--ui-ink);box-shadow:none}
.diy-toolbar .diy-tool[aria-pressed=true]{background:var(--ui-primary);color:var(--ui-on-primary);box-shadow:0 0 0 3px var(--ui-accent)}
.diy-toolbar .diy-tool:disabled{opacity:.45;cursor:not-allowed}
.diy-tool-icon{font-size:clamp(20px,5vmin,26px);line-height:1}
.diy-tool-icon img{width:clamp(22px,6vmin,30px);height:clamp(22px,6vmin,30px);object-fit:contain;display:block}
.diy-tool small{font:700 11px/1 var(--ui-body);opacity:.85}
.diy-tool kbd{position:absolute;top:3px;left:5px;font:700 10px/1 var(--ui-body);opacity:.6}
@media (pointer:coarse){.diy-tool kbd{display:none}}
.diy-ui[data-hud=bottom] .diy-toolbar{bottom:auto;top:calc(64px + env(safe-area-inset-top))}
@keyframes diy-fade{from{opacity:0}to{opacity:1}}
@keyframes diy-rise{from{transform:translateY(26px) scale(.94);opacity:0}to{transform:none;opacity:1}}
@keyframes diy-bob{50%{transform:translateY(-5px) rotate(-1deg)}}
@keyframes diy-throb{to{transform:scale(1.08)}}
@keyframes diy-lose{0%{transform:scale(1.5) rotate(-20deg)}60%{transform:scale(.8) rotate(10deg)}100%{transform:none}}
@keyframes diy-gain{0%{transform:scale(0)}70%{transform:scale(1.3)}100%{transform:none}}
@keyframes diy-spin{from{transform:rotate(0) scale(.6)}to{transform:rotate(80deg) scale(1.3);opacity:0}}
@keyframes diy-float{0%{transform:translate(-50%,-30%) scale(.5);opacity:0}15%{transform:translate(-50%,-70%) scale(1.15);opacity:1}100%{transform:translate(-50%,-190%) scale(1);opacity:0}}
@keyframes diy-popbig{0%{transform:translate(-50%,-50%) rotate(var(--r,0deg)) scale(0);opacity:1}14%{transform:translate(-50%,-50%) rotate(var(--r,0deg)) scale(1.28)}26%{transform:translate(-50%,-50%) rotate(var(--r,0deg)) scale(.94)}38%{transform:translate(-50%,-50%) rotate(var(--r,0deg)) scale(1.04)}50%{transform:translate(-50%,-50%) rotate(var(--r,0deg)) scale(1);opacity:1}100%{transform:translate(-50%,-85%) rotate(var(--r,0deg)) scale(.96);opacity:0}}
@keyframes diy-banner{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}12%{transform:translate(-50%,-50%) scale(1.12);opacity:1}22%{transform:translate(-50%,-50%) scale(1)}80%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{transform:translate(-50%,-50%) scale(1.06);opacity:0}}
@media (prefers-reduced-motion:reduce){.diy-card h1.diy-tt,.diy-title-art,.diy-timer.urgent,.diy-best em{animation:none}}
`;

  function ensureRoot() {
    if (S.root && S.root.parentNode) return S.root;
    if (!document.getElementById("diy-ui-style")) {
      const style = make("style");
      style.id = "diy-ui-style";
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }
    const root = make("div", "diy-ui");
    root.id = "diy-ui";
    const fx = make("canvas", "diy-fx");
    fx.setAttribute("aria-hidden", "true");
    const hud = make("div", "diy-hud");
    hud.setAttribute("aria-live", "polite");
    const left = make("div", "diy-hud-col left");
    const center = make("div", "diy-hud-col center");
    const right = make("div", "diy-hud-col right");
    hud.appendChild(left);
    hud.appendChild(center);
    hud.appendChild(right);
    const pops = make("div", "diy-pops");
    const flash = make("div", "diy-flash");
    root.appendChild(fx);
    root.appendChild(hud);
    root.appendChild(pops);
    root.appendChild(flash);
    (document.body || document.documentElement).appendChild(root);
    S.root = root;
    S.fxCanvas = fx;
    S.layers = { hud: hud, left: left, center: center, right: right, pops: pops, flash: flash };
    S.hud = null;
    S.pops = null;
    S.docks = {};
    if (!S.skinId) applySkin(null);
    return root;
  }

  // ---------- keycaps ----------
  const svgLoads = {};
  function parseSvg(text) {
    if (!text || typeof DOMParser !== "function") return null;
    try {
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const svg = doc.documentElement;
      if (!svg || String(svg.nodeName).toLowerCase() !== "svg") return null;
      if (svg.querySelector("script,foreignObject,image,use")) return null;
      const all = [svg].concat(Array.prototype.slice.call(svg.querySelectorAll("*")));
      all.forEach(function (node) {
        Array.prototype.slice.call(node.attributes).forEach(function (attr) {
          if (/^on/i.test(attr.name) || /href$/i.test(attr.name)) node.removeAttribute(attr.name);
        });
      });
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("focusable", "false");
      return document.importNode(svg, true);
    } catch (_e) {
      return null;
    }
  }
  function loadSvg(path) {
    if (!svgLoads[path]) {
      svgLoads[path] = (typeof window.fetch === "function"
        ? Promise.resolve().then(function () { return window.fetch(base() + "/" + path); })
          .then(function (res) { return res && res.ok ? res.text() : null; })
          .then(parseSvg)
        : Promise.resolve(null)).catch(function () { return null; });
    }
    return svgLoads[path];
  }
  function keyLabel(code) {
    const text = String(code || "");
    if (/^Key[A-Z]$/.test(text)) return text.slice(3);
    if (/^Digit[0-9]$/.test(text)) return text.slice(5);
    if (/^Numpad[0-9]$/.test(text)) return text.slice(6);
    return text.replace(/^(Arrow|Numpad)/, "");
  }
  function keycap(id) {
    const arrow = /^touchdir:(left|right|up|down)$/.exec(String(id || ""));
    if (arrow) {
      const pad = make("span", "diy-key diy-touchbtn");
      pad.setAttribute("data-dir", arrow[1]);
      pad.setAttribute("data-key", String(id));
      pad.setAttribute("aria-hidden", "true");
      return pad;
    }
    const entry = CATALOG.keys[id];
    const label = entry ? entry[1] : keyLabel(id);
    const node = make("span", "diy-key text", label);
    node.setAttribute("role", "img");
    node.setAttribute("aria-label", label);
    node.setAttribute("data-key", String(id));
    if (!entry) return node;
    loadSvg("keycaps/" + entry[0] + ".svg").then(function (svg) {
      if (!svg) return;
      node.textContent = "";
      node.classList.remove("text");
      node.appendChild(svg.cloneNode(true));
    });
    return node;
  }
  // Phones show touch pictures and computers show keys and mouse, whichever the game named.
  function deviceIcon(id) {
    const touch = isTouch();
    const text = String(id || "");
    if (touch) {
      if (TO_TOUCH[text]) return TO_TOUCH[text];
      return /^(touch|gamepad):/.test(text) ? text : "touch:tap";
    }
    if (TO_MOUSE[text]) return TO_MOUSE[text];
    return /^touch:(swipe|drag|rotate)/.test(text) ? "mouse:move" : text;
  }
  // On phones a row shows the touch button itself: an arrow button or a tap.
  function touchKey(control) {
    let dir = null;
    try {
      const ui = window.VibeGameUI;
      dir = ui && typeof ui.direction === "function" ? ui.direction(control) : null;
    } catch (_e) {}
    return dir ? "touchdir:" + dir : "touch:tap";
  }
  function controlRows(options) {
    options = options || {};
    const ctx = S.ctx;
    const input = ctx && ctx.input;
    let controls = [];
    try { controls = input && typeof input.getControls === "function" ? input.getControls() : []; } catch (_e) {}
    const touch = isTouch();
    const rows = [];
    controls.forEach(function (control) {
      if (!control || !control.label) return;
      if (options.skipRestart && control.id === "restart") return;
      const keys = touch ? [touchKey(control)] : (control.keys || []).slice(0, 3);
      if (keys.length) rows.push({ text: control.label, keys: keys });
    });
    (Array.isArray(options.tips) ? options.tips : []).forEach(function (tip) {
      if (!tip || !tip.text) return;
      const icons = [].concat(tip.icon || tip.keys || []).map(deviceIcon)
        .filter(function (icon, i, all) { return icon && all.indexOf(icon) === i; }).slice(0, 3);
      rows.push({ text: tip.text, keys: icons });
    });
    return rows;
  }
  function howToList(rows) {
    const list = make("div", "diy-howto");
    rows.forEach(function (row) {
      const line = make("div", "diy-howto-row");
      const keys = make("span", "diy-keys");
      row.keys.forEach(function (key) { keys.appendChild(keycap(key)); });
      line.appendChild(keys);
      line.appendChild(make("span", "diy-row-text", row.text));
      list.appendChild(line);
    });
    return list;
  }

  // ---------- screens ----------
  function gameStatus() {
    const ctx = S.ctx;
    return (ctx && ctx.status) || window.__VIBE_2D_STATUS__ || window.__VIBE_3D_STATUS__ || null;
  }
  // The boot smoke watches the game itself, so kit screens never pause it there.
  function freeze() {
    if (smoke()) return;
    S.frozen = true;
    S.ticks = Math.min(S.ticks, 2);
  }
  function unfreeze() {
    S.frozen = false;
    if (S.tickerStopped && S.ctx && S.ctx.app && S.ctx.app.ticker) {
      S.tickerStopped = false;
      try { S.ctx.app.ticker.start(); } catch (_e) {}
    }
  }
  function card(kind) {
    ensureSkin();
    const node = make("div", "diy-card " + kind);
    node.addEventListener("click", function (event) { event.stopPropagation(); });
    return node;
  }
  // The sound kit (sfx.js) plays the default UI sounds from these "diy:ui" events.
  function button(text, onClick, alt) {
    const node = make("button", "diy-btn" + (alt ? " alt" : ""), text);
    node.type = "button";
    node.addEventListener("click", function (event) {
      emit("button", { label: text });
      if (onClick) onClick(event);
    });
    return node;
  }
  function heading(tag, text) { return make(tag, "diy-tt", text); }
  function showScreen(name, body, options) {
    options = options || {};
    ensureRoot();
    hideScreen(true);
    const screen = make("div", "diy-screen " + name);
    screen.setAttribute("role", "dialog");
    screen.setAttribute("aria-modal", "true");
    screen.setAttribute("data-screen", name);
    screen.appendChild(body);
    if (options.onBackdrop) screen.addEventListener("click", options.onBackdrop);
    S.root.appendChild(screen);
    S.screen = { name: name, el: screen, confirm: options.confirm || null, cancel: options.cancel || null, back: options.back || null };
    if (document.body) document.body.classList.add("diy-ui-modal");
    freeze();
    const primary = body.querySelector(".diy-btn:not(.alt)") || body.querySelector("button");
    if (primary && primary.focus && !isTouch()) {
      try { primary.focus({ preventScroll: true }); } catch (_e) {}
    }
    emit("open", { screen: name });
    return screen;
  }
  function hideScreen(silent) {
    const current = S.screen;
    if (!current) return null;
    S.screen = null;
    remove(current.el);
    if (document.body) document.body.classList.remove("diy-ui-modal");
    const active = document.activeElement;
    if (active && current.el.contains && current.el.contains(active) && active.blur) active.blur();
    if (!silent) {
      unfreeze();
      emit("close", { screen: current.name });
    }
    return current.name;
  }
  function startGame() {
    const wasTitle = S.screen && (S.screen.name === "title" || S.screen.name === "howto");
    if (S.screen && wasTitle) hideScreen(false);
    else if (!S.screen) unfreeze();
    const first = !S.started;
    S.started = true;
    if (S.pauseEnabled) showPauseButton();
    const waiters = S.titleWaiters.splice(0);
    waiters.forEach(function (fn) { try { fn(); } catch (_e) {} });
    try { if (KIT.audio && typeof KIT.audio.unlock === "function") KIT.audio.unlock(); } catch (_e) {}
    if (first) emit("start", {});
    return Boolean(wasTitle || waiters.length);
  }
  // CC-BY credits the models kit collects (DIYKit.credits, plain strings); read when a card opens.
  function creditsLine() {
    const list = Array.isArray(KIT.credits) ? KIT.credits : [];
    const lines = list.filter(function (text, i) {
      return typeof text === "string" && text.trim() && list.indexOf(text) === i;
    }).slice(0, 12);
    if (!lines.length) return null;
    const node = make("p", "diy-credits");
    lines.forEach(function (text, i) {
      if (i) node.appendChild(make("br"));
      node.appendChild(document.createTextNode(text.trim()));
    });
    return node;
  }
  // Title art: a picture URL, or the asset-library key of an AI-made picture (it may arrive late).
  function titleArt(options, body) {
    const assets = S.ctx && S.ctx.assets;
    function lookup() {
      if (options.image) return String(options.image);
      try {
        return options.art && assets && typeof assets.pictureUrl === "function" ? assets.pictureUrl(options.art) : null;
      } catch (_e) {
        return null;
      }
    }
    if (!options.image && !options.art) return;
    const art = make("img", "diy-title-art");
    art.alt = "";
    art.hidden = true;
    body.insertBefore(art, body.firstChild);
    function show() {
      const url = lookup();
      if (!url) return false;
      art.src = url;
      art.hidden = false;
      return true;
    }
    if (!show()) setTimeout(show, 1500);
  }
  function title(options) {
    options = options || {};
    ensureSkin();
    if (options.pause === false) S.pauseEnabled = false;
    return new Promise(function (resolve) {
      S.titleWaiters.push(function () {
        if (typeof options.onStart === "function") {
          try { options.onStart(); } catch (error) { setTimeout(function () { throw error; }, 0); }
        }
        resolve();
      });
      // After the first start a rebuilt game goes straight back into play.
      if ((S.started && !options.always) || smoke()) {
        startGame();
        return;
      }
      const body = card("title");
      body.appendChild(heading("h1", options.title || document.title || ""));
      titleArt(options, body);
      if (options.subtitle) body.appendChild(make("p", "diy-sub", options.subtitle));
      const rowOptions = { skipRestart: true, tips: options.tips };
      let rows = controlRows(rowOptions);
      let list = howToList(rows);
      list.hidden = !rows.length;
      body.appendChild(list);
      const actions = make("div", "diy-btns");
      actions.appendChild(button(options.button || TEXT.play, function () { startGame(); }));
      body.appendChild(actions);
      const credits = creditsLine();
      if (credits) body.appendChild(credits);
      const begin = function () { startGame(); };
      const screen = showScreen("title", body, { confirm: begin, onBackdrop: begin });
      // Controls declared after title() still reach the card.
      [0, 300].forEach(function (delay) {
        setTimeout(function () {
          if (!S.screen || S.screen.el !== screen) return;
          const next = controlRows(rowOptions);
          if (JSON.stringify(next) === JSON.stringify(rows)) return;
          rows = next;
          const fresh = howToList(rows);
          fresh.hidden = !rows.length;
          body.replaceChild(fresh, list);
          list = fresh;
        }, delay);
      });
    });
  }
  function howToPlay(options) {
    options = options || {};
    ensureSkin();
    return new Promise(function (resolve) {
      if (smoke()) { resolve(); return; }
      const from = S.screen ? S.screen.name : null;
      const body = card("howto");
      body.appendChild(heading("h2", options.title || TEXT.howTo));
      const rows = controlRows({ tips: options.tips });
      if (rows.length) body.appendChild(howToList(rows));
      if (options.text) body.appendChild(make("p", "diy-sub", options.text));
      function close() {
        if (from === "pause") pause(true);
        else if (from === "title" || !S.started) startGame();
        else hideScreen(false);
        resolve();
      }
      const actions = make("div", "diy-btns");
      actions.appendChild(button(TEXT.ok, close));
      body.appendChild(actions);
      showScreen("howto", body, { confirm: close, cancel: close });
    });
  }
  function pause(force) {
    if (!force && (!S.started || S.screen || smoke())) return false;
    const body = card("pause");
    body.appendChild(heading("h2", TEXT.paused));
    const actions = make("div", "diy-btns");
    actions.appendChild(button(TEXT.resume, resume));
    const restart = button(TEXT.restart, null, true);
    restart.setAttribute("data-action", "restart");
    actions.appendChild(restart);
    actions.appendChild(button(TEXT.howTo, function () { howToPlay(); }, true));
    actions.appendChild(button(TEXT.settings, function () { settings(); }, true));
    body.appendChild(actions);
    const credits = creditsLine();
    if (credits) body.appendChild(credits);
    showScreen("pause", body, { confirm: resume, cancel: resume });
    if (!force) emit("pause", {});
    return true;
  }
  function resume() {
    if (!S.screen || ["pause", "settings", "howto"].indexOf(S.screen.name) < 0) return false;
    hideScreen(false);
    emit("resume", {});
    return true;
  }
  // 3D games carry look3d's DIYKit.graphics; 2D games have no graphics choice to make.
  function lookGraphics() {
    const graphics = KIT.graphics;
    return graphics && typeof graphics.get === "function" && typeof graphics.set === "function" ? graphics : null;
  }
  function settings() {
    const from = S.screen ? S.screen.name : null;
    const body = card("settings");
    body.appendChild(heading("h2", TEXT.settings));
    const audio = KIT.audio && typeof KIT.audio.get === "function" ? KIT.audio : null;
    function slider(label, key) {
      const row = make("label", "diy-set-row");
      row.appendChild(make("span", "", label));
      const input = make("input");
      input.type = "range";
      input.min = "0";
      input.max = "100";
      let level = 1;
      try { level = num(audio.get()[key], 1); } catch (_e) {}
      input.value = String(Math.round(level * 100));
      input.addEventListener("input", function () {
        const update = {};
        update[key] = num(input.value, 100) / 100;
        try { audio.set(update); } catch (_e) {}
      });
      row.appendChild(input);
      body.appendChild(row);
    }
    if (audio) {
      slider(TEXT.sound, "sfx");
      if (KIT.music) slider(TEXT.music, "music");
    }
    const graphics = lookGraphics();
    if (graphics) {
      const row = make("div", "diy-set-row");
      row.appendChild(make("span", "", TEXT.graphics));
      const seg = make("div", "diy-seg");
      seg.setAttribute("role", "group");
      seg.setAttribute("aria-label", TEXT.graphics);
      let current = "auto";
      try { current = graphics.get(); } catch (_e) {}
      const levels = Array.isArray(graphics.levels) && graphics.levels.length ? graphics.levels : ["auto", "low", "medium", "high"];
      levels.forEach(function (level) {
        const choice = make("button", "", TEXT[level] || String(level));
        choice.type = "button";
        choice.setAttribute("aria-pressed", String(current === level));
        choice.addEventListener("click", function () {
          let ok = false;
          try { ok = graphics.set(level) !== false; } catch (_e) {}
          if (!ok) return;
          emit("button", { label: choice.textContent });
          Array.prototype.forEach.call(seg.children, function (other) {
            other.setAttribute("aria-pressed", String(other === choice));
          });
        });
        seg.appendChild(choice);
      });
      row.appendChild(seg);
      body.appendChild(row);
    }
    function done() {
      if (from === "pause") pause(true);
      else hideScreen(false);
    }
    const actions = make("div", "diy-btns");
    actions.appendChild(button(TEXT.done, done));
    body.appendChild(actions);
    showScreen("settings", body, { confirm: done, cancel: done });
  }
  // How busy the kit's own effects may be: look3d's running tier in 3D, else a device guess
  // that steps down when 2D frames run slow (Fruit Dojo's quality.js).
  function graphicsLevel() {
    const graphics = lookGraphics();
    if (graphics) {
      try {
        const tier = typeof graphics.current === "function" ? graphics.current() : null;
        const choice = graphics.get();
        if (tier) return tier;
        if (choice === "low" || choice === "medium" || choice === "high") return choice;
      } catch (_e) {}
    }
    if (S.autoLevel) return S.autoLevel;
    const cores = (navigator && navigator.hardwareConcurrency) || 4;
    if (cores <= 2) return "low";
    return isTouch() || cores <= 4 ? "medium" : "high";
  }
  function watchSpeed(dt) {
    if (lookGraphics() || !S.started || S.frozen || graphicsLevel() === "low") return;
    S.perfTime += dt;
    S.perfFrames += 1;
    if (S.perfTime < 3) return;
    const slow = S.perfTime / S.perfFrames > 1 / 30;
    S.perfSlow = slow ? S.perfSlow + 1 : 0;
    S.perfTime = 0;
    S.perfFrames = 0;
    if (S.perfSlow < 2) return;
    S.perfSlow = 0;
    S.autoLevel = graphicsLevel() === "high" ? "medium" : "low";
  }
  function starIcon(on, index) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("class", "diy-star" + (on ? " on" : ""));
    svg.setAttribute("aria-hidden", "true");
    if (on) svg.style.animationDelay = (0.25 + index * 0.18) + "s";
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M24 3l6.2 13.3 14.6 1.8-10.8 10 2.8 14.4L24 35.4l-12.8 7.1L14 28.1 3.2 18.1l14.6-1.8z");
    svg.appendChild(path);
    return svg;
  }
  function endScreen(kind, options) {
    options = options || {};
    ensureSkin();
    const score = options.score == null ? null : num(options.score, 0);
    // Called again every frame by a game that keeps losing: keep the card that is up.
    if (S.screen && S.screen.name === kind && S.screen.score === score) return S.screen.el.firstChild;
    const previous = S.best;
    let best = typeof options.best === "number" ? options.best : null;
    if (score != null) S.best = Math.max(S.best, score, best || 0);
    if (best == null && score != null) best = S.best;
    const newBest = options.newBest === true || (score != null && score > previous && previous > 0 &&
      (typeof options.best !== "number" || options.best <= score));
    const body = card(kind);
    body.appendChild(heading("h2", options.title || (kind === "win" ? TEXT.win : TEXT.gameOver)));
    if (options.subtitle) body.appendChild(make("p", "diy-sub", options.subtitle));
    if (options.stars != null) {
      const stars = make("div", "diy-stars");
      const count = clamp(Math.round(num(options.stars, 0)), 0, 3);
      for (let i = 0; i < 3; i += 1) stars.appendChild(starIcon(i < count, i));
      body.appendChild(stars);
    }
    if (score != null) {
      const result = make("div", "diy-result", "0");
      result.setAttribute("aria-label", TEXT.score + " " + score);
      body.appendChild(result);
      countUp(result, score);
      const line = make("p", "diy-best");
      if (newBest) line.appendChild(make("em", "", TEXT.newBest));
      if (best != null) line.appendChild(document.createTextNode(TEXT.best + " " + best));
      body.appendChild(line);
    }
    const actions = make("div", "diy-btns" + (typeof options.next === "function" ? " two" : ""));
    const again = button(options.button || TEXT.again, function () { onRestarted(); });
    again.setAttribute("data-action", "restart");
    actions.appendChild(again);
    if (typeof options.next === "function") {
      actions.appendChild(button(TEXT.next, function () {
        hideScreen(false);
        try { options.next(); } catch (error) { setTimeout(function () { throw error; }, 0); }
      }, true));
    }
    body.appendChild(actions);
    showScreen(kind, body, { confirm: function () { again.click(); } });
    S.screen.score = score;
    if (kind === "win") {
      const size = viewSize();
      burst(size.w * 0.5, size.h * 0.3, { shape: "confetti", count: 60, speed: 1.4, client: true });
    }
    emit(kind === "win" ? "win" : "gameover", { score: score });
    return body;
  }
  function countUp(node, target) {
    const started = now();
    const duration = Math.min(900, 250 + Math.abs(target) * 4);
    function step() {
      const t = clamp((now() - started) / duration, 0, 1);
      node.textContent = String(Math.round(target * EASE.out(t)));
      if (t < 1 && node.isConnected !== false) setTimeout(step, 30);
    }
    step();
  }
  // A restart (Play again, the restart key or ctx.restart) closes end and pause screens.
  function onRestarted() {
    const current = S.screen ? S.screen.name : null;
    if (current && current !== "title" && !(current === "howto" && !S.started)) hideScreen(false);
    if (!S.screen) unfreeze();
    S.snapScore = true;
    if (S.hud && S.hud.combo) S.hud.combo.hidden = true;
    const t = now();
    if (t - (S.lastRestartAt || -1e9) > 250) emit("restart", {});
    S.lastRestartAt = t;
  }

  // ---------- HUD ----------
  function hudState() {
    ensureRoot();
    ensureSkin();
    if (!S.hud) S.hud = { score: null, value: 0, target: 0, shown: null, bump: 0, combo: null, lives: null, timer: null, bars: {}, texts: {}, clock: null };
    return S.hud;
  }
  function livesStyle() { return (S.layout && S.layout.lives) || "hearts"; }
  function heart() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const pip = livesStyle() === "pips";
    svg.setAttribute("viewBox", "0 0 32 32");
    svg.setAttribute("class", pip ? "diy-heart diy-pip" : "diy-heart");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", pip
      ? "M16 5a11 11 0 1 1 0 22a11 11 0 1 1 0-22z"
      : "M16 28s-11-7-11-15a6 6 0 0 1 11-3.4A6 6 0 0 1 27 13c0 8-11 15-11 15z");
    svg.appendChild(path);
    return svg;
  }
  function setClass(node, name, on) {
    const list = String(node.getAttribute("class") || "").split(/\s+/).filter(function (c) { return c && c !== name; });
    if (on) list.push(name);
    node.setAttribute("class", list.join(" "));
  }
  function restartAnimation(node, name) {
    setClass(node, name, false);
    void (node.getBoundingClientRect && node.getBoundingClientRect());
    setClass(node, name, true);
  }
  function scoreRow(h) {
    if (!h.scoreRow) {
      h.scoreRow = make("div", "diy-hud-row");
      S.layers.left.insertBefore(h.scoreRow, S.layers.left.firstChild);
    }
    return h.scoreRow;
  }
  const hud = {
    score: function (value, options) {
      const h = hudState();
      options = options || {};
      if (!h.score) {
        h.score = make("div", "diy-chip diy-score");
        h.score.setAttribute("aria-label", TEXT.score);
        h.scoreValue = make("b", "", "0");
        h.score.appendChild(h.scoreValue);
        h.scoreBest = make("small", "");
        h.scoreBest.hidden = true;
        h.score.appendChild(h.scoreBest);
        const row = scoreRow(h);
        row.insertBefore(h.score, row.firstChild);
      }
      h.target = num(value, 0);
      if (S.snapScore || h.shown == null || now() - S.lastFrameAt > 250) {
        S.snapScore = false;
        h.value = h.target;
        renderScore(h, false);
      }
      if (options.best != null) {
        h.scoreBest.hidden = false;
        h.scoreBest.textContent = TEXT.best + " " + num(options.best, 0);
      }
      return h.target;
    },
    lives: function (count, max) {
      const h = hudState();
      count = Math.max(0, Math.round(num(count, 0)));
      max = Math.max(count, Math.round(num(max, count)));
      if (!h.lives) {
        h.lives = make("div", "diy-lives");
        h.lives.setAttribute("role", "img");
        S.layers.right.insertBefore(h.lives, S.layers.right.firstChild);
        h.livesShown = null;
      }
      h.lives.setAttribute("aria-label", TEXT.lives + " " + count);
      if (livesStyle() === "bar") {
        if (!h.livesBar) {
          h.lives.textContent = "";
          h.lives.className = "diy-lives diy-chip diy-bar";
          h.lives.appendChild(make("i"));
          h.lives.appendChild(make("span"));
          h.livesBar = true;
        }
        const ratio = max > 0 ? count / max : 0;
        h.lives.style.setProperty("--v", String(ratio));
        h.lives.style.setProperty("--bar", ratio <= 0.34 ? "var(--ui-danger)" : "var(--ui-good)");
        if (h.livesShown != null && count !== h.livesShown) restartAnimation(h.lives, count < h.livesShown ? "lost" : "gain");
        h.livesShown = count;
        return count;
      }
      // More than five lives (or the "count" style) show as one heart and a count.
      const compact = max > 5 || livesStyle() === "count";
      if (h.livesCompact !== compact) {
        h.lives.textContent = "";
        h.livesCompact = compact;
        h.livesShown = null;
      }
      const previous = h.livesShown;
      if (compact) {
        if (!h.lives.firstChild) {
          h.lives.appendChild(heart());
          h.lives.appendChild(document.createTextNode(""));
        }
        h.lives.lastChild.nodeValue = "×" + count;
        if (previous != null && count !== previous) restartAnimation(h.lives.firstChild, count < previous ? "lost" : "gain");
      } else {
        while (h.lives.children.length > max) h.lives.removeChild(h.lives.lastChild);
        while (h.lives.children.length < max) h.lives.appendChild(heart());
        Array.prototype.forEach.call(h.lives.children, function (icon, i) {
          setClass(icon, "empty", i >= count);
          if (previous != null && i >= count && i < previous) restartAnimation(icon, "lost");
          if (previous != null && i < count && i >= previous) restartAnimation(icon, "gain");
        });
      }
      h.livesShown = count;
      return count;
    },
    timer: function (seconds, options) {
      const h = hudState();
      options = options || {};
      if (!h.timer) {
        h.timer = make("div", "diy-chip diy-timer");
        h.timer.setAttribute("role", "timer");
        h.timer.setAttribute("aria-label", TEXT.time);
        S.layers.center.appendChild(h.timer);
      }
      if (seconds == null) { h.timer.hidden = true; return null; }
      h.timer.hidden = false;
      const s = Math.max(0, num(seconds, 0));
      const whole = Math.ceil(s);
      const text = Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
      if (h.timer.textContent !== text) h.timer.textContent = text;
      const urgent = s > 0 && s <= num(options.urgent, 10);
      h.timer.classList.toggle("urgent", urgent);
      return s;
    },
    bar: function (id, value, max, options) {
      const h = hudState();
      options = options || {};
      const key = String(id || "bar");
      let bar = h.bars[key];
      if (!bar) {
        bar = make("div", "diy-chip diy-bar");
        bar.setAttribute("role", "meter");
        bar.appendChild(make("i"));
        bar.appendChild(make("span"));
        S.layers.left.appendChild(bar);
        h.bars[key] = bar;
      }
      if (value == null) { bar.hidden = true; return null; }
      bar.hidden = false;
      const top = Math.max(0.0001, num(max, 1));
      const ratio = clamp(num(value, 0) / top, 0, 1);
      bar.style.setProperty("--v", String(ratio));
      const color = options.color != null ? colorString(options.color) : (ratio <= 0.25 ? "var(--ui-danger)" : "var(--ui-good)");
      bar.style.setProperty("--bar", color);
      bar.lastChild.textContent = options.label == null ? "" : String(options.label);
      bar.setAttribute("aria-valuenow", String(num(value, 0)));
      bar.setAttribute("aria-valuemax", String(top));
      if (options.label) bar.setAttribute("aria-label", String(options.label));
      return ratio;
    },
    combo: function (count) {
      const h = hudState();
      if (!h.combo) {
        h.combo = make("div", "diy-chip diy-combo");
        h.combo.hidden = true;
        scoreRow(h).appendChild(h.combo);
      }
      const n = Math.round(num(count, 0));
      h.combo.hidden = n < 2;
      if (n >= 2 && h.combo.textContent !== "x" + n) {
        h.combo.textContent = "x" + n;
        restartAnimation(h.combo, "bump");
        setTimeout(function () { setClass(h.combo, "bump", false); }, 120);
      }
      return n;
    },
    text: function (id, value) {
      const h = hudState();
      const key = String(id || "text");
      let chip = h.texts[key];
      if (!chip) {
        chip = make("div", "diy-chip diy-text");
        S.layers.left.appendChild(chip);
        h.texts[key] = chip;
      }
      chip.hidden = value == null || value === "";
      chip.textContent = value == null ? "" : String(value);
      return chip.textContent;
    },
    hide: function () { ensureRoot(); S.layers.hud.hidden = true; },
    show: function () { ensureRoot(); S.layers.hud.hidden = false; },
    clear: function () {
      ensureRoot();
      ["left", "center"].forEach(function (key) { S.layers[key].textContent = ""; });
      Array.prototype.slice.call(S.layers.right.children).forEach(function (node) {
        if (!node.classList.contains("diy-pause")) remove(node);
      });
      S.hud = null;
    },
  };
  function renderScore(h, bump) {
    const shown = Math.round(h.value);
    if (shown === h.shown) return;
    if (bump && h.shown != null && shown > h.shown) h.bump = 0.12;
    h.shown = shown;
    h.scoreValue.textContent = String(shown);
  }
  function updateHud(dt) {
    const h = S.hud;
    if (!h || !h.score) return;
    if (h.value !== h.target) {
      const step = Math.max(1, Math.abs(h.target - h.value) * Math.min(1, dt * 10));
      h.value = h.value < h.target ? Math.min(h.target, h.value + step) : Math.max(h.target, h.value - step);
      renderScore(h, true);
    }
    if (h.bump > 0) {
      h.bump -= dt;
      h.score.classList.toggle("bump", h.bump > 0);
    }
  }
  function showPauseButton() {
    ensureRoot();
    if (smoke() || S.root.querySelector(".diy-pause")) return;
    const node = make("button", "diy-btn diy-pause");
    node.type = "button";
    node.setAttribute("aria-label", TEXT.pause);
    node.appendChild(make("span"));
    node.addEventListener("click", function (event) { event.stopPropagation(); pause(); });
    if (S.layout && S.layout.pause === "top-left") S.layers.left.insertBefore(node, S.layers.left.firstChild);
    else S.layers.right.appendChild(node);
  }

  // ---------- toolbar: the game's own choices ----------
  // ctx.ui.toolbar([{ id, label, icon, picture, cost }], { onSelect, selected }): build tools,
  // shop items, towers or spells as skinned buttons; keys 1-9 pick them; one stays lit.
  function toolbar(items, options) {
    ensureRoot();
    ensureSkin();
    options = options || {};
    if (S.toolbar) S.toolbar.remove();
    const bar = make("div", "diy-toolbar");
    bar.setAttribute("role", "toolbar");
    // Taps on the bar never reach the game under it (a builder would place there).
    ["pointerdown", "mousedown", "touchstart", "click"].forEach(function (name) {
      bar.addEventListener(name, function (event) { event.stopPropagation(); });
    });
    const buttons = {};
    let selected = null;
    let list = [];
    function notify(id) {
      if (typeof options.onSelect !== "function") return;
      try { options.onSelect(id); } catch (error) { setTimeout(function () { throw error; }, 0); }
    }
    function select(id, quiet) {
      if (!Object.prototype.hasOwnProperty.call(buttons, id) || buttons[id].disabled) return false;
      selected = id;
      Object.keys(buttons).forEach(function (key) { buttons[key].setAttribute("aria-pressed", String(key === id)); });
      if (!quiet) notify(id);
      return true;
    }
    function setItems(next) {
      bar.textContent = "";
      Object.keys(buttons).forEach(function (key) { delete buttons[key]; });
      list = (Array.isArray(next) ? next : []).filter(function (item) { return item && item.id != null; }).slice(0, 9);
      list.forEach(function (item, index) {
        const id = String(item.id);
        const node = make("button", "diy-btn diy-tool");
        node.type = "button";
        node.setAttribute("aria-pressed", "false");
        node.setAttribute("aria-label", String(item.label || id));
        node.appendChild(make("kbd", "", String(index + 1)));
        const icon = make("span", "diy-tool-icon");
        if (item.picture) {
          const img = make("img");
          img.alt = "";
          img.src = String(item.picture);
          icon.appendChild(img);
        } else {
          icon.textContent = String(item.icon || "");
        }
        if (icon.firstChild || icon.textContent) node.appendChild(icon);
        node.appendChild(make("span", "", String(item.label || id)));
        if (item.cost != null) node.appendChild(make("small", "", String(item.cost)));
        node.addEventListener("click", function (event) { event.stopPropagation(); select(id); });
        node.addEventListener("pointerdown", function (event) { event.stopPropagation(); });
        buttons[id] = node;
        bar.appendChild(node);
      });
      const keep = selected != null && buttons[selected] ? selected : (options.selected != null ? String(options.selected) : (list[0] ? String(list[0].id) : null));
      if (keep != null) select(keep, true);
    }
    function onKey(event) {
      if (S.screen || event.altKey || event.ctrlKey || event.metaKey) return;
      const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code || "");
      if (!match || !list[Number(match[1]) - 1]) return;
      select(String(list[Number(match[1]) - 1].id));
    }
    listen(window, "keydown", onKey, true);
    setItems(items);
    S.root.appendChild(bar);
    const api = {
      select: function (id) { return select(String(id)); },
      get selected() { return selected; },
      setItems: setItems,
      setDisabled: function (id, off) { const node = buttons[String(id)]; if (node) node.disabled = Boolean(off); },
      setCost: function (id, cost) {
        const node = buttons[String(id)];
        if (!node) return;
        let small = node.querySelector("small");
        if (!small) { small = make("small"); node.appendChild(small); }
        small.textContent = cost == null ? "" : String(cost);
      },
      hide: function () { bar.hidden = true; },
      show: function () { bar.hidden = false; },
      remove: function () {
        window.removeEventListener("keydown", onKey, true);
        remove(bar);
        if (S.toolbar === api) S.toolbar = null;
      },
    };
    S.toolbar = api;
    return api;
  }

  // ---------- popups and banners ----------
  function gameCanvas() {
    const ctx = S.ctx || {};
    const app = ctx.app || {};
    return app.canvas || app.view || ctx.canvas || (ctx.renderer && ctx.renderer.domElement) ||
      document.querySelector("canvas:not(.diy-fx)");
  }
  function viewSize() {
    return { w: window.innerWidth || 360, h: window.innerHeight || 640 };
  }
  function screenPoint(x, y) {
    const canvas = gameCanvas();
    const size = viewSize();
    const rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    const box = rect && rect.width ? rect : { left: 0, top: 0, width: size.w, height: size.h };
    const ctx = S.ctx || {};
    function fromCanvas(px, py) {
      const logical = S.renderer === "pixi" && ctx.size && ctx.size.width ? ctx.size.width : box.width;
      const scale = box.width / (logical || box.width || 1);
      return { x: box.left + px * scale, y: box.top + py * scale };
    }
    if (x && typeof x === "object") {
      try {
        if (typeof x.getGlobalPosition === "function") {
          const p = x.getGlobalPosition();
          return fromCanvas(p.x, p.y);
        }
        if ((x.isObject3D || x.isVector3) && ctx.camera && ctx.THREE) {
          const v = new ctx.THREE.Vector3();
          if (x.isObject3D) x.getWorldPosition(v); else v.copy(x);
          v.project(ctx.camera);
          if (v.z > 1 || v.z < -1) return null;
          return { x: box.left + (v.x + 1) / 2 * box.width, y: box.top + (1 - v.y) / 2 * box.height };
        }
        if (typeof x.x === "number" && typeof x.y === "number") return fromCanvas(x.x, x.y);
      } catch (_e) {
        return null;
      }
    }
    if (typeof x === "number" && typeof y === "number") return fromCanvas(x, y);
    return { x: box.left + box.width / 2, y: box.top + box.height * 0.4 };
  }
  function burstSvg() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "-50 -50 100 100");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    let d = "";
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      const len = i % 2 ? 36 : 50;
      d += "M" + (Math.cos(a - 0.12) * 9).toFixed(1) + " " + (Math.sin(a - 0.12) * 9).toFixed(1) +
        "L" + (Math.cos(a) * len).toFixed(1) + " " + (Math.sin(a) * len).toFixed(1) +
        "L" + (Math.cos(a + 0.12) * 9).toFixed(1) + " " + (Math.sin(a + 0.12) * 9).toFixed(1) + "Z";
    }
    path.setAttribute("d", d);
    svg.appendChild(path);
    return svg;
  }
  function popPool() {
    ensureRoot();
    if (!S.pops) {
      S.pops = { small: [], big: [], cursor: { small: 0, big: 0 } };
      [["small", 14], ["big", 5]].forEach(function (spec) {
        for (let i = 0; i < spec[1]; i += 1) {
          const node = make("div", "diy-pop " + spec[0]);
          node.setAttribute("aria-hidden", "true");
          if (spec[0] === "big") node.appendChild(burstSvg());
          node.appendChild(make("span"));
          node.hidden = true;
          S.layers.pops.appendChild(node);
          node.addEventListener("animationend", function (event) { if (event.target === node) node.hidden = true; });
          S.pops[spec[0]].push(node);
        }
      });
    }
    return S.pops;
  }
  function popup(text, x, y, options) {
    if (x && typeof x === "object" && (y == null || typeof y === "object")) { options = y; y = undefined; }
    options = options || {};
    const point = screenPoint(x, y);
    if (!point) return null;
    const pool = popPool();
    const size = options.size === "big" || options.size === "large" ? "big" : "small";
    const list = pool[size];
    const node = list[pool.cursor[size] % list.length];
    pool.cursor[size] += 1;
    const view = viewSize();
    const margin = size === "big" ? 90 : 40;
    node.style.left = clamp(point.x, margin, Math.max(margin, view.w - margin)) + "px";
    node.style.top = clamp(point.y, size === "big" ? 70 : 30, Math.max(70, view.h - 50)) + "px";
    node.lastChild.textContent = String(text == null ? "" : text);
    node.style.setProperty("--r", (size === "big" ? (Math.random() * 14 - 7).toFixed(1) : 0) + "deg");
    if (options.color != null) node.style.setProperty("--pop", colorString(options.color));
    else node.style.removeProperty("--pop");
    node.hidden = false;
    setClass(node, "go-" + size, false);
    void (node.getBoundingClientRect && node.getBoundingClientRect());
    setClass(node, "go-" + size, true);
    return node;
  }
  function banner(text, options) {
    options = options || {};
    ensureRoot();
    ensureSkin();
    remove(S.banner);
    const node = make("div", "diy-banner", text);
    node.setAttribute("role", "status");
    const seconds = num(options.seconds, 1.9);
    node.style.animationDuration = seconds + "s";
    if (options.color != null) node.style.color = colorString(options.color);
    node.addEventListener("animationend", function () { remove(node); });
    S.layers.pops.appendChild(node);
    S.banner = node;
    setTimeout(function () { remove(node); }, seconds * 1000 + 200);
    return node;
  }
  function uiButton(text, onClick, options) {
    options = options || {};
    ensureRoot();
    ensureSkin();
    const node = button(text, onClick, options.alt);
    if (options.parent && options.parent.appendChild) {
      options.parent.appendChild(node);
      return node;
    }
    const at = ["top-left", "top-right", "bottom-left", "bottom-right", "bottom"].indexOf(options.at) >= 0 ? options.at : "bottom";
    if (!S.docks[at]) {
      S.docks[at] = make("div", "diy-dock " + at);
      S.root.appendChild(S.docks[at]);
    }
    S.root.style.setProperty("--diy-bottom", isTouch() ? "84px" : "12px");
    S.docks[at].appendChild(node);
    return node;
  }

  // ---------- effects ----------
  function fxState() {
    ensureRoot();
    if (!S.particles) {
      S.particles = {
        x: new Float32Array(POOL), y: new Float32Array(POOL), vx: new Float32Array(POOL), vy: new Float32Array(POOL),
        life: new Float32Array(POOL), max: new Float32Array(POOL), size: new Float32Array(POOL),
        rot: new Float32Array(POOL), vr: new Float32Array(POOL), grav: new Float32Array(POOL),
        shape: new Uint8Array(POOL), color: new Array(POOL), alive: 0, cursor: 0, drawn: false,
      };
    }
    return S.particles;
  }
  function burst(x, y, options) {
    if (x && typeof x === "object" && (y == null || typeof y === "object")) { options = y; y = undefined; }
    options = options || {};
    const point = options.client ? { x: x, y: y } : screenPoint(x, y);
    if (!point) return 0;
    const p = fxState();
    const level = graphicsLevel();
    const scale = level === "low" ? 0.5 : level === "medium" ? 0.75 : 1;
    const count = Math.max(1, Math.round(clamp(num(options.count, 16), 1, 120) * scale));
    const view = viewSize();
    const unit = clamp(Math.min(view.w, view.h) / 600, 0.6, 1.6);
    const shape = SHAPES[options.shape] != null ? SHAPES[options.shape] : SHAPES.star;
    const colors = [].concat(options.color != null ? options.color : options.colors || [
      S.palette ? S.palette.primary : "#ffc83d", S.palette ? S.palette.accent : "#ff6f59", "#ffffff",
    ]).map(function (c) { return colorString(c, "#ffffff"); });
    const speed = num(options.speed, 1) * 320 * unit;
    const size = num(options.size, 1) * 9 * unit;
    const life = num(options.life, 0.8);
    const gravity = options.gravity != null ? num(options.gravity, 0) : (shape === SHAPES.confetti ? 900 : 0);
    for (let n = 0; n < count; n += 1) {
      const i = p.cursor;
      p.cursor = (p.cursor + 1) % POOL;
      const a = shape === SHAPES.ring ? 0 : Math.random() * Math.PI * 2;
      const sp = shape === SHAPES.ring ? 0 : speed * (0.3 + Math.random() * 0.7);
      p.x[i] = point.x;
      p.y[i] = point.y;
      p.vx[i] = Math.cos(a) * sp;
      p.vy[i] = Math.sin(a) * sp - (shape === SHAPES.confetti ? speed * 0.6 : 0);
      p.max[i] = p.life[i] = life * (0.6 + Math.random() * 0.5);
      p.size[i] = size * (0.6 + Math.random() * 0.7);
      p.rot[i] = Math.random() * Math.PI * 2;
      p.vr[i] = (Math.random() * 2 - 1) * 8;
      p.grav[i] = gravity * unit;
      p.shape[i] = shape;
      p.color[i] = colors[n % colors.length];
      if (shape === SHAPES.ring) break;
    }
    p.alive = POOL;
    return count;
  }
  function drawStar(g, r) {
    g.beginPath();
    for (let k = 0; k < 10; k += 1) {
      const rad = k % 2 ? r * 0.45 : r;
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      if (k) g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); else g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    g.closePath();
    g.fill();
  }
  function updateParticles(dt) {
    const p = S.particles;
    const canvas = S.fxCanvas;
    if (!p || !canvas || (!p.alive && !p.drawn)) return;
    const g = canvas.getContext ? canvas.getContext("2d") : null;
    const view = viewSize();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(view.w * ratio) || canvas.height !== Math.round(view.h * ratio)) {
      canvas.width = Math.round(view.w * ratio);
      canvas.height = Math.round(view.h * ratio);
    }
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
    }
    let alive = 0;
    for (let i = 0; i < POOL; i += 1) {
      if (p.life[i] <= 0) continue;
      p.life[i] -= dt;
      if (p.life[i] <= 0) continue;
      alive += 1;
      p.vx[i] *= Math.exp(-1.8 * dt);
      p.vy[i] = p.vy[i] * Math.exp(-1.8 * dt) + p.grav[i] * dt;
      p.x[i] += p.vx[i] * dt;
      p.y[i] += p.vy[i] * dt;
      p.rot[i] += p.vr[i] * dt;
      if (!g) continue;
      const t = 1 - p.life[i] / p.max[i];
      g.globalAlpha = t > 0.6 ? (1 - t) / 0.4 : 1;
      g.fillStyle = g.strokeStyle = p.color[i];
      g.setTransform(ratio, 0, 0, ratio, p.x[i] * ratio, p.y[i] * ratio);
      const r = p.size[i] * (p.shape[i] === SHAPES.ring ? 1 + t * 5 : 1 - t * 0.5);
      if (p.shape[i] === SHAPES.dot) {
        g.beginPath(); g.arc(0, 0, r * 0.6, 0, Math.PI * 2); g.fill();
      } else if (p.shape[i] === SHAPES.spark) {
        g.rotate(Math.atan2(p.vy[i], p.vx[i]));
        g.fillRect(-r * 1.6, -r * 0.18, r * 3.2, r * 0.36);
      } else if (p.shape[i] === SHAPES.confetti) {
        g.rotate(p.rot[i]);
        g.fillRect(-r * 0.6, -r * 0.35 * Math.abs(Math.cos(p.rot[i] * 1.7)), r * 1.2, r * 0.7 * Math.abs(Math.cos(p.rot[i] * 1.7)) + 0.5);
      } else if (p.shape[i] === SHAPES.ring) {
        g.lineWidth = Math.max(1, 3 * (1 - t));
        g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
      } else {
        g.rotate(p.rot[i]);
        drawStar(g, r);
      }
    }
    if (g) g.globalAlpha = 1;
    p.alive = alive;
    p.drawn = alive > 0;
  }
  function shake(intensity, seconds) {
    const amount = clamp(num(intensity, 0.5), 0, 1) * (reducedMotion() ? 0.4 : 1);
    const view = viewSize();
    const amp = amount * 16 * clamp(Math.min(view.w, view.h) / 600, 0.6, 1.4);
    const time = clamp(num(seconds, 0.35), 0.05, 2);
    if (!S.shake || amp >= S.shake.amp * (S.shake.left / S.shake.time)) {
      S.shake = { amp: amp, time: time, left: time, canvas: gameCanvas(), base: S.shake ? S.shake.base : null };
    }
    return amp;
  }
  function updateShake(dt) {
    const sh = S.shake;
    if (!sh || !sh.canvas || !sh.canvas.style) return;
    if (sh.base == null) sh.base = sh.canvas.style.transform || "";
    sh.left -= dt;
    if (sh.left <= 0) {
      sh.canvas.style.transform = sh.base;
      S.shake = null;
      return;
    }
    const k = sh.amp * (sh.left / sh.time);
    const dx = (Math.random() * 2 - 1) * k;
    const dy = (Math.random() * 2 - 1) * k;
    sh.canvas.style.transform = (sh.base ? sh.base + " " : "") + "translate(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px)";
  }
  function flash(color, alpha, seconds) {
    ensureRoot();
    const node = S.layers.flash;
    const time = clamp(num(seconds, 0.25), 0.05, 2);
    node.style.transition = "none";
    node.style.background = colorString(color, "#ffffff");
    node.style.opacity = String(clamp(num(alpha, 0.6), 0, 1) * (reducedMotion() ? 0.4 : 1));
    void (node.getBoundingClientRect && node.getBoundingClientRect());
    node.style.transition = "opacity " + time + "s ease-out";
    node.style.opacity = "0";
    return time;
  }
  function tweenKeys(target, props) {
    const keys = [];
    Object.keys(props || {}).forEach(function (name) {
      const parts = name.split(".");
      let owner = target;
      for (let i = 0; i < parts.length - 1 && owner; i += 1) owner = owner[parts[i]];
      const prop = parts[parts.length - 1];
      if (!owner) return;
      const goal = props[name];
      const value = owner[prop];
      if (value && typeof value === "object" && typeof goal === "number") {
        ["x", "y", "z"].forEach(function (axis) {
          if (typeof value[axis] === "number") keys.push({ obj: value, prop: axis, from: value[axis], to: goal });
        });
      } else if (typeof goal === "number" && isFinite(Number(value))) {
        keys.push({ obj: owner, prop: prop, from: Number(value), to: goal });
      }
    });
    return keys;
  }
  function tween(target, props, seconds, options) {
    options = options || {};
    let resolveDone = noop;
    const done = new Promise(function (resolve) { resolveDone = resolve; });
    const item = {
      target: target, props: props, keys: null, t: 0, time: Math.max(0.001, num(seconds, 0.3)),
      delay: Math.max(0, num(options.delay, 0)), ease: EASE[options.ease] || EASE.out,
      yoyo: Boolean(options.yoyo), onDone: options.onDone, resolve: resolveDone, dead: false,
    };
    if (target) S.tweens.push(item);
    else resolveDone();
    return {
      done: done,
      cancel: function () { item.dead = true; resolveDone(); },
    };
  }
  function updateTweens(dt) {
    if (!S.tweens.length) return;
    const list = S.tweens;
    S.tweens = [];
    list.forEach(function (item) {
      if (item.dead || (item.target && item.target.destroyed)) { item.resolve(); return; }
      if (item.delay > 0) { item.delay -= dt; S.tweens.push(item); return; }
      if (!item.keys) item.keys = tweenKeys(item.target, item.props);
      item.t = Math.min(item.time, item.t + dt);
      const raw = item.t / item.time;
      const k = item.ease(item.yoyo ? (raw < 0.5 ? raw * 2 : 2 - raw * 2) : raw);
      item.keys.forEach(function (key) {
        try { key.obj[key.prop] = key.from + (key.to - key.from) * k; } catch (_e) {}
      });
      if (item.t < item.time) { S.tweens.push(item); return; }
      if (typeof item.onDone === "function") {
        try { item.onDone(); } catch (error) { setTimeout(function () { throw error; }, 0); }
      }
      item.resolve();
    });
  }
  const fx = {
    shake: shake,
    flash: flash,
    burst: burst,
    tween: tween,
    hitStop: function (seconds) { S.hitStop = Math.max(S.hitStop, clamp(num(seconds, 0.08), 0, 1)); return S.hitStop; },
    slowMo: function (scale, seconds) {
      S.slowScale = clamp(num(scale, 0.3), 0.05, 1);
      S.slow = Math.max(S.slow, clamp(num(seconds, 0.6), 0, 5));
      return S.slowScale;
    },
    dt: function (dt) {
      const value = num(dt, 0);
      if (S.hitStop > 0) return 0;
      return S.slow > 0 ? value * S.slowScale : value;
    },
  };

  // ---------- frame, input and lifecycle ----------
  // Called by the Pixi ticker (with the ticker) or three's onUpdate (with dt in seconds).
  function frame(source) {
    const t = now();
    let dt = S.lastFrameAt ? (t - S.lastFrameAt) / 1000 : 1 / 60;
    if (source && typeof source.deltaMS === "number") dt = source.deltaMS / 1000;
    else if (typeof source === "number") dt = source;
    dt = clamp(dt, 0, 0.1);
    S.lastFrameAt = t;
    S.ticks += 1;
    try {
      const status = gameStatus();
      if (status && typeof status.restarts === "number") {
        if (S.restarts != null && status.restarts !== S.restarts) onRestarted();
        S.restarts = status.restarts;
      }
      gateThreeGame();
      if (S.hitStop > 0) S.hitStop = Math.max(0, S.hitStop - dt);
      if (S.slow > 0) S.slow = Math.max(0, S.slow - dt);
      updateHud(dt);
      updateTweens(dt);
      updateShake(dt);
      updateParticles(dt);
      if (source) watchSpeed(dt);
      // Pixi: stop the ticker after a frame has drawn, so the game stays still behind a kit screen.
      if (S.frozen && S.renderer === "pixi" && !S.tickerStopped && S.ticks > 2 && S.ctx.app && S.ctx.app.ticker) {
        S.tickerStopped = true;
        S.ctx.app.ticker.stop();
        idleLoop();
      }
    } catch (_e) {}
  }
  // While the Pixi ticker is stopped the kit's own effects (confetti, count-ups) keep moving.
  function idleLoop() {
    if (!S.tickerStopped || typeof window.requestAnimationFrame !== "function") return;
    window.requestAnimationFrame(function () {
      if (!S.tickerStopped) return;
      frame();
      idleLoop();
    });
  }
  function gateThreeGame() {
    const ctx = S.ctx;
    if (S.renderer !== "three" || !ctx || !ctx.game) return;
    const game = ctx.game;
    if (typeof game.update !== "function" || game.update.__diyGate) return;
    const original = game.update;
    const gated = function () {
      if (S.frozen) return undefined;
      return original.apply(this, arguments);
    };
    gated.__diyGate = true;
    game.update = gated;
  }
  function pauseKeys() {
    const input = S.ctx && S.ctx.input;
    try {
      const controls = input && typeof input.getControls === "function" ? input.getControls() : [];
      const entry = controls.filter(function (c) { return c && c.id === "pause"; })[0];
      return entry ? entry.keys : [];
    } catch (_e) {
      return [];
    }
  }
  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const current = S.screen;
    if (!current) {
      if (S.started && S.pauseEnabled && !smoke() && pauseKeys().indexOf(event.code) >= 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        pause();
      }
      return;
    }
    const tag = event.target && event.target.tagName;
    if (event.code === "Enter" || event.code === "NumpadEnter" || event.code === "Space") {
      if (tag === "INPUT" && event.code === "Space") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const active = document.activeElement;
      if (active && active.tagName === "BUTTON" && current.el.contains(active)) active.click();
      else if (current.confirm) current.confirm();
      return;
    }
    if (event.code === "Escape" && current.cancel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      current.cancel();
      return;
    }
    if (current.name === "pause" && pauseKeys().indexOf(event.code) >= 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resume();
    }
  }
  function onVisibility() {
    if (document.hidden && S.started && S.pauseEnabled && !S.screen && !smoke()) pause();
  }
  function onResize() {
    if (S.tickerStopped && S.ctx && S.ctx.app && typeof S.ctx.app.render === "function") {
      setTimeout(function () { try { S.ctx.app.render(); } catch (_e) {} }, 60);
    }
  }
  function detach() {
    S.listeners.splice(0).forEach(function (off) { off(); });
    const ctx = S.ctx;
    if (ctx && S.origOnUpdate) { ctx.onUpdate = S.origOnUpdate; ctx.offUpdate = S.origOffUpdate; }
    if (ctx && ctx.app && ctx.app.ticker && S.tickerFn) {
      try { ctx.app.ticker.remove(S.tickerFn); } catch (_e) {}
    }
    remove(S.root);
    if (document.body) document.body.classList.remove("diy-ui-modal");
    S.root = null;
    S.screen = null;
    S.ctx = null;
    S.started = false;
    S.frozen = false;
    S.tickerStopped = false;
  }
  function hookFrames(ctx) {
    if (S.renderer === "pixi" && ctx.app && ctx.app.ticker && typeof ctx.app.ticker.add === "function") {
      S.tickerFn = frame;
      ctx.app.ticker.add(frame);
      const PIXI = ctx.PIXI || window.PIXI;
      // PixiJS ParticleContainer builds code with new Function, which the game CSP blocks.
      try {
        if (PIXI && PIXI.ParticleBuffer && PIXI.generateParticleUpdatePolyfill &&
            PIXI.unsafeEvalSupported && !PIXI.unsafeEvalSupported()) {
          PIXI.ParticleBuffer.prototype.generateParticleUpdate = PIXI.generateParticleUpdatePolyfill;
        }
      } catch (_e) {}
      return;
    }
    if (typeof ctx.onUpdate === "function") {
      const onUpdate = ctx.onUpdate;
      const offUpdate = ctx.offUpdate;
      S.origOnUpdate = onUpdate;
      S.origOffUpdate = offUpdate;
      S.gated = new WeakMap();
      onUpdate.call(ctx, frame);
      // Game callbacks pause with the game while a kit screen is open.
      ctx.onUpdate = function (callback) {
        if (typeof callback !== "function") return onUpdate.call(ctx, callback);
        const gated = function () { if (!S.frozen) return callback.apply(this, arguments); return undefined; };
        S.gated.set(callback, gated);
        return onUpdate.call(ctx, gated);
      };
      if (typeof offUpdate === "function") {
        ctx.offUpdate = function (callback) { return offUpdate.call(ctx, (S.gated && S.gated.get(callback)) || callback); };
      }
    }
  }

  const api = {
    skin: applySkin,
    get fonts() { ensureSkin(); return Object.assign({}, S.fonts); },
    get colors() { ensureSkin(); return Object.assign({}, S.palette); },
    hex: function (name) {
      ensureSkin();
      return parseInt(String(colorString(name, "#ffffff")).replace("#", "").slice(0, 6), 16) || 0;
    },
    get fontsReady() { ensureSkin(); return S.fontsReady; },
    onFontsReady: function (fn) {
      if (typeof fn !== "function") return noop;
      ensureSkin();
      S.fontWaiters.push(fn);
      // Fonts that are already in also call back, once, on the next tick.
      if (S.fontsDone) setTimeout(function () { try { fn(S.fonts); } catch (_e) {} }, 0);
      return function () {
        const index = S.fontWaiters.indexOf(fn);
        if (index >= 0) S.fontWaiters.splice(index, 1);
      };
    },
    title: title,
    start: startGame,
    howToPlay: howToPlay,
    hud: hud,
    toolbar: toolbar,
    popup: popup,
    banner: banner,
    gameOver: function (options) { return endScreen("over", options); },
    win: function (options) { return endScreen("win", options); },
    pause: function () { return pause(false); },
    resume: resume,
    settings: function () { settings(); },
    button: uiButton,
    get running() { return S.started && !S.screen; },
    get started() { return S.started; },
    get screen() { return S.screen ? S.screen.name : null; },
    get isTouch() { return isTouch(); },
    get graphics() { return graphicsLevel(); },
  };

  function attach(ctx, details) {
    if (!ctx || typeof ctx !== "object") return;
    if (S.ctx && S.ctx !== ctx) detach();
    S.ctx = ctx;
    S.renderer = (details && details.renderer) || (ctx.app ? "pixi" : "three");
    S.ticks = 0;
    S.lastFrameAt = 0;
    const status = gameStatus();
    S.restarts = status && typeof status.restarts === "number" ? status.restarts : null;
    ctx.ui = api;
    ctx.fx = fx;
    hookFrames(ctx);
    listen(window, "keydown", onKeyDown, true);
    listen(window, "vibe:game2d:restart_triggered", function () { onRestarted(); });
    listen(window, "resize", onResize);
    listen(document, "visibilitychange", onVisibility);
  }

  KIT.ui = {
    // The boot smoke and screenshot tools press start: true when a start screen was open.
    start: function () { return S.screen && (S.screen.name === "title" || S.screen.name === "howto") ? startGame() : false; },
    skins: function () { return Object.keys(CATALOG.skins); },
    fonts: function () { return Object.keys(CATALOG.fonts); },
    keycap: keycap,
    graphicsLevel: graphicsLevel,
    _frame: frame,
    _state: S,
  };
  KIT.extend(function (ctx, details) { attach(ctx, details); });
})();

/* DIY sounds: ctx.sfx and ctx.music play library sounds by id ("pickup.coin_03").
   Web Audio when the file can be fetched, an <audio> element when it cannot. Never blocks boot. */
(function () {
  "use strict";
  const kit = window.DIYKit = window.DIYKit || {
    libraryBase: "https://cdn.diy.org/vibe-library/v1",
    extensions: [],
    extend: function (fn) { this.extensions.push(fn); },
  };
  if (kit.sfx) return;
  const ID_RE = /^([a-z0-9]+)\.([a-z0-9_]+)$/;
  const PATH_RE = /^(?:sfx|music)\/[a-z0-9_-]+\/[a-z0-9_-]+\.mp3$/;
  // A sound the AI made for this game ("Use AI instead") lives in the game's own CDN folder.
  const MADE_URL_RE = /^https:\/\/cdn\.diy\.org\/(?:dev\/|prod\/)?projects\/vibecode\/[A-Za-z0-9_-]+\/sounds\/[A-Za-z0-9._\/-]+\.wav$/;
  const MAX_VOICES = 24;
  const MAX_PER_SOUND = 4;
  // A one-shot still loading this long after play() is skipped: a late jump sound is worse than none.
  const LATE_MS = { sfx: 250, music: 3000 };
  const VARY = 0.05;
  const ONCE = new Set(["jingle", "voice"]);
  const UNLOCK = ["pointerdown", "pointerup", "touchend", "mousedown", "keydown", "click"];
  const MISSING = {};
  // Default sounds for ctx.ui (its "diy:ui" events); a higher rank wins when one tap fires several.
  const UI_SOUNDS = {
    button: ["ui.click_01", 1, 0.6], open: ["ui.open_01", 2, 0.6], close: ["ui.close_01", 2, 0.6],
    pause: ["ui.pause_retro_01", 3, 0.8], resume: ["ui.unpause_retro_01", 3, 0.8],
    start: ["ui.confirm_01", 4, 0.8], restart: ["ui.confirm_02", 4, 0.8],
    win: ["jingle.win_steel_07", 5, 1], gameover: ["magic.zap_fall_01", 5, 1],
  };
  const volumes = { master: 1, music: 0.7, sfx: 1, muted: false };
  // Keyed by ids the game passes in: no prototype, so "constructor" is just an unknown id.
  const sounds = Object.create(null);
  const warned = Object.create(null);
  // When the game itself last played each category (ui, jingle, voice, music...).
  const heard = Object.create(null);
  const uiChoice = Object.create(null);
  Object.keys(UI_SOUNDS).forEach(function (type) { uiChoice[type] = UI_SOUNDS[type][0]; });
  let uiPending = null;
  let uiTimer = null;
  const live = [];
  const changes = [];
  let graph = null;
  let decoder = null;
  let mediaOnly = typeof window.fetch !== "function";
  let unlocked = false;
  let music = null;
  // The music rotation ctx.music.playlist is running, if any.
  let playlist = null;
  let hiddenPause = false;

  function noop() {}
  function quiet(promise) { if (promise && typeof promise.catch === "function") promise.catch(noop); }
  function now() { return Date.now(); }

  function warn(key, message) {
    if (warned[key]) return;
    warned[key] = true;
    try { console.warn("[sfx] " + message); } catch (_error) {}
  }

  function num(value, lo, hi, fallback) {
    const n = Number(value);
    return value == null || !Number.isFinite(n) ? fallback : Math.min(hi, Math.max(lo, n));
  }

  function base() { return String(kit.libraryBase || "").replace(/\/+$/, ""); }

  function own(map, key) {
    return map && typeof map === "object" && Object.prototype.hasOwnProperty.call(map, key);
  }

  // runtime/sounds.js (generated on save) lists the sounds the game plays, which are preloaded.
  function listed() {
    const value = kit.sounds;
    return value && typeof value === "object" ? value : {};
  }

  // A sound swapped in the Assets tab plays in place of the id the code names (one level).
  function resolve(id) {
    const key = String(id == null ? "" : id);
    const target = own(kit.soundAliases, key) ? kit.soundAliases[key] : null;
    return typeof target === "string" && ID_RE.test(target) ? target : key;
  }

  function remember(id, bus) {
    const match = ID_RE.exec(id);
    if (match) heard[match[1]] = now();
    if (bus === "music") heard.music = now();
  }

  function address(id, match) {
    const list = listed();
    const path = own(list, id) ? list[id] : null;
    if (typeof path === "string" && MADE_URL_RE.test(path)) return path;
    if (typeof path === "string" && PATH_RE.test(path)) return base() + "/" + path;
    return base() + "/sfx/" + match[1] + "/" + match[2] + ".mp3";
  }

  function offline() {
    if (decoder) return decoder;
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    try { decoder = Offline ? new Offline(1, 1, 44100) : null; } catch (_error) { decoder = null; }
    return decoder;
  }

  function decode(bytes) {
    const context = graph ? graph.context : offline();
    if (!context) return Promise.reject(new Error("no Web Audio"));
    return new Promise(function (resolve, reject) {
      try {
        const result = context.decodeAudioData(bytes, resolve, reject);
        if (result && typeof result.then === "function") result.then(resolve, reject);
      } catch (error) { reject(error); }
    });
  }

  function settle(sound) {
    const waiters = sound.settled;
    sound.settled = [];
    waiters.forEach(function (fn) { fn(sound.state === "ready"); });
  }

  function ready(sound) {
    if (sound.state === "failed") return;
    sound.state = "ready";
    const waiting = live.filter(function (h) { return h.id === sound.id && h.state === "waiting"; });
    // Before the first tap they keep waiting: unlock() starts them.
    if (unlocked) {
      waiting.forEach(function (handle) {
        if (!handle.loop && now() - handle.asked > LATE_MS[handle.bus]) finish(handle);
        else begin(handle);
      });
    }
    settle(sound);
  }

  function fail(sound, unknown) {
    sound.state = "failed";
    live.filter(function (h) { return h.id === sound.id; }).forEach(function (handle) {
      if (handle.el) { try { handle.el.pause(); } catch (_error) {} }
      finish(handle);
    });
    warn(sound.id, unknown
      ? 'unknown sound "' + sound.id + '": nothing plays. Use ids from search_sounds.'
      : 'sound "' + sound.id + '" could not load (no network?)');
    settle(sound);
  }

  function media(sound, url) {
    let el = null;
    try { el = document.createElement("audio"); } catch (_error) { el = null; }
    if (!el || typeof el.play !== "function") { fail(sound, false); return; }
    el.preload = "auto";
    watch(sound, el);
    el.src = url;
    sound.pool = [el];
    sound.el = el;
    ready(sound);
  }

  function watch(sound, el) {
    el.addEventListener("error", function () { fail(sound, false); });
    el.addEventListener("ended", function () {
      live.filter(function (h) { return h.el === el && !h.loop; }).forEach(finish);
    });
  }

  function load(id) {
    const key = String(id == null ? "" : id);
    if (sounds[key]) return sounds[key];
    const match = ID_RE.exec(key);
    const sound = { id: key, category: match ? match[1] : "", state: "loading", buffer: null,
      el: null, pool: [], region: null, settled: [] };
    sounds[key] = sound;
    if (!match) { fail(sound, true); return sound; }
    const url = address(key, match);
    if (mediaOnly) { media(sound, url); return sound; }
    let request;
    try {
      request = window.fetch(url, { credentials: "omit" });
    } catch (_error) {
      // The game sandbox blocks fetch: every sound uses <audio> elements from here on.
      mediaOnly = true;
      listen();
      media(sound, url);
      return sound;
    }
    Promise.resolve(request).then(function (response) {
      if (response && response.ok) return response.arrayBuffer();
      throw response && (response.status === 403 || response.status === 404) ? MISSING : new Error("http");
    }).then(decode).then(function (buffer) {
      sound.buffer = buffer;
      ready(sound);
    }).catch(function (error) {
      if (error === MISSING) fail(sound, true);
      else media(sound, url);
    });
    return sound;
  }

  function createGraph() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    try {
      const context = new Context();
      const master = context.createGain();
      const sfxBus = context.createGain();
      const musicBus = context.createGain();
      sfxBus.connect(master);
      musicBus.connect(master);
      master.connect(context.destination);
      return { context: context, master: master, sfx: sfxBus, music: musicBus };
    } catch (_error) {
      return null;
    }
  }

  function busLevel(name) { return name === "music" ? volumes.music : volumes.sfx; }

  function apply() {
    if (graph) {
      try {
        graph.master.gain.value = volumes.muted ? 0 : volumes.master;
        graph.sfx.gain.value = volumes.sfx;
        graph.music.gain.value = volumes.music;
      } catch (_error) {}
    }
    live.forEach(mediaLevel);
  }

  function mediaLevel(handle) {
    if (!handle.el || handle.el.owner !== handle) return;
    const level = handle.volume * handle.level * busLevel(handle.bus) * volumes.master;
    try {
      handle.el.volume = Math.max(0, Math.min(1, level));
      handle.el.muted = volumes.muted || level <= 0;
    } catch (_error) {}
  }

  function finish(handle) {
    // A track that ended (or could not play) by itself, not one that was stopped.
    const ended = !handle.stopped && (handle.state === "playing" || handle.state === "waiting");
    if (ended && typeof handle.onEnd === "function") {
      const next = handle.onEnd;
      handle.onEnd = null;
      setTimeout(next, 0);
    }
    if (handle.timer) clearInterval(handle.timer);
    handle.timer = null;
    handle.state = "done";
    const index = live.indexOf(handle);
    if (index >= 0) live.splice(index, 1);
    if (music === handle) music = null;
    if (handle.node) {
      try { handle.node.disconnect(); } catch (_error) {}
      try { handle.gain.disconnect(); } catch (_error) {}
    }
  }

  // Loops skip the near-silence an MP3 encoder pads at both ends, so they repeat without a gap.
  function loopRegion(sound) {
    if (sound.region) return sound.region;
    const buffer = sound.buffer;
    const data = buffer.getChannelData(0);
    let first = 0;
    let last = data.length - 1;
    while (first < last && Math.abs(data[first]) < 0.0005) first += 1;
    while (last > first && Math.abs(data[last]) < 0.0005) last -= 1;
    if (last - first < buffer.sampleRate * 0.05) { first = 0; last = data.length - 1; }
    sound.region = [first / buffer.sampleRate, (last + 1) / buffer.sampleRate];
    return sound.region;
  }

  function makeRoom(handle) {
    const playing = live.filter(function (h) { return h.state === "playing"; });
    const same = playing.filter(function (h) { return h.id === handle.id && !h.loop; });
    if (same.length >= MAX_PER_SOUND) stop(same[0], 0);
    const spare = playing.filter(function (h) { return !h.loop && h.bus === "sfx" && h.state === "playing"; });
    if (playing.length >= MAX_VOICES && spare.length) stop(spare[0], 0);
  }

  function startBuffer(handle, sound) {
    const context = graph.context;
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = handle.rate;
    const gain = context.createGain();
    let tail = gain;
    source.connect(gain);
    if (handle.pan && typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = handle.pan;
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(handle.bus === "music" ? graph.music : graph.sfx);
    let offset = 0;
    if (handle.loop) {
      const region = loopRegion(sound);
      source.loop = true;
      source.loopStart = region[0];
      source.loopEnd = region[1];
      offset = region[0];
    }
    const at = context.currentTime;
    if (handle.fade > 0) {
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(handle.volume, at + handle.fade);
    } else {
      gain.gain.value = handle.volume;
    }
    source.onended = function () { if (handle.node === source) finish(handle); };
    handle.node = source;
    handle.gain = gain;
    handle.state = "playing";
    handle.started = true;
    source.start(0, offset);
  }

  function ramp(handle, to, seconds, done) {
    if (handle.timer) clearInterval(handle.timer);
    const from = handle.level;
    const started = now();
    const span = Math.max(1, seconds * 1000);
    handle.timer = setInterval(function () {
      const k = Math.min(1, (now() - started) / span);
      handle.level = from + (to - from) * k;
      mediaLevel(handle);
      if (k < 1) return;
      clearInterval(handle.timer);
      handle.timer = null;
      if (done) done();
    }, 40);
  }

  function startMedia(handle, sound) {
    let el = sound.pool.find(function (node) { return !node.owner || node.paused || node.ended; });
    if (!el && sound.pool.length < MAX_PER_SOUND) {
      el = sound.el.cloneNode(true);
      watch(sound, el);
      sound.pool.push(el);
    }
    if (!el) el = sound.pool[0];
    live.filter(function (h) { return h.el === el && h !== handle; }).forEach(finish);
    el.owner = handle;
    el.loop = handle.loop;
    try {
      el.preservesPitch = el.mozPreservesPitch = el.webkitPreservesPitch = false;
      el.playbackRate = handle.rate;
    } catch (_error) {}
    handle.el = el;
    handle.state = "playing";
    handle.started = true;
    handle.level = handle.fade > 0 ? 0 : 1;
    mediaLevel(handle);
    if (handle.fade > 0) ramp(handle, 1, handle.fade);
    try { el.currentTime = 0; } catch (_error) {}
    try { quiet(el.play()); } catch (_error) {}
  }

  function begin(handle) {
    if (handle.composer) {
      // A composed tune (music-gen.js) needs Web Audio; without it the game stays silent.
      if (handle.state !== "waiting") return;
      if (!graph) { finish(handle); return; }
      try {
        handle.song = handle.composer(graph.context, graph.music, handle.spec);
        handle.song.start(graph.context.currentTime, handle.fade, handle.volume);
        handle.state = "playing";
      } catch (_error) {
        finish(handle);
      }
      return;
    }
    const sound = sounds[handle.id];
    if (!sound || sound.state !== "ready" || handle.state !== "waiting") return;
    makeRoom(handle);
    try {
      if (sound.buffer && graph) startBuffer(handle, sound);
      else if (sound.el) startMedia(handle, sound);
      else finish(handle);
    } catch (_error) {
      finish(handle);
    }
  }

  function stop(handle, fade) {
    if (!handle || handle.state === "done" || handle.state === "stopping") return;
    handle.stopped = true;
    const seconds = num(fade, 0, 10, 0);
    if (handle.state === "waiting") { finish(handle); return; }
    if (handle.song && graph) {
      handle.state = "stopping";
      try { handle.song.stop(graph.context.currentTime, seconds); } catch (_error) {}
      setTimeout(function () { finish(handle); }, seconds * 1000 + 120);
      return;
    }
    if (handle.node && graph) {
      const at = graph.context.currentTime;
      handle.state = "stopping";
      try {
        const gain = handle.gain.gain;
        if (seconds > 0) {
          gain.cancelScheduledValues(at);
          gain.setValueAtTime(gain.value, at);
          gain.linearRampToValueAtTime(0, at + seconds);
        }
        handle.node.stop(at + seconds);
      } catch (_error) {
        finish(handle);
      }
      return;
    }
    const el = handle.el;
    const end = function () {
      if (el && el.owner === handle) {
        try { el.pause(); } catch (_error) {}
        el.owner = null;
      }
      finish(handle);
    };
    if (el && seconds > 0) {
      handle.state = "stopping";
      ramp(handle, 0, seconds, end);
    } else {
      end();
    }
  }

  function voice(id, bus, loop, options) {
    const opts = options && typeof options === "object" ? options : {};
    const sound = load(id);
    const steady = loop || bus === "music" || ONCE.has(sound.category);
    const vary = steady ? 0 : num(opts.vary, 0, 0.5, VARY);
    const handle = {
      id: sound.id,
      bus: bus,
      loop: loop,
      state: "waiting",
      asked: now(),
      // Loops and music asked for before the first tap start on that tap; one-shots do not.
      held: loop || bus === "music",
      volume: num(opts.volume, 0, 1, 1),
      rate: num(opts.pitch, 0.25, 4, 1) * (1 + (Math.random() * 2 - 1) * vary),
      pan: num(opts.pan, -1, 1, 0),
      fade: num(opts.fade, 0, 10, 0),
      level: 1,
      node: null,
      gain: null,
      el: null,
      timer: null,
      stop: function (fade) { stop(handle, fade); },
    };
    if (sound.state === "failed" || (!unlocked && !handle.held)) {
      handle.state = "done";
      return handle;
    }
    live.push(handle);
    if (unlocked && sound.state === "ready") begin(handle);
    return handle;
  }

  // iOS lets an <audio> element make sound only after a tap has started it: start each one
  // muted on a tap, then stop it.
  function bless() {
    Object.keys(sounds).forEach(function (key) {
      sounds[key].pool.forEach(function (el) {
        if (el.blessed || el.owner || !el.paused) return;
        el.blessed = true;
        el.muted = true;
        const settle = function () {
          if (el.owner) return;
          try { el.pause(); el.currentTime = 0; } catch (_error) {}
          el.muted = false;
        };
        try {
          const started = el.play();
          if (started && typeof started.then === "function") started.then(settle, settle);
          else settle();
        } catch (_error) {
          settle();
        }
      });
    });
  }

  function listen() {
    UNLOCK.forEach(function (name) { window.addEventListener(name, unlock, true); });
  }

  function unlock() {
    if (!graph && !mediaOnly) {
      graph = createGraph();
      apply();
    }
    if (mediaOnly) bless();
    if (graph && graph.context.state !== "running") {
      try { quiet(graph.context.resume()); } catch (_error) {}
      try {
        const tick = graph.context.createBufferSource();
        tick.buffer = graph.context.createBuffer(1, 1, 22050);
        tick.connect(graph.context.destination);
        tick.start(0);
      } catch (_error) {}
    }
    if (!unlocked) {
      unlocked = true;
      live.filter(function (h) { return h.state === "waiting"; }).forEach(begin);
    }
    // <audio> elements made later need a tap of their own, so those listeners stay.
    if (!mediaOnly && (!graph || graph.context.state === "running")) {
      UNLOCK.forEach(function (name) { window.removeEventListener(name, unlock, true); });
    }
  }

  const sfx = {
    play: function (id, options) {
      const key = resolve(id);
      remember(key, "sfx");
      return voice(key, "sfx", false, options);
    },
    loop: function (id, options) {
      const key = resolve(id);
      const running = live.find(function (h) {
        return h.loop && h.bus === "sfx" && h.id === key && h.state !== "stopping";
      });
      return running || voice(key, "sfx", true, options);
    },
    stop: function (target, options) {
      const fade = options && typeof options === "object" ? options.fade : undefined;
      if (target && typeof target === "object" && typeof target.stop === "function") {
        target.stop(fade);
        return;
      }
      const key = target == null ? null : resolve(target);
      live.filter(function (h) {
        return h.bus === "sfx" && (key == null || h.id === key);
      }).forEach(function (handle) { stop(handle, fade); });
    },
    preload: function (ids) {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(function (id) { return id != null; });
      return Promise.all(list.map(function (id) {
        const sound = load(resolve(id));
        if (sound.state !== "loading") return sound.state === "ready";
        return new Promise(function (done) { sound.settled.push(done); });
      }));
    },
    // ctx.ui's default sounds: { win: "jingle.win_sax_02" } changes one, { button: null } silences it.
    uiSounds: function (map) {
      if (map && typeof map === "object") {
        Object.keys(map).forEach(function (type) {
          if (!own(UI_SOUNDS, type)) return;
          const value = map[type];
          uiChoice[type] = typeof value === "string" && ID_RE.test(value) ? value : null;
        });
      }
      return Object.assign({}, uiChoice);
    },
  };

  const musicApi = {
    play: function (id, options) {
      const opts = options && typeof options === "object" ? options : {};
      const key = resolve(id);
      remember(key, "music");
      if (music && music.id === key && music.state !== "done" && music.state !== "stopping") return music;
      const fade = num(opts.fade, 0, 10, 0.3);
      playlist = null;
      if (music) stop(music, fade);
      const match = ID_RE.exec(key);
      const loop = "loop" in opts ? Boolean(opts.loop) : !(match && ONCE.has(match[1]));
      music = voice(key, "music", loop, { volume: opts.volume, fade: fade });
      return music;
    },
    stop: function (options) {
      playlist = null;
      if (!music) return;
      const handle = music;
      music = null;
      stop(handle, num(options && options.fade, 0, 10, 0.3));
    },
    playing: function () { return music && music.state !== "done" ? music.id : null; },
    // Tracks in turn, round and round; { random: true } starts on a random one. Playing or
    // stopping music ends the rotation. Calling it again with the same list keeps it going.
    playlist: function (ids, options) {
      const opts = options && typeof options === "object" ? options : {};
      const list = (Array.isArray(ids) ? ids : []).map(resolve).filter(function (id) {
        return ID_RE.test(id);
      });
      if (!list.length) return null;
      const key = list.join(",");
      if (playlist && playlist.key === key && music && music.state !== "done") return music;
      const fade = num(opts.fade, 0, 10, 0.5);
      const rotation = { key: key, index: opts.random ? Math.floor(Math.random() * list.length) : 0, skips: 0 };
      playlist = rotation;
      function next(first) {
        if (playlist !== rotation) return;
        // Every track failed in a row: stop rather than spin.
        if (rotation.skips >= list.length) { playlist = null; return; }
        const id = list[rotation.index % list.length];
        rotation.index += 1;
        remember(id, "music");
        if (first && music) stop(music, fade);
        const handle = voice(id, "music", false, { volume: opts.volume, fade: first ? fade : 0 });
        handle.onEnd = function () {
          rotation.skips = handle.started ? 0 : rotation.skips + 1;
          next(false);
        };
        music = handle;
        if (handle.state === "done") { rotation.skips += 1; setTimeout(function () { next(false); }, 0); }
      }
      next(true);
      return music;
    },
    // A looping tune made on the spot ({ mood, style, tempo }) when the library has none to fit.
    compose: function (spec) {
      const make = kit.musicComposer;
      const opts = spec && typeof spec === "object" ? spec : {};
      if (typeof make !== "function") {
        warn("compose", "this kit has no composer: no music plays.");
        return { id: "composed", state: "done", stop: noop };
      }
      const settled = make.settle(opts);
      // The composer's library loop for this mood and style, when the game lists it (on save),
      // plays as a file instead: then it shows (and swaps) in the Assets tab like any track.
      const loop = "music." + settled.mood + "_" + settled.style + "_loop";
      if (own(listed(), loop) || own(kit.soundAliases, loop)) {
        return musicApi.play(loop, { fade: num(opts.fade, 0, 10, 0.5), volume: opts.volume });
      }
      const key = "composed:" + settled.name;
      remember(key, "music");
      if (music && music.id === key && music.state !== "done" && music.state !== "stopping") return music;
      const fade = num(opts.fade, 0, 10, 0.5);
      playlist = null;
      if (music) stop(music, fade);
      const handle = {
        id: key, bus: "music", loop: true, state: "waiting", held: true, asked: now(),
        composer: make, spec: opts, song: null, fade: fade, volume: num(opts.volume, 0, 1, 1),
        level: 1, node: null, gain: null, el: null, timer: null,
        stop: function (seconds) { stop(handle, seconds); },
      };
      live.push(handle);
      music = handle;
      if (unlocked) begin(handle);
      return handle;
    },
  };

  kit.audio = {
    get: function () {
      return { master: volumes.master, music: volumes.music, sfx: volumes.sfx, muted: volumes.muted };
    },
    set: function (next) {
      if (next && typeof next === "object") {
        ["master", "music", "sfx"].forEach(function (key) {
          if (key in next) volumes[key] = num(next[key], 0, 1, volumes[key]);
        });
        if ("muted" in next) volumes.muted = Boolean(next.muted);
        apply();
        const state = kit.audio.get();
        changes.slice().forEach(function (fn) { try { fn(state); } catch (_error) {} });
      }
      return kit.audio.get();
    },
    onChange: function (fn) {
      if (typeof fn !== "function") return noop;
      changes.push(fn);
      return function () {
        const index = changes.indexOf(fn);
        if (index >= 0) changes.splice(index, 1);
      };
    },
    // ctx.ui calls this from its Play button; outside a real tap it waits for one.
    unlock: function () {
      const activation = typeof navigator !== "undefined" ? navigator.userActivation : null;
      if (!activation || activation.isActive) unlock();
    },
  };

  // The game's own sound for the same moment wins: a click it plays itself, or its own
  // jingle, voice or music around a win or game over (those wait a moment for it).
  function flushUi() {
    const pending = uiPending;
    uiPending = null;
    uiTimer = null;
    const id = pending ? uiChoice[pending.type] : null;
    if (!id) return;
    const ending = UI_SOUNDS[pending.type][1] >= 5;
    const kinds = ending ? ["jingle", "voice", "music"] : ["ui"];
    const since = pending.at - (ending ? 1000 : 200);
    if (kinds.some(function (kind) { return heard[kind] >= since; })) return;
    const key = resolve(id);
    voice(key, "sfx", false, { volume: UI_SOUNDS[pending.type][2] });
  }

  window.addEventListener("diy:ui", function (event) {
    const type = event && event.detail ? event.detail.type : null;
    if (!own(UI_SOUNDS, type)) return;
    if (uiPending && UI_SOUNDS[uiPending.type][1] >= UI_SOUNDS[type][1]) return;
    uiPending = { type: type, at: now() };
    if (uiTimer) clearTimeout(uiTimer);
    uiTimer = setTimeout(flushUi, UI_SOUNDS[type][1] >= 5 ? 150 : 0);
  });

  listen();
  document.addEventListener("visibilitychange", function () {
    const playing = live.filter(function (h) { return h.el && h.el.owner === h && h.state === "playing"; });
    if (document.hidden) {
      if (graph && graph.context.state === "running") {
        hiddenPause = true;
        try { quiet(graph.context.suspend()); } catch (_error) {}
      }
      playing.forEach(function (h) {
        if (h.el.paused) return;
        h.hidden = true;
        try { h.el.pause(); } catch (_error) {}
      });
      return;
    }
    if (hiddenPause && graph) {
      hiddenPause = false;
      try { quiet(graph.context.resume()); } catch (_error) {}
    }
    playing.forEach(function (h) {
      if (!h.hidden) return;
      h.hidden = false;
      try { quiet(h.el.play()); } catch (_error) {}
    });
  });

  kit.sfx = sfx;
  kit.music = musicApi;
  if (typeof kit.extend === "function") {
    kit.extend(function (ctx) {
      ctx.sfx = sfx;
      ctx.music = musicApi;
    });
  }
  setTimeout(function () {
    const ids = Object.keys(listed());
    if (ids.length) quiet(sfx.preload(ids));
  }, 0);
})();

/* DIY composer: ctx.music.compose({ mood, style }) plays a looping tune made on the spot with
   Web Audio (no files), for a game the music library has nothing for. sfx.js owns the music
   bus, the first-tap unlock and stop(); this file only writes and schedules the notes. */
(function () {
  "use strict";
  const kit = window.DIYKit = window.DIYKit || {
    libraryBase: "https://cdn.diy.org/vibe-library/v1",
    extensions: [],
    extend: function (fn) { this.extensions.push(fn); },
  };
  if (kit.musicComposer) return;

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
  };
  // One chord per bar, as scale degrees (0 = the key's home chord); two 4-bar parts, A and B.
  const MOODS = {
    happy: { scale: "major", tempo: 124, energy: 2, key: 0, parts: [[0, 4, 5, 3], [3, 4, 0, 4]] },
    calm: { scale: "major", tempo: 82, energy: 0, key: 5, parts: [[0, 5, 3, 4], [3, 0, 3, 4]] },
    adventurous: { scale: "dorian", tempo: 114, energy: 2, key: 2, parts: [[0, 6, 3, 0], [3, 6, 0, 4]] },
    epic: { scale: "minor", tempo: 104, energy: 2, key: 9, parts: [[0, 5, 6, 0], [3, 5, 6, 4]] },
    tense: { scale: "minor", tempo: 138, energy: 3, key: 4, parts: [[0, 0, 5, 6], [0, 1, 0, 4]] },
    spooky: { scale: "phrygian", tempo: 72, energy: 0, key: 4, parts: [[0, 1, 0, 6], [3, 1, 0, 0]] },
    silly: { scale: "major", tempo: 146, energy: 3, key: 7, parts: [[0, 3, 4, 0], [0, 5, 3, 4]] },
    sad: { scale: "minor", tempo: 70, energy: 0, key: 2, parts: [[0, 5, 2, 6], [3, 0, 6, 4]] },
    mysterious: { scale: "harmonic", tempo: 90, energy: 1, key: 11, parts: [[0, 5, 0, 4], [3, 5, 1, 4]] },
    triumphant: { scale: "mixolydian", tempo: 118, energy: 2, key: 7, parts: [[0, 3, 6, 0], [5, 3, 6, 4]] },
  };
  // [wave, volume, lowpass Hz (0 = none), attack s, release s]
  const STYLES = {
    chiptune: { lead: ["square", 0.07, 0, 0.005, 0.04], arp: ["square", 0.035, 0, 0.002, 0.02],
      bass: ["triangle", 0.2, 0, 0.005, 0.05], pad: null, drums: "chip", octave: 5 },
    orchestral: { lead: ["sawtooth", 0.05, 2400, 0.06, 0.3], arp: null,
      bass: ["triangle", 0.18, 0, 0.02, 0.2], pad: ["sawtooth", 0.035, 900, 0.5, 0.9], drums: "timpani", octave: 5 },
    electronic: { lead: ["sawtooth", 0.05, 3200, 0.01, 0.12], arp: ["square", 0.03, 2600, 0.002, 0.05],
      bass: ["sawtooth", 0.1, 700, 0.005, 0.08], pad: ["triangle", 0.03, 0, 0.3, 0.6], drums: "beat", octave: 5 },
    rock: { lead: ["square", 0.055, 2800, 0.01, 0.1], arp: null,
      bass: ["sawtooth", 0.11, 600, 0.005, 0.06], pad: ["sawtooth", 0.045, 1600, 0.01, 0.15], drums: "rock", octave: 5 },
    ambient: { lead: ["sine", 0.07, 0, 0.08, 0.8], arp: ["sine", 0.035, 0, 0.01, 0.9],
      bass: ["sine", 0.12, 0, 0.2, 0.6], pad: ["triangle", 0.05, 1200, 1.2, 1.6], drums: null, octave: 5 },
    jazz: { lead: ["triangle", 0.09, 0, 0.01, 0.15], arp: null,
      bass: ["triangle", 0.2, 0, 0.01, 0.08], pad: ["sine", 0.04, 0, 0.05, 0.3], drums: "brush", octave: 5, swing: 0.18 },
    acoustic: { lead: ["triangle", 0.09, 0, 0.004, 0.25], arp: ["triangle", 0.05, 2400, 0.002, 0.35],
      bass: ["sine", 0.18, 0, 0.01, 0.2], pad: null, drums: "soft", octave: 5 },
    world: { lead: ["triangle", 0.085, 0, 0.004, 0.2], arp: ["sine", 0.04, 0, 0.002, 0.3],
      bass: ["sine", 0.18, 0, 0.01, 0.15], pad: ["triangle", 0.03, 1000, 0.4, 0.8], drums: "hand", octave: 5, swing: 0.08 },
  };
  // Where notes start in a 16-step bar, by energy (0 calm ... 3 busy).
  const BASS = [[0], [0, 8], [0, 6, 8, 14], [0, 2, 4, 6, 8, 10, 12, 14]];
  const LEAD = [
    [[0, 8], [0, 6, 12], [0, 4, 8]],
    [[0, 4, 8, 12], [0, 6, 8, 12], [0, 3, 8, 10]],
    [[0, 3, 6, 8, 12], [0, 2, 4, 8, 10, 12], [0, 4, 6, 10, 12, 14]],
    [[0, 2, 4, 6, 8, 10, 12, 14], [0, 3, 4, 6, 8, 11, 12, 14], [0, 2, 3, 6, 8, 10, 11, 14]],
  ];
  const BARS = 16;
  const STEPS = 16;

  function pick(table, value, fallback) {
    const key = String(value || "").toLowerCase().trim();
    return Object.prototype.hasOwnProperty.call(table, key) ? key : fallback;
  }

  function hash(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  function random(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The settings a spec stands for (unknown words fall back), and its name for ctx.music.playing().
  function settle(spec) {
    const s = spec && typeof spec === "object" ? spec : {};
    const mood = pick(MOODS, s.mood, "happy");
    const style = pick(STYLES, s.style, "chiptune");
    const tempo = Math.round(Math.min(180, Math.max(50, Number(s.tempo) || MOODS[mood].tempo)));
    const seed = Number.isFinite(Number(s.seed)) ? Math.floor(Number(s.seed)) : hash(mood + style + tempo);
    return { mood: mood, style: style, tempo: tempo, seed: seed, name: mood + "-" + style + "-" + tempo };
  }

  // Scale degree (any integer) -> MIDI note in the key.
  function degreeNote(scale, key, degree, octave) {
    const steps = SCALES[scale];
    const size = steps.length;
    const wrapped = ((degree % size) + size) % size;
    return 12 * (octave + Math.floor(degree / size)) + key + steps[wrapped];
  }

  // A part's melody: chord tones on strong steps, mostly steps of one between, home at the end.
  function melody(rng, rhythmBank, chords, scaleSize, lift) {
    const rhythm = rhythmBank[Math.floor(rng() * rhythmBank.length)];
    const notes = [];
    let degree = chords[0] + lift;
    chords.forEach(function (chord, bar) {
      rhythm.forEach(function (step, index) {
        const strong = step % 8 === 0;
        const last = bar === chords.length - 1 && index === rhythm.length - 1;
        if (last) degree = lift + (rng() < 0.5 ? 0 : scaleSize);
        else if (strong) {
          const tones = [chord, chord + 2, chord + 4].map(function (d) { return d + lift; });
          degree = tones.reduce(function (best, d) {
            return Math.abs(d - degree) < Math.abs(best - degree) ? d : best;
          }, tones[Math.floor(rng() * 3)]);
        } else {
          degree += rng() < 0.72 ? (rng() < 0.5 ? 1 : -1) : (rng() < 0.5 ? 2 : -2);
          degree = Math.max(lift - 2, Math.min(lift + scaleSize + 2, degree));
        }
        const next = index + 1 < rhythm.length ? rhythm[index + 1] : STEPS;
        notes.push({ bar: bar, step: step, degree: degree, length: Math.max(1, next - step) });
      });
    });
    return notes;
  }

  // The 16 bars: A A B A; part B sits a little higher and has its own tune.
  function write(settings) {
    const rng = random(settings.seed);
    const mood = MOODS[settings.mood];
    const size = SCALES[mood.scale].length;
    const tunes = [melody(rng, LEAD[mood.energy], mood.parts[0], size, 0),
      melody(rng, LEAD[mood.energy], mood.parts[1], size, 2)];
    const order = [0, 0, 1, 0];
    const bars = [];
    order.forEach(function (part, block) {
      mood.parts[part].forEach(function (chord, bar) {
        bars.push({
          chord: chord,
          lead: tunes[part].filter(function (n) { return n.bar === bar; }),
          fill: bar === 3 && block % 2 === 1,
        });
      });
    });
    return { bars: bars, mood: mood };
  }

  function noiseBuffer(context) {
    if (context.__diyNoise) return context.__diyNoise;
    const rate = context.sampleRate || 44100;
    const buffer = context.createBuffer(1, Math.floor(rate * 0.5), rate);
    const data = buffer.getChannelData(0);
    const rng = random(7);
    for (let i = 0; i < data.length; i += 1) data[i] = rng() * 2 - 1;
    context.__diyNoise = buffer;
    return buffer;
  }

  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function tone(context, out, inst, midi, at, seconds, velocity) {
    const wave = inst[0];
    const volume = inst[1] * velocity;
    const attack = inst[3];
    const release = inst[4];
    const osc = context.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(hz(midi), at);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + attack);
    gain.gain.setValueAtTime(volume, at + Math.max(attack, seconds));
    gain.gain.linearRampToValueAtTime(0.0001, at + Math.max(attack, seconds) + release);
    let head = gain;
    if (inst[2]) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(inst[2], at);
      filter.connect(gain);
      head = filter;
    }
    osc.connect(head);
    gain.connect(out);
    osc.start(at);
    osc.stop(at + Math.max(attack, seconds) + release + 0.05);
  }

  function hit(context, out, kind, at, level) {
    if (kind === "kick" || kind === "tom") {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const low = kind === "kick" ? 45 : 70;
      const length = kind === "kick" ? 0.22 : 0.45;
      osc.type = "sine";
      osc.frequency.setValueAtTime(kind === "kick" ? 150 : 110, at);
      osc.frequency.exponentialRampToValueAtTime(low, at + length * 0.6);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.45 * level, at + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain);
      gain.connect(out);
      osc.start(at);
      osc.stop(at + length + 0.05);
      return;
    }
    const source = context.createBufferSource();
    source.buffer = noiseBuffer(context);
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const shape = { snare: ["highpass", 1200, 0.16, 0.22], hat: ["highpass", 7000, 0.05, 0.07],
      shaker: ["bandpass", 5200, 0.06, 0.05], brush: ["bandpass", 3000, 0.12, 0.05] }[kind];
    filter.type = shape[0];
    filter.frequency.setValueAtTime(shape[1], at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(shape[3] * level, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + shape[2]);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    source.start(at, Math.random() * 0.3);
    source.stop(at + shape[2] + 0.02);
  }

  // Which drums play on a step, by kit and energy.
  function drums(set, energy, step, fill) {
    const hits = [];
    if (!set) return hits;
    const beat = step % 4 === 0;
    if (set === "timpani") {
      if (step === 0 || (fill && step >= 12 && step % 2 === 0)) hits.push(["tom", 0.9]);
      return hits;
    }
    if (set === "brush") {
      if (step === 0 || step === 8) hits.push(["kick", 0.5]);
      if (step === 4 || step === 12) hits.push(["brush", 1]);
      if (step % 2 === 0) hits.push(["hat", 0.35]);
      return hits;
    }
    if (set === "hand") {
      if (step === 0 || step === 6 || step === 10) hits.push(["tom", 0.6]);
      if (step % 2 === 0) hits.push(["shaker", 0.8]);
      return hits;
    }
    if (set === "soft") {
      if (step === 0 || (energy > 1 && step === 8)) hits.push(["kick", 0.6]);
      if (energy > 0 && step % 4 === 2) hits.push(["shaker", 0.7]);
      return hits;
    }
    const four = energy >= 3 || set === "beat";
    if (step === 0 || step === 8 || (four && beat) || (energy >= 2 && step === 10)) hits.push(["kick", 1]);
    if (energy >= 1 && (step === 4 || step === 12)) hits.push(["snare", set === "rock" ? 1.2 : 1]);
    if (fill && step >= 13) hits.push(["snare", 0.7]);
    const hatEvery = energy >= 3 ? 1 : 2;
    if (energy >= 1 && step % hatEvery === 0) hits.push(["hat", beat ? 0.8 : 0.55]);
    return hits;
  }

  function schedule(context, out, song, settings, style, barIndex, step, at, stepSeconds) {
    const bar = song.bars[barIndex];
    const mood = song.mood;
    const key = mood.key;
    const octave = style.octave;
    const chordNotes = [0, 2, 4].map(function (d) { return degreeNote(mood.scale, key, bar.chord + d, octave - 1); });
    if (style.pad && step === 0) {
      chordNotes.forEach(function (midi) { tone(context, out, style.pad, midi, at, stepSeconds * STEPS * 0.95, 1); });
    }
    const bassSteps = BASS[mood.energy];
    if (style.bass && bassSteps.indexOf(step) >= 0) {
      const next = bassSteps[bassSteps.indexOf(step) + 1] || STEPS;
      const root = degreeNote(mood.scale, key, bar.chord, octave - 2);
      const fifth = settings.style === "jazz" && step % 8 === 4 ? 7 : 0;
      tone(context, out, style.bass, root + fifth, at, stepSeconds * (next - step) * 0.9, 1);
    }
    if (style.arp && mood.energy >= 1) {
      const every = mood.energy >= 2 ? 2 : 4;
      if (step % every === 0) {
        const order = [0, 1, 2, 1];
        const midi = chordNotes[order[(step / every) % order.length]] + 12;
        tone(context, out, style.arp, midi, at, stepSeconds * every * 0.8, 1);
      }
    }
    bar.lead.forEach(function (n) {
      if (n.step !== step) return;
      const midi = degreeNote(mood.scale, key, n.degree, octave);
      tone(context, out, style.lead, midi, at, stepSeconds * n.length * 0.9, step % 8 === 0 ? 1 : 0.8);
    });
    drums(style.drums, mood.energy, step, bar.fill).forEach(function (h) { hit(context, out, h[0], at, h[1]); });
  }

  // compose(context, destination, spec) -> { name, start(at, fade, volume), stop(at, fade) }
  function compose(context, destination, spec) {
    const settings = settle(spec);
    const style = STYLES[settings.style];
    const song = write(settings);
    const stepSeconds = 60 / settings.tempo / 4;
    const out = context.createGain();
    out.gain.value = 0;
    out.connect(destination);
    let timer = null;
    let next = 0;
    let index = 0;
    let level = 0.8;

    function tick() {
      while (next < context.currentTime + 0.15) {
        const barIndex = Math.floor(index / STEPS) % BARS;
        const step = index % STEPS;
        const swing = style.swing && step % 2 === 1 ? style.swing * stepSeconds * 2 : 0;
        schedule(context, out, song, settings, style, barIndex, step, next + swing, stepSeconds);
        next += stepSeconds;
        index = (index + 1) % (BARS * STEPS);
      }
    }

    return {
      name: settings.name,
      start: function (at, fade, volume) {
        level = 0.8 * (volume == null ? 1 : volume);
        const seconds = Math.max(0.01, fade || 0);
        out.gain.setValueAtTime(0.0001, at);
        out.gain.linearRampToValueAtTime(level, at + seconds);
        next = at + 0.05;
        tick();
        timer = setInterval(tick, 25);
      },
      stop: function (at, fade) {
        const seconds = Math.max(0.01, fade || 0);
        if (typeof out.gain.cancelScheduledValues === "function") out.gain.cancelScheduledValues(at);
        out.gain.setValueAtTime(out.gain.value, at);
        out.gain.linearRampToValueAtTime(0.0001, at + seconds);
        setTimeout(function () {
          if (timer) clearInterval(timer);
          timer = null;
          try { out.disconnect(); } catch (_error) {}
        }, seconds * 1000 + 100);
      },
    };
  }

  compose.settle = settle;
  compose.moods = Object.keys(MOODS);
  compose.styles = Object.keys(STYLES);
  kit.musicComposer = compose;
})();

/* DIY kit pictures: AI-made pictures by asset-library key.
   ctx.assets.background(key, { fit, scroll, parallax }) on Pixi and three.js,
   ctx.assets.picture(key, { size }) on Pixi and ctx.assets.texture(key, { repeat }) on
   three.js. A picture never blocks the game: a gradient or stand-in shows until it arrives.
   Library textures (a version naming one) add { map: "normal" | "emissive" | ... },
   { flipbook: true } with ctx.assets.frame(texture, i), { cube: true } / ctx.assets.sky(key)
   and ctx.assets.textureInfo(key) (the pack's numbers). */
(function () {
  "use strict";
  window.DIYKit = window.DIYKit || {
    libraryBase: "https://cdn.diy.org/vibe-library/v1",
    extensions: [],
    extend: function (fn) { this.extensions.push(fn); },
  };
  var kit = window.DIYKit;
  var NEUTRAL = ["#dbe4ee", "#a3b5c7"];
  var TEXTURE_FILL = "#b9c3cd";
  var loads = {};

  // The library's current picture for a key (runtime/asset-library.js), or null.
  function entryFor(key) {
    var lib = window.DIYAssetLibrary;
    var entry = lib && lib.assets ? lib.assets[key] : null;
    if (!entry || entry.dimension === "3d") return null;
    if (entry.kind === "image" && entry.src) return entry;
    if (entry.kind === "svg" && typeof lib.pictureUrl === "function") {
      var url = lib.pictureUrl(key);
      return url ? { src: url, width: entry.width, height: entry.height } : null;
    }
    return null;
  }

  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (!loads[url]) {
      loads[url] = new Promise(function (resolve) {
        var img = document.createElement("img");
        img.crossOrigin = "anonymous";
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = url;
      });
    }
    return loads[url];
  }

  // A pre-cropped file for the screen when the picture has one; the main file otherwise.
  function choose(entry, want, portrait) {
    var variants = entry.variants || {};
    var pick = null;
    if (want === "strip") pick = variants.strip;
    else if (want === "cover") pick = portrait ? variants.phone : variants.desktop;
    if (pick && pick.url) return pick;
    return { url: entry.src, width: entry.width, height: entry.height };
  }

  function shade(hex, factor) {
    var value = parseInt(hex.slice(1), 16);
    var parts = [16, 8, 0].map(function (shift) {
      var channel = Math.round(((value >> shift) & 255) * factor);
      return ("0" + Math.min(255, channel).toString(16)).slice(-2);
    });
    return "#" + parts.join("");
  }

  // The skin's background colour (runtime/ui-kit.js sets --ui-bg on :root), fading down.
  function skinGradient() {
    try {
      var top = window.getComputedStyle(document.documentElement).getPropertyValue("--ui-bg");
      top = String(top || "").trim();
      if (/^#[0-9a-f]{6}$/i.test(top)) return [top, shade(top, 0.8)];
    } catch (_error) {}
    return NEUTRAL;
  }

  function paintCanvas(width, height, colors) {
    var canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext && canvas.getContext("2d");
    if (context) {
      var gradient = context.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, colors[0]);
      gradient.addColorStop(1, colors[1] || colors[0]);
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    }
    return canvas;
  }

  function isPortrait(size) {
    return Boolean(size) && size.height > size.width;
  }

  // -- Pixi ---------------------------------------------------------------------

  // Pixi 8 compiles ParticleContainer uploads from strings, which the game CSP blocks.
  function patchParticles(PIXI) {
    if (kit.particlesPatched || !PIXI) return;
    kit.particlesPatched = true;
    try {
      if (
        PIXI.ParticleBuffer &&
        PIXI.generateParticleUpdatePolyfill &&
        typeof PIXI.unsafeEvalSupported === "function" &&
        !PIXI.unsafeEvalSupported()
      ) {
        PIXI.ParticleBuffer.prototype.generateParticleUpdate = PIXI.generateParticleUpdatePolyfill;
      }
    } catch (_error) {}
  }

  function tiling(PIXI, texture, width, height) {
    if (String(PIXI.VERSION || "8").charAt(0) >= "8") {
      return new PIXI.TilingSprite({ texture: texture, width: width, height: height });
    }
    return new PIXI.TilingSprite(texture, width, height);
  }

  // The one background at the bottom of the scene; calling again for its key returns it.
  function pixiBackgrounds(ctx) {
    var PIXI = ctx.PIXI;
    var current = null;

    function layer() {
      return (ctx.layers && ctx.layers.background) || ctx.stage;
    }

    function create(key, options) {
      var holder = new PIXI.Container();
      holder.label = "diy-background-" + key;
      var state = { fit: "cover", scroll: 0, parallax: null, scale: 1 };
      var camera = { x: 0, y: 0 };
      var offset = 0;
      var picture = null;
      var view = null;
      var shown = { width: 0, height: 0, tiling: null, url: null };

      function configure(next) {
        next = next || {};
        state.fit = next.fit === "tile" ? "tile" : "cover";
        state.scroll = Number(next.scroll) || 0;
        state.parallax = next.parallax == null ? null : Number(next.parallax) || 0;
        state.scale = Number(next.scale) || 1;
        shown.tiling = null;
      }

      function moving() {
        return state.fit === "tile" || state.scroll !== 0 || state.parallax !== null;
      }

      function build() {
        var size = ctx.size;
        var wantTiling = Boolean(picture) && moving();
        var url = picture ? picture.url : null;
        if (view && shown.tiling === wantTiling && shown.url === url) return;
        if (view) {
          holder.removeChild(view);
          try { view.destroy(); } catch (_error) {}
        }
        if (!picture) {
          view = new PIXI.Sprite(PIXI.Texture.from(paintCanvas(4, 256, skinGradient())));
        } else if (wantTiling) {
          view = tiling(PIXI, picture.texture, size.width, size.height);
        } else {
          view = new PIXI.Sprite(picture.texture);
        }
        shown.tiling = wantTiling;
        shown.url = url;
        shown.width = 0;
        holder.addChild(view);
      }

      function layout() {
        var size = ctx.size;
        if (!view) return;
        shown.width = size.width;
        shown.height = size.height;
        if (!picture) {
          view.width = size.width;
          view.height = size.height;
        } else if (view.tileScale) {
          view.width = size.width;
          view.height = size.height;
          var tile = state.fit === "tile" ? state.scale : size.height / picture.height;
          view.tileScale.set(tile, tile);
        } else {
          var cover = Math.max(size.width / picture.width, size.height / picture.height);
          view.scale.set(cover, cover);
          view.x = (size.width - picture.width * cover) / 2;
          view.y = (size.height - picture.height * cover) / 2;
        }
      }

      function show(entry) {
        var want = moving() ? "strip" : "cover";
        var file = choose(entry, want, isPortrait(ctx.size));
        loadImage(file.url).then(function (img) {
          if (!img || holder.destroyed) return;
          try {
            picture = { url: file.url, texture: PIXI.Texture.from(img) };
            picture.width = img.naturalWidth || file.width || 1;
            picture.height = img.naturalHeight || file.height || 1;
            build();
            layout();
          } catch (_error) {}
        });
      }

      function tick(ticker) {
        if (holder.destroyed) {
          ctx.app.ticker.remove(tick);
          return;
        }
        // A cleared layer (a restart) keeps its background.
        if (!holder.parent && current && current.holder === holder) layer().addChildAt(holder, 0);
        build();
        if (shown.width !== ctx.size.width || shown.height !== ctx.size.height) layout();
        if (view && view.tilePosition) {
          var seconds = ticker && ticker.deltaMS ? ticker.deltaMS / 1000 : 1 / 60;
          offset -= state.scroll * ctx.size.width * seconds;
          var depth = state.parallax || 0;
          view.tilePosition.x = offset - camera.x * depth;
          view.tilePosition.y = -camera.y * depth;
        }
      }

      // Starting to move swaps in the seamless strip.
      function refresh() {
        var entry = entryFor(key);
        if (entry) show(entry);
      }

      holder.diyBackground = { key: key };
      holder.setScroll = function (speed) {
        state.scroll = Number(speed) || 0;
        refresh();
      };
      // Parallax: the background moves by this share of the camera's movement.
      holder.follow = function (x, y) {
        camera.x = Number(x) || 0;
        camera.y = Number(y) || 0;
        if (state.parallax === null) {
          state.parallax = 0.3;
          refresh();
        }
      };
      holder.update = function (next) {
        configure(next);
        refresh();
      };
      configure(options);
      build();
      layout();
      refresh();
      if (ctx.app && ctx.app.ticker) ctx.app.ticker.add(tick);
      return holder;
    }

    return function background(key, options) {
      key = String(key || "");
      if (current && current.key === key && !current.holder.destroyed) {
        if (options) current.holder.update(options);
        if (!current.holder.parent) layer().addChildAt(current.holder, 0);
        return current.holder;
      }
      if (current && !current.holder.destroyed) {
        try { current.holder.destroy({ children: true }); } catch (_error) {}
      }
      var holder = create(key, options);
      current = { key: key, holder: holder };
      layer().addChildAt(holder, 0);
      return holder;
    };
  }

  // A soft stand-in for a picture that does not exist (yet): never an invisible hero.
  function pixiStandIn(PIXI, key, options) {
    var container = new PIXI.Container();
    container.label = "library-missing-" + key;
    var side = Number(options && (options.size || options.width)) || 64;
    var colors = skinGradient();
    var shape = new PIXI.Graphics();
    if (typeof shape.circle === "function") {
      shape.circle(0, 0, side / 2).fill({ color: colors[1], alpha: 0.85 });
    } else if (typeof shape.beginFill === "function") {
      shape.beginFill(PIXI.utils ? PIXI.utils.string2hex(colors[1]) : 0xa3b5c7, 0.85);
      shape.drawCircle(0, 0, side / 2);
      shape.endFill();
    }
    container.addChild(shape);
    return container;
  }

  function pictureUrl(key) {
    var lib = window.DIYAssetLibrary;
    return lib && typeof lib.pictureUrl === "function" ? lib.pictureUrl(key) : null;
  }

  function extendPixi(ctx) {
    var PIXI = ctx.PIXI || window.PIXI;
    var assets = ctx.assets;
    patchParticles(PIXI);
    if (!PIXI || !assets) return;
    assets.background = pixiBackgrounds(ctx);
    // ctx.assets.sprite for an AI picture: a stand-in while the key is not in the game yet.
    assets.picture = function (key, options) {
      var lib = window.DIYAssetLibrary;
      var known = lib && lib.assets && lib.assets[key];
      if (!known || typeof assets.sprite !== "function") {
        return pixiStandIn(PIXI, String(key), options);
      }
      return assets.sprite(key, options);
    };
    if (typeof assets.pictureUrl !== "function") assets.pictureUrl = pictureUrl;
  }

  // -- three.js -----------------------------------------------------------------

  function repeatOf(value) {
    if (Array.isArray(value)) return [Number(value[0]) || 1, Number(value[1] || value[0]) || 1];
    if (value && typeof value === "object") return [Number(value.x) || 1, Number(value.y) || 1];
    var both = Number(value) || 1;
    return [both, both];
  }

  // three keeps a texture's GPU size: a picture of another size needs a fresh upload.
  function swapImage(texture, img) {
    texture.image = img;
    if (typeof texture.dispose === "function") texture.dispose();
    texture.needsUpdate = true;
  }

  // A library texture's extras on the current version (maps, cube faces, frames, numbers);
  // null once the kid's own picture took its place.
  function libraryTexture(key) {
    var lib = window.DIYAssetLibrary;
    var entry = lib && lib.assets ? lib.assets[key] : null;
    return entry && entry.dimension !== "3d" && entry.texture ? entry.texture : null;
  }

  function wrapOf(THREE, value) {
    if (value === "mirror") return THREE.MirroredRepeatWrapping;
    if (value === "clamp") return THREE.ClampToEdgeWrapping;
    return THREE.RepeatWrapping;
  }

  // Shows frame `index` of a flipbook texture (frames run left to right, top row first).
  function setFrame(texture, index) {
    var f = texture && texture.userData ? texture.userData.frames : null;
    if (!f) return texture;
    var count = Math.max(1, f.count || f.columns * f.rows);
    var i = ((Math.floor(Number(index) || 0) % count) + count) % count;
    texture.offset.set((i % f.columns) / f.columns, 1 - (Math.floor(i / f.columns) + 1) / f.rows);
    return texture;
  }

  function threeTexture(ctx, key, options) {
    var THREE = ctx.THREE || window.THREE;
    options = options || {};
    if (options.cube) return threeSky(ctx, key);
    var extra = libraryTexture(key);
    var map = options.map ? String(options.map) : "";
    // A map the current picture lacks stays neutral: flat for normals, dark for the others.
    var fill = !map ? TEXTURE_FILL : map === "normal" ? "#8080ff" : "#000000";
    var texture = new THREE.CanvasTexture(paintCanvas(4, 4, [fill, fill]));
    if (map === "normal") texture.colorSpace = THREE.NoColorSpace || "";
    else if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    if (options.repeat != null || options.wrap) {
      var repeat = repeatOf(options.repeat != null ? options.repeat : 1);
      texture.wrapS = wrapOf(THREE, options.wrap);
      texture.wrapT = wrapOf(THREE, options.wrap);
      texture.repeat.set(repeat[0], repeat[1]);
    }
    try {
      var most = ctx.renderer.capabilities.getMaxAnisotropy();
      texture.anisotropy = Math.min(8, most || 1);
    } catch (_error) {}
    texture.userData = { libraryKey: key };
    if (options.flipbook) {
      var frames = (extra && extra.frames) || { columns: 1, rows: 1, count: 1, fps: 1 };
      texture.userData.frames = frames;
      texture.repeat.set(1 / frames.columns, 1 / frames.rows);
      setFrame(texture, 0);
    }
    var entry = entryFor(key);
    var url = map ? (extra && extra.maps && extra.maps[map]) || null : entry && entry.src;
    if (url) {
      loadImage(url).then(function (img) {
        if (img) swapImage(texture, img);
      });
    }
    return texture;
  }

  var CUBE_FACES = 6;

  // A sky: a cube texture from a library sky's six faces, else one picture (a panorama, or
  // the kid's own) wrapped round. Either works as scene.background or scene.environment.
  function threeSky(ctx, key) {
    var THREE = ctx.THREE || window.THREE;
    var extra = libraryTexture(key);
    var faces = extra && extra.faces;
    if (!faces || faces.length !== CUBE_FACES) {
      var flat = threeTexture(ctx, key, {});
      flat.mapping = THREE.EquirectangularReflectionMapping;
      return flat;
    }
    var blank = [];
    for (var i = 0; i < CUBE_FACES; i += 1) blank.push(paintCanvas(4, 4, skinGradient()));
    var cube = new THREE.CubeTexture(blank);
    if (THREE.SRGBColorSpace) cube.colorSpace = THREE.SRGBColorSpace;
    cube.needsUpdate = true;
    cube.userData = { libraryKey: key };
    Promise.all(faces.map(loadImage)).then(function (imgs) {
      if (!imgs.every(Boolean)) return;
      cube.images = imgs;
      if (typeof cube.dispose === "function") cube.dispose();
      cube.needsUpdate = true;
    });
    return cube;
  }

  // What the pack says about a library texture (size, tiling, maps, frames, its numbers such
  // as facade bands or a planet's atmosphere), or null for the kid's own picture.
  function textureInfo(key) {
    var extra = libraryTexture(key);
    var entry = entryFor(key);
    if (!extra || !entry) return null;
    return {
      width: entry.width || 0,
      height: entry.height || 0,
      tiles: Boolean(extra.tiles),
      maps: Object.keys(extra.maps || {}),
      cube: Boolean(extra.faces),
      frames: extra.frames || null,
      params: extra.params || {},
    };
  }

  // A centred, screen-filling window of the picture (texture repeat and offset).
  function fitCover(ctx, shown) {
    var size = ctx.size || {};
    var texture = shown.texture;
    var picture = shown.picture;
    if (!texture || !picture || !(size.width > 0) || !(size.height > 0)) return;
    shown.width = size.width;
    shown.height = size.height;
    var screen = size.width / size.height;
    var image = picture.width / picture.height;
    if (screen > image) {
      texture.repeat.set(1, image / screen);
      texture.offset.set(0, (1 - image / screen) / 2);
    } else {
      texture.repeat.set(screen / image, 1);
      texture.offset.set((1 - screen / image) / 2, 0);
    }
  }

  // scene.background; the newest call wins and ``shown`` follows it.
  function threeBackground(ctx, key, shown) {
    var THREE = ctx.THREE || window.THREE;
    var texture = new THREE.CanvasTexture(paintCanvas(4, 256, skinGradient()));
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    shown.texture = texture;
    shown.picture = null;
    var entry = entryFor(key);
    if (entry) {
      var file = choose(entry, "cover", isPortrait(ctx.size));
      loadImage(file.url).then(function (img) {
        if (!img || shown.texture !== texture) return;
        shown.picture = {
          width: img.naturalWidth || file.width || 1,
          height: img.naturalHeight || file.height || 1,
        };
        swapImage(texture, img);
        fitCover(ctx, shown);
      });
    }
    texture.userData = { libraryKey: key };
    ctx.scene.background = texture;
    return texture;
  }

  function extendThree(ctx) {
    var assets = ctx.assets;
    if (!assets || !(ctx.THREE || window.THREE)) return;
    var shown = { texture: null, picture: null, width: 0, height: 0 };
    var watching = false;
    assets.texture = function (key, options) { return threeTexture(ctx, String(key || ""), options); };
    assets.frame = setFrame;
    assets.textureInfo = function (key) { return textureInfo(String(key || "")); };
    // The sky behind everything: ctx.scene.background, returned for scene.environment too.
    assets.sky = function (key) {
      var sky = threeSky(ctx, String(key || ""));
      if (ctx.scene) ctx.scene.background = sky;
      return sky;
    };
    assets.background = function (key) {
      // One size watcher per game, however often the background changes.
      if (!watching && typeof ctx.onUpdate === "function") {
        watching = true;
        ctx.onUpdate(function () {
          var size = ctx.size || {};
          if (size.width !== shown.width || size.height !== shown.height) fitCover(ctx, shown);
        });
      }
      return threeBackground(ctx, String(key || ""), shown);
    };
    if (typeof assets.pictureUrl !== "function") assets.pictureUrl = pictureUrl;
  }

  kit.extend(function (ctx, info) {
    if (!ctx) return;
    var renderer = (info && info.renderer) || (ctx.PIXI ? "pixi" : "three");
    if (renderer === "pixi") extendPixi(ctx);
    else if (renderer === "three") extendThree(ctx);
  });
})();
