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

window.DIYAssetLibrary.install({"assets":[{"key":"blue-crab","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"blue-catfish","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"beach-rock","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"home-burrow","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"beach-seagull","dimension":"3d","factory":null,"version":"v2","kind":"look","align":"center","look":{"model":"animal.swing_pigeon","colors":{"feathers":"#f4f1e6","feathers_accent":"#7c929d","beak":"#e9aa38","skin":"#d27a67"}}},{"key":"checkpoint-check","dimension":"3d","factory":null,"version":"v2","kind":"model","align":"center"},{"key":"parkour-wall","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"parkour-boards","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"},{"key":"level-two-checkpoint-sign","dimension":"3d","factory":null,"version":"v1","kind":"model","align":"center"}]});
window.DIYAssetLibrary.defineModel("blue-crab", "v1", function (THREE, options) {
const g=new THREE.Group(); const blue=new THREE.MeshStandardMaterial({color:0x168bd6,roughness:.48}); const light=new THREE.MeshStandardMaterial({color:0x60d8f0}); const white=new THREE.MeshStandardMaterial({color:0xffffff}); const black=new THREE.MeshStandardMaterial({color:0x172849}); function ball(x,y,z,sx,sy,sz,m){const o=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);g.add(o);} ball(0,.38,0,.55,.25,.42,blue);ball(0,.49,.21,.39,.13,.25,light);for(let k of [-1,1]){ball(k*.26,.76,.24,.075,.21,.075,blue);ball(k*.26,.91,.27,.13,.14,.12,white);ball(k*.26,.94,.38,.055,.065,.04,black);for(let i=0;i<3;i++){let leg=new THREE.Mesh(new THREE.CylinderGeometry(.045,.065,.48,6),blue);leg.position.set(k*(.45+i*.10),.24,(i-1)*.23);leg.rotation.z=k*.8;g.add(leg);}ball(k*.78,.43,.28,.24,.18,.21,blue);ball(k*.82,.47,.49,.13,.13,.18,light);}return g;
});
window.DIYAssetLibrary.defineModel("blue-catfish", "v1", function (THREE, options) {
const g=new THREE.Group();const b=new THREE.MeshStandardMaterial({color:0x2367ae,roughness:.5});const pale=new THREE.MeshStandardMaterial({color:0x9be0df});const ink=new THREE.MeshStandardMaterial({color:0x10243b});function ell(x,y,z,a,c,d,m){let o=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),m);o.position.set(x,y,z);o.scale.set(a,c,d);g.add(o);}ell(0,.55,0,.67,.4,1.1,b);ell(0,.36,.35,.53,.19,.65,pale);ell(0,.62,1,.68,.32,.32,b);for(let x of [-.39,.39]){ell(x,.77,.99,.11,.12,.09,ink);let whisker=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.7,6),pale);whisker.position.set(x*1.5,.4,1.23);whisker.rotation.z=x>0?-.8:.8;g.add(whisker);}let tail=new THREE.Mesh(new THREE.ConeGeometry(.59,.9,3),b);tail.position.set(0,.55,-1.3);tail.rotation.x=Math.PI/2;g.add(tail);return g;
});
window.DIYAssetLibrary.defineModel("beach-rock", "v1", function (THREE, options) {
const g=new THREE.Group();const m=new THREE.MeshStandardMaterial({color:0xe87564,roughness:1});const pale=new THREE.MeshStandardMaterial({color:0xffb778});let o=new THREE.Mesh(new THREE.DodecahedronGeometry(.62,0),m);o.position.y=.5;o.scale.set(1,.8,.9);g.add(o);for(let x of [-.3,.1,.34]){let p=new THREE.Mesh(new THREE.DodecahedronGeometry(.18,0),pale);p.position.set(x,.94,Math.abs(x)*.35);g.add(p);}return g;
});
window.DIYAssetLibrary.defineModel("home-burrow", "v1", function (THREE, options) {
const g=new THREE.Group();const sand=new THREE.MeshStandardMaterial({color:0xe3a65f,roughness:1});const dark=new THREE.MeshStandardMaterial({color:0x49322d});const green=new THREE.MeshStandardMaterial({color:0x51bd7d});let mound=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),sand);mound.scale.set(1.7,.85,1.1);mound.position.y=.35;g.add(mound);let door=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),dark);door.scale.set(.72,.58,.12);door.position.set(0,.44,1.04);g.add(door);for(let x of [-1.3,1.3]){let leaf=new THREE.Mesh(new THREE.ConeGeometry(.24,.8,5),green);leaf.position.set(x,.78,.1);g.add(leaf);}return g;
});
window.DIYAssetLibrary.defineModel("checkpoint-check", "v2", function (THREE, options) {
const g = new THREE.Group();
const green = new THREE.MeshStandardMaterial({ color: 0x40e38d, emissive: 0x0a6b37, roughness: 0.32 });
const shortStroke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.14), green);
shortStroke.position.set(-0.15, 0.02, 0);
shortStroke.rotation.z = 0.785;
g.add(shortStroke);
const longStroke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.14), green);
longStroke.position.set(0.16, 0.09, 0);
longStroke.rotation.z = -0.785;
g.add(longStroke);
return g;
});
window.DIYAssetLibrary.defineModel("parkour-wall", "v1", function (THREE, options) {
const g = new THREE.Group();
const stone = new THREE.MeshStandardMaterial({ color: 0x1d2638, roughness: .72, metalness: .12 });
const cap = new THREE.MeshStandardMaterial({ color: 0xf4c542, roughness: .5, metalness: .18 });
const seam = new THREE.MeshStandardMaterial({ color: 0x19b7d8, roughness: .45, emissive: 0x063d55 });
const stripe = new THREE.MeshStandardMaterial({ color: 0xf04b5f, roughness: .5, emissive: 0x40101b });
function block(w, h, d, x, y, z, m) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); }
block(6.2, 1.38, .5, 0, .69, 0, stone);
block(6.35, .14, .6, 0, 1.42, 0, cap);
for (let x = -2.5; x <= 2.5; x += 1.25) {
  block(1.12, .13, .035, x, .46, .267, seam);
  block(1.12, .13, .035, x, .94, .267, seam);
  block(1.12, .13, .035, x, .46, -.267, seam);
  block(1.12, .13, .035, x, .94, -.267, seam);
}
for (const x of [-1.88, 0, 1.88]) {
  block(.18, 1.08, .04, x, .72, .29, stripe);
  block(.18, 1.08, .04, x, .72, -.29, stripe);
}
return g;
});
window.DIYAssetLibrary.defineModel("parkour-boards", "v1", function (THREE, options) {
const g = new THREE.Group();
const wood = new THREE.MeshStandardMaterial({ color: 0xb96f3b, roughness: 1 });
const dark = new THREE.MeshStandardMaterial({ color: 0x70452f, roughness: 1 });
for (let z = -1.35; z <= 1.36; z += .54) {
  const plank = new THREE.Mesh(new THREE.BoxGeometry(6.2, .14, .45), wood);
  plank.position.set(0, 0, z); g.add(plank);
}
for (const x of [-2.88, 2.88]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, 3.15), dark);
  rail.position.set(x, -.17, 0); g.add(rail);
}
return g;
});
window.DIYAssetLibrary.defineModel("level-two-checkpoint-sign", "v1", function (THREE, options) {
const g = new THREE.Group();
const wood = new THREE.MeshStandardMaterial({ color: 0x9a5635, roughness: 1 });
const board = new THREE.MeshStandardMaterial({ color: 0xf6b84a, roughness: 0.8 });
const postGeo = new THREE.BoxGeometry(0.16, 2.6, 0.16);
for (const x of [-3.35, 3.35]) {
  const post = new THREE.Mesh(postGeo, wood);
  post.position.set(x, 1.3, 0);
  g.add(post);
}
const plaque = new THREE.Mesh(new THREE.BoxGeometry(7.15, 1.05, 0.18), wood);
plaque.position.set(0, 2.1, 0);
g.add(plaque);
const face = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 0.82), new THREE.MeshBasicMaterial({ map: (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 900; canvas.height = 180;
  const c = canvas.getContext("2d");
  c.fillStyle = "#f6b84a"; c.fillRect(0, 0, 900, 180);
  c.fillStyle = "#7b3f25"; c.font = "bold 112px sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("LEVEL 2", 450, 90);
  return new THREE.CanvasTexture(canvas);
})() }));
face.position.set(0, 2.1, 0.096);
g.add(face);
const cap = new THREE.Mesh(new THREE.BoxGeometry(7.35, 0.13, 0.25), board);
cap.position.set(0, 2.68, 0);
g.add(cap);
return g;
});
