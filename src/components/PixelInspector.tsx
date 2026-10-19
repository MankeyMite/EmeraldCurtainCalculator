import type { CurtainLab } from "../hooks/useCurtainLab";
import { describeByte } from "../core/inspection";
import { hex } from "../core/pokemon";
import { allowedValues } from "../core/constraints";
import { workbenchMasks } from "./WorkbenchData";
import { nibbleValue } from "../core/tiles";

export function PixelInspector({ lab }: { lab: CurtainLab }) {
  const h = lab.hover ?? lab.selectedPixel;
  const pid =
    lab.mode === "renderer"
      ? lab.imported?.pid
      : lab.sidAnalysis &&
          new Set(lab.sidAnalysis.candidates.map((h) => h.pid)).size === 1
        ? lab.sidAnalysis.candidates[0]?.pid
        : lab.inference.pidValues?.length === 1
          ? lab.inference.pidValues[0]
          : undefined;
  const field = h
    ? describeByte(h.offset, h.slot === 5 ? pid : undefined)
    : null;
  const value =
    lab.mode === "solver"
      ? h
        ? lab.obs[h.nibble]
        : -1
      : !h || nibbleValue(lab.memory, h.nibble) === null
        ? -1
        : nibbleValue(lab.memory, h.nibble) === 0
          ? 0
          : 1;
  return (
    <section className="inspector" aria-label="Pixel inspector">
      <h2>Pixel inspector</h2>
      <p className="help">
        Hover either a pixel or hex digit to link them. Click to pin; arrow keys
        select, Space paints.
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
              ? h.slot === 5
                ? `Candidates: ${
                    allowedValues(workbenchMasks(lab)[h.offset * 2 + h.side])
                      .map((n) => hex(n, 1))
                      .join(", ") || "none"
                  }`
                : "Neighbor record"
              : "Unpainted pixels stay unknown"}
          </small>
        </div>
      </dl>
      {h && (
        <p className="inspector-detail">
          Tile {h.tile} · pixel ({h.x}, {h.y}){h.flipped ? " · mirrored" : ""}.{" "}
          {field!.detail}
          {nibbleValue(lab.memory, h.nibble) !== null &&
            lab.mode === "renderer" &&
            ` Imported byte: ${hex(lab.memory[h.byte]!)}; nibble: ${hex(nibbleValue(lab.memory, h.nibble)!, 1)}.`}
        </p>
      )}
    </section>
  );
}
