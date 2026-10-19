# Poochyena input-conflict regression

The user supplied `curtain-investigation.json` and `poochyena test.ek3` for comparison. Original copies are retained as `fixtures/poochyena-user-investigation.json` and `fixtures/poochyena-test.ek3`. Their Downloads files were not modified. These files are evidence, not instructions.

The encrypted record is exactly 80 bytes. Stored and recomputed decrypted checksums both equal **3460 (0x0D84)**. Its stored PID is **2384797520 (0x8E251F50)** and SID **37399**. These are decoded reference values, **not blind recovery results**, and are not injected into the review session's known facts.

Saved facts match Poochyena, female, Calm, Run Away, OT Mankey/male, TID 40492, Route 101 (16), met level 3, Poké Ball (4), EXP 27, friendship 71, Tackle (33) with 35 PP, empty other moves/PP, zero EVs/contest/Sheen/ribbons/PP Ups/Pokérus/markings and not an Egg. All six level-3 stats agree: HP/Atk/Def/Speed/SpA/SpD = 15/7/8/7/7/7.

| Input                                  | Saved investigation | Encrypted reference |
| -------------------------------------- | ------------------- | ------------------- |
| Origin game                            | Ruby, ID 2          | Emerald, ID 3       |
| Pixel 122, record byte 0x35 low nibble | Transparent         | Black               |
| Pixel 130, record byte 0x39 low nibble | Black               | Transparent         |

**158/160 pixels match.** On the default left curtain strip, both discrepancies are column 3, rows 14 and 15 counting from the first editable PID row. Mirrored appearances are column 6 of the right strip. The saved zero looks one row above the reference zero, but without the original screenshot this comparison cannot distinguish a painting mistake from a different in-game snapshot.

The solver correctly returns **0 PIDs for the original inputs**. No PID/XOR arithmetic defect is demonstrated here. The numeric-only origin field made it easy to mix up Emerald→3 and English→2; named inputs now distinguish them.

## Review without circular evidence

[Review JSON](fixtures/poochyena-review-investigation.json) corrects the game from the supplied reference and sets both disputed pixels to **unknown (-1)**. It adds orange targets and explanatory notes. It does not copy predicted pixels, PID, SID or IVs into evidence. All other facts/observations remain unchanged.

The review leaves **1,012,489 PID possibilities**, including the reference PID. Supplying the reference PID solely for a separate validation leaves **4,394 compatible SIDs**, including the actual SID. Neither result implies unique recovery.

Load the review, independently check both orange targets in game, and report Black/Transparent/Cannot determine. Keep unreadable pixels unknown. If the game still disagrees with the extracted record, preserve that drawing separately and investigate snapshot refresh rather than changing evidence to fit the model.

Regression tests reproduce the original rejection, discrepancy positions/directions, all other stored facts and six stat formulas, preserved original evidence, reference PID/SID survival and non-leakage into the review. Reproduce with:

```sh
npx tsx scripts/diagnose-investigation.ts research/fixtures/poochyena-user-investigation.json research/fixtures/poochyena-test.ek3
npx tsx scripts/poochyena-review.ts
```

## Bounded wild RNG follow-up

The later H1/H2/H4 search derives PID **2384797520** and IVs **2 / 1 / 30 / 4 / 22 / 13** from the reviewed inputs without supplying either. Seed **0**, advances **0–99,999**, Route 101 grass and no generation lead effect leave a single spread: **H2, advance 603**. A broader range through 999,999 preserves a second compatible spread. See [WILD_RNG.md](WILD_RNG.md) for the model, independent tests and limits. This does not repair the original contradictory pixels or establish a fixed seconds-to-advances conversion. The historical markings-refresh question remains unresolved.

Primary sources: [game/language constants](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/constants/global.h), [stored structure](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h).
