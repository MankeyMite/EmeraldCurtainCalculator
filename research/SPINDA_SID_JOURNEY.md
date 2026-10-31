# Find SID with Spinda

**Find SID with Spinda** opens its own full-page guide from SID Finder or About, like the New Game SID guide. Guide pages are numbered and opening the guide always shows page 1. Leaving and reopening it in the same page session offers an explicit option to continue. Refresh fully resets its drawing, entered information, pixel observations, experiments and carried SID candidates, requiring the first Spinda to be drawn again. Refresh opens About on desktop and Curtain on phones; an old saved guide-open flag never reopens a guide automatically. Other investigations keep their normal autosave behavior, and explicitly loaded JSON remains supported. The guide reuses the existing spot painter and solver. It catches **one Spinda at a time** and then compares further catches with experiments on that catch. Ordinary and shiny Spinda both work; a shiny observation becomes an additional constraint when the trainer ID is supplied.

## Pages and evidence

Selecting a PID does not mark capture, drawing, or information entry complete. Pixel questions and later recommendations require an explicitly painted and confirmed pattern, a confirmed catch, and completion of the Pokémon, moves and trainer-information pages. Old saves on a later page are routed to the first unfinished setup step without clearing facts, SID progress or observations. An unfinished experiment remains resumable until it is recorded or cancelled.

Back appears only at the bottom of pages after page 1; page 1 has no Back button. Back reviews the previous page without clearing entered data or rewinding the saved investigation; Next returns through reviewed pages to the current step. Revisiting the catch page does not create a new catch. Finish or cancel an active experiment before changing pages.

1. Prepare: select the game language (English by default). English and other non-Japanese versions use Box 8 slot 5; fill slots 1–4 and leave slot 5 empty. Japanese uses Box 7 slot 27; fill slots 1–26 for an easier time and leave slot 27 empty. Keep a full party and exit the PC with that box selected so the next catch goes directly into the target slot. These instructions and the selector appear on page 1 even when resuming saved progress. Then save by Route 113 grass; encounter settings stay in an optional disclosure.
2. Draw: enter the encountered level and drag the four spots to match the settled front battle pose. This is the existing interactive painter, inside the guide. Pattern comparison requires using the painter first.
3. Match: compare the best four matches ranked against that painted pattern and explicitly confirm a PID. More matches and the painter remain available for ambiguity. No timer or time-ordered candidate list is used.
4. Catch: use the suggested ball for the confirmed pattern, or choose one available in the bag. The guide uses that exact candidate’s IV/ability spreads to decide whether stats are needed. The catch goes straight to the prepared Box 8 slot 5; no separate deposit is needed.
5. Stats: record the boxed summary when multiple IV/ability words remain. Blank stats retain every compatible spread; methods with the same word require no additional distinction.
6. Information: nickname, nature, ability, gender, EXP, actual ball, and shiny status. New English catches default to nickname SPINDA; other languages leave the nickname unknown rather than inserting an English name. Shiny defaults to No; both fields remain editable. The selected language is saved and supplies the new catch’s language field and later box/slot reminders.
7. Moves: review all four move IDs, current PP, and PP Up counters in the boxed summary.
8. Details: trainer ID/name/gender, location, met level, held item, and an optional form containing all other Pokémon-information fields and editable defaults. Continue directly to pixel checks, without drawing again. Correcting a PID later keeps the same catch’s data and physical pixel observations.
9. Pixels: one useful equality test at a time, with its location shown on the actual 8-column, 20-row curtain strip. Prefer the question whose answer best partitions the exact current SID set. Show the remaining count for each printed SID digit.
10. Plan: compare another catch, supported experiments, and useful Defense/Speed vitamin checkpoints. The selected action leads directly to its instructions and pixel question.
11. Experiment/restore: record only verified pixels and restore the original setup before selecting another test. Completed answers update the solver immediately.

Another catch carries the exact surviving SID list and tested-digit masks. It discards the previous catch’s level, nature, gender, Pokémon data, drawing and per-catch pixel answers. It asks for all new information again. This retains cross-digit SID correlations rather than expanding the set to a Cartesian product of digit masks.

Initial moves use Emerald’s learnset and last-four-move rule. Level 15 has an empty fourth slot; level 16 adds Psybeam. Both pre-catch usefulness and the next-catch estimate include level-dependent move IDs and restored PP. These are predictions for planning, and the user reviews the actual values before they become evidence. See the [Emerald learnsets](https://github.com/pret/pokeemerald/blob/master/src/data/pokemon/level_up_learnsets.h).

## Calculated vitamin threshold

There is no fixed threshold such as “buy vitamins after learning two digits.” For the confirmed PID and actual remaining SIDs:

- Enumerate the existing legal Iron/Carbos actions and vitamin-only EV checkpoints. Honor recorded EVs and the Emerald vitamin cap; exclude checkpoints requiring battles from the shopping portfolio.
- For each changed Defense/Speed nibble, compute the exact SID digit equality being tested. Remove solved positions and tests that cannot distinguish the remaining SIDs.
- Partition the **whole SID list** by each checkpoint’s black/transparent outcomes. Greedily select useful checkpoints by conditional information per second, then compare every selected prefix including its shopping cost. This avoids letting an expensive final checkpoint hide an efficient short route.
- Buy only the largest dose required for either stat across the selected checkpoints, less recorded stock. Save **after purchasing**, with the original Spinda and vitamins in the bag, and reload after each test. The same stock can serve multiple checkpoints.
- Rank the best vitamin prefix, ordinary supported experiments, and the sampled next-catch estimate by expected bits per second. Recalculate after each actual answer.

For a vitamin portfolio gaining `V` bits in `T` seconds of testing, and a catch gaining an estimated `C` bits in `K` seconds, shopping is faster than catching for the same expected information when:

`shopping_seconds < V × K / C − T`

Default shopping time is an editable 180-second round trip. Catch/check time is the existing 240 seconds. A vitamin costs 10 seconds to apply, plus 30 seconds per checkpoint for inspection. Vitamin stock and travel time affect recommendations only; they never constrain the solver.

Deterministic benchmark, PID 0, zero EVs, no stock, and a comparison catch worth 1 bit in 240 seconds:

| Remaining SIDs (hex) | Useful route | Testing | Shopping break-even | Result at 180-second shopping |
| --- | --- | --- | --- | --- |
| 0002, 0004 | Two Iron to 20 Defense EVs; test S4=4 | 50 s | 190 s | Vitamins: 230 s total |
| 3000, 4000 | Five Carbos to 50 Speed EVs; test S1=3 | 80 s | 160 s | Catch: 240 s versus 260 s |
| E000, F000 | Neither high Speed nibble is reachable using vitamins from zero EVs | — | — | No vitamin route |

Owning five Carbos changes the second case to 80 seconds and favors the experiment. All three cases have two SID candidates and three solved digits, illustrating why the actual unresolved position and values matter. Runtime comparisons use the sampled information of another Spinda, not the fixed one-bit benchmark. A fast move swap can win over either route.

[Lilycove Department Store 3F’s left clerk](https://github.com/pret/pokeemerald/blob/master/data/maps/LilycoveCity_DepartmentStore_3F/scripts.inc) sells Iron and Carbos. Both cost [₽9,800 in Emerald](https://github.com/pret/pokeemerald/blob/master/src/data/items.h). The guide gives the required quantities and total additional purchase price.

## Practical limits

The language selector implements the requested placement instructions. The existing pixel mapping has independent capture validation for English Emerald only; this change does not independently validate Japanese or other language graphics/byte alignment. See [the mapping’s language scope](RESEARCH.md#supported-language-and-validation-scope).

There is no Spinda timer. The player positions the spots before seeing suggested PID matches. Search results retain complete encounter spreads within the configured RNG range. Hidden or overlapping spots may require comparing multiple matches, nature, gender or stats. Existing saves at the removed timer step migrate to the painter while retaining SID progress and discarding the old elapsed time.

The next-catch estimate is a bounded deterministic simulation. The vitamin route uses a greedy checkpoint order, not a globally optimal gameplay decision tree. Effort estimates are editable/approximate; gameplay capture timing and average completion time still need independent measurements. No new screenshot or live browser visual QA was available during this implementation; rendered-component tests check each page independently.

`tests/spinda-journey.test.ts` covers the level-16 moveset, painter-ranked suggestions, the standalone page, painting before comparison, equal-count/different-digit route choices, stock/travel effects, independent XOR-byte outcome partitions across all 24 permutations, strict saved-state validation and legacy timer migration, and page-specific rendering. `tests/spinda-correction-reset.test.ts` covers valid capture defaults after information edits and save/load, corrected observed traits recovering an excluded painted PID, full refresh reset on repeated page mounts, and preservation of other species' investigations. Existing Spinda tests cover the underlying RNG, rendering, correlated IV evidence, solver integration, and experiment outcomes.
