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

### Isopod morphs: dairy cow (*Porcellio laevis*), rubber ducky (*Cubaris* sp.), magic potion (*Armadillidium vulgare*)

- Character in the model follows widely repeated keeper descriptions: *P. laevis* is large, fast-breeding and a heavy eater; *Cubaris* are slow breeders that want warmth and high humidity; *A. vulgare* rolls up and tolerates drier conditions.
- Not yet sourced here. All life-history numbers for these three are estimates and the first things to check against care sheets.

### Fungus gnats (*Bradysia*)

- Breed in soil that stays too damp; springtails compete with the larvae for food; drying and ventilation are the fixes ([Highland Moss](https://highlandmoss.com/?p=180197)).
- Estimated in code: all life-cycle timings (general entomology knowledge, unverified here) and the invasion rule.

### Vampire crabs (*Geosesarma* spp.)

- Small semi-terrestrial crabs from Java, kept in humid, mostly-land tanks. Keepers give 22–28 °C and 70–90% humidity ([Aquarium Source](https://www.aquariumsource.com/vampire-crab/), [Gensou](https://gensou.sg/?p=37034)), a group of 2–3 in a 40–75 L tank, a lid because they climb out, and a water dish (the same guides). Lifespan about 2–3 years ([Aquarium Source](https://www.aquariumsource.com/vampire-crab/)).
- The female carries roughly 20–80 eggs for about a month, and they hatch as fully formed crabs ([Josh's Frogs](https://joshsfrogs.com/sp/purple-vampire-crab-geosesarma-bogorensis-captive-bred-vcpurple)); the genus is known for few, large eggs and direct development ([Zenodo genus entry](https://zenodo.org/records/4609150)). Adults eat the young, so few survive without separating them ([Shrimpy Business](https://shrimpybusiness.com/blogs/shrimpy-business-blog/breeding-vampire-crabs)).
- They are omnivores that eat small invertebrates as well as detritus; keepers rely on springtails as live food between meals (the care guides above).
- Estimated in code: time to adulthood (120 days; no source found), food intake, the low effective birth rate standing in for cannibalism, soil moisture preference (set to "damp", since they depend on the water dish and air humidity rather than wet soil), and the predation rate (`CONFIG.fauna.catchPerHour`, at most 1% of a springtail colony an hour, with a springtail taken as 20 µg dry). With monthly feeding a trio holds on for years in a warm 40 L case; unfed in a small jar it dies out within a year.

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
| Bird's nest fern (*Asplenium nidus*) | Slow, upright rosette, rots if water sits in the crown (keeper knowledge, not yet sourced here) | Slow, tall: the strongest shade caster |
| Lemon button fern (*Nephrolepis cordifolia* 'Duffii') | Compact and forgiving (keeper knowledge, not yet sourced here) | Mid-speed, medium height |

pH ranges per plant (cushion moss on acid soil, maidenhair liking a little
lime) and the starting pH of each mix (peat strongly acid, limed potting
mixes near neutral) follow general horticultural knowledge and are not yet
sourced here.

Wood-decay fungi fruiting in terrariums is common in keeper reports; the
timings in the model are estimates.

**All plant numbers (PPFD ranges, growth rates, biomass caps) are estimates.**
Guides describe light as "bright indirect" and growth as "fast / moderate /
slow"; I translated those into numbers. This is the weakest-sourced part of
the model and the first thing to calibrate.

## 2b. Sourcing pass (October 2026)

A pass to replace estimates with sources. L = literature or extension service,
C = care sheet or keeper report. Light conversions: 1 foot-candle ≈ 10.8 lux;
for daylight 1 PPFD ≈ 54 lux, so 1 ft-c ≈ 0.2 PPFD.

**Light.** The old "opt" values were 2 to 4 times below measured or production
saturation. "opt" now means 95% of light saturation, and growth follows a
saturating curve up to it (see MODEL.md), so a higher opt does not starve plants
in moderate light.

| Plant | Now (comp/opt/max PPFD) | Basis | Source |
|---|---|---|---|
| Cushion moss | 5 / 250 / 600 | Measured 95% saturation 298 ± 36 PPFD (L) | [Marschall & Proctor 2004](https://pmc.ncbi.nlm.nih.gov/articles/PMC4242232) |
| Bird's nest fern | 10 / 300 / 800 | Grows best at 2000–4000 ft-c (L) | [UF/IFAS MREC](https://mrec.ifas.ufl.edu/foliage/folnotes/birdnest.htm) |
| Lemon button fern | 10 / 300 / 700 | Boston fern (same genus) 1500–3000 ft-c (L, congener) | [UF/IFAS EP550](https://edis.ifas.ufl.edu/publication/EP550/pdf) |
| Creeping fig | 10 / 300 / 1000 | Produced at 1500–3000 ft-c; tolerates sun when moist (L) | [UF/IFAS MREC](https://mrec.ifas.ufl.edu/foliage/folnotes/ficus.htm), [NC State](https://plants.ces.ncsu.edu/plants/ficus-pumila/) |
| Nerve plant | 20 / 250 / 600 | Production 1500–2500 ft-c; declines below ~100 ft-c indoors; sun scorches (L) | [UF/IFAS MREC](https://mrec.ifas.ufl.edu/foliage/folnotes/fittonia.htm), [NC State](https://plants.ces.ncsu.edu/plants/fittonia-albivenis/common-name/nerve-plant/) |
| Baby tears pilea | 15 / 220 / 500 | Pilea genus: 1000 ft-c and up (L, genus) | [UF/IFAS MREC](https://mrec.ifas.ufl.edu/Foliage/folnotes/pilea.htm) |

Some UF/IFAS pages above now return errors; their figures came from search
snippets. Spike moss and maidenhair have only qualitative guidance (shade,
bright filtered light; [RHS](https://www.rhs.org.uk/plants/17035/wd/details)).

**Temperature and pH.** Bird's nest fern 13/21/30 °C, pH 4.5–6.0
([NC State](https://plants.ces.ncsu.edu/plants/asplenium-nidus/)); maidenhair
10/21/28 °C, alkaline to neutral soil ([RHS](https://www.rhs.org.uk/plants/20650/adiantum-raddianum/details));
spike moss down to 6 °C ([RHS](https://www.rhs.org.uk/plants/17035/wd/details));
nerve plant up to 30 °C and pilea up to 29 °C (care sheets); lemon button fern
about 30 cm tall (care sheets). No pH source was found for nerve plant, pilea or
lemon button fern.

**Animals.**

| Species | Change | Source |
|---|---|---|
| Rough woodlouse | Brood 28 → 25 days (23 d measured at 22 °C) | [Horváthová et al. 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4525036/) (L) |
| Dairy cow isopod (*P. laevis*) | Maturity 70 → 180 days (first breeding at 7 months), life 500 → 450 | [Warburg et al. 2001](https://academic.oup.com/jcb/article/21/2/375/2679806), [Nair 1976](https://marineinfo.org/id/publication/8587) (L) |
| Magic potion (*A. vulgare*) | Brood 25 → 38 days, maturity 90 → 140 | [Animal Diversity Web](https://animaldiversity.org/accounts/Armadillidium_vulgare/) (L) |
| Dwarf white isopod | Temperature 17/26/30 °C | [The Bio Dude](https://www.thebiodude.com/blogs/isopod-and-springtail-clean-up-crew-guides-culturing-care-and-breeding/dwarf-white-isopod-care-sheet) (C) |
| Rubber ducky | Temperature 20/25/29 °C, brood 25 days (estimate from *C. murina*) | [care guide](https://rubberduckyisopods.com/blogs/news/official-rubber-ducky-isopods-care-guide-2020) (C) |
| Fungus gnat | Egg 3.5 d, larva + pupa 16 d, adult 4 d, 10 eggs/day, max 31 °C | [UF/IFAS IN372](https://ask.ifas.ufl.edu/publication/IN372), [Korean life-table study](https://koreascience.kr/article/JAKO199811920246943.pub) (L) |

Still unsourced: any life history for the dwarf white isopod; rubber ducky
maturity and lifespan; the time *P. laevis* carries its brood; how fast
*P. scaber* matures in warm cultures (field data say 14+ months; the model's
110 days is kept and flagged).

**Substrate pH.** Peat 3.0–4.5 ([U. Arkansas](https://www.uaex.uada.edu/publications/pdf/fsa-6097.pdf)),
pine/fir bark 4.1–5.1 ([HortTechnology](https://journals.ashs.org/view/journals/horttech/26/5/article-p565.xml)),
coir 5.5–6.8, and bagged mixes limed to 5.5–6.5 ([Black Gold](https://blackgold.bz/ph-black-gold-potting-mix),
[UConn](https://soiltesting.cahnr.uconn.edu/wp-content/uploads/sites/3514/2022/06/Purchasing-Potting-Media.pdf)).
So bagged potting soil is now 6.0, and ABG 5.3: an estimate from its bark and
peat, since no measured value was found. The yearly drift remains an estimate;
the mechanisms (nitrification, root acids, decomposition) are documented but
no long-term rate for closed, unfertilised media was found.

**Fungi.** Keepers report driftwood fruiting anywhere from a few weeks to a few
months after setup ([Terrarium Tribe](https://terrariumtribe.com/?p=4950)); small
mushrooms stand "only a few days" ([JungleDragon](https://www.jungledragon.com/specie/3869/flowerpot-parasol.html));
cultivated logs rest 6–8 weeks between flushes ([Cornell Small Farms](https://smallfarms.cornell.edu/resources/methods-of-commercial-mushroom-cultivation-in-the-northeastern-united-states/5-forcing-bolts/)),
and fruit at 85–95% humidity ([UC ANR](https://ucanr.edu/sites/sfp/files/144812.pdf)).
The model now holds a flush for 5 days and fruits at 85% humidity or more.

## 3. Gaps worth closing next

1. Measured light levels (PPFD or lux) for each plant; horticulture literature has these.
2. Isopod brood size and interval from primary sources.
3. Temperature and humidity logs from a real jar, to calibrate the heating and condensation constants.
4. More candidates: *Peperomia*, jewel orchids, *Marcgravia*, tropical mosses, *Porcellionides pruinosus* (powder isopods), predatory mites, mushrooms as a visible stage of the fungus.
