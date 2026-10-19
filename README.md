# Emerald Curtain Investigator

Formerly **Emerald Curtain Calculator**. Investigate hidden Generation 3 Pokémon data using the Rustboro Trainer School black curtains glitch: enter known information, draw what you see, narrow PID/SID and encrypted bytes, then choose useful held-item experiments.

[Open the application](https://mankeymite.github.io/EmeraldCurtainCalculator/) · [Recovery model and implementation status](research/INVESTIGATOR.md)

Everything runs locally in your browser. No ROM, account, API key or upload service is needed. This source update does not itself deploy the public website.

**Verified mapping: English Pokémon Emerald only.** Other language versions have not been validated. Pokémon received from other Gen 3 games can be investigated as stored records in English Emerald; their original generation method is not assumed to be Emerald's.

## Investigate a real Pokémon

1. Put the Pokémon in **Box 8, slot 5**. Preferably leave slots **4 and 6 empty**. Enter Rustboro Trainer School.
2. Use **Pokémon info** on the left to choose the species and obtaining method. The fixed right side shows one curtain strip, live Species/PID/IV/XOR/SID results, pixel inspector and grouped 80-byte encrypted record. The strip contains every main-record pixel; mirrored repeats are omitted.
3. Enter what you know from the Pokémon summary and original trainer information. Use **maximum HP**, not remaining HP. TID, SID and name refer to the **original trainer**. Another trainer's Pokémon cannot directly reveal your own SID.
4. For an untouched fresh catch, check **Assume freshly caught Pokémon** if appropriate. It fills zero EVs/contest data, standard flags, base friendship, no held item and full known move PP. Tinted values are assumptions; edit exceptions or uncheck to clear them. EXP, random IVs/PID and reserved bytes remain unknown. **View and edit remaining fields** opens additional inputs, including an optional known PID.
5. Paint actual black pixels on the curtain. Unmarked cells remain unknown until **Calculate** declares the remaining displayed cells transparent. Leave uncertain/obscured pixels unknown instead of completing a partial drawing. **Inspect** selects without painting; hover or pin a pixel or hex digit to highlight its counterpart and inspect allowed digits. Undo preserves the prior drawing.
6. For a **wild encounter**, use **Find PID and IVs from wild RNG**: enter seed (default **0**), minimum/maximum advances and the encounter area, then **Search and use matching spreads**. H1, H2 and H4 are searched together by default. Your known traits, summary stats and saved drawings filter the generated spreads; matching PID/IV correlations feed SID recovery and item ranking automatically. You do not need to supply a PID. Other origins retain the stored-data solver, which jointly enumerates up to 32 inferred PIDs. The original TID is needed for joint SID recovery in either mode.
7. Optionally enable **New-game SID RNG Filter** in Pokémon info, **Investigate → SID Finder**, or **Data Recovery**. It uses the entered public TID, defaults to approximately 60 seconds / calls 1–3,600, and accepts custom bounds. It intersects actual candidates with pixels and known facts while preserving possible PIDs. View SID/advance rows, Validate, widen or disable. See [verified source sequence and limitations](research/SID_RNG.md).
8. Click **Investigate** beside an unresolved value to open ranked experiments on the left. Choose an action you can perform: held-item swap, move swap, Rare Candy EXP checkpoint or vitamin EV change when supported by the known facts. No inventory checklist is required. Follow the instructions, return the Pokémon to the target slot and leave/reenter the school.
9. Answer **Did the pixels change compared with the original drawing?** **No** records the unchanged original pattern. **Yes** copies the original into an active test draft: edit differences, then **Save drawing & analyze test**. Saving keeps the test separately, recalculates candidates/rankings and restores the original drawing. Restore the original Pokémon state in-game too; consumable tests require a baseline save to reload. Do not overwrite that save.
10. The investigation, including unfinished tests and RNG settings, saves automatically on this device. **Save** downloads a separate JSON backup. **Load** accepts previous observation JSON too, without adding defaults.

Changing tabs preserves the investigation. New generic observations start with mutable fields unknown. New tests use the first original observation as their baseline; historical chained tests retain their saved comparisons. Drafts contribute no evidence until recorded. Controlled tests clear friendship/checksum; EXP/EV tests also clear stale summary stats. Review copied facts if anything else changed. Rename observations and record changes under **Notes and snapshot comparison**. Save JSON before removing an observation if you want to retain a copy.

Moves, met location, origin game, Ball, language and held item accept typed names with suggestions; a grey read-only box shows the stored ID automatically. Unknown and a known empty move slot are separate choices. New tests start with English Emerald, normal non-Egg header flags and four empty move slots; selecting a move fills its assumed maximum PP. A compact nickname field sits beneath Species and starts with the English species name. Manual nickname/PP changes are preserved; summary stats are marked Required for stat-based IV recovery. Existing imports acquire no new facts.

Technical reserved words are under **Advanced raw storage fields · filler and flags**: each is a two-byte internal field, not a summary-screen stat. Header reserved bytes are at 0x1E–0x1F; Growth filler is at logical Growth offsets 0x0A–0x0B. An optional **Use normal wild-catch storage defaults** preset assumes these and the unused/fateful bits are zero for an ordinary, unmodified Emerald wild catch. Those values remain labeled assumptions. Nickname text fixes characters through its terminator, not trailing memory. See [defaults and completion limits](research/ENTRY_DEFAULTS.md).

Dashed blue pixels predict black; dashed teal predicts transparent. Orange outlines identify experiment targets. **Predictions never enter the observed drawing or count as independent evidence.** Verify them in-game before recording an observation.

## Implementation status

**Dewford SID research:** Investigate → SID Finder / Data Recovery now includes an optional original-trendy-phrase filter and ranked phrase tests. Before any successful phrase change or record mixing, the first submission's accept/reject response tests membership in the initial five phrases; reload the same baseline save before every test. Actual SID sets intersect with curtain and supported wild-RNG evidence. The source model reproduces maractite's published retail example (TID 63171 → SID 55567), with timing/VBlank limitations explicitly marked experimental. See [Dewford protocol and validation](research/DEWFORD_SID.md). Disabling just the Dewford evidence retains its recorded answers for re-enabling.

**Dewford SID research:** Investigate → SID Finder / Data Recovery now includes an optional original-trendy-phrase filter and ranked phrase tests. Before any successful phrase change or record mixing, the first submission's accept/reject response tests membership in the initial five phrases; reload the same baseline save before every test. Actual SID sets intersect with curtain and supported wild-RNG evidence. The source model reproduces maractite's published retail example (TID 63171 → SID 55567), with timing/VBlank limitations explicitly marked experimental. See [Dewford protocol and validation](research/DEWFORD_SID.md). Disabling just the Dewford evidence retains its recorded answers for re-enabling.

| Phase                             | Status                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1: Rebranding and guided workflow | Implemented; 386 species, extensible obtaining categories and shared editor/recovery state                                    |
| 2: Known-PID/TID SID inference    | Implemented; all 65,536 SIDs, all four substructures, partial bit facts and checksum compatibility                            |
| 3: Multiple observations          | Implemented; immutable identity plus independent mutable snapshots; JSON and legacy imports                                   |
| 4: Adaptive experiments           | Ranked held-item/move swaps, Rare Candy and cap-limited vitamins; original-baseline Yes/No flow and saved evidence            |
| 5: Encounter RNG search           | Emerald wild H1/H2/H4 seed/advance search implemented; static, gift, event, breeding and special wild methods remain deferred |
| 6: Advanced recovery and polish   | Partial: joint field/byte domains, conditional exact export, prediction overlays, mobile layout and documentation             |

Controlled move swaps, Rare Candy checkpoints and cap-limited vitamin uses are available alongside held-item tests. Battle EV training, berries and arbitrary PP-use experiments remain deferred. Recommendations require shared observable positions for their affected blocks. Their benefit concerns shared identity/key uncertainty, not direct recovery of unrelated plaintext.

Wild RNG searches use inclusive advance bounds, with at most 1,000,000 advances per run. Advance 0 means the supplied seed before the encounter-slot call (before the encounter-rate check for Rock Smash). Advances count RNG calls, not seconds. Ordinary grass/cave, surf, fishing and Rock Smash tables are included, with no generation lead effect, Synchronize, Cute Charm or Pressure/Hustle/Vital Spirit. Use the species and lead as they were at capture. Safari Pokéblocks, Route 119 Feebas fishing, Static/Magnet Pull and Intimidate/Keen Eye extra-call behavior are outside this search. All results are conditional on the selected settings; broad searches preserve multiple matches rather than choosing the first. Settings and pending tests round-trip through JSON/autosave. See [wild RNG validation](research/WILD_RNG.md).

Obtaining categories include wild, static, starter, gift, Egg/hatched, in-game trade, event/Mystery Gift, received from another Gen 3 game, and unknown. All currently use the generic stored-data solver. The design was compared with the locally available Gen 3 ACE Pokémon Builder taxonomy; no unrelated application or RNG implementation was copied.

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

Counts are conditional on supplied facts, assumptions and the supported stored-data model, and do not certify encounter legality or timing. Unresolved summary-stat IV ranges remain in the existing IV calculator; only exact IVs you explicitly apply enter the solver. Broader PID counts in the legacy advanced view refer to the **active observation**. Joint results include every snapshot and are separately labeled.

**Known**, **Derived**, **Assumed** and **Unknown** remain distinct. Field/byte domains can be correlated; non-exact counts are upper bounds. The compact completeness percentage counts exact encrypted bytes out of 80. Exact `.ek3`/hex export requires all 80 bytes to be uniquely established under active constraints and the decrypted checksum to validate. Reserved bytes and black nonzero digits are never guessed. Results using assumptions remain conditional on those assumptions.

The user reported a separately verified complete Illumise reconstruction with sufficiently informative facts, including known SID. That fixture is **not present in this checkout**, so this release cannot reproduce that particular experiment. Full-record synthetic tests and blind unknown-SID tests are separate validation goals. Full recovery is possible under informative conditions; it is not guaranteed from one screenshot.

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

Use Node.js 24 LTS:

```sh
npm ci
npm run dev
npm run check
```

Open Vite's printed URL, normally `http://127.0.0.1:5187/`. On Windows PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`. `npm run check` runs all tests and the TypeScript/production build. `npm run preview` serves `dist/`.

Tests retain the existing emulator/rendering/reconstruction regressions and add independent all-SID comparisons over all 24 permutations, partial packed facts, exact/partial checksums, ambiguous PID/SID sets, item snapshots, recommendation predictions, full synthetic reconstruction, legacy imports and guided interface contracts. Genuine fixture SIDs must survive blind investigations without injecting hidden fixture truth.

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

Historical [Bulbapedia](<https://bulbapedia.bulbagarden.net/wiki/List_of_overworld_glitches_(Generation_III)#Trainer's_School_window_tile_quirks>) and [Glitch City](https://nintyconservation.github.io/glitchcity.wiki/glitchcity.wiki/Black_curtains_glitch.html) research informed the original investigation; this project does not claim discovery of the glitch. Future RNG work should be checked against [pret wild generation](https://github.com/pret/pokeemerald/blob/master/src/wild_encounter.c) and [PokéFinder's Gen 3 generators](https://github.com/Admiral-Fish/PokeFinder/tree/master/Core/Gen3/Generators). No PokéFinder code is bundled.

Further documentation: [mapping](research/RESEARCH.md), [validation](research/VALIDATION.md), [solver guide](research/SOLVER_GUIDE.md), [experiments](research/EXPERIMENTS.md), [summary stats](research/SUMMARY_STATS.md), [OT information](research/OT_INFORMATION.md), [trait constraints](research/TRAIT_STATS_CONSTRAINTS.md), [Skarmory](research/SKARMORY_CASE.md), [Whismur](research/WHISMUR_CHECK.md), [investigator model](research/INVESTIGATOR.md).

Original code/documentation: MIT. Pokémon assets/names and third-party materials retain their rights; see [NOTICE.md](NOTICE.md). Not affiliated with Nintendo, Game Freak or Creatures.
