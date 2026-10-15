# Source evidence, mapping, and uncertainty

Extraction used pret/pokeemerald commit **731ad5bfd6e6f265508d0efcca0ba42f9dcf5881**. `src/data/mapping.json` records SHA-256 asset hashes. Small original assets are retained in `research/fixtures/`; the source checkout is ignored by Git.

## Supported language and validation scope

The application currently supports **English Emerald only**. The captures and source-derived graphics/storage mapping below validate that version; they do not establish compatibility with other language ROMs.

[Historical Glitch City research](https://nintyconservation.github.io/glitchcity.wiki/glitchcity.wiki/Black_curtains_glitch.html) reports Box 7 slots 26–28 for Japanese Emerald instead of English Box 8 slots 4–6. That suggests a middle record in Box 7 slot 27, but this project has not independently checked Japanese byte alignment, tile placement, flips, palette or runtime upload behavior. Do not assume changing the storage position is the only adjustment required. Other language versions likewise need separate validation.

## Primary evidence

- [BoxPokemon / substructure definitions](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon.h)
- [PokemonStorage layout](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/pokemon_storage_system.h)
- [Encryption, checksum and GetSubstruct permutations](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/pokemon.c)
- [School metatile words](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/tilesets/secondary/pokemon_school/metatiles.bin)
- [Metatile layer attributes](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/tilesets/secondary/pokemon_school/metatile_attributes.bin)
- [Palette 8](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/tilesets/secondary/pokemon_school/palettes/08.pal)
- [12×11 school layout, Building + PokemonSchool tilesets](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/layouts/layouts.json)
- [Actual school map](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/data/layouts/RustboroCity_PokemonSchool/map.bin)
- [DrawMetatile layer routing](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/field_camera.c)
- [Overworld background priorities](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/overworld.c)
- [Graphics declaration: 278 secondary school tiles](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/tilesets/graphics.h)
- [Tileset constants](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/include/fieldmap.h)
- [4bpp conversion: low nibble is left pixel](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/tools/gbagfx/gfx.c)
- [Storage relocation](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/load_save.c)
- [Original-ROM symbols](https://github.com/pret/pokeemerald/blob/symbols/pokeemerald.sym)
- [GBA background format and transparent index](https://mgba-emu.github.io/gbatek/)

The historical live-address range also has a secondary report: [Trainer’s School window tile quirks](https://bulbapedia.bulbagarden.net/wiki/List_of_overworld_glitches_(Generation_III)#Trainer's_School_window_tile_quirks). Slot attribution is now independently captured below. Do not interpret that historical live address as the heap graphics-upload source.

## Actual graphics placement

Each metatile has eight little-endian u16 words: four bottom-layer tiles and four top-layer tiles (TL, TR, BL, BR). Tile ID = word & 0x03FF, hflip = bit 10, vflip = bit 11, palette = bits 12–15.

Secondary metatile numbers below are decimal; map IDs add 512:

| Metatile | Map ID | Bottom words        | Top words           |
| -------- | ------ | ------------------- | ------------------- |
| 17       | 0x211  | 6210 6211 6214 6215 | 8317 1000 8318 1000 |
| 18       | 0x212  | 6611 6610 6615 6614 | 1400 8717 1400 8718 |
| 25       | 0x219  | 6218 6219 663C 623B | 8319 1000 1400 1000 |
| 26       | 0x21A  | 6619 6618 623B 623C | 1400 8719 1000 1000 |

0x317/0x318/0x319 are tiles **791/792/793**. 0x8xxx selects palette 8; 0x87xx includes hflip. There are no curtain vflips.

The map puts metatiles 17/18 at (1,1)/(2,1) and (9,1)/(10,1), and 25/26 directly below at y=2. Coordinates are zero-based, excluding the runtime map-buffer +7 border. Left curtain tiles start at room pixels (16,16), (16,24), (16,32); right mirrored tiles start at (40,16), (40,24), (40,32). The second window is shifted +128 pixels in x.

The UI supports a white curtain overlay and actual static school artwork extracted from the pinned tiles, palettes, metatiles and map. The default Game window uses that artwork: a one-window crop is room pixels x=16 or 144, y=8, width=32, height=32; the two-window view is the top 192-by-48 room region. Static art pixels are separate from leaked pixels and never constrain observations. Sprites and the player's camera viewport are not emulated. Each tile appears four times; repeats share observations.

## Palette and visibility

All 16 palette 8 entries are RGB (0,0,0). GBA background index 0 is transparent regardless of its stored RGB; indices 1–15 are opaque black.

All relevant attributes are 0x1000 (COVERED). `DrawMetatile` routes bottom words to BG3 and top words to BG2; BG1 receives tile 0. The Building indexed PNG confirms tile 0 is all zero. Underlying curtain tiles 528/532/536 use palette 6 and have no nonzero black pixels beneath the overlay, so transparency is visually distinguishable from opaque black in the static map.

All **192 unique nibbles** are displayed four times, yielding **768 pixel appearances**. No permanent partial-tile occlusion is established in these assets. Runtime sprites, UI overlays, clipping, fades, and other transient effects are not modeled. Unreadable or hidden real-screen pixels must remain **unknown**, never transparent.

## Byte-to-pixel formula

Each 8×8 tile uses 32 bytes. Apply flips to displayed (x,y) to obtain source (sx,sy):

```text
regionByte = (tileID - 791) * 32 + sy * 4 + floor(sx / 2)
side       = sx % 2                 # 0 low nibble; 1 high nibble
nibble     = (byte >> (side * 4)) & 15
observationIndex = regionByte * 2 + side
```

Rows run top-to-bottom, and low nibble is the left pixel in each pair. 01 → black/transparent; 10 → transparent/black; A0 → transparent/black; 0A → black/transparent. Hex display still shows the high nibble first, as conventional byte notation requires.

## Conditional zero-relocation storage mapping

Pret’s original-ROM symbols report `gPokemonStorage = 0x02029808`. Pokémon start at offset 4; storage contains 14 boxes of 30 80-byte records. With one-based box and slot numbers:

```text
recordOffset(box,slot) = 4 + ((box-1)*30 + slot-1)*80
Box 8 slot 4: storage+0x4294 = 0x0202DA9C
Box 8 slot 5: storage+0x42E4 = 0x0202DAEC
Box 8 slot 6: storage+0x4334 = 0x0202DB3C

0x0202DAE4 = slot 4 + 72
0x0202DB43 = slot 6 + 7
inclusive size = 96 bytes
```

| Region bytes | Record bytes         |
| ------------ | -------------------- |
| 0–7          | Slot 4 offsets 72–79 |
| 8–87         | Slot 5 offsets 0–79  |
| 88–95        | Slot 6 offsets 0–7   |

Only supplying slot 5 leaves the adjacent 16 bytes `null`. `SetSaveBlocksPointers` can relocate live storage by `(offset + Random()) & 124` (0–124 in steps of 4). The saved capture uses displacement 76. The old observation ID `pret-school-v1-zero-aslr` is retained for compatibility, not as a current claim that live storage must have zero relocation.

## Runtime upload and independent emulator capture

The graphics declaration specifies 278 secondary school tiles. Adding 512 primary tiles gives valid school payload IDs 512–789. Tile 790 is already beyond that payload; curtain tiles are 791–793. [fieldmap.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/fieldmap.c) requests a 512-tile secondary transfer; [menu.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/menu.c) allocates/decompresses using the LZ payload size. The transfer reads beyond that allocation.

User-authorized read-only inspection used mGBA **0.10.3**, English Emerald BPEE, ROM SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7` (matching pret's original ROM). The saved state is version 7, native 240×160 RGB PNG. Its serialization offsets are verified against [mGBA serialize.h](https://github.com/mgba-emu/mgba/blob/0.10.3/include/mgba/internal/gba/serialize.h): IO 0x400, palette 0x800, VRAM 0x1000, IWRAM 0x19000, EWRAM 0x21000, total 0x61000. Local source pins mGBA commit `1c61b54208ca6266129d0f2394c04bd8c44f98c5`.

| Quantity | Captured value |
| --- | --- |
| `gPokemonStoragePtr` at 0x03005D94 | 0x02029854, relocation +0x4C |
| Live slot 5 | 0x0202DB38 |
| Corresponding live 96-byte region | 0x0202DB30–0x0202DB8F |
| VRAM tiles 791–793 | 0x060062E0–0x0600633F |
| Matching heap region | 0x02008F90–0x02008FEF |
| Box 8 occupied slots | Only slot 5; all other records zero |
| BG0/1/2/3 controls | 1F08 / 1D41 / 1C42 / 1E43 |
| BG2 scroll | x=240, y=184 |
| Curtain screen origins | x=64/88 and 192/216, y=40/48/56 |

`scripts/verify-capture.mjs` independently reads actual registers, tilemap words, palette, storage pointer and screenshot; it does not import the application renderer. All **96 VRAM bytes** equal slot4 tail8 + slot5 80 + slot6 head8. All **768 screenshot pixel appearances** agree with that data. Palette8 is entirely zero, BG1 words are tile0, and the screenshot distinguishes every zero nibble from opaque black. Tests then compare the application placements and renderer directly with the stripped screenshot.

On ordinary exit/reentry, a conditional hardware breakpoint at `copy_decompressed_tile_data_to_vram`, ROM address **0x08199BF0**, captured `r0=2, r1=0x02006CB0, r2=0x4000, r3=0x200`. The 96-byte dump at `r1+(791−512)*32 = 0x02008F90` matches saved VRAM exactly. `research/fixtures/emulator-ss8/upload-trace.txt` preserves the output, including the distinct outdoor source 0x02006DF0. This establishes the school transfer source for this run; it is not a hardware DMA-register trace or proof for every allocation history.

`MoveSaveBlocks_ResetHeap` explicitly copies storage to `gHeap + sizeof(SaveBlock2)+sizeof(SaveBlock1)` then resets the heap. Original sizes 0xF2C+0x3D88 give copy base 0x02004CB4, and slot5 offset 0x42E4 gives **0x02008F98**, exactly the captured heap DOTS address. This supports save-block copy provenance; the full earlier snapshot history was not traced. The upload reads heap contents rather than relocated live storage.

Freshness follow-up: `LoadMapInStepsLocal` case 1 in [overworld.c](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/overworld.c#L1889) calls `ResetMirageTowerAndSaveBlockPtrs`, which invokes `MoveSaveBlocks_ResetHeap` before graphics upload. Normal map loading therefore provides a concrete refresh point for the heap storage copy; a save-file write or reboot is not required by this path. Heap reuse and out-of-allocation reads still make allocation history relevant. The user's Latios replacement changed the visible pattern before saving/resetting; exact record matching and before/after screenshot equality remain pending. See [EXPERIMENTS.md](EXPERIMENTS.md).

Full state/RAM remain local in ignored `research/captures/`. Minimal fixtures contain only three relevant records, 96 tile bytes, palette, map metadata, trace, and a screenshot stripped of all private `gbAs`/`gbAx` state chunks. Reproduce locally with `node scripts/verify-capture.mjs path/to/state.png`; no ROM or state upload occurs.

## Pokémon parsing and inference

Header fields: PID 0x00–03; OT ID 0x04–07 (TID low 16, SID high 16); nickname 0x08–11; language 0x12; flags 0x13; OT name 0x14–1A; markings 0x1B; checksum 0x1C–1D; unknown 0x1E–1F. Encrypted data is 0x20–4F.

Each encrypted u32 is XORed with PID and OT ID. PID % 24 selects the four 12-byte substructure positions. Checksum is the modulo-65536 sum of 24 decrypted u16 words. Six EVs occupy the EV block’s first six bytes; six 5-bit IVs occupy Misc+4. Imported candidates are decrypted into a separate copy, preserving rendering ciphertext.

Observation domains: transparent={0}; black={1,…,15}; unknown={0,…,15}. The reverse solver now propagates known species, partial EVs, nature and header facts through the encryption relation. Checksum, nickname, legality, EV-total and known-IV constraints are not applied. Counts describe the implemented model, not legal Pokémon counts.

`cryptoConstraints.ts` transforms ciphertext domains when PID and full OT ID are exact. `OT_ID = (SID << 16) | TID`, key=`PID XOR OT_ID`; SID alone is insufficient. XOR maps {0} to one exact plaintext nibble, {1…F} to 15 values excluding the key nibble, and {0…F} to all 16 values. Ordering follows PID % 24. No candidate values, checksum search or legality assumptions are silently applied. Actual DOTS PID pixels establish **0x000000++**, allowing **225 PIDs** before additional constraints; 0x84 is one of them. Knowing the key improves plaintext constraints but cannot undo the palette's loss of nonzero nibble identity.

`inference.ts` generalizes this without requiring exact PID or OT ID. For each of 24 orders, species (Growth+0 u16) and EVs (EV block+0–5 u8) give constraints on eight repeating key nibbles. Each local pair of PID/OT nibbles must XOR to an allowed key nibble. Weighted digit DP enforces PID%24 and optional PID%25, counting distinct PIDs and joint PID/OT headers with BigInt. No 32-bit brute-force search or candidate bytes are used. Exact two-digit projections preserve byte correlations; logical plaintext and physical ciphertext domains are unions over every surviving branch.

A digit is printed only for a singleton supported domain. Individual byte and PID counts are exact; correlated multi-byte/key products are explicitly upper bounds. IV bit projections are conservative unless singleton. Small PID sets up to 256 are listed with suffix-residue pruning. A small exhaustive independent oracle verifies joint counts and ciphertext/plaintext byte projections, including nonempty ambiguous solution sets. Tested fixture progression: DOTS 225→110→84→5 PIDs; Latios 2,562,890,625→2,524,921,875→387,281,250→5,703. See [SOLVER_GUIDE.md](SOLVER_GUIDE.md) for inputs and limits. The new species catalog is extracted from pinned `include/constants/species.h` and `src/data/text/species_names.h` and preserves internal IDs.

## Reproduce extraction

```powershell
git clone https://github.com/pret/pokeemerald.git research/pret
git -C research/pret checkout 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881
npm.cmd run research
npm.cmd test
```

The extractor reads actual binary assets and preserves PNG palette indices using native Node zlib and PNG scanline filters. An RGBA conversion would lose index identity when palette colors repeat.

Tests independently check retained binary words, map positions, layers, and palette data. A sparse record with slot 5 bytes 0=01, 1=10, 24=A0, 56=0A has hand-derived black anchors:

| Byte | Four screen coordinates              |
| ---- | ------------------------------------ |
| 0    | (16,18), (47,18), (144,18), (175,18) |
| 1    | (19,18), (44,18), (147,18), (172,18) |
| 24   | (17,24), (46,24), (145,24), (174,24) |
| 56   | (16,32), (47,32), (144,32), (175,32) |

This source-derived golden pattern supplements round-trip tests. **It is not an emulator capture.**

## Supplied DOTS reference

The user supplied `Seedot (1).ek3` and an in-game screenshot on 2026-10-14. Untouched bytes are retained as `research/fixtures/dots-seedot.ek3`, with a built-in preview. Decryption yields PID 0x84, OT ID 38726, internal Seedot ID 298, IVs 5/4/5/4/4/4, ability 1, zero EVs, experience 96, and a valid checksum. Fixed trade properties agree with [pret's DOTS trade definition](https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/data/trade.h#L985).

The original file and saved-state record are both checksum-valid but differ at 0x1C (checksum low: 6C→E6), 0x2E (held item ciphertext low: 86→00), and 0x35 (friendship ciphertext: D1→D0). Held item changes 134→0 and friendship 70→71; experience stays 96. These cause three unique pixel contradictions (indices 108,109,122), repeated 12 times on screen. Geometry does not need alteration. Both references are retained separately. Top two and bottom two curtain rows belong to neighboring slots, confirmed zero in this capture.

## Next research experiments

1. Use ordinary PC operations to place contrasting known records in slots 4/5/6. Capture after saving/loading and after PC-only edits to distinguish live data from stale heap snapshots. Keep the original state/save as a baseline; no ACE or memory writes are needed.
2. Repeat after reset, PC access, battle, and map transitions. Determine whether relocation and allocation history change attribution. Do not use ACE to modify Pokémon.
3. Compare window underlay and sprite crossings to the static visibility findings. Mark obscured observations unknown.
4. Compare multiple known records against one saved pattern to measure collisions. Record language/version, pointer relocation, and camera state in JSON notes.
5. Add new mapping profiles and structural inference only after independent VRAM validation, with explicit compute budgets and known fixtures.
