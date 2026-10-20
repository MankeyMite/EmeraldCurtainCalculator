# Investigation model and validation

The 2026-10-20 deduction update adds shared shiny status, cross-snapshot key propagation, linked checksum supports, combined experiment scoring and automatic black/transparent curtain assistance. See [the updated architecture, evidence boundaries, examples and limits](SMART_DEDUCTION.md). The original solver/workflow described below remains the foundation.

Emerald Curtain Investigator extends the existing calculator. Implemented: joint stored-data recovery, fixed-baseline held-item/move/EXP/vitamin experiments, bounded Emerald wild H1/H2/H4 and ordinary static/starter/gift Method 1/4 searches and optional new-game SID RNG filtering. Other encounter generators, battle EV training and arbitrary full-record experiment discrimination remain open.

## Architecture and provenance

`useCurtainLab` remains the shared owner of painting, facts, imports, history and example backup/restore. `Investigator.tsx` adds guided forms, snapshots, joint findings and experiments. The original renderer, inference engine, `.ek3` input and advanced components remain available.

`core/investigation.ts` defines origin metadata and JSON. Shared identity contains PID, original trainer information, species, nature, gender, ability, IVs, met fields and language. Each snapshot owns its 192-nibble drawing, item, EVs, PP, EXP, friendship, contest condition, other mutable fields, summary observations, notes and optional targets. Imported mutable snapshots cannot override identity.

Generic observations start with unknown mutable facts. New controlled tests change the original facts and start with unknown observations, displaying prior manual pixels only as an unverified grey reference. Users answer Black/Transparent for highlighted discriminating pixels; partial verified answers immediately constrain inference. Unexamined pixels stay unknown, including checksum changes. Automatic predictions remain separate. Recording restores the original drawing and reranks recommendations; the user restores the Pokémon in-game too. Legacy Yes/No snapshots retain their old saved semantics, and unrecorded legacy drafts remain excluded. Correct copied facts if anything else changed.

Legacy `emerald-curtain-observations` JSON is read without adding defaults. New `emerald-curtain-investigation` JSON stores identity, snapshots, origin, active snapshot and item-test phase/source/result metadata. Legacy owned-item lists remain compatible but do not filter recommendations. Validation checks mapping/version, values, lengths, IDs, test source/phase and fact placement. Local storage automatically preserves the investigation and pending draft; JSON remains a separate backup. Research examples pause autosave to preserve the previous workspace. Imported reference records never become observations.

The obtaining taxonomy was compared with the locally accessible `Gen3ACEPokemonBuilder/src/domain/encounterAvailability.js` and `encounterBrowser.js`. Wild/static, trades, Eggs, distributions and other-game categories are compatible; starters/gifts now share the Static category. No unrelated Builder logic or encounter implementation was copied.

## Exact SID model

For each supported PID and TID, enumerate all 65,536 SIDs. Each pair fixes OTID, key and block order. Known plaintext is expressed as nibble domains derived from **known bits**, including packed IV/ability/origins fields. Unknown bits stay free. All four logical blocks participate after permutation.

For secure nibble n, ciphertext domain C, plaintext domain P and repeating key digit k, require `P ∩ {c XOR k : c ∈ C}` to be nonempty. Transparent gives C={0}; black gives C={1,…,15}. This works for nonzero plaintext too. Alignment intersects key constraints within each snapshot. Every snapshot checks the same immutable key against its own changed plaintext and ciphertext, rather than intersecting ciphertext at changed offsets.

Header PID/TID/SID/name/other supplied bits and observations apply as well. PID nature and low-byte gender use actual Gen 3 rules. Generic stored ability selection does not automatically imply PID parity.

Plaintext facts cover species/item, EXP, friendship, PP Ups, moves/current PP, EVs, contest/Sheen, Pokérus, IVs, Egg/ability bits, met location/level/game/ball/OT gender, ribbon bits and explicitly known reserved/flag bits. Header language/flags/checksum/reserved word are supported. Reserved fields remain unknown unless supplied or filled by the optional, labeled normal-wild storage preset. Nickname text constrains characters through the first terminator; trailing memory stays unknown. Is egg constrains both the secure Egg bit and the header sanity bit. See [entry defaults and completion limits](ENTRY_DEFAULTS.md).

### Exact partial-payload checksum compatibility

The checksum sums 24 decrypted little-endian 16-bit words modulo 65536. For a fixed key, each payload nibble has a domain from its ciphertext and known bits. In each base-16 column, a bitset convolution computes all attainable sums of its 24 digits (0–360). Propagate carries 0–23 from the least significant column, retaining only output digits permitted by the observed/known checksum. Ignore overflow after column 4. Cached transitions depend on the column's two repeating key digits.

This determines whether at least one compatible payload satisfies the checksum without enumerating every unknown record. A changed field and checksum are tested in their own snapshot. Independent tests enumerate hidden payload alternatives and compare checksum outcomes, including carries/overflow.

Counts are exact **under this supplied-bit, observed-nibble, nature/gender and checksum model**. They do not certify encounter legality, breeding/transfer generation, EV reachability or unresolved summary-stat IV ranges. The existing IV calculator keeps those ranges separate; exact IVs explicitly applied by the user enter the stored facts.

Without RNG, a known PID bypasses PID searching; otherwise at most 32 inferred PIDs are jointly enumerated. Wild and ordinary Static origins can instead generate correlated PID/IV spreads from seed and advance bounds and test every spread against all recorded observations. Key-domain filtering reduces SID enumeration and removes the 32-PID prerequisite for this path. Counts distinguish PID, SID and PID/SID/IV hypotheses. Neither path silently truncates candidates or chooses the first match. See [wild RNG](WILD_RNG.md) for scope and validation.

### Projections, predictions and export

Record projections union compatible candidates' domains for the selected snapshot. Plaintext fields are placed in logical order independently of storage permutation. Non-exact field/byte projections are conservative: cross-field and checksum correlations can make their counts upper bounds. Singletons remain guaranteed under all compatible solutions. An all-black byte does not mean FF.

Exact payloads derive checksum bytes. Export requires every header/ciphertext byte to be unique and the decrypted checksum to validate. Unused name trailing bytes and reserved fields are never invented to complete a record. All exact values depend on the supplied facts and any visibly active assumptions.

Predicted pixels use solver domains but live separately from observed pixels. Projection/rendering never mutates observations. A player must check the game before recording a predicted pixel as an observation; previews do not validate themselves.

## Held-item experiments

`core/experiments.ts` predicts the four held-item ciphertext nibbles for each surviving hypothesis. Growth bytes 2–3 use key digits 4–7, with digit 0 least significant. Recommendations require only a shared Growth-block position, allowing multiple PIDs and differing orders of other substructures.

Candidates are grouped by **binary black/transparent patterns**, not exact ciphertext. Report group count, worst-case survivors, expected survivors and Shannon information gain. Expected values assume a stated uniform prior over PID/SID pairs, not in-game generation probabilities. Rank by worst case, then gain. Each proposed action has equal effort: one reversible no-battle item swap. Equivalent prediction functions are labeled.

The catalog derives from pinned pret item constants/data. Pocket/importance restrictions exclude key/important items; Safari Balls, placeholders and Mail experiments are also excluded. An item ID or price is not evidence of availability. All informative supported items are ranked; the player chooses one they can use without entering an inventory.

Choose Try, answer whether the pixels changed, then save any drawing edits. The item stays active during editing. Saving combines the new observation with earlier snapshots, shows the before/after pair count and ranks the next items. Advanced targeted Black/Transparent/Cannot determine entry remains available. Exact nibble-subset marginals and inclusion/exclusion compute binary outcome partitions efficiently across the entire catalog. Limited obtainable IDs may leave key digits unresolved; an item need not uniquely recover SID to be useful. Item swaps reveal shared-key information, not unrelated plaintext directly.

## Verification

The compact workbench keeps the curtain/inspector/grouped 80-byte view fixed and scrolls input tabs independently. Pixel and hex digit selection share a canonical nibble address. Completeness is singleton bytes divided by 80. Collapsed fields and the classic workspace preserve advanced tools. SID source sequence, exact intersections and conservative unknown-PID handling: [SID_RNG.md](SID_RNG.md).

`controlledExperiments.ts` ranks binary outcomes alongside item tests. Move swaps carry PP and packed PP Ups. Rare Candy targets exact next-level growth-table EXP and requires four occupied known move slots; users decline new moves and cancel evolution. Vitamins require six known original EVs and enforce 100/stat and 510 total, including partial gains near caps. EXP/EV tests discard stale summary stats; derived values retain dependence on baseline assumptions. These are controlled item uses, not battle simulations. Affected blocks must share observable positions across candidates.

New tests independently check all-SID results across all 24 permutations, nonzero plaintext, partial IV bits, genuine SID survival, ambiguous PID/SID sets, snapshots with changing items/checksums, actual encrypted target pixels, ranking metrics, exact/partial checksums, full original-byte synthetic recovery, blocked export for unknown header bytes, new facts in candidate comparison, legacy/new JSON and UI contracts. Existing rendering/capture/trait/stat/reconstruction tests remain.

Full-record supplied-information validation and **blind unknown-SID recovery are separate tests**. Existing DOTS, Skarmory and Latios tests supply PID/TID plus visible species/item, without injecting fixture SID or hidden payload into the investigation. Their genuine SIDs must survive. The synthetic exact-record test separately hides SID and recovers all 80 original bytes under sufficiently informative facts/observations.

**Illumise:** the user reports independently verified full reconstruction, including known SID, but no corresponding record or observation fixture was found here. It is not counted as an automated regression. Known-SID reconstruction does not establish unknown-SID recovery.

**Poochyena update:** the user subsequently supplied observation JSON and an 80-byte `.ek3`. Their zero-PID conflict is now a regression fixture: origin game 2 versus the record's 3, plus two disagreeing pixels (122 and 130). All other stored facts and six summary stats match the checksum-valid reference. The review copy corrects the game and leaves the disputed pixels unknown. It retains 1,012,489 PID possibilities, including the reference PID. With that PID supplied only for validation, 4,394 SIDs survive and include the actual SID. No PID, SID or IVs from the reference enter the saved blind review. See [POOCHYENA_CASE.md](POOCHYENA_CASE.md). Historical RNG timing and markings-refresh questions remain unresolved.

Next real-game checks: retain before/after snapshots; inspect header byte 0x1B for markings; leave/reenter the school to exercise its documented heap refresh; recheck uncertain pixels and summary facts; test RNG timing separately. Diagnostics identify specific failed byte/nibble positions or checksum impossibility, not the historical cause of a contradiction.

## Deferred methods

Emerald wild H1/H2/H4 is implemented and independently checked against numeric golden vectors and the reviewed Poochyena record. Seed 0, advances 0–99,999 leaves that record's PID and all six IVs uniquely; a broader range retains additional possibilities. RNG advances are not elapsed seconds. Ordinary static encounters, starters and gifts now use the separate [Method 1/4 path](STATIC_RNG.md). Unmodeled special wild/lead behaviors, roamers, special gifts, events and Eggs remain deferred. See [WILD_RNG.md](WILD_RNG.md).

Battle EV recommendations remain deferred: they must model yields, Pokérus/Macho Brace, 255/stat and 510 total, and changed EXP/PP/friendship. Only single vitamin uses with known starting EVs and cap-limited gains are currently recommended. Future methods can extend the shared snapshot abstraction without enumerating impossible Cartesian products of unknown bytes.

Primary references: [pinned BoxPokemon definitions](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h), [encryption/checksum/permutations](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c), [item data](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/items.h), [giving restrictions](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/item_menu.c), [wild generation](https://github.com/pret/pokeemerald/blob/master/src/wild_encounter.c), and [PokéFinder generators](https://github.com/Admiral-Fish/PokeFinder/tree/master/Core/Gen3/Generators). PokéFinder is a research reference; no implementation code is bundled. Historical attribution remains in [RESEARCH.md](RESEARCH.md). Development was AI-assisted; no new emulator validation is claimed.
