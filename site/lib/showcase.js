// Adds a small "Games" button to every game so players can get back to the menu.
// Injected by tools/build-site.mjs; the DIY.org game files themselves are not changed.
(function () {
  var link = document.createElement("a");
  link.href = "../";
  link.textContent = "← Games";
  link.setAttribute("aria-label", "Back to all games");
  link.style.cssText = [
    "position:fixed", "left:8px", "bottom:8px", "z-index:2147483647",
    "padding:6px 12px", "border-radius:999px", "background:rgba(15,23,42,.75)",
    "color:#fff", "font:600 14px/1.2 system-ui,sans-serif", "text-decoration:none",
    "box-shadow:0 2px 6px rgba(0,0,0,.3)",
  ].join(";");
  document.body.appendChild(link);
})();
