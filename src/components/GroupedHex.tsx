import type { CurtainLab } from "../hooks/useCurtainLab";
import { workbenchMasks, digit, hitForNibble } from "./WorkbenchData";
import { hex, SUBSTRUCT_POSITIONS } from "../core/pokemon";
import { allowedValues, constraintHex } from "../core/constraints";
const header = [
  { start: 0, size: 4, name: "PID" },
  { start: 4, size: 4, name: "Original trainer ID" },
  { start: 8, size: 10, name: "Nickname" },
  { start: 18, size: 1, name: "Lang." },
  { start: 19, size: 1, name: "Flags" },
  { start: 20, size: 7, name: "OT name" },
  { start: 27, size: 1, name: "Marks" },
  { start: 28, size: 2, name: "Checksum" },
  { start: 30, size: 2, name: "Reserved" },
];
export function GroupedHex({ lab }: { lab: CurtainLab }) {
  const masks = workbenchMasks(lab),
    active = lab.hover ?? lab.selectedPixel;
  const pids = lab.sidAnalysis
    ? [...new Set(lab.sidAnalysis.candidates.map((h) => h.pid))]
    : lab.inference.pidValues;
  const pid =
    lab.mode === "renderer"
      ? lab.imported?.pid
      : pids?.length === 1
        ? pids[0]
        : undefined;
  const groups = [
    ...header,
    ...Array.from({ length: 4 }, (_, physical) => ({
      start: 32 + physical * 12,
      size: 12,
      name:
        pid === undefined
          ? `Encrypted block ${physical + 1}`
          : ["Growth", "Attacks", "EVs / condition", "Miscellaneous"][
              SUBSTRUCT_POSITIONS[pid % 24].indexOf(physical)
            ],
    })),
  ];
  const exactBytes = Array.from({ length: 80 }, (_, i) =>
    [masks[i * 2], masks[i * 2 + 1]].every((m) => m > 0 && (m & (m - 1)) === 0),
  ).filter(Boolean).length;
  return (
    <section
      className="hex-dashboard"
      aria-label="80-byte grouped encrypted record"
    >
      <div
        className="grouped-hex"
        role="group"
        aria-label="Grouped hexadecimal bytes"
      >
        {Array.from({ length: 10 }, (_, row) => (
          <div className="grouped-hex-row" key={row}>
            {groups.flatMap((group, index) => {
              const start = Math.max(row * 8, group.start),
                end = Math.min(row * 8 + 8, group.start + group.size);
              if (start >= end) return [];
              return (
                <div
                  className={`hex-segment shade-${index % 5}`}
                  key={group.start}
                  style={{ gridColumn: `span ${end - start}` }}
                >
                  <span className="hex-segment-label">
                    {group.name}
                    {start > group.start ? " · continued" : ""}
                  </span>
                  <div className="segment-bytes">
                    {Array.from({ length: end - start }, (_, i) => {
                      const byte = start + i;
                      return (
                        <span
                          className="grouped-byte"
                          key={byte}
                          data-byte={byte}
                          title={`Byte 0x${hex(byte)} · ${group.name}`}
                        >
                          {[1, 0].map((side) => {
                            const mask = masks[byte * 2 + side],
                              nibble = 16 + byte * 2 + side,
                              selected = active?.nibble === nibble;
                            return (
                              <button
                                key={side}
                                type="button"
                                className={`hex-digit ${selected ? "selected" : ""} ${allowedValues(mask).length === 1 ? "exact" : ""}`}
                                aria-label={`Byte 0x${hex(byte)} ${side ? "high" : "low"} nibble: ${
                                  allowedValues(mask)
                                    .map((n) => hex(n, 1))
                                    .join(", ") || "conflict"
                                }`}
                                aria-pressed={
                                  lab.selectedPixel?.nibble === nibble
                                }
                                onMouseEnter={() =>
                                  lab.setHover(hitForNibble(nibble))
                                }
                                onMouseLeave={() => lab.setHover(null)}
                                onFocus={() =>
                                  lab.setHover(hitForNibble(nibble))
                                }
                                onBlur={() => lab.setHover(null)}
                                onClick={() =>
                                  lab.setSelectedPixel(hitForNibble(nibble))
                                }
                              >
                                {digit(mask)}
                              </button>
                            );
                          })}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="hex-completion">
        <strong>80-byte full data</strong>
        <b>{Math.floor((exactBytes / 80) * 100)}% complete</b>
        <span>{exactBytes}/80 bytes exact</span>
        <small>
          Encrypted physical order · high nibble first. Unknown digits stay ?.
        </small>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(constraintHex(masks));
              lab.setNotice(
                "Copied the displayed byte constraints: + means nonzero; ? means unresolved.",
              );
            } catch {
              lab.setError(
                "Clipboard unavailable. Save the investigation JSON to retain these constraints.",
              );
            }
          }}
        >
          Copy constraints
        </button>
        {lab.mode === "solver" && lab.recovery?.record && (
          <button
            onClick={() => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(
                new Blob([new Uint8Array(lab.recovery!.record!)], {
                  type: "application/octet-stream",
                }),
              );
              a.download = "recovered-pokemon.ek3";
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            }}
          >
            Export exact .ek3
          </button>
        )}
      </div>
    </section>
  );
}
