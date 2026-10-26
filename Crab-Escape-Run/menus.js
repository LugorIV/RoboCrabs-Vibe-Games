window.CrabRunMenus = {
  create(ctx, options) {
    const levelButtonItems = [{ id: "levels", label: "Levels", icon: "🌊" }];
    let toolbar;

    function closePicker() {
      options.onMenuChange(false);
      toolbar.setItems(levelButtonItems);
    }
    function openPicker() {
      options.onMenuChange(true);
      toolbar.setItems([
        { id: "beach", label: "Beach", icon: "🐚" },
        { id: "ocean", label: options.getUnlockedLevel() >= 2 ? "Ocean" : "Locked", icon: "🌊" },
        { id: "back", label: "Back", icon: "↩" }
      ]);
      toolbar.setDisabled("ocean", options.getUnlockedLevel() < 2);
    }
    function chooseLevel(id) {
      if (id === "levels") { openPicker(); return; }
      if (id === "back") { closePicker(); return; }
      const chosen = id === "beach" ? 1 : (id === "ocean" ? 2 : 0);
      if (!chosen || chosen > options.getUnlockedLevel()) return;
      closePicker();
      options.onSelectLevel(chosen);
    }

    toolbar = ctx.ui.toolbar(levelButtonItems, {
      selected: "levels",
      onSelect: chooseLevel
    });

    let pickerOpen = false;
    const levelButton = ctx.ui.button("Levels", () => {
      pickerOpen = !pickerOpen;
      beachButton.hidden = !pickerOpen;
      oceanButton.hidden = !pickerOpen;
    }, { at: "top-right", alt: true });
    levelButton.setAttribute("aria-label", "Choose a level");
    const beachButton = ctx.ui.button("Beach", () => {
      options.onTitleSelectLevel(1);
      levelButton.textContent = "Levels: Beach";
      levelButton.setAttribute("aria-label", "Levels selected: Beach");
      pickerOpen = false;
      beachButton.hidden = true;
      oceanButton.hidden = true;
    }, { at: "top-right" });
    beachButton.setAttribute("aria-label", "Level 1: Beach");
    const oceanButton = ctx.ui.button("Ocean 🔒", () => {
      if (options.getUnlockedLevel() < 2) return;
      options.onTitleSelectLevel(2);
      levelButton.textContent = "Levels: Ocean";
      levelButton.setAttribute("aria-label", "Levels selected: Ocean");
      pickerOpen = false;
      beachButton.hidden = true;
      oceanButton.hidden = true;
    }, { at: "top-right" });
    oceanButton.setAttribute("aria-label", "Level 2: Ocean");
    beachButton.hidden = true;
    oceanButton.hidden = true;
    oceanButton.disabled = options.getUnlockedLevel() < 2;
    levelButton.parentElement.style.zIndex = "7";
    options.titleReady.then(() => {
      levelButton.hidden = true;
      beachButton.hidden = true;
      oceanButton.hidden = true;
    });

    return { closePicker };
  }
};
