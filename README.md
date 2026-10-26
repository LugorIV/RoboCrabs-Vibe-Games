# 🦀 RoboCrabs Vibe Games

Games made by kids on [DIY.org](https://diy.org) for our STEM showcase.

**Play them here:** https://lugoriv.github.io/RoboCrabs-Vibe-Games/

## What's in this repo

| Path | What it is |
| --- | --- |
| `Crab-Escape-Run/`, `Crab-vs-Catfish-Defense/`, … | The games, exactly as downloaded from DIY.org. Don't edit them by hand. |
| `site/` | The menu page, the list of games (`games.json`) and the graphics engines. |
| `tools/build-site.mjs` | Builds the website from the two above. |
| `.github/workflows/pages.yml` | Publishes the website to GitHub Pages on every push to `main`. |

To update a game or add a new one, see **[UPDATING.md](UPDATING.md)**.

## Turning on the website (one time)

In the repo on GitHub, go to **Settings → Pages**, and under **Build and deployment →
Source** choose **GitHub Actions**. The next push to `main` publishes the site.
