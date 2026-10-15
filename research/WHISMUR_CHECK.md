# Whismur byte-position check

Checked the supplied `whismur test.ek3` without modifying
it. The unchanged 80-byte copy is `fixtures/whismur-test.ek3`.

## Confirmed file contents and user inputs

- PID: `0xA53FEFE8`; TID: 9918; SID: 41686; full OT ID: `0xA2D626BE`.
- Whismur (original internal species ID 370), six zero EVs, Quirky (24).
- Checksum `0x0CF1` validates. PID modulo 24 is 0: Growth, Attacks, EVs, Misc.
- XOR key: `0x07E9C956`, repeating little-endian bytes `56 C9 E9 07`.

```text
        +00 +01 +02 +03 +04 +05 +06 +07
0x38:    56  C9  E9  07  56  C9  E9  07
0x40:    56  C9  E9  07  56  D6  6F  16
```

The screenshot's circled bytes are at offsets `0x3C` and `0x3D`, not `0x44`
and `0x45`. They are the encrypted Special Attack and Special Defense EVs.
Since both plaintext EVs are supplied as zero, their ciphertext is `56 C9`.
The `56 D6` sequence is in the Misc block at `0x44–0x45`.

The reported mismatch compared different byte positions. Row 38, columns 04/05 in Curtain Lab correspond to bytes 3C/3D. The bytes agree; no inference or memory-mapping change was needed.

## Verification and scope

`tests/whismur.test.ts` checks the independently fixed file offsets and decoded
facts, then applies the user's exact facts (including Quirky) to pixel masks
derived from the file. Every actual byte remains allowed, 3C/3D are uniquely
56/C9, and byte 45 retains D6 among 225 allowed values. Pixels alone leave
225 possibilities for each highlighted byte. This tests inference consistency
and offset interpretation; it is not an independent emulator-capture check
of this Whismur or an import of the user's hand-painted observation JSON.

Nibble hover tooltips now include their absolute byte address as well as the
field name; previously their own title obscured the parent byte's address.