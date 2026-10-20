# Checksum experiments, shininess and automatic pixels

Implemented 2026-10-20 on the existing residue-DP solver, joint PID/SID search,
experiment lifecycle, drawing editor and verified curtain geometry.

## Implementation

`jointInference.ts` intersects shared PID/OT header masks and eight repeating
XOR-key domains across recorded snapshots, separately for all 24 orders.
Mutable ciphertext/checksum fields stay local. `shiny.ts` couples key digits
i and i+4 in four factors, tracks violations with a Boolean state and retains
PID order/nature residues. BigInt counts count each PID/OT pair once.

`KnownFacts.shiny` is optional: absent = Unknown (the new-investigation default),
true = Yes, false = No. It is shared identity and survives drafts, JSON, legacy
migration, autosave and example backups. Old files acquire no assumption.

```text
shiny <=> TID XOR SID XOR PID_low16 XOR PID_high16 < 8
      <=> KEY_low16 XOR KEY_high16 < 8
```

No known PID, SID or TID is required. With all header digits unknown, shiny
retains 2^51 PID/OT pairs, non-shiny 2^64 - 2^51. Both retain every PID.
Joint, dynamic-PID and supported encounter searches apply the same condition.

`checksum.ts` computes sums of 24 little-endian 16-bit words modulo 65536 with
column-sum bitsets/carries. Forward/backward carries project the equation back
into plaintext for exact key/order inference and joint sets up to 32 identities.
`checksumExperiments.ts` recomputes deltas from current facts and saved action
IDs, never imported numeric deltas. Only verified target answers contribute observation evidence; legacy unrecorded drafts add none.

| Change | Checksum contribution |
| --- | --- |
| Held item | new minus old item |
| EXP | low-word difference plus high-word difference |
| Move IDs swapped | zero: whole words |
| PP swapped within equal-parity slots | zero |
| PP swapped across parity | low/high byte-weighted differences |
| PP Up counters | separate packed Growth-byte difference |
| EV byte | difference times 1 or 256 according to byte parity |
| Friendship | difference times 256 |

Item/move protocols keep the Pokemon boxed, using PC item/summary controls
without walking with it in the party. They permit only the indicated changes;
unknown unchanged
fields cancel algebraically without assigning them values. Extra known changes
invalidate the link. Rare Candy/vitamins leave resulting friendship unknown,
so they fall back to encrypted pixels. Independently established before/after
friendship permits exact deltas in saved evidence. Unknown PP/counters can also
prevent exact move deltas; same-parity PP cancels even when unknown.

Connected experiments preserve C(snapshot) = C(root) + offset modulo 65536.
The solver intersects shifted checksum supports along chains/branches even
without an exact checksum fact. Supports never become supplied checksums.
Legacy move files without action IDs retain independent checksum compatibility.

## Ranking and evidence safety

### Broad PID sets with known trainer IDs

`domainExperiments.ts` removes the enumeration prerequisite when both original
trainer IDs are known. Since `PID = KEY XOR ((SID << 16) | TID)`, each PID has
one key. The existing residue DP now also accumulates key-digit counts separately
for each of the 24 orders. Prefix/suffix counts preserve PID modulo 24, nature,
gender and the paired-digit shiny constraint; no PID sampling or RNG window is
introduced. Every PID is counted once, rather than multiplying independent key
digit projections. Counts fit exactly in JavaScript numbers (at most 2^32 PIDs).

The fallback ranks one informative physical pixel per action across all surviving
orders, including different possible Growth/Attack positions. For each order and
key digit, it checks whether the target plaintext permits zero, nonzero or both
ciphertext outcomes. Unknown EVs, IVs, friendship and other plaintext remain
nuisance domains; compatible sets can overlap. It does not assume unseen pixels
match the baseline. Worst-case survivors determine ranking. With overlapping
outcomes the displayed bits are a conservative worst-case lower bound, not
entropy obtained by assigning arbitrary probabilities to unknown plaintext.
Already verified questions for the same experiment/state are not asked again.

The existing enumerated joint/checksum ranking remains preferred whenever it can
score the action. The fallback also handles small enumerated sets whose differing
block positions prevented the older ranking. Both use the existing targeted
experiment lifecycle: only verified answers enter evidence, then all snapshots
are analyzed and recommendations are updated in the background worker. The
original drawing and automatic assistance are retained independently.

Reproduce the contributed trained Combusken without an RNG scope:

```sh
npx tsx scripts/domain-experiments-example.ts
```

The minimized `fixtures/combusken-experiments.json` keeps its actual entered facts
and 124 black observations, with no PID, IVs, EVs or fresh-catch EV assumptions.
Nickname/OT text and encounter/SID RNG settings are omitted from the reproduction.
The original 10,984,833 stored-data PID bound now yields item, six move-swap and
level-23 Candy questions. One Smoke Ball question is pixel 109 (record byte 0x2E,
high nibble). Transparent retains 2,762,220 possible PIDs; black retains
10,675,313. The sets overlap because other orders can put unknown plaintext there.
The independently confirmed reference predicts black for this illustrative test;
that answer reduces the bound by 309,520 and keeps the reference PID. It is a
simulated outcome, not a new emulator observation or an answer to auto-save.

Limits: this fallback requires both IDs and uses a single-pixel greedy question,
so it does not discover every joint-only distinction. Broad counts remain
stored-data bounds: general checksum compatibility, unknown IV/stat correlations
and shared unknown plaintext can eliminate further combinations when joint
validation becomes tractable. It deliberately adds no broad checksum credit
without proven identity-specific supports. Unknown EVs still prevent exact
vitamin predictions; Rare Candy friendship remains unknown. Available actions
are not guaranteed to determine every PID or IV. No new game mechanics are added.

`tests/domain-experiments.test.ts` checks independent exhaustive 4,096-PID cases
over all orders and shiny states, exact binary-question counts against full
multi-observation inference for each supported Combusken action, genuine-candidate
preservation, reranking, no inferred evidence, and JSON round trips.

Score complete encrypted/checksum visible outcomes per remaining identity/IV
hypothesis. Unknown checksum values are nuisance variables, not extra identities.
Each identity counts once per supported outcome, including overlapping supports.
Worst-case survivors are prior-independent. Expected survivors/information use
a uniform prior on hypotheses, then uniform supported visible outcomes for
each hypothesis. This is a planning convention, not a gameplay probability.
Information is H(outcome) - H(outcome | hypothesis), preventing nuisance or
redundant checksum bits from earning extra credit. Rank by worst case, then
gain. Without added identity discrimination, retain encrypted-only scores and
targets. The UI explains when combined pixels help.

`pixelAssistance.ts` displays transparent only for domain {0}, black for any
nonempty domain excluding zero, otherwise unknown. Unions cover every compatible
key/PID/order. Predictions have dashed borders; painting can confirm or contradict
them. They never enter observations, JSON or candidate weights. Finish drawing submits only explicit observations;
unexamined cells stay unknown. Removing facts retracts
unsupported predictions. Direct independent-fact conflicts get red pixel marks;
general inconsistency gets a message without blaming one pixel. Inspector text
explains the field/key/checksum and labels conditional assumptions. Inspect mode
keeps the drawing visible while disabling painting.

## Responsive entry and targeted experiments

`core/deduction.ts` composes the existing inference, SID/RNG, projection, IV
intersection and ranking stages. `deduction.worker.ts` runs this pipeline off
the main thread; `deductionScheduler.ts` debounces entry for 450 ms and cancels
obsolete jobs. Starting a stroke freezes displayed predictions and cancels
work. Finish drawing submits explicit observations immediately, without
filling unexamined cells. No late worker result can interrupt a newer drawing.

New experiments use `itemTest.mode = "pixels"`. Their observation arrays start
unknown, with only explicit Black/Transparent answers added. Partial answers
are immediate evidence (`isEvidence`); unanswered target pixels that become
non-discriminating are removed from the questions. Recording restores the
original selection and reranks from all verified evidence. Original manual
pixels can appear as a grey dashed, unverified reference; predictions remain
a separate layer and are recalculated for the changed record. Neither layer
is copied into new evidence. Legacy Yes/No files retain their old semantics.

Target selection removes redundant or nuisance columns only when projecting them
away preserves every possible surviving identity set; joint-only distinctions
remain intact. Exhaustive small support sets validate this property.

Item explanations identify the tested XOR-key digit (0 is rightmost), its
value and confirmation/exclusion counts. Checksum questions show the compatible
identity counts for each visible answer, explicitly allowing overlap when
checksum values remain unknown. The 15-SID regression chooses Master
Ball, answers its useful pixel black, retains 14 SIDs and removes that item
from useful recommendations. Unexamined checksum pixels remain unknown.

Move ID 0 uses hint text. PP maxima always display three PP Ups. At curtain
checkpoints PC storage restores PP: a known move/PP pair constrains the
packed two-bit PP Up stage by exact equality to one of four maxima. Entering
boosted PP removes the conflicting assumed zero counter; deductions preserve
unknown counters in other slots. Invalid PP is highlighted on blur. Explicit
raw counters remain supplied facts; arbitrary imported byte values are not
rewritten. This retains existing raw/illegal reference fixtures.

Summary stats now produce conservative IV bounds over unknown EV quarters
and/or natures, and the overview intersects these with joint recovery even
when a key/PID/SID projection exists. Unknown EVs never become zero by default.
Electrike ability constrains the stored bit; generic stored-data inference
does not impose PID parity. Supported encounter generation uses its existing
ability-slot relationship and filters generated candidates accordingly.

## Reproduction

From the repository root (use `npx.cmd` on PowerShell if needed):

```sh
npx tsx scripts/deduction-examples.ts
```

The synthetic ranking example retains four PID/SID/IV tuples. Baseline checksum
0x764C (30284) or the alternative HP-IV checksum 0x764B both show four black
digits; no exact checksum fact is supplied. Poké Ball (ID 4) produces 0x7650
or 0x764F. Encrypted pixels alone leave four identities; the combined observation
leaves at most two. The previous top item is Repeat Ball; the new top is Poké
Ball. The original tuple survives. Alternative IV tuples demonstrate stored-data
candidate scoring, without a claim of encounter RNG reachability.

The same script reads real `skarmory-test.ek3`, supplies species, exact EXP,
moves, PP, IVs, EVs, PID, TID and SID, and starts with empty observations.
It predicts **74/160 pixels: 59 black, 15 transparent, zero mismatches, zero
observations**. This demonstrates assistance given facts, not blind recovery.
Tests also verify repeated/mirrored screen appearances.

## Limits

Broad projections are conservative, not full legality enumeration or every
cross-snapshot plaintext equality. Some provable pixels can remain unknown.
Broad generic PID counts precede per-identity checksum validation and remain
stored-data bounds; separately reported joint candidates include checksums and
relations. Checksum-to-payload joint refinement is limited to 32 identities;
larger projections safely keep wider domains. Recommendations still need shared
affected positions. Unknown side effects use the existing encrypted fallback.
Unbounded generic joint searches are not enumerated: at most 32 PIDs and
200,000 identity/IV hypotheses are accepted before asking for narrower facts.
A worker failure leaves prior results visible with an error and disables new
experiment selection. Subsequent [Static Method 1/4 support](STATIC_RNG.md) uses the same recovery pipeline. No additional Pokéblocks, NPC interactions or other glitches were added.

Tests include exhaustive small checksum/carry and shiny-factor oracles, all
24 permutations, overflow, PP parity, unknown side effects, linked snapshots,
nuisance/redundant information, persistence, genuine reference retention,
pixel retraction/conflicts and the original emulator-mapping regressions.
No new emulator capture was produced.
