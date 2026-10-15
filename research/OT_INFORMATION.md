# Original trainer name and gender

Known information accepts an exact OT name and independently unknown/male/female OT gender. These are supplied facts, not values borrowed from an imported candidate. Both survive JSON save/load, default clearing and example-workspace restoration; new workspaces leave them unknown. Pokémon gender remains a separate species-dependent input with Male and Female options.

## Source evidence

- [BoxPokemon and PokemonSubstruct3](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h) defines the seven-byte OT name at record 0x14–0x1A. OT gender is bit 15 of the Misc origins word at block +02, equivalently bit 7 of Misc +03 (logical secure bit 319).
- [Text character mapping](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/charmap.txt) supplies the international single-byte character table. src/data/gen3-characters.json retains these mappings, excluding EOS 0xFF as an input character and excluding Japanese tables/control tokens.
- [GetBoxMonData and SetBoxMonData](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c) copy exactly seven OT-name bytes; reading appends EOS to the output buffer. Stored name bytes after a prior EOS are not guaranteed padding. MON_DATA_OT_GENDER reads/writes the separate encrypted bit.

## Constraint behavior and limits

A name uses 1–7 encoded characters and is case-sensitive. For a shorter name, constrain its characters and the first 0xFF terminator, leaving later bytes completely unknown. A seven-character name fills the field without assuming a stored terminator or touching markings. Normalize Unicode accents to NFC; unsupported characters are rejected, without substituting ASCII or guessed bytes. Spaces are real 0x00 bytes and are preserved. This input does not support Japanese names, control sequences or special multi-character glyph tokens.

The name fixes its unencrypted header bytes directly and can conflict with observations. It does not constrain PID/key by an assumed relationship to the name. OT gender (male=0, female=1) enters the normal XOR/permutation model and may reduce PID/key possibilities. It is never derived from the Pokémon's gender or PID parity. Candidate comparison checks the exact encoded name through its terminator and the decoded trainer-gender bit. It ignores unknown trailing name bytes.

Tests verify fixed character bytes, unsupported input, name boundaries, unknown trailing storage, JSON/draft round trips, candidate conflicts and both gender values across all 24 block orders using independent ciphertext-bit expectations.
