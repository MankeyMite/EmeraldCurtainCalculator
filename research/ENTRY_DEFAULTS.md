# Entry defaults and record-completion limits

Move rows reserve separate columns for the move name/ID, PP and a per-slot PP Ups selector. The maximum after three PP Ups occupies its own line below PP. Choosing a stage sets PC-restored PP; typing a valid maximum infers its stage. If a complete packed PP Ups byte is known, changing a slot preserves its other three counters. Unknown packed counters stay unknown: a known move's full PP constrains its stage through the existing plaintext engine. Empty moves and moves whose PP cannot increase have disabled selectors. The unknown selector entry is a display state; individual unknown counters are not replaced by fabricated zeros.

SID recovery displays decimal and hexadecimal together, with question marks for varying digits. Decimal patterns are calculated from actual surviving SID candidates, or all values admitted by the four marginal SID nibble masks when joint enumeration is unavailable. Decimal carries and leading zeros are handled by comparing full five-digit strings; a uniquely solved SID is displayed as an ordinary integer. This is presentation only and adds no evidence or filtering.

The opening About tab places a short pitch and four setup steps before the research article. Starting entry or changing tabs preserves the investigation, including restored pending experiments. The main editor has a Draw toggle and adjacent Finish drawing button, without brush selectors. Blank cells display as transparent while remaining internally unrecorded. Clicking toggles the displayed state; dragging continues that color, so a stroke beginning on black erases to transparent. Manual overrides of predictions remain genuine observations and can reveal contradictions.

Finish drawing explicitly confirms the full main-record pattern: `completeAssistedDrawing` fills remaining unrecorded, unpredicted cells with zero observations. Predicted cells remain derived and hidden neighbors stay unchanged. Completion adds an undo step and resumes deduction. This completion rule does not run for experiment snapshots, whose unexamined cells remain unconstrained. Old JSON keeps its existing -1/0/1 observation semantics; merely loading it, displaying blanks or switching tabs never adds evidence.

New investigations start with origin game Emerald (3), English (2), normal header flags 0x02, Is egg = No, no PP Ups, four empty move slots and zero PP. These are editable workflow assumptions. English Emerald is the default context shown in the form; move/PP/header assumptions are tracked as tinted inputs. Existing JSON imports and research examples retain their supplied facts and unknowns.

Selecting a species supplies its uppercase English species name as an assumed nickname. Renamed Pokémon require the exact visible capitalization. A manually entered nickname is retained when species changes. Other language selections do not automatically use English species names. Nicknames use the international Gen 3 character map, up to ten characters. A shorter name supplies its first 0xFF end marker and leaves all subsequent memory unknown. No trailing zero or 0xFF padding is invented.

Selecting a move supplies its full PP, including known PP Ups. Manual PP edits stop following that assumed maximum. Empty move fields show hint text and retain ID 0; selecting Unknown in the suggestions clears the fact. PP maxima display all three PP Ups. PC storage restores PP, so typed PP must equal one of the four restored maxima, and the stage is inferred from that value. Invalid entries get a red outline on blur and an explanation on hover. Entering boosted PP removes a conflicting assumed zero counter; unknown slot counters remain unknown. Summary level and six stats are marked Required for stat-based IV recovery, while the SID/pixel solver remains usable before all stats are entered. Unknown EVs/nature produce safe IV bounds rather than disabling calculation or assuming zero EVs.

## Header flags and secure Egg flag

At BoxPokemon byte 0x13, bit 0 is isBadEgg, bit 1 is hasSpecies, bit 2 is isEgg, bit 3 is blockBoxRS, and bits 4–7 are unused. Thus 0x02 means an occupied non-Egg Pokémon; 0x06 has both species and Egg set. The secure Miscellaneous block has a second Egg bit at bit 30 of its packed IV word.

The source's MON_DATA_IS_EGG setter updates both Egg bits. The ordinary-data solver constrains both from Is egg, without forcing unrelated header flags. An explicit inconsistent raw header value still produces a contradiction. The assumed normal header follows changes to Is egg.

## Optional normal-wild storage preset

ZeroBoxMonData clears the whole record before CreateBoxMon populates it. For an ordinary, unmodified Emerald wild catch, the header unknown word (0x1E–0x1F), Growth filler (logical +0x0A–0x0B), and upper five Miscellaneous ribbon/encounter bits start at zero. The last group includes four unused ribbon bits and modernFatefulEncounter. It must not be universally assumed for events, modified records, or other generation pathways.

The optional preset fills only missing values, marks them as assumptions, preserves explicit raw overrides and never supplies a checksum. The existing projection calculates the checksum when all 48 secure bytes become exact: sum the 24 decrypted little-endian words modulo 65536. Header fields, including nickname/trailing memory, do not enter this checksum.

## Reported Nincada investigation

The contributor reported recovering SID using three Dewford phrase tests on a new save. Replaying the supplied JSON leaves PID 0x97507B58, SID 33789, and one H2 spread at advance 900 under its selected settings. Its IVs are HP 26 / Attack 13 / Defense 11 / Speed 22 / Sp. Attack 25 / Sp. Defense 31. No SID, PID or IV is added as a supplied fact for that replay.

With the additional assumptions nickname NINCADA and normal wild-catch storage, 65 exact bytes become 79. Growth filler is plaintext 0000, ciphertext AD 14; the final Miscellaneous ciphertext byte is 14; checksum is 0x15D1, stored D1 15. These numbers are conditional on the supplied evidence and assumptions, not independently checked against an original .ek3.

Byte 0x10 lies after NINCADA's terminator and remains unknown, with 225 possible values because both observed nibbles are nonzero. GetSpeciesName stops writing at its end marker, while the nickname setter copies ten bytes; trailing memory cannot be inferred from visible text. The checksum excludes this byte. A checksum-valid meaningful reconstruction can therefore still be ambiguous as an exact 80-byte archive. Exact export remains blocked until every byte is known; changing the nickname would create a different record rather than recover its original trailing data.

## Source references and validation

- [BoxPokemon, Growth and Miscellaneous structures](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h).
- [ZeroBoxMonData, CreateBoxMon, SetBoxMonData, GetSpeciesName and checksum](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c).
- [Entry defaults regression tests](../tests/entry-defaults.test.ts) cover PP/nickname exceptions, save/load, both Egg bits, source-derived storage assumptions, automatic checksum calculation and preservation of unknown trailing nickname memory.

This review reproduces the contributor's reported session and existing source model. It does not add an emulator capture or independently verify the new save's SID.
