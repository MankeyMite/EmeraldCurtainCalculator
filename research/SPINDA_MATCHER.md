# Spinda pattern matcher

Open **Investigate → SID Finder → Find Spinda PID from its spot pattern**. Four spots snap to original sprite pixels. Mouse/touch dragging, selection and arrow controls call the same bounded coordinate update. The eight-digit PID field accepts direct patterns.

Choose **Observed Spinda gender** above the editor before dragging to filter the wild PID pool. Unknown/either stays available. This is separate from a Cute Charm lead setting. If the editor's exact PID disagrees with the observed gender, a notice explains the mismatch; the pattern stays where you placed it. The filter persists with the other matcher settings.

## Emerald rendering

The original 64×64 settled front frame, normal/shiny palettes and four 16×16 masks come from [pret/pokeemerald revision 731ad5bf](https://github.com/pret/pokeemerald/tree/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/graphics/pokemon/spinda). `src/data/spinda.json` records input SHA-256 hashes. Regenerate with `node scripts/extract-spinda.mjs [pret-checkout]`; the checkout is unnecessary at runtime or for tests.

The battle template is specifically **frame 0 of `anim_front.png`**, selected by [gMonFrontPic_Spinda](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/anim_mon_front_pics.c#L291) and `sAnims_Spinda`. The separate `front.png` belongs to `gMonStillFrontPic_Spinda` and places the body differently relative to the spot origins. The initial matcher used that still image, causing every spot to appear too high and preventing matching lower battle spots. This is corrected by using the actual battle frame, without extending the legal nibble range or offsetting the PID coordinates.

The [Spinda rendering implementation](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c#L5712) establishes these origins in on-screen coordinates:

| Spot | PID byte | Base X | Base Y |
| --- | --- | --- | --- |
| Left ear | least significant | 16 | 7 |
| Right ear | second | 40 | 8 |
| Left face | third | 22 | 25 |
| Right face | most significant | 34 | 26 |

Origins are displaced by `(lowNibble − 8, highNibble − 8)`, giving 16 positions per axis. Dragging changes only that spot's byte. This is the opposing wild Pokémon's front sprite without mirroring. Emerald's internal Spinda species ID is 308, national dex 327.

`gbagfx -plain -data_width 2` converts PNG mask scanlines to little-endian u16; the game consumes the low bit first. Treating PNG X coordinates as mask bit order incorrectly mirrors the masks. Extraction follows the actual converter. Only sprite palette indices 1–3 gain 4, becoming 5–7. Eyes, outlines, transparency and fixed orange markings never receive PID spots. Overlaps form a union without adding 4 twice. Unsigned-byte Y wrap at the first spot's −1 boundary is preserved; off-frame writes are omitted.

Handles outline full masks so hidden parts remain draggable. They never enter scoring. Turn them off to compare the clipped pattern. The shiny palette changes colors only and requires no SID.

## Search and matching

`generateSpindaCandidates` calls existing `scanWildSpreads` with species 308, optional level/nature/gender and no caught-data inputs. Shared generation handles encounter slots/levels, lead calls, nature/gender rejection and H1/H2/H4 IV calls. Bounds are inclusive. Advance 0 is the seed before the encounter-slot call. Defaults: seed 0, advances 0–3000, Route 113 grass, all methods, ordinary lead. Advances are calls, not seconds or necessarily frames.

An optional occurrence callback records exact advance/method/slot/level/IV links before spread deduplication. Grouping by PID retains every occurrence, without inventing advances from first/last intervals. IV tuples remain correlated with methods and encounters.

Search/ranking run in a worker. Settings changes terminate obsolete workers; dragging debounces ranking of the prepared pool. Obsolete PID responses are ignored. Cancellation/errors hide the pool. Shared limits remain 1,000,000 inclusive advances and 5,000 distinct PID/IV spreads. Exceeding either fails explicitly. Pagination limits only rendered cards, starting with ten; all candidates remain available.

Only the union of pixels that can carry legal PID spots is compared. Similarity is `100 × [0.65 × 2×exactOverlap + 0.35 × (nearTarget + nearCandidate)] / (targetSpotPixels + candidateSpotPixels)`. Near overlap uses Euclidean distance ≤2 sprite pixels. This symmetric soft Dice measure penalizes extra/missing spot pixels without rewarding blank background. Exact patterns score 100. Identical visible patterns retain every PID and tied score. A three-point band flags close alternatives; best score below 65 prompts review. Scores/thresholds are visual guidance, not calibrated probabilities.

## Persistence and confirmation

Choose **Use this PID** on a match to confirm it. The Painter and suggestions fold away, and the existing SID Pixel Guide opens. The confirmed PID is applied to Pokemon info. Fresh wild-catch defaults supply EV/contest/ribbon zeros and Growth padding; entered facts for the same Spinda are preserved. A different catch starts a separate record, carrying only supplied original-trainer facts. Pending experiments and invalid inputs must be resolved first.

Matcher settings, the active guide and completed SID progress persist in investigation JSON and autosave. Old backups remain compatible. Search results regenerate from the saved RNG settings. The legacy shortlist remains readable in older backups but is no longer part of the confirmation flow.

## Useful SID digits and catch ball

Each match displays small H1, H2 and H4 counts. For each method, each exact known plaintext nibble P and corresponding upper PID digit D tests candidate P XOR D at a specific SID position. Counts include only remaining, untested candidates, with one count per position/candidate across duplicate fields, pixels and encounter combinations. Solved SID positions contribute no further questions. Multiple spreads within a method contribute the union of their distinct tests; the actual spread is narrowed after capture.

Counts use carried SID candidates, current completed main-investigation inference and SID RNG results, manual SID limits, and current guide answers. Masks use little-endian order internally (S4, S3, S2, S1); printed digits run S1 through S4. Catch-ball evaluation uses the existing Origins encoding and actual encounter levels. An ordinary ball is suggested only when it adds an untested candidate over a regular Poke Ball without reducing total method usefulness. Safari and Master Balls are excluded from recommendations. Confirm the actual ball in the guide's existing data flow.

## SID Pixel Guide

The guide reuses the shared SUBSTRUCT_POSITIONS[PID % 24] permutation and actual flipped school tile coordinates from hitForNibble. Each digit has twelve possible field locations, but the map and field table show only distinct useful, unobserved tests whose plaintext is exact. Known plaintext and its XOR with the PID digit appear beside the selected pixel. The main curtain highlights the same useful coordinates.

For plaintext P and PID digit D, a transparent pixel confirms SID digit P XOR D; a black pixel excludes it. Unknown plaintext adds no evidence. Duplicate tests disappear after an answer. Selection advances through useful pixels and SID positions. Manual SID digit limits immediately affect both the guide and match counts.

The existing stored-data engine supplies known Pokemon-info plaintext. Existing saved logical overrides remain supported by the core and take precedence over automatic values. Guide physical observations remain separate from the main curtain drawing. A newly confirmed catch receives its own guide, so physical pixels from another catch are not reused.

## RNG-derived IVs and summary stats

The complete current search supplies all encounters for the exact confirmed PID. The guide shows methods, possible IV spreads and packed IV bytes 3 and 4 in hex, including the non-Egg and generated ability-slot flags. It reuses the summary-stat inputs and existing stat calculation to filter complete spreads. No method is selected arbitrarily when stats leave alternatives. Only exact common plaintext nibbles are highlighted; ambiguous IV nibbles wait for more information.

SID calculation evaluates whole IV words and preserves their cross-digit correlations. It never treats a black answer with ambiguous plaintext as an exclusion of every alternative. Invalid form drafts pause interpretation. Cancelled, failed or incomplete searches supply no IV evidence. Observed IV pixels cannot be saved to the next round until the supporting plaintext is available again.

## Catch next Spinda

**Catch next Spinda** saves the exact surviving SID set and tested candidate masks, clears the current catch's drawing, facts and stats, then returns to the Painter. Original-trainer facts, manual SID limits and matcher settings are retained. The main deduction engine intersects subsequent results with the carried exact SID set, preserving correlated candidates rather than only their per-digit envelope. Catches must share the same original trainer.

## Current guide evidence and next-step planning

The worker applies current guide answers to the main SID hypotheses before recovery and experiment ranking. It retains a separate pre-guide SID set so editing or clearing an answer can restore candidates. Baseline guide answers always use baseline Pokémon facts and stats, including while another item/training snapshot is active. Generated hypotheses keep their own complete IV words when checking IV pixels. The guide's existing table keeps answered rows editable.

The existing next-experiment list compares information per minute for supported tests and another catch. A deterministic, bounded sample of up to 64 PID/IV encounters estimates catch information using fresh capture plaintext, the suggested ball, remaining SID candidates and tested digits. Large SID sets use a stratified sample of 256 candidates for this estimate only. Stats are assumed to identify the future spread; sampling is a planning model and never changes solver evidence. Timing is 240 seconds per catch/check, 30 seconds per item swap, 10 seconds per vitamin and 60 seconds per training battle including returning to inspect the curtain (30 seconds for the battle alone).

Defense/Speed training enumerates exact reachable EV targets, chooses vitamin checkpoints followed by 1/2/4-EV battles using the recorded Pokérus/item, and respects the 255-per-stat/510-total limits. Targets above 110 EVs rank after useful ordinary tests and catches. A compact selection retains cheap tests covering reachable unresolved key digits, without repeating an existing one-vitamin checkpoint. Training instructions start from a save and restore the held item before inspection, then reload that save. Unknown battle EXP, moves, PP, friendship and Pokérus are removed from the training snapshot; no linked training checksum is asserted. Training and catch simulations never fill observations.

## Validation and limitations

Tests compare row-major rendering against an independent packed GBA 4bpp oracle with tile addressing and literal mask words. Fixed PIDs include `00000000`, `FFFFFFFF`, `87654321`, `88888888` and `FFD00F00`; all 256 byte values at each spot, clipping, overlaps and wrap are covered. Other tests cover nibble isolation/snapping, inclusive bounds, exact occurrences, pre-catch search, exact/imperfect ranking, identical patterns, JSON/autosave, old files, limits and UI controls.

The oracle decodes the original battle PNG from `research/fixtures/spinda-battle-front.png` independently of the application's atlas. A regression checks all four maximum-Y spot bytes (`FA / F3 / FD / F7`, PID `F7FDF3FA`) against that frame. This prevents the previous shared-template blind spot, where both the renderer and oracle used the same incorrect still image.

SID guide tests cover all 24 source permutations, all four digits and 48 distinct secure targets, actual flipped tile addressing, exhaustive nibble encryption, transparent/black/unobserved answers, contradictions, opt-in zero assumptions/overrides, Origins/moves/PP/packed IV alignment against the existing engine, PID changes, strict persisted-state validation, backup/autosave separation, and empty-info PID transfer that protects an existing different species.

The settled first front frame is shown, not entrance animation/back sprites. Wait for animation to settle and match the pose/orientation. Validation uses source and a packed oracle, without a new emulator capture or calibrated player success rate. The true PID may lie outside the RNG scope. Existing encounter-engine/lead limitations apply; hidden/overlapping spots can make distinct PIDs indistinguishable. See NOTICE.md for asset rights.
