import { useMemo } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { describeByteWithOrders } from "../core/inspection";
import { hex } from "../core/pokemon";
import { allowedValues } from "../core/constraints";
import { workbenchMasks, workbenchOrders } from "./WorkbenchData";
import { nibbleValue } from "../core/tiles";

export function PixelInspector({ lab }: { lab: CurtainLab }) {
  const h = lab.hover ?? lab.selectedPixel;
  const masks = useMemo(
    () => workbenchMasks(lab),
    [
      lab.mode,
      lab.suppliedMasks,
      lab.recovery,
      lab.inference,
      lab.sidRngSettings,
      lab.sidRngResult,
    ],
  );
  const field = h
    ? describeByteWithOrders(h.offset, h.slot === 5 ? workbenchOrders(lab) : [])
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
        Tap or click a pixel or hex digit to keep its details here. Hover or
        keyboard focus links highlights; arrow keys select, Space toggles black
        and transparent.
      </p>
      <dl className="inspector-grid">
        <div className="inspect-field">
          <dt>Pokémon field</dt>
          <dd>{field?.name ?? "Tap or hover over a pixel"}</dd>
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
                ? "Not recorded"
                : value === 0
                  ? "Transparent"
                  : "Black"
              : "—"}
          </dd>
          <small>
            {h
              ? h.slot === 5
                ? `Candidates: ${
                    allowedValues(masks[h.offset * 2 + h.side])
                      .map((n) => hex(n, 1))
                      .join(", ") || "none"
                  }`
                : "Neighbor record"
              : "Finish drawing confirms blank cells as transparent"}
          </small>
        </div>
      </dl>
      {lab.mode === "solver" && lab.assistance?.conflictReason && (
        <p role="alert" className="inspector-prediction">
          {lab.assistance.conflictReason}
        </p>
      )}
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
