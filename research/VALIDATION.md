# Validation results

## Current release check - 2026-10-15

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
