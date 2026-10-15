# Gender, ability and stored-stat constraints

This extends reverse inference; the 96-byte curtain mapping, palette and mirroring are unchanged. Guarantees remain conditional on observations and all active facts, including defaults.

## Source evidence

Reference commit: `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` in pret/pokeemerald.

- [`include/pokemon.h`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h): Growth, EV/contest and Misc structures, packed IVs/flags and ribbons.
- [`src/pokemon.c`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c): `GetGenderFromSpeciesAndPersonality`, `GetAbilityBySpecies`, `GetMonAbility`, record access and encryption. Ordinary creation uses PID parity for two-ability species, but the ability bit is stored separately. No creation-method assumption is imposed here.
- [`species_info.h`](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/pokemon/species_info.h): gender thresholds and ability slots. `PERCENT_FEMALE(50)` becomes threshold **127**, not 128. Female requires `(PID & 255) < threshold`; male is complementary. Special thresholds 0, 254 and 255 mean male-only, female-only and genderless.
- `scripts/extract-species.mjs` extracts all 386 species’ thresholds and ability IDs/names from that checkout. No modern-generation tables are used.

## Logical plaintext mapping

These bytes are relative to decrypted Growth / Attacks / EVs / Misc concatenated in that order. Physical encrypted-file offsets depend on PID modulo 24.

| Input | Logical location |
| --- | --- |
| Species | bytes 0–1, little endian |
| Held item | bytes 2–3, little endian |
| PP Up counters | byte 8, four 2-bit counters |
| Friendship | byte 9 |
| HP, Atk, Def, Speed, SpA, SpD EVs | bytes 24–29 |
| Cool, Beauty, Cute, Smart, Tough, Sheen | bytes 30–35 |
| Pokérus stored byte | byte 36 |
| Six IVs in the same stat order | bits 0–29 of bytes 40–43, five bits per IV |
| Egg flag | bit 30 of that word |
| Ability selection | bit 31 of that word |
| Ribbons | low 27 bits of bytes 44–47 |

Markings is unencrypted record byte `0x1B`. Ability names select the stored slot(s) matching the given ID; identical slots do not imply a unique bit. PP Up/ribbon inputs are packed values, not aggregate counts. Zero ribbons leaves the upper five bits (four unused bits and modern-fateful-encounter) unknown.

## Algorithm and defaults

Supplied fields restrict exactly their plaintext bits. Each nibble retains all values compatible with those bits, including partial IVs. Observed ciphertext and plaintext masks restrict eight repeating XOR-key nibble domains for each block order. Weighted digit DP counts PID/trainer-ID pairs and projects exact byte domains.

Gender couples the first two PID nibbles. Allowed low-byte pairs are partitioned into disjoint Cartesian rectangles and analyzed by the same DP. Counts add across disjoint cases, byte domains union, and block orders are deduplicated. Production never enumerates the full PID space. Multi-field projection counts may remain upper bounds, as labeled.

Fresh-catch zeros are supplied assumptions, not observations. Their draft-field keys are saved under `knownFacts.assumed`; each tag must reference an active zero. Old sessions load without new defaults. Original encrypted bytes are never repaired or changed.

## Validation

`tests/extended-facts.test.ts` checks every species’ gender cases, threshold/nature counts, partial IV bits in all 24 permutations, ability constraints without PID parity, real Whismur retention, wrong-fact rejection, ribbon-bit boundaries and default/session behavior. An independent oracle enumerates only 256 PIDs × 4 trainer IDs per case and compares every byte projection and exact counts for joint gender/IV/ability/condition constraints. It is a bounded test oracle, not the production solver.
