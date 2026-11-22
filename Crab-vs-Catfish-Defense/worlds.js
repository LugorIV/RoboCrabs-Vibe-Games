(function () {
  window.createReefWorlds = function (ctx) {
    const maps = {
      lagoon: {
        name: "Sunny Lagoon",
        ground: 0x49bfc4,
        route: [[.02,.29],[.27,.29],[.27,.49],[.70,.49],[.70,.75],[.94,.75]],
        path: [0x155e76, 0xfff4cf, 0xd5a768, 0x1689b7, 0x66e4e6]
      },
      kelp: {
        name: "Kelp Forest",
        ground: 0x35ae8b,
        route: [[.02,.70],[.24,.70],[.24,.27],[.49,.27],[.49,.60],[.77,.60],[.77,.34],[.95,.34]],
        path: [0x176f68, 0xffe8a8, 0xa77955, 0x168b91, 0x85efd0]
      },
      canyon: {
        name: "Coral Canyon",
        ground: 0xc89a63,
        route: [[.02,.35],[.23,.35],[.23,.61],[.51,.61],[.51,.28],[.80,.28],[.80,.72],[.96,.72]],
        path: [0x79614c, 0xffedbd, 0xcd9870, 0x368eaa, 0x91e4df]
      },
      pearl: {
        name: "Pearl Grotto",
        ground: 0x55b8c5,
        route: [[.02,.52],[.20,.52],[.20,.24],[.46,.24],[.46,.73],[.73,.73],[.73,.40],[.96,.40]],
        path: [0x225c78, 0xfff5d2, 0xc8b17f, 0x4c9fb5, 0xc4f6e8]
      },
      garden: {
        name: "Sunken Garden",
        ground: 0x65bd82,
        route: [[.02,.67],[.23,.67],[.23,.34],[.48,.34],[.48,.72],[.77,.72],[.77,.22],[.96,.22]],
        path: [0x176d68, 0xfff0b6, 0xb48962, 0x378d88, 0x9af0c4]
      }
    };
    const choices = [
      { id: "world-lagoon", label: "Sunny Lagoon", icon: "☀️" },
      { id: "world-kelp", label: "Kelp Forest", icon: "🌿" },
      { id: "world-canyon", label: "Coral Canyon", icon: "🪸" },
      { id: "world-pearl", label: "Pearl Grotto", icon: "🐚" },
      { id: "world-garden", label: "Sunken Garden", icon: "🌱" }
    ];
    const props = [
      { view: ctx.assets.sprite("pearl-reef", { size: 90 }), world: "lagoon", x: .91, y: .20, scale: .8 },
      { view: ctx.assets.sprite("pearl-reef", { size: 76 }), world: "lagoon", x: .08, y: .83, scale: .72 },
      { view: ctx.assets.sprite("reef-kelp-frond", { size: 105 }), world: "kelp", x: .08, y: .78, scale: 1 },
      { view: ctx.assets.sprite("reef-kelp-frond", { size: 90 }), world: "kelp", x: .91, y: .18, scale: .85 },
      { view: ctx.assets.sprite("reef-kelp-frond", { size: 82 }), world: "kelp", x: .91, y: .79, scale: .78 },
      { view: ctx.assets.sprite("reef-crystal-rock", { size: 105 }), world: "canyon", x: .10, y: .19, scale: .95 },
      { view: ctx.assets.sprite("reef-crystal-rock", { size: 88 }), world: "canyon", x: .90, y: .84, scale: .82 },
      { view: ctx.assets.sprite("reef-crystal-rock", { size: 75 }), world: "canyon", x: .90, y: .18, scale: .7 },
      { view: ctx.assets.sprite("reef-crystal-rock", { size: 112 }), world: "pearl", x: .09, y: .20, scale: 1 },
      { view: ctx.assets.sprite("pearl-reef", { size: 82 }), world: "pearl", x: .90, y: .82, scale: .8 },
      { view: ctx.assets.sprite("reef-crystal-rock", { size: 78 }), world: "pearl", x: .91, y: .17, scale: .72 },
      { view: ctx.assets.sprite("reef-kelp-frond", { size: 100 }), world: "garden", x: .09, y: .17, scale: .92 },
      { view: ctx.assets.sprite("reef-kelp-frond", { size: 108 }), world: "garden", x: .90, y: .86, scale: 1 },
      { view: ctx.assets.sprite("pearl-reef", { size: 76 }), world: "garden", x: .90, y: .50, scale: .72 }
    ];
    props.forEach(prop => ctx.layers.world.addChild(prop.view));
    const goal = ctx.assets.sprite("pearl-reef", { size: 60 });
    ctx.layers.world.addChild(goal);
    let selected = "lagoon";

    function select(id) {
      if (maps[id]) selected = id;
    }

    function route(at) {
      return maps[selected].route.map(([x, y]) => at(x, y));
    }

    function distanceToRoute(points, x, y) {
      let nearest = Infinity;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
        nearest = Math.min(nearest, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
      }
      return nearest;
    }

    function drawBackground(g, width, height, points) {
      const isLagoon = selected === "lagoon";
      g.rect(0, 0, width, height).fill({ color: maps[selected].ground, alpha: isLagoon ? .10 : .34 });
      if (selected === "kelp") {
        g.ellipse(width * .25, height * .40, width * .23, height * .18).fill({ color: 0x9ce5a8, alpha: .28 });
        g.ellipse(width * .79, height * .77, width * .27, height * .14).fill({ color: 0x3ca994, alpha: .35 });
        g.rect(0, height * .89, width, height * .11).fill({ color: 0x9bdc98, alpha: .55 });
      } else if (selected === "canyon") {
        g.ellipse(width * .18, height * .75, width * .34, height * .19).fill({ color: 0xf5dd99, alpha: .58 });
        g.ellipse(width * .83, height * .28, width * .29, height * .20).fill({ color: 0xb6d98c, alpha: .62 });
        g.rect(0, height * .90, width, height * .10).fill({ color: 0xc7a96f, alpha: .48 });
      } else if (selected === "pearl") {
        g.ellipse(width * .20, height * .34, width * .31, height * .23).fill({ color: 0x9ce8e4, alpha: .43 });
        g.ellipse(width * .79, height * .68, width * .30, height * .20).fill({ color: 0x2b8caa, alpha: .42 });
        g.rect(0, height * .91, width, height * .09).fill({ color: 0x8ee1d7, alpha: .42 });
      } else if (selected === "garden") {
        g.ellipse(width * .19, height * .32, width * .28, height * .19).fill({ color: 0xc6ed9b, alpha: .46 });
        g.ellipse(width * .81, height * .63, width * .29, height * .22).fill({ color: 0x36a778, alpha: .38 });
        g.rect(0, height * .91, width, height * .09).fill({ color: 0x9bdd8e, alpha: .50 });
      }
      const end = points[points.length - 1];
      goal.position.set(end.x, end.y - 4);
      props.forEach(prop => {
        prop.view.visible = prop.world === selected;
        if (prop.view.visible) {
          prop.view.position.set(width * prop.x, height * prop.y);
          prop.view.scale.set(prop.scale);
        }
      });
    }

    function drawRoute(g, points) {
      const colors = maps[selected].path;
      const strokeRoute = (color, width, offsetY, alpha) => {
        g.beginPath().moveTo(points[0].x, points[0].y + offsetY);
        points.slice(1).forEach(point => g.lineTo(point.x, point.y + offsetY));
        g.stroke({ color, width, alpha, cap: "round", join: "round" });
      };
      // A soft cast shadow and stacked sand/reef layers make the lane feel raised.
      strokeRoute(0x123f59, 82, 10, .30);
      strokeRoute(0x176478, 78, 5, .96);
      strokeRoute(0x1d8290, 68, 2, 1);
      strokeRoute(0xffe5a0, 61, 0, 1);
      strokeRoute(colors[2], 51, -1, .98);
      strokeRoute(colors[1], 42, -2, .96);
      strokeRoute(colors[3], 28, -2, .86);
      strokeRoute(colors[4], 8, -3, .68);
      // Sunlit rim along one side of the route.
      strokeRoute(0xffffff, 3, -5, .34);
    }

    return {
      choices,
      select,
      route,
      distanceToRoute,
      drawBackground,
      drawRoute,
      get name() { return maps[selected].name; }
    };
  };
})();
