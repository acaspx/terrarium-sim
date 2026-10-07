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

Jars are saved in the browser's local storage. The playground is one Vercel
function (`api/terrariums.ts`) backed by Redis.

1. Push this repo to GitHub.
2. In Vercel, choose **Add New → Project** and import the repo. Vercel reads
   `vercel.json` (build `npm run build`, output `dist`).
3. For the playground, add a Redis database from the Vercel Marketplace
   (Upstash). It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` also work).
   Without them the playground says it is not connected, and the rest of the app works.
4. Every push to `main` deploys; every branch gets a preview URL.

See [docs/DEPLOY.md](docs/DEPLOY.md) for the full checklist.

In `npm run dev` the same API runs inside the Vite server. With no Redis
variables in `.env` it uses an in-memory gallery seeded with a few example jars.

## What is in the app

- **Shelf:** every terrarium as a living jar on a shelf, with a tag showing its day, health and most pressing issue. A compare table for tracking several at once, and a "since you last looked" summary.
- **Builder:** six steps (vessel, layers, plants, clean-up crew, placement, name) starting from a recipe or blank, with a live preview, inline warnings, and a 90-day forecast that reruns as you design.
- **Jar view:** conditions, issues with one-tap fixes, care actions (mist, air out, feed, remove mold, prune, change lid or placement), plant and animal rosters, trends and a journal.
- **Time:** paused, real time (jars keep living while you are away), a day per second, or a week per second.
- **Arrange:** drag plants into place in the 3D builder. Tall plants shade what grows beneath them, and the forecast reruns as you move them.
- **Room:** the scene around the jar is its placement: a window whose sky follows the jar's day and night, a grow light overhead, or a dim corner.
- **Soil and air readings:** pH (from the mix, slowly acidifying), soil air (sours when waterlogged), vapour pressure deficit and daily light integral.
- **Fungi:** driftwood in a humid jar sprouts a flush of mushrooms every month or two.
- **3D jar:** the builder and jar pages show the terrarium as a lit 3D scene you can turn: transmissive glass, a condensation shader (mist, beads, then runs that wipe clear trails), soil that darkens and turns glossy when wet, a reservoir that fills, procedural plants that droop with turgor and brown with health, and a crew that hops and wanders. The builder can preview the design at any point in its 90-day forecast. Browsers without WebGL 2 get the drawn jar.
- **Playground:** share a jar as it is today; anyone can look inside, like it, or plant a copy. Shares keep a private delete token in the sharer's browser. Jars reported by three people are hidden.

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
    jar/Jar.tsx    the living jar, drawn from simulation state (shelf, thumbnails, fallback)
    jar/Jar3D.tsx  lazy loader for the 3D jar
    three/         the 3D scene: vessels, procedural plants and textures, the condensation shader
    playground.ts  client for the playground API
    screens/       Shelf, Builder, Detail
    store.ts       persistence, clock, daily history, alert transitions
  playground/      shared by API and app: submission schema and validation, the handler, stores
api/               Vercel function for the playground
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
