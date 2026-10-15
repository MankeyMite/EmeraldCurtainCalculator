# EXP and summary-assisted IV ranges

Reference: pret/pokeemerald commit `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`. Curtain graphics and storage mapping are unchanged.

## Source rules

[`include/pokemon.h`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h) places unsigned 32-bit EXP at Growth +04 (logical decrypted secure bytes 4–7). Supplied EXP constrains those bits through XOR/permutation. Growth-rate/level relations and legality limits are not silently assumed.

[`src/pokemon.c`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c), `CalculateMonStats` and `ModifyStatByNature`, establish:

```
term = floor((2 * base + IV + floor(EV / 4)) * level / 100)
maximumHP = term + level + 10
otherStat = floor((term + 5) * naturePercent / 100)
```

Nature percent is 90, 100 or 110. Stat order is HP, Attack, Defense, Speed, Special Attack, Special Defense. Shedinja maximum HP is always 1. Inputs are ordinary summary stats, not battle stages or remaining HP.

The species extractor retains original base stats. Ordinary Emerald Deoxys summary stats use `sDeoxysBaseStats` (50/95/90/180/95/90) through `GetDeoxysStat`. [`pokemon_summary_screen.c`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon_summary_screen.c) selects normal getters for player-party and box summaries; other contexts can select alternative getters. This calculator targets ordinary English Emerald, not link-battle/other-ROM forms.

## Inference boundary

`src/core/stats.ts` checks IVs 0–31 independently per stat when prerequisites are known, then intersects that set with `ivPossibilities` from the curtain solver. The latter is a projection: different values can require incompatible cross-field choices. The intersection is an upper bound on joint solutions. It retains every true IV under correct inputs but does not prove every remaining combination is feasible.

Summary inputs are separate from `knownFacts`; PID counts/checks and candidate consistency remain scoped to pixels and stored-data facts. Only explicit promotion of singleton intersections adds IV facts to the exact encryption model. Multi-value ranges are never approximated as independent known nibbles with falsely exact counts. Any conflicting entered summary stat blocks promotion. Applied IVs remain explicit facts if summary inputs later change.

JSON `summaryStats` stores an optional level and six numbers/nulls without candidate bytes. EXP, level and battle stats have no default zeros. Level is supplied separately rather than inferred from EXP.

## Validation

`tests/summary-stats.test.ts` checks unsigned EXP in all 24 permutations, stat/nature/EV rounding against fixed numbers, Shedinja, Deoxys data, real Whismur ranges narrowed by curtain pixels, missing inputs, conflicts, exact-IV promotion, JSON, PID digit order and the 100-value cutoff. Interface tests verify that data precedes PID controls and pixel-count boxes are absent.
