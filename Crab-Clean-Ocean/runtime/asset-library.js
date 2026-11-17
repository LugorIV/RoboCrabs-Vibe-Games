// DIY asset library: generated from assets/manifest.json on every save. Do not edit.
/* DIY asset library runtime. Points each bound asset factory (ctx.assets.char0001)
   at the kid's current version, so game code never changes when an asset does.
   The game never waits for art: a look still loading shows the original, then swaps. */
(function () {
  var lib = window.DIYAssetLibrary || {};
  window.DIYAssetLibrary = lib;
  var RASTER_SIZE = 256;
  var MAX_RASTER = 1024;
  var DEFAULT_SIZE = 96;
  var assets = {};
  var byFactory = {};
  // Keyed per version, so a new look never reuses an old picture.
  var loading = {};
  var pictures = {};
  var failed = {};
  var textures = {};
  var models = {};
  // Per picture: the largest side the game asks for (device pixels), the side it was drawn at
  // and the loaded image, so a picture shown big is drawn again sharper.
  var wanted = {};
  var drawnAt = {};
  var images = {};

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

  // SVGs are drawn onto a canvas so every renderer gets crisp pixels: at the largest size the
  // game shows them (256 to 1024 px on the longest side).
  function rasterSide(id) {
    return Math.min(MAX_RASTER, Math.max(RASTER_SIZE, Math.ceil(wanted[id] || 0)));
  }

  function toSource(img, entry, id) {
    if (entry.kind !== "svg") return img;
    var w = entry.width || img.naturalWidth || RASTER_SIZE;
    var h = entry.height || img.naturalHeight || RASTER_SIZE;
    var side = rasterSide(id);
    drawnAt[id] = side;
    var scale = side / Math.max(w, h, 1);
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
          var source = toSource(result.loaded.img, result.entry, id);
          // An SVG is copied onto a canvas, so its blob URL is no longer needed.
          if (source !== result.loaded.img) {
            releaseUrl(result.loaded.url);
            images[id] = { img: result.loaded.img, entry: result.entry };
          }
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

  // The game shows this picture at options.size: remember it, and draw it again if it is
  // already drawn smaller than that.
  function want(entry, options) {
    var id = slot(entry);
    var side = Number(options && (options.size || options.width)) || DEFAULT_SIZE;
    var ratio = Math.min(2, Math.max(1, Number(window.devicePixelRatio) || 1));
    wanted[id] = Math.max(wanted[id] || 0, side * ratio);
    var image = images[id];
    if (!image || !pictures[id] || drawnAt[id] >= rasterSide(id)) return;
    try {
      pictures[id] = toSource(image.img, image.entry, id);
      delete textures[id];
    } catch (_error) {}
  }

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
      want(picture, options);
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

window.DIYAssetLibrary.install({"assets":[{"key":"blue-crab","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"90\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 90\"><g fill=\"#197acb\" stroke=\"#094b86\" stroke-width=\"3\" stroke-linejoin=\"round\"><path d=\"M28 51 9 40 5 22 15 27 18 37 29 40M72 51 91 40 95 22 85 27 82 37 71 40\"/><path d=\"M21 56 8 65M25 63 15 77M79 56 92 65M75 63 85 77\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"50\" cy=\"51\" rx=\"30\" ry=\"23\" fill=\"#2e9ef2\"/><path d=\"M39 34 37 17M61 34 63 17\" fill=\"none\"/><circle cx=\"37\" cy=\"16\" r=\"7\" fill=\"white\"/><circle cx=\"63\" cy=\"16\" r=\"7\" fill=\"white\"/><circle cx=\"39\" cy=\"16\" r=\"3\" fill=\"#143255\" stroke=\"none\"/><circle cx=\"61\" cy=\"16\" r=\"3\" fill=\"#143255\" stroke=\"none\"/><\/g><path d=\"M40 58 Q50 67 60 58\" fill=\"none\" stroke=\"#094b86\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"29\" cy=\"48\" r=\"4\" fill=\"#7bd9ff\"/><circle cx=\"71\" cy=\"48\" r=\"4\" fill=\"#7bd9ff\"/><\/svg>","width":100.0,"height":90.0},{"key":"trash-bottle","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"60\" height=\"90\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 90\"><g transform=\"rotate(22 30 45)\"><rect x=\"23\" y=\"4\" width=\"14\" height=\"10\" rx=\"2\" fill=\"#28608e\"/><path d=\"M22 15h16v13q10 7 10 18v29q0 8-8 8H20q-8 0-8-8V46q0-11 10-18z\" fill=\"#a9e9dc\" stroke=\"#307e9a\" stroke-width=\"3\"/><path d=\"M13 49h34v21H13z\" fill=\"#eee8b3\" stroke=\"#33869e\" stroke-width=\"2\"/><path d=\"M20 75h20\" stroke=\"#fff\" stroke-width=\"3\"/><\/g><\/svg>","width":60.0,"height":90.0},{"key":"trash-bag","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"90\" height=\"90\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 90 90\"><path d=\"M18 21 Q18 7 30 9 L34 23 56 23 60 9 Q72 6 73 22 L67 26 76 71 Q47 85 15 71 L23 26z\" fill=\"#f7e2f0\" stroke=\"#ac84af\" stroke-width=\"3\" stroke-linejoin=\"round\"/><path d=\"M25 36 Q44 43 65 34M23 61 Q44 68 68 60\" fill=\"none\" stroke=\"#d5b6d5\" stroke-width=\"3\"/><\/svg>","width":90.0,"height":90.0},{"key":"trash-can","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"70\" height=\"90\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 70 90\"><g transform=\"rotate(-15 35 45)\"><rect x=\"14\" y=\"13\" width=\"42\" height=\"65\" rx=\"9\" fill=\"#f1806b\" stroke=\"#99545c\" stroke-width=\"3\"/><ellipse cx=\"35\" cy=\"14\" rx=\"21\" ry=\"6\" fill=\"#c8e2dd\" stroke=\"#608a9b\" stroke-width=\"3\"/><path d=\"M15 65h40M27 40q8-11 17 0t-17 0\" fill=\"none\" stroke=\"#fff0d0\" stroke-width=\"4\"/><ellipse cx=\"35\" cy=\"76\" rx=\"20\" ry=\"5\" fill=\"#bd615b\"/><\/g><\/svg>","width":70.0,"height":90.0},{"key":"sunny-reef","dimension":"2d","factory":null,"version":"v1","kind":"image","align":"center","src":"https://cdn.diy.org/prod/projects/vibecode/f52922efb74f442cb0d30a30cfab6ef2/assets/sunny-reef/be544089-0ec0-4413-bf00-5c2dd2160b4c.webp","width":1536,"height":864,"variants":{"phone":{"url":"https://cdn.diy.org/prod/projects/vibecode/f52922efb74f442cb0d30a30cfab6ef2/assets/sunny-reef/4d1140ec-1b35-4118-a645-e72e2bb14231.webp","width":576,"height":1024},"strip":{"url":"https://cdn.diy.org/prod/projects/vibecode/f52922efb74f442cb0d30a30cfab6ef2/assets/sunny-reef/cf7be721-5c55-4dc5-9ed0-552a6327477f.webp","width":1344,"height":864}},"pictureKind":"background"},{"key":"trash-net","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"90\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 90\"><path d=\"M18 18Q8 24 13 37L8 47Q14 55 10 66Q17 78 31 73Q40 84 51 75Q62 82 69 70Q84 74 86 61Q96 52 87 42Q94 29 82 23Q74 10 61 18Q49 8 39 18Q27 11 18 18Z\" fill=\"#b8d9c7\" stroke=\"#316f69\" stroke-width=\"5\" stroke-linejoin=\"round\"/><path d=\"M17 27 78 66M11 46 63 77M27 17 88 54M15 62 72 24M31 76 82 35M47 78 88 47M17 38 68 16M21 20 82 59\" fill=\"none\" stroke=\"#477f74\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M18 18Q8 24 13 37L8 47Q14 55 10 66Q17 78 31 73Q40 84 51 75Q62 82 69 70Q84 74 86 61Q96 52 87 42Q94 29 82 23\" fill=\"none\" stroke=\"#e6c77c\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-dasharray=\"5 5\"/><circle cx=\"27\" cy=\"24\" r=\"4\" fill=\"#ffad56\"/><circle cx=\"77\" cy=\"65\" r=\"4\" fill=\"#ffad56\"/><\/svg>","width":100.0,"height":90.0},{"key":"player","dimension":"2d","factory":"char0979","version":"v1","kind":"catalog","align":"bottom","target":"char0979"},{"key":"big-blue-catfish","dimension":"2d","factory":null,"version":"v2","kind":"svg","align":"center","svg":"<svg width=\"240\" height=\"150\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 240 150\"><g stroke=\"#073e78\" stroke-width=\"5\" stroke-linejoin=\"round\" stroke-linecap=\"round\"><path fill=\"#1976c9\" d=\"M44 62 8 35 18 72 7 107 49 88Q75 121 133 118Q192 115 218 80Q193 46 137 39Q79 31 44 62Z\"/><path fill=\"#49a9f2\" d=\"M45 62Q73 37 128 42Q177 45 208 76Q177 103 128 109Q73 113 45 87Z\"/><path fill=\"#1265ad\" d=\"M83 43Q99 13 124 9L135 41Z M87 108Q102 137 128 140L141 109Z M151 51Q172 29 190 44L179 67Z\"/><path fill=\"none\" d=\"M199 74Q227 56 236 62M203 83Q228 97 236 91\"/><path fill=\"none\" stroke=\"#0b4d8e\" d=\"M175 60Q162 77 176 96\"/><\/g><path d=\"M173 79Q201 73 231 70Q233 82 224 93Q202 106 179 98Q171 91 173 79Z\" fill=\"#35152f\" stroke=\"#073e78\" stroke-width=\"5\" stroke-linejoin=\"round\"/><g fill=\"#fff8db\" stroke=\"#92d9ff\" stroke-width=\"2.2\" stroke-linejoin=\"round\"><path d=\"M176 79 190 77 185 96Z M190 77 205 75 200 96Z M205 75 220 73 216 94Z M220 72 231 71 226 89Z\"/><path d=\"M179 97 193 102 188 88Z M193 101 208 98 201 86Z M208 97 222 92 214 83Z\"/><\/g><path d=\"M179 99Q201 108 224 93\" fill=\"none\" stroke=\"#07528d\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M186 59Q198 56 201 67Q201 77 190 78Q181 75 182 67Z\" fill=\"#fff\" stroke=\"#073e78\" stroke-width=\"4\"/><circle cx=\"192\" cy=\"67\" r=\"5\" fill=\"#092b50\"/><circle cx=\"193\" cy=\"65\" r=\"1.8\" fill=\"#fff\"/><path d=\"M66 54Q102 40 141 49\" fill=\"none\" stroke=\"#8bd6ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\"0.85\"/><circle cx=\"92\" cy=\"76\" r=\"3\" fill=\"#b5eaff\"/><circle cx=\"122\" cy=\"87\" r=\"2.5\" fill=\"#b5eaff\"/><\/svg>","width":240.0,"height":150.0},{"key":"hero-blue-crab","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><g stroke=\"#07528d\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path fill=\"none\" d=\"M26 59 13 70m19-7L22 81m52-22 13 11M68 63l10 18\"/><path fill=\"#168de0\" d=\"M22 40 12 25l2 23 12 9m52-17 10-15-2 23-12 9\"/><ellipse cx=\"50\" cy=\"53\" rx=\"31\" ry=\"25\" fill=\"#35b6f2\"/><path fill=\"white\" d=\"M36 34V21a8 8 0 0 1 16 0v13m0 0V21a8 8 0 0 1 16 0v13\"/><circle cx=\"42\" cy=\"23\" r=\"3\" fill=\"#12395e\" stroke=\"none\"/><circle cx=\"58\" cy=\"23\" r=\"3\" fill=\"#12395e\" stroke=\"none\"/><path fill=\"none\" d=\"M42 58q8 9 16 0\"/><\/g><circle cx=\"33\" cy=\"51\" r=\"4\" fill=\"#9af1ff\"/><circle cx=\"67\" cy=\"51\" r=\"4\" fill=\"#9af1ff\"/><\/svg>","width":100.0,"height":100.0},{"key":"hero-clownfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><g stroke=\"#a53d14\" stroke-width=\"4\" stroke-linejoin=\"round\"><path fill=\"#ff8b26\" d=\"M25 50 8 33l4 22-4 16 19-12m50-9 16-17-4 22 4 16-19-12\"/><ellipse cx=\"51\" cy=\"51\" rx=\"32\" ry=\"25\" fill=\"#ff9b24\"/><path fill=\"#fff8e6\" d=\"M34 28q8 23 0 46h10q8-23 0-46zm23-1q-7 24 0 48h10q-8-24 0-48z\"/><circle cx=\"69\" cy=\"44\" r=\"8\" fill=\"white\"/><circle cx=\"71\" cy=\"44\" r=\"3.5\" fill=\"#15344a\" stroke=\"none\"/><path fill=\"none\" stroke=\"#a53d14\" d=\"M68 63q8 6 15-1\"/><\/g><circle cx=\"53\" cy=\"42\" r=\"2.5\" fill=\"#fff\"/><\/svg>","width":100.0,"height":100.0},{"key":"hero-turtle","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><g stroke=\"#176b61\" stroke-width=\"4\" stroke-linejoin=\"round\"><path fill=\"#44bb88\" d=\"m33 35-12-16 20 6m24 10 12-16-20 6M32 63 17 78l22-5m29-10 15 15-22-5\"/><ellipse cx=\"51\" cy=\"51\" rx=\"32\" ry=\"25\" fill=\"#44bb88\"/><ellipse cx=\"49\" cy=\"50\" rx=\"21\" ry=\"18\" fill=\"#36a978\"/><path fill=\"#85e6b2\" d=\"m48 34 11 6-2 12-12 3-8-9zM45 55l12-2 6 11-11 8-9-7z\"/><circle cx=\"74\" cy=\"46\" r=\"7\" fill=\"white\"/><circle cx=\"76\" cy=\"46\" r=\"3\" fill=\"#173c4b\" stroke=\"none\"/><path fill=\"none\" d=\"M72 61q7 5 12-1\"/><\/g><circle cx=\"31\" cy=\"47\" r=\"2.5\" fill=\"#d3fff0\"/><\/svg>","width":100.0,"height":100.0},{"key":"hero-octopus","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><g stroke=\"#633584\" stroke-width=\"5\" stroke-linecap=\"round\" fill=\"none\"><path d=\"M28 61Q14 65 19 82t15 1m7-19Q31 80 40 91t12-6m8-20Q72 78 61 91t-7-6m17-27Q90 57 85 76t-14 5\"/><\/g><path fill=\"#a66be0\" stroke=\"#633584\" stroke-width=\"4\" d=\"M20 52a30 30 0 0 1 60 0v13H20z\"/><circle cx=\"41\" cy=\"50\" r=\"8\" fill=\"white\"/><circle cx=\"63\" cy=\"50\" r=\"8\" fill=\"white\"/><circle cx=\"43\" cy=\"51\" r=\"3.5\" fill=\"#29254f\"/><circle cx=\"65\" cy=\"51\" r=\"3.5\" fill=\"#29254f\"/><path d=\"M45 64q7 7 14 0\" fill=\"none\" stroke=\"#633584\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"29\" cy=\"59\" r=\"3\" fill=\"#ffd3ff\"/><\/svg>","width":100.0,"height":100.0},{"key":"hero-seahorse","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"M55 18q-20-4-23 14-2 12 9 17-13 8-8 23 4 13 20 10 12-3 10-14-2-8-12-8-5 1-4 6 1 4 6 3\" fill=\"#ffc83d\" stroke=\"#b76e21\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M52 18 41 8l2 14m12 15 20-4-15 13\" fill=\"#ffc83d\" stroke=\"#b76e21\" stroke-width=\"4\" stroke-linejoin=\"round\"/><circle cx=\"58\" cy=\"31\" r=\"8\" fill=\"white\" stroke=\"#b76e21\" stroke-width=\"3\"/><circle cx=\"60\" cy=\"31\" r=\"3.5\" fill=\"#263b55\"/><path d=\"M57 47q7 4 12-1\" fill=\"none\" stroke=\"#b76e21\" stroke-width=\"3\" stroke-linecap=\"round\"/><path d=\"M44 24q-8 12 3 20\" fill=\"none\" stroke=\"#ffe77a\" stroke-width=\"4\" stroke-linecap=\"round\"/><\/svg>","width":100.0,"height":100.0},{"key":"hero-pufferfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"m50 5 7 11 13-6 2 14 15 1-5 13 12 8-11 9 6 13-15 2-2 14-13-6-9 12-9-12-13 6-2-14-15-2 6-13-11-9 12-8-5-13 15-1 2-14 13 6z\" fill=\"#ffd34e\" stroke=\"#b77b23\" stroke-width=\"4\" stroke-linejoin=\"round\"/><circle cx=\"51\" cy=\"51\" r=\"30\" fill=\"#ffe36c\" stroke=\"#b77b23\" stroke-width=\"4\"/><path d=\"m24 51-12-9v18zm52 0 15-10v20z\" fill=\"#ffad42\" stroke=\"#b77b23\" stroke-width=\"4\" stroke-linejoin=\"round\"/><circle cx=\"40\" cy=\"44\" r=\"7\" fill=\"white\"/><circle cx=\"62\" cy=\"44\" r=\"7\" fill=\"white\"/><circle cx=\"42\" cy=\"45\" r=\"3\" fill=\"#253b50\"/><circle cx=\"64\" cy=\"45\" r=\"3\" fill=\"#253b50\"/><path d=\"M45 62q7 8 14 0\" fill=\"none\" stroke=\"#a95345\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"33\" cy=\"57\" r=\"3\" fill=\"#ff9f9d\"/><\/svg>","width":100.0,"height":100.0},{"key":"hero-whale","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"M19 56Q21 29 53 29q25 0 33 24l7 17-16-5q-10 13-31 11-24-2-27-20L9 47z\" fill=\"#4b9ee8\" stroke=\"#245e9b\" stroke-width=\"5\" stroke-linejoin=\"round\"/><path d=\"M30 67q19 14 45-2-9 18-28 18-15 0-17-16\" fill=\"#c9f4f3\" stroke=\"#245e9b\" stroke-width=\"3\"/><circle cx=\"68\" cy=\"47\" r=\"8\" fill=\"white\"/><circle cx=\"70\" cy=\"47\" r=\"3.5\" fill=\"#213b55\"/><path d=\"M67 61q8 5 13-1M46 29Q37 18 45 12m8 17q0-12 10-15\" fill=\"none\" stroke=\"#245e9b\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M42 13q-4-7 1-8m7 7q0-7 5-9\" fill=\"none\" stroke=\"#55c9e5\" stroke-width=\"4\" stroke-linecap=\"round\"/><circle cx=\"40\" cy=\"58\" r=\"2.5\" fill=\"#fff\"/><\/svg>","width":100.0,"height":100.0},{"key":"hero-jellyfish","dimension":"2d","factory":null,"version":"v1","kind":"svg","align":"center","svg":"<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><path d=\"M20 52Q20 20 50 20t30 32z\" fill=\"#fa83c6\" stroke=\"#a54191\" stroke-width=\"5\"/><path d=\"M28 52v16q0 8 6 2l4-7v17q0 8 6 2l6-9v11q0 8 6 2l4-13v9q0 7 6 1l6-17V52\" fill=\"#f68bcf\" stroke=\"#a54191\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"40\" cy=\"43\" r=\"7\" fill=\"white\"/><circle cx=\"61\" cy=\"43\" r=\"7\" fill=\"white\"/><circle cx=\"42\" cy=\"44\" r=\"3\" fill=\"#3a3b61\"/><circle cx=\"63\" cy=\"44\" r=\"3\" fill=\"#3a3b61\"/><path d=\"M45 56q6 6 12 0\" fill=\"none\" stroke=\"#a54191\" stroke-width=\"3\" stroke-linecap=\"round\"/><circle cx=\"30\" cy=\"33\" r=\"3\" fill=\"#ffd9f6\"/><\/svg>","width":100.0,"height":100.0},{"key":"realistic-blue-catfish","dimension":"2d","factory":null,"version":"v1","kind":"image","align":"center","src":"https://cdn.diy.org/prod/projects/vibecode/f52922efb74f442cb0d30a30cfab6ef2/assets/realistic-blue-catfish/7da7cc24-25a6-4009-8797-753be2c5e0c8.webp","width":512,"height":334,"pictureKind":"sprite"}]});
