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

window.DIYAssetLibrary.install({"assets":[{"key":"fisher","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"110\" height=\"140\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 110 140\"><g stroke=\"#374854\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M53 111v21m23-21v21\" fill=\"none\"/><path d=\"M42 83 29 113h58L75 83\" fill=\"#385e8c\"/><path d=\"M42 84 30 101 16 75m60 9 13 14 12-15\" fill=\"none\"/><path d=\"M35 50q20-15 45 0l-3 37H38z\" fill=\"#ffcc48\"/><circle cx=\"57\" cy=\"34\" r=\"19\" fill=\"#f6b880\"/><path d=\"M35 27q13-24 42-6l6 8H30z\" fill=\"#28638d\"/><path d=\"M63 19h22q3 0 5 5H65\" fill=\"#28638d\"/><circle cx=\"51\" cy=\"36\" r=\"2\" fill=\"#253b46\" stroke=\"none\"/><circle cx=\"65\" cy=\"36\" r=\"2\" fill=\"#253b46\" stroke=\"none\"/><path d=\"M53 44q6 6 12 0\" fill=\"none\"/><\/g><\/svg>","width":110.0,"height":140.0},{"key":"crab-red","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"80\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 80\"><g stroke=\"#823d35\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"><path d=\"M22 50 5 40m18 17L7 60m20 3-11 10m62-23 17-10M77 57l16 3M73 63l11 10M39 26V15m22 11V15\"/><path d=\"M26 42 12 26 3 29l8 14 13 10M74 42l14-16 9 3-8 14-13 10\" fill=\"#ff8b65\"/><ellipse cx=\"50\" cy=\"49\" rx=\"29\" ry=\"23\" fill=\"#f46e57\"/><circle cx=\"39\" cy=\"26\" r=\"6\" fill=\"white\"/><circle cx=\"61\" cy=\"26\" r=\"6\" fill=\"white\"/><circle cx=\"40\" cy=\"26\" r=\"2\" fill=\"#203b47\" stroke=\"none\"/><circle cx=\"60\" cy=\"26\" r=\"2\" fill=\"#203b47\" stroke=\"none\"/><path d=\"M44 55q6 5 12 0\"/><\/g><\/svg>","width":100.0,"height":80.0},{"key":"crab-blue","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"80\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 80\"><g stroke=\"#163e9c\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" fill=\"none\"><path d=\"M22 50 5 40m18 17L7 60m20 3-11 10m62-23 17-10M77 57l16 3M73 63l11 10M39 26V15m22 11V15\"/><path d=\"M26 42 12 26 3 29l8 14 13 10M74 42l14-16 9 3-8 14-13 10\" fill=\"#4599f2\"/><ellipse cx=\"50\" cy=\"49\" rx=\"29\" ry=\"23\" fill=\"#1462df\"/><circle cx=\"39\" cy=\"26\" r=\"6\" fill=\"white\"/><circle cx=\"61\" cy=\"26\" r=\"6\" fill=\"white\"/><circle cx=\"40\" cy=\"26\" r=\"2\" fill=\"#142f65\" stroke=\"none\"/><circle cx=\"60\" cy=\"26\" r=\"2\" fill=\"#142f65\" stroke=\"none\"/><path d=\"M44 55q6 5 12 0\"/><path d=\"M48 39 50 35l2 4\" stroke=\"#a8dcff\"/><\/g><\/svg>","width":100.0,"height":80.0},{"key":"fishing-rod","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"140\" height=\"110\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 140 110\"><path d=\"M8 99Q58 36 131 8\" fill=\"none\" stroke=\"#513b35\" stroke-width=\"6\" stroke-linecap=\"round\"/><path d=\"M95 20 131 8\" fill=\"none\" stroke=\"#f5c770\" stroke-width=\"3\"/><circle cx=\"37\" cy=\"72\" r=\"10\" fill=\"#ffc555\" stroke=\"#513b35\" stroke-width=\"3\"/><circle cx=\"37\" cy=\"72\" r=\"3\" fill=\"#513b35\"/><\/svg>","width":140.0,"height":110.0},{"key":"sunny-crab-pier","dimension":"2d","factory":null,"version":"v1","kind":"image","align":"center","src":"https://cdn.diy.org/prod/projects/vibecode/c56b9f3871da4e2ab27f46750f97faad/assets/sunny-crab-pier/454d8279-81aa-4dae-b91f-7016146a56a9.webp","width":1536,"height":864,"variants":{"phone":{"url":"https://cdn.diy.org/prod/projects/vibecode/c56b9f3871da4e2ab27f46750f97faad/assets/sunny-crab-pier/a123f3fb-604f-4866-b01e-ad52b93c6608.webp","width":576,"height":1024},"strip":{"url":"https://cdn.diy.org/prod/projects/vibecode/c56b9f3871da4e2ab27f46750f97faad/assets/sunny-crab-pier/14583328-6be7-4154-864f-7fef936663dc.webp","width":1344,"height":864}},"pictureKind":"background"},{"key":"sea-coral","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"120\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 120 100\"><g stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 88V57m0 12L10 54m12 10 12-18M52 88V40m0 18L40 43m12 10 15-25m0 60V58m0 13-12-10m12 7 13-18M91 88V51m0 17 13-16\" fill=\"none\" stroke=\"#f25f76\" stroke-width=\"10\"/><path d=\"M36 88V62m0 10-10-12m10 8 10-16M78 88V45m0 18-12-12m12 8 14-19\" fill=\"none\" stroke=\"#ff9f68\" stroke-width=\"8\"/><path d=\"M8 89h96\" stroke=\"#d94868\" stroke-width=\"5\"/><circle cx=\"22\" cy=\"53\" r=\"5\" fill=\"#ffd166\"/><circle cx=\"52\" cy=\"38\" r=\"5\" fill=\"#ffd166\"/><circle cx=\"67\" cy=\"31\" r=\"5\" fill=\"#ffd166\"/><circle cx=\"91\" cy=\"49\" r=\"5\" fill=\"#ffd166\"/><\/g><\/svg>","width":120.0,"height":100.0}]});
