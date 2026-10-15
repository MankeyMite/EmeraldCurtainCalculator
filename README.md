# Emerald Curtain Calculator

Draw the Rustboro Trainer’s School curtain glitch in Pokémon Emerald and explore what it reveals about a boxed Pokémon. Or import an encrypted 80-byte `.ek3` to preview its curtain pattern.

Everything runs in your browser. No account, ROM, upload service or API key is required.

**Currently supports English Pokémon Emerald only.** Other language versions have not been validated. Their storage positions and exact byte-to-pixel mapping may differ; changing the box position alone is not confirmed to make this tool compatible.

## Use the calculator

1. In English Emerald, place the Pokémon in **Box 8, slot 5**, keep **slots 4 and 6 empty**, then enter Rustboro Trainer’s School.
2. On **Curtain**, draw the black pixels. Mirrored edges update together; click a black pixel again to erase it.
3. Add known species, nature, Pokémon gender, ability, current EXP, PID and original trainer name/gender/TID/SID on the left. Open **EVs, IVs & contest stats** for more facts. Review the newly caught defaults: exact results are conditional on all supplied values being true.
4. Choose **Calculate Pokémon data**. The remaining displayed cells become observed transparent pixels, and **Reconstruction** opens. This assumes you finished reproducing the visible pattern.
5. Use **Save drawing** to keep observations and facts as JSON. They stay separate from imported candidates.

Recheck any obscured or uncertain pixels in-game before completing the drawing. Unfinished cells remain unknown internally until you choose **Calculate Pokémon data**. If the result conflicts with known information, compare your drawing and inputs with the game and correct any mistakes.

**New workspaces assume a newly caught Pokémon:** EVs, all five contest conditions and Sheen, PP Up counters, ribbon bits, Pokérus and markings start at **0**; Is Egg starts at **No**. Defaulted inputs are tinted and labeled as assumptions. Use **Clear defaults** to remove only those assumptions, or **Clear all information** for an unrestricted workspace. Blank always means unknown. IVs, held item and friendship stay blank. Unused ribbon bits, fateful encounter, experience, met data and padding are never invented as zero. Loading an older drawing preserves exactly its saved facts, without adding defaults.

### Explore the research examples

Open **About → Research examples** to load **DOTS Seedot**, **Skarmory**, or **Latios (illegal test record)**. Each example loads saved observations and known facts, with the matching encrypted record loaded separately for candidate comparison. DOTS also includes its known male gender and Early Bird ability. It opens the Curtain tab; open Reconstruction to see the remaining possibilities.

DOTS includes the summary-visible male gender and Early Bird ability, establishing exactly one PID: **132 (0x00000084)** under the supplied facts, without entering a PID or SID. The original saved fixture remains unchanged and leaves five PIDs without those two traits. The Skarmory checkpoint includes the established HP IV 31 and leaves 20 PIDs; clear its HP IV to see 41 and inspect the IV calculator to reproduce the deduction. Latios leaves 5,703 and is retained as a rendering/constraint test, without legality claims. Hidden Skarmory neighboring bytes remain unknown.

**Restore previous workspace** brings back your drawing, known inputs, candidates and painting history from before the first example was loaded, even if you switch between examples. This backup lasts only while the page stays open. Use **Save drawing** for a permanent JSON copy. The synthetic record and nibble-ordering tests remain under **Synthetic test patterns**.

### Test a suspected PID or other values

The **Data reconstruction** section shows the encrypted hex first. **PID possibilities** then puts the count beside one editable PID input. When 100 or fewer remain, choose a listed PID or use the input’s suggestions; otherwise type any PID. The fixed-digit pattern below uses numeric PID order, highest digit first. `?` means that position is not uniquely determined. **Check values** tests typed values; clicking a listed PID checks it immediately. **Other trial values** supports nature, original trainer TID/SID, species and individual EVs. All filled trial fields are tested together alongside the drawing and known information.

- **Impossible under current constraints** rules out that combination, conditional on the drawing and known facts being correct. Direct pixel conflicts identify the byte and nibble.
- **Possible under current constraints** means the model has at least one compatible solution. It does not identify the Pokémon or prove that a particular RNG method can produce it.

Trial values do not change your known facts, reconstructed hex or saved observations. Leave the **known PID** blank when comparing alternative PIDs. The checker also applies all active known gender, ability, IV and condition inputs. Checksum, legality and RNG generation methods are outside its model.

### Use summary stats to narrow IVs

Under **Known Pokémon information → IV calculator · summary stats**, enter the current level and ordinary summary-screen stats. Enter **maximum HP**, not remaining HP. Supply species, nature and each relevant EV (the newly caught preset supplies zero EVs). Reconstruction’s **IV ranges** table compares the stat-only ranges with the curtain-derived ranges and their intersection. Unknown EVs stay unknown; stats, IVs and EXP never default to zero.

If one IV value survives, **Use exact IVs in reconstruction** adds that value to known information. Unresolved ranges remain upper bounds and are not searched jointly or included in PID/candidate counts until you supply exact IV facts. Incorrect summary values can cause conflicts. Summary observations are saved separately in JSON, without copying candidate data. See [summary-stat calculation](research/SUMMARY_STATS.md).

**Render .ek3** supports file selection, drag-and-drop and a live hexadecimal editor. Exactly 80 encrypted bytes are required. A 100-byte party export must be explicitly converted to its 80-byte boxed record first. Importing a candidate never fills the solver’s observations.

The default view is one window at 20× zoom, with a black grid and see-through unpainted cells. The first editable row begins at PID byte 0. Neighboring rows are hidden; missing neighboring bytes stay unknown. Raw tiles, annotations and neighboring-slot imports are available under the additional controls.

## Run locally

Install **Node.js 24 LTS**, then run:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5187/`; it chooses another port if busy). On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`.

```sh
npm test            # Parsers, graphics, capture evidence, solver and UI contracts
npm run build      # TypeScript check and static production build
npm run preview    # Preview dist/ locally
npm run check      # Tests and build
```

No decompilation checkout is needed to run, test or build the application.

### VS Code Go Live

Open this project folder in VS Code with the **Live Server** extension installed. Run **Terminal → Run Build Task** (`Ctrl+Shift+B`), then click **Go Live** in the status bar. Workspace settings serve the compiled `dist/` app at `http://127.0.0.1:5510/`, avoiding the default port 5500.

Go Live serves the latest build. After source changes, run the build task again. For automatic source updates during development, use `npm run dev` instead. The source `index.html` requires Vite’s TypeScript/React compilation and cannot be served directly as a static app.

## Publish on GitHub Pages

1. Create a GitHub repository and upload/commit this source, including dotfiles and `.github/`.
2. Use `main` as the default branch, or adjust `.github/workflows/pages.yml` to your branch name.
3. In **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
4. Run **Deploy GitHub Pages** from Actions, or push to `main`.

The workflow installs from the lockfile, runs tests and builds before deploying `dist/`. Relative asset URLs support repository paths without hard-coding a repository name. No secrets are needed. See the [Vite Pages guide](https://vite.dev/guide/static-deploy.html#github-pages).

### Source ZIP

```sh
npm run package:source
```

This creates `release/emerald-curtain-calculator-source.zip`. Extract it and commit its **contents**, including `.github/` and dotfiles. The ZIP includes source, the lockfile, workflows, documentation and regression fixtures. It excludes dependencies, builds, local ROMs/saves, private captures, local backups and handoff notes. GitHub’s web uploader may omit hidden files; a Git client is the most reliable way to include the workflow files.

## Accuracy and limitations

A transparent pixel establishes nibble **0**. Black permits **1–F**, not a particular digit or individual set bit. Unknown permits **0–F**. Completing a drawing is an explicit assertion that its remaining displayed pixels were transparent.

OT name constrains the unencrypted name field using Gen 3 text encoding; capitalization matters and bytes after its terminator stay unknown. OT gender constrains its encrypted origins bit independently of Pokémon gender. See [original trainer information](research/OT_INFORMATION.md) for encoding and source evidence.

The engine combines observed nibbles, gender thresholds, species/stat/condition bit constraints, the stored ability flag, XOR encryption and PID-dependent substructure order. Ability does not automatically impose PID parity. It computes exact remaining PID/header counts and guaranteed byte domains without an exhaustive search of Pokémon records. Bounds are labeled **≤**. Checksum inference, legality filters, EV totals, automatic level-from-EXP inference and inferred names are not applied. Supplied level and summary stats are used by the separate IV calculator. Candidate consistency does not establish identity. See [trait/stat constraints](research/TRAIT_STATS_CONSTRAINTS.md) for source evidence and bit mapping.

The pixel inspector names encrypted fields only when the active model has an exact PID (or the rendered record supplies it). Candidate bytes are labeled separately and are never used as recovered solver data.

## Development and validation

Developed with AI assistance. Mapping and solver behavior are checked through source analysis, emulator captures and automated tests. Calculations run locally using deterministic code.

The renderer matches every checked curtain pixel in the independent DOTS and Latios English Emerald captures (768/768 appearances per capture). These checks validate the tested configurations; other language ROMs and untested runtime configurations require separate verification. Exact solver results remain conditional on accurate drawings and supplied facts. See the [source derivation](research/RESEARCH.md), [validation record](research/VALIDATION.md) and [automated tests](tests/).

**Test-record provenance:** DOTS is an in-game trade, and the supplied Skarmory is user-created and described by its contributor as legal. The contributor has confirmed that the Latios fixture is illegal. It is retained to check byte-to-pixel rendering and constraint consistency, not as an example of a legally obtainable Pokémon. The renderer reads stored bytes regardless of legality; these tests do not certify legality or validate encounter-specific RNG relationships.

## Mapping evidence

The pinned [pret/pokeemerald source](https://github.com/pret/pokeemerald/tree/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881) establishes tiles 791–793, palette 8, tile flipping and school placement. The leaked region contains slot 4’s last 8 bytes, slot 5’s 80 bytes and slot 6’s first 8 bytes.

Independent English Emerald mGBA 0.10.3 captures verify 96/96 bytes and 768/768 displayed pixels. All 192 unique nibbles appear in the static school layout; temporary sprite/menu occlusion must be left unknown. Absolute storage addresses can relocate. Other ROM/runtime configurations require validation.

- [Source derivation](research/RESEARCH.md)
- [Recorded validation](research/VALIDATION.md)
- [Solver guide](research/SOLVER_GUIDE.md)
- [Experiments](research/EXPERIMENTS.md)
- [Whismur byte-position regression](research/WHISMUR_CHECK.md)
- [User-painted Skarmory regression and controlled-change study](research/SKARMORY_CASE.md)

## Project structure

| Location                        | Purpose                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `src/core/`                     | File parsing, memory/tile mapping, constraints, inference and field inspection |
| `src/hooks/useCurtainLab.ts`    | Shared workspace state, history, imports and exports                           |
| `src/components/`               | Painting grid, input forms, inspector and reconstruction views                 |
| `src/App.tsx`, `src/styles.css` | Light interface and tab layout                                                 |
| `src/data/`                     | Extracted mapping, background and species catalog                              |
| `tests/`, `research/fixtures/`  | Automated checks and minimal reproducible evidence                             |
| `scripts/`                      | Source extraction, capture validation and release packaging                    |
| `.github/workflows/`            | CI checks and GitHub Pages deployment                                          |

## Credits and license

Technical mapping and validation use [pret/pokeemerald](https://github.com/pret/pokeemerald) and [mGBA](https://mgba.io/). Background information and historical storage-slot/memory-region reports were informed by [Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/List_of_overworld_glitches_(Generation_III)#Trainer's_School_window_tile_quirks) and [earlier Glitch City research](https://nintyconservation.github.io/glitchcity.wiki/glitchcity.wiki/Black_curtains_glitch.html). This project builds on that work; it does not claim discovery of the original glitch.

Original application code is MIT licensed; see [LICENSE](LICENSE). Extracted Pokémon artwork and other third-party material are outside that license; see [NOTICE.md](NOTICE.md). This is an independent research project.
