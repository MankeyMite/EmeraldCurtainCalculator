# Joint PID/SID experiment ranking

Implemented 21 October 2026. The original trainer TID enables recommendations;
PID, SID, key and block order can all remain unknown. Encounter RNG is optional.
This extends the existing solver and background deduction worker.

## Previous blockers

- `domainExperiments.ts` returned immediately without a supplied SID.
- `inference.ts` and `shiny.ts` only populated `orderKeyCounts` for fixed TID
  **and** SID. Removing the ranker's SID check alone would have ranked zeros.
- `deduction.ts` selected domain ranking only under `fixedIds` and
  `sidScopeAllowsKnown`; an unknown SID could not match that latter scope check.
- Generic joint enumeration required at most 32 explicit/inferred PIDs.
  Otherwise `sidAnalysis` was null and the enumerated item/action rankers had no
  candidates. Exceeding 200,000 joint hypotheses previously threw instead of
  providing symbolic experiment bounds.
- The enumerated item ranker requires shared Growth position, and the action
  ranker requires shared affected positions. The domain fallback now covers
  those cases, including small validated sets and supported RNG hypotheses.
- Optional new-game SID searches can establish SID existence using witness
  PIDs. Those witnesses are deliberately not an exhaustive PID pool. Previously
  that search supplied neither enumerated ranking candidates nor a usable
  unknown-SID domain path.

## Mathematics and count semantics

For digit i, let p be a PID nibble, q its corresponding OTID nibble, and
k = p XOR q. The known TID fixes q for i < 4; SID supplies q for i >= 4.
For each order, every recorded observation and known plaintext field restricts
the eight repeating key digits. Header pixels constrain p and q separately.
The original residue DP enforces PID modulo 24 and, when supplied, modulo 25
using modulus 600. Disjoint gender rectangles retain the low-byte threshold.
Explicit IVs and all other supported secure facts enter the plaintext domains.
Unpromoted summary-stat ranges retain their existing conservative status.

The unshiny DP weights each p by the number of compatible q choices. Its
prefix/suffix counts now retain these weights when accumulating key marginals:
for each allowed (p,q), add the compatible prefix times suffix count to bucket
(order, i, p XOR q). Each PID/SID pair contributes exactly once per digit.
Distinct-PID counts remain separate. With known TID there are at most 2^48
pairs, so integer marginals fit exactly in JavaScript numbers.

For shiny or non-shiny status, the existing four paired factors couple key
digits i and i+4. Their Boolean violation state enforces
`((KEY & 65535) XOR (KEY >>> 16)) < 8`. Rest-factor counts include the other
three factors' OT choices; each local OT pair contributes once. Unknown shiny
status imposes neither restriction.

For each action, consider the union of affected physical pixels over all
compatible orders. At one **fixed physical pixel**, each order identifies its
own logical field. Transparency is possible iff the key digit belongs to that
field's plaintext domain. Black is possible iff some plaintext digit differs
from the key. Unknown plaintext can support both outcomes for the same pair.
Counts sum joint per-order key marginals; they never multiply marginal digits.
The ranking minimizes the larger survivor bound, then the smaller bound for
ties. Comparable item tests follow catalog order; users choose an available
item. Practical action instructions remain unchanged.

The symbolic model is an outer approximation when unresolved payload,
checksum or cross-snapshot plaintext correlations remain. Thus its **absolute
survivor counts are upper bounds**, not an exact posterior, a guaranteed
percentage reduction, or an entropy claim about the true population. No
probability model is assigned to symbolic unknown fields. Symbolic entropy is
not displayed. The fallback predicts one pixel rather than pretending several
unary counts define a joint distribution. Validated finite candidate sets use
the existing uniform-identity / uniform-supported-outcome scoring model, which
is an explicit estimate, not a gameplay probability claim.

Plaintext changes are evaluated as actual zero/nonzero encrypted nibbles.
Ciphertext 3 and 7 both show black. Unchanged observations are still evidence
when some identities predict a different binary result. Recorded target answers
re-enter shared inference and can remove orders, key digits, PIDs and SIDs.

## Checksums, side effects and computation budgets

Before key recovery, linked checksum headers propagate through connected
components as C(record) = C(root) + offset modulo 65536. Intersect shifted
checksum supports derived from each record's facts and observed checksum
pixels. No root checksum is guessed. Contradictory links reject the model;
unary projections remain conservative about identity/checksum correlations.

The existing finite-set rankers retain their joint checksum support. For
differing positions, the domain fallback also combines its encrypted question
with candidate-specific linked checksum outcomes for up to 256 candidates and
131,072 distinct support values. Unknown encrypted fields and checksums can
produce overlapping outcomes; an identity is counted once per outcome. The
Cartesian nuisance relaxation can retain extra possibilities, so it cannot
falsely exclude a real candidate. Redundant columns are removed by the existing
outcome scorer. Identical checksum supports do not add independent information.
Checksum-only distinctions are retained even if the encrypted pixel is constant.
Above these budgets the encrypted question remains available, with a limitation
message; no candidate subset is scored as exhaustive.

Held-item delta is (new-old) mod 65536. Move PP byte parity and packed PP Ups
retain their existing rules. Rare Candy/vitamins clear resulting friendship;
unknown effects prevent an exact delta and use encrypted pixels only. Vitamins
still require six known EVs and exact cap-limited effects. No unknown EV becomes
zero. Pending questions and predictions never become observations automatically.

Optional SID RNG rows restrict the joint domain, including unresolved rows.
A Cartesian SID scope uses its digit domains exactly. Non-Cartesian scopes of
up to eight SIDs use disjoint fixed-SID DP models and sum their pair counts.
Larger scopes use the Cartesian digit envelope and explicitly report this
relaxation: it may include extra SIDs and extra pairs, but never drops a real
SID/PID/key relationship. The RNG's existence-search `exact` flag is not treated
as an exhaustive PID enumeration flag. No witness or sample replaces the domain.
All expensive work remains in the existing cancellable worker.

Validation: **194/194 tests pass** and `npm run build` completes. Vite retains
its large-client-chunk advisory; production output is generated.

## Uploaded Torchic regression

`fixtures/unknown-sid-user-investigation.json` is the contributed JSON copied
unchanged. It contains internal species 280 (Torchic), TID 11558, unknown PID
and SID, Lonely, male, non-shiny, level 11, EXP 864, four moves/PP, unknown EVs,
manual pixels, and SID RNG advances 1–1800. No hidden record was supplied.

The original deduction selection returns zero item/action recommendations both
with and without that RNG window. Current results:

| Measurement                     | Result                                              |
| ------------------------------- | --------------------------------------------------- |
| Distinct PID bound              | 148,515                                             |
| Joint PID/SID pair bound        | 17,077,510                                          |
| Compatible order                | 20 (already established by this drawing)            |
| Informative held-item choices   | 209                                                 |
| Informative move swaps          | Five; slots 2/4 are indistinguishable in this model |
| Other controlled choices        | Rare Candy; no vitamin with unknown EVs             |
| Surviving optional SID RNG rows | 1,374; witnesses are not exhaustive PIDs            |

Swap move slots **1 and 4**, carrying PP/PP Ups. Inspect observation **104**,
record byte **0x2C, low nibble**:

- Transparent: at most **8,539,084** joint pairs.
- Black: at most **8,538,426** joint pairs.

Hold **Premier Ball (ID 12)** and inspect observation **132**, record byte
**0x3A, low nibble**:

- Transparent: at most **1,552,656** joint pairs.
- Black: at most **15,524,854** joint pairs.

These are encrypted-only stored-data bounds. Linked item delta is +12, but
the broad model does not pretend to know candidate-specific checksum supports.
The selected SID window's digit envelope does not tighten these particular
bounds; the UI reports that limitation. The RNG search provides compatible
witnesses, establishing that the supplied stored-data evidence is nonempty.
This does not certify encounter legality or recover a unique Pokémon.

Reproduce from the repository root:

```sh
node --import tsx scripts/joint-experiment-example.ts
node --import tsx --test tests/joint-experiments.test.ts
npm run check
```

Independent tests exhaust 1,024 PIDs × 32 SIDs and compare every per-order key
bucket for unknown/shiny/non-shiny status, nature and gender. A separate byte
packing oracle verifies item/move/vitamin outcomes across all 24 orders with
overlap. Further regressions cover black-to-black changes, transparent order
elimination, all four PID/SID workflows, linked checksum wraparound/conflicts,
checksum-only improvements, unresolved RNG rows, enumeration fallback, UI
states and unchanged investigation JSON import/export. The existing known-SID
Combusken and pixel-assistance regressions remain separate.

## Recorded Torchic follow-up: unchanged PID counts

`fixtures/torchic-joint-progress-investigation.json` retains the subsequent
uploaded `curtain-investigation (8).json` unchanged, including its revised
baseline pixels and three recorded black answers. PID and SID remain unknown.
After the first move swap there are 6,754 possible PIDs in the symbolic model.
The next two tests narrow combinations without excluding any entire PID:

| Recorded test | Joint PID/SID pair bound before | Bound after | Key evidence |
| --- | ---: | ---: | --- |
| Swap moves 2/3, observation 124 black | 776,506 | 705,877 | Key digit 4 is not 8 |
| Hold Great Ball, observation 132 black | 705,877 | 635,281 | Key digit 4 is not 3 |

These are stored-data upper bounds before optional RNG filtering, not an exact
count of fully validated records. The SID window still retains 1,374 rows; its
digit envelope gives the same ranking bounds. An unchanged distinct PID or SID
count does not mean the relation between them is unchanged.

Completion feedback now recomputes each displayed test's marginal contribution
against the other currently recorded evidence, using the same counting basis
on both sides. It never compares a historical PID count to a current pair count,
and does not infer a historical reduction after facts have been edited.

Recommendations require informative target pixels as well as multiple outcome
patterns. Nuisance patterns supported by every identity are discarded. Great
Ball's answered question disappears in this fixture. Swapping moves 2/3 can
still be offered at observation **108**, testing key digit 4 against **4**;
this is a different question from the answered observation 124. Its predicted
survivor bounds are **70,581** transparent or **564,700** black, both below
635,281. Tests independently re-solve both outcomes of new item and move
questions and verify these counts, with no hidden PID/SID injected.

Run `node --import tsx --test tests/experiment-progress.test.ts` to reproduce.
