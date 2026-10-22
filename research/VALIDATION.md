# Validation results

## RNG encounter IVs in the Spinda SID guide - 2026-10-22

- **267 tests** and the TypeScript/Vite production build pass.
- Complete matcher results now supply IV/flag words for the exact guide PID,
  without requiring caught data or transferring a PID into Pokemon info.
- All compatible words contribute to SID deduction; no first-spread assumption.
  Black answers preserve existential alternatives. Cross-digit contradictions
  and manual SID limits reject an entire word before projecting the union.
- Six new regressions cover actual inclusive advance-zero generation, packed
  nibbles across all 24 permutations, exact/ambiguous IVs, black/transparent
  evidence, word correlations, manual overrides, entered-IV contradictions,
  missing/mismatched results, invalid drafts, UI and JSON recomputation.
- IVs remain conditional on the visual PID and complete current RNG scope.
  They are derived without overwriting Pokemon info or saved pixel evidence.

## Confirmed baselines, linked projection and SID digit limits - 2026-10-22

- **261 tests** and the TypeScript/Vite production build pass.
- At the user's request, Finish drawing now confirms the complete visible
  main-record pattern: unchanged automatic pixels become saved observations,
  explicit paint/eraser overrides survive, and remaining blanks become
  transparent. Hidden predictions are excluded when assistance is off. Undo
  restores the preceding state. Targeted experiments still record only their
  answered pixels. This supersedes earlier completion semantics below.
- Reproduced common black answers in a move-swap experiment from the supplied
  Spinda investigation. These retained over 1,000 SIDs and previously spent
  roughly 27 to 29 seconds in linked checksum work. Lazy exact checksum witnesses,
  shared support membership and conservative projection-domain coverage reduce
  those answers to a few seconds locally. Timings vary by machine.
- Regression tests compare retained SIDs against independent encrypted-pixel
  filtering, verify linked checksum supports and carry/wrap behavior, and check
  that baseline observations remain intact. No SID pool is truncated.
- Reversible S1 through S4 hexadecimal toggles constrain inference, wild RNG
  recovery, new-game SID intersections, experiment rankings and the Spinda
  guide. Tests cover nibble ordering, empty contradictions, restoration, unknown
  PID/TID inference, UI controls, autosave/JSON and legacy compatibility.
  Limits save with the investigation and clear for a new Pokemon or example;
  exclusions from earlier Pokemon apply only to the same original trainer.

## Automatic Spinda guide plaintext - 2026-10-22

- **254 tests** and the TypeScript/Vite production build pass.
- The SID guide reads exact logical nibbles directly from the existing Pokémon
  info plaintext engine. The selected dropdown, twelve-field table and all
  four SID digit calculations use the same resolved values.
- Regression tests verify all 48 relevant nibbles across all 24 permutations,
  including items, EXP, padding, moves/PP, EVs, contest values, Origins, IVs and
  ribbon flags. Unknown bits in partial packed values are not guessed.
- Entered values update automatically; assumptions remain labeled. Manual
  overrides (including Unknown) persist until reset. Clearing Pokémon info
  clears its derived values without changing guide observations. Different
  species, blank-form defaults and invalid drafts cannot silently supply it.
- Parent/guide integration tests verify the selected hex option, live info
  changes, manual-reset controls and invalid-input feedback. Automatic values
  remain derived rather than being saved as stale manual overrides.

## Spinda finish-drawing performance and observed gender - 2026-10-22

- **250 tests** and the TypeScript/Vite production build pass.
- Reproduced the supplied level-16 Route 113 Spinda investigation with its
  estimated PID applied. Generation finds one spread at advance 636 in about
  3 ms; SID filtering retains 1,716 candidates in about 13 ms. The expensive
  step was subsequent experiment ranking, while the UI mislabeled the entire
  deduction job as an RNG search.
- Item and controlled-action rankers now share the existing domain ranker's
  optional checksum budget: at most 256 identities and 131,072 distinct
  checksum support entries. Above that budget, encrypted-pixel rankings use
  every identity and display the limitation; no candidate pool is truncated.
- Large-set recovery skips repeated checksum support enumeration only when
  the accumulated checksum nibble union already covers that candidate's full
  header domain. Small-set payload refinement and linked-checksum processing
  retain their existing behavior. Tests compare the result to an exact union.
- A fresh process completes the original supplied JSON in **947 ms** locally;
  simulating Finish drawing completes in **854 ms**, still with all 1,716 SID
  candidates. Timings vary by machine. The original download is unchanged.
- Deduction reports constraints, encounter/SID search, recovery and experiment
  ranking stages. A 60-second worker deadline stops a stalled calculation with
  a visible error and preserved drawing, and discards late responses.
- Observed Spinda gender is visible above the spot editor. Its existing wild
  filter partitions the complete PID pool by the Emerald gender threshold;
  a mismatching dragged PID gets a notice without moving spots automatically.
  Regression tests cover both genders, all candidates, Finish drawing,
  checksum projections, deadline completion/cancellation and late events.

## Battle Frontier IV judge - 2026-10-21

- **214 tests** and the TypeScript/Vite production build pass.
- Investigate IVs now opens judge guidance, selections for the named highest
  stat and its exact English rating, optional total assessment, recorded
  answers and IV ranges. Judge answers persist as shared identity evidence.
- Independent small exhaustive models verify every range boundary, common
  maximum and total constraints. All 24 packed-IV orders and multiple SIDs
  retain compatible tuples. Generated spreads receive exact judge filtering.
- Repeated flawless checks can confirm additional 31s, but never exclude
  unmentioned ties. Conflicting judge, IV or curtain facts remain visible.
- Broad packed-IV/checksum correlations remain conservative and are labeled
  accordingly. See [judge mathematics and sources](IV_JUDGE.md).
- Isolated browser checks follow Investigate IVs, record flawless Special
  Attack and Speed answers, confirm both IVs become 31, and remove an answer.
  Phone controls fit the viewport without horizontal overflow. The user's
  live investigation is untouched.

## Stable pixel inspection - 2026-10-21

- Removed the per-pixel original-reference and automatic-prediction paragraphs
  from the inspector. Prediction overlays, candidate digits and deductions
  still operate; investigation-wide conflict messages remain available.
- Reserved space for wrapped field names and the full candidate-digit list.
  Inspecting known header, unknown header, EV, move and IV fields keeps the
  curtain size, inspector height and hex position constant in desktop checks.
  Phone checks likewise retain a constant layout, with no field overflow.
- All 11 workbench/pixel-assistance tests and the production build pass.

## Inspector clipping - 2026-10-21

- Reproduced the reported clipping with an active experiment: the original
  drawing reference and automatic prediction needed 131 px inside a 103 px
  inspector, cutting off the second message above the hex display.
- Inspector rows now fit their content at every desktop breakpoint. Recovery
  values also establish their row's minimum height; the curtain canvas fits
  that row rather than dictating it through its intrinsic bitmap height.
  The right panel scrolls when the viewport cannot fit all sections.
- Chrome checks at 1800 × 1000 and 1440 × 740 show both messages fully inside
  the inspector, with the hex display following it and recovered values above
  it. The 390 × 844 phone view retains complete wrapped messages and no
  horizontal overflow. All **206 tests** and the production build pass.

## Joint experiment feedback and navigation - 2026-10-21

- All **206 automated tests** and the TypeScript/Vite production build pass.
- The unmodified follow-up Torchic upload reproduces pair bounds
  776,506 → 705,877 → 635,281 while the distinct PID bound stays 6,754.
  Move slots 2/3 and Great Ball exclude upper-key digits 8 and 3 respectively.
- Saved-test feedback now reports comparable joint bounds, distinct PID bounds
  and excluded key digits. Comparisons use current stored-data facts before
  optional RNG filtering; historical mixed-basis counts are not reused.
- Both SID RNG modes retain useful recommendations. Answered questions are
  omitted; a repeated move action may test a different, informative pixel.
  Multiple nuisance outcomes shared by all identities cannot create a test.
- Desktop and 390 × 844 phone checks start a test from a lower item card while
  already on Experiments. Instructions and Black/Transparent controls scroll
  into view; phone placement accounts for the sticky navigation tabs.

## Compact EV bounds and transient inspection highlights - 2026-10-21

- All **202 automated tests** and the TypeScript/Vite production build pass.
- EV recovery values show minimum and maximum only; excluded intermediate
  values remain excluded in the solver. Tests verify sparse sets are preserved.
- Experiment wording refers to highlighted pixels without a screen-relative
  position. Boxed move swaps omit the PP-use warning, including display of
  saved legacy actions; stored observations and action metadata are preserved.
- Canvas and hex highlights follow hover or keyboard inspection rather than
  the last clicked pixel. The inspector can retain that pixel's details while
  the highlight clears. Experiment target borders remain independent.
- Isolated Chrome checks confirm one linked hex highlight during curtain/hex
  inspection, zero after leaving either, retained inspector details and working
  arrow-key inspection. The user's live investigation was untouched.

## Permutation labels and EV recovery overview - 2026-10-21

- All **199 automated tests** and the TypeScript/Vite production build pass.
- The grouped encrypted record and pixel inspector now identify any physical
  block shared by all compatible PID orders, without requiring an exact PID.
  Partially solved orders show known positions and `?` elsewhere; widening
  constraints retracts unsupported names. Empty/inconsistent models establish no
  block labels, and SID RNG witness PIDs never establish an order.
- Recovery values appear as PID, SID, IVs, EVs, XOR key and permutation. EV
  displays use conservative logical-byte projections and explicit supplied EVs;
  unknown values remain ranges, and imported records remain separate previews.
- The contributed Torchic retains its existing 148,515 PID bound and displays
  `M - A - G - E`. Its byte 0x21 inspector identifies Met location. Tests cover
  all 24 permutations, partial consensus, EV projections and the summary order.

## Joint unknown PID/SID experiments - 2026-10-21

- All **194 automated tests** and the TypeScript/Vite production build pass.
- The contributed Torchic JSON is retained byte-for-byte with unknown PID,
  SID, EVs and IVs unchanged. The original selection path offers zero experiments
  in both SID RNG modes. Weighted joint residue-DP ranking now offers 209 held
  items, five move swaps and Rare Candy. Order 20 was already established by
  these observations; separate all-order tests validate discovering positions.
- Swapping moves 1/4 at byte 0x2C low nibble bounds survivors by 8,539,084
  (transparent) or 8,538,426 (black), from a 17,077,510 pair bound. Both outcomes
  match fresh multi-observation inference. Optional SID RNG advances 1–1800
  retain 1,374 SID rows; their large-scope ranking envelope is explicitly
  conservative, and no witness PID becomes an exhaustive candidate list.
- Independent exhaustive PID/SID and byte-packing oracles cover weighted
  key marginals, all 24 orders, shiny states, gender/nature, overlapping binary
  outcomes, black-to-black ciphertext changes and transparent order elimination.
  Linked checksum wraparound/conflicts, checksum-only improvements, unresolved
  SID rows, enumeration fallback, JSON and UI statuses are also tested.
- Existing known-SID broad-PID Combusken, known-PID recovery, automatic pixel
  assistance and emulator mapping regressions pass. No new emulator capture or
  encounter legality validation is claimed. See [mathematics and reproduction](JOINT_EXPERIMENTS.md).

## Navigation, PP Ups controls and dual SID display - 2026-10-20

- All 183 automated tests and the TypeScript/Vite production build pass with `npm run check`.
- Reordered tabs and keyboard traversal to About → Pokémon info → Investigate, with Curtain between entry and investigation on mobile. Advanced snapshot management is collapsed; its explanation distinguishes optional manual snapshots from automatically saved experiments.
- Move names share rows with independent PP and PP Ups fields; maximum PP is in normal flow beneath the input. Selecting a stage fills full restored PP, and valid typed PP infers its stage. Slot edits preserve other explicit packed counters. Editing the default assumed packed byte clears that shared assumption instead of promoting other default counters to verified facts.
- SID headings show decimal and hexadecimal in both solved and partial states. Independent exhaustive comparisons validate decimal carries and common digit support across nibble domains; candidate subsets can establish additional decimal digits. Candidate table rows also show hexadecimal. These displays add no solver evidence.
- Chrome production-preview checks at 1440×900, 390×844 and 320×740 verify tab order, collapsed observation controls, Ember PP Ups 3 → PP 40, typed PP 35 → stage 2, and SID 33789 → 0x83FD. All four maximum labels remain below their inputs and rows have no horizontal overflow. The isolated preview and public fixtures leave the user's live investigation untouched.

## Opening guide and simpler drawing - 2026-10-20

- About now opens first, including with a restored pending experiment. A short pitch and four setup steps precede the research article; Start with Pokémon info preserves the investigation.
- Removed pencil selectors in both workspaces. Click toggles the visible black/transparent state; a drag paints the starting color. Manual paint takes precedence over predictions and experiment references. Blank drawing cells look transparent without silently becoming evidence.
- Finish drawing confirms unpredicted blank main-record cells as transparent, preserves derived pixels and hidden neighbors, and adds an undo step. Experiment snapshots bypass blank completion and retain only verified observations. Old JSON keeps its original -1/0/1 semantics.
- Automated checks cover every observed/predicted/reference combination, completion without prediction promotion, save/load compatibility, genuine Skarmory preservation and opening-guide/control placement. Chrome production-preview checks at desktop and 390×844 verify About/entry navigation, adjacent controls, black/transparent clicks, drawing pause and completion Undo/Redo. Phone emulation shows no horizontal overflow; it is not a physical touch-device test.

## Compact mobile Curtain follow-up - 2026-10-20

- All 175 automated tests pass, including a new exhaustive mapping check that the compact 8x20 crop retains all 160 main-record nibbles at their original screen addresses. The production TypeScript/Vite build succeeds.
- At 390x844, connected Chrome shows the whole curtain, all 80 bytes (160 selectable digits), selected-byte inspector and collapsed extras within one viewport. A 390x700 check also retains all digits and inspector text on screen. A 320x568 check uses the scrolling fallback without clipping digit cells or widening the page.
- The existing Skarmory drawing demonstrates last-byte selection linked to its highlighted curtain pixel and inspector. Fit/large switching keeps one canvas and all 80 bytes; large uses the original artwork viewport. Returning to Fit closes extras. A 1440x900 check retains the desktop split layout and three navigation tabs.
- Screenshot: ignored local `research/mobile-compact-curtain-preview.jpg`. See [behavior and limits](MOBILE.md). No new emulator capture or physical phone test is claimed.

## Mobile usability - 2026-10-20

- All 174 automated tests and the TypeScript/Vite production build pass. New regressions cover scrolling/zoom in Inspect and record previews, gesture capture only for drawing, unchanged curtain geometry and numeric/text keyboard behavior.
- Connected Chrome production-preview checks at 320x740, 390x844 and 768x1024 verified mobile tabs, readable form controls, inline PP errors, pending-test reload, target location and return, verified answers, prediction pause/Undo/Finish drawing, and no page-wide horizontal overflow. A 1440x900 check restores the desktop split view and three tabs with exactly one canvas.
- Browser test data lived in a separate localhost origin. The user's original investigation and browser tab were not edited. No new in-game capture or physical phone test is claimed. See [mobile architecture and behavior](MOBILE.md).

## RNG-free experiments for broad PID sets - 2026-10-20

- All 172 tests and the production TypeScript/Vite build pass. Six new regressions cover independent exhaustive key-count comparisons over 4,096-PID domains and all 24 orders, shiny/nature/gender constraints, answer counts against full multi-snapshot inference, genuine trained-Combusken retention, reranking, JSON and rendered experiment controls/target geometry.
- The contributed Combusken retains the original 10,984,833 PID bound without encounter RNG, known IVs or EVs. Held items, all six move swaps and the level-23 Candy test now have informative questions. The Smoke Ball black illustration reduces the bound to 10,675,313; no inferred pixels or reference PID enter solver input.
- The independent SID-generation filter can remain enabled if the supplied SID survives it; an excluded SID suppresses recommendations. It does not add a PID encounter timing assumption.
- Browser JSON import was blocked by the extension's file-URL permission. No permissions were changed. Parser/core and server-rendered UI tests verify the same fixture, recommendation buttons, target coordinates and count feedback; no new in-game capture or interactive browser-answer verification is claimed.
- See [reproduction, architecture and conservative limits](SMART_DEDUCTION.md#broad-pid-sets-with-known-trainer-ids).

## Static category and bounded RNG - 2026-10-20

- All 166 tests and the production TypeScript/Vite build pass. Seven static regressions compare Method 1/4 with numeric PokeFinder vectors and an independent BigInt oracle, inclusive bounds and filters, immediate target evidence, shiny SID recovery and IV bounds before TID entry.
- Legacy Starter/Gift files migrate into Static without changing evidence. Saved wild RNG scopes retain their original semantics and never activate as static scopes. Static scope settings survive investigation/backup parsing.
- Connected Chrome: Totodile, Static, seed 0, Method 1, advances 0-9 returns 10 PIDs without a supplied PID or wild encounter area. Method 4 is available under the existing settings disclosure.
- See [static architecture, primary references and limitations](STATIC_RNG.md). No new emulator capture was produced.

## 2026-10-20 entry and experiment feedback

- Exact PC-restored PP checked for every catalog move and all values through its three-PP-Up cap; boosted PP restricts the packed slot bits. Invalid PP reports the four possible maxima on blur.
- Stats update with unknown EVs/nature and an existing joint projection, verified against an independent IV/EV enumeration. Electrike ability constrains stored bits and supported generated slots without imposing generic PID parity.
- A 15-SID target-answer regression retains 14 after a black Master Ball pixel, preserves the original, leaves unexamined checksum cells unknown and reranks that item out. Partial answers immediately constrain all searches and survive JSON.
- Exhaustive 3-candidate, 2-pixel support sets verify that removing nuisance/redundant questions preserves every joint surviving identity set.
- Mock timers/workers verify 450 ms debounce, cancellation on drawing, stale-result suppression and immediate Finish drawing submission.
- Connected Chrome verified direct Tackle entry, maximum 56, typed 42 = one PP Up, invalid 40 = red outline and hover explanation, unchecked fresh-catch IV bounds, and drawing pause status. A synthetic Master Ball target answer visibly changed 15 to 14 SIDs, restored the original with automatic pixels intact, and removed Master Ball from the useful list. The next Ultra Ball explanation confirmed key digit 4 = 2 retains one hypothesis, while black excludes that value and retains 13. Screenshot: local ignored research/entry-workflow-preview.png.


## Checksum, shiny identity and automatic pixels — 2026-10-20

- All **159 automated tests pass** via `npm.cmd run check`; TypeScript checking and the Vite production build succeed. The existing bundle-size advisory remains non-fatal.
- Nineteen new tests cover exact modular deltas, PP parity/counters, EXP word carries, EV byte weights, unknown friendship, exhaustive checksum/payload and paired-shiny oracles, all 24 orders, genuine fixture retention, linked snapshot checksums, JSON/autosave compatibility, prediction ambiguity/retraction/conflicts and completion without promoting automatic pixels.
- `npx.cmd tsx scripts/deduction-examples.ts` reproduces a four-identity scenario where Poké Ball improves worst-case survivors from four (encrypted pixels only) to two (combined checksum/encrypted pixels), changing the top recommendation from Repeat Ball to Poké Ball.
- The real Skarmory fixture, given the documented known facts and empty observations, yields 74 guaranteed pixels: 59 black and 15 transparent, zero mismatches and zero observed pixels. Repeated and mirrored screen appearances agree with the existing verified geometry.
- Chrome visual review confirmed the shiny selector defaults to Unknown, guaranteed pixels render with their actual black/transparent state and dashed borders, and the pinned inspector labels an automatic nickname pixel while its observation remains Unknown. Fixed a compact-workspace style that hid the new explanation. Review inputs used a separate localhost preview origin. No emulator measurements were added.
- [Architecture, reproducible examples, scoring conventions and conservative limits](SMART_DEDUCTION.md).

## Named inputs and Poochyena feedback — 2026-10-18

- **88 automated tests pass** and the TypeScript/Vite production build passes. Five new tests cover all named catalogs, name/ID matching and the supplied Poochyena conflict/review fixtures.
- Browser checks in connected Chrome confirmed Tackle→33, Route 101→16, Emerald→3, Poké Ball→4 and English→2, plus clearing the ID while a name is incomplete. The grey boxes and collapsed technical fields were visually inspected. Automated file selection was blocked by the extension's file-access setting; no permissions were changed. The same JSON files were loaded and validated by parser/solver tests.
- The supplied `.ek3` validates its checksum. Original input reproduces zero PIDs, with 158 matching pixels, two disagreements and Ruby/Emerald mismatch. The review preserves the genuine PID without copying hidden identity into facts. See [POOCHYENA_CASE.md](POOCHYENA_CASE.md).

## Investigator increment — 2026-10-18

- **83 automated tests pass** and the TypeScript/Vite production build passes through `npm run check`. This includes the original 72 tests and 11 new investigator tests; the existing UI contract was updated for the guided navigation and explicit assumptions.
- New coverage independently checks all 65,536 SIDs across all 24 permutations, partial packed bits, partial-payload checksum carries, per-snapshot item/checksum changes, real encrypted experiment predictions, joint ambiguity, exact synthetic 80-byte recovery, legacy JSON and blind genuine-SID survival for DOTS/Skarmory/Latios. See [the model and limitations](INVESTIGATOR.md).
- Browser surfaces were unavailable in this implementation session, so interactive browser/screenshot validation was not performed. Server-rendered component checks, numerical tests, static build and local HTTP checks do not replace real-game or browser interaction validation.
- No new emulator capture is claimed. Illumise and the unresolved John GBA Poochyena observation JSON were not available as fixtures. Encounter RNG and reachable EV experiment methods remain deferred.

## Previous calculator release check - 2026-10-15

- **72 automated tests pass**, including mapping/capture evidence, exact inference, examples and original trainer information. TypeScript and the Vite production build pass.
- The source ZIP was extracted to a fresh folder. An offline locked dependency install with lifecycle scripts disabled succeeded; all 72 tests and the production build passed there without the decompilation checkout or development folders. Root and extracted builds produce the same asset names.
- Go Live at http://127.0.0.1:5510/ returns HTTP 200 for the current page, JavaScript and CSS. This is an HTTP check, not a new visual or pointer-interaction browser test.
- The pinned GitHub Action references resolve to commits in the official actions repositories. The GitHub-hosted Tests and build workflow passed on the initial public commit (cdb51db), including all 72 tests and the production build. GitHub Pages is enabled for workflow deployment; consult the repository Actions page for the current deployment status.
- About now distinguishes unencrypted header bytes from encrypted secure data, describes the IV calculator accurately and reminds users to review assumed newly caught values. Invalid known-information or summary inputs block Calculate/Save; Save also guards against exporting stale last-valid facts. The outdated README screenshot was removed.
- Existing evidence, original observation fixtures and byte-to-pixel mapping remain unchanged. Source packaging excludes ROMs, full saves/states and private development folders.

The sections below preserve the chronological validation history. Older test totals, UI descriptions and preview ports describe those earlier checkpoints; use README.md for current launch instructions.

## Automated checks

- `npm.cmd test`: **34 passed, 0 failed**.
- `npm.cmd run build`: **passed**, including strict TypeScript checking and Vite production bundle generation.
- Current verified preview is `http://127.0.0.1:5188/`, left running (5187 was occupied). The default launch requests 5187 and Vite prints any fallback port.
- Pret asset extraction succeeded; placement, palette, visibility and SHA-256 records are retained in `src/data/mapping.json`.

Tests use actual pret metatile/map binaries plus hand-derived sparse curtain coordinates. The initial golden expectation placed byte24's high nibble at x=7; arithmetic established x=1 (tile792 byte0), so the expectation was corrected. The renderer nibble-order implementation required no change.

## Browser checks

Verified in Chrome:

- All 192 observations start unknown; loading a candidate does not fill them.
- Black painting at slot5 offset0 low nibble reports one matching observation.
- Transparent painting at that byte's high nibble shows `0?` and one contradiction.
- Undo restores a single match; redo restores the contradiction.
- Mouse drag paints four pixels continuously; one undo removes the whole stroke.
- Actual window layout opens with mirrored copies linked to canonical observations.
- 80-byte hexadecimal import preserves painted observations and updates comparison.
- Renderer reports 80/96 supplied bytes, retaining the missing neighboring regions.
- JSON export downloaded successfully. The actual downloaded file was parsed with `loadSession`, confirming the correct mapping version, all 192 states, and the two painted observations.
- PNG export downloaded successfully. Its actual PNG header/dimensions were verified at **504×144** for the tested raw view.
- Browser console reported no errors during the tested export / renderer actions.

The download-event automation timed out, but inspecting the resulting files independently confirmed both exports worked.

## DOTS / window update

- Used the exact supplied 80-byte DOTS file, preserving ciphertext and verifying checksum and fixed trade properties.
- Added actual static school artwork; transparent leak pixels reveal its panes.
- Default view is the game window. A first import opens Renderer automatically; existing observations stay in comparison mode.
- Verified DOTS preview in one-window and two-window/blackboard layouts.
- Painted one source nibble in the game-window editor: comparison reported one matching pixel. Undo restored zero observations. Tests confirm all four appearances use the same canonical observation.
- Two new tests fix DOTS's 20 known rows and check that frames/panes cannot create observations.
- Top/bottom neighboring rows remain unknown unless records or explicit known-empty slots are supplied.

## Verification limits

- Automated `.ek3` file selection was blocked by the Chrome extension's file-URL access setting. The app uses standard browser File.arrayBuffer and strict core parsing; users manually selecting files do not need that extension setting. JSON file-input interaction has the same automation restriction; serialization, validation and load consistency are covered by tests.
- Real emulator capture now verifies all 96 bytes and 768 appearances independently, including relocated storage. The school-entry source dump verifies the heap upload. Other allocation histories and ROMs remain untested; this is not a universal guarantee or a DMA-register trace.

## State-8 verification and exact-key constraints

- Original English ROM SHA-1 matched pret. mGBA state structure checked against version 0.10.3 source.
- Captured 12 actual BG2 entries, six mirrored. All 768 screenshot appearances match; 192 unique nibble observations compare without contradictions.
- Conditional breakpoint captured source 0x02006CB0 and size 0x4000. Source dump at 0x02008F90 equals saved VRAM, 96/96 bytes.
- State 8 restored; temporary breakpoint removed; finite controller callbacks removed themselves and cleared keys. No Pokémon memory writes, save-game writes or savestate overwrites were issued.
- Regression tests fix three current/original DOTS byte differences and three unique pixel contradictions.
- Full DOTS PID observation has 225 values, not a unique PID. Exact-key tests preserve unknown and 15-value domains, reject conflicting/missing keys, and check all 24 block permutations.
- Added separate original-file and actual-state previews, explicit VRAM labels, and plaintext block constraints. Previous observation JSON mapping remains compatible.
- Live browser verification: actual screenshot observations plus state-8 candidate show 192 matches, zero contradictions; original DOTS shows 189 matches and three contradictions. One black paint changes that to four, and Undo restores three.
- Supplied PID=132, TID=38726, SID=0 reveals key 0x97C2 and 34/96 exact secure nibbles. Remaining restricted domains stay ambiguous. Browser error log was empty.
- Verified both-window PNG export: 768×192, retained as `research/verified-curtains.png`. Live port 5188 returned HTTP 200 after final build; server and deliverable browser tab remain open.

## Latios pre-reset reference

Fixture provenance update: the contributor confirmed that this Latios is illegal. The capture remains valid evidence of how its stored bytes render in English Emerald. Its checksum and matching pixels do not establish legality, and the solver does not apply encounter-specific RNG relationships.

- User confirmed mGBA state 9 is before reset; no after-reset state was saved.
- Supplied 100-byte party `.ek3` has a checksum-valid 80-byte prefix identical
  to captured slot5. Extracted bytes remain unchanged and neighbors are verified
  empty in both state9 and the newest complete saved-game copy.
- Independent Latios capture passes 96/96 byte and 768/768 screen checks, with
  live storage displacement +112. Screenshot strips are state-free PNGs.
- Two additional regression tests verify party-prefix preservation, fixed
  record properties and matching native-screen placement/domain constraints.
- Current live port 5188 responds HTTP 200. App parsing remains strictly 80
  bytes; import `research/fixtures/latios-test-box.ek3` for this party export.
- After-reset graphics are not verified by examining the saved-game record.

## Guaranteed reverse inference

- 34 total tests pass. New tests compare exact joint header counts and every
  ciphertext/plaintext byte projection with an independent exhaustive oracle
  over small nonempty, ambiguous PID/OT domains. They also verify unknown stays
  unknown, nature counts, monotonic narrowing, actual DOTS/Latios retention,
  contradictory facts, partial EV null/zero validation, species IDs and PID lists.
- Final production build passes strict TypeScript and Vite bundling.
- Live Chrome checks: species selection changes Latios PID count; six known EVs
  constrain the key/order; known TID/SID/nature leave 5703 PIDs. DOTS with known
  species/zero EVs/TID/Relaxed nature gives the complete five-PID list.
- Exact PID plus a contradictory HP EV produces an explicit conflict; restoring
  the correct value and removing PID returns the partial inference result.
- Importing the exact Latios candidate leaves inference at 5703 PIDs. It matches
  160 main-record observations; adding its confirmed empty neighbors gives 192
  matches and zero contradictions. No candidate PID is copied into facts.
- Erase returns a pixel to unknown (191 observations); Undo restores 192. Known
  facts remain independent of the painting and the pixel-only hex view.
- Actual browser JSON exports were parsed and recomputed: DOTS gives 5 PIDs,
  Latios gives 5703. Both retain all six EVs, nature/species/trainer facts and
  observations, excluding candidate bytes and unsupplied PID. Fixtures:
  solver-example-dots.json and solver-example-latios.json.
- Browser console reported no errors. Port 5188 returned HTTP 200. The final
  screenshot is research/solver-inference-ui.jpg; the example tab is kept open.
- Copied hex is an abbreviated representation; saved JSON recomputes full
  domains. Correlated multi-byte/IV/key counts are explicitly marked as bounds.
- Checksum equality, legality, EV totals, known IVs, nickname and level/growth
  inference remain outside the applied model. No unique identity is claimed.

## Public interface preparation — 2026-10-15

- 42 automated tests pass, including original graphics/capture checks and new scope-completion, field-inspection, default-interface and source-ZIP checks.
- `npm run build` passes with relative asset URLs for repository-path hosting.
- The source ZIP was extracted to an isolated workspace folder. A fresh locked npm install (install scripts disabled) and `npm run check` pass there without the decompilation checkout or local capture folders.
- The lockfile retains installed dependency versions and includes optional Linux/macOS/Windows packages for CI portability.
- Browser checks: default single window at 20×; black grid; input forms on the left; inspector below; no reconstruction counts in the default tab; observation state retained across tabs.
- One black nibble followed by explicit completion yields 159 zero nibbles, one nonzero nibble and 32 unknown neighboring nibbles. Undo restores 191 unknown nibbles and the one painted nibble. A partial drawing can be analyzed without completion.
- With an exact PID, byte 0x3C correctly resolves to Special Attack EV for the Whismur fixture, while its unobserved value remains unknown.
- Pasting the Whismur candidate into a one-pixel drawing reports one match and no contradictions. Imported bytes remain separate from observations.
- Browser-downloaded observation JSON has the expected schema and supplied facts; a browser-downloaded renderer PNG has the expected 640×520 dimensions.
- The final source manifest excludes ROMs, full saves/states, dependency/build directories, private local backups and handoff notes. ZIP entries are independently decompressed, CRC-checked and compared byte-for-byte in the automated test.

GitHub workflows are prepared but have not been executed on GitHub or deployed to a public repository in this workspace. The original memory/tile mapping and research fixtures are unchanged.

## Hypothesis checker — 2026-10-15

- 48 automated tests pass, including six new checks for strict hypothesis parsing, direct pixel contradictions, immutable intersection with known facts, PID/nature correlations, encrypted EV contradictions, and invalid or conflicting baseline states. TypeScript and the Vite production build pass.
- Chrome: completing a one-black-nibble drawing leaves 15 PIDs. Trial PID 7 is possible; PID 0 is impossible with byte 0x00 / low-nibble evidence. Editing a trial removes its old verdict, while the underlying reconstruction retains its 15 PIDs.
- Chrome: the full Whismur fixture was reproduced through the painting keyboard controls, then explicitly completed. With known TID 9918, SID 41686, species Whismur, Quirky nature and zero EVs, trial PID `0xA53FEFE8` is possible. Trial PID `0xA53FEFE0` is rejected at byte 0x00 / low nibble.
- Trial Attack EV 9 first conflicts with known Attack EV 0. Removing that known EV leaves the submitted trial impossible through the joint encryption model; changing the trial EV to 0 restores possible. This verifies that existing facts are never silently replaced and submitted results follow changes to active facts.
- Hypotheses are independent scratchwork: no imported candidate, known fact, observation, reconstruction domain or saved JSON is modified by a test. The checker deliberately excludes checksum equality, IV hypotheses, legality and RNG generation methods.
- A historical hypothesis-checker screenshot was recorded locally; outdated UI screenshots are excluded from the current release. The source bundle includes the module, component, tests and guide. Memory mapping and capture evidence remain unchanged.

## Known traits, packed stats and defaults — 2026-10-15

- 54 automated tests and the TypeScript/Vite build pass. Existing screen/VRAM mapping tests remain unchanged and pass.
- All 386 Emerald species now have source-extracted gender thresholds and ability IDs/names. Gender cases are exhaustively checked for every low PID byte and species, including the exact Whismur 126/127 threshold boundary and fixed-gender species.
- IV/ability/Egg/ribbon constraints use bit masks. Tests cover partial IV boundaries in all 24 permutations, a stored ability inconsistent with ordinary creation parity, and ribbon defaults that preserve all unused/fateful bits as unknown.
- An independent small exhaustive header oracle verifies joint gender/IV/ability/condition counts and all 80 byte domains. Real Whismur ciphertext remains possible with its exact decoded facts; incorrect supplied stats are rejected. No imported candidate is used to fill solver constraints.
- UI markup checks verify disabled gender/ability controls before species selection, empty IVs, zero EV/condition defaults, the default-assumption label and the Clear defaults action. Default/draft conversion and observation JSON tests preserve null versus zero and assumption metadata. Old sessions acquire no new defaults.
- Newly caught presets supply 17 labeled assumptions: six EVs, six condition values including Sheen, Pokérus, markings, Egg flag, packed PP Ups and low-27-bit ribbon data. IVs, friendship, held item, unused/fateful flags, experience, met data and padding are not initialized to zero.
- Browser automation could not start because its Node runtime path was unavailable. A new live-browser interaction/visual check was therefore not performed for this update. The earlier interface screenshots predate these additional controls.
- The user's running VS Code Go Live server on port 5510 returned HTTP 200 for the rebuilt app and both current bundled assets (JavaScript and CSS with the expected MIME types). The older Vite preview on 5188 was not running. No additional preview process was started.

See [trait/stat derivation](TRAIT_STATS_CONSTRAINTS.md). The rebuilt `dist/` is ready for the configured VS Code Go Live root. No emulator or Pokémon data was modified.

## EXP, reconstruction layout and summary-assisted IVs — 2026-10-15

- 60 tests and the production build pass. New tests cover unsigned 32-bit EXP at Growth +04 in every block permutation, EXP candidate contradictions, stat/nature/EV rounding, Shedinja, Emerald Deoxys base stats, summary validation/JSON, IV intersection and promotion, PID digit order and the 100-value display threshold.
- Whismur summary stats at level 5 (max HP 22, Attack 10, Defense 8, Speed 8, SpA 11, SpD 8) produce standard IV ranges. The curtain model removes additional stat-only values while retaining all actual IVs under the supplied reference header/EVs/nature/EXP.
- Only singleton intersections can be explicitly promoted to stored IV facts. Conflicting summary inputs block promotion; missing inputs stay unknown. Multi-value ranges remain conservative projections and do not alter exact-model PID counts/checks or candidate consistency.
- Markup checks verify EXP/level/max-HP inputs, reconstructed hex before PID controls, combined editable PID input/suggestions, fixed digits and removal of the three pixel-count boxes. The title is Data reconstruction. Lists of at most 100 PIDs are selectable; larger lists stay hidden.
- Summary observations save separately under optional `summaryStats`; older sessions remain compatible. Browser automation still failed to start, so interactive/visual review was not performed for this update.

Source and model boundaries are documented in [SUMMARY_STATS.md](SUMMARY_STATS.md).

## User-painted Skarmory preservation — 2026-10-15

- The user exported the active drawing as `curtain-observations (5).json`. It and the matching 80-byte encrypted Skarmory reference are copied byte-for-byte to `fixtures/solver-example-skarmory.json` and `fixtures/skarmory-test.ek3`; source/destination SHA-256 values match.
- The actual user-entered 160 observations match the reference, with zero pixel or fact contradictions and no supplied PID. Known summary data and zero EVs give HP IV 27–31; the curtain projection is 7/15/23/31, leaving exactly 31. The saved model retains 20 PIDs including the reference and every real byte.
- Removing only the HP fact from the preserved JSON gives 41 PIDs; applying HP IV 31 narrows this to 20 PIDs.
- A separate forecast script predicts level-17 EXP pixels add no PID restriction to the original 20; combining level-18 EXP reduces them to 17. The level-17 summary can establish Speed IV 31. These are simulated predictions, not observed emulator checkpoints, and the UI does not yet combine checkpoints.
- The Skarmory regression and independent EXP-pattern forecast are covered by three additional tests. `research/SKARMORY_CASE.md` records assumptions, side effects, the separate-capture protocol and extended simulation results. No game/emulator/Pokémon was changed.

## Loadable research examples

- About loads DOTS, Skarmory and illegal Latios saved observations and known facts, with separate matching reference candidates. The public DOTS example additionally includes its known male gender and Early Bird ability, while the original saved JSON remains unchanged. No observations or facts are inferred from candidate bytes when loading.
- Automated checks compare every bundled reference byte to its original fixture, validate original sessions, reproduce 1 / 20 / 5,703 public-example PID counts (the original DOTS fixture without the added traits remains at five), and find zero observed-pixel or supplied-fact contradictions. Editing an example cannot change future loads.
- Skarmory retains its recorded summary stats, applied HP IV 31 and unknown neighbors. DOTS/Latios empty neighbors match their captured records.
- Loading examples keeps an in-memory backup of the previous workspace, including painting history, inputs and candidates; switching examples retains that original backup. The restore button is visible across tabs. Refreshing closes this temporary backup; JSON export remains the permanent save mechanism.
- 67 automated tests and the TypeScript/Vite production build pass. Interface coverage checks the three example controls through server rendering; no new live-browser interaction check is claimed.

### DOTS unique PID from known summary traits

- The contributor supplied male gender and Early Bird; the captured reference independently confirms both. Early Bird is ability ID 48. With the original observations, species, zero EVs, TID and nature, male gender alone leaves four PIDs, Early Bird alone leaves one, and both leave exactly PID 132 (0x00000084).
- The public example now includes both facts explicitly, without supplying PID or SID or copying solver facts from candidate bytes. The original saved JSON and captured bytes remain unchanged. This demonstrates uniqueness under these accurate inputs, not general pixel-only PID recovery.

## Original trainer information

- Added exact OT name and independent unknown/male/female OT gender to known information, inference, candidate comparison and JSON sessions. Empty inputs remain unknown; no new default facts are assumed.
- OT names use source-derived Gen 3 international character bytes, preserve case/spaces, reject unsupported text and constrain only characters plus the first EOS (if it fits). Later bytes remain unknown.
- OT gender constrains Misc +03 bit 7 after the normal XOR/block-order transformations. Tests cover male/female across all 24 permutations and reject the opposite value without constraining unrelated bits.
- Opening instructions now say to draw the pattern, add known information, then calculate. Details and source links: [OT_INFORMATION.md](OT_INFORMATION.md).

## Initial-release file audit

Generated dependencies/builds, release verification folders, full source checkouts, private captures, handoff notes and local screenshots are excluded from the public source bundle. The two historical docs UI screenshots are now ignored by Git and omitted from source packaging; they remain on disk locally. Minimal records, observation JSON, binary mapping assets and stripped native-screen PNG fixtures are intentionally retained for tests and loadable examples. No original fixture bytes were changed.

## Direct item testing — 2026-10-18

- Removed inventory checkboxes from the interface. The full supported catalog is ranked from surviving hypotheses; the player selects an item using Try.
- Item tests progress through a Yes/No question, an optional editable drawing draft and a recorded result. Drafts do not enter inference. No confirms the prior observed pattern, preserving unknown cells. Yes opens the prior drawing; saving applies edits and updates findings and the next ranking.
- Local autosave preserves the investigation and unfinished test, including edited draft pixels. Legacy JSON remains compatible. Research examples pause autosave to preserve the user's prior investigation.
- Five additional tests cover draft isolation, both answer paths, actual encrypted item-swap narrowing with genuine SID survival, recomputed rankings, pending-test JSON/device restore, invalid metadata/storage and direct question/save interface contracts. All 93 tests and the TypeScript/Vite production build pass.
- Chrome smoke checks exercised selecting an item, No, selecting the next item, Yes, restoring the unfinished editor after reload, painting a pixel, saving and returning to updated rankings. This verifies the interface; the manual browser data is development input, not an emulator experiment. The independent encrypted-record regression verifies real constraint narrowing.

## Wild H1/H2/H4 seed/advance search — 2026-10-18

- Added inclusive seed/minimum/maximum advance searching for ordinary Emerald wild encounters. The UI defaults to seed 0 and all three methods, selects encounter tables from known met data/species and supports generation lead settings. A known PID is not required.
- Generated PID/IV tuples remain correlated through per-snapshot constraints, checksum checks, projection and item ranking. Worker searches rerun after saved evidence changes; unfinished item drafts remain excluded. Counts distinguish generated spreads and joint PID/SID/IV hypotheses. Settings persist through JSON/autosave and can be turned off.
- Seven additional tests check independent BigInt LCG arithmetic/jump bounds, numeric PokéFinder H1/H2/H4 golden vectors (including Synchronize/Cute Charm), header/trait/stat filtering, exact optimized versus exhaustive SID results, non-circular Poochyena PID/IV recovery, unknown TID, multiple/no-match scopes, item-draft exclusion, JSON and interface contracts. All 100 tests and the TypeScript/Vite build pass.
- The reviewed Poochyena session, with PID/IVs absent from known facts, gives one matching spread in seed 0 advances 0–99,999: PID 2384797520, IVs 2/1/30/4/22/13, H2 at advance 603. Widening through 999,999 retains two spreads and 288 joint hypotheses; the true reference PID/IVs/SID survive. The original conflicting input is preserved unchanged.
- Chrome smoke checks left PID/IV fields blank, entered Poochyena traits, searched a narrow range and obtained the correct PID. Adding summary stats automatically narrowed three IV spreads to one and enabled ranked items. Reload restored settings/evidence and recomputed the result. Turning off RNG returned to ordinary inference. The temporary browser inputs were cleared after visual review. No new emulator capture is claimed.

Model details and supported encounter/lead scope: [WILD_RNG.md](WILD_RNG.md).

## Compact workbench, fixed baseline and new-game SID RNG — 2026-10-19

- Recreated the supplied split layout: three input tabs, scrolling left panel, one canonical curtain strip, fixed live values/inspector and grouped 80-byte hex. Hex digits and pixels share hover/pin addresses; inspector shows allowed digits. Extra fields remain collapsed; the classic workspace preserves advanced tools.
- Every new experiment compares against the original observation. Both saved answer paths restore it while keeping test evidence. In-game restoration is explicit; consumable tests require reloading a baseline save. Legacy chained test sources remain intact.
- Optional TID-seeded SID generation, distinct output/all-advance grouping, exact candidate intersections and unknown-PID witnesses are shared across SID Finder/Data Recovery. Wild PID/IV hypotheses are filtered before the candidate safety limit. Empty windows offer widen/disable. Settings round-trip without mutating facts.
- Source verification and timing/reseeding limitations: [SID_RNG.md](SID_RNG.md). The reviewed Poochyena's genuine SID 37399 appears at advance 1,736. Known-PID SID candidates narrow 4,394 → 237; wild seed 0 advances 0–99,999 narrows 144 → 9 joint hypotheses with the default SID window. No hidden PID or IV is injected into the wild test.
- Fresh-catch defaults include source-derived friendship/full known PP, retain manual exceptions and update dependent defaults on species/move edits. Extraction now excludes the inline SPECIES_NONE initializer so Bulbasaur retains its own metadata.
- Added controlled move, Rare Candy and vitamin recommendations. Move PP/PP Ups follow swaps. Rare Candy requires four occupied known moves to allow declining new moves; evolution must be canceled. Vitamins enforce per-stat/total caps, clear stale summary stats and retain assumption provenance. Independent encrypted-record tests retain genuine SID and verify predicted pixels.
- Deterministic coverage includes RNG/duplicate outputs/window boundaries, exact intersections, unknown-PID witness isolation, all 24 dynamic validator orders, genuine SID outside scope, reversible JSON, fixed-baseline restore, controlled actions and compact inspector/hex contracts. All 117 tests and TypeScript/Vite build pass via `npm run check`.
- Chrome checks at 1430 × 950 verified all right-side content fits without page scrolling, linked hex selection, zero-SID guidance and restoring results by disabling the filter. Direct original-baseline No flow saved a separate observation and recalculated the next ranking. These UI inputs are disposable examples; independent core tests provide the data-recovery evidence. No new emulator measurement is claimed.
- The production build was also checked at 1366 × 768. Its unknown-PID worker returned all 3,506 TID-40492 SID outputs when no further facts were supplied, retained the broad PID bound, displayed duplicate advances, validated a compatibility witness and shared the result with Data Recovery. Reverse curtain-keyboard → hex highlighting was verified. Temporary inputs were cleared, an unmodified example was restored, and the viewport override was reset.


## About research publication ? 2026-10-19

- Expanded both About views with the same substantial research article, preserving usage notes, examples and prior research documents. Added interactive low/high nibble and XOR examples, an 80-byte address/permutation explorer, repeated-key and PID/OTID diagrams, separate new-game/wild RNG histories, SID-set intersection and a proposed multi-Pokémon flow.
- Audited important claims against the pinned pret source, existing algorithms and tests. Historical attribution was checked against the preserved Glitch City article. All 40 distinct locally linked source/research paths exist. [ABOUT_RESEARCH.md](ABOUT_RESEARCH.md) records the evidence boundaries.
- Source-verified SID initialization is distinguished from unmeasured introduction timing. The reported Illumise reconstruction retains attribution and its missing-fixture qualification. Existing single-Pokémon snapshots are explicitly distinguished from a future trainer-level multi-Pokémon aggregator. No new emulator or gameplay result is claimed.
- All 120 tests and the TypeScript/Vite production build pass. Chrome checks exercised article anchors, the 80 address buttons/two-pixel highlight, permutation changes, nibble order and XOR results. At 390 ? 844, diagrams fit the scrolling left panel without horizontal overflow. The right panel remains fixed on desktop; educational controls leave the investigation unchanged.

## Dewford phrase SID evidence — 2026-10-19

- Added optional original-phrase membership and ranked first-submission tests to SID Finder and Data Recovery. Evidence intersects the existing TID-seeded SID window and actual curtain/Pokémon constraints, including unknown-PID compatibility. Disabling Dewford evidence retains recorded answers; pending tests add no constraint until answered.
- Source-derived English Easy Chat IDs and all five phrase-generation branches are checked against an independent BigInt RNG oracle. Tests cover boundaries, gap uncertainty, duplicate SID outcomes, overlapping outcome sets, exact curtain intersections, JSON persistence and reversible filtering. All 127 tests and the TypeScript/Vite build pass via `npm run check`.
- Reproduced maractite's published retail example without supplying its SID: TID 63171, original TOGETHER / MOVIE, inclusive SID calls 100–2000 and gap 3 leave seven distinct SIDs. WEIRD / MONEY accepted leaves two; APPROVED / FLOWERS rejected leaves SID 55567 at call 831. The fixture explicitly converts the guide's zero-based output indexes to one-based RNG calls.
- Chrome exercised the same 7 → 2 → 1 sequence, a custom phrase, pending-test autosave/reload, shared Data Recovery evidence, and disable/re-enable (1,879 timing-only SIDs → one restored SID). At 1430 × 950 and 390 × 844 the panel controls fit without horizontal overflow; no browser errors were captured. The user's separate live investigation was untouched.
- This reproduces a published example and validates the implementation; it is not a new emulator/console experiment. The calibrated three-call gap, uninterrupted generation and original-history assumptions remain explicit limitations. Full audit, baseline-save protocol and research credits: [DEWFORD_SID.md](DEWFORD_SID.md).


## Entry defaults and reported Nincada completion ? 2026-10-19

- Added editable new-test English/Emerald, normal header flags, empty move and full-PP defaults. The compact nickname field stays beneath Species; exact names constrain through the first EOS while trailing memory stays unknown. Manual nickname/PP overrides and existing imports are preserved. Summary level/stats now say Required for stat-based IV recovery.
- Is egg constrains the header and secure Egg bits; 0x02 is the hasSpecies header flag, not the Egg flag. Added an optional normal-wild storage preset for zero filler and upper unused/fateful bits, with assumption metadata and no checksum input. See [ENTRY_DEFAULTS.md](ENTRY_DEFAULTS.md) for pinned source references and scope.
- Replayed the supplied Nincada JSON without injecting SID/PID/IVs: one H2 spread at advance 900, PID 0x97507B58, SID 33789. Assuming nickname NINCADA and normal wild storage gives 79 exact bytes and checksum 0x15D1; byte 0x10 after the nickname terminator retains 225 values. Exact export remains blocked. The reported three-phrase gameplay success is attributed to the contributor; no independent original record was supplied. The reviewed JSON/report are local ignored artifacts, and the source file is unchanged.
- Four regression tests cover default dependencies/manual exceptions, names/encoding/EOS boundaries, both Egg flags, JSON compatibility, zero-storage opt-in and checksum derivation while preserving ambiguous nickname memory. All 131 tests and TypeScript/Vite production build pass via npm run check.
- Chrome checks verified automatic NINCADA, a retained manual nickname, Scratch ? ID 10 / PP 35, empty slots/PP 0, header/language 02, required stat labels and the explicit storage preset. Layouts fit at 1430 ? 950 and 390 ? 844 without horizontal overflow; no browser errors were recorded. Browser file import was unavailable because the extension lacks file-URL access, so the supplied session was replayed through the core solver, not imported in the UI. The separate live workspace was untouched.
