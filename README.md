# Emerald Curtain Investigator

Use the Rustboro Trainer School black curtains glitch to investigate hidden Generation 3 Pokémon data. Combine a curtain drawing, known Pokémon information, encounter RNG and Dewford phrase evidence to narrow PID, SID, IVs and an 80-byte encrypted Pokémon record.

[Open the application](https://mankeymite.github.io/EmeraldCurtainCalculator/) · [Recovery model and implementation status](research/INVESTIGATOR.md)

Calculations, imported files and autosave stay in your browser. No ROM, account, API key or upload service is needed. Exact recovery depends on the evidence available; black pixels alone do not reveal every hexadecimal digit.

**Verified mapping: English Pokémon Emerald only.** Other language versions have not been validated. Pokémon received from other Gen 3 games can be investigated as stored records in English Emerald; their original generation method is not assumed to be Emerald's.

## Latest update — 19 October 2026

- **Compact workspace:** Pokémon info, Investigate and About on the scrolling left; a fixed curtain, live recovery values, pixel inspector and grouped 80-byte hex on the right. Mobile screens stack the panels.
- **Clearer curtain:** three columns of actual school artwork on each side of the canonical 8×20 data strip, optional helper lines, corrected hover selection and linked pixel/hex highlighting in both directions.
- **SID recovery:** optional public-TID-seeded new-game RNG filtering plus original Dewford phrases and ranked accept/reject phrase tests. Recommendations use the actual surviving Pokémon/curtain-compatible SIDs.
- **PID/IV recovery:** configurable seed and inclusive advance searches for supported Emerald wild H1/H2/H4 encounters; a known PID is not required.
- **Guided experiments:** ranked held items without inventory checkboxes, plus supported move swaps, Rare Candy and vitamins. Saved experiments return the drawing to the original baseline.
- **Faster data entry:** typed names with automatic grey ID boxes, English/Emerald and normal non-Egg defaults, empty move slots, automatic full PP and a compact nickname field beneath Species. Summary level/stats say Required for stat-based IV recovery.
- **Completion guidance:** an optional, labeled normal-wild storage preset resolves ordinary filler/upper flag assumptions so the checksum can be calculated. Nickname bytes after the terminator remain unknown unless independently established.
- **Save and reset:** JSON backups, local autosave of evidence and pending tests, and **New Pokémon** for a clean investigation with the entry defaults restored.
- **Research article and attribution:** expanded About explanations, diagrams, source references and Dewford/Feebas SID tool credits. Latest code validation: **131 tests and the TypeScript/Vite production build pass** with `npm run check`.

## Investigate a real Pokémon

1. Put the Pokémon in **Box 8, slot 5**. Preferably leave slots **4 and 6 empty**. Enter Rustboro Trainer School.
2. Use **Pokémon info** on the left to choose the species and obtaining method. The fixed right side shows one curtain strip, live Species/PID/IV/XOR/SID results, pixel inspector and grouped 80-byte encrypted record. The strip contains every main-record pixel; mirrored repeats are omitted.
3. Enter what you know from the Pokémon summary and original trainer information. Use **maximum HP**, not remaining HP. TID, SID and name refer to the **original trainer**. Another trainer's Pokémon cannot directly reveal your own SID.
4. Review the entry defaults and type the actual moves, nickname and PP exceptions. For an untouched fresh catch, check **Assume freshly caught Pokémon** if appropriate: zero EVs/contest data, no Pokérus or ribbons, base friendship, no held item and full known move PP. Tinted fields are assumptions. EXP, random IVs/PID and reserved bytes are not supplied by this checkbox. **View and edit remaining fields** opens additional inputs and storage assumptions.
5. Record verified black and transparent pixels on the curtain. Unknown cells stay unknown. Painting freezes predictions and pauses calculations until **Finish drawing**. **Inspect** selects without painting; hover or pin a pixel or hex digit to inspect its allowed digits. Undo preserves the prior drawing.
6. For **Wild** or **Static**, select **Limit RNG advances** or open **Investigate > Encounter RNG**. Static groups fixed encounters, starters and ordinary gifts: Method 1 is the default, with Method 4 available under seed/settings. Wild retains H1/H2/H4, encounter areas and lead settings. Known facts and verified pixels filter correlated PID/IV spreads; SID recovery and experiment rankings use the results automatically. Seed defaults to 0; advance bounds are inclusive. See [static scope and validation](research/STATIC_RNG.md).
7. Optionally enable **New-game SID RNG Filter** in Pokémon info, **Investigate → SID Finder**, or **Data Recovery**. It uses the entered public TID, defaults to approximately 60 seconds / calls 1–3,600, and accepts custom bounds. It intersects actual candidates with pixels and known facts while preserving possible PIDs. View SID/advance rows, Validate, widen or disable. See [verified source sequence and limitations](research/SID_RNG.md).
8. Click **Investigate** beside an unresolved value to open ranked experiments on the left. Choose an action you can perform: held-item swap, move swap, Rare Candy EXP checkpoint or vitamin EV change when supported by the known facts. No inventory checklist is required. Follow the instructions, return the Pokémon to the target slot and leave/reenter the school.
9. Inspect only the highlighted useful pixels and answer **Black** or **Transparent**. Each verified answer updates candidates and reranks experiments. Unexamined pixels stay unknown; original observations and automatic deductions remain visible while editing. Finishing restores the original drawing. Restore the original Pokémon state in-game too; consumable tests require a baseline save to reload. Do not overwrite that save.
10. The investigation, including unfinished tests and RNG settings, saves automatically on this device. **Save** downloads a separate JSON backup. **Load** accepts previous observation JSON too, without adding defaults.

Changing tabs preserves the investigation. New generic observations start with mutable fields unknown. New tests use the first original observation as their baseline; historical chained tests retain their saved comparisons. New target-answer tests apply verified answers immediately, including partially answered drafts. Legacy Yes/No drafts remain excluded until recorded. Controlled tests clear friendship/checksum; EXP/EV tests also clear stale summary stats. Review copied facts if anything else changed. Rename observations and record changes under **Notes and snapshot comparison**. Save JSON before removing an observation if you want to retain a copy.

### Drawing and entry controls

On phones and small tablets, use **Curtain** to switch between entry and drawing.
Its compact view places the whole curtain beside all 80 bytes, with the pixel
inspector underneath, so they can be viewed together on a typical phone screen.
**Recovered values** expands the PID/IV/SID overview. For more comfortable painting,
open **Drawing options → Larger drawing & byte targets**; the fit option returns
to the compact view. Very short screens and expanded explanations can scroll.
The navigation and drawing controls stay accessible while scrolling. Start in
Inspect to scroll or select pixels; tap **Draw** to paint and **Finish drawing**
to update findings. **Drawing options** holds Undo, Redo, grid lines and automatic
pixel display. Experiment **Locate pixel** centers its target in Curtain, and
**Back to experiment questions** returns to the pending test. Forms use larger
touch targets and suitable keyboards; invalid PP has an inline explanation.
See [mobile behavior and validation](research/MOBILE.md).

With both original trainer IDs known, **Investigate PID** and **Narrow the key**
offer held-item, move-swap and eligible Rare Candy tests even with millions of
PID possibilities and no encounter RNG limit. Each test asks one informative
pixel at a time across all compatible block orders. Unknown EVs remain unknown;
only verified answers become evidence. Broad counts are conservative stored-data
bounds. See the [trained Combusken reproduction and limits](research/SMART_DEDUCTION.md#broad-pid-sets-with-known-trainer-ids).

The center **8×20** grid represents the main Pokémon's 160 nibbles. The three context columns on either side are school artwork, not additional editable record bytes. Use **Lines on / Lines off** to toggle helper lines, **Draw / Inspect** to switch painting and selection, and **Unknown** for uncertain cells. Hovering a pixel highlights its corresponding hex digit; hovering a hex digit highlights the pixel. Click to pin the address and inspect its remaining allowed digits.

Moves, met location, origin game, Ball, language and held item accept typed names with suggestions; a grey read-only box shows the stored ID automatically. Empty move fields show a hint and retain default ID 0; choose **Unknown** in the suggestions to clear a move fact. New investigations start with English (2), Emerald (3), header flags `0x02`, Is egg = No, no PP Ups and four empty move slots with PP 0. Selecting a move fills its assumed maximum PP; manual PP changes are preserved. The displayed maximum includes all three PP Ups. Because PC storage restores PP, entries must equal a maximum for 0-3 PP Ups; the stage is inferred automatically. Invalid PP gets a red outline on leaving the field, with a hover explanation.

Nickname sits beneath Species and defaults to the uppercase English species name. Enter the exact visible spelling/case if renamed; a manual nickname is preserved when species changes. Summary level and six stats are marked **Required** for stat-based IV recovery, but SID/pixel analysis can run while they are incomplete. Entered stats update IV bounds even with unknown EVs or nature, without selecting freshly caught; verified EVs/nature narrow those bounds further. Existing imports acquire no new facts. **New Pokémon** clears the previous investigation and restores the entry defaults; use **Save** first to retain the previous Pokémon.

Technical reserved words are under **Advanced raw storage fields · filler and flags**: each is a two-byte internal field, not a summary-screen stat. Header reserved bytes are at 0x1E–0x1F; Growth filler is at logical Growth offsets 0x0A–0x0B. An optional **Use normal wild-catch storage defaults** preset assumes these and the unused/fateful bits are zero for an ordinary, unmodified Emerald wild catch. Those values remain labeled assumptions. Nickname text fixes characters through its terminator, not trailing memory. See [defaults and completion limits](research/ENTRY_DEFAULTS.md).

Header flags `0x02` means **has species**, not Egg. The header Egg bit is `0x04`; **Is egg** constrains both that header bit and the separate encrypted Egg bit. Normal non-Egg defaults therefore resolve the header to `02` without treating the Pokémon as an Egg.

Automatic pixels appear black or transparent with dashed blue/teal borders; unknown cells retain their editing dots. **Auto pixels** toggles assistance. The inspector explains the constraint and conditional assumptions; manual conflicts remain visible. Orange outlines identify experiment targets. **Predictions never enter the observed drawing or count as independent evidence**, when submitting a drawing. Their underlying facts already constrain the solver; you do not need to paint them again. Only explicitly verified pixels become observations. Typing waits 450 ms before starting background deduction. Painting freezes predictions and pauses calculation until **Finish drawing**; unexamined pixels stay unknown.

**Is this Pokémon shiny?** defaults to **Unknown**. Yes/No constrains the XOR key even without PID or SID and follows shared identity through snapshots, JSON and autosave. Experiment ranking combines encrypted and checksum pixels when an exact delta is justified; unknown side effects preserve the existing fallback. See [technical details, reproducible ranking improvement and real Skarmory demonstration](research/SMART_DEDUCTION.md).

## Implementation status

### Dewford phrases and new-game SID RNG

Open **Investigate → SID Finder** or **Data Recovery**, expand **Dewford trendy phrases · experimental SID filter**, enter the original current phrase and confirm that the save has never successfully changed its phrase or mixed records. The tool searches the known public TID's new-game RNG window, checks the five generated phrases and intersects actual surviving SIDs with Pokémon/curtain evidence. It can do this while PID is still unknown; it does not invent one.

1. Keep a baseline save from before any successful phrase change or record mixing.
2. Choose a ranked phrase. Counts show how many of the actual surviving SIDs remain if it is accepted or rejected; no fishing or inventory checklist is required for this phrase workflow.
3. In-game, tell the boy outside Dewford Hall **No** about the current trend, then submit the exact two suggested words.
4. Answer the tool's separate question: **Did he accept this phrase as the new trend?** Under these first-submission conditions, accepted means absent from the initial five; rejected means present.
5. Reset without saving and reload the same baseline before **every** next test, including after rejection. The calculator keeps the answers and ranks the next useful phrases.

Pending tests add no constraint until answered. Saved answers and the pending test survive disabling/re-enabling Dewford evidence. If no phrase distinguishes the remaining SIDs, the tool says so. If no candidates survive, widen the window, review facts/history/gap assumptions or disable the filter. Save JSON before turning off the entire SID RNG search, which removes that optional search configuration.

The public maractite example reproduces **7 → 2 → 1 SIDs**, ending at SID 55567 without supplying it. This is reproduction of published evidence, not a new gameplay capture. Default timing is approximately 60 seconds / SID calls 1–3,600; actual RNG calls can differ from frames. The three-call gap before phrase generation is community calibration, and VBlank interruptions can invalidate the model. Active Dewford searches are limited to 100,000 SID calls; timing-only searches allow 1,000,000. See [protocol, source audit and limitations](research/DEWFORD_SID.md).

The new-game sequence starts from the **public TID** and concerns generation of that trainer's SID. The separate wild PID/IV search normally starts from **seed 0 after a soft reset of an existing save**. These are different RNG histories.

### Supported features

| Phase                             | Status                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1: Rebranding and guided workflow | Implemented; 386 species, extensible obtaining categories and shared editor/recovery state                                         |
| 2: Known-PID/TID SID inference    | Implemented; all 65,536 SIDs, all four substructures, partial bit facts and checksum compatibility                                 |
| 3: Multiple observations          | Implemented; immutable identity plus independent mutable snapshots; JSON and legacy imports                                        |
| 4: Adaptive experiments           | Ranked held-item/move swaps, Rare Candy and cap-limited vitamins; highlighted pixel answers, immediate reranking and saved evidence                 |
| 5: Encounter RNG search           | Emerald wild H1/H2/H4 and ordinary static/starter/gift Method 1/4 searches implemented; special generators remain deferred      |
| New-game SID and Dewford filters  | Implemented; exact candidate intersections, surviving advance rows and ranked phrase tests; timing assumptions remain experimental |
| 6: Advanced recovery and polish   | Partial: joint field/byte domains, conditional exact export, prediction overlays, mobile layout and documentation                  |

Controlled move swaps, Rare Candy checkpoints and cap-limited vitamin uses are available alongside held-item tests. Battle EV training, berries and arbitrary PP-use experiments remain deferred. Recommendations require shared observable positions for their affected blocks. Their benefit concerns shared identity/key uncertainty, not direct recovery of unrelated plaintext.

Wild RNG searches use inclusive advance bounds, with at most 1,000,000 advances per run. Advance 0 means the supplied seed before the encounter-slot call (before the encounter-rate check for Rock Smash). Advances count RNG calls, not seconds. Ordinary grass/cave, surf, fishing and Rock Smash tables are included, with no generation lead effect, Synchronize, Cute Charm or Pressure/Hustle/Vital Spirit. Use the species and lead as they were at capture. Safari Pokéblocks, Route 119 Feebas fishing, Static/Magnet Pull and Intimidate/Keen Eye extra-call behavior are outside this search. All results are conditional on the selected settings; broad searches preserve multiple matches rather than choosing the first. Settings and pending tests round-trip through JSON/autosave. See [wild RNG validation](research/WILD_RNG.md).

Obtaining categories include Wild, Static (fixed encounters, starters and ordinary gifts), Egg/hatched, in-game trade, event/Mystery Gift, received from another Gen 3 game, and unknown. Old Starter/Gift investigations migrate into Static without changing evidence. All categories can use the generic stored-data solver; Wild and Static additionally support their respective seed/advance searches. Special gifts, events, trades, roamers and breeding require other generation models. Without encounter RNG, joint SID enumeration accepts at most 32 inferred PIDs; broader sets are not silently truncated.

## What the mathematics establishes

The 80-byte BoxPokemon has a 32-byte unencrypted header and four 12-byte secure blocks. Their order depends on `PID % 24`. Each secure word uses the repeating XOR key:

```text
OTID = (SID << 16) | TID
KEY  = PID XOR OTID
ciphertext nibble = plaintext nibble XOR key nibble
```

Transparent establishes ciphertext **0**. Black establishes **1–F**, not an exact digit. Therefore transparent means the key digit equals the known plaintext digit, and black means it differs. **Known nonzero plaintext is as useful as zero plaintext.** An unreadable pixel remains unconstrained.

SID enumeration applies every supported fact: species, held item, experience, friendship, moves/PP, PP Ups, EVs, contest/Sheen, Pokérus, IV bits, ability selection, origins/met data, ribbon/flag bits and independently supplied reserved/header fields. Ability constrains the stored selection bit; generic inference does not impose PID parity. Nature and gender use Gen 3 rules.

Every candidate must satisfy all snapshot-specific plaintext and ciphertext constraints, the unencrypted SID header and a compatible 16-bit checksum. Partial-payload checksum compatibility uses exact digit-sum/carry propagation without enumerating every unknown byte combination. Each changed item has its own snapshot checksum. Ciphertext at matching offsets is not intersected across changed snapshots.

Counts are conditional on supplied facts, assumptions and the supported stored-data model, and do not certify encounter legality or timing. The stat calculator promotes only exact IVs you explicitly apply; unresolved ranges are not supplied as exact facts. The encounter RNG search also filters generated PID/IV tuples against summary stats and retains their correlations automatically. Broader PID counts in the legacy advanced view refer to the **active observation**. Joint results include every recorded snapshot and are separately labeled.

**Known**, **Derived**, **Assumed** and **Unknown** remain distinct. Field/byte domains can be correlated; non-exact counts are upper bounds. The compact completeness percentage counts exact stored bytes out of 80, including the unencrypted header. Exact `.ek3`/hex export requires all 80 bytes to be uniquely established under active constraints and the decrypted checksum to validate. Reserved bytes and black nonzero digits are never guessed. Results using assumptions remain conditional on those assumptions.

The user reported a separately verified complete Illumise reconstruction with sufficiently informative facts, including known SID. That fixture is **not present in this checkout**, so this release cannot reproduce that particular experiment. Full-record synthetic tests and blind unknown-SID tests are separate validation goals. Full recovery is possible under informative conditions; it is not guaranteed from one screenshot.

**Reported Nincada case:** the contributor recovered SID after three Dewford phrase tests on a new save. Replaying the supplied JSON leaves SID **33789**, PID **0x97507B58**, and one H2 spread at advance 900 under the selected settings. Assuming nickname **NINCADA** and normal wild storage produces **79/80 exact bytes** and checksum **0x15D1**. Byte `0x10`, after the nickname terminator, still has **225 possible values**: both observed nibbles are nonzero, and the secure-data checksum does not cover nickname memory. Exact export stays blocked. This reproduces the supplied evidence and assumptions; no original `.ek3` was supplied for independent verification. See [case details and source explanation](research/ENTRY_DEFAULTS.md).

## Preserved advanced tools

Open **About → Open classic workspace and full research notes** for the complete previous editor and research UI, sharing the same investigation. The compact desktop layout scrolls only its left panel; on narrow mobile screens the panels stack.

- **Curtain Editor → Render .ek3** retains file input, drag/drop and the live hex editor. Exactly 80 encrypted bytes are required. A 100-byte party export needs explicit conversion; decrypted `.pk3` is not encrypted evidence.
- Imported candidates stay separate from observed pixels and known facts. Importing a reference never fills the solver.
- **Data Recovery** retains encrypted hex constraints, PID possibilities, hypothesis checking, IV analysis, plaintext interpretation and candidate comparisons. Use the new findings section for joint snapshot results.
- **About → Research examples** retains DOTS Seedot, Skarmory and Latios. Backup/restore preserves the complete prior investigation in memory. Save JSON for a permanent copy.
- DOTS with summary-visible male gender and Early Bird establishes PID 132. The original saved fixture leaves five PIDs without those traits. Skarmory's HP IV 31 checkpoint leaves 20 PIDs; the earlier checkpoint leaves 41. Latios is an **illegal test record**, retained for rendering/constraint consistency, not legality claims.
- Neighbor imports, raw/annotated tiles, PNG export, painting history and the full 192-nibble window remain available. Hiding neighbor rows never assumes zero bytes.

## Research status

**About now contains a substantial technical research article**, shared by the compact and classic workspaces: historical credits, graphics overread, an interactive byte/pixel address diagram and XOR examples, known plaintext, wild PID/IV recovery, the TID-seeded new-game SID filter, controlled experiments and exact-export limits. Source references are pinned to the extraction revision. See the [About claim audit](research/ABOUT_RESEARCH.md) for verified, contributor-reported and proposed findings. Multi-Pokémon SID aggregation is described as future workflow; existing snapshots belong to one Pokémon.

Existing independent DOTS and Latios English Emerald mGBA captures match **768/768 displayed pixel appearances each**. They validate those configurations, not every language or runtime. All 192 unique nibbles occur in the static layout; sprites and menus may obscure them.

The **Poochyena zero-PID report has been reproduced and diagnosed** using the subsequently supplied JSON and checksum-valid `.ek3`. Its saved origin was Ruby (2), while the record says Emerald (3); 158/160 pixels match and two disagree. All other entered stored facts and all six summary stats match the reference. The review copy fixes the game and clears those two pixels to **unknown**, preserving independent evidence. It leaves 1,012,489 PID possibilities and retains the reference's true PID. This is not blind PID recovery. See [the case report and review file](research/POOCHYENA_CASE.md). Earlier John GBA RNG timing and markings-refresh questions remain unresolved; no speculative PID is hardcoded.

Diagnostics identify failed header/secure byte nibbles and checksum incompatibility. Recheck drawings, summary facts, refresh on school reentry, and timing/generation assumptions independently. Fifteen seconds is not asserted to equal 900 RNG advances. See [investigator research](research/INVESTIGATOR.md).

## Run and verify locally

Use Node.js 24, matching the CI workflow:

```sh
npm ci
npm run check
npm run dev
```

Open Vite's printed URL, normally `http://127.0.0.1:5187/`. On Windows PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`. `npm run check` runs all tests and the TypeScript/production build. `npm run preview` serves `dist/`.

The latest validated code has **166 passing tests** plus a successful TypeScript/Vite build. Coverage includes emulator/rendering regressions, independent all-SID comparisons over all 24 permutations, partial packed facts/checksums, ambiguous PID/SID sets, original-baseline experiments, wild RNG vectors, new-game SID windows/duplicates, Dewford generation and ranked outcomes, legacy JSON, defaults, both Egg bits and nickname trailing-memory ambiguity. Genuine fixture SIDs must survive blind investigations without injecting hidden fixture truth. Details: [validation history](research/VALIDATION.md).

VS Code's build task and Go Live port 5510 still serve the compiled app. Rebuild after edits; use Vite for automatic source updates.

## Publish and package

The existing GitHub Pages workflow installs from the lockfile, runs tests and builds before deployment. Use `main` or adjust `.github/workflows/pages.yml`; choose **GitHub Actions** in Pages settings. Relative assets support the existing repository path. See [Vite's Pages guide](https://vite.dev/guide/static-deploy.html#github-pages).

`npm run package:source` retains `release/emerald-curtain-calculator-source.zip` for compatibility. It includes source, dotfiles and fixtures; excludes dependencies, builds, private captures, ROMs and saves. Extract and commit the contents, including `.github/`.

The pinned pret checkout is needed only to regenerate catalogs, not to build:

```sh
node scripts/extract-investigation-data.mjs
```

This extracts real item IDs/holdability and growth rates from the same pinned source as the existing species catalog. Availability is never inferred solely from an ID; key/important items, Safari Balls, placeholders and Mail experiments are excluded.

## Sources and credits

Developed with AI assistance. Recovery is deterministic and local. No new emulator capture was produced for this implementation. Synthetic tests validate the supported mathematical model, not legality or gameplay reachability of arbitrary records.

Primary evidence: [pinned pret/pokeemerald](https://github.com/pret/pokeemerald/tree/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881), [BoxPokemon definitions](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h), [encryption/checksum/permutations](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c), and [item data](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/items.h). Capture evidence uses [mGBA](https://mgba.io/).

Historical [Bulbapedia](<https://bulbapedia.bulbagarden.net/wiki/List_of_overworld_glitches_(Generation_III)#Trainer's_School_window_tile_quirks>) and [Glitch City](https://nintyconservation.github.io/glitchcity.wiki/glitchcity.wiki/Black_curtains_glitch.html) research, including Chaos Rush, Metarkai and TheZZAZZGlitch, informed the investigation. This project does not claim discovery of the glitch. Wild generation is checked against [pret's source](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/wild_encounter.c) and numeric fixtures from [PokéFinder](https://github.com/Admiral-Fish/PokeFinder/tree/master/Core/Gen3/Generators). No PokéFinder implementation is bundled.

**Dewford/Feebas SID credits:** [maractite's established phrase method](https://www.reddit.com/r/pokemonrng/comments/16ei2ej/) and [retail worked example](https://www.reddit.com/r/u_maractite/comments/16dyods); [Pokémon RNG's Find SID with Feebas](https://www.pokemonrng.com/emerald-sid-feebas/), which credits **Lincoln, HappyLappy and Shao** for the [Python SID Finder](https://github.com/HappyLappy1/Lappy-Python-Scripts/tree/main/RSE_Trendy_Saying_2_SID); **mucksw's [Feebas Tile Calculator](https://mucksw.github.io/Feebas-Tile-Calculator/)**; and the related [Goppier/FindingFeebas](https://github.com/Goppier/FindingFeebas) and [yuhasem/FeebasFinder](https://github.com/yuhasem/FeebasFinder) research tools. The source model is implemented independently here and combined with curtain constraints. These credits concern related RNG research, not the independently verified curtain-memory mapping; no third-party tool implementation is bundled.

Further documentation: [mapping](research/RESEARCH.md), [validation](research/VALIDATION.md), [solver guide](research/SOLVER_GUIDE.md), [experiments](research/EXPERIMENTS.md), [summary stats](research/SUMMARY_STATS.md), [OT information](research/OT_INFORMATION.md), [trait constraints](research/TRAIT_STATS_CONSTRAINTS.md), [Skarmory](research/SKARMORY_CASE.md), [Whismur](research/WHISMUR_CHECK.md), [investigator model](research/INVESTIGATOR.md).

Today's feature references: [new-game SID RNG](research/SID_RNG.md), [Dewford phrase recovery](research/DEWFORD_SID.md), [wild PID/IV RNG](research/WILD_RNG.md), [entry defaults and Nincada completion limits](research/ENTRY_DEFAULTS.md), and [About article claim audit](research/ABOUT_RESEARCH.md).

Original code/documentation: MIT. Pokémon assets/names and third-party materials retain their rights; see [NOTICE.md](NOTICE.md). Not affiliated with Nintendo, Game Freak or Creatures.
