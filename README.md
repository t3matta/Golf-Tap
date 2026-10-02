# GolfTap

A daily geography game about golf courses, inspired by [MapTap](https://maptap.gg).

Every day there are five golf courses from around the world, the same for every player. Spin the globe and tap where you think each course is. Your first tap is your guess, as in MapTap. The closer your ball lands to the flag, the lower your score, as in golf. Players who prefer a two-step "place, then lock it in" flow can turn on **Confirm each guess** in Settings.

After each guess the flag drops on the real spot. A label beside it shows the result and a golf one-liner, the course's country lights up, and the card shows a fact about the course. Facts stay hidden until you've guessed, so they can't give the answer away. The next hole tees off by itself after a few seconds; touching the globe pauses that so you can look around.

The game loads straight into the first hole; the ? button opens the rules.

Taps that stop a spinning globe don't count, and on touch screens neither do taps within half a second of a drag or pinch, so spinning the globe doesn't place a ball by accident.

## How scoring works

- Each hole first earns 0–100 points by great-circle distance on MapTap's curve, `100 × e^(−3.5 × km / 16,250)`: about 98 at 100 km, 81 at 1,000 km and 34 at 5,000 km, and 0 beyond 16,250 km.
- Landing in the right country guarantees a boost, also as in MapTap. The points are rescaled from 25 up, capped at 80, and never lowered.
- Points become the hole's score to par, `50 − points`: a ball on the pin is 50 under, about 3,200 km off is level par and the far side of the world is 50 over. Lower is better. Every hole is shown and shared with this score.
- Later holes count more toward the total, like playing from the back tees:

  | Hole | Tees  | Multiplier |
  | ---- | ----- | ---------- |
  | 1–2  | White | ×1         |
  | 3    | Blue  | ×2         |
  | 4–5  | Tips  | ×3         |

  Only totals use the multipliers (the score chip, the scorecard's total and running "To par" row, and the final score), so a round runs from −500 (perfect) to +500. It mirrors the old points exactly: a round's score is 500 minus its points total. Even par is shown as E.
- Each hole gets a golf result that agrees with its score: under par is a birdie, an eagle (90+ points, within about 500 km) or a hole-in-one (100 points, within about 23 km); exactly level is par; over par is a bogey, a double bogey (under 25 points) or a lost ball (under 10). The right-country boost means a bogey at worst. The scorecard circles birdies and better and boxes bogeys and worse, like a real card.
- Daily courses are dealt from a seeded shuffle, so every course appears once before any repeats. Each day's five are kept 800 km apart where possible, and ordered from most famous to deepest cut.

Streaks, stats and the in-progress round are stored in the browser (`localStorage`). There's no backend. Rounds saved under earlier scoring are converted the first time stats load.

## Development

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests (scoring, daily picker, stats)
npm run build        # static site in dist/
npm run build:single # one self-contained HTML file in dist-single/
```

Set `VITE_SHARE_URL` at build time to control the link in the share text. By default it uses the page's own URL.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. Enable it once under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

`dist/` is plain static files, so any static host works (Netlify, Vercel, Cloudflare Pages, S3).

## Project layout

| File | What it does |
| --- | --- |
| `src/courses.ts` | The course list: name, location, coordinates, clue, difficulty tier |
| `src/game.ts` | Distance, scoring, ratings, daily puzzle selection, share text |
| `src/globe.ts` | Canvas globe (d3-geo orthographic): drag/pinch/scroll, tap to guess, flags and flight arcs |
| `src/satellite.ts` | WebGL layer that paints satellite imagery onto the globe under the 2D canvas, streaming sharper tiles as you zoom |
| `src/tiles.ts` | Tile-grid maths for the streamed imagery (which zoom level and tiles cover the view) |
| `src/geo.ts` | Which country a point is in (for the right-country bonus and highlight) |
| `src/storage.ts` | Saved progress, history and stats |
| `src/main.ts` | Game flow and UI |

### Adding courses

Add entries to `COURSES` in `src/courses.ts`. Keep clues free of the town name, and set `tier` to 1 (famous), 2 (known to golf fans) or 3 (deep cut). Coordinates should point at the clubhouse or course. The tests check for valid coordinates, unique ids and accidental duplicates; sister courses that share a club's grounds are listed as exceptions in the duplicate test.

The list holds 293 courses: the original hand-picked set plus every course in GOLF's Top 100 in the World (2025–26) and its Nos. 101–150, GOLF's Top 100 in the U.S. (2024–25), and Golf Digest's World's 100 Greatest (2026–27) and America's 100 Greatest (2025–26). Their coordinates come from OpenStreetMap; a few courses missing from the map are placed at their town, within a few km.

Changing the course list reshuffles the daily schedule from the next puzzle on. A round that's already in progress keeps its saved courses.

## Data

- Satellite imagery: [EOxCloudless 2025](https://cloudless.eox.at) (Sentinel-2 cloudless) by EOX IT Services GmbH, containing modified Copernicus Sentinel data 2025, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). It's stitched from EOX's WGS84 tiles at zoom 4 into an 8K equirectangular texture (`public/textures`, loaded on desktops) and a 4K copy (`src/assets`). Zoomed in past that, the globe streams EOX's tiles for the area on screen live from `tiles.maps.eox.at`, down to zoom 14 (about 5 m per pixel), so courses resolve hole by hole; set `VITE_TILE_URL` (`{z}`, `{y}`, `{x}`) at build time to use another server with the same WGS84 grid. The single-file build leaves streaming out. **The licence is non-commercial**: using GolfTap commercially (ads, paid features) needs a commercial licence from EOX or different imagery. Without WebGL the globe falls back to flat vector colours.
- Map: [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) (countries, 50m/110m), [us-atlas](https://github.com/topojson/us-atlas) (US states) and [geo-maps](https://github.com/simonepri/geo-maps) (lakes). All are bundled, so no map API keys are needed.
- Course coordinates were compiled by hand and are accurate to within a few kilometres. Corrections are welcome.
