# Updating games from DIY.org

**Short version: re-upload the game folder from DIY.org and you're done.** Nothing has
to be re-applied by hand.

## Why it's safe to overwrite game folders

The game folders (`Crab-Escape-Run/`, `Crab-vs-Catfish-Defense/`, …) are kept **exactly
as DIY.org exports them**. None of our changes are in those folders.

When something is pushed to `main`, a GitHub Action (`.github/workflows/pages.yml`)
runs `tools/build-site.mjs`, which builds a *copy* of the website and adds the fixes
to that copy:

| What the build adds | Why |
| --- | --- |
| The graphics engine: PixiJS for 2D games, three.js for 3D games (from `site/lib/`) | DIY.org adds these itself when a game runs on its website, but leaves them out of the download. Without them a game shows "PixiJS runtime did not load" or a blank screen. |
| A small **← Games** button in the bottom-left corner (`site/lib/showcase.js`) | So players can get back to the menu. |
| The menu page (`site/index.html`) and the list of games | Built from every folder that has a `project.manifest.json`. |

The build reads each game's `project.manifest.json` (`"renderMode": "2d"` or `"3d"`)
to choose the right engine.

## Updating an existing game

1. Download the game from DIY.org.
2. Replace the whole folder in this repo with the new download. Keep the **same folder
   name**, e.g. `Crab-Escape-Run`. It's fine to delete the old folder first.
3. Commit to `main`, or open a pull request. A pull request runs the build to check
   the games (a red ✗ means something is wrong). Merging it publishes the site in
   about a minute (watch the **Actions** tab on GitHub).

## Adding a new game

1. Add the DIY.org download as a new top-level folder, e.g. `Crab-Space-Race/`.
2. (Optional) Add an entry for it in `site/games.json` with an emoji, a description and
   who made it. If you skip this, it still shows up, using the title from DIY.org.
3. Commit to `main`, or open a pull request and merge it.

## Changing the menu page

Edit `site/games.json`:

- `siteTitle`, `tagline`: the heading at the top of the menu page.
- `feedbackUrl`: the link for the **Tell us what you think** buttons (see below). When
  it's empty, the buttons are hidden.
- `games`: one entry per folder name, with `emoji`, `description` and `creator`. Games
  are listed in this order.

## Cover pictures

Put a picture named after the game folder in `site/covers/`, e.g.
`site/covers/Crab-Escape-Run.jpg` (`.jpg`, `.png` or `.webp`). It's used automatically
as that game's picture on the menu; without one, the card shows the game's emoji.
Pictures are shown in a wide 16:9 frame and trimmed to fit, so keep the important
part in the middle.

You can also use the DIY.org cover picture directly by putting its link in
`site/games.json` as `"cover"`, e.g.
`"cover": "https://cdn.diy.org/posts/5c8bce8a-fb71-4614-8115-0e7e626182ba.webp"`.
If that link ever fails to load, the menu shows the picture from `site/covers/` instead.

To find a game's cover link: on diy.org, right-click the cover → **Inspect**. In the
highlighted `<img …>` line, the link is inside `src="…url=https%3A%2F%2Fcdn.diy.org%2Fposts%2F….webp"`.
Turn `%3A` into `:` and `%2F` into `/` to get `https://cdn.diy.org/posts/….webp`.

## Collecting feedback

The easiest option for the general public (no account needed) is a **Google Form**:

1. Create a form with questions like "Which game did you play?" (short answer),
   "How many stars?" and "What should we add or fix?".
2. To fill in the game name automatically: in the form's ⋮ menu choose **Get pre-filled
   link**, type `GAME` in the "Which game" question, click **Get link**, and copy it.
   It ends with something like `entry.123456=GAME`. Delete the word `GAME` so the link
   ends with `=`.
3. Paste that link into `feedbackUrl` in `site/games.json` and commit.

Each game's feedback button then opens the form with its name already filled in.

## Previewing on your computer (optional)

```sh
node tools/build-site.mjs
python3 -m http.server -d _site 8000   # then open http://localhost:8000
```

`_site/` is the generated output. It's ignored by git, so don't edit it.

## If a new DIY.org download stops working

The build only expects what DIY.org exports today: a `project.manifest.json` with
`renderMode` and an `index.html` with `<script>` tags. If DIY.org changes its format,
the build stops with an `ERROR:` message in the Actions log. If it switches to a newer
PixiJS or three.js, the engine files in `site/lib/` may need updating (see
`site/lib/THIRD-PARTY-NOTICES.md`).

Sounds, music and some background pictures are still loaded from DIY.org's servers
(`cdn.diy.org`), so those need DIY.org to stay online.
