# Bounded Emerald wild RNG search

Static encounters, starters and ordinary gifts now share the separate [Static Method 1/4 path](STATIC_RNG.md) and the same advance-limit controls. Their sequence differs from the wild methods below.

Wild origins can search H1, H2 and H4 without a known PID. Seed defaults to 0; the user supplies inclusive minimum/maximum advances and an encounter area. Results remain conditional on that scope. Numeric inputs accept decimal or `0x` hex. At most 1,000,000 advances and 5,000 distinct spreads are accepted per run. Above 200,000 joint hypotheses, an explicit refinement message replaces the result; no truncated search enters recovery.

## Generation and indexing

The unsigned 32-bit LCG uses multiplier `0x41C64E6D`, increment `0x6073` and the upper 16 bits of each updated state. Affine exponentiation jumps to the minimum advance. Advance 0 is the seed immediately before encounter-slot selection; Rock Smash includes its preceding encounter-rate check. Advances count RNG calls, not elapsed seconds or the final PID-half index.

Each encounter consumes slot/level and applicable lead rolls, then chooses a nature. Successive low/high PID pairs are rejected until nature and any active Cute Charm gender requirement match. H1 uses the next two IV words; H2 skips one call before the first word; H4 skips one call between the words. IV order here is HP / Attack / Defense / Speed / SpA / SpD. Creation ability selection includes zero selection for single-ability species.

The mathematics was checked against [pret wild encounters](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/wild_encounter.c), [Pokémon creation](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c) and [PokéFinder's generator](https://github.com/Admiral-Fish/PokeFinder/blob/master/Core/Gen3/Generators/WildGenerator3.cpp). This is an independent implementation; no PokéFinder implementation code is bundled.

`scripts/extract-wild-encounters.mjs` extracts 292 Emerald encounter tables from the pinned pret checkout. Grass/cave, surf, Old/Good/Super Rod and Rock Smash are represented. Supported leads are no generation effect, Synchronize with selected nature, male/female Cute Charm and Pressure/Hustle/Vital Spirit. Safari, Route 119 Feebas fishing, Static/Magnet Pull, Intimidate/Keen Eye extra calls, outbreaks, roamers, events, starters, breeding and transferred-origin generation are outside this search. Use the species at capture; evolved-species backtracking is not implemented. Repel does not change a successful encounter's PID/IV sequence and is not used to assert accessibility.

## Recovery integration

Known species/met data, nature, gender, ability, all recorded PID-header pixels and known IVs filter generated spreads. Summary stats use each snapshot's own level/EVs. Unknown EVs use a conservative stat interval, not zero defaults or a joint legality constraint. Pending item drawings are excluded.

With TID, exact stored-data/checksum constraints test each correlated PID/IV/ability spread against every saved snapshot. Key/header digit intersections reduce SID enumeration before checksum checks. Each hypothesis retains its IV tuple through projection; IVs from different methods are never mixed into invented combinations. Equivalent advances/methods are deduplicated. Counts are labeled PID/SID/IV hypotheses. Item predictions require only a common Growth-block position, allowing several PIDs and other block orders.

Settings stay separate from supplied facts and round-trip through investigation JSON/autosave. A worker supports cancellation and reruns when saved evidence changes. Stale or incomplete results do not enter recovery. Turning off RNG restores ordinary inference. The older single-observation view is collapsed and labeled as ignoring RNG.

## Independent checks and Poochyena

Numeric [PokéFinder golden vectors](https://github.com/Admiral-Fish/PokeFinder/blob/master/Test/Gen3/wild3.json) check H1, H2/Synchronize and H4/Cute Charm at exact advances. An independent BigInt oracle checks LCG arithmetic and jump indexing. Optimized SID results are compared with exhaustive enumeration. Tests cover bounds, filters, correlations, JSON, rejected scopes and pending item drafts.

Searching the **reviewed** Poochyena session with seed 0, advances 0–99,999, Route 101 grass, no lead effect and all three methods leaves **one PID/IV spread**: PID **2384797520 / 0x8E251F50**, **H2 at advance 603**, IVs **2 / 1 / 30 / 4 / 22 / 13**. The checksum-valid reference confirms it and its genuine SID survives. PID/IVs are never supplied to the search or copied into known facts. This uses the corrected origin game and two disputed pixels left unknown; the original conflicting session remains contradictory.

Widening to 0–999,999 preserves another compatible spread at advance 194,788, totaling 288 joint hypotheses. A narrower scope establishes conditional uniqueness, not uniqueness outside that scope. This is stored-fixture validation, not a new emulator capture.
