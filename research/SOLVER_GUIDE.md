# Getting information from a curtain

**English Emerald only:** this tool’s storage and pixel mapping has not been validated for other language versions.

## Everyday workflow

Choose Black, Transparent or Unknown to record verified curtain pixels. Mirrored edges share the same observations. Click a pixel again to erase it. Enter known information on the left; guaranteed pixels appear automatically. **Finish drawing** starts background calculation using explicit observations and known facts.

Unexamined cells stay unknown after finishing. Automatic predictions already constrain calculations through their underlying facts; you do not need to redraw them. Finishing does not confirm them as independent observations.

The default view shows the main 80-byte record at 20× zoom. Its first editable row begins at PID byte 0. The extra top/bottom rows from slots 4/6 are hidden and remain unknown. Enable **Show neighboring slot rows** under More options if they matter; record only pixels you verify.

## Completing an accurate drawing

Choose Black, Transparent or Unknown to record only pixels verified in-game. Known facts automatically draw guaranteed pixels and already constrain calculations. Painting freezes predictions and pauses background deduction until **Finish drawing**. Unexamined pixels remain unknown; completing a drawing does not confirm automatic predictions. New experiments ask only about highlighted discriminating pixels and update candidates after each verified answer.

Black permits nibble values 1–F; transparent establishes 0. Before completion, unmarked cells remain unknown internally and permit 0–F. Click or drag to draw black pixels; click a black pixel again to erase it. The first tile pixel is the low nibble of its byte. Hexadecimal text shows the high nibble first.

## Adding useful facts

Inputs on the left are optional. Species names use original internal IDs (Whismur 370, Latios 408, Seedot 298). Enter the Pokémon’s original trainer TID and SID, which may differ from the current player’s IDs. PID accepts decimal or `0x` hexadecimal. Choose species before Pokémon gender or ability. **OT name** and **OT gender** describe the original trainer, which can differ from the current player; OT gender offers Male and Female independently of species. Copy the exact OT name, including capitalization. Only supported English/international Gen 3 text is accepted. A short name fixes its first terminator but leaves all later name bytes unknown. The name constrains its own header bytes; it does not establish a relationship to PID or trainer IDs. OT gender adds one encrypted origins-bit constraint. See [OT information](OT_INFORMATION.md).

Open **EVs, IVs & contest stats** for EVs (0–255), IVs (0–31), Cool/Beauty/Cute/Smart/Tough/Sheen (0–255), Pokérus/markings bytes, Egg flag, held item ID, friendship, packed PP Up counters and packed ribbon bits. Blank means unknown. Contest condition is distinct from ribbons.

New workspaces start with labeled **newly caught assumptions**: EVs, contest condition including Sheen, PP Ups, ribbons, Pokérus and markings are zero; Is Egg is No. IVs, held item and friendship stay unknown. **Clear defaults** removes untouched preset values; **Clear all information** removes every fact. Editing a default removes its assumption tag. **Use newly caught defaults** reapplies those values, replacing those fields while preserving IVs and identity information. These assumptions may be wrong for trained, traded or modified Pokémon.

Observation JSON preserves all supplied facts and `assumed` tags. Loading existing sessions never adds new defaults. Resetting restores the initial preset. Unused ribbon bits and fateful-encounter flags are not defaulted to zero.

Species, stats and condition constrain the repeating XOR key across all 24 substructure orders. Nature constrains PID modulo 25. Gender uses the species’ exact low-PID-byte threshold; fixed-gender species provide no extra PID restriction. Ability constrains its stored selection bit without assuming PID parity. Imported candidates never supply hidden solver facts.

All guarantees are conditional on correct mapping, painting and supplied facts. Wrong facts can eliminate the true record without causing an immediate contradiction. If no solution survives, the tool reports a conflict rather than inventing a record.

## Reading Reconstruction

- Green literal digits are shared by every surviving solution to the active model.
- Amber `?` is restricted; gray `?` allows every value 0–F. Hover a digit for its address and allowed nibble values, or the byte gap for possible byte values.
- **Pixels only** excludes known facts from the displayed hex. **Pixels + known facts** includes reverse inference.
- Two transparent pixels establish byte 00; one black and one transparent permit 15 values; two black permit 225. Pixels alone cannot recover a nonzero digit uniquely.
- PID counts and individual byte counts are exact for the implemented model. **≤** marks an upper bound when correlations are not fully represented.
- Complete PID sets of at most 100 can be selected in the same field that accepts typed guesses. Larger lists stay hidden; fixed digits are shown in numeric PID order below the field. A short list does not establish Pokémon identity.
- Decrypted domains are in a separate plaintext section. The main 80-byte hex grid always represents encrypted storage bytes.

Checksum propagation now refines exact-key/order payloads and small joint projections; exact experiment deltas also link snapshot checksums. Automatic pixels remain separate from observations. Optional shiny status defaults to Unknown and constrains the key without requiring PID/SID. Broad projections can still be upper bounds. Legality, EV-total recovery and automatic level-from-EXP inference remain unsupported. Supplied level/summary stats feed the IV calculator. See [the updated model and limits](SMART_DEDUCTION.md) and [trait/stat constraints](TRAIT_STATS_CONSTRAINTS.md).

## Testing guesses without assuming them

In Reconstruction, the hex data comes first. **PID possibilities** shows the count next to a PID input. Choose a value when at most 100 remain, or type decimal / `0x` hexadecimal and press **Check values**. Listed PID buttons check immediately. Expand **Other trial values** for nature, TID/SID, species and EVs. The count/list/fixed-digit pattern use the baseline drawing and stored-data facts, not temporary guesses.

For example, keep the known PID blank, supply the Whismur’s known original-trainer IDs, species and zero EVs on Curtain, then try `0xA53FEFE8` as a trial PID. The recorded Whismur pattern retains it. A PID ending in `...EFE0` contradicts the observed black low nibble at record byte `0x00`. The result identifies that byte and nibble. With the real header fixed, trial Attack EV 9 also contradicts the recorded pattern through XOR encryption, despite matching the header pixels.

**Impossible** eliminates the entered combination under the active model. **Possible** retains at least one compatible PID/trainer-ID pair; it does not establish identity, checksum validity, legality or RNG reachability. Testing nature also checks its correlation with the full PID, not merely individual nibble domains. Species/EV tests apply the XOR key and PID-dependent block order.

The checker never replaces a conflicting known fact with a trial value. If you previously entered a known PID, clear it on Curtain before exploring alternatives. If the existing drawing and known facts already conflict, resolve that conflict first. Editing a trial clears its previous verdict; changing observations or known facts recomputes a submitted trial. Trial values are scratchwork and are not included in observation JSON or guaranteed reconstruction.

## Current EXP and summary-stat IV calculation

**Current EXP** supplies the exact unsigned 32-bit Growth +04 field. It can constrain repeating XOR-key positions through encryption and block ordering. Blank stays unknown. It does not automatically derive a level.

Under **IV calculator · summary stats**, enter the current level and ordinary Emerald summary stats. Use maximum HP (after the slash), not remaining HP. Species, nature and known EVs are required for non-HP stats; HP ignores nature. The calculator enumerates only 32 IVs per stat using Emerald’s integer arithmetic, including Shedinja and ordinary Emerald Deoxys Speed Forme.

**IV ranges** compares stats alone, curtain + stored-fact projections, and their intersection. Multi-value intersections are conservative upper bounds: different IVs may require different PID/key choices. They do not change PID counts, typed-PID checks or candidate comparison. A singleton can be applied with **Use exact IVs in reconstruction**; any conflicting summary stat blocks applying results. Applied IVs then participate in the exact encryption model. Edit or clear applied IVs if summary inputs change; they remain explicit facts.

Summary inputs save separately as `summaryStats` in observation JSON. Old sessions load normally. Missing EVs/level/stats never become zero. Invalid summary input blocks saving and applying results. See [formula and evidence](SUMMARY_STATS.md).

## Inspector

Hover a pixel, or use arrows on the focused canvas. The inspector stays visible below the window and shows record offset, nibble, bit range, observation and mapped Pokémon field. It names encrypted fields only when the active solver has an exact PID. A candidate byte is explicitly labeled; it is not recovered information. A black pixel identifies a nonzero nibble, not any particular set bit.

## Byte experiments and candidates

Choose **Render .ek3** and import an original encrypted 80-byte record. In **Paste / edit 80-byte hex**, type or paste 160 hex digits, with optional whitespace. **Edit loaded slot** copies an imported record into the editor. Live hex preview updates only on a complete valid draft; incomplete edits preserve the last accepted preview. No checksum repair or re-encryption occurs automatically.

Return to **Draw pixels** to compare a candidate with the observations. Reconstruction reports matching, contradicting and unresolved observations, plus supplied-fact conflicts. Still possible means consistent so far, not identified. Original candidate bytes can be downloaded unchanged.

**Save drawing** exports observation states, mapping/schema versions and known facts, independently of candidates. **Load drawing** restores them. **Save PNG** exports the current grid as displayed; disable the grid first for a clean comparison image.

## Measured reference examples

The fixed DOTS screen fixture leaves 225 PIDs from pixels alone. Species plus zero EVs leaves 110; adding TID 38726 leaves 84; adding Relaxed leaves five: 57, 132, 157, 207 and 232. PID 132 is the reference, not a unique pixel-only recovery. Adding the known Early Bird ability (ID 48) leaves exactly **PID 132 (0x00000084)**. Male gender alone leaves four; both traits together leave one. The public DOTS example includes these two summary-visible facts by default. No PID or SID is supplied, and its observations remain the original capture; the original saved JSON retains the earlier five-PID baseline.

The contributor-reported illegal Latios fixture leaves 2,562,890,625 PIDs from pixels alone. Species, its actual EVs, TID 27292, SID 18230 and Sassy reduce this to 5,703. This guarantees 71 of 160 record nibbles and 26 complete bytes under those supplied facts. The actual PID remains included, not unique.

These examples are reproducible using `scripts/probe-inference.ts` and the committed observation JSON fixtures. They do not borrow candidate PIDs.
