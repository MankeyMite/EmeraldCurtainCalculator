# Static encounters, starters and ordinary gifts

The single **Static (encounters, starters and gifts)** obtaining category now
uses **Limit RNG advances**, alongside Wild. Existing `starter` and `gift` JSON
origins migrate to `static` without changing facts or observations. Legacy RNG
settings without `kind` remain wild and are never silently used for Static.
Changing the obtaining category disables the previous RNG scope.

Static defaults to seed 0, inclusive advances 0-3600, and Method 1. The existing
seed/settings disclosure offers Method 4 as well. No encounter area or lead
ability is required. The range counts RNG calls; advance 0 means the state
immediately before the first PID call, rather than a wild encounter-slot call.

`staticRng.ts` generates the PID from successive low/high 16-bit outputs of the
existing unsigned LCG. Method 1 uses the following two IV words; Method 4 skips
one call between the IV words. This path has no wild encounter slots, level
rolls, nature rejection or lead-ability calls. Single-ability species retain
the actual zero stored ability-selection bit from CreateBoxMon.

Generated tuples enter the existing shared recovery pipeline. Nature, gender,
ability, known IVs, summary stats and verified pixels filter them. With TID,
joint SID/checksum/shiny constraints and experiment ranking apply as usual.
Without TID, surviving PID/IV bounds still update, and no PID is supplied as a
fact. Correlated tuples stay together. Debounce, worker cancellation and the
Finish drawing pause remain in effect. JSON, autosave and backups retain the
static method and advance scope.

This models ordinary random-PID Emerald creation. Special fixed-PID or event
gifts, trades, roamers, breeding, foreign-origin generation and evolution
backtracking require different models. Counts are conditional on the selected
method, seed and range. Existing 1,000,000-advance, 5,000-spread and 200,000-joint-
hypothesis limits prevent silent truncation. No new emulator capture is claimed.

Seven regression tests cover independent BigInt generation across seeds and
inclusive bounds, published PID/IV vectors, stored ability bits, filters and
multiple snapshots, immediate verified target evidence, shiny/SID recovery,
IV bounds without TID, JSON migration and enabled static UI controls.

Primary references:

- [Pinned Emerald Random32](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/random.h)
- [CreateBoxMon PID/IV/ability generation](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c)
- [ScriptGiveMon and scripted encounters](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/script_pokemon_util.c)
- [PokeFinder static generation reference](https://github.com/Admiral-Fish/PokeFinder/blob/master/Core/Gen3/Generators/StaticGenerator3.cpp)
- [Numeric Method 1 / Method 4 vectors](https://github.com/Admiral-Fish/PokeFinder/blob/master/Test/Gen3/static3.json)

PokeFinder supplies research references and numeric test data; its implementation
code is not copied into this project.
