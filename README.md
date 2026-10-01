# GolfTap

A daily geography game about golf courses, inspired by [MapTap](https://maptap.gg).

Every day there are five golf courses from around the world, the same for every player. Spin the globe and tap where you think each course is. Your first tap is your guess, as in MapTap. The closer your ball lands to the flag, the more points you get. Players who prefer a two-step "place, then lock it in" flow can turn on **Confirm each guess** in Settings.

After each guess the flag drops on the real spot. A label beside it shows the result and a golf one-liner, the course's country lights up, and the card shows a fact about the course. Facts stay hidden until you've guessed, so they can't give the answer away. The next hole tees off by itself after a few seconds; touching the globe pauses that so you can look around.

Taps that stop a spinning globe don't count, and on touch screens neither do taps within half a second of a drag or pinch, so spinning the globe doesn't place a ball by accident.

## How scoring works

- Each hole scores 0–100 by great-circle distance on MapTap's curve, `100 × e^(−3.5 × km / 16,250)`: about 98 at 100 km, 81 at 1,000 km and 34 at 5,000 km, and 0 beyond 16,250 km.
- Landing in the right country guarantees a boost, also as in MapTap. The score is rescaled from 25 up, capped at 80, and never lowered.
- Later holes count more, like playing from the back tees:

  | Hole | Tees  | Multiplier |
  | ---- | ----- | ---------- |
  | 1–2  | White | ×1         |
  | 3    | Blue  | ×2         |
  | 4–5  | Tips  | ×3         |

  A perfect round is 1,000.
- Each hole gets a golf result: hole-in-one, eagle, birdie, par, bogey, double bogey or lost ball. The scorecard circles birdies and better and boxes bogeys and worse, like a real card.
- Daily courses are dealt from a seeded shuffle, so every course appears once before any repeats. Each day's five are kept 800 km apart where possible, and ordered from most famous to deepest cut.

Streaks, stats and the in-progress round are stored in the browser (`localStorage`). There's no backend.

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
| `src/satellite.ts` | WebGL layer that paints satellite imagery onto the globe under the 2D canvas |
| `src/geo.ts` | Which country a point is in (for the right-country bonus and highlight) |
| `src/storage.ts` | Saved progress, history and stats |
| `src/main.ts` | Game flow and UI |

### Adding courses

Add entries to `COURSES` in `src/courses.ts`. Keep clues free of the town name, and set `tier` to 1 (famous), 2 (known to golf fans) or 3 (deep cut). Coordinates should point at the clubhouse or course. The tests check for valid coordinates, unique ids and accidental duplicates.

Changing the course list reshuffles the daily schedule from the next puzzle on. A round that's already in progress keeps its saved courses.

## Data

- Satellite imagery: [EOxCloudless 2025](https://cloudless.eox.at) (Sentinel-2 cloudless) by EOX IT Services GmbH, containing modified Copernicus Sentinel data 2025, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). It's stitched from EOX's WGS84 tiles at zoom 4 into an 8K equirectangular texture (`public/textures`, loaded on desktops) and a 4K copy (`src/assets`). **The licence is non-commercial**: using GolfTap commercially (ads, paid features) needs a commercial licence from EOX or different imagery. Without WebGL the globe falls back to flat vector colours.
- Map: [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) (countries, 50m/110m), [us-atlas](https://github.com/topojson/us-atlas) (US states) and [geo-maps](https://github.com/simonepri/geo-maps) (lakes). All are bundled, so no map API keys or tile servers are needed.
- Course coordinates were compiled by hand and are accurate to within a few kilometres. Corrections are welcome.
