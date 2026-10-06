# Model

One step is one hour. Order: climate -> plants -> animals -> decomposition -> fungi -> soil -> water -> gas.

## Pools

| Pool | Unit | Meaning |
|---|---|---|
| substrateWater, reservoirWater, condensation | g | Where the water is. Sealed: the sum is constant (tested). |
| co2 | mg | CO2 in the air space |
| detritus | g dry | Fresh dead matter: litter, dead plants, frass |
| humus | g dry | The substrate's own slow-rotting organic matter |
| nutrient | mg N | Plant-available nitrogen |
| mold | g | Visible fungal mass |
| wood, mycelium, mushroom | g | Driftwood (dry), the fungus living in it, and mushrooms standing now (fresh). Only when the jar has driftwood. |

Beside the pools, `soil` holds pH and air (0 sour to 1 open), and each plant has a position `at` (u, v in -1..1 across the floor).

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
- **Shade:** each plant stands `heightCm x sqrt(size)` tall and shades a circle about as wide as it is tall. A shorter plant inside it loses light in proportion to the overlap and to how much the other towers over it (at most 70%). It only matters where light is limiting: under a bright grow light a shaded moss is still saturated.
- **pH:** growth runs at full speed inside the species' pH range and slows to 40% well outside it. pH never kills a plant on its own.

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
- Decay is slower when the soil is short of air (down to 35% when sour).

## Soil

- **pH** starts at the mix's value (ABG 5.8, bioactive 6.3, peat 4.2, potting soil 6.2). Organic acids from decay lower it; the mix's own minerals pull it back slowly. A typical jar drifts down 0.2 to 0.3 in a year.
- **Air** follows moisture: open below field capacity, gone at saturation. It drains away over about a day and returns within hours. Below 0.3 the jar raises a "sour soil" alert.

## Fungi

- Driftwood arrives already holding mycelium (2% of what it can support). In moist, humid, still conditions it spreads logistically through the wood, slowly rotting it into CO2 and nitrogen.
- When the wood is half colonised, the air is above 90% RH and the soil is wet, there is a daily chance of a flush: mushrooms grow over three days, stand for a week, then collapse into the litter. Fruiting spends half the mycelium, and it rests at least six weeks before fruiting again.

## Derived readings

- **VPD** (kPa) = saturation vapour pressure at air temperature x (1 - RH). Sealed jars sit near 0.1.
- **DLI** (mol/m2/day) = PPFD x photoperiod x 3600 / 10^6.

## Calibration: what is still a guess

Constants live in `src/core/config.ts`; species numbers in `src/organisms/species.ts`.

| Constant | Status |
|---|---|
| Saturation vapour density, thermal curve shape, stage structure | Standard physics / published model structure |
| Springtail timings and tolerances | From literature (see RESEARCH.md) |
| `heatPerPpfd`, `evapCoeff`, `runoffPerH` | Estimated. Calibrate with a thermometer/hygrometer in a real jar. |
| CO2 levels | Order-of-magnitude only. `gasLeakPerH` (0.25 air changes per hour through lid seams) is tuned so a new jar sits in the low thousands of ppm while it decomposes its starting litter, then falls by day as plants draw it down. Calibrate with a CO2 logger. |
| Mold growth and cap | Tuned so the bloom peaks in weeks 2 to 5, matching keeper reports |
| All plant parameters | Estimated from qualitative care guidance |
| Isopod and gnat reproduction | Estimated |
| Plant heights, shade reach and depth | Estimated |
| pH ranges per plant, acidification and buffering rates | Estimated; starting pH of each mix is typical of its ingredients |
| Fungal growth, fruiting thresholds and flush timing | Estimated, tuned so a humid jar with wood sees mushrooms within its first two or three months |

## Known limits

- Space only for light: plants have positions and shade each other, but water, air and mold are still one well-mixed jar (no wet and dry corners).
- No seasons unless you change the room settings.
- Populations are continuous numbers, so very small colonies do not fluctuate randomly.
- Charcoal has no modelled effect (its benefit is debated and I found no quantitative basis).
