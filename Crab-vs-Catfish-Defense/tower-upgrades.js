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
    const towerSpecs = {
      bubble: { range: w => Math.min(140, Math.max(100, w * .32)), cooldown: .48, damage: 1, color: 0x63eaff, width: 4, radius: 6 },
      cannon: { range: w => Math.min(170, Math.max(125, w * .42)), cooldown: 1.15, damage: 3, color: 0xffa444, width: 8, radius: 10 },
      net: { range: w => Math.min(145, Math.max(100, w * .34)), cooldown: .92, damage: 1, color: 0x53d1ad, width: 6, radius: 8 },
      spike: { range: w => Math.min(110, Math.max(78, w * .27)), cooldown: .25, damage: 1, color: 0xffdc60, width: 3, radius: 5 },
      sonar: { range: w => Math.min(175, Math.max(125, w * .43)), cooldown: .82, damage: 2, color: 0x72fff0, width: 6, radius: 12 },
      bloom: { range: w => Math.min(145, Math.max(105, w * .36)), cooldown: .34, damage: 1, color: 0xff74a8, width: 4, radius: 7 },
      crabTank: { range: w => Math.min(180, Math.max(132, w * .44)), cooldown: 1.35, damage: 5, color: 0xff754e, width: 9, radius: 13 }, crabHeli: { range: w => Math.min(180, Math.max(130, w * .42)), cooldown: .7, damage: 2, color: 0xffa846, width: 6, radius: 8 }, crabJet: { range: w => Math.min(220, Math.max(160, w * .52)), cooldown: .58, damage: 3, color: 0xffa846, width: 6, radius: 9 }, crabCarrier: { range: w => Math.min(270, Math.max(190, w * .58)), cooldown: 1.05, damage: 4, color: 0xffb648, width: 7, radius: 11 }
    };
    function statsFor(tower, width) {
      const base = towerSpecs[tower.type];
      return {
        ...base,
        damage: base.damage + tower.upgrades.damage,
        range: base.range(width) * (1 + tower.upgrades.range * .18),
        cooldown: Math.max(.13, base.cooldown * (1 - tower.upgrades.fire * .16))
      };
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
    return { paths, canUpgrade, itemsFor, purchase, statsFor };
  };
})();
