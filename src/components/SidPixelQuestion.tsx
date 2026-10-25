import { hex } from "../core/pokemon";
import { hitForNibble, recordStripLayout } from "./WorkbenchData";

export function curtainLocation(
  nibble: number,
  origin = recordStripLayout().bounds,
) {
  const hit = hitForNibble(nibble)!,
    bounds = origin;
  return `row ${hit.displayY - bounds.y + 1}, column ${hit.displayX - bounds.x + 1}`;
}
/** Shared question card for the Spinda guide and guided starter investigation. */
export function SidPixelQuestion({
  target,
  disabled,
  onAnswer,
  onLocate,
  origin,
}: {
  target: {
    nibble: number;
    field: string;
    half?: string;
    plaintext?: number;
    pidDigit?: number;
    digit?: number;
    candidate?: number;
  };
  disabled?: boolean;
  onAnswer: (answer: 0 | 1) => void;
  onLocate?: () => void;
  origin?: { x: number; y: number; w: number; h: number };
}) {
  const exact =
    target.plaintext !== undefined &&
    target.pidDigit !== undefined &&
    target.digit !== undefined &&
    target.candidate !== undefined;
  return (
    <>
      <h4>
        {target.field}
        {target.half && ` · ${target.half} nibble`}
      </h4>
      <p>
        <strong>{curtainLocation(target.nibble, origin)}</strong>
      </p>
      {exact && (
        <p>
          Plaintext <code>{hex(target.plaintext!, 1)}</code> XOR PID digit{" "}
          <code>{hex(target.pidDigit!, 1)}</code> → S{target.digit} candidate{" "}
          <strong>{hex(target.candidate!, 1)}</strong>.
        </p>
      )}
      {onLocate && (
        <button onClick={onLocate}>
          Locate selected pixel in main curtain
        </button>
      )}
      <p>Is this pixel transparent or black?</p>
      <div className="inline-buttons">
        <button disabled={disabled} onClick={() => onAnswer(0)}>
          Transparent
        </button>
        <button disabled={disabled} onClick={() => onAnswer(1)}>
          Black
        </button>
      </div>
      {exact && (
        <p className="help">
          Transparent confirms S{target.digit}={hex(target.candidate!, 1)}.
          Black removes it.
        </p>
      )}
    </>
  );
}
