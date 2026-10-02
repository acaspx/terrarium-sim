# Model

One step is one hour. Order: climate -> plants -> animals -> decomposition -> water -> gas.

## Pools

| Pool | Unit | Meaning |
|---|---|---|
| substrateWater, reservoirWater, condensation | g | Where the water is. Sealed: the sum is constant (tested). |
| co2 | mg | CO2 in the air space |
| detritus | g dry | Fresh dead matter: litter, dead plants, frass |
| humus | g dry | The substrate's own slow-rotting organic matter |
| nutrient | mg N | Plant-available nitrogen |
| mold | g | Visible fungal mass |

## Climate and water

- Room temperature swings daily. Light warms the interior (greenhouse effect), with a lag.
- The glass tracks the room. Sealed air sits at the dew point of the glass, so humidity is `sat(glass) / sat(air)`: near 100% at night, lower when the light warms the interior.
- Evaporation scales with `(1 - RH)` and substrate wetness. Vapour either escapes (ventilation) or condenses on the glass and runs back down.
- Water above field capacity drains to the false bottom, which wicks back slowly when the substrate dries.
- Simplification: the air holds so little water (about 0.15 g in a 10 L jar) that it is treated as a pipe, not a pool.

## Plants

Growth = max rate x **min**(light, water, temperature, humidity) x CO2 x nitrogen x turgor x room left.

- **Light:** zero below the compensation point, saturates at `opt`, scorches above `max`.
- **Water:** trapezoid on substrate moisture. Too dry and too wet both go to zero (root rot).
- **Turgor** (fast) and **health** (slow) are separate. Turgor is what you see day to day; health is accumulated damage. A plant that wilts and is watered in time loses nothing; one left wilted loses health daily.
- Plants shed litter continuously, and dead plants become detritus.
- Total canopy is capped by container volume, so fast growers crowd out slow ones.

## Animals

Each species is three numbers: eggs, juveniles, adults.

- Environment factor = **min**(thermal curve, moisture response). Development and breeding scale with it; cold or drought pauses the life cycle.
- Food: demand is split across mold and detritus by preference; a shortfall in one is made up from the other. `fed` = eaten / demand.
- Births scale with `fed^2` and with remaining room. Starvation, drought, drowning and heat add mortality.
- Eating mineralises: CO2 and nitrogen go back to the plants. 30% of eaten detritus returns as frass.
- Hungry species with `diet.plant > 0` bite plants.

| Species | Behaviour that emerges |
|---|---|
| Springtail | Booms on the first mold bloom, crashes when it is gone, settles at what litter fall supports. Dies within weeks in a dry jar. |
| Dwarf white isopod | Slow build over months; needs it damp. |
| Rough woodlouse | Tolerates drier jars; out-eats a small jar's litter and declines unless fed. |
| Fungus gnat | Arrives only when substrate stays saturated or wet and moldy; persists while it stays wet. |

## Mold and decay

- Mold grows logistically on detritus when moisture, humidity and warmth are high and air is still; ventilation slows it.
- A new build starts with a pulse of fresh detritus, which is why every new jar blooms.
- Spores never reach zero, so mold returns whenever conditions and food allow.
- Background microbes decay detritus (fast) and humus (slow) into CO2 and nitrogen. Humus is what keeps a sealed jar fed for years.

## Calibration: what is still a guess

Constants live in `src/core/config.ts`; species numbers in `src/organisms/species.ts`.

| Constant | Status |
|---|---|
| Saturation vapour density, thermal curve shape, stage structure | Standard physics / published model structure |
| Springtail timings and tolerances | From literature (see RESEARCH.md) |
| `heatPerPpfd`, `evapCoeff`, `runoffPerH` | Estimated. Calibrate with a thermometer/hygrometer in a real jar. |
| CO2 levels | Order-of-magnitude only. Soil respiration dominates; absolute ppm is not trustworthy. |
| Mold growth and cap | Tuned so the bloom peaks in weeks 2 to 5, matching keeper reports |
| All plant parameters | Estimated from qualitative care guidance |
| Isopod and gnat reproduction | Estimated |

## Known limits

- No space: one well-mixed jar, no wet and dry corners, no climbing, no shading between plants.
- No seasons unless you change the room settings.
- Populations are continuous numbers, so very small colonies do not fluctuate randomly.
- Charcoal has no modelled effect (its benefit is debated and I found no quantitative basis).
