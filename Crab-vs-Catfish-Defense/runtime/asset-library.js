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

window.DIYAssetLibrary.install({"assets":[{"key":"crab-tower","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"shell\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffb17b\"/><stop offset=\"0.48\" stop-color=\"#ff7858\"/><stop offset=\"1\" stop-color=\"#d84845\"/><\/linearGradient><linearGradient id=\"sand\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffe9a5\"/><stop offset=\"1\" stop-color=\"#d99d55\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"88\" rx=\"36\" ry=\"8\" fill=\"#286e83\" opacity=\"0.22\"/><path d=\"M29 60 13 78m22-12-9 22m40-28 16 18m-22-12 9 22\" fill=\"none\" stroke=\"#ce5143\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M29 48 13 40 8 18l15 8 11 15m37 7 16-8 5-22-15 8-11 15\" fill=\"url(#shell)\" stroke=\"#a53c3c\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"M19 31 15 22l9 5m52 4 4-9-9 5\" fill=\"none\" stroke=\"#ffd1a1\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M34 44 38 28m28 16-4-16\" stroke=\"#b94a42\" stroke-width=\"5\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"59\" rx=\"28\" ry=\"22\" fill=\"url(#shell)\" stroke=\"#a53c3c\" stroke-width=\"4\"/><path d=\"M31 55q4-20 23-18\" fill=\"none\" stroke=\"#ffd0a0\" stroke-width=\"4\" opacity=\"0.9\"/><circle cx=\"38\" cy=\"28\" r=\"8\" fill=\"#fff\" stroke=\"#e5f7f0\" stroke-width=\"2\"/><circle cx=\"62\" cy=\"28\" r=\"8\" fill=\"#fff\" stroke=\"#e5f7f0\" stroke-width=\"2\"/><circle cx=\"40\" cy=\"29\" r=\"3.3\" fill=\"#164c63\"/><circle cx=\"64\" cy=\"29\" r=\"3.3\" fill=\"#164c63\"/><path d=\"M43 64q7 7 14 0\" fill=\"none\" stroke=\"#873637\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"29\" cy=\"61\" r=\"3\" fill=\"#ffb08e\"/><circle cx=\"71\" cy=\"61\" r=\"3\" fill=\"#ffb08e\"/><\/svg>","width":100.0,"height":100.0},{"key":"blue-catfish","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"110\" height=\"75\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 110 75\"><defs><linearGradient id=\"b\" x2=\"0\" y2=\"1\"><stop stop-color=\"#8be0ed\"/><stop offset=\"0.55\" stop-color=\"#48a9d0\"/><stop offset=\"1\" stop-color=\"#287caa\"/><\/linearGradient><\/defs><path d=\"M24 38 4 16l5 23-5 21Z\" fill=\"#347fb9\" stroke=\"#185477\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"m42 27 11-21 12 23\" fill=\"#65c5d5\" stroke=\"#317da2\" stroke-width=\"2\"/><ellipse cx=\"64\" cy=\"39\" rx=\"39\" ry=\"24\" fill=\"url(#b)\" stroke=\"#246182\" stroke-width=\"3\"/><path d=\"M38 48q30 19 61-1-20 26-51 14Z\" fill=\"#b7eee0\"/><path d=\"M44 24q20-10 39 1\" fill=\"none\" stroke=\"#eafffb\" stroke-width=\"4\" stroke-linecap=\"round\" opacity=\"0.8\"/><path d=\"M48 34q12 14 25 2\" fill=\"none\" stroke=\"#3182a4\" stroke-width=\"2\" opacity=\"0.55\"/><circle cx=\"86\" cy=\"32\" r=\"6\" fill=\"#fff\"/><circle cx=\"88\" cy=\"32\" r=\"3\" fill=\"#153d53\"/><circle cx=\"89\" cy=\"31\" r=\"1\" fill=\"#fff\"/><path d=\"M93 47q13-2 14-11m-15 14q12 6 15 13m-73-14Q18 46 13 51\" fill=\"none\" stroke=\"#205975\" stroke-width=\"2.5\" stroke-linecap=\"round\"/><circle cx=\"73\" cy=\"52\" r=\"2\" fill=\"#e8ffff\"/><\/svg>","width":110.0,"height":75.0},{"key":"pearl-reef","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"r\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffb29c\"/><stop offset=\"1\" stop-color=\"#ee5e68\"/><\/linearGradient><linearGradient id=\"s\" x2=\"0\" y2=\"1\"><stop stop-color=\"#fffdf0\"/><stop offset=\"1\" stop-color=\"#e4c98f\"/><\/linearGradient><\/defs><ellipse cx=\"51\" cy=\"87\" rx=\"40\" ry=\"9\" fill=\"#286c7c\" opacity=\"0.22\"/><path d=\"M14 85q8-24-1-47 17 4 17 31 11-15 7-52 18 6 15 49Q68 42 75 18q12 15-2 51 14-14 19-20 1 22-12 36Z\" fill=\"url(#r)\" stroke=\"#b94754\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"M21 69q5-10 4-22m20 13q5-17 0-30m22 29q11-15 12-25m4 29 8-10\" fill=\"none\" stroke=\"#ffd0b0\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M13 83q38-13 77 0\" fill=\"none\" stroke=\"#ffb590\" stroke-width=\"5\" stroke-linecap=\"round\"/><ellipse cx=\"51\" cy=\"73\" rx=\"16\" ry=\"14\" fill=\"url(#s)\" stroke=\"#d5bc84\" stroke-width=\"3\"/><path d=\"M39 71q4-12 13-12\" fill=\"none\" stroke=\"#fff\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"46\" cy=\"67\" r=\"4\" fill=\"#fff\"/><circle cx=\"70\" cy=\"76\" r=\"2\" fill=\"#fff0bf\"/><\/svg>","width":100.0,"height":100.0},{"key":"sunny-lagoon","dimension":"2d","factory":null,"version":"v2","kind":"image","align":"center","src":"https://cdn.diy.org/prod/projects/vibecode/e72dc9de6846447c8de9c6b4cfb02fb8/assets/sunny-lagoon/60aaeb24-bb6e-4f38-891e-00af5bdbba44.webp","width":1536,"height":864,"variants":{"phone":{"url":"https://cdn.diy.org/prod/projects/vibecode/e72dc9de6846447c8de9c6b4cfb02fb8/assets/sunny-lagoon/292a2452-b3af-468d-b080-e9372d19ca3d.webp","width":576,"height":1024},"strip":{"url":"https://cdn.diy.org/prod/projects/vibecode/e72dc9de6846447c8de9c6b4cfb02fb8/assets/sunny-lagoon/4908b9be-d985-4e89-91a2-1a4dcefb8867.webp","width":1344,"height":864}},"pictureKind":"background"},{"key":"pearl-cannon-tower","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"c\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffba84\"/><stop offset=\"1\" stop-color=\"#e8594a\"/><\/linearGradient><linearGradient id=\"g\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffdf85\"/><stop offset=\"1\" stop-color=\"#c88c3e\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"88\" rx=\"37\" ry=\"8\" fill=\"#236d7e\" opacity=\"0.22\"/><path d=\"m25 68-12 13m24-12-5 16m32-17 5 17m16-17-12 13\" stroke=\"#d65347\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"m28 54-15-12 1-17 15 11 8 12m35 6 15-12-1-17-15 11-8 12\" fill=\"url(#c)\" stroke=\"#a63d3b\" stroke-width=\"4\" stroke-linejoin=\"round\"/><ellipse cx=\"50\" cy=\"62\" rx=\"28\" ry=\"21\" fill=\"url(#c)\" stroke=\"#a63d3b\" stroke-width=\"4\"/><path d=\"M32 57q5-18 23-16\" fill=\"none\" stroke=\"#ffd0a3\" stroke-width=\"4\"/><circle cx=\"39\" cy=\"43\" r=\"7\" fill=\"white\"/><circle cx=\"61\" cy=\"43\" r=\"7\" fill=\"white\"/><circle cx=\"41\" cy=\"44\" r=\"3\" fill=\"#174d63\"/><circle cx=\"63\" cy=\"44\" r=\"3\" fill=\"#174d63\"/><path d=\"m49 34 18-17 20 4-3 12-20-2-12 12Z\" fill=\"url(#g)\" stroke=\"#875a36\" stroke-width=\"4\" stroke-linejoin=\"round\"/><ellipse cx=\"83\" cy=\"23\" rx=\"7\" ry=\"6\" fill=\"#fff9dd\" stroke=\"#c18a43\" stroke-width=\"2\"/><path d=\"m75 23 6-2\" stroke=\"#fff\" stroke-width=\"2\"/><path d=\"M44 68q6 6 12 0\" fill=\"none\" stroke=\"#873637\" stroke-width=\"3\"/><circle cx=\"27\" cy=\"63\" r=\"3\" fill=\"#ffb098\"/><\/svg>","width":100.0,"height":100.0},{"key":"net-coral-tower","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"leaf\" x2=\"0\" y2=\"1\"><stop stop-color=\"#a9f1d6\"/><stop offset=\"1\" stop-color=\"#50bfae\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"89\" rx=\"36\" ry=\"7\" fill=\"#256c7c\" opacity=\"0.2\"/><path d=\"m28 83 5-27 9-15 9 15 11-17 9 17 5 27Z\" fill=\"#46c6aa\" stroke=\"#148579\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"m33 63-8-20m19 16-2-28m17 27 8-29m8 35 10-20\" fill=\"none\" stroke=\"#168a7b\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M28 31Q50 7 76 28l-8 27Q51 43 35 56Z\" fill=\"url(#leaf)\" stroke=\"#218d82\" stroke-width=\"4\"/><path d=\"m32 31 36 20M44 20l23 24M70 30 37 49M59 18 34 40\" fill=\"none\" stroke=\"#53ab9d\" stroke-width=\"2.5\"/><path d=\"M33 29q17-15 32-7\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3\" opacity=\"0.7\"/><circle cx=\"51\" cy=\"43\" r=\"6\" fill=\"#fff4c7\" stroke=\"#238d83\" stroke-width=\"2\"/><path d=\"M42 78q8 6 16 0\" fill=\"none\" stroke=\"#126d67\" stroke-width=\"3\" stroke-linecap=\"round\"/><\/svg>","width":100.0,"height":100.0},{"key":"spike-puffer-tower","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><radialGradient id=\"p\" cx=\"35%\" cy=\"25%\"><stop stop-color=\"#fff19a\"/><stop offset=\"1\" stop-color=\"#f4a740\"/><\/radialGradient><\/defs><ellipse cx=\"50\" cy=\"87\" rx=\"36\" ry=\"8\" fill=\"#286b7c\" opacity=\"0.22\"/><path d=\"m27 73-14 10 8-16-13-9 17-3-6-15 15 6 5-17 11 15 10-15 5 18 17-7-6 16 17 4-15 9 9 16-16-7-8 15-11-13-11 14-10-16Z\" fill=\"#ffd75d\" stroke=\"#ca8b37\" stroke-width=\"3\" stroke-linejoin=\"round\"/><circle cx=\"50\" cy=\"61\" r=\"24\" fill=\"url(#p)\" stroke=\"#d08c38\" stroke-width=\"4\"/><path d=\"M34 53q4-12 15-13\" fill=\"none\" stroke=\"#fff3bb\" stroke-width=\"4\"/><circle cx=\"42\" cy=\"56\" r=\"6.5\" fill=\"white\"/><circle cx=\"60\" cy=\"56\" r=\"6.5\" fill=\"white\"/><circle cx=\"44\" cy=\"57\" r=\"3\" fill=\"#234e62\"/><circle cx=\"62\" cy=\"57\" r=\"3\" fill=\"#234e62\"/><path d=\"M44 71q6 5 12 0\" fill=\"none\" stroke=\"#ad5736\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"m39 81-4 9m26-9 4 9\" stroke=\"#ad5736\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"31\" cy=\"68\" r=\"2\" fill=\"#e59638\"/><circle cx=\"68\" cy=\"67\" r=\"2\" fill=\"#e59638\"/><\/svg>","width":100.0,"height":100.0},{"key":"sonar-shell-tower","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"t\" x2=\"0\" y2=\"1\"><stop stop-color=\"#c1fbeb\"/><stop offset=\"1\" stop-color=\"#40bcae\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"89\" rx=\"36\" ry=\"7\" fill=\"#226c7c\" opacity=\"0.2\"/><path d=\"m20 82 7-25 10-9 13 13 13-14 11 11 7 24Z\" fill=\"url(#t)\" stroke=\"#16877f\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"m31 57-7-18m19 16-2-24m18 23 6-25m9 28 9-17\" fill=\"none\" stroke=\"#13877d\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M31 42C21 27 32 12 47 15c9 1 12 9 8 16-3 5-10 6-14 2-4-3-2-8 2-10\" fill=\"#fff0a6\" stroke=\"#d2934c\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M35 34q-4-12 7-15\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3\"/><path d=\"m57 34 15-9 13 6-7 10-14-2\" fill=\"#ff9c68\" stroke=\"#b94f4b\" stroke-width=\"3\"/><circle cx=\"54\" cy=\"49\" r=\"7\" fill=\"#fff\"/><circle cx=\"56\" cy=\"49\" r=\"3\" fill=\"#154a61\"/><path d=\"M44 70q7 6 15-1\" fill=\"none\" stroke=\"#126d67\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"48\" cy=\"38\" r=\"3\" fill=\"#fff\"/><path d=\"M71 20q10-7 17 0M74 15q12-11 21-1\" fill=\"none\" stroke=\"#7fe6d4\" stroke-width=\"2\" stroke-linecap=\"round\"/><\/svg>","width":100.0,"height":100.0},{"key":"kelp-bloom-tower","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"k\" x2=\"0\" y2=\"1\"><stop stop-color=\"#8df0d1\"/><stop offset=\"1\" stop-color=\"#27a990\"/><\/linearGradient><linearGradient id=\"f\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ff9ab6\"/><stop offset=\"1\" stop-color=\"#ec5887\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"89\" rx=\"35\" ry=\"7\" fill=\"#256d7d\" opacity=\"0.2\"/><path d=\"m24 83 6-26 11-8 9 13 10-14 12 10 6 25Z\" fill=\"url(#k)\" stroke=\"#168477\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"m38 68-10-27m19 24 1-31m11 34 12-25\" fill=\"none\" stroke=\"#168477\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M49 42c-18-7-22-20-11-24 7-2 11 4 12 11 1-12 10-19 17-13 6 6 0 17-11 23 13-6 24 0 19 8-4 7-17 4-25-2-7 11-20 14-23 6-2-6 6-10 22-9Z\" fill=\"url(#f)\" stroke=\"#b64072\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"M39 27q3-9 8-3m18-4q5 3 2 9\" fill=\"none\" stroke=\"#ffd5e1\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"51\" cy=\"40\" r=\"7\" fill=\"#ffe782\" stroke=\"#d68156\" stroke-width=\"2\"/><circle cx=\"49\" cy=\"38\" r=\"2.5\" fill=\"#fff\"/><path d=\"M43 74q7 6 14 0\" fill=\"none\" stroke=\"#126d67\" stroke-width=\"3\" stroke-linecap=\"round\"/><\/svg>","width":100.0,"height":100.0},{"key":"gold-catfish","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"110\" height=\"75\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 110 75\"><defs><linearGradient id=\"g\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffe78a\"/><stop offset=\"0.55\" stop-color=\"#ffc355\"/><stop offset=\"1\" stop-color=\"#e98a40\"/><\/linearGradient><\/defs><path d=\"M23 38 3 16l5 23-5 21Z\" fill=\"#e68c3e\" stroke=\"#a45132\" stroke-width=\"3\"/><path d=\"m42 27 11-21 12 23\" fill=\"#ffe187\" stroke=\"#d29347\" stroke-width=\"2\"/><ellipse cx=\"64\" cy=\"39\" rx=\"39\" ry=\"24\" fill=\"url(#g)\" stroke=\"#c77835\" stroke-width=\"3\"/><path d=\"M38 48q30 19 61-1-20 26-51 14Z\" fill=\"#fff4c2\"/><path d=\"M49 25q17-12 33 0\" fill=\"none\" stroke=\"#fff9d3\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M52 36q13 11 24-1\" fill=\"none\" stroke=\"#e29142\" stroke-width=\"2\" opacity=\"0.55\"/><circle cx=\"86\" cy=\"32\" r=\"6\" fill=\"#fff\"/><circle cx=\"88\" cy=\"32\" r=\"3\" fill=\"#633c3e\"/><circle cx=\"89\" cy=\"31\" r=\"1\" fill=\"#fff\"/><path d=\"M93 47q13-2 14-11m-15 14q12 6 15 13\" fill=\"none\" stroke=\"#9c5434\" stroke-width=\"2.5\" stroke-linecap=\"round\"/><circle cx=\"72\" cy=\"52\" r=\"2\" fill=\"#fff3cf\"/><\/svg>","width":110.0,"height":75.0},{"key":"violet-catfish","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"110\" height=\"75\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 110 75\"><defs><linearGradient id=\"v\" x2=\"0\" y2=\"1\"><stop stop-color=\"#c7a9f3\"/><stop offset=\"0.55\" stop-color=\"#9a78cf\"/><stop offset=\"1\" stop-color=\"#7052ac\"/><\/linearGradient><\/defs><path d=\"M23 38 3 16l5 23-5 21Z\" fill=\"#8059b6\" stroke=\"#493d83\" stroke-width=\"3\"/><path d=\"m42 27 11-21 12 23\" fill=\"#d3b8f5\" stroke=\"#7557a8\" stroke-width=\"2\"/><ellipse cx=\"64\" cy=\"39\" rx=\"39\" ry=\"24\" fill=\"url(#v)\" stroke=\"#60468f\" stroke-width=\"3\"/><path d=\"M38 48q30 19 61-1-20 26-51 14Z\" fill=\"#f0e5ff\"/><path d=\"M49 33 54 29l5 4 5-4 5 4 5-4 5 4\" fill=\"none\" stroke=\"#fff0b5\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"M48 25q18-11 34 0\" fill=\"none\" stroke=\"#f1e8ff\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"86\" cy=\"32\" r=\"6\" fill=\"#fff\"/><circle cx=\"88\" cy=\"32\" r=\"3\" fill=\"#272651\"/><circle cx=\"89\" cy=\"31\" r=\"1\" fill=\"#fff\"/><path d=\"M93 47q13-2 14-11m-15 14q12 6 15 13\" fill=\"none\" stroke=\"#51427b\" stroke-width=\"2.5\" stroke-linecap=\"round\"/><circle cx=\"73\" cy=\"52\" r=\"2\" fill=\"#fff\"/><\/svg>","width":110.0,"height":75.0},{"key":"overhead-blue-catfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"110\" height=\"75\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 110 75\"><path d=\"M28 37 8 19l5 18-5 19 20-15Z\" fill=\"#287caf\" stroke=\"#174e70\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"m42 26 12-18 11 19m-23 22 12 18 12-20\" fill=\"#72c7d6\" stroke=\"#246182\" stroke-width=\"2\"/><ellipse cx=\"64\" cy=\"38\" rx=\"38\" ry=\"22\" fill=\"#43a3cb\" stroke=\"#246182\" stroke-width=\"3\"/><path d=\"M39 35q22-18 50 0-25 18-50 0Z\" fill=\"#75c9db\" opacity=\"0.72\"/><path d=\"M43 44q20 8 40 0\" fill=\"none\" stroke=\"#e0fff4\" stroke-width=\"3\"/><circle cx=\"84\" cy=\"32\" r=\"4.5\" fill=\"white\"/><circle cx=\"85\" cy=\"32\" r=\"2\" fill=\"#183d53\"/><path d=\"M94 40q9 4 12 9m-12-7q9-1 12-5\" fill=\"none\" stroke=\"#185675\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M39 35 28 29m11 11-12 7\" stroke=\"#1b6584\" stroke-width=\"2\"/><\/svg>","width":110.0,"height":75.0},{"key":"overhead-gold-catfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"110\" height=\"75\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 110 75\"><path d=\"M28 37 8 19l5 18-5 19 20-15Z\" fill=\"#e68c3e\" stroke=\"#a45132\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"m42 26 12-18 11 19m-23 22 12 18 12-20\" fill=\"#ffe18a\" stroke=\"#b96d35\" stroke-width=\"2\"/><ellipse cx=\"64\" cy=\"38\" rx=\"38\" ry=\"22\" fill=\"#ffc354\" stroke=\"#c77835\" stroke-width=\"3\"/><path d=\"M39 35q22-18 50 0-25 18-50 0Z\" fill=\"#ffdf7c\" opacity=\"0.75\"/><path d=\"M43 44q20 8 40 0\" fill=\"none\" stroke=\"#fff5c6\" stroke-width=\"3\"/><circle cx=\"84\" cy=\"32\" r=\"4.5\" fill=\"white\"/><circle cx=\"85\" cy=\"32\" r=\"2\" fill=\"#633c3e\"/><path d=\"M94 40q9 4 12 9m-12-7q9-1 12-5\" fill=\"none\" stroke=\"#9c5434\" stroke-width=\"2\" stroke-linecap=\"round\"/><path d=\"M39 35 28 29m11 11-12 7\" stroke=\"#b76833\" stroke-width=\"2\"/><\/svg>","width":110.0,"height":75.0},{"key":"overhead-violet-catfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"110\" height=\"75\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 110 75\"><path d=\"M28 37 8 19l5 18-5 19 20-15Z\" fill=\"#8059b6\" stroke=\"#493d83\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"m42 26 12-18 11 19m-23 22 12 18 12-20\" fill=\"#c5a2ed\" stroke=\"#60468f\" stroke-width=\"2\"/><ellipse cx=\"64\" cy=\"38\" rx=\"38\" ry=\"22\" fill=\"#9b77ce\" stroke=\"#60468f\" stroke-width=\"3\"/><path d=\"M39 35q22-18 50 0-25 18-50 0Z\" fill=\"#bca0e7\" opacity=\"0.72\"/><path d=\"M43 44q20 8 40 0\" fill=\"none\" stroke=\"#f0e5ff\" stroke-width=\"3\"/><path d=\"m48 29 6-4 6 4 6-4 6 4 6-4\" fill=\"none\" stroke=\"#fff0b5\" stroke-width=\"2.5\"/><circle cx=\"84\" cy=\"32\" r=\"4.5\" fill=\"white\"/><circle cx=\"85\" cy=\"32\" r=\"2\" fill=\"#272651\"/><path d=\"M94 40q9 4 12 9m-12-7q9-1 12-5\" fill=\"none\" stroke=\"#51427b\" stroke-width=\"2\" stroke-linecap=\"round\"/><\/svg>","width":110.0,"height":75.0},{"key":"overhead-crab-tower","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><ellipse cx=\"50\" cy=\"55\" rx=\"25\" ry=\"23\" fill=\"#ff8059\" stroke=\"#a63d3b\" stroke-width=\"4\"/><path d=\"M29 46 17 34 12 20 22 17 31 30m40 16 12-12 5-14-10-3-9 13\" fill=\"#ff8059\" stroke=\"#a63d3b\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"M30 64 17 75m20-7-8 15m34-19 8 11m-1-18 13 12\" stroke=\"#b8493e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"42\" cy=\"41\" r=\"7\" fill=\"white\"/><circle cx=\"59\" cy=\"41\" r=\"7\" fill=\"white\"/><circle cx=\"43\" cy=\"42\" r=\"3\" fill=\"#164c63\"/><circle cx=\"60\" cy=\"42\" r=\"3\" fill=\"#164c63\"/><path d=\"M39 59q11 8 22 0\" fill=\"none\" stroke=\"#873637\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M50 33v-8m-5 0 5-5 5 5\" fill=\"none\" stroke=\"#ffd197\" stroke-width=\"3\" stroke-linecap=\"round\"/><\/svg>","width":100.0,"height":100.0},{"key":"overhead-pearl-cannon","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"56\" r=\"29\" fill=\"#ff9a69\" stroke=\"#a63d3b\" stroke-width=\"4\"/><circle cx=\"50\" cy=\"56\" r=\"20\" fill=\"#ffc27c\" stroke=\"#d27848\" stroke-width=\"3\"/><path d=\"M43 42 43 14Q50 8 57 14L57 43Z\" fill=\"#d39a4d\" stroke=\"#805936\" stroke-width=\"4\"/><ellipse cx=\"50\" cy=\"15\" rx=\"8\" ry=\"6\" fill=\"#fff9dd\" stroke=\"#9a7041\" stroke-width=\"3\"/><circle cx=\"39\" cy=\"54\" r=\"5\" fill=\"white\"/><circle cx=\"61\" cy=\"54\" r=\"5\" fill=\"white\"/><circle cx=\"40\" cy=\"55\" r=\"2\" fill=\"#174d63\"/><circle cx=\"62\" cy=\"55\" r=\"2\" fill=\"#174d63\"/><path d=\"M39 69q11 8 22 0\" fill=\"none\" stroke=\"#873637\" stroke-width=\"3\"/><path d=\"M50 81v7m-4-3 4 4 4-4\" fill=\"none\" stroke=\"#fff0bc\" stroke-width=\"3\"/><\/svg>","width":100.0,"height":100.0},{"key":"overhead-net-coral","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"53\" r=\"31\" fill=\"#7cd8bd\" stroke=\"#168477\" stroke-width=\"4\"/><path d=\"M24 31 76 75M35 23 83 64M20 48 68 84M76 27 25 75M84 44 39 85M63 21 18 60\" fill=\"none\" stroke=\"#269b8b\" stroke-width=\"3\"/><circle cx=\"50\" cy=\"53\" r=\"8\" fill=\"#fff4c7\" stroke=\"#238d83\" stroke-width=\"3\"/><circle cx=\"50\" cy=\"53\" r=\"3\" fill=\"#5cbca6\"/><path d=\"M50 18V9m-5 5 5-5 5 5\" fill=\"none\" stroke=\"#168477\" stroke-width=\"3\" stroke-linecap=\"round\"/><\/svg>","width":100.0,"height":100.0},{"key":"overhead-puffer-spikes","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"m50 5 8 17 15-13 2 20 19-4-8 19 18 9-18 9 8 19-19-4-2 20-15-13-8 17-8-17-15 13-2-20-19 4 8-19L-4 53l18-9-8-19 19 4 2-20 15 13Z\" transform=\"translate(4 0)\" fill=\"#ffd45e\" stroke=\"#c88b36\" stroke-width=\"3\" stroke-linejoin=\"round\"/><circle cx=\"50\" cy=\"52\" r=\"24\" fill=\"#ffbd4f\" stroke=\"#d08c38\" stroke-width=\"4\"/><path d=\"M35 45q5-12 15-12\" fill=\"none\" stroke=\"#fff2b4\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"42\" cy=\"49\" r=\"5\" fill=\"white\"/><circle cx=\"59\" cy=\"49\" r=\"5\" fill=\"white\"/><circle cx=\"43\" cy=\"50\" r=\"2.5\" fill=\"#234e62\"/><circle cx=\"60\" cy=\"50\" r=\"2.5\" fill=\"#234e62\"/><path d=\"M43 64q7 6 14 0\" fill=\"none\" stroke=\"#ad5736\" stroke-width=\"3\" stroke-linecap=\"round\"/><\/svg>","width":100.0,"height":100.0},{"key":"overhead-sonar-shell","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"55\" r=\"31\" fill=\"#5ed1be\" stroke=\"#16877f\" stroke-width=\"4\"/><path d=\"M50 69c-19 0-27-22-14-35 11-11 30-6 31 8 1 10-12 15-18 8-4-5 0-11 5-10\" fill=\"#fff2a8\" stroke=\"#cf9850\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M54 27q14-10 25 0m-21-7q19-13 31 1\" fill=\"none\" stroke=\"#c8fff2\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"49\" cy=\"51\" r=\"5\" fill=\"#fff\"/><circle cx=\"51\" cy=\"51\" r=\"2.5\" fill=\"#154a61\"/><path d=\"M50 86v7m-5-3 5 4 5-4\" fill=\"none\" stroke=\"#16877f\" stroke-width=\"3\"/><\/svg>","width":100.0,"height":100.0},{"key":"overhead-kelp-bloom","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><circle cx=\"50\" cy=\"54\" r=\"24\" fill=\"#4ec5a6\" stroke=\"#168477\" stroke-width=\"4\"/><g fill=\"#ff769c\" stroke=\"#b64072\" stroke-width=\"3\"><ellipse cx=\"50\" cy=\"26\" rx=\"10\" ry=\"19\"/><ellipse cx=\"50\" cy=\"82\" rx=\"10\" ry=\"19\"/><ellipse cx=\"22\" cy=\"54\" rx=\"19\" ry=\"10\"/><ellipse cx=\"78\" cy=\"54\" rx=\"19\" ry=\"10\"/><ellipse cx=\"30\" cy=\"34\" rx=\"10\" ry=\"18\" transform=\"rotate(-45 30 34)\"/><ellipse cx=\"70\" cy=\"34\" rx=\"10\" ry=\"18\" transform=\"rotate(45 70 34)\"/><ellipse cx=\"30\" cy=\"74\" rx=\"10\" ry=\"18\" transform=\"rotate(45 30 74)\"/><ellipse cx=\"70\" cy=\"74\" rx=\"10\" ry=\"18\" transform=\"rotate(-45 70 74)\"/><\/g><circle cx=\"50\" cy=\"54\" r=\"12\" fill=\"#ffe782\" stroke=\"#d68156\" stroke-width=\"3\"/><circle cx=\"46\" cy=\"50\" r=\"3\" fill=\"white\"/><\/svg>","width":100.0,"height":100.0},{"key":"reef-kelp-frond","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"120\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 120\"><path d=\"M50 116Q46 75 51 18\" fill=\"none\" stroke=\"#167b69\" stroke-width=\"8\" stroke-linecap=\"round\"/><path d=\"M49 82Q16 80 15 51Q41 51 50 76M51 63Q83 57 85 31Q58 37 51 58M50 43Q26 35 31 13Q50 19 52 38M48 101Q72 96 78 76Q56 75 49 95\" fill=\"#49bd8c\" stroke=\"#176f68\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"M21 55Q39 57 47 75M82 36Q64 41 55 58M35 18Q47 25 49 39M73 80Q58 84 52 97\" fill=\"none\" stroke=\"#a4edb5\" stroke-width=\"3\" stroke-linecap=\"round\"/><ellipse cx=\"47\" cy=\"115\" rx=\"24\" ry=\"5\" fill=\"#c89d57\"/><\/svg>","width":100.0,"height":120.0},{"key":"reef-crystal-rock","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"110\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 110 100\"><ellipse cx=\"55\" cy=\"89\" rx=\"45\" ry=\"8\" fill=\"#47787c\" opacity=\"0.35\"/><path d=\"m12 82 8-30 16-17 12 8 9-31 17 25 18 5 9 40Z\" fill=\"#8bc9c1\" stroke=\"#397d82\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"m36 39 10 34 10-61 7 54 17-29m-40 20 19 15 17-20\" fill=\"none\" stroke=\"#d5f1ca\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"M19 77q25-9 70 0\" fill=\"none\" stroke=\"#f4dc9c\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"31\" cy=\"66\" r=\"4\" fill=\"#ff9d83\"/><circle cx=\"87\" cy=\"67\" r=\"5\" fill=\"#f4cf6d\"/><\/svg>","width":110.0,"height":100.0},{"key":"reef-bubble-crab-3d","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"shell\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffd0a0\"/><stop offset=\"0.5\" stop-color=\"#ff805d\"/><stop offset=\"1\" stop-color=\"#bd4050\"/><\/linearGradient><linearGradient id=\"base\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffe995\"/><stop offset=\"1\" stop-color=\"#d79644\"/><\/linearGradient><\/defs><ellipse cx=\"51\" cy=\"84\" rx=\"34\" ry=\"10\" fill=\"#12475e\" opacity=\"0.35\"/><ellipse cx=\"50\" cy=\"78\" rx=\"34\" ry=\"15\" fill=\"#21869a\" stroke=\"#155873\" stroke-width=\"4\"/><ellipse cx=\"50\" cy=\"73\" rx=\"29\" ry=\"12\" fill=\"url(#base)\" stroke=\"#fff0b8\" stroke-width=\"3\"/><path d=\"M30 60 17 69m18-5-8 12m43-16 13 9m-18-5 8 12\" stroke=\"#b94442\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M31 48 16 37l-5-17 14 6 12 17m32 5 15-11 5-17-14 6-12 17\" fill=\"url(#shell)\" stroke=\"#a33a42\" stroke-width=\"4\" stroke-linejoin=\"round\"/><ellipse cx=\"50\" cy=\"57\" rx=\"26\" ry=\"21\" fill=\"url(#shell)\" stroke=\"#a33a42\" stroke-width=\"4\"/><path d=\"M34 50q6-15 20-15\" fill=\"none\" stroke=\"#ffe5bd\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"m40 39-2-12m24 12 2-12\" stroke=\"#a33a42\" stroke-width=\"4\"/><circle cx=\"38\" cy=\"27\" r=\"7\" fill=\"#fff\"/><circle cx=\"62\" cy=\"27\" r=\"7\" fill=\"#fff\"/><circle cx=\"40\" cy=\"28\" r=\"3\" fill=\"#17485b\"/><circle cx=\"64\" cy=\"28\" r=\"3\" fill=\"#17485b\"/><circle cx=\"32\" cy=\"61\" r=\"3\" fill=\"#ffc1a0\"/><circle cx=\"68\" cy=\"61\" r=\"3\" fill=\"#ffc1a0\"/><path d=\"M43 64q7 6 14 0\" fill=\"none\" stroke=\"#843744\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"22\" cy=\"33\" r=\"3\" fill=\"#d8ffff\"/><circle cx=\"79\" cy=\"28\" r=\"4\" fill=\"#d8ffff\"/><\/svg>","width":100.0,"height":100.0},{"key":"reef-cannon-crab-3d","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"s\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffc894\"/><stop offset=\"1\" stop-color=\"#e4554c\"/><\/linearGradient><linearGradient id=\"g\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffe58b\"/><stop offset=\"1\" stop-color=\"#be7837\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"84\" rx=\"36\" ry=\"10\" fill=\"#15485d\" opacity=\"0.36\"/><ellipse cx=\"50\" cy=\"77\" rx=\"35\" ry=\"15\" fill=\"#277f91\" stroke=\"#15566b\" stroke-width=\"4\"/><ellipse cx=\"50\" cy=\"72\" rx=\"29\" ry=\"11\" fill=\"#f9d47c\" stroke=\"#fff1bd\" stroke-width=\"3\"/><path d=\"m31 60-14 10m20-6-8 13m40-17 14 10m-20-6 8 13\" stroke=\"#c74f48\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M30 51 15 40l-3-18 16 8 10 18m32 3 15-11 3-18-16 8-10 18\" fill=\"url(#s)\" stroke=\"#9e3940\" stroke-width=\"4\"/><ellipse cx=\"49\" cy=\"60\" rx=\"25\" ry=\"19\" fill=\"url(#s)\" stroke=\"#9e3940\" stroke-width=\"4\"/><circle cx=\"39\" cy=\"43\" r=\"7\" fill=\"white\"/><circle cx=\"60\" cy=\"43\" r=\"7\" fill=\"white\"/><circle cx=\"41\" cy=\"44\" r=\"3\" fill=\"#184a61\"/><circle cx=\"62\" cy=\"44\" r=\"3\" fill=\"#184a61\"/><path d=\"m50 37 16-18 19 4-3 11-19-2-11 12Z\" fill=\"url(#g)\" stroke=\"#78532f\" stroke-width=\"4\" stroke-linejoin=\"round\"/><ellipse cx=\"83\" cy=\"23\" rx=\"7\" ry=\"6\" fill=\"#fffce4\" stroke=\"#9a7041\" stroke-width=\"3\"/><path d=\"M34 56q4-12 14-13\" fill=\"none\" stroke=\"#ffe2b7\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M44 66q6 6 12 0\" fill=\"none\" stroke=\"#81363a\" stroke-width=\"3\"/><\/svg>","width":100.0,"height":100.0},{"key":"reef-net-coral-3d","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"leaf\" x2=\"0\" y2=\"1\"><stop stop-color=\"#bbf8de\"/><stop offset=\"1\" stop-color=\"#39a895\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"85\" rx=\"35\" ry=\"10\" fill=\"#174b61\" opacity=\"0.34\"/><ellipse cx=\"50\" cy=\"78\" rx=\"33\" ry=\"14\" fill=\"#257e91\" stroke=\"#15576d\" stroke-width=\"4\"/><ellipse cx=\"50\" cy=\"73\" rx=\"28\" ry=\"10\" fill=\"#eecf83\" stroke=\"#fff1bf\" stroke-width=\"3\"/><path d=\"m25 77 5-26 10-11 10 15 10-18 12 16 3 24Z\" fill=\"url(#leaf)\" stroke=\"#14766d\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"m35 56-9-19m20 19-1-25m16 25 9-25m7 30 9-17\" fill=\"none\" stroke=\"#167b70\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M28 31Q50 7 76 28l-8 26Q51 42 35 55Z\" fill=\"url(#leaf)\" stroke=\"#19776f\" stroke-width=\"4\"/><path d=\"m32 31 36 20M44 20l23 24M70 30 37 49M59 18 34 40\" fill=\"none\" stroke=\"#228e83\" stroke-width=\"2.5\"/><path d=\"M32 29q16-15 31-7\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3\" opacity=\"0.8\"/><circle cx=\"51\" cy=\"43\" r=\"6\" fill=\"#fff1bc\" stroke=\"#16766f\" stroke-width=\"2\"/><\/svg>","width":100.0,"height":100.0},{"key":"reef-puffer-spike-3d","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><radialGradient id=\"p\" cx=\"34%\" cy=\"22%\"><stop stop-color=\"#fff6ad\"/><stop offset=\"1\" stop-color=\"#ee9c3e\"/><\/radialGradient><\/defs><ellipse cx=\"50\" cy=\"84\" rx=\"36\" ry=\"11\" fill=\"#164a60\" opacity=\"0.36\"/><ellipse cx=\"50\" cy=\"78\" rx=\"34\" ry=\"14\" fill=\"#267e91\" stroke=\"#15576c\" stroke-width=\"4\"/><ellipse cx=\"50\" cy=\"73\" rx=\"27\" ry=\"10\" fill=\"#f0d083\" stroke=\"#fff0b2\" stroke-width=\"3\"/><path d=\"m27 71-14 9 8-16-13-9 17-3-6-15 15 6 5-17 11 15 10-15 5 18 17-7-6 16 17 4-15 9 9 16-16-7-8 15-11-13-11 14-10-16Z\" fill=\"#f8ca4f\" stroke=\"#ca8736\" stroke-width=\"3\" stroke-linejoin=\"round\"/><circle cx=\"50\" cy=\"58\" r=\"24\" fill=\"url(#p)\" stroke=\"#c98235\" stroke-width=\"4\"/><path d=\"M34 51q5-12 15-12\" fill=\"none\" stroke=\"#fff8cb\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"42\" cy=\"54\" r=\"6\" fill=\"white\"/><circle cx=\"60\" cy=\"54\" r=\"6\" fill=\"white\"/><circle cx=\"44\" cy=\"55\" r=\"3\" fill=\"#244c60\"/><circle cx=\"62\" cy=\"55\" r=\"3\" fill=\"#244c60\"/><path d=\"M44 69q6 5 12 0\" fill=\"none\" stroke=\"#9d5132\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"m39 79-4 9m26-9 4 9\" stroke=\"#a55137\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"31\" cy=\"66\" r=\"2\" fill=\"#dd8937\"/><circle cx=\"68\" cy=\"66\" r=\"2\" fill=\"#dd8937\"/><\/svg>","width":100.0,"height":100.0},{"key":"reef-sonar-shell-3d","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"t\" x2=\"0\" y2=\"1\"><stop stop-color=\"#c9fff0\"/><stop offset=\"1\" stop-color=\"#3cb6a9\"/><\/linearGradient><linearGradient id=\"shell\" x2=\"0\" y2=\"1\"><stop stop-color=\"#fff7c6\"/><stop offset=\"1\" stop-color=\"#d59647\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"85\" rx=\"35\" ry=\"10\" fill=\"#154a60\" opacity=\"0.35\"/><ellipse cx=\"50\" cy=\"78\" rx=\"33\" ry=\"14\" fill=\"#258192\" stroke=\"#15586d\" stroke-width=\"4\"/><ellipse cx=\"50\" cy=\"73\" rx=\"28\" ry=\"10\" fill=\"#f1d286\" stroke=\"#fff3c2\" stroke-width=\"3\"/><path d=\"m20 80 7-25 10-9 13 13 13-14 11 11 7 24Z\" fill=\"url(#t)\" stroke=\"#13776f\" stroke-width=\"4\"/><path d=\"m31 56-7-18m19 16-2-24m18 23 6-25m9 28 9-17\" fill=\"none\" stroke=\"#138278\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M31 43C21 27 32 12 47 15c9 1 12 9 8 16-3 5-10 6-14 2-4-3-2-8 2-10\" fill=\"url(#shell)\" stroke=\"#bb8440\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M35 34q-4-12 7-15\" fill=\"none\" stroke=\"#fff\" stroke-width=\"3\"/><circle cx=\"54\" cy=\"49\" r=\"7\" fill=\"#fff\"/><circle cx=\"56\" cy=\"49\" r=\"3\" fill=\"#164a60\"/><path d=\"M44 70q7 6 15-1\" fill=\"none\" stroke=\"#126d67\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M71 20q10-7 17 0M74 15q12-11 21-1\" fill=\"none\" stroke=\"#baffee\" stroke-width=\"2.5\" stroke-linecap=\"round\"/><\/svg>","width":100.0,"height":100.0},{"key":"reef-kelp-bloom-3d","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><defs><linearGradient id=\"k\" x2=\"0\" y2=\"1\"><stop stop-color=\"#a5f6d8\"/><stop offset=\"1\" stop-color=\"#249c8b\"/><\/linearGradient><linearGradient id=\"f\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffc0d1\"/><stop offset=\"1\" stop-color=\"#e34e83\"/><\/linearGradient><\/defs><ellipse cx=\"50\" cy=\"85\" rx=\"35\" ry=\"10\" fill=\"#164b60\" opacity=\"0.34\"/><ellipse cx=\"50\" cy=\"78\" rx=\"33\" ry=\"14\" fill=\"#258194\" stroke=\"#15576d\" stroke-width=\"4\"/><ellipse cx=\"50\" cy=\"73\" rx=\"28\" ry=\"10\" fill=\"#efd184\" stroke=\"#fff2c0\" stroke-width=\"3\"/><path d=\"m24 81 6-26 11-8 9 13 10-14 12 10 6 25Z\" fill=\"url(#k)\" stroke=\"#147d72\" stroke-width=\"4\" stroke-linejoin=\"round\"/><path d=\"m38 66-10-25m19 23 1-31m11 34 12-25\" fill=\"none\" stroke=\"#168477\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M49 42c-18-7-22-20-11-24 7-2 11 4 12 11 1-12 10-19 17-13 6 6 0 17-11 23 13-6 24 0 19 8-4 7-17 4-25-2-7 11-20 14-23 6-2-6 6-10 22-9Z\" fill=\"url(#f)\" stroke=\"#ad3e71\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"M39 27q3-9 8-3m18-4q5 3 2 9\" fill=\"none\" stroke=\"#ffe6ee\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"51\" cy=\"40\" r=\"7\" fill=\"#ffe783\" stroke=\"#d68156\" stroke-width=\"2\"/><circle cx=\"49\" cy=\"38\" r=\"2.5\" fill=\"#fff\"/><\/svg>","width":100.0,"height":100.0},{"key":"moab-catfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"180\" height=\"120\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 180 120\"><defs><linearGradient id=\"blue\" x2=\"0\" y2=\"1\"><stop stop-color=\"#b5f4fa\"/><stop offset=\"0.34\" stop-color=\"#46bfd6\"/><stop offset=\"1\" stop-color=\"#176b9b\"/><\/linearGradient><linearGradient id=\"metal\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ecfbeb\"/><stop offset=\"1\" stop-color=\"#8bbbc4\"/><\/linearGradient><\/defs><path d=\"M47 59 13 28l9 31-9 31 34-28Z\" fill=\"#287dac\" stroke=\"#15526f\" stroke-width=\"5\" stroke-linejoin=\"round\"/><path d=\"M59 39 48 15l28 20m-19 42L47 103l30-24\" fill=\"#75d4df\" stroke=\"#247b99\" stroke-width=\"4\" stroke-linejoin=\"round\"/><ellipse cx=\"103\" cy=\"60\" rx=\"62\" ry=\"39\" fill=\"url(#blue)\" stroke=\"#175a80\" stroke-width=\"5\"/><path d=\"M50 48Q69 16 110 18Q148 17 163 48L151 55Q108 42 57 58Z\" fill=\"url(#metal)\" stroke=\"#356d81\" stroke-width=\"4\"/><path d=\"M62 48 75 25m18 22 3-27m22 29 10-22m13 27 11-17\" fill=\"none\" stroke=\"#4d96a7\" stroke-width=\"4\"/><path d=\"M55 70Q101 102 151 73L143 92Q101 114 62 91Z\" fill=\"#197aa0\" stroke=\"#155a7d\" stroke-width=\"4\"/><path d=\"M67 78q34 18 70 2\" fill=\"none\" stroke=\"#aff4e9\" stroke-width=\"5\"/><circle cx=\"143\" cy=\"50\" r=\"8\" fill=\"#fff\" stroke=\"#2e718a\" stroke-width=\"2\"/><circle cx=\"146\" cy=\"51\" r=\"3.5\" fill=\"#133b57\"/><path d=\"M157 69q15-3 19-15m-18 19q14 7 18 17\" fill=\"none\" stroke=\"#174e70\" stroke-width=\"3.5\" stroke-linecap=\"round\"/><path d=\"M39 60 28 52m11 13-12 10\" stroke=\"#174e70\" stroke-width=\"3\"/><path d=\"M75 36Q108 23 139 37\" fill=\"none\" stroke=\"#fff\" stroke-width=\"4\" opacity=\"0.75\" stroke-linecap=\"round\"/><circle cx=\"104\" cy=\"62\" r=\"4\" fill=\"#dcffff\"/><\/svg>","width":180.0,"height":120.0},{"key":"bfb-catfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"200\" height=\"140\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 140\"><defs><linearGradient id=\"red\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffb49a\"/><stop offset=\"0.3\" stop-color=\"#ef695b\"/><stop offset=\"1\" stop-color=\"#a92946\"/><\/linearGradient><linearGradient id=\"gold\" x2=\"0\" y2=\"1\"><stop stop-color=\"#fff0a7\"/><stop offset=\"1\" stop-color=\"#c57735\"/><\/linearGradient><\/defs><path d=\"M48 70 12 35l10 35-10 35 36-33Z\" fill=\"#c44953\" stroke=\"#792d43\" stroke-width=\"6\" stroke-linejoin=\"round\"/><path d=\"M60 47 48 15l31 27m-19 48-12 34 32-30\" fill=\"#f59a83\" stroke=\"#923b4e\" stroke-width=\"5\" stroke-linejoin=\"round\"/><ellipse cx=\"112\" cy=\"70\" rx=\"69\" ry=\"47\" fill=\"url(#red)\" stroke=\"#812f4d\" stroke-width=\"6\"/><path d=\"M53 54Q73 13 117 16Q166 14 184 53L170 62Q119 43 61 65Z\" fill=\"url(#gold)\" stroke=\"#8b4b43\" stroke-width=\"5\"/><path d=\"M68 49 83 23m21 26 2-31m25 34 12-24m14 29 12-18\" fill=\"none\" stroke=\"#a45d40\" stroke-width=\"5\"/><path d=\"M55 83Q111 119 171 82L160 108Q111 132 66 108Z\" fill=\"#b63c50\" stroke=\"#812f4d\" stroke-width=\"5\"/><path d=\"M67 88Q110 112 156 91\" fill=\"none\" stroke=\"#ffd4b4\" stroke-width=\"5\"/><circle cx=\"160\" cy=\"55\" r=\"9\" fill=\"#fff\" stroke=\"#783e51\" stroke-width=\"3\"/><circle cx=\"164\" cy=\"56\" r=\"4\" fill=\"#382b4a\"/><path d=\"M176 81q17-3 20-17m-20 23q17 8 20 20\" fill=\"none\" stroke=\"#752d49\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M42 70 29 59m13 17L28 87\" stroke=\"#7f344c\" stroke-width=\"4\"/><path d=\"M75 36Q117 19 152 38\" fill=\"none\" stroke=\"#fff4d4\" stroke-width=\"5\" opacity=\"0.8\" stroke-linecap=\"round\"/><path d=\"M72 67q12-7 23 0m16-2q12-7 23 0\" fill=\"none\" stroke=\"#a33c4c\" stroke-width=\"4\"/><circle cx=\"116\" cy=\"74\" r=\"5\" fill=\"#fff0cf\"/><\/svg>","width":200.0,"height":140.0},{"key":"zomg-catfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"220\" height=\"140\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 220 140\"><defs><linearGradient id=\"z\" x2=\"0\" y2=\"1\"><stop stop-color=\"#a7c9df\"/><stop offset=\"0.35\" stop-color=\"#527b9d\"/><stop offset=\"1\" stop-color=\"#263c66\"/><\/linearGradient><\/defs><path d=\"M37 66 8 38l8 29-8 30 29-27Z\" fill=\"#334d76\" stroke=\"#182d50\" stroke-width=\"7\" stroke-linejoin=\"round\"/><path d=\"m64 39-11-24 29 22m-28 60-9 28 32-27\" fill=\"#7598b7\" stroke=\"#263d64\" stroke-width=\"5\" stroke-linejoin=\"round\"/><ellipse cx=\"117\" cy=\"69\" rx=\"81\" ry=\"51\" fill=\"url(#z)\" stroke=\"#1a2d50\" stroke-width=\"8\"/><path d=\"M48 48q20-34 70-34t75 34l-10 13q-61-27-127 0Z\" fill=\"#bed8e8\" stroke=\"#304b6a\" stroke-width=\"5\"/><path d=\"M50 43 68 22m19 18 7-27m22 26 5-27m20 32 13-23m13 32 10-20\" fill=\"none\" stroke=\"#344f72\" stroke-width=\"7\"/><path d=\"M43 81q71 47 142 1l-13 25q-61 34-116-1Z\" fill=\"#243b61\" stroke=\"#17294c\" stroke-width=\"5\"/><path d=\"M56 85q59 31 116 1\" fill=\"none\" stroke=\"#8acbe3\" stroke-width=\"5\"/><circle cx=\"168\" cy=\"55\" r=\"10\" fill=\"#fff\" stroke=\"#243a58\" stroke-width=\"4\"/><circle cx=\"171\" cy=\"56\" r=\"4\" fill=\"#172541\"/><path d=\"M186 79q22-4 26-20m-26 27q18 8 24 20\" fill=\"none\" stroke=\"#1c3154\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M77 38q41-21 85-3\" fill=\"none\" stroke=\"#eaf8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M86 67h12m18 0h12m18 0h10\" stroke=\"#d4effa\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"117\" cy=\"78\" r=\"5\" fill=\"#d7f8ff\"/><\/svg>","width":220.0,"height":140.0},{"key":"bad-catfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"240\" height=\"150\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 150\"><defs><linearGradient id=\"b\" x2=\"0\" y2=\"1\"><stop stop-color=\"#ffb1a0\"/><stop offset=\"0.35\" stop-color=\"#e24a50\"/><stop offset=\"1\" stop-color=\"#8f203f\"/><\/linearGradient><\/defs><path d=\"M39 72 7 39l10 34-10 33 32-30Z\" fill=\"#a42e48\" stroke=\"#581d3b\" stroke-width=\"8\" stroke-linejoin=\"round\"/><path d=\"m62 43-13-29 34 27m-30 65-12 29 38-31\" fill=\"#f07a71\" stroke=\"#742447\" stroke-width=\"6\" stroke-linejoin=\"round\"/><ellipse cx=\"125\" cy=\"74\" rx=\"89\" ry=\"55\" fill=\"url(#b)\" stroke=\"#571d3b\" stroke-width=\"9\"/><path d=\"M49 51q22-39 78-39t82 39l-12 15q-66-30-140 0Z\" fill=\"#ffd0b2\" stroke=\"#7a2945\" stroke-width=\"6\"/><path d=\"m51 45 21-26 8 28m18-8 5-28 16 26m15-26 12 27 17-24m5 38 18-23 8 29\" fill=\"none\" stroke=\"#632043\" stroke-width=\"8\" stroke-linejoin=\"round\"/><path d=\"M46 88q76 52 157 1l-15 28q-68 35-127-1Z\" fill=\"#762141\" stroke=\"#521934\" stroke-width=\"6\"/><path d=\"M61 91q64 34 127 1\" fill=\"none\" stroke=\"#ffc1ab\" stroke-width=\"6\"/><circle cx=\"181\" cy=\"58\" r=\"11\" fill=\"#fff\" stroke=\"#60203d\" stroke-width=\"4\"/><circle cx=\"184\" cy=\"59\" r=\"4.5\" fill=\"#241b36\"/><path d=\"M198 84q23-5 28-22m-28 30q20 10 26 24\" fill=\"none\" stroke=\"#521936\" stroke-width=\"6\" stroke-linecap=\"round\"/><path d=\"M73 38q50-25 96-2\" fill=\"none\" stroke=\"#fff0df\" stroke-width=\"6\" stroke-linecap=\"round\"/><path d=\"M91 75h13m18 0h13m18 0h11\" stroke=\"#ffe5cb\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"126\" cy=\"86\" r=\"6\" fill=\"#fff0ca\"/><\/svg>","width":240.0,"height":150.0}]});
