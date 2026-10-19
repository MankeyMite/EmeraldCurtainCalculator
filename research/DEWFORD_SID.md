# Dewford trendy phrases and SID recovery

## Finding and implementation

This is an established community method, not a new discovery by this project.
[maractite's 2023 explanation](https://www.reddit.com/r/pokemonrng/comments/16ei2ej/)
and [retail worked example](https://www.reddit.com/r/u_maractite/comments/16dyods)
describe using initial phrases and first-submission tests to recover SID.
[Goppier/FindingFeebas](https://github.com/Goppier/FindingFeebas) and
[yuhasem/FeebasFinder](https://github.com/yuhasem/FeebasFinder) are additional
research references. This project implements the source model independently;
no third-party tool implementation was copied.

The optional panel is in **Investigate → SID Finder** and **Data Recovery**.
It uses the existing original-trainer TID and new-game SID call window. Enabling
it intersects actual phrase-compatible RNG outputs with existing stored-data,
curtain, checksum and supported wild-PID/IV hypotheses. It never multiplies
candidate counts to estimate an intersection, or requires a made-up PID.

## Verified source behavior

Checked against pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`:

- [new_game.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/new_game.c)
  calls `InitPlayerTrainerId` before `InitDewfordTrend`.
- [dewford_trend.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/dewford_trend.c)
  generates five phrases. Each consumes 7–9 RNG calls: Conditions word,
  Lifestyle/Hobbies branch, second word, gaining flag, 1–3 maximum-trendiness
  draws, current trendiness, then a 16-bit random value used for Feebas.
- [easy_chat.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/easy_chat.c)
  selects by `Random() % numWords`, in numeric index order, not alphabetical
  display order. Counts are 69 Conditions, 45 Lifestyle and 54 Hobbies.
  `scripts/extract-dewford-words.mjs` extracts actual English strings and IDs
  from the pinned constants and group declarations, including multiword segments.
- Daily updates change scores/order without creating a new phrase. We check
  membership of all five; we do not require the observed phrase to be the
  initially highest-ranked one. This avoids assuming a dead battery or an exact
  day count. Initial sorting and random tie-breaks occur after all five are
  generated and cannot change their membership.
- `TrySetTrendyPhrase` first checks whether the phrase already exists. An
  existing phrase is rejected. If it is new, the change flag is still clear,
  and records have not been mixed, the first successful submission is accepted
  without scoring and replaces the current words. Later submissions are scored
  and cannot be interpreted as simple membership tests.

## Timing assumptions, not a universal guarantee

The default uses **three intervening RNG calls** after SID, so the first phrase
word is generated at SID call + 4. This is the established community
calibration reproduced by the public example. It is not a claim that three
explicit `Random()` statements appear between the two functions in C.
Initialization takes time and `VBlankIntr` also consumes the main RNG.

Advanced bounds permit up to five gap choices within 0–12. These cover alternate
offsets _before_ phrase generation, not arbitrary interruptions inside the five
generation iterations. VBlank interruptions, patched ROM routines and other
unsupported histories may invalidate the model. Zero candidates means widen or
review the window/gap/facts, or disable Dewford evidence, not that the SID is
impossible. This is labeled experimental here because no new instrumented
emulator or console capture was produced.

The SID window defaults to calls 1–3,600 and is limited to 100,000 calls while
the Dewford filter is active to keep synchronous generation bounded. Regular
timing-only searches retain their existing 1,000,000-call limit. Duplicate SID
outputs retain every compatible SID-generating call, rather than treating one
SID as one unique initialization state.

## First-submission test protocol

Only use this protocol if the save has **never successfully changed a phrase
and never mixed records**. Select that history explicitly in the panel.

1. Read the current phrase from the boy outside Dewford Hall and enter its two
   segments. Apply the original-phrase filter.
2. Keep a baseline save from before any successful submission or record mixing.
3. Choose a ranked phrase. In-game, answer No to the boy's question about the
   current trend and submit the exact suggested words.
4. Answer the calculator's separate question: **Did he accept this phrase as
   the new trend?** Accepted means absent from the initial five; rejected means
   present under the first-submission conditions.
5. Reset without saving and reload the same baseline **before every next test**.
   Do not overwrite that save. Restoring after rejection as well makes the
   protocol consistent.

A pending phrase is excluded until an answer is recorded. Answers are saved
separately from Pokémon observations and do not repaint the curtain. Remove an
answer to correct it. Disabling Dewford evidence retains its answers and pending
test; re-enabling with the same original phrase restores them. All metadata
round-trips through investigation JSON/autosave as optional `sidRng.dewford`.
Changing the original phrase deliberately starts a new phrase-evidence set.
Turning off the entire existing SID RNG filter removes that optional search
scope; save JSON first if retaining the complete configuration is important.

Ranked tests count actual distinct surviving SIDs for each accepted/rejected
outcome. Multiple initialization advances may generate the same SID with
different five-phrase sets; that SID may correctly appear in _both_ outcome
sets. Rankings minimize worst-case SID survivors, then total branch survivors.
They do not claim disjoint partitions or an exact probability model. A completed
test that no longer separates SIDs is not recommended again.

## Independent regression and its limits

The public maractite example supplies TID **63171**, current phrase
**TOGETHER · MOVIE**, a rejected **APPROVED · FLOWERS**, an accepted
**WEIRD · MONEY**, and independently reported SID **55567**.

Our model, searching SID calls 100–2,000 without supplying SID, leaves **7**
distinct SIDs from the current phrase and **1** after those two test outcomes.
It reproduces all five reported phrases and their associated random/Feebas
values, including the variable 7/8/9-call generation lengths.

The publication uses zero-based RNG output indexes: reported SID advance 830
is **call 831** in this calculator, whose first post-seed output is call 1.
Reported first phrase index 834 is call 835 here. This convention difference
must not be “fixed” by shifting the actual RNG or changing the TID seed.
Numeric attribution is retained in `fixtures/dewford-maractite.json`.

`tests/dewford.test.ts` checks source word counts/IDs, a separate BigInt oracle,
the published five-phrase vector and SID result, boundaries and wrong gaps,
pending/recorded answers, overlapping SID outcome sets, disable/restore,
JSON round trips and actual curtain/SID intersection. Its curtain-integration
test uses synthetic trend observations combined with the Poochyena record; it
does not claim those were the original Dewford phrases of that save.

A single surviving SID is conditional on the history, timing and source-model
assumptions. Validate it independently with another Pokémon/curtain observation,
an independently established shiny result, or a save reader during research.
No universal success rate is asserted and no user-specific new result is claimed.

## Related Feebas SID tool credits

The About acknowledgements also link [Pok?mon RNG?s Find SID with Feebas](https://www.pokemonrng.com/emerald-sid-feebas/). Its credits name Lincoln, HappyLappy and Shao for the [Python SID Finder](https://github.com/HappyLappy1/Lappy-Python-Scripts/tree/main/RSE_Trendy_Saying_2_SID), and mucksw for the [Feebas Tile Calculator](https://mucksw.github.io/Feebas-Tile-Calculator/). These are related research/tool references, not credits for this project?s curtain-memory mapping or claims of copied implementations.
