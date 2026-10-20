import { summarizeField, type KnownFacts } from "../core/constraints";
import { fieldPossibilities, type Inference } from "../core/inference";
import { hex } from "../core/pokemon";
import { HexView } from "./HexView";
import species from "../data/species.json";

const stats = ["HP", "Attack", "Defense", "Speed", "Sp. Attack", "Sp. Defense"];
export function RecoveredFields({
  result: r,
  facts,
  observedMasks,
}: {
  result: Inference;
  facts: KnownFacts;
  observedMasks: number[];
}) {
  const singleton = (m: number) => m !== 0 && (m & (m - 1)) === 0;
  const exact = r.masks.filter(singleton).length,
    bytes = r.byteValues.filter((v) => v.length === 1).length;
  const narrowed = r.masks.filter((m, i) => m !== observedMasks[i]).length;
  const key = summarizeField(r.keyMasks, 0, 4);
  const numeric = (offset: number, size: number) =>
    fieldPossibilities(
      r.plaintextMasks,
      r.plaintextByteValues,
      offset,
      size,
      r.secureCountsExact,
      r.byteCountsExact,
    );
  const format = (f: ReturnType<typeof numeric>) =>
    f.count === 0n
      ? "Contradiction"
      : f.exact !== null
        ? `${f.exact.toLocaleString()} · exact under active facts`
        : `${f.countExact ? "" : "≤ "}${f.count.toLocaleString()} possible values${f.countExact ? "" : " (upper bound)"}`;
  const sp = numeric(0, 2),
    spName =
      sp.exact === null
        ? null
        : species.find((s) => s.id === Number(sp.exact))?.name;
  return (
    <div className="recovered-fields">
      <div className="section-label space-top">
        RECOVER <span>GUARANTEED UNDER ACTIVE FACTS</span>
      </div>
      {!r.consistent ? (
        <p className="alert error" role="alert">
          {r.reason}
        </p>
      ) : (
        <>
          <p className="micro">
            <strong>
              {exact}/160 exact record nibbles · {bytes}/80 exact bytes.
            </strong>
            <br />
            {narrowed} nibble domains narrowed beyond pixels alone. Known inputs
            are assumptions, not discoveries.
          </p>
          <div className="field-results">
            <div>
              <label>PID / OT ID pairs remaining</label>
              <strong>{r.headerPairCount.toLocaleString()}</strong>
              <small>
                Exact joint count for pixels and active stored-data facts.
                Summary-stat ranges are compared separately until exact IVs are
                applied. This counts headers, not complete or legal Pokémon.
                Checksum and legality are not applied.
              </small>
            </div>
            <div>
              <label>XOR key · PID XOR OT ID</label>
              <code>0x{key.hex}</code>
              <small>
                {key.exact !== null
                  ? "Exact key under active constraints"
                  : `≤ ${key.count.toLocaleString()} key values (upper bound)`}
                . Species/EVs can constrain this even when PID is ambiguous.
              </small>
            </div>
            <div>
              <label>
                Species{facts.species !== undefined ? " · supplied" : ""}
              </label>
              <strong>{spName ?? "Internal Gen 3 ID"}</strong>
              <code>0x{sp.hex}</code>
              <small>{format(sp)}</small>
            </div>
            <div>
              <label>Experience · Growth +04</label>
              <code>0x{numeric(4, 4).hex}</code>
              <small>{format(numeric(4, 4))}</small>
            </div>
            <div>
              <label>Held item · Growth +02</label>
              <small>{format(numeric(2, 2))}</small>
            </div>
            {stats.map((name, i) => {
              const f = numeric(24 + i, 1),
                values = r.plaintextByteValues[24 + i];
              return (
                <div key={name}>
                  <label>
                    {name} EV
                    {facts.evs?.[i] !== null && facts.evs?.[i] !== undefined
                      ? " · supplied"
                      : ""}
                  </label>
                  <code>0x{f.hex}</code>
                  <small>{format(f)}</small>
                  {f.exact === null && values.length < 256 && (
                    <small title={values.join(", ")}>
                      Allowed:{" "}
                      {values.length <= 12
                        ? values.join(", ")
                        : `${values.slice(0, 8).join(", ")}, … (hover for all)`}
                    </small>
                  )}
                </div>
              );
            })}
          </div>
          <details>
            <summary>Guaranteed plaintext · all four logical blocks</summary>
            <p className="micro">
              Domains combine every surviving key and block order. A digit
              appears only if all surviving solutions agree. Amber ? is
              restricted; grey ? allows all 0–F. Hover for allowed bytes.
            </p>
            {["Growth", "Attacks", "EVs / contests", "Misc / IVs"].map(
              (name, i) => (
                <div key={name}>
                  <p className="micro">{name} · offsets within this block</p>
                  <HexView
                    masks={r.plaintextMasks.slice(i * 24, (i + 1) * 24)}
                    byteValues={r.plaintextByteValues.slice(
                      i * 12,
                      (i + 1) * 12,
                    )}
                    label={`${name} inferred plaintext`}
                    fieldLabel={(offset) =>
                      `${name} +${hex(offset)} plaintext; supplied facts and observed pixels`
                    }
                  />
                </div>
              ),
            )}
          </details>
        </>
      )}
      <details open>
        <summary>How to narrow the remaining possibilities</summary>
        <ol className="solver-guide">
          <li>
            Paint both black and transparent pixels. Leave unreadable pixels
            unknown. Mirrored copies share data.
          </li>
          <li>
            Choose the known species. It constrains the encrypted Growth block
            across all 24 orders.
          </li>
          <li>
            Enter known IVs, EVs, ability and contest condition. Check the newly
            caught defaults; clear any assumptions that do not apply. Blank
            means unknown.
          </li>
          <li>
            Add nature and the Pokémon’s original trainer TID/SID when known.
            Nature constrains PID % 25; gender constrains the low PID byte. Your
            own trainer IDs may differ.
          </li>
          <li>
            Watch the PID count, surviving orders, guaranteed digits and
            per-field counts. Import candidates only to test consistency.
          </li>
        </ol>
        <p className="micro">
          More certainty requires additional true facts. Repainting an already
          observed black pixel cannot distinguish its 15 possible nibble values.
          Wrong facts can produce wrong conditional results; conflicts are shown
          explicitly. “≤” is a bound, not an exact count.
        </p>
      </details>
    </div>
  );
}
