import { allowedValues, maskSymbol } from "../core/constraints";
import { fieldAt, hex } from "../core/pokemon";
export function HexView({
  masks,
  label = "Encrypted byte constraints",
  fieldLabel = fieldAt,
  byteValues,
}: {
  masks: number[];
  label?: string;
  fieldLabel?: (offset: number) => string;
  byteValues?: number[][];
}) {
  return (
    <div className="hex-table" aria-label={label}>
      <div className="hex-heading">
        <span>OFF</span>
        <div>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>{hex(i)}</span>
          ))}
        </div>
      </div>
      {Array.from({ length: Math.ceil(masks.length / 16) }, (_, row) => (
        <div className="hex-row" key={row}>
          <span className="offset">{hex(row * 8)}</span>
          <div>
            {Array.from({ length: 8 }, (_, col) => {
              const b = row * 8 + col;
              if (b * 2 >= masks.length) return null;
              return (
                <span
                  className="hex-byte"
                  key={col}
                  title={`0x${hex(b)} · ${fieldLabel(b)}${
                    byteValues
                      ? ` · ${byteValues[b].length} possible bytes: ${byteValues[
                          b
                        ]
                          .slice(0, 32)
                          .map((v) => hex(v))
                          .join(", ")}${byteValues[b].length > 32 ? ", …" : ""}`
                      : ""
                  }`}
                >
                  {[1, 0].map((side) => {
                    const m = masks[b * 2 + side],
                      s = maskSymbol(m);
                    return (
                      <span
                        key={side}
                        className={
                          m === 0xffff
                            ? "unconstrained"
                            : m === 0
                              ? "conflict"
                              : allowedValues(m).length === 1
                                ? "exact"
                                : "nonzero"
                        }
                        title={`${label} · byte 0x${hex(b)} · ${fieldLabel(b)} · ${side ? "High" : "Low"} nibble: ${
                          allowedValues(m)
                            .map((n) => hex(n, 1))
                            .join(", ") || "No allowed values"
                        }`}
                      >
                        {s === "+" ? "?" : s}
                      </span>
                    );
                  })}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
