import type { CurtainLab } from "../hooks/useCurtainLab";
import { describeByte } from "../core/inspection";
import { hex } from "../core/pokemon";

export function PixelInspector({ lab }: { lab: CurtainLab }) {
  const h = lab.hover;
  const pid =
    lab.mode === "renderer"
      ? lab.imported?.pid
      : lab.inference.pidValues?.length === 1
        ? lab.inference.pidValues[0]
        : undefined;
  const field = h
    ? describeByte(h.offset, h.slot === 5 ? pid : undefined)
    : null;
  const value =
    lab.mode === "solver"
      ? lab.ob
      : lab.hv === null
        ? -1
        : lab.hv === 0
          ? 0
          : 1;
  return (
    <section className="inspector" aria-label="Pixel inspector">
      <h2>Pixel inspector</h2>
      <p className="help">
        Hover a curtain pixel to see where it belongs. Arrow keys select pixels;
        Space paints.
      </p>
      <dl className="inspector-grid">
        <div className="inspect-field">
          <dt>Pokémon field</dt>
          <dd>{field?.name ?? "Move over a pixel"}</dd>
          <small>
            {field
              ? `${field.block}${field.encrypted ? " · encrypted" : ""}`
              : "Each pixel represents one 4-bit nibble."}
          </small>
        </div>
        <div>
          <dt>Record byte</dt>
          <dd>{h ? `0x${hex(h.offset)}` : "—"}</dd>
          <small>{h ? `Box 8 · slot ${h.slot}` : "80-byte boxed record"}</small>
        </div>
        <div>
          <dt>Nibble</dt>
          <dd>{h ? (h.side ? "High · bits 4–7" : "Low · bits 0–3") : "—"}</dd>
          <small>
            {h
              ? `Byte ${field!.byteInField + 1} of ${field!.fieldSize} in field`
              : "Low nibble is drawn first"}
          </small>
        </div>
        <div>
          <dt>{lab.mode === "solver" ? "Observation" : "Rendered pixel"}</dt>
          <dd>
            {h
              ? value === -1
                ? "Unknown"
                : value === 0
                  ? "Transparent"
                  : "Black"
              : "—"}
          </dd>
          <small>
            {h
              ? value === -1
                ? "Allows 0–F"
                : value === 0
                  ? "Nibble is 0"
                  : "Allows 1–F"
              : "Unpainted pixels stay unknown"}
          </small>
        </div>
      </dl>
      {h && (
        <p className="inspector-detail">
          Tile {h.tile} · pixel ({h.x}, {h.y}){h.flipped ? " · mirrored" : ""}.{" "}
          {field!.detail}
          {lab.hv !== null &&
            ` ${lab.mode === "solver" ? "Candidate" : "Imported"} byte: ${hex(lab.memory[h.byte]!)}; nibble: ${hex(lab.hv, 1)}.`}
        </p>
      )}
    </section>
  );
}
