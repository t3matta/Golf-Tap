# GolfTap

A daily geography game about golf courses, inspired by [MapTap](https://maptap.gg).

Every day there are five golf courses from around the world, the same for every player. Spin the globe, tap where you think each course is, and lock in your guess. The closer your ball lands to the flag, the more points you get.

## How scoring works

- Each hole scores 0–100 by great-circle distance: a full 100 within ~17 km, falling off exponentially (about 50 points at 1,000 km).
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
| `src/storage.ts` | Saved progress, history and stats |
| `src/main.ts` | Game flow and UI |

### Adding courses

Add entries to `COURSES` in `src/courses.ts`. Keep clues free of the town name, and set `tier` to 1 (famous), 2 (known to golf fans) or 3 (deep cut). Coordinates should point at the clubhouse or course. The tests check for valid coordinates, unique ids and accidental duplicates.

Changing the course list reshuffles the daily schedule from the next puzzle on. A round that's already in progress keeps its saved courses.

## Data

- Map: [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) (countries, 50m/110m), [us-atlas](https://github.com/topojson/us-atlas) (US states) and [geo-maps](https://github.com/simonepri/geo-maps) (lakes). All are bundled, so no map API keys or tile servers are needed.
- Course coordinates were compiled by hand and are accurate to within a few kilometres. Corrections are welcome.
