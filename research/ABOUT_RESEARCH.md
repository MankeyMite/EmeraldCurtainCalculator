# About article: claim audit and editorial scope

Updated 2026-10-19. The substantial article is implemented directly in
`src/components/ResearchArticle.tsx`, shared by compact and classic About views.
`ResearchDiagrams.tsx` provides isolated educational examples; those controls
never change investigation facts, drawings or RNG settings. Existing usage
instructions, examples, synthetic previews, privacy information and research
documents are retained.

## Sources checked

The local pret checkout and linked source references use commit
`731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`.

- `src/data/tilesets/graphics.h`: school declaration specifies 278 tiles.
- `src/fieldmap.c`, `include/fieldmap.h`, `src/menu.c`: 512 secondary tiles
  transferred while allocation follows decompressed payload size; 4bpp tiles
  occupy 32 bytes. `src/load_save.c` explains storage copies in the heap.
- `include/pokemon.h`, `src/pokemon.c`: 80-byte BoxPokemon, 32-byte header,
  four 12-byte blocks, PID-dependent ordering, XOR and checksum.
- `src/naming_screen.c`: player naming exit invokes the trainer-ID seed.
- `src/main.c`: timer value becomes both TID and initial seed; ordinary VBlank
  consumes the main RNG. The RTC seed is BUGFIX-guarded in stock Emerald.
- `src/random.c`, `include/random.h`: unsigned LCRNG and upper-half output;
  Random2 uses separate state.
- `src/main_menu.c`, `src/overworld.c`, `src/new_game.c`: inspected ordinary
  post-naming path reaches InitPlayerTrainerId without another main-RNG reseed.
  SID is created before later map/truck setup, not when visible control begins.
- `src/wild_encounter.c`, `src/pokemon.c`, implementation and numeric vector
  tests: supported H1/H2/H4 generation and limitations documented in WILD_RNG.md.

Historical attribution was checked against the preserved [Glitch City
article](https://nintyconservation.github.io/glitchcity.wiki/glitchcity.wiki/Black_curtains_glitch.html).
It credits Chaos Rush (2008), VaePomegGlitch, Metarkai (spelled Metarkrai in its
credits), TheZZAZZGlitch and ChickasaurusGL. Earlier memory-address descriptions
are not substituted for the independently captured modern heap-upload analysis.
Trainer-ID RNG itself is not claimed as a first discovery by this project.

## Evidence boundaries

| Claim                                                | Evidence / qualification                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| English slots 4/5/6 expose 8/80/8 bytes              | RESEARCH.md, retained DOTS/Latios captures, capture.test.ts; other languages unvalidated                                                  |
| 96 bytes / 192 distinct nibbles / 768 appearances    | Two retained English captures each match; repeats are not independent evidence                                                            |
| XOR/key/known plaintext and checksum solving         | Existing all-permutation, partial-bit, checksum, snapshot and original-byte tests                                                         |
| Complete Illumise reconstruction                     | Contributor reports independent original-record comparison, including known SID; fixture absent, not reproduced here                      |
| Approximately 11-second introduction                 | Contributor report only; no retained timing trace; 660 frames is not an exact call index                                                  |
| TID-seeded SID generation                            | Source-verified; tests check arithmetic, duplicates, inclusive bounds and actual intersections; no new gameplay trace                     |
| Poochyena PID/IV recovery                            | Reviewed inputs, seed 0, 0–99,999: unique PID/IV; broader windows retain alternatives                                                     |
| Poochyena SID intersection                           | Known-PID validation: 4,394 → 237, with 3,506 distinct RNG SIDs; correlated wild case: 144 → 9 hypotheses, not nine PID/IV spreads        |
| Multi-Pokémon SID algebra                            | Established XOR cancellation; no dedicated trainer-level aggregation UI or measured average catch count                                   |
| Controlled experiments                               | Items, move swaps, conditional Rare Candy and cap-limited vitamins implemented; battle EVs, berries and arbitrary PP-use ranking deferred |
| General single-catch blind SID / full record success | Ongoing research; no universal success rate or guaranteed outcome claimed                                                                 |

One investigation's snapshots share PID and other identity facts. Different
Pokémon must be investigated separately; comparing their resulting SID sets
is conceptually valid, but they must not be imported as mutable snapshots of
one Pokémon. Equal public TID alone does not establish the same original trainer.

All exact conclusions are conditional on supplied facts and assumptions.
Checksum validity, conditional uniqueness, independent verification and encounter
legality are distinct. Predictions are never independent observed evidence.

The record explorer uses the existing `describeByte` permutation handling.
For byte b, main-strip row is floor(b/4)+1; low/high columns are
2(b mod 4)+1 and +2 (one-based). It illustrates positions without invented bytes.
Nibble and XOR controls use direct arithmetic and conventional high-first hex
notation while showing low-first raw 4bpp display order.

See [SID RNG](SID_RNG.md), [wild RNG](WILD_RNG.md),
[investigator](INVESTIGATOR.md), [mapping](RESEARCH.md) and
[validation history](VALIDATION.md) for reproducible technical details.
AI-assisted development is explicitly acknowledged. No new emulator capture,
Illumise fixture or measured introduction timing was produced for this article.
