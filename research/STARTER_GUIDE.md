# New Game SID Finder → Shiny Starter

The header's **Reset guide** starts again at Step 1, clearing this guide's
trainer, starter, route and curtain evidence while preserving timer settings.
The previous pair of guide saves is backed up locally; **Undo reset** on Step 1
restores it, including across reloads. Advanced investigations are separate.
Reset remounts the guide so active audio, workers and delayed saves are cancelled.

At the final step, **Try again** clears only the last attempt's observations and
returns to a ready timer. **Start next attempt** keeps the SID, selected target
and calibration. **Restart countdown** is also available during a running timer.
Every restart invalidates an earlier pending audio start to prevent stale cues.

The optional entry appears in About and SID Finder. It opens a six-step guide
without replacing the advanced investigator. Only the active screen is shown;
the longer starter and travel steps have timer/summary and travel/setup screens.

New guides default to 5 seconds for the first TID/SID countdown and 20 seconds
for the second, with ±60 RNG calls, an estimated 50-advance final-dialogue delay
and zero calibration. This searches advances 1185–1305 inclusively. Existing
saved timing settings are preserved; the separate starter timer is unchanged.

Guide metadata and its investigation use separate, versioned local-storage keys.
Returning to the advanced investigator preserves its original evidence. The latest
submitted summary retains its own exact EV snapshot. Later curtain checkpoints
retain earlier observations with their original mutable facts, rather than
reinterpreting them after training or changing a move or item.

Starting the starter timer clears the previous starter's notes at the first
reset cue, while keeping the public TID, SID timing window and protected-save
confirmation. Stopping before that cue preserves the current attempt. Submitting
a summary replaces the previous one; the guide has no stat-history dropdown or
accumulated stat checks. Loading older saved guide progress also keeps only its
latest summary. This repairs the earlier
behavior where corrections or different reset attempts were combined and could
incorrectly produce zero PID matches.

Summary inputs follow the English Emerald screen: level on its own row, then
HP / Sp. Attack, Attack / Sp. Defense, Defense / Speed. The underlying stat and
EV indices remain HP, Attack, Defense, Speed, Sp. Attack, Sp. Defense, preserving
saved data and the RNG/stat calculations.

Starter identification centers on the displayed estimated target:
`round(second countdown × GBA FPS) + delay + calibration`. It searches only
target ± radius, defaults to ±60 (about one second), and caps the radius at 100 advances even for
older saved settings. A target of 900 searches 800–1000 inclusively; it never
falls back to searching from zero. Smaller radii remain available. Delay and
calibration retain their signs. The target and exact bounds appear on both the
starter timer/entry screen and the Rustboro stat-check screen.

The starter UI now exposes only calibration: the separate confirmation-delay
control was redundant because both values were simply added. Legacy saved
starter delay and calibration display as one combined calibration value, and
editing it stores that total with zero legacy delay. The shiny-attempt manual
calibration uses the same total. Existing targets and countdowns are preserved.
The naming-to-SID final-dialogue delay remains a separate introductory setting.

Starter calibration defaults to **zero**, using the in-game **A+B+Start+Select**
soft reset on both console and emulator. At zero confirmation delay and zero
calibration, 15 seconds estimates advance 896, 20 seconds estimates 1195
(search 1135–1255), and 25 seconds estimates 1493. The same total calibration
feeds the inverse countdown for shiny targets. Any input-to-generation delay
is covered by the search uncertainty and subsequent measured calibration.

The former −254 default came from the user's mGBA **Ctrl+R** reset, which
replayed the Game Boy Advance BIOS intro. It is not an in-game soft-reset
correction. Version-3 saved timing removes that exact old default once and
preserves other explicit calibration values. The UI exclusively instructs
A+B+Start+Select. The separate SID-generation timer is unchanged.

An already identified starter keeps its saved advance, PID and IVs independently
of the timer's corrected prediction. Its RNG search is pinned to that advance,
so changing timer defaults cannot erase existing curtain evidence. The next
timed reset clears that identity and searches around the new clock target.

The default ±60-advance search allows about ±1 second of timing error once
centered for the setup. Regression checks use independent Method 1 tuples
60 advances early and late at 15, 20 and 25 seconds for all three starters.
The older fixed-20-second simulation giving 92 unique results out of 100 used
the former BIOS-reset calibration; its artifacts are historical and do not
establish the success rate at the corrected advance-1195 target. The beginner
screen asks players to reset until one spread matches. That spread survives
EV-aware stat updates and clears on a new timed attempt. Contradictory later
stats cannot silently switch to another PID. Advanced tools retain ambiguity.
Saved version-1 default radii of 100 upgrade to 60 once; custom radii and explicit
version-2/3 overrides remain intact.

Version 4 also upgrades a saved ±10-advance starter radius from earlier versions
to the intended ±60 default once. That saved value previously overrode both the
display and the actual search. Later explicit changes remain adjustable. At a
20-second uncalibrated target of 1195, the restored display and search both use
1135–1255. The separate SID-generation uncertainty is unchanged. The target readout
explicitly says that results outside the displayed range are excluded from the
RNG search.

Source review confirms that [main.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/main.c)
calls the RNG in VBlank, disables interrupts for reset and reinstalls them during
startup. In [starter_choose.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/starter_choose.c),
Yes switches to the saved callback; [battle_setup.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/battle_setup.c)
then generates the starter in CB2_GiveStarter. Timer estimates do not establish
an exact game RNG state. The [published starter procedure](https://www.pokemonrng.com/emerald-shiny-starter/)
uses the same final Yes cue and calibrates from the received starter.

The earlier start-at-zero filter was too broad and could suggest frame 396
alongside 980 despite a much later clock target. The narrower bounds are still
estimates, rather than proof of the actual game frame. If no spread fits, the
guide asks the player to check the stats/EVs or adjust calibration instead of
silently widening the search. Saved guided investigations refresh their RNG
scope without deleting pixels. The separate SID-creation window is unchanged.

All matching correlated PID/IV tuples remain possible during identification.
The beginner path asks for a reset when multiple PIDs match. Once a single
PID/IV spread is identified, the route uses those fixed IVs and the battle log
for EV changes; it does not ask for level-up stats again. Both
starter identification and the Rustboro stat-check screen show these results.
The existing route planner uses the updated spreads, EVs and SID candidates to
compare useful held-item, move and Defense/Speed EV setups. No frame is selected
merely because it falls closest to the timer's prediction.

The wizard labels RNG positions as **advances**, using the original zero-based
PokéFinder convention. Advance 0 is the first PID-generation start; a display
that labels this frame 1 will be one higher. This agrees
with the initial-advance count in the
[PokeFinder static generator](https://github.com/Admiral-Fish/PokeFinder/blob/master/Core/Gen3/Generators/StaticGenerator3.cpp).
No +1 adjustment is applied to display, target search or calibration.

## Mechanics and evidence

- SID creation reuses `sidRng.ts`: the naming-screen exit captures the public TID
  as the RNG seed; a later RNG output becomes SID. The elapsed timer interval is
  an estimate of RNG calls, not an exact frame measurement. See [SID RNG source
  sequence](SID_RNG.md). The introductory 50-frame delay comes from the
  [published starter procedure](https://www.pokemonrng.com/emerald-shiny-starter/),
  and remains adjustable alongside uncertainty and calibration.
- Starter generation reuses seed-zero Emerald Method 1, correlated PID/IV tuples,
  stored ability selection, and summary-stat filtering. See [static generation
  and independent reference vectors](STATIC_RNG.md). A level-5 summary usually
  does not determine exact IVs by itself; every matching spread stays possible.
- The first rescue victory gives one Speed EV. In pret/pokeemerald commit
  `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`,
  [`battle_controllers.c`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/battle_controllers.c)
  creates the level-2 Zigzagoon and
  [`battle_script_commands.c`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/battle_script_commands.c)
  awards EVs to eligible participants. The battle log applies each opponent's
  complete yield, multiplier, 255 per-stat cap and 510 total cap, in source order.
  `ev-yields.json` is transcribed from that checkout's species constants and
  [`species_info.h`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/pokemon/species_info.h).
- The guided route assumes ordinary English Emerald, no evolution, PP Ups,
  contest training or unrecorded changes. Unknown EVs stay unknown. The player
  records current moves and actual battles. The identified IVs remain fixed and
  EV changes come from the battle log; no further route stat checks are required. Held items are equipped after battles. Item sources come from guaranteed early pickups, gifts, Berry trees and
  Oldale/Petalburg/Rustboro shop stock; vitamins and Macho Brace are excluded. Zigzagoon gives 1 Speed EV, Silcoon/Cascoon give
  2 Defense EVs, and rare Route 102 Seedot gives 1 Defense EV.
- All occupied move slots can be rearranged, carrying PP with the move. Empty
  slots cannot be moved. PP is restored by storage. Encryption uses the actual
  PID-dependent Growth/Attacks/EVs/Misc permutation, including generated IV bits.
- Shiny targets use `(TID XOR SID XOR PID-low XOR PID-high) < 8`. Nearby results
  show ±10 RNG advances; optional landing identification searches ±120, retains
  ambiguous matches and offers calibration only for a unique match. Calibration
  assumes the level-5 summary immediately after the first victory, with its
  one Speed EV. Later training is explicitly excluded from this check.

The guided route does not ask for exact EXP. Growth stores EXP as a little-endian
32-bit value; the changing low half XORs with public TID, while the SID-linked
high half stays zero below 65,536 EXP and duplicates other known-zero plaintext
in the ordinary early-game setup. See the Growth layout in
[pokemon.h](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h)
and EncryptBoxMon in
[pokemon.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c).
New guide checkpoints conservatively leave EXP unknown; they never infer exact
EXP from a level. Saved observations retain their original EXP facts, and advanced
tools still support exact EXP. Restored route text drops obsolete EXP requirements
without changing completed checklist entries or evidence.

## Route comparison and limits

`starterRoute.ts` compares full black/transparent outcome patterns grouped by
distinct surviving SID, across all matching PID/IV spreads. Unknown plaintext
preserves both outcomes. It evaluates legal occupied-slot move orders,
automatically obtainable items and modest Defense/Speed training. This is a bounded
coordinate search over practical choices, **not a proof of a globally optimal
route** or a guarantee of one-observation recovery. Large hypothesis sets use a
safe unchanged setup and recommend additional stats instead of sampling PIDs.

The route and curtain steps have no level-up stat-check control or prompt.
Players update the battle log and any changed moves after training. Saved route
instructions are also cleaned up without changing evidence or completion flags.

The checklist now calculates automatically before travel. Its travel screen
contains only SID-relevant pickup, move and training instructions; general story directions to the father/Wally are removed. SID-relevant trainer
battles are now explicit checklist actions. A unique identified spread explicitly
supplies PID and IV plaintext before item/EV comparisons, with the actual
PID-dependent data permutation. The worker accepts surviving SID values from
the current investigation and intersects them with the naming-window filter.
It recomputes when the recorded battle log or current moves change. Arrival uses the actual recorded values. Projected travel battles and moves
are separate from evidence until the player checks them off. A second item comparison after training accounts for overlap
between IV, item and EV pixels. Item pickup instructions distinguish Oldale/Petalburg Awakening from Rustboro stock. The separate plan/use-checklist buttons are removed.

### Drawing and experiment flow

The first curtain view is the existing editable PixelGrid with its school
background. Black/transparent painting records real observations. Both guided
and advanced drawing use the shared hook's explicit Finish behavior: the first
stroke pauses deduction and freezes existing assistance, subsequent strokes
only update the drawing, and Finish drawing confirms the whole pattern and
resumes SID calculations. The Finish button remains enabled while drawing is
paused, and new experiment rankings are deferred to avoid work during painting.
A short note explains that marked boxes are pre-drawn from known Pokemon
information and can be corrected. Unsubmitted drawing cannot advance to shiny
target selection. Per-pixel experiment answers continue to update their tests. The old guided baseline question called
observePixel, which paused solving indefinitely without offering Finish drawing.
That caused stale counts and repeated questions; the baseline now has direct
drawing and a Finish drawing button to confirm the full visible pattern.
Finish reuses completeDrawing, including the existing auto-pixel confirmation
and undo behavior. Experiment recommendations wait for a completed baseline.
Experiment snapshots still ask only their useful highlighted pixels, using the
existing target answering and saved-evidence flow. Skips clear between experiments.
Black SID header nibbles eliminate zero for their own position immediately on
the next solve; a repeated observation need not reduce an already filtered set.

### Verified early battles and moves

The beginner checklist forecasts Birch's level-2 Zigzagoon, the Route 103
rival's level-5 starter, Calvin's level-5 Poochyena, the Woods Aqua Grunt's
level-9 Poochyena, and a conservative planned fight against James's two
level-6 Nincada. James is explicitly identified as avoidable; the beginner route
includes him so it does not rely on dodging his sight. It does not recommend
a fragile zero/one-Defense route by treating him as impossible to encounter.
The projected EV totals (HP/Atk/Def/Spe/SpA/SpD) are Treecko 0/2/2/1/1/0,
Torchic 0/3/2/1/0/0, Mudkip 0/2/2/2/0/0. The player must check off each actual
victory; stable IDs prevent duplicate recording on recheck and undo removes
that action's entries. Arrival replanning uses actual EVs.

Solo, non-traded starter EXP is forecast internally using the existing growth
curves and Emerald's integer order: floor(baseYield * opponentLevel / 7), then
floor(* 1.5) for trainer opponents. No exact-EXP input returns. The specified
route reaches 548 EXP, level 9; level 10 needs 560. One level-5 Wurmple gives
38 EXP and one HP EV, reaching 586 EXP/level 10 without changing Defense or
Speed. A level-5 Shroomish is an alternative HP-only opponent. Unknown opponent
levels keep the EXP forecast unknown; the planner never invents them. These
level forecasts assume the starter receives all EXP, so the checklist says
to use only the starter for the specified fights.

The route compares current moves, ordinary learned moves, optional level-10
Ember/Water Gun, Treecko's level-11 Quick Attack, HM01 Cut and TM09 Bullet Seed.
Torchic's Quick Attack is level 28, not 11, and is outside this short route.
Treecko and Torchic can learn Cut; Mudkip cannot. Only Treecko can learn Bullet
Seed. Existing moveLearningActions provides machine compatibility and empty-slot
legality; legal occupied-slot permutations and restored PP are reused.
Level-up training specifies exact level-5 Wurmple/Shroomish counts, with their
HP EVs included in the compared plaintext. It is recommended only if its
SID discrimination justifies its action cost. The comparison remains a bounded
heuristic, not a globally optimal route proof. TM09 consumption is persisted
and excludes that one-use TM from simultaneous or later held-item suggestions.
Projected moves become facts only when the player confirms the final move list.
Old route plans refresh once without removing prior curtain evidence or
replacing unfinished training checkpoints.

Verified against pret/pokeemerald's
[trainer parties](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/trainer_parties.h),
[level-up learnsets](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/pokemon/level_up_learnsets.h),
[TM/HM compatibility](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/pokemon/tmhm_learnsets.h),
[EXP calculation](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/battle_script_commands.c),
and local wild_encounters.json (level-5 Wurmple and Shroomish in Petalburg Woods).

### Automatic item acquisition

The user-supplied full early-game source list is preserved in
[EARLY_GAME_ITEMS.txt](EARLY_GAME_ITEMS.txt). The curated, executable held-item
sources are in src/data/starter-items.json and filtered by starterItems.ts.
The guide no longer asks which items the player owns. Guaranteed pre-badge,
no-HM sources supply the first setup and later held-item experiment options.
The legacy availableItems field is retained only for saved-data compatibility.
Older selected-item route plans refresh once; active curtain evidence and
unfinished training checkpoints are preserved.

Each pickup has a concrete location; purchases have a price. Key items and HMs
are not holdable experiments. Orange Mail is sold early but cannot remain on
a boxed Pokemon, so it is excluded. Gym/rescue sources, random daily Berries,
Pickup and wild held items are classified separately and never assumed to be
guaranteed at the first Rustboro visit. This keeps the route free of required
gym victories, trades, rare captures and grinding. Alternative sources of the
same item do not produce another plaintext test.

The full item set is now selected jointly. planStarterItems compares complete
black/transparent outcome patterns against the actual PID, correlated IVs,
moves, PP, EVs and surviving SIDs. For each SID pair still confusable in the
base setup, it records which obtainable items can separate it. Covering those
requirements preserves all distinctions available from the catalogue, rather
than collecting every raw hex digit. Identical B tests for the same position
are interchangeable; B in another SID position can still add information.
Correlated candidates can also make two different digit tests redundant.

coverStarterItems removes dominated requirements, constructs a greedy
incumbent, and searches up to 20,000 distinct item subsets for a cheaper full
cover. Cost includes 30 seconds per item test, acquisition convenience and
shared Mart visits counted only once. Ties prefer fewer items and lower
purchase totals. A final removal pass guarantees no retained item can be
dropped without losing catalogue-level coverage, including when the search
bound is reached. This is a bounded cost search, not a universal optimum proof.
An 80-case independent brute-force test verifies minimum cost on small covers.
A separate encrypted-outcome regression confirms catalogue-equivalent SID
partitions and forbids duplicate B-only X Attack/Oran Berry tests.

Purchasable test supplies use Rustboro's basic pre-badge stock, with one grouped
shopping instruction and total price. Awakening uses a separate on-route
Petalburg purchase because Rustboro does not stock it. Free story gifts and
useful non-shop sources remain eligible. Item and trainer instructions are
ordered along the route so the Petalburg purchase precedes the Woods battles.
The most informative item from the retained set is named explicitly in the
final setup, immediately before depositing. Other items stay in the Bag for
later tests. Predicted item outcomes never become observations; the route score
reports only the first equipped item, not future unperformed experiments.
The planner excludes a consumed TM09 from both acquisition and later holding.
Old item plans refresh on the preparation step while active curtain evidence
and unfinished training checkpoints retain their original facts.

Checklist completion is saved separately from the generated plan. Editing actual
moves or logging an extra battle retains completed pickups and purchases, even
if shopping groups change. Existing saved checkmarks are recovered before the
first replan. Restoring a checkmark never repeats a battle or applies a planned
move; EV gains remain in the actual battle log. Changed setup steps need fresh
confirmation, and a new starter attempt clears this progress. Travel can proceed
to the actual-move entry screen with a mismatching suggested move step unchecked.

The existing curtain experiment engine ranks subsequent tests against actual
recorded evidence. Its item options use the same source catalogue, even for old
saves with restricted manual item choices. If a newly useful item was not on
the route checklist, its acquisition instruction appears with the next test.
No inventory selector, extra panel or item-planning button is added.

Source checks use the local pret/pokeemerald checkout: item_ball_scripts.inc,
map.json hidden-item records, Route104's Berry/TM scripts, the Flower Shop's
random-eight-Berry script, the three Mart scripts, RustboroCity_Flat2_2F's
Premier Ball and PokemonSchool's Quick Claw scripts. The online
[Petalburg shop script](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/maps/PetalburgCity_Mart/scripts.inc),
[Route104 script](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/maps/Route104/scripts.inc)
and [storage code](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon_storage_system.c)
confirm shop gating, the Chesto gift/third-badge White Herb gate and the mail
storage restriction. Source-derived item IDs and holdability reuse items.json.

No extra wild training is recommended when its SID gain does not justify the
supported action cost. Otherwise a concrete count and target EV value are shown.
The battle log supports Zigzagoon/Taillow/Wingull (1 Speed EV each) and
Silcoon/Cascoon (2 Defense EVs each). The automated short route chooses a concrete
Zigzagoon or Silcoon plan and records its corresponding yield on completion.
Real required battles must still be logged; neither their opponents nor their
EVs are assumed by the travel checklist.

Internal action costs rank convenience (item/move changes, encounters and EV
battles); no per-test time estimates are displayed. They are planning assumptions,
not measurements. The guide suggests further held-item, move or training
experiments through the existing experiment engine, rechecking whether each
question can actually distinguish surviving SIDs. No new in-game save is needed
for the sequential training checkpoints; the original pre-starter save must
remain intact for the final reset.

The audible timer schedules four beeps per stage on Web Audio's clock. The fourth
starts at zero. Wall-clock conversion uses the GBA display rate
`16777216 / 280896`; input latency, startup delays and extra RNG calls still need
uncertainty/calibration. A browser countdown cannot establish an actual game RNG
state. Hiding the page stops the timer. Audio output latency and physical console
timing have not been measured in an emulator or hardware capture for this change.

## Images and validation

Targeted experiment answers can be undone from the curtain step, including after
an experiment completes. Undo clears one answer, reopens that experiment with its
original facts and restores its highlighted question. The solver recalculates
from the complete timing window and all remaining observations. Other answers
and the original drawing remain unchanged. Answer order and the reopened pixel
are saved between sessions; legacy saves fall back to their stored target order.
The advanced targeted experiment controls reuse the same undo operation.

After exactly one starter spread is identified, an effort table shows the estimated
TID/SID target advance and five advances on each side, chronologically. Repeated
SIDs retain their separate generating advances. Every displayed
SID is compared against all SIDs in the full timing window; the preview never
reduces the solver's candidate set. It reuses the full-window route plan, known
IV/plaintext masks, early held-item catalogue and occupied-slot move swaps. The
same route plan is reused on the travel step instead of calculating it twice.

The rehearsal chooses each experiment using only the surviving candidate group,
then uses the assumed SID to supply its binary answers. At most four useful
pixel questions are confirmed per setup. It ranks early items and move swaps
alongside monotone manual Defense/Speed training, preferring targets up to 10
EVs in each stat and never skipping an informative earlier EV checkpoint.
Item acquisition costs are included; vitamins are not assumed. Training respects
255/stat and 510/total caps and requires known EVs and ordinary gains.
Green means the initial known-pixel drawing uniquely separates that SID; yellow
shows estimated experiment counts with no EV target above 10; red means the
estimated path reaches more than 10 EVs in a stat. EV targets are absolute totals,
not additional gains. Unresolved or unsupported estimates are gray. Unknown
plaintext and checksum deductions are omitted, so actual work can be lower and
the interactive recommender may choose a different path. This is not an optimal
experiment tree or a guarantee. Windows above 4096 distinct SIDs retain all
candidates but do not run experiment rehearsals.

For hard or unresolved rows, the optional “Try another starter (+20 advances)” moves
the actual second countdown about 0.33 seconds later. It preserves calibration,
the first countdown, search radius and TID/SID timing. Intentional target changes
are not measured calibration corrections. The windows overlap and a different
PID is not guaranteed. The existing first-zero reset starts a fresh attempt,
clearing the old starter evidence only when the player actually resets.

The guide uses six unmodified game captures supplied by the user. The intro
shows name confirmation beside Birch’s final message; starter identification
shows the save position beside the Yes/No confirmation; curtain investigation
shows PC placement beside the Trainer’s School. Pairs stack on phones. The
final shiny timer reuses the confirmation image. The route checklist and
shiny-target list need no picture and have no placeholders. Asset names and
placements are listed in
[`src/assets/starter-guide/README.md`](../src/assets/starter-guide/README.md).
About includes an accessible overview of the complete guided workflow, the
PID/IV-specific route calculations and the distinction between timed estimates
and observed curtain evidence.
The curtain grid reuses the main investigator's PixelGrid and stripLayout, including
the surrounding source-derived school artwork. Pixel questions and recorded-pixel
coordinates count from the central 8-by-20 record grid, not the surrounding
artwork: rows 1-20 and columns 1-8. Compact Spinda-guide coordinates remain unchanged.

Focused tests cover independent Method 1 generation, retained correlations across
level-up readings, IV plaintext/permutations, SID-specific pixel partitions,
EV accounting, timer cues and calibration sign, shiny targets and nearby matches,
separate autosave storage, and shared-engine SID deduction. Browser checks cover
all six steps, audio startup, selective questions, desktop/mobile fitting and
save/resume behavior. A synthetic curtain answer narrowed 241 SIDs to 219; a
separate controlled single-SID window exercised the final result gate and shiny
target selection. An independently generated advance-2075 attempt matched eight
advances late against target 2067 and applied +8 calibration. Editing that attempt
cleared the old result, and a level-6 input was rejected by the first-battle-only
calibration check. These synthetic checks are not physical game observations.

The reported level-5 Hardy male Torchic (HP 20, Attack 11, Defense 9, Sp. Attack
13, Sp. Defense 10, Speed 10) is a regression fixture. With the supplied
16-second second stage, offset +50, calibration +50 and uncertainty ±232,
it matches Method 1 advance 1109, PID `A4CD354E`, and stored-order IVs
`18 / 8 / 8 / 13 / 21 / 19`. An independent BigInt LCG confirms that tuple.
The fixture also tests recovery after four contradictory saved checks at the
same checkpoint, replacement of previous level/EV checks, new-attempt isolation, and
display order without changing stored stat indices. This identifies a matching
candidate within the supplied window; it does not establish the actual landed
frame from level-5 stats alone. Only tuples within the configured target window
are retained; a matching tuple is not automatically promoted to the observed PID.

A second reported Careful male Torchic has PID `735AB2E1`, stored-order IVs
`22 / 7 / 12 / 24 / 16 / 12`, and origin seed `859A2033`. An independent BigInt
LCG verifies that seed and tuple at zero-based advance 705 (the supplied PKHeX
display calls it frame 706). PID `923D3323` at advance 1107 also produces its
level-5 stats `20 / 11 / 9 / 10 / 10 / 11` with the first victory's 1 Speed EV.
The regression checks that this tuple is excluded when outside the requested
target ±100 and appears when calibration recenters the target at 705. A Docile
Torchic fixture verifies that target 900 retains frame 980 and excludes 396.
Both display numbering and the RNG sequence remain unchanged. Another fixture
retains multiple compatible in-window spreads at 1786 and 1889, prompts for all
six stats after every level-up, and removes the false match using the latest
summary and its actual EV snapshot.
