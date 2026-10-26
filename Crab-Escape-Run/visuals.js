window.CrabRunVisuals = {
  create: function (ctx, scene, T, startZ) {
    const sand = ctx.look.material("toon", { color: 0xe8c58b });
    const water = ctx.look.material("water", { color: 0x32b9ce });
    const seaBed = ctx.look.material("toon", { color: 0x1686a6 });
    let viewportSize = ctx.size;

    function ground(w, d, material, x, y, z) {
      const mesh = new T.Mesh(new T.BoxGeometry(w, .18, d), material);
      mesh.position.set(x, y, z);
      scene.add(mesh);
      return mesh;
    }

    const waterFloor = ground(60, 150, water, 0, -.52, startZ - 38);
    const sandFloor = ground(17, 150, sand, 0, -.34, startZ - 38);
    const oceanFloor = ground(54, 150, seaBed, 0, -.34, startZ - 38);
    oceanFloor.visible = false;

    function fitWorld(size) {
      viewportSize = size;
      const aspect = size.width / Math.max(1, size.height);
      const width = Math.max(18, Math.min(42, aspect * 24));
      sandFloor.scale.x = width / 17;
      waterFloor.scale.x = width / 60;
      oceanFloor.scale.x = width / 54;
    }
    fitWorld(viewportSize);

    const edgeMarkers = [];
    for (const x of [-7.5, 7.5]) {
      for (let i = 0; i < 20; i++) {
        const marker = ground(.18, 5, ctx.look.material("toon", { color: 0xf4dcaa }), x, -.22, startZ - i * 7);
        edgeMarkers.push({ object: marker, offset: i * 7 });
      }
    }

    function asset(key) {
      const object = ctx.assets.model(key);
      scene.add(object);
      return object;
    }

    const crab = new T.Group();
    const crabArt = ctx.assets.orientForward(T, ctx.assets.model("blue-crab"), "+Z");
    crabArt.scale.setScalar(.96);
    crabArt.rotation.y = 0;
    crabArt.visible = true;
    crab.add(crabArt);
    scene.add(crab);

    const gull = ctx.models.spawn("beach-seagull", { height: .9 });
    gull.object.visible = false;
    const gullMarker = new T.Group();
    const warningFill = new T.Mesh(
      new T.CircleGeometry(1.05, 32),
      new T.MeshBasicMaterial({ color: 0xf21f2b, transparent: true, opacity: .34, depthWrite: false })
    );
    warningFill.rotation.x = -Math.PI / 2;
    gullMarker.add(warningFill);
    const warningRing = new T.Mesh(
      new T.RingGeometry(1.05, 1.22, 32),
      new T.MeshBasicMaterial({ color: 0xd91422, side: T.DoubleSide, depthWrite: false })
    );
    warningRing.rotation.x = -Math.PI / 2;
    warningRing.position.y = .006;
    gullMarker.add(warningRing);
    gullMarker.visible = false;
    scene.add(gullMarker);

    const catfish = ctx.assets.orientForward(T, ctx.assets.model("blue-catfish"), "+Z");
    catfish.scale.setScalar(.72);
    catfish.rotation.y = Math.PI;
    catfish.visible = false;
    scene.add(catfish);
    const fish = [];
    for (let i = 0; i < 10; i++) {
      const swimmer = asset("blue-catfish");
      swimmer.scale.setScalar(.26 + (i % 3) * .045);
      swimmer.rotation.y = i % 2 ? Math.PI : 0;
      swimmer.visible = false;
      fish.push({ object: swimmer, offset: 7 + (i % 5) * 6, side: i % 2 ? 1 : -1, phase: i * 1.7 });
    }

    return {
      fitWorld, edgeMarkers, sandFloor, waterFloor, oceanFloor, asset,
      crab, gull, gullMarker, catfish, fish
    };
  }
};
