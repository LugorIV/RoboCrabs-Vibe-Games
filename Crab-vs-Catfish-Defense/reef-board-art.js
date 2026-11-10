(function () {
  window.createReefBoardArt = function (ctx, worlds, board, rangeArt) {
    const upgradeArt = new PIXI.Graphics();
    let upgradeAttached = false;

    function attachUpgradeArt() {
      if (upgradeAttached) return;
      ctx.layers.world.addChild(upgradeArt);
      upgradeAttached = true;
    }

    function drawSelectedRange(focusedTower, towers, width, upgradeRules) {
      rangeArt.clear();
      if (!focusedTower || !towers.includes(focusedTower)) return;
      const range = upgradeRules.statsFor(focusedTower, width).range;
      rangeArt.circle(focusedTower.x, focusedTower.y, range).fill({ color: 0x42e8df, alpha: .10 });
      rangeArt.circle(focusedTower.x, focusedTower.y, range).stroke({ color: 0xffffff, width: 5, alpha: .82 });
      rangeArt.circle(focusedTower.x, focusedTower.y, range).stroke({ color: 0x11aeb6, width: 2, alpha: .95 });
    }

    function drawBoard(width, height, top, points, towers) {
      board.clear();
      worlds.drawBackground(board, width, height, points);
      for (let i = 0; i < 18; i++) {
        const x = ((i * 97 + 31) % 997) / 997 * width;
        const y = top * .25 + ((i * 173 + 47) % 991) / 991 * (height - top * .35);
        board.circle(x, y, 2 + (i % 3)).fill({ color: 0xe7ffdc, alpha: .42 });
        board.circle(x - 3, y - 4, 1.2).fill({ color: 0xffffff, alpha: .72 });
      }
      worlds.drawRoute(board, points);
      upgradeArt.clear();
      const upgradeColors = { damage: 0xff7851, range: 0x438ff2, fire: 0xffd34f };
      towers.forEach(tower => {
        ["damage", "range", "fire"].forEach((stat, path) => {
          for (let tier = 0; tier < 5; tier++) {
            const x = tower.x - 14 + tier * 7;
            const y = tower.y + 24 + path * 5;
            upgradeArt.circle(x, y, 1.8).fill({
              color: tier < tower.upgrades[stat] ? upgradeColors[stat] : 0x456879,
              alpha: tier < tower.upgrades[stat] ? 1 : .78
            });
          }
        });
      });
    }

    return { upgradeArt, attachUpgradeArt, drawSelectedRange, drawBoard };
  };
})();
