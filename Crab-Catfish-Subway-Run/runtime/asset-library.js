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

window.DIYAssetLibrary.install({"assets":[{"key":"crab-runner","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"blue-catfish","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"subway-train","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"track-barrier","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"gold-coin","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"subway-rock","dimension":"3d","factory":null,"version":"v2","kind":"look","align":"center","look":{"model":"nature.urban_rock_s","colors":{"rock":"#756f68"}}},{"key":"pickup","dimension":"3d","factory":"item0502","version":"v1","kind":"catalog","align":"bottom","target":"item0502"}]});
window.DIYAssetLibrary.defineModel("crab-runner", "v1", function (THREE, options) {
const g=new THREE.Group();const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.55});const red=mat('#f4693e'),dark=mat('#c84039'),cream=mat('#ffbf77'),white=mat('#ffffff'),black=mat('#132d43');function ball(x,y,z,sx,sy,sz,m){let a=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),m);a.position.set(x,y,z);a.scale.set(sx,sy,sz);g.add(a);return a}ball(0,.46,0,.56,.35,.43,red);ball(0,.28,.35,.37,.13,.13,cream);for(let side of [-1,1]){for(let i=0;i<3;i++){let leg=new THREE.Mesh(new THREE.CylinderGeometry(.065,.09,.47,8),dark);leg.position.set(side*(.55+i*.12),.23,(i-1)*.25);leg.rotation.z=side*.8;g.add(leg)}ball(side*.75,.56,.35,.27,.2,.24,red);ball(side*.83,.63,.54,.16,.11,.15,cream);ball(side*.28,.89,.24,.115,.23,.11,red);ball(side*.28,1.06,.27,.145,.15,.14,white);ball(side*.28,1.07,.39,.057,.075,.04,black)}return g;
});
window.DIYAssetLibrary.defineModel("blue-catfish", "v1", function (THREE, options) {
const g=new THREE.Group();let blue=new THREE.MeshStandardMaterial({color:'#148ad7',roughness:.42}),light=new THREE.MeshStandardMaterial({color:'#85e5f4'}),ink=new THREE.MeshStandardMaterial({color:'#12354d'});function b(x,y,z,a,c,d,m){let o=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),m);o.position.set(x,y,z);o.scale.set(a,c,d);g.add(o)}b(0,.48,0,.43,.33,.62,blue);b(0,.32,.3,.37,.15,.33,light);b(0,.49,-.63,.14,.2,.35,blue);for(let s of [-1,1]){b(s*.26,.68,.37,.12,.12,.12,light);b(s*.26,.7,.47,.05,.06,.04,ink);let w=new THREE.Mesh(new THREE.CylinderGeometry(.025,.015,.65,6),light);w.position.set(s*.53,.33,.55);w.rotation.z=s*1.1;g.add(w);b(s*.4,.47,-.3,.25,.06,.18,blue)}let fin=new THREE.Mesh(new THREE.ConeGeometry(.22,.4,4),blue);fin.position.set(0,.94,-.2);g.add(fin);return g;
});
window.DIYAssetLibrary.defineModel("subway-train", "v1", function (THREE, options) {
const g=new THREE.Group(),m=c=>new THREE.MeshStandardMaterial({color:c,roughness:.48});function box(x,y,z,w,h,d,c){let o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m(c));o.position.set(x,y,z);g.add(o)}box(0,1.1,0,1.62,2.15,4.6,'#fae8b0');box(0,.43,0,1.66,.35,4.7,'#fd6374');box(0,1.48,2.34,1.3,.85,.06,'#44bde4');box(0,.6,2.36,.95,.17,.08,'#fff5be');for(let s of [-1,1]){for(let z of [-1.3,0,1.3])box(s*.82,1.5,z,.045,.74,.8,'#46b9df')}box(0,2.22,0,1.65,.1,4.6,'#fd6374');return g;
});
window.DIYAssetLibrary.defineModel("track-barrier", "v1", function (THREE, options) {
const g=new THREE.Group();function box(x,y,z,w,h,d,c){let o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:c}));o.position.set(x,y,z);g.add(o)}box(0,.48,0,1.65,.86,.26,'#ffca48');for(let x of [-.55,0,.55]){let o=new THREE.Mesh(new THREE.BoxGeometry(.18,.93,.29),new THREE.MeshStandardMaterial({color:'#fa5d54'}));o.position.set(x,.48,0);o.rotation.z=-.4;g.add(o)}box(-.62,.15,0,.12,.3,.35,'#42557b');box(.62,.15,0,.12,.3,.35,'#42557b');return g;
});
window.DIYAssetLibrary.defineModel("gold-coin", "v1", function (THREE, options) {
const g=new THREE.Group();let coin=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.09,24),new THREE.MeshStandardMaterial({color:'#ffd642',metalness:.55,roughness:.2}));coin.rotation.x=Math.PI/2;coin.position.y=.46;g.add(coin);let gem=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshStandardMaterial({color:'#fff3a0',emissive:'#b97515',emissiveIntensity:.3}));gem.position.set(0,.46,.055);g.add(gem);return g;
});
