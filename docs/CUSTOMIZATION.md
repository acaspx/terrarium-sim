# Customization: vendor research and the v1 scope

What people who sell, teach and build terrariums let customers choose, and what
that means for how far customization should go in v1 of this app.

## What the market offers

| Who | Kind | How the customer customizes |
|---|---|---|
| [Terrarium Creations builder](https://terrariumcreations.com/terrarium-builder/) | Free web tool | Six guided steps: style (open or closed), container, drainage, substrate, plants, décor. Live preview as you go; ends with a shopping list and care guide. Has a "Surprise me" button. |
| [The Planter](https://theplanter.com.co/pages/build-your-own-kit) | Kit builder (in development) | Style, then vessel (bubble bowls, geometric, wide-mouth jars, sealed bottles), then plants filtered to the style and vessel size, then drainage, soil and sphagnum, then décor. |
| [NEHERP](https://www.neherpetoculture.com/vivariumbuilder) | Bioactive kits | Pick an enclosure from fixed sizes (aquariums, vertical conversions, front-opening terrariums from 8x8x8 to 36x18x36 in) or request a custom size. Then lighting, background, substrate and plant kits matched to the enclosure and the animal or environment. Plant kits let you adjust quantities per plant type, moss and moss slurry ([custom plant kit](https://www.neherpetoculture.com/plantkitcustom)). |
| [Josh's Frogs](https://joshsfrogs.com/kp/dart-frog-complete-kit-18x18x24-kit0076) | Species-first complete kits | Choose the animal (dart frog, tree frog, day gecko); the kit is enclosure, light, LECA false bottom, substrate barrier, bioactive substrate, sphagnum, leaf litter, plants and clean-up crew. |
| [The Bio Dude](https://www.thebiodude.com/) | Substrates by biome | Mixes named for climate: very humid and stagnant, warm with humidity spikes, hot with minor spikes (no drainage layer needed), and arid. |
| [Glass Aqua](https://shop.glassaqua.com/products/build-your-own-south-terrarium-plant-pack) | Plant pack builder | Plants chosen by role: foreground, background. |
| Workshops: [London Terrariums](https://londonterrariums.com/collections/workshops), [Tropical Glass](https://tropicalglass.co.uk/collections/terrarium-workshops), [ClassBento](https://classbento.co.uk/closed-terrarium-workshop-london) | In person | Choose a vessel size up front, then pick from a curated tray of fittonia, ferns, ivy and moss. Bring-your-own vessel within a size limit. |
| Commissions: [NEHERP design service](https://www.neherpetoculture.com/servicesvivarium), [BioVivara](https://biovivara.com/pages/custom-vivarium-design-and-build), [Cornel's World](https://www.cornelsworld.com/custom-terrariums/) | Fully custom | Design brief, revisions, deposit, then weeks of building. |
| Trackers: [Terrarium Tracker](https://apps.apple.com/app/id6752220718), [TerraTrack](https://apps.apple.com/app/id6780231335), Crestonia, Reptile Log | Care logs | Multiple enclosures, care logs, reminders, temperature and humidity readings (some via sensors). None simulate what the enclosure will do. |

## Patterns worth copying

1. **The vessel comes first.** Every builder starts with container type and size, because it filters everything after it.
2. **Customization is curated.** Choices are narrowed by earlier choices (plants matched to vessel and style, kits matched to enclosure size). Nobody offers an unbounded catalog.
3. **Layers are the shared mental model.** Drainage, barrier, substrate, plants, décor, bottom to top, appears everywhere from workshops to kits.
4. **There are two entry points.** Container-first (decorative terrariums) and inhabitant- or biome-first (vivariums). Both are valid; v1 uses container-first because the catalog is plants and microfauna.
5. **Starting points beat blank pages.** Kits, recipes and "Surprise me" exist because most people do not want to make every decision.

## The gap

Builders end with a shopping list. Trackers start once the jar exists and record what the keeper types in. Nobody shows what a design will do over the next three months, and nobody tracks a jar whose state changes on its own. That is what this app does: a 90-day forecast while you design, then a living jar on a shelf.

## The customization spectrum

| Level | What the person does | In v1 |
|---|---|---|
| 0. Pick | Choose a recipe and plant it | Yes |
| 1. Swap | Change parts of a recipe | Yes |
| 2. Compose | Build from blank with curated options | Yes |
| 3. Arrange | Place plants and hardscape by hand, sculpt the substrate | No |
| 4. Fabricate | Custom dimensions, backgrounds, misters, fans, lighting spectrum | No |

v1 stops at level 2. Levels 3 and 4 add a lot of interface without changing what the simulation can model, since it treats the jar as one well-mixed space.

### What v1 lets you choose, and what each choice changes

| Choice | Options | Effect in the simulation |
|---|---|---|
| Vessel | Apothecary jar, cork bottle, bell cloche, bubble bowl, glass cube, Wardian case | Shape and proportion (floor and glass area, so evaporation and condensation), opening size (how much a lid gap vents), allowed sizes and lids |
| Size | 1 to 40 L, filtered by vessel | Air, substrate and water volumes |
| Lid | Sealed, cork, vented, open (filtered by vessel) | Ventilation: humidity, drying, gas exchange, mold growth |
| Drainage | LECA, gravel, none | Whether excess water has somewhere to go |
| Substrate | ABG, bioactive tropical, peat and sphagnum, bagged potting soil | Water held, drainage speed, nutrients, slow organic matter, starting mold food |
| Depth | Shallow, standard, deep | Substrate volume |
| Hardscape | Driftwood, stone, leaf litter | Food for mold and isopods; stone takes air space |
| Plants | 6 species, up to 8 plants, three starting sizes | Everything plant-side |
| Clean-up crew | Springtails, dwarf white isopods, rough woodlice, preset counts | Mold control, litter processing, nutrient return |
| Placement | Dim corner, north window, east window, grow light (low, medium, high), sunny windowsill | Light level and photoperiod, so growth, heat and the water cycle |
| Room | Cool, average, warm | Temperature for everything |
| Starting moisture | Dry, damp, wet | The first weeks of the water balance |
| Name | Free text | Nothing (the only cosmetic option) |

### Rules for the v1 builder

- **Every option changes the simulation.** No purely cosmetic choices except the name.
- **Filter, do not forbid.** Lids and sizes are filtered by vessel. Risky combinations are allowed but flagged inline (direct sun on a closed jar, no drainage, starting wet, fussy plants under an open lid).
- **Show consequences continuously.** The preview jar and the 90-day forecast update as you change things.
- **Start from a recipe.** Three recipes plus blank, and "Build another like this" from any jar on the shelf.

### Deferred, and why

| Later | Why not now |
|---|---|
| Open and arid terrariums with succulents | Needs arid species in the catalog |
| Drag-to-place layout | The model has no space yet; placement would be decorative |
| Backgrounds, misting systems, fans | Vivarium hardware; matters once animals beyond microfauna are added |
| Frogs, geckos, other display animals | Large bioload and welfare responsibilities; needs feeding and waste modelling |
| Shopping lists and vendor links | A business decision, not a modelling one |
| Real sensor sync | Strong future hook: calibrate the simulation against a real jar |

## Multi-terrarium view

- **Shelf** is the default: jars stand on continuous planks, each with a hanging tag for name, day, health and the one thing that matters most. It is glanceable and it is the product's signature.
- **Compare** is a table for people tracking several jars: day, health, soil, humidity, air, glass, plants alive, crew and status side by side.
- **Since you last looked** summarises what happened in each jar while the keeper was away.
- **Time** is shared across the shelf: paused, real time (jars keep living while the tab is closed and catch up on return), a day per second, or a week per second.
