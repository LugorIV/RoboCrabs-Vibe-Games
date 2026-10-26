#!/usr/bin/env node
// Builds the public website into _site/ WITHOUT changing the DIY.org game folders.
//
// Every top-level folder that contains a project.manifest.json (that's what a
// DIY.org export has) is treated as a game. It is copied into _site/<folder>/
// and, in the copy only, its index.html gets:
//   - the graphics engine DIY.org normally provides (PixiJS for 2d, three.js for 3d)
//   - a small "Games" button that leads back to the menu page
// The menu page (site/index.html) and site/games.json are copied alongside.
//
// Usage: node tools/build-site.mjs        then open _site/ with any web server.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "_site");
const SITE = path.join(ROOT, "site");

const ENGINES = {
  "2d": "lib/pixi-8.22.0.min.js",
  "3d": "lib/three-r182.min.js",
};

function fail(message) {
  console.error("ERROR: " + message);
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SITE, OUT, { recursive: true });

const config = JSON.parse(fs.readFileSync(path.join(SITE, "games.json"), "utf8"));
const extras = config.games || {};
const games = [];

const folders = fs.readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !d.name.startsWith("_"))
  .filter((d) => fs.existsSync(path.join(ROOT, d.name, "project.manifest.json")))
  .map((d) => d.name)
  .sort();

for (const folder of folders) {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, folder, "project.manifest.json"), "utf8"));
  const engine = ENGINES[manifest.renderMode];
  if (!engine) fail(`${folder}: unknown renderMode "${manifest.renderMode}" (expected 2d or 3d)`);

  const dest = path.join(OUT, folder);
  fs.cpSync(path.join(ROOT, folder), dest, { recursive: true });

  const entry = path.join(dest, manifest.entryHtmlPath || "index.html");
  let html = fs.readFileSync(entry, "utf8");
  const firstScript = html.indexOf("<script");
  if (firstScript === -1) fail(`${folder}: no <script> tag found in its index.html`);
  const injected =
    `<script src="../${engine}" defer></script>\n  ` +
    `<script src="../lib/showcase.js" defer></script>\n  `;
  html = html.slice(0, firstScript) + injected + html.slice(firstScript);
  fs.writeFileSync(entry, html);

  const extra = extras[folder] || {};
  const cover = ["jpg", "jpeg", "png", "webp"]
    .map((ext) => `covers/${folder}.${ext}`)
    .find((file) => fs.existsSync(path.join(SITE, file)));
  games.push({
    cover: extra.cover || cover || "",
    folder,
    title: extra.title || manifest.title || folder.replace(/-/g, " "),
    description: extra.description || "",
    creator: extra.creator || "",
    emoji: extra.emoji || "🦀",
    renderMode: manifest.renderMode,
  });
  console.log(`  ✓ ${folder} (${manifest.renderMode})`);
}

for (const name of Object.keys(extras)) {
  if (!folders.includes(name)) console.warn(`  ! site/games.json mentions "${name}" but there is no such game folder`);
}

if (!games.length) fail("no game folders found (looking for folders with project.manifest.json)");

// Keep the order from games.json first, then any new games alphabetically.
const order = Object.keys(extras);
games.sort((a, b) => {
  const ia = order.indexOf(a.folder), ib = order.indexOf(b.folder);
  return (ia === -1 ? 1e9 : ia) - (ib === -1 ? 1e9 : ib) || a.folder.localeCompare(b.folder);
});

fs.writeFileSync(path.join(OUT, "games.json"), JSON.stringify({ ...config, games }, null, 2));
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");
console.log(`Built ${games.length} games into _site/`);
