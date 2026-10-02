# Research notes

What the simulation is built on. Each claim links to where it came from. Where a
number in the code is my own estimate rather than a sourced value, it says so.

## 1. What makes a terrarium work

**It is a water cycle in a jar.** A closed terrarium recycles its moisture by
evaporation and condensation and can go months without watering
([Terrarium Creations](https://terrariumcreations.com/how-to-make-a-closed-terrarium/),
[Iowa State Extension](https://yardandgarden.extension.iastate.edu/how-to/how-create-and-care-terrarium)).
Condensation is the gauge keepers read: a light mist that comes and goes means
balance; bone-dry glass means it needs water; heavy constant fog means too much
water or too much sun.

**Layers exist to keep roots out of standing water.** Bottom to top: drainage
layer (false bottom), a mesh or moss barrier, optional charcoal, then an airy
substrate such as ABG mix (bark, coir, charcoal, sphagnum, lava rock)
([One Little Project](https://onelittleproject.com/?p=161197)).
Closed jars have no drain hole, so root rot from waterlogging is the top risk.

**Overwatering is the number one killer**, followed by direct sun. Bright
indirect light is the standard advice; direct sun through closed glass
overheats the jar.

**Light also drives the water balance.** Plants in too little light transpire
less, which raises the risk of waterlogging and fungus.

**Choose plants that share one climate and grow slowly.** Small leaves, slow
growth and tolerance of high humidity are the selection criteria; fertiliser is
discouraged because it speeds up crowding
([Iowa State Extension](https://yardandgarden.extension.iastate.edu/how-to/how-create-and-care-terrarium)).

**Mold is normal at first.** New setups commonly grow mold in the first 2 to 4
weeks ("new terrarium syndrome"); the causes are excess moisture, stagnant air
and fresh organic matter, and the standard cure is springtails plus airing out
([GC Shop](https://www.gcshop-sg.com/blogs/terrarium-plants/why-fungus-and-mold-grow-in-my-terrarium),
[Science Insights](https://scienceinsights.org/what-causes-white-fuzzy-mold-in-a-terrarium/)).
The white fuzz is a decomposer that attacks dead material, not living plants.

**A clean-up crew closes the loop.** Springtails and isopods eat mold and dead
matter and return nutrients to the plants. Their numbers self-limit: with
nothing left to eat they stop multiplying.

### What makes one *awesome* to track

These are design conclusions drawn from the above, not sourced facts:

- **Legible signals.** Condensation, wilting, and mold are things a keeper can see. The sim exposes them directly (condensation index, turgor, mold mass).
- **Organisms with personality.** Fittonia that faints and revives; creeping fig that takes over; a springtail boom after a mold bloom.
- **Slow drama.** Things change over weeks, so checking in is rewarding.
- **Mistakes with recoverable consequences.** Overwatering brings gnats; airing out fixes it.
- **Visible animals.** Larger isopods are watchable; dwarf whites and springtails do the invisible work.

## 2. Organisms

### Springtails (*Folsomia candida*): best-documented organism in the model

- Parthenogenetic, soil dwelling, a standard lab model species.
- Egg-to-egg life cycle of about 25 days at 20 C ([Eur. J. Entomol. 2019](https://eje.cz/pdfs/eje/2019/01/25.pdf)).
- Cold (10 C) delays egg laying and hatching and lowers hatch success ([Univ. of Debrecen thesis](https://dea.lib.unideb.hu/items/a51b59ca-2677-4edf-b9ab-4d09e9694921)).
- Repeated mild heat shocks at 30 C reduce egg numbers ([VU Amsterdam](https://research.vu.nl/en/publications/evaluation-of-life-history-traits-in-folsomia-candida-exposed-to-/)).
- Dry soil is lethal: about 60% mortality at 4% soil water content ([Environ. Sci. Technol.](https://pubs.acs.org/doi/abs/10.1021/acs.est.2c07497)).
- Reference life span around 75 days ([Add-my-Pet entry](https://bio.vu.nl/thb/deb/deblab/add_my_pet/entries_web/Folsomia_candida/Folsomia_candida_res.html)).
- **Model structure to copy:** a 2026 formal population model uses egg / juvenile / adult stages, with development, reproduction and death driven by temperature, soil moisture and food through thermal performance curves, and combines temperature and moisture by limiting factor ([Xie et al. 2026](https://aem.pensoft.net/article/184962/)). This repo's fauna engine follows that structure.
- Estimated in code: per-capita food intake, realised daily fecundity, carrying density.

### Dwarf white isopods (*Trichorhina tomentosa*)

- Under 5 mm, burrowing, reproduce without males, room temperature is fine, ideal humidity 80%+ ([Terrarium Tribe](https://terrariumtribe.com/dwarf-white-isopods/), [The Bio Dude](https://www.thebiodude.com/blogs/isopod-and-springtail-clean-up-crew-guides-culturing-care-and-breeding/dwarf-white-isopod-care-sheet)).
- 21 to 29 C; eat rotting wood, leaf litter, some protein ([Pangea](https://www.pangeareptile.com/products/trichorhina-tomentosa-dwarf-white-isopods)).
- About 20 is plenty for a standard planted terrarium ([Terrarium Tribe shop](https://shop.terrariumtribe.com/products/dwarf-white-isopods-trichorhina-tomentosa)).
- Estimated in code: brood size, brood interval, time to maturity, life span. I found no primary source for these.

### Rough woodlouse (*Porcellio scaber*)

- Temperate, tolerates drier conditions (50 to 75% humidity) but needs a damp refuge to moult; strong appetite, needs protein ([The Bio Dude](https://www.thebiodude.com/blogs/isopod-and-springtail-clean-up-crew-guides-culturing-care-and-breeding/scaber-isopod-care-sheet)).
- Lives 2 to 3 years, 60 to 85 F; starving isopods may gnaw soft-bodied tankmates ([Josh's Frogs](https://training.joshsfrogs.com/sp/porcellio-scaber-koi-isopods-10-count-jfpodpskoi)). The model extends this to nibbling plants when hungry, which keepers report but I did not source.
- Estimated in code: brood size and timing, intake.

### Fungus gnats (*Bradysia*)

- Breed in soil that stays too damp; springtails compete with the larvae for food; drying and ventilation are the fixes ([Highland Moss](https://highlandmoss.com/?p=180197)).
- Estimated in code: all life-cycle timings (general entomology knowledge, unverified here) and the invasion rule.

### Plants

Recurring recommendations across guides: nerve plant, creeping fig, pilea,
spike moss, cushion moss, maidenhair fern
([Leafy Place](https://leafyplace.com/closed-terrarium-plants/),
[Gardeners' World](https://gardenersworld.com/plants/best-terrarium-plants),
[Bob Vila](https://www.bobvila.com/articles/best-terrarium-plants.md)).

| Plant | Sourced character | In the model |
|---|---|---|
| Nerve plant (*Fittonia*) | Needs high humidity, struggles outside a terrarium | Fast wilt, fast recovery |
| Creeping fig (*Ficus pumila*) | Fast, tolerates low light | Highest growth rate, triggers pruning |
| Spike moss (*Selaginella*) | Needs constant moisture, low light | Narrow moisture range, slow recovery |
| Cushion moss | Low light, constant moisture, dislikes being soggy | Very slow, low waterlogging tolerance |
| Maidenhair fern | Hard indoors, good under glass | Highest drought penalty |
| Baby tears pilea | Small leaves, trailing, loves humidity | Mid-speed ground cover |

**All plant numbers (PPFD ranges, growth rates, biomass caps) are estimates.**
Guides describe light as "bright indirect" and growth as "fast / moderate /
slow"; I translated those into numbers. This is the weakest-sourced part of
the model and the first thing to calibrate.

## 3. Gaps worth closing next

1. Measured light levels (PPFD or lux) for each plant; horticulture literature has these.
2. Isopod brood size and interval from primary sources.
3. Temperature and humidity logs from a real jar, to calibrate the heating and condensation constants.
4. More candidates: *Peperomia*, jewel orchids, *Marcgravia*, tropical mosses, *Porcellionides pruinosus* (powder isopods), predatory mites, mushrooms as a visible stage of the fungus.
