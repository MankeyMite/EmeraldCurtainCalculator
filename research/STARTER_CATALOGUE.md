# Drawing-only starter catalogue

The guide uses the catalogue when **Search optimal PID** is clicked after valid
TID entry to recommend a starter and an
eleven-consecutive-advance window, then configures the starter timer automatically.
It preserves the actual SID and PID search windows, calibration, first countdown
and existing identified starters. An automatic selection is saved once; later
manual countdown edits are not overwritten when reloading. Re-running the button
explicitly applies the new target if no starter evidence has been recorded.
Progress tracks processed advances, remains below 100% during final ranking,
and reaches 100% only when the worker returns its result. The completed eleven-PID
preview is saved with the guide. Editing search inputs cancels stale work.

## Included data

- Exactly **2,001 Emerald Method 1 PID/IV entries**, seed zero, advances
  **1000–3000 inclusive**. These are advances, not PKHeX's frame numbering.
- Six IVs, ability slot zero, and level-5 summary stats after Birch's Zigzagoon
  for each of Treecko, Torchic and Mudkip.
- The four useful IV plaintext nibbles, their SID candidates and their actual
  curtain observation indices after PID-dependent data permutation.
- Precomputed base SID test masks: IVs, known-zero plaintext and the SID header's
  zero/nonzero tests. Duplicate candidates at a position are counted once.
- **824 legal move preparations**, including every permutation of occupied
  slots. Every four-move set has all **24 orders**.
- **24 held-item choices**, including no item. Each complete setup uses exactly
  one choice; a consumed Bullet Seed TM cannot also be held.
- Schema 2 also caches future item/move tests and attainable Defense/Speed EV
  coverage through 10, 16, 32, 64, 110 and 240 EVs per stat. These are separate
  experiment budgets, never evidence or part of the initial drawing-only setup.
- Equivalent coverage shares a cheapest representative. A setup is pruned only
  if another setup costs no more and tests a superset of its digits in all four
  SID positions, both initially and at every supported future EV budget. All legal
  preparations remain available in the data.

The generated JSON is about **3.18 MB uncompressed / 180 KB gzip**. Common move
and item contributions are stored once rather than repeating millions of full
PID × moves × item records. A worker loads the data on demand when the guide
requests a recommendation or the matching preparation for its landed PID.

`src/data/starter-catalogue.json` is the machine-readable catalogue.
`research/starter-catalogue-spreads.csv` is the readable 2,001-row PID/IV list.
The CSV lists IV tests and base tests; the additional move/item tests depend on
which single preparation is selected and are stored in the JSON recipes.

## Route assumptions and legality

The starter receives all EXP and EVs from the modeled battles; it is not traded,
does not evolve, has no Pokérus or EV multiplier, and receives no PP Ups, contest
training or ribbons. Existing guide storage-padding assumptions are retained.

The baseline includes Birch's Zigzagoon, the starter-dependent rival, Calvin's
Poochyena, the Aqua Grunt's Poochyena, **Lyle's four level-3 Wurmple**, and
**James's two level-6 Nincada**. The two Bug Catchers are a conservative beginner
route choice, not a claim that they cannot be avoided.

| Starter | HP | Attack | Defense | Speed | Sp. Attack | Sp. Defense |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Treecko | 4 | 2 | 2 | 1 | 1 | 0 |
| Torchic | 4 | 3 | 2 | 1 | 0 | 0 |
| Mudkip | 4 | 2 | 2 | 2 | 0 | 0 |

These battles yield **684 total EXP**, reaching level 10. This includes the
four Wurmple rather than accidentally adding them again to an already logged
total. Extra Defense/Speed training is never included in drawing-only coverage.

Natural move-learning and refusal choices are enumerated through level 11:

- Treecko: Pound, Leer, Absorb at 6, Quick Attack at 11.
- Torchic: Scratch, Growl, Focus Energy at 7, Ember at 10.
- Mudkip: Tackle, Growl, Mud-Slap at 6, Water Gun at 10.

Treecko can learn Cut and Bullet Seed; Torchic can learn Cut; Mudkip can learn
neither of these. The catalogue includes legal replacements in a full moveset,
not just filling the fourth slot. It also permits Cut and Bullet Seed together
on Treecko, with the TM consumed once. Cut cannot subsequently be overwritten.
All PP follows its move and is restored through PC storage.

Preparation times are internal effort estimates used to break ties, not measured
game timings. They reuse the existing item-acquisition costs, with 30 seconds per
move swap, 45–60 seconds per machine preparation and 60 seconds per extra battle.

Treecko's level-11 options require **two additional level-5 Wurmple**, giving
760 total EXP and two more HP EVs. These battles are explicitly included and
costed as move-learning preparation. They never tune Defense/Speed and are not
silently treated as part of the ordinary route. No level-11 Quick Attack is
invented for Torchic: Emerald teaches that move at level 28.

Unknown EXP digits, friendship, trainer gender, names and checksum correlations
are not borrowed to improve the prediction. Some are irrelevant to SID; others
could help when independently known. This makes the catalogue conservative,
not a claim that it models every deduction the full investigator can make.

## What the scanner does

`scanStarterCatalogue(catalogue, {tid, intro, starter})`:

1. Uses the existing TID-seeded new-game RNG calculation and the actual SID
   timing window. The default ±60 window remains intact.
2. Prioritises generating advances **target −9 through target +9**, clipped to
   the real window and optional remaining-SID restrictions. Repeated SIDs retain
   their advance witnesses for weighting, while competitor SIDs stay distinct.
3. Tests each possible landed PID and each starter. Each legal preparation is
   compared against the **entire surviving SID pool**, never just the 19 likely
   witnesses. Known-pixel signatures determine whether a drawing would uniquely
   distinguish each prioritised SID.
4. Picks one preparation per PID/species without knowing the true SID. It
   first minimises the worst required EV budget across the 19 priority witnesses,
   then the SID-distance-weighted EV effort. Within that safety profile it favours
   recovery within 10 EVs per stat, available item/move tests, drawing-only outcomes
   and practical setup cost. Each future budget groups actual distinguishable
   outcomes against the full surviving SID pool, not just the priority sample.
5. Ranks targets by the exact target's worst EV budget and the worst within
   +/-3 advances. Next it favours easy outcomes at the exact target, lower weighted
   nearby EV effort, nearby easy outcomes, then drawing-only coverage. Within
   +/-3, landing weights are 4, 3, 2, 1 by distance. The full eleven-row window
   receives weights 6 through 1 by distance as a later tie-break. A flattering
   outer-row average can no longer outweigh a safer precise target.
   A level-5 nature/gender/stat combination that also matches another PID
   inside the actual starter search window counts as a retry; an ambiguous
   exact centre cannot become the recommended target.
6. Returns a target for each starter, the best overall target, preparation IDs,
   exact move/item facts, diagnostic coverage and explicit assumptions.

SID generation witnesses receive triangular weights 10 at the estimated target,
9 at +/-1, through 1 at +/-9. **All timing weights are planning assumptions, not
measured probabilities.** The table retains raw, unweighted N/19 counts; the
ranking uses the weights. Existing expected-coverage diagnostic fields retain
uniform averages for comparison with older benchmark reports. Every claim is
checked against the full surviving SID pool, and the scanner never receives the
actual SID as a separate input.

The bounded EV assessment unions legal item changes, the six single move swaps,
and monotonically attainable Defense/Speed checkpoints. It estimates the first
sufficient budget, not the exact shortest experiment sequence; the existing
post-catch rehearsal gives specific actions for nearby SIDs. It excludes vitamins.
Large EV targets are penalised rather than silently treated like a short item test.
Even the best target can have difficult neighbours; RNG outcomes do not improve
monotonically as you approach a chosen advance.

An optional `expectedLandingRadius` can score a more confident timing range
without narrowing the actual PID search. `rankCatalogueTargets` can re-score
the same results without repeating the recipe search. For example, a ±9
likelihood range can retain a ±60 PID search for identification. Recommendations
near the catalogue edges are rejected if their full PID search would extend
outside the catalogue. Countdown conversion uses the existing calibration and
rejects results below the user-tested **15-second minimum**.

This is a finite exhaustive preparation comparison for the stated rules, not
an optimal plan over every possible game action. Initial drawing-only coverage excludes vitamins and
extra Defense/Speed training; future EV budgets are used only to assess risk. Windows larger than 4096 distinct SID competitors are
rejected rather than silently approximated by a sample.

## Benchmarks: five illustrative TIDs

These measurements predate the guide's eleven-PID integration. They compare
the broad and ±9 ranking models, not the guide's current ±5 recommendation.

Settings: first intro countdown 5 seconds, second 20 seconds, dialogue delay 50
advances, calibration zero and SID uncertainty ±60. The expected SID target is
advance 1245. Each benchmark scores all three starters across advances
1000–2000, prioritising 19 SID-generating advances while retaining 120–121
distinct competitors. These five TIDs are examples, not a representative study.

| TID | Scan seconds | Best with ±60 landing model | Estimated drawing-only coverage | Best with ±9 landing model, still ±60 search | Estimated coverage |
| --- | ---: | --- | ---: | --- | ---: |
| 48734 | 2.20 | Torchic, advance 1856 | 59.7% | Mudkip, advance 1938 | 65.9% |
| 30134 | 5.03 | Torchic, advance 1855 | 63.1% | Torchic, advance 1658 | 67.9% |
| 52759 | 5.43 | Torchic, advance 1856 | 67.4% | Mudkip, advance 1669 | 73.4% |
| 46049 | 5.45 | Torchic, advance 1354 | 64.8% | Mudkip, advance 1151 | 69.5% |
| 16159 | 5.57 | Torchic, advance 1852 | 66.2% | Mudkip, advance 1718 | 73.1% |

The fixed 20-second Torchic comparison uses **the same optimised catalogue
preparations**, not the old route planner. Its mean coverage is 59.3%; choosing
the best broad target/starter raises that to 64.2%, about **4.9 percentage
points** in these five examples. These numbers cannot be directly compared with
the previous 37% simulation, which used different trials and route choices.

**No tested PID gave drawing-only coverage for all 19 likely SIDs in these five
worlds. Therefore no all-green 5–6-advance cluster was found either.** The
catalogue can find better odds, but these results do not support presenting a
guaranteed safe region. Sparse tests of the highest SID digit remain a limiting
factor when the permitted setup has only one held item and no EV tuning.

The initial isolated scan took about 2.4 seconds. Subsequent benchmark runs
ranged from 2.2 to 5.6 seconds under the recorded host load; generation took
about 0.4 seconds. Browser performance is not yet measured. The reproducible
machine/Node details and all target alternatives are recorded in
`research/starter-catalogue-benchmark.json`.

## Ranking regression: TID 50998

The old average-first model recommended Mudkip at advance 2394. The reported
landing at 2397 could need 64 Speed EVs for SID 06425 at the estimated SID target
+1. Under the revised bounded-EV ranking the target is Torchic at advance 2278,
with a second countdown of 38.09 seconds at the initial +3 calibration.

The existing post-catch rehearsal, checked independently from the catalogue's
19-witness scoring, gives these outcomes across the closest 11 SID witnesses:

| Starter advance | Drawing only | Largest total Defense/Speed EV target |
| --- | ---: | ---: |
| 2275 (-3) | 8/11 | 6 |
| 2276 (-2) | 7/11 | 208 |
| 2277 (-1) | 7/11 | 6 |
| **2278 (target)** | **8/11** | **0 extra training required** |
| 2279 (+1) | 7/11 | 10 |
| 2280 (+2) | 7/11 | 192 |
| 2281 (+3) | 10/11 | 208 |

These are deterministic estimates for one TID and the stated timing assumptions,
not a general success-rate study. The exact target improves substantially and
its immediate neighbours avoid heavy training; difficult +/-2 or +/-3 cases
remain. At the target, the full 19-witness catalogue score is 11/19 drawing only
and 18/19 without training, so one outer SID witness can still require a long test.
The full 121-SID search is retained. A scan took about 6.2 seconds on the local
host; browser load and hardware can change this.

## Regeneration and extension

```sh
npm run catalogue:build
npm run catalogue:check
npm run catalogue:benchmark
# Optional: benchmark particular public TIDs
npm run catalogue:benchmark -- 48734 30134
```

The builder reuses the existing Method 1 search, plaintext encoder, move-order
permutations, PP logic, battle yields and early-item database. To extend coverage:

1. Add a verified move/item/route source to the corresponding existing data or
   update `src/data/starter-catalogue-rules.json`. New machine moves require
   explicit acquisition and consumption rules in the builder; compatibility
   alone is not enough.
2. For a genuinely known additional field, `additionalPlaintext` accepts entries
   such as `{id, source, facts, species?}`. These are supported `KnownFacts`,
   carried into the returned preparation as well as its coverage masks. A raw
   test digit cannot be added without the underlying fact. Hidden SID/PID/IV
   injections and contradictions with the route are rejected. Conditional facts
   such as trainer gender must never become unconditional assumptions for all
   players; they need a separately selected, verified configuration.
3. Regenerate both JSON and CSV. Do not manually edit individual PID digit lists.
4. Run the catalogue tests and check. The checked-in data must regenerate exactly.

The PID-independent recipe factors can be extended without recalculating them
for every TID. At runtime the scanner only combines the precomputed masks and
groups possible binary outcomes. Future unions describe several experiments,
never an attainable one-drawing setup. Equivalent-coverage caching avoids repeated
work without pruning preparations that offer stronger future tests.

## Validation and sources

- Every cached PID/IV spread is checked against an independent BigInt LCG.
- Level-5 stats are checked against independent stat/nature formulas.
- All 24 permutations are covered by direct canonical-data permutation and XOR
  encryption; no production test-mask helper supplies the expected pixel pattern.
- The fast group counter is checked against a slower full-window calculation.
- Route EVs, EXP, legal replacements, consumed TMs, all move permutations,
  pruning dominance, source extensions and range edges are checked.
- Independent encrypted records verify future item/move/EV coverage, monotone
  budget masks, and that forecast training never changes initial facts.
- Synthetic windows verify exact-target safety, nearby EV risk, SID-distance weighting,
  eleven consecutive rows and independence from the wider actual PID search.
- **100 drawing-only claims** are checked by generating independent encrypted
  curtain drawings and recovering their hidden SID with the existing solver.
  This validates positive claims; it is not a 100% overall success-rate claim.

Source revision: `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` of pret/pokeemerald.
The trainer parties establish Lyle's four level-3 Wurmple and James's two level-6
Nincada. Early learnsets establish the move levels. Machine compatibility,
starter creation, EXP/EV yields and the existing early-item source audit supply
the remaining supported mechanics:

- [Trainer parties](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/trainer_parties.h)
- [Level-up learnsets](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/pokemon/level_up_learnsets.h)
- [Pokémon creation and data encoding](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c)
- [Early item source audit](STARTER_GUIDE.md)
