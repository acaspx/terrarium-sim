# terrarium-sim

Build terrariums and watch them live. A mechanistic simulation of closed,
bioactive terrariums (water cycle, gas exchange, plants, clean-up crew, mold and
pests) with a web interface for designing jars and keeping a shelf of them.

Nothing is scripted. The first-month mold bloom, the springtail boom and crash,
fittonia fainting, the sunny-windowsill death spiral: all of it falls out of the
rules in `src/engine`.

## Run it

```bash
npm install
npm run dev        # the app at http://localhost:5173
npm test           # engine and customization tests
npm run sim        # the engine from the command line
```

## Deploy on Vercel

The app is a static Vite site with no backend; jars are saved in the browser's
local storage.

1. Push this repo to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo. Vercel reads
   `vercel.json` (build `npm run build`, output `dist`).
3. Every push to `main` deploys; every branch gets a preview URL.

## What is in the app

- **Shelf:** every terrarium as a living jar on a shelf, with a tag showing its day, health and most pressing issue. A compare table for tracking several at once, and a "since you last looked" summary.
- **Builder:** six steps (vessel, layers, plants, clean-up crew, placement, name) starting from a recipe or blank, with a live preview, inline warnings, and a 90-day forecast that reruns as you design.
- **Jar view:** conditions, issues with one-tap fixes, care actions (mist, air out, feed, remove mold, prune, change lid or placement), plant and animal rosters, trends and a journal.
- **Time:** paused, real time (jars keep living while you are away), a day per second, or a week per second.

## Layout

```
src/
  engine/          the simulation: no DOM, no React, fully testable
    core/          types, math, config (every tunable constant)
    environment/   geometry, climate, water cycle, gas exchange
    organisms/     species catalog (data), plants, fauna, decomposition
    sim/           hourly loop, care actions, health and alerts
    spec.ts        customization: options catalog, spec -> setup, checks, forecast, recipes
  app/             the React interface
    jar/Jar.tsx    the living jar, drawn from simulation state
    screens/       Shelf, Builder, Detail
    store.ts       persistence, clock, daily history, alert transitions
scripts/cli.ts     command-line runner
test/              behaviour tests: each one is a claim about how a real jar behaves
docs/
  RESEARCH.md      the science behind each organism, with sources
  MODEL.md         the rules, and what is still a guess
  CUSTOMIZATION.md vendor research and the v1 customization scope
```

## Adding an organism

Add an entry to `src/engine/organisms/species.ts`. Organisms are described by
parameters, so most need no new code. To draw a new plant, add a drawing
function in `src/app/jar/Jar.tsx`.
