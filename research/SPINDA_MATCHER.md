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

## Persistence and transfer

Root state and optional validated investigation JSON store editor PID, filters, advisory shortlist and applied-estimate provenance separately from curtain evidence. Autosave/manual backups include them; old files remain compatible. Spots and filters survive tab changes; search results recompute. UI-only selection, handles, palette, pagination and disclosure state reset on remount.

Plausible PIDs remain advisory: current inference does not accept arbitrary disjunctions of visual PIDs. An estimate requires explicit confirmation before replacing the conditional PID input, with no unfinished experiment/input error. An unspecified species is filled as Spinda; an explicitly different species is protected. No trainer, IV, nature, level or summary fields are required. Snapshots, pixels, IVs and encounter scopes remain intact. Pokémon info/investigation label the estimate unverified, with a removal button. Confirmation does not independently verify it.

## SID pixel guide without Pokémon info

Choose **Use this pattern PID: show SID pixels** immediately after dragging, or **Show SID pixels for this candidate** in a result preview. The guide works without applying the estimate to the solver, without RNG results and without TID. It displays physical block order from the shared `SUBSTRUCT_POSITIONS[PID % 24]`, an 8×20 main-record map, and twelve field-linked pixels for each of S1–S4 (highest SID digit first). Coordinates come from actual school tile placements, including flips, through `hitForNibble`; **Locate selected pixel in main curtain** links the same canonical address to the existing curtain. Main-curtain orange targets follow the selected SID digit while the guide is open.

Printed SID digits S1–S4 use XOR-key nibbles 7, 6, 5, 4 (numbered from the least significant), paired with the upper four printed PID digits. All blocks contain three four-byte key repetitions, so the *set* of twelve physical positions for one SID digit is invariant across block permutations. The named field at each position, and the location of a selected logical field, change with the permutation. High/low means bits 4–7 / 0–3; byte numbering is little endian.

The field pairs match [Emerald's stored structures](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h#L95): held item bytes 2/1, EXP bytes 4/3, Growth padding bytes 2/1, Move 2 ID bytes 2/1, Move 4 ID bytes 2/1, Move 4/3 PP, Speed/Defense EV, Beauty/Cool, Sheen/Tough, Origins bytes 2/1, IV/flags bytes 4/3 and ribbon/flags bytes 4/3. The first member supplies S1(high)/S2(low); the second supplies S3(high)/S4(low).

For plaintext nibble P and corresponding PID digit D:

- Transparent: ciphertext is zero, hence the SID digit is `P XOR D`.
- Black: ciphertext is nonzero, so exclude `P XOR D` and keep every other digit.
- Unobserved, or unknown plaintext: retain all sixteen possibilities.

Intersect these constraints per digit, showing unresolved digits and explicit contradictions. This is a **conditional nibble calculation**, not the full checksum/legality solver or independent proof of the estimated PID. A separate header helper locates all eight unencrypted PID digits: zero must be transparent; nonzero must be black, which cannot distinguish different nonzero digits.

SID Finder's **Manually limit SID digit candidates** controls further intersect
each guide digit with reversible S1 through S4 hexadecimal masks. These limits
also constrain full recovery and experiment rankings. Internal mask order is
little-endian (S4, S3, S2, S1); the UI presents S1 first. An empty digit remains
an explicit contradiction. Limits save in investigation JSON and autosave,
and clear when starting a new Pokemon. Earlier exclusions can be reused only
for the same original trainer.

Known plaintext fills automatically from the active Spinda's Pokémon info using the existing `knownPlaintext` stored-data engine. Every exact logical nibble feeds the dropdown, field table and SID calculation, regardless of the estimated PID's permutation. This includes entered assumptions; changes or cleared info update the guide immediately. Partial packed nibbles remain unknown, and invalid form drafts pause automatic input. A different species or an unidentified blank form cannot supply Spinda plaintext.

Precedence is manual override (including explicit Unknown), exact Pokémon info, then a compatible guide zero preset. **Use automatic value for this field** removes one override; **Use automatic plaintext for all fields** removes all manual overrides. Neither changes recorded pixels or Pokémon info. Two initially disabled presets cover fresh ordinary wild EV/contest/ribbon zeros and, separately, Growth padding zero. A preset cannot contradict partially entered bits. IVs, PP, held item and Origins are never invented by presets. With no Pokémon info or presets the standalone guide still starts unknown. The guide also includes verified level 14–16 Emerald/Poké Ball/OT-gender Origins and move-ID/current-PP examples. Actual battle PP use must be considered.

The optional validated `spindaMatcher.guide` stores selected PID/digit, disclosure state, presets, manual logical plaintext and physical black/transparent answers. It survives tabs, autosave and JSON backups; older files without it remain valid. Automatic plaintext is derived from saved Pokémon info and is never copied into manual overrides. These advisory notes stay separate from `KnownFacts`, snapshot observations and curtain drawing. Trying another PID retains physical answers in place while logical plaintext follows its field. Clear guide answers when changing Pokémon or stored state.

## RNG-derived IVs in the SID guide

The complete current matcher pool supplies encounters for the guide's exact PID,
including when no Pokemon info has been entered. IVs do not come from the
highest visual score or the first matching method. Each distinct generated
packed IV word includes its non-Egg flag and actual ability-slot flag. Entered
IV/flag masks filter whole words; an empty intersection is shown as a conflict.

The guide displays possible IV spreads and automatically fills exact plaintext
nibbles in its field table and dropdown. If several words remain, deduction runs
against each word and unions compatible SID digits. Transparent answers keep
possible plaintext XOR PID values. A black answer requires at least one
nonzero encrypted nibble; it does not exclude every possible plaintext value.
Answers and manual SID limits that invalidate any digit reject that whole IV
word before the union. Final per-digit displays remain conditional projections,
not a claim that all combinations of displayed digits form valid complete SIDs.
Manual plaintext, including explicit Unknown, still overrides an individual field.

These IVs remain conditional on the visually estimated PID, seed, inclusive
advance range, methods and encounter settings. Cancelled, failed, outdated or
incomplete searches supply no IV evidence. A PID absent from the pool keeps the
standalone guide usable with a range-review notice. Changing scope recomputes
IVs; tab changes and JSON reload regenerate from saved settings. No IVs are
silently copied into Pokemon info, manual plaintext or curtain observations.

## Validation and limitations

Tests compare row-major rendering against an independent packed GBA 4bpp oracle with tile addressing and literal mask words. Fixed PIDs include `00000000`, `FFFFFFFF`, `87654321`, `88888888` and `FFD00F00`; all 256 byte values at each spot, clipping, overlaps and wrap are covered. Other tests cover nibble isolation/snapping, inclusive bounds, exact occurrences, pre-catch search, exact/imperfect ranking, identical patterns, JSON/autosave, old files, limits and UI controls.

The oracle decodes the original battle PNG from `research/fixtures/spinda-battle-front.png` independently of the application's atlas. A regression checks all four maximum-Y spot bytes (`FA / F3 / FD / F7`, PID `F7FDF3FA`) against that frame. This prevents the previous shared-template blind spot, where both the renderer and oracle used the same incorrect still image.

SID guide tests cover all 24 source permutations, all four digits and 48 distinct secure targets, actual flipped tile addressing, exhaustive nibble encryption, transparent/black/unobserved answers, contradictions, opt-in zero assumptions/overrides, Origins/moves/PP/packed IV alignment against the existing engine, PID changes, strict persisted-state validation, backup/autosave separation, and empty-info PID transfer that protects an existing different species.

The settled first front frame is shown, not entrance animation/back sprites. Wait for animation to settle and match the pose/orientation. Validation uses source and a packed oracle, without a new emulator capture or calibrated player success rate. The true PID may lie outside the RNG scope. Existing encounter-engine/lead limitations apply; hidden/overlapping spots can make distinct PIDs indistinguishable. See NOTICE.md for asset rights.
