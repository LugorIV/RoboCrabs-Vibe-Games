(function () {
  window.createReefUpgradeRules = function () {
    const paths = {
      damage: { name: "Power", icon: "⚔️", costs: [35, 60, 95, 150, 230] },
      range: { name: "Range", icon: "🎯", costs: [30, 55, 90, 140, 210] },
      fire: { name: "Speed", icon: "⚡", costs: [40, 65, 100, 155, 240] }
    };
    function canUpgrade(tower, stat) {
      const level = tower.upgrades[stat];
      if (level >= 5) return false;
      const keys = Object.keys(paths);
      const used = keys.filter(path => tower.upgrades[path] > 0);
      if (!tower.upgrades[stat] && used.length >= 2) return false;
      return !keys.some(path => path !== stat && tower.upgrades[path] >= 3 && level >= 2);
    }
    function itemsFor(tower) {
      const items = Object.entries(paths).map(([stat, path]) => {
        const level = tower.upgrades[stat], allowed = canUpgrade(tower, stat);
        const status = level >= 5 ? "MAX" : allowed ? level + "/5" : "LOCK";
        return { id: "upgrade-" + stat, label: path.name + " " + status,
          icon: path.icon, cost: allowed ? path.costs[level] : null };
      });
      items.push({ id: "sell", label: "Sell tower", icon: "💰" });
      items.push({ id: "back", label: "Build", icon: "🐚" });
      return items;
    }
    function purchase(tower, stat, cash) {
      const path = paths[stat], level = tower.upgrades[stat];
      if (!path) return { ok: false, message: "Unknown upgrade!" };
      if (!canUpgrade(tower, stat)) {
        const used = Object.values(tower.upgrades).filter(value => value > 0).length;
        const blockedPath = level === 0 && used >= 2;
        return { ok: false, message: level >= 5 ? "This path is maxed!" :
          blockedPath ? "Only two paths per tower!" : "Only one path can pass tier 2!" };
      }
      const cost = path.costs[level];
      if (cash < cost) return { ok: false, message: "Need " + cost + " shells!" };
      tower.invested += cost;
      tower.upgrades[stat]++;
      return { ok: true, cash: cash - cost, tier: level + 1, path };
    }
    return { paths, canUpgrade, itemsFor, purchase };
  };
})();
