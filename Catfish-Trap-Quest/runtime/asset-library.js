// DIY asset library: generated from assets/manifest.json on every save. Do not edit.
/* DIY asset library runtime. Points each bound asset factory (ctx.assets.char0001)
   at the kid's current version, so game code never changes when an asset does.
   The game never waits for art: a look still loading shows the original, then swaps. */
(function () {
  var lib = window.DIYAssetLibrary || {};
  window.DIYAssetLibrary = lib;
  var RASTER_SIZE = 256;
  var DEFAULT_SIZE = 96;
  var assets = {};
  var byFactory = {};
  // Keyed per version, so a new look never reuses an old picture.
  var loading = {};
  var pictures = {};
  var failed = {};
  var textures = {};
  var models = {};

  function slot(entry) {
    return entry.key + "@" + (entry.version || "");
  }

  lib.install = function (data) {
    assets = {};
    byFactory = {};
    var list = (data && data.assets) || [];
    for (var i = 0; i < list.length; i += 1) {
      var entry = list[i];
      if (!entry || !entry.key) continue;
      assets[entry.key] = entry;
      if (entry.factory) byFactory[entry.factory] = entry;
    }
    lib.assets = assets;
    loadAll();
    installPathRewrites();
  };

  function isPicture(entry) {
    if (!entry || entry.dimension === "3d") return false;
    if (entry.kind === "image") return Boolean(entry.src);
    return entry.kind === "svg" && Boolean(entry.svg || entry.src);
  }

  function svgDataUrl(svg) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg).replace(/['()]/g, function (c) {
      return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }

  // The current look as a URL page HTML and CSS can use: data: for SVGs, the CDN for images.
  // A catalog or code look has no picture; an AI-drawn asset's last drawing stands in.
  lib.pictureUrl = function (key) {
    var entry = assets[key];
    if (isPicture(entry)) {
      return entry.kind === "svg" && entry.svg ? svgDataUrl(entry.svg) : entry.src;
    }
    var backup = entry ? fallbackEntry(entry) : null;
    return backup ? svgDataUrl(backup.svg) : null;
  };

  // Library files never load inside the game: HTML naming one gets the current look, or a
  // blank pixel (a blocked file would count as a broken game).
  var BLANK_PICTURE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  var LIBRARY_PATH = /(?:\.\/)?assets\/library\/([a-z0-9][a-z0-9-]*)\/[A-Za-z0-9._-]+/g;
  lib.resolvePaths = function (text) {
    if (typeof text !== "string" || text.indexOf("assets/library/") === -1) return text;
    return text.replace(LIBRARY_PATH, function (match, key) {
      return lib.pictureUrl(key) || BLANK_PICTURE;
    });
  };

  function wrapSetter(proto, name) {
    var descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor || typeof descriptor.set !== "function" || !descriptor.configurable) return;
    Object.defineProperty(proto, name, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set: function (value) { descriptor.set.call(this, lib.resolvePaths(value)); },
    });
  }

  function installPathRewrites() {
    if (lib.pathsInstalled || typeof window.Element !== "function") return;
    lib.pathsInstalled = true;
    var proto = window.Element.prototype;
    wrapSetter(proto, "innerHTML");
    wrapSetter(proto, "outerHTML");
    wrapSetter(window.HTMLImageElement && window.HTMLImageElement.prototype, "src");
    var insertHtml = proto.insertAdjacentHTML;
    if (typeof insertHtml === "function") {
      proto.insertAdjacentHTML = function (position, html) {
        return insertHtml.call(this, position, lib.resolvePaths(html));
      };
    }
    var setAttribute = proto.setAttribute;
    proto.setAttribute = function (name, value) {
      var rewrite = /^(?:src|href|style)$/i.test(String(name));
      return setAttribute.call(this, name, rewrite ? lib.resolvePaths(value) : value);
    };
    // Static page HTML was parsed before this file ran.
    try {
      var images = document.querySelectorAll('img[src*="assets/library/"]');
      for (var i = 0; i < images.length; i += 1) {
        images[i].setAttribute("src", images[i].getAttribute("src"));
      }
    } catch (_error) {}
  }

  // SVGs ship as raw text; a blob: URL avoids base64's extra third.
  function pictureUrl(entry) {
    if (entry.kind !== "svg" || entry.src) return entry.src;
    try {
      return URL.createObjectURL(new Blob([entry.svg], { type: "image/svg+xml" }));
    } catch (_error) {
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(entry.svg);
    }
  }

  function loadPicture(entry) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = pictureUrl(entry);
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        resolve(ok ? { img: img, url: url } : null);
      }
      if (entry.kind === "image") img.crossOrigin = "anonymous";
      // No timeout: nothing waits for a picture, and a slow one still swaps in.
      img.onload = function () { finish(true); };
      img.onerror = function () { finish(false); };
      img.src = url;
    });
  }

  function releaseUrl(url) {
    if (typeof url !== "string" || url.indexOf("blob:") !== 0) return;
    try { URL.revokeObjectURL(url); } catch (_error) {}
  }

  // SVGs are drawn once onto a canvas so every renderer gets crisp pixels.
  function toSource(img, entry) {
    if (entry.kind !== "svg") return img;
    var w = entry.width || img.naturalWidth || RASTER_SIZE;
    var h = entry.height || img.naturalHeight || RASTER_SIZE;
    var scale = RASTER_SIZE / Math.max(w, h, 1);
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    var context = canvas.getContext("2d");
    if (!context) return img;
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // A picture with no original look (an AI-drawn asset) falls back to its last drawing.
  function fallbackEntry(entry) {
    var backup = entry.fallback;
    if (!backup || !backup.svg) return null;
    return { kind: "svg", svg: backup.svg, width: backup.width, height: backup.height };
  }

  // The last drawing as a picture entry of its own (own cache slot), for sprite(key).
  function fallbackPicture(entry) {
    var backup = fallbackEntry(entry);
    if (!backup) return null;
    backup.key = entry.key;
    backup.version = (entry.version || "") + "~fallback";
    backup.align = entry.align;
    backup.dimension = "2d";
    return backup;
  }

  // Never null for game code: a missing look is an empty container, not a crash.
  function emptyContainer(PIXI, key) {
    var container = new PIXI.Container();
    container.label = "library-missing-" + key;
    return container;
  }

  // Never rejects: a picture that fails to load keeps the original look (or its fallback).
  function startLoading(entry) {
    var id = slot(entry);
    if (!loading[id]) {
      loading[id] = loadPicture(entry)
        .then(function (loaded) {
          if (loaded) return { loaded: loaded, entry: entry };
          var backup = fallbackEntry(entry);
          if (!backup) return null;
          return loadPicture(backup).then(function (again) {
            return again ? { loaded: again, entry: backup } : null;
          });
        })
        .then(function (result) {
          if (!result) return null;
          var source = toSource(result.loaded.img, result.entry);
          // An SVG is copied onto a canvas, so its blob URL is no longer needed.
          if (source !== result.loaded.img) releaseUrl(result.loaded.url);
          pictures[id] = source;
          return source;
        })
        .catch(function () { return null; })
        .then(function (source) {
          if (!source) failed[id] = true;
          return source;
        });
    }
    return loading[id];
  }

  function loadAll() {
    var jobs = [];
    Object.keys(assets).forEach(function (key) {
      // A catalog look's last drawing loads too, ready if its model is missing.
      var picture = isPicture(assets[key]) ? assets[key] : fallbackPicture(assets[key]);
      if (picture) jobs.push(startLoading(picture));
    });
    return jobs;
  }

  // Kit cores call this; it returns at once so the game never waits for art.
  lib.preload = function () {
    loadAll();
    return Promise.resolve();
  };

  // Resolves once every picture has loaded or failed.
  lib.whenLoaded = function () {
    return Promise.all(loadAll());
  };

  function textureFor(PIXI, entry) {
    var id = slot(entry);
    if (!pictures[id]) return null;
    if (!(id in textures)) {
      try {
        textures[id] = PIXI.Texture.from(pictures[id]);
      } catch (_error) {
        textures[id] = null;
      }
    }
    return textures[id];
  }

  function destroyQuietly(object) {
    try {
      if (object && typeof object.destroy === "function") object.destroy({ children: true });
    } catch (_error) {}
  }

  // The box an asset fills, so gameplay sizes and collisions stay the same.
  function boxOf(object) {
    try {
      var bounds = object && typeof object.getLocalBounds === "function" ? object.getLocalBounds() : null;
      if (!bounds || !(bounds.width > 0) || !(bounds.height > 0)) return null;
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        diyAsset: object.diyAsset || null,
        placement: object.placement || (object.diyAsset && object.diyAsset.placement) || null,
      };
    } catch (_error) {
      return null;
    }
  }

  function measure(build, options) {
    var object = null;
    try {
      object = build(options);
      return boxOf(object);
    } catch (_error) {
      return null;
    } finally {
      destroyQuietly(object);
    }
  }

  function defaultBox(entry, options) {
    var side = Number(options && (options.size || options.width)) || DEFAULT_SIZE;
    var w = entry.width || 1;
    var h = entry.height || 1;
    var scale = side / Math.max(w, h);
    return { x: (-w * scale) / 2, y: (-h * scale) / 2, width: w * scale, height: h * scale };
  }

  // Idle breathing, a bounce while moving and a squash for actions.
  function spriteAnimation(sprite) {
    var baseY = sprite.y;
    var baseX = sprite.scale.x;
    var baseScaleY = sprite.scale.y;
    var state = "idle";
    return {
      setState: function (next) {
        state = next || "idle";
        return state;
      },
      playAction: function () {
        state = "action";
        return state;
      },
      update: function (next, elapsed) {
        if (next) state = next;
        var t = Number(elapsed) || 0;
        sprite.y = baseY;
        sprite.scale.x = baseX;
        sprite.scale.y = baseScaleY;
        if (state === "moving") {
          sprite.y = baseY - Math.abs(Math.sin(t * 10)) * sprite.height * 0.04;
        } else if (state === "action") {
          var squash = 1 + Math.sin(t * 20) * 0.08;
          sprite.scale.x = baseX * squash;
          sprite.scale.y = baseScaleY / squash;
        } else {
          sprite.scale.y = baseScaleY * (1 + Math.sin(t * 2) * 0.015);
        }
        return state;
      },
    };
  }

  // Calls go to whichever look is showing (the original until the picture swaps in).
  function forwardAnimation(current) {
    function call(name, args) {
      var target = current();
      return target && typeof target[name] === "function" ? target[name].apply(target, args) : null;
    }
    var animation = {
      setState: function () { return call("setState", arguments); },
      playAction: function () { return call("playAction", arguments); },
      update: function () { return call("update", arguments); },
    };
    Object.defineProperty(animation, "state", {
      get: function () {
        var target = current();
        return target ? target.state : undefined;
      },
    });
    return animation;
  }

  // The picture fitted into the box (contain), standing on its bottom edge for characters.
  function pictureSprite(PIXI, entry, box) {
    var texture = textureFor(PIXI, entry);
    if (!texture) return null;
    var sprite = new PIXI.Sprite(texture);
    var tw = texture.width || 1;
    var th = texture.height || 1;
    var scale = Math.min(box.width / tw, box.height / th);
    var alignBottom = entry.align === "bottom";
    sprite.anchor.set(0.5, alignBottom ? 1 : 0.5);
    sprite.scale.set(scale, scale);
    sprite.x = box.x + box.width / 2;
    sprite.y = alignBottom ? box.y + box.height : box.y + box.height / 2;
    return sprite;
  }

  function describe(container, entry, box) {
    var meta = {};
    var source = box.diyAsset || {};
    Object.keys(source).forEach(function (name) { meta[name] = source[name]; });
    meta.libraryKey = entry.key;
    meta.libraryVersion = entry.version;
    meta.width = box.width;
    meta.height = box.height;
    meta.fallback = false;
    container.label = "library-" + entry.key;
    container.diyAsset = meta;
    if (box.placement) container.placement = box.placement;
  }

  function buildSprite(PIXI, entry, box) {
    var sprite = pictureSprite(PIXI, entry, box);
    if (!sprite) return null;
    var container = new PIXI.Container();
    container.addChild(sprite);
    describe(container, entry, box);
    container.diyAnimation = spriteAnimation(sprite);
    return container;
  }

  // Shows `look` (the original, or nothing) now and swaps the picture in once it loads.
  function swapWhenLoaded(PIXI, entry, look, box) {
    var container = new PIXI.Container();
    if (look) container.addChild(look);
    describe(container, entry, box);
    var current = look ? look.diyAnimation || null : null;
    container.diyAnimation = forwardAnimation(function () { return current; });
    startLoading(entry).then(function (source) {
      if (!source || container.destroyed) return;
      try {
        var sprite = pictureSprite(PIXI, entry, box);
        if (!sprite) return;
        if (look) {
          container.removeChild(look);
          destroyQuietly(look);
        }
        container.addChild(sprite);
        current = spriteAnimation(sprite);
      } catch (_error) {}
    });
    return container;
  }

  function pictureFactory(PIXI, entry, original) {
    function build(options, mode) {
      var base = mode && typeof original[mode] === "function" ? original[mode] : original;
      var id = slot(entry);
      if (failed[id]) return base(options);
      if (pictures[id]) {
        var ready = buildSprite(PIXI, entry, measure(base, options) || defaultBox(entry, options));
        return ready || base(options);
      }
      var look = base(options);
      var box = boxOf(look) || defaultBox(entry, options);
      if (!box.diyAsset && look) box.diyAsset = look.diyAsset || null;
      if (!box.placement && look) box.placement = look.placement || null;
      return swapWhenLoaded(PIXI, entry, look, box);
    }
    var factory = function (options) { return build(options || {}, null); };
    ["static", "moving", "action"].forEach(function (mode) {
      factory[mode] = function (options) { return build(options || {}, mode); };
    });
    return factory;
  }

  // Another catalog model for the same slot (raw factories take PIXI first).
  function retargetFactory(PIXI, targetName) {
    var raw = (window.Game2DAssets || {})[targetName];
    if (typeof raw !== "function") return null;
    var factory = function (options) { return raw(PIXI, options || {}); };
    ["static", "moving", "action"].forEach(function (mode) {
      if (typeof raw[mode] === "function") {
        factory[mode] = function (options) { return raw[mode](PIXI, options || {}); };
      }
    });
    return factory;
  }

  lib.bindPixi = function (PIXI, merged) {
    Object.keys(byFactory).forEach(function (name) {
      var entry = byFactory[name];
      if (entry.dimension === "3d") return;
      if (entry.kind === "catalog" && entry.target && entry.target !== name) {
        var retargeted = retargetFactory(PIXI, entry.target);
        if (retargeted) merged[name] = retargeted;
        return;
      }
      if (isPicture(entry) && typeof merged[name] === "function") {
        startLoading(entry);
        merged[name] = pictureFactory(PIXI, entry, merged[name]);
      }
    });
    merged.pictureUrl = lib.pictureUrl;
    // ctx.assets.sprite("coin") reaches any library asset by its key.
    merged.sprite = function (key, options) {
      var entry = assets[key];
      if (!entry) return emptyContainer(PIXI, key);
      if (entry.factory && typeof merged[entry.factory] === "function") {
        return merged[entry.factory](options || {});
      }
      if (entry.kind === "catalog" && entry.target) {
        var target = retargetFactory(PIXI, entry.target);
        if (target) return target(options || {});
      }
      var picture = isPicture(entry) ? entry : fallbackPicture(entry);
      if (!picture) return emptyContainer(PIXI, key);
      var box = defaultBox(picture, options);
      return buildSprite(PIXI, picture, box) || swapWhenLoaded(PIXI, picture, null, box);
    };
    return merged;
  };

  // -- 3D models: each current model version registers its builder here.
  lib.defineModel = function (key, version, build) {
    if (typeof build === "function") models[key + "@" + (version || "")] = build;
  };

  function threeLib() {
    return window.THREE || globalThis.THREE || null;
  }

  // Never throws: a model that cannot build gives null.
  function buildModel(entry, options) {
    var build = models[slot(entry)];
    var THREE = threeLib();
    if (typeof build !== "function" || !THREE) return null;
    try {
      var object = build(THREE, options || {});
      return object && object.isObject3D ? object : null;
    } catch (_error) {
      return null;
    }
  }

  // A plain block, so a model that fails to build never crashes the game.
  function placeholderModel(options) {
    var THREE = threeLib();
    if (!THREE) return null;
    var side = Number(options && options.size) || 1;
    var group = new THREE.Group();
    var block = new THREE.Mesh(
      new THREE.BoxGeometry(side, side, side),
      new THREE.MeshLambertMaterial({ color: 0xb8b0c8 })
    );
    block.position.y = side / 2;
    group.add(block);
    return group;
  }

  function disposeModel(object) {
    try {
      object.traverse(function (child) {
        if (child.geometry && child.geometry.dispose) child.geometry.dispose();
        var materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(function (material) {
          if (material && material.dispose) material.dispose();
        });
      });
    } catch (_error) {}
  }

  // The model scaled into the original's box: same largest side, same ground, same centre.
  function fitModel(THREE, model, original) {
    var target = new THREE.Box3().setFromObject(original);
    var box = new THREE.Box3().setFromObject(model);
    var targetSize = target.getSize(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var largest = Math.max(size.x, size.y, size.z);
    var holder = new THREE.Group();
    holder.add(model);
    if (target.isEmpty() || !(largest > 0)) return holder;
    model.scale.multiplyScalar(Math.max(targetSize.x, targetSize.y, targetSize.z) / largest);
    holder.updateMatrixWorld(true);
    var fitted = new THREE.Box3().setFromObject(model);
    var centre = fitted.getCenter(new THREE.Vector3());
    var targetCentre = target.getCenter(new THREE.Vector3());
    model.position.x += targetCentre.x - centre.x;
    model.position.z += targetCentre.z - centre.z;
    model.position.y += target.min.y - fitted.min.y;
    return holder;
  }

  // A bound factory (ctx.assets.char0041) building the kid's model in the original's place.
  function modelFactory(entry, original) {
    return function (THREE, options) {
      var model = buildModel(entry, options);
      if (!model) return original.apply(this, arguments);
      var reference = null;
      try {
        reference = original.apply(this, arguments);
      } catch (_error) {
        reference = null;
      }
      if (!reference || !reference.isObject3D) return model;
      var holder = fitModel(threeLib(), model, reference);
      holder.userData = Object.assign({}, reference.userData || {}, {
        libraryKey: entry.key,
        libraryVersion: entry.version,
      });
      disposeModel(reference);
      return holder;
    };
  }

  // -- library and uploaded GLB models, and looks on them: the model kit (three-models.js,
  // DIYKit.models) builds them; the game gets the handle's group, placeholder first.
  function isModelAsset(entry) {
    return Boolean(entry) && (entry.kind === "glb" || entry.kind === "look");
  }

  function kitModel(entry, options) {
    var kit = window.DIYKit && window.DIYKit.models;
    if (!kit || typeof kit.spawn !== "function") return null;
    try {
      var handle = kit.spawn(entry.key, Object.assign({}, options || {}, { add: false }));
      if (!handle || !handle.object) return null;
      handle.object.userData.diyModel = handle;
      handle.object.userData.libraryKey = entry.key;
      handle.object.userData.libraryVersion = entry.version;
      return handle.object;
    } catch (_error) {
      return null;
    }
  }

  // A bound factory (ctx.assets.char0041) showing a GLB model as tall as the original was.
  function glbFactory(entry, original) {
    return function (THREE, options) {
      var height = 0;
      try {
        var reference = original.apply(this, arguments);
        if (reference && reference.isObject3D) {
          var box = new THREE.Box3().setFromObject(reference);
          if (!box.isEmpty()) height = box.max.y - box.min.y;
          disposeModel(reference);
        }
      } catch (_error) {
        height = 0;
      }
      var opts = Object.assign({}, options || {});
      if (height > 0 && !opts.height) opts.height = height;
      return kitModel(entry, opts) || original.apply(this, arguments);
    };
  }

  lib.bindThree = function (merged) {
    var predefined = window.Game3DAssets || {};
    Object.keys(byFactory).forEach(function (name) {
      var entry = byFactory[name];
      if (entry.kind === "model" && typeof merged[name] === "function") {
        merged[name] = modelFactory(entry, merged[name]);
        return;
      }
      if (isModelAsset(entry) && typeof merged[name] === "function") {
        merged[name] = glbFactory(entry, merged[name]);
        return;
      }
      if (entry.kind !== "catalog" || !entry.target || entry.target === name) return;
      if (typeof predefined[entry.target] === "function") merged[name] = predefined[entry.target];
    });
    // ctx.assets.model("pine-tree") builds any 3D library asset by its key.
    merged.model = function (key, options) {
      var entry = assets[key];
      if (!entry) return placeholderModel(options);
      if (isModelAsset(entry)) return kitModel(entry, options) || placeholderModel(options);
      if (entry.factory && typeof merged[entry.factory] === "function") {
        return merged[entry.factory](threeLib(), options || {});
      }
      if (entry.kind === "catalog" && entry.target && typeof predefined[entry.target] === "function") {
        return predefined[entry.target](threeLib(), options || {});
      }
      return buildModel(entry, options) || placeholderModel(options);
    };
    return merged;
  };
})();

window.DIYAssetLibrary.install({"assets":[{"key":"blue-catfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"120\" height=\"70\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 70\"><path d=\"M18 35 2 15 5 52Z\" fill=\"#7899aa\" stroke=\"#405d70\" stroke-width=\"3\"/><path d=\"M24 30Q42 3 78 15L91 24Q115 27 115 37Q115 51 90 50Q48 68 24 43Z\" fill=\"#b8cbd4\" stroke=\"#405d70\" stroke-width=\"3\"/><path d=\"M45 17 57 4 76 15M46 52 59 64 76 52\" fill=\"#8da9b8\" stroke=\"#405d70\" stroke-width=\"3\"/><circle cx=\"96\" cy=\"30\" r=\"4\" fill=\"#102d46\"/><path d=\"M109 40q-6 6-14 0M102 43q9 16 17 16M96 44q0 14-10 21M106 36q13-8 13-17\" fill=\"none\" stroke=\"#405d70\" stroke-width=\"2.5\" stroke-linecap=\"round\"/><\/svg>","width":120.0,"height":70.0},{"key":"river-trap","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"50\" r=\"43\" fill=\"#b87735\" stroke=\"#69401f\" stroke-width=\"5\"/><circle cx=\"50\" cy=\"50\" r=\"30\" fill=\"#dba75c\" stroke=\"#69401f\" stroke-width=\"3\"/><path d=\"M23 28 77 72M17 43 57 84M43 16 84 57M77 28 23 72M83 43 43 83M57 16 16 57\" stroke=\"#986130\" stroke-width=\"3\"/><path d=\"M87 32 94 50 87 68 61 58 65 50 61 42Z\" fill=\"#194c58\" stroke=\"#fff3bf\" stroke-width=\"4\"/><path d=\"M76 45 89 50 76 55\" fill=\"none\" stroke=\"#fff3bf\" stroke-width=\"3\"/><\/svg>","width":100.0,"height":100.0},{"key":"river-bait","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"60\" height=\"60\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\"><circle cx=\"30\" cy=\"30\" r=\"22\" fill=\"#fff0a0\" stroke=\"#b97728\" stroke-width=\"4\"/><path d=\"M17 30q13-19 26 0-13 19-26 0Z\" fill=\"#f1a638\"/><circle cx=\"36\" cy=\"27\" r=\"2\" fill=\"#643817\"/><path d=\"M17 30 10 22v16Z\" fill=\"#ed9833\"/><\/svg>","width":60.0,"height":60.0},{"key":"sunny-river","dimension":"2d","factory":null,"version":"v1","kind":"image","align":"center","src":"https://cdn.diy.org/prod/projects/vibecode/91e154943d75436b9a5f0c55da1ff65c/assets/sunny-river/2e87755b-de34-4818-aaf7-67fd1e064b79.webp","width":1536,"height":864,"variants":{"phone":{"url":"https://cdn.diy.org/prod/projects/vibecode/91e154943d75436b9a5f0c55da1ff65c/assets/sunny-river/43d3feae-3d7b-4034-af39-2f9accd4d62b.webp","width":576,"height":1024},"strip":{"url":"https://cdn.diy.org/prod/projects/vibecode/91e154943d75436b9a5f0c55da1ff65c/assets/sunny-river/5b928ae5-894a-49be-a0be-74176b28a75b.webp","width":1344,"height":864}},"pictureKind":"background"},{"key":"little-diver","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"80\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 80\"><path d=\"M23 42Q22 20 48 18Q72 17 78 38L70 53Q47 62 27 51Z\" fill=\"#ffd36b\" stroke=\"#174c70\" stroke-width=\"4\"/><circle cx=\"57\" cy=\"33\" r=\"12\" fill=\"#a9efff\" stroke=\"#174c70\" stroke-width=\"4\"/><circle cx=\"60\" cy=\"32\" r=\"3\" fill=\"#174c70\"/><path d=\"M27 38 13 29 11 43 25 48M37 54 24 68 37 69 49 58M64 53 78 66 88 60 74 47\" fill=\"#ff8b55\" stroke=\"#174c70\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"M20 34 8 32M19 40 7 41\" stroke=\"#174c70\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M46 20 42 11 56 13 59 19\" fill=\"#ff8b55\" stroke=\"#174c70\" stroke-width=\"3\"/><\/svg>","width":100.0,"height":80.0},{"key":"underwater-current","dimension":"2d","factory":null,"version":"v1","kind":"image","align":"center","src":"https://cdn.diy.org/prod/projects/vibecode/91e154943d75436b9a5f0c55da1ff65c/assets/underwater-current/00ae129c-63c7-4bd9-8372-9875ce987db8.webp","width":1536,"height":864,"variants":{"phone":{"url":"https://cdn.diy.org/prod/projects/vibecode/91e154943d75436b9a5f0c55da1ff65c/assets/underwater-current/018dd919-5999-4a5b-abe9-f04f7adc9da5.webp","width":576,"height":1024},"strip":{"url":"https://cdn.diy.org/prod/projects/vibecode/91e154943d75436b9a5f0c55da1ff65c/assets/underwater-current/c34346e0-69a7-4098-95eb-e2f5a3e936b2.webp","width":1344,"height":864}},"pictureKind":"background"},{"key":"river-fisher-boat","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"160\" height=\"112\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 160 112\"><path d=\"M22 70 Q78 82 136 68 L120 96 Q80 108 39 94 Z\" fill=\"#a85b31\" stroke=\"#60351f\" stroke-width=\"5\"/><path d=\"M59 70 L58 48 L101 48 L100 70 Z\" fill=\"#2788a5\" stroke=\"#174b65\" stroke-width=\"4\"/><circle cx=\"80\" cy=\"35\" r=\"15\" fill=\"#f4bd76\" stroke=\"#704b35\" stroke-width=\"4\"/><path d=\"M61 27 Q79 9 101 24 L97 31 Q77 24 63 34 Z\" fill=\"#e0a83e\" stroke=\"#77511f\" stroke-width=\"4\"/><path d=\"M138 8 L101 52 M139 9 L147 28\" fill=\"none\" stroke=\"#704a2c\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M40 77 Q80 87 123 77\" fill=\"none\" stroke=\"#efb35f\" stroke-width=\"4\"/><path d=\"M58 65 L43 56 M101 65 L115 54\" fill=\"none\" stroke=\"#f1bd78\" stroke-width=\"6\" stroke-linecap=\"round\"/><\/svg>","width":160.0,"height":112.0},{"key":"underwater-crab","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"84\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 84\"><g stroke=\"#873b29\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M30 52 17 63M39 56 32 72M50 57 50 74M61 56 68 72M70 52 83 63\" fill=\"none\" stroke=\"#d45d35\" stroke-width=\"6\"/><path d=\"M30 32 20 24 13 27 9 20 16 13 24 16 32 25M70 32 80 24 87 27 91 20 84 13 76 16 68 25\" fill=\"#ff9d52\"/><ellipse cx=\"50\" cy=\"46\" rx=\"26\" ry=\"19\" fill=\"#f27645\"/><path d=\"M36 34 35 22M64 34 65 22\" fill=\"none\" stroke=\"#d45d35\" stroke-width=\"5\"/><circle cx=\"35\" cy=\"20\" r=\"7\" fill=\"#fff4d0\"/><circle cx=\"65\" cy=\"20\" r=\"7\" fill=\"#fff4d0\"/><circle cx=\"37\" cy=\"21\" r=\"3\" fill=\"#20374b\"/><circle cx=\"63\" cy=\"21\" r=\"3\" fill=\"#20374b\"/><path d=\"M42 49q8 8 16 0\" fill=\"none\" stroke=\"#873b29\" stroke-width=\"2.5\"/><\/g><\/svg>","width":100.0,"height":84.0},{"key":"blue-crab","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"84\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 84\"><g stroke=\"#174b75\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M29 52 16 63M39 56 32 72M50 57 50 74M61 56 68 72M71 52 84 63\" fill=\"none\" stroke=\"#2473ad\" stroke-width=\"6\"/><path d=\"M30 32 20 24 13 27 9 20 16 13 24 16 32 25M70 32 80 24 87 27 91 20 84 13 76 16 68 25\" fill=\"#55b8ed\"/><ellipse cx=\"50\" cy=\"46\" rx=\"26\" ry=\"19\" fill=\"#3296d4\"/><path d=\"M36 34 35 22M64 34 65 22\" fill=\"none\" stroke=\"#2473ad\" stroke-width=\"5\"/><circle cx=\"35\" cy=\"20\" r=\"7\" fill=\"#e8f8ff\"/><circle cx=\"65\" cy=\"20\" r=\"7\" fill=\"#e8f8ff\"/><circle cx=\"37\" cy=\"21\" r=\"3\" fill=\"#163653\"/><circle cx=\"63\" cy=\"21\" r=\"3\" fill=\"#163653\"/><path d=\"M42 49q8 8 16 0\" fill=\"none\" stroke=\"#174b75\" stroke-width=\"2.5\"/><\/g><\/svg>","width":100.0,"height":84.0}]});
