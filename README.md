# terrarium-sim

A mechanistic simulation of a closed, bioactive terrarium. It models the jar the
way it actually works: a water cycle, gas exchange, plants limited by their
scarcest resource, a clean-up crew whose numbers track their food, mold that
blooms and gets grazed down, and pests that show up when you overwater.

Nothing is scripted. The first-month mold bloom, the springtail boom and
crash, fittonia fainting, the sunny-windowsill death spiral: all of these fall
out of the rules.

## Quick start

```bash
npm install
npm test                                  # 13 behaviour tests
npm run sim                               # 120 days of the default jar
npm run sim -- --preset no-crew --days 180 --every 15
```

Presets: `tropical-jar`, `no-crew`, `overwatered-windowsill`, `mossy-woodland`.

## Use it as a library

```ts
import { createTerrarium, run, care, snapshot, PRESETS } from './src/index.js';

const jar = createTerrarium(PRESETS['tropical-jar']);
run(jar, 24 * 30);          // one month, hourly steps
care.mist(jar, 30);         // keeper actions
care.airOut(jar, 6);
console.log(snapshot(jar)); // score, climate, plants, fauna, alerts with fixes
```

State is one plain serialisable object (`TerrariumState`), so it can be saved,
diffed, or handed straight to a UI.

## Layout

```
src/
  core/          types, math (thermal curves, RNG), config (every tunable constant)
  environment/   geometry, climate, water cycle, gas exchange
  organisms/     species.ts (the catalog: data, not code), plants, fauna, decomposition
  sim/           terrarium (the hourly loop), care (keeper actions), health (alerts + score)
  presets.ts     ready-made jars
  cli.ts
test/            behaviour tests: each one is a claim about how a real jar behaves
docs/
  RESEARCH.md    what makes a terrarium work, per-organism findings, sources
  MODEL.md       the rules for each organism, and what is still a guess
```

## Adding an organism

Add an entry to `src/organisms/species.ts`. Plants and animals are described
entirely by parameters (light range, moisture range, life-cycle timings, diet),
so most species need no new code. See `docs/MODEL.md` for what each parameter does.

## What is in the box

Plants: nerve plant, creeping fig, baby tears pilea, spike moss, cushion moss, maidenhair fern.
Animals: springtails, dwarf white isopods, rough woodlice, and fungus gnats (uninvited).
Processes: mold, microbial decay, condensation, CO2 and nitrogen cycling.

## Status

A working first cut. The structure follows the published literature; many
numbers are calibrated to give realistic qualitative behaviour and are marked
with a `confidence` level in the catalog. `docs/MODEL.md` lists what to
calibrate against a real jar next.
