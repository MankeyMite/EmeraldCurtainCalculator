# Emerald Battle Frontier IV judge

The **Investigate IVs** recovery button opens the IVs investigation view,
including judge guidance, recorded answers and the existing IV calculator.
The judge is the Pokémon Breeder in the Battle Frontier house represented by
`BattleFrontier_Lounge1`. This is an optional postgame source of information;
no PID, SID, EV or encounter RNG search is required to record his answers.

Source references:

- [Dialogue and inclusive thresholds](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/maps/BattleFrontier_Lounge1/scripts.inc)
- [BufferVarsForIVRater](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/field_specials.c#L1865)
- The same functions/scripts are retained locally under `research/pret`.

| Highest-stat rating | IV of every named maximum |
| --- | --- |
| Relatively good | 0–15 |
| Quite impressive | 16–25 |
| Outstanding | 26–30 |
| Flawless / perfection | 31 |

| Overall assessment | Sum of all six IVs |
| --- | --- |
| Average | 0–90 |
| Better than average | 91–120 |
| Quite impressive | 121–150 |
| Wonderfully outstanding | 151–186 |

## Ties are positive evidence, never negative evidence

The game begins with HP and scans Attack, Defense, Speed, Special Attack and
Special Defense. A larger IV replaces the selected stat. An equal IV triggers
`Random()`, whose low bit decides whether that stat replaces the selection.
This is not a uniform draw over tied stats, and the tool assumes neither a
uniform distribution nor independent repeated conversations.

Every named stat has the common maximum IV. A flawless answer therefore fixes
that stat to 31; another named stat confirms another 31. Ten mentions of HP
still do not prove that Attack is below 31. The UI prompts further checks after
a flawless answer, while retaining unseen ties. A highest-stat rating below 31
does exclude 31 from every stat. Total-IV evidence can also exclude further
ties: if two stats are confirmed 31 and the total is at most 90, none of the
other four can exceed 28.

## Integration and mathematical limits

`ivJudge` is optional shared identity evidence, preserved across all snapshots,
JSON backups, autosave and edits to other facts. Overall assessment may be
omitted. Every recorded highest-stat answer can be removed independently.
Conflicting answers remain visible and produce inconsistent domains rather
than overwriting known IVs or selecting a convenient spread.

The existing solver receives judge constraints through the packed IV fields.
For each supported maximum, named stats must equal that maximum and all other
stats must be at most it. Prefix/suffix dynamic programming enforces the total
range and computes exact marginal supports over the supplied independent IV
domains. The largest sum is 186, so this does not enumerate 32^6 spreads.
Results are cached with bounded memory; sums that cannot constrain a domain
product bypass the DP.

Marginals are projected onto existing nibble domains and iterated to stability.
Recorded pixels and known IVs can narrow those domains further. The displayed
IV ranges also intersect summary-stat results. Known-key and per-hypothesis
payload checks apply judge refinement before checksum compatibility; generated
wild/static IV tuples are checked against all judge answers exactly.

Packed nibble and checksum correlations may remain unresolved for broad
stored-data sets. Those results and identity counts are conservative bounds;
the solver does not claim full joint-IV/checksum enumeration. This relaxation
can retain extra possibilities but cannot discard a genuine compatible IV
tuple. Summary-derived ranges still require exact-value promotion for generic
PID reconstruction; judge evidence is applied automatically.

## Validation

`tests/iv-judge.test.ts` independently checks every highest-IV and total-IV
boundary; compares DP marginals with exhaustive small reference tuples;
preserves unseen and repeated ties; verifies logical exclusions from overall
totals; exercises all 24 packed-IV permutations and several SIDs; verifies
generated-spread filtering, contradictions, UI guidance, fact editing and JSON
round trips. Run `npm run check` for the complete suite and production build.
