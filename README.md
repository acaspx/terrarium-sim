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

Jars are saved in each visitor's browser. The community shelf is one Vercel
function (`api/shelf.ts`) backed by Redis.

1. Import the repo in Vercel (**Add New → Project**). It reads `vercel.json`.
2. For the community shelf, create a Redis database in the project's **Storage** tab
   and connect it for Production. Redeploy.
3. Optional: turn on **Analytics** in the project (page views, cookieless), and set
   `MODERATORS` if you want moderators.
4. Every push to `master` deploys; every branch gets a preview.

[docs/DEPLOY.md](docs/DEPLOY.md) has the details: checking it works, looking after the
shelf, and what to do when something breaks.

In `npm run dev` the same API runs inside the Vite server. With no Redis variables in
`.env` it uses an in-memory shelf seeded with a few example keepers and jars. To use a
real Redis locally, put `REDIS_URL` in `.env`.

## What is in the app

**Building and keeping jars**

- **Shelf:** every terrarium as a living jar with a tag for its day, health and most pressing issue; a compare table; a "since you last looked" summary.
- **Builder:** vessel, layers, plants, clean-up crew, placement and name, from a recipe or blank, with a live 3D preview, inline warnings and a 90-day forecast that reruns as you design. Tap a plant to add one and **−** to take one out.
- **Arrange:** drag plants, the driftwood and the stone in the 3D builder (tap the wood to turn it). Tall plants shade what grows beneath them, and the forecast reruns. The stone finds an open, visible spot until you move it.
- **Jar page:** conditions, issues with one-tap fixes, care actions (mist, air out, feed, remove mold, prune, change lid or placement), rosters, trends, a time-lapse and a journal.
- **Time:** paused, real time (jars keep living while you are away), a day per second or a week per second.
- **Inbox:** a bell counts what happened in your jars since you last looked; optional browser notifications while the site is open in another tab.

**The 3D jar**

- Transmissive glass, a condensation shader (mist, beads, runs that wipe clear trails), soil that darkens when wet, a filling reservoir, and a room that follows the placement: a window whose sky follows the jar's day, a grow light, a dim corner.
- Plants are procedural and follow the simulation: they droop with turgor, brown with health and grow with biomass. Creeping fig runs over the soil and climbs the glass, baby tears forms a cushion, maidenhair arches.
- Driftwood with bark furrows, a mossy stone, fallen leaves that curl as they dry, a water dish where there are crabs, mushrooms on wood in a humid jar.
- Animals walk: isopods amble and stop, legs stepping in a wave; springtails hop; pill bugs roll up when startled; vampire crabs sit still, scuttle off sideways and raise their claws when you tap near them; gnats fly.
- Handle it: drag to spin, flick to rock it, tap plants, soil, mushrooms and fogged glass.
- Optional sound: the hush of humid air, drips as often as the glass is wet enough to drip, and small sounds for what you touch.
- Weak devices get a lighter mode; browsers without WebGL 2 get the drawn jar.

**Community shelf**

- Pick a username (no email or password: a recovery code signs you in elsewhere) and share jars. Shared jars keep growing on their own; each keeper has a shelf at `#/u/name`.
- Anyone can browse, like and plant a copy. Keepers can follow each other (a **Following** tab collects their new jars) and delete their account.
- Share links (`/s/ID`) show the jar's picture, name and note when pasted into chat apps and social sites.
- Safety: a word filter on names and notes, rate limits, reports (three people, counted by connection, hide a jar), and optional moderators who can remove jars and ban keepers.

## Layout

```
src/
  engine/          the simulation: no DOM, no React, fully testable
    core/          types, math, config (every tunable constant)
    environment/   geometry, climate, water cycle, gas exchange
    organisms/     species catalog (data), plants, fauna (incl. predation), decomposition
    sim/           hourly loop, care actions, health and alerts
    spec.ts        options catalog, spec -> setup, builder checks, forecast, recipes
  app/             the React interface
    screens/       Shelf, Builder, Detail (a jar), Playground (community shelf, keepers, shared jars)
    jar/           the drawn jar (shelf, fallback) and the lazy 3D loader
    three/         the 3D scene: vessel and layout, plants, critter models and movement,
                   hardscape (stone, driftwood, leaves), condensation shader, room, stills
    ui/            shared pieces: swatches, inbox, sound toggle, time-lapse
    store.ts       persistence, clock, history, alerts, news for the inbox
    playground.ts  client for the community API
    sound.ts       generated sound (Web Audio)
    analytics.ts   page views, grouped by kind of page
  playground/      shared by API and app: the handler, Redis and memory stores, schema, word filter
api/shelf.ts       the one Vercel function; vercel.json routes /api/* and /s/* to it
scripts/cli.ts     command-line runner
test/              behaviour tests: each one is a claim about how a real jar behaves
docs/
  RESEARCH.md      the science behind each organism, with sources
  MODEL.md         the rules, and what is still a guess
  DEPLOY.md        deploying and running the site
  CUSTOMIZATION.md the original research and scope for the builder
```

## Adding an organism

1. **Simulation:** add an entry to `src/engine/organisms/species.ts`. Organisms are
   described by parameters (ranges, life cycle, diet, prey), so most need no new code.
   Add sources to `docs/RESEARCH.md`, and a crew size to `CREW_COUNTS` in `spec.ts` for animals.
2. **3D:** a plant needs a builder in `src/app/three/plants.ts` (`BUILDERS`, `PLANT_COLORS`).
   An animal needs a look in `src/app/three/Critters.tsx` (`LOOKS`), using one of the
   body plans in `critterModels.ts` or a new one.
3. **Drawn jar:** a small drawing in `src/app/jar/Jar.tsx`, for the shelf and devices without WebGL.
4. **Tests:** a claim about how it behaves in `test/ecology.test.ts`.
