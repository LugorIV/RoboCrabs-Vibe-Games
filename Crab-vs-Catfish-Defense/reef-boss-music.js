(function () {
  window.syncReefBossMusic = function (ctx, fish, wave, quiz, wasActive) {
    const hasBoss = fish.some(enemy => !!enemy.bossKind);
    if (wave === 5 && quiz && quiz.active) {
      ctx.music.play("music.battle_vs_gyokaijuu", { fade: 1 });
      return wasActive;
    }
    if (hasBoss === wasActive) return wasActive;
    ctx.music.play(hasBoss ? "music.battle_vs_gyokaijuu" : "music.short_theme_melon_it_rock_rhythm_4", { fade: 1 });
    return hasBoss;
  };
})();
