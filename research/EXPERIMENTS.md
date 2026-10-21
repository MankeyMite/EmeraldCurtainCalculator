# User gameplay experiments

The current recommendation engine also uses exact checksum deltas and joint encrypted/checksum outcomes. Move PP parity and packed PP Ups are handled separately; unknown consumable friendship effects use the encrypted-only fallback. See [the reproducible four-candidate improvement and mathematical limits](SMART_DEDUCTION.md).

With the original TID known, held-item, move-swap and eligible Rare Candy
recommendations work for broad joint PID/SID sets without an encounter RNG limit.
Weighted per-order residue-DP key counts rank conservative pixel questions even
when PID, SID, key and affected block position are unknown. Verified answers
update the shared constraints. See [the uploaded Torchic regression, exact counts
versus bounds, checksum support and SID RNG limits](JOINT_EXPERIMENTS.md).

The subsequently supplied Poochyena JSON and encrypted reference now reproduce and explain its zero-PID input conflict: one origin-game mismatch and two pixel disagreements. See [the case report](POOCHYENA_CASE.md). The historical RNG/markings questions remain open; the review does not inject reference predictions as observations.

The investigator records separate before/after drawings and mutable facts, ranks held-item swaps without an inventory checklist, and checks each snapshot's checksum compatibility. Wild origins can search H1/H2/H4 over seed/advance bounds and retain correlated PID/IV candidates. The reviewed Poochyena session uniquely matches its reference PID and IVs within the tested early range, conditional on corrected inputs and search scope. See [the investigator model](INVESTIGATOR.md) and [wild RNG validation](WILD_RNG.md). Historical markings/refresh questions and reachable EV-training recommendations remain unresolved.

The contributor has confirmed that the Latios fixture is illegal. It is retained as a captured byte-to-pixel test record; none of the results below establish legality or RNG reachability.

## Latios replacement / save / soft-reset — 2026-10-14

Evidence: user-described gameplay, two inline cropped screenshots, the supplied
`contributed Latios party record`, and the recent mGBA state 9. The user
explicitly confirmed state 9 was taken **before soft-reset**, and no state was
saved for the after-reset checkpoint. The before-reset capture is now a second
independently verified byte-to-pixel fixture. The user subsequently confirmed
visual agreement of the before/after-reset screenshots and that an 80-byte
PokeGlitzer export renders exactly like Latios in mGBA. This supports normal
building-entry refresh. Raw after-reset VRAM was not captured; the result is
not generalized to every ROM or allocation history.

Reported sequence:

1. Remove DOTS and replace it with Latios in Box 8 slot 5.
2. Return to the school and take screenshot A, before saving/restarting.
3. Save the game, soft-reset, load the saved game, and take screenshot B.

Both pictures differ from DOTS. Initial visual inspection suggested upper-row
differences; the user reports the patterns agree and confirms the tool's
80-byte Latios rendering matches mGBA. No automated count is attributed to B.
The verified A capture and user-observed B agreement are separate evidence.

## Confirmed before-reset record and graphics

- Supplied file is 100 bytes: 80-byte BoxPokemon prefix plus 20 party bytes,
  matching pret `include/pokemon.h`. Prefix checksum is valid; species 408 is
  Latios, with PID and OT ID both 0x47366A9C. Consequently XOR key is 0.
- `research/fixtures/latios-test-box.ek3` is an unchanged copy of those first
  80 bytes; `latios-test-party.ek3` retains all 100 bytes. No source file was
  modified and no decrypted bytes were substituted into rendering.
- State 9's actual Box 8 slot 5 equals that prefix byte for byte. Slots 4 and 6
  are zero; Box 8 has no other occupied slots.
- Actual VRAM tiles 791–793 match all **96/96** assembled bytes. The native PNG
  matches all **768/768** curtain appearances, with **zero contradictions**.
  Capture fixtures and screenshot-derived observations are under
  `research/fixtures/emulator-latios-ss9/`; full private state stays ignored.
- Live storage pointer is 0x02029878, relocation +112, compared with +76 in
  DOTS's state 8. The same canonical slot/nibble mapping still matches. Heap
  region 0x02008F90 also equals VRAM; Latios's upload source was not separately
  breakpoint-traced.
- Native-screen tests compare app decoding and pret placements with the actual
  stripped PNG, independently of the verifier's pixel samples. All 192 unique
  observations are consistent with the record and repeated four times.
- PID observations are eight nonzero nibbles, allowing 15^8 = 2,562,890,625
  values before additional facts. The exact PID is known from the supplied
  record, not recovered from this pattern alone.

## Saved-game cross-check

Read-only inspection of the current `.sav` used pret sector IDs, signatures,
layout sizes and checksums. Both 14-sector save copies validate; the newest
counter is 1064. Its Box 8 slot 5 equals the supplied prefix and slots 4/6 are
empty. The older counter 1063 has slot 5 empty. The compact derived report is
`research/fixtures/latios-saved-storage-report.json`; no full save was exported.
This confirms the saved record after the reported save operation, but it does
not capture the graphics produced after loading it.

What this establishes: the displayed pattern changed during the ordinary
replacement / travel / school-reentry sequence, before the subsequent save and
soft-reset. A reboot was not necessary to change this displayed pattern.

What it does not establish: that screenshot B equals the supplied record's
pattern, that A and B are identical, or that every allocation history preserves
attribution. Black/transparent equality would also not prove equality of all
encrypted bytes, because nonzero nibble values are visually indistinguishable.

Source follow-up: pinned pret `src/overworld.c`, `LoadMapInStepsLocal`, case 1,
calls `ResetMirageTowerAndSaveBlockPtrs`, which calls
`MoveSaveBlocks_ResetHeap`. That copies current storage into the heap before
the later tileset upload. This supplies a concrete refresh point during normal
map loading, rather than requiring a write to the game's save file. The runtime
upload remains a read of heap contents; it is not a direct live-storage read.

Next verification: load the saved game normally, return to the pictured spot,
and save a newly named after-reset state without overwriting states 8 or 9.
Compare its VRAM, records and screenshot against the verified before-reset
fixture. mGBA was closed when the current scene was checked, so no new snapshot
was taken, no game was launched and no emulator inputs were issued.

Research CLIs: `scripts/render-reference.ts` handles explicit party-prefix
extraction and renders with either unknown or supplied neighboring records;
`scripts/inspect-save-reference.ts` reads the original English Emerald save
layout and emits only derived evidence. The app importer remains strictly
80 bytes; use the converted boxed file for this party export.
