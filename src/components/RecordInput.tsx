import type { CurtainLab } from "../hooks/useCurtainLab";
import { RecordHexEditor } from "./RecordHexEditor";
import type { Slot } from "../core/memory";

export function RecordInput({ lab }: { lab: CurtainLab }) {
  return (
    <details className="record-input" open={lab.mode === "renderer"}>
      <summary>
        {lab.mode === "renderer"
          ? "Pokémon record"
          : "Compare a Pokémon record"}
      </summary>
      <p className="help">
        An encrypted 80-byte .ek3, or 160 hex digits. Files stay in your
        browser.
      </p>
      <button
        className="drop-zone"
        onClick={() => lab.fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void lab.importFile(e.dataTransfer.files[0]);
        }}
      >
        Drop .ek3 or choose file
        {lab.target !== 5 && <small>Box 8 · slot {lab.target}</small>}
      </button>
      <input
        hidden
        ref={lab.fileRef}
        type="file"
        accept=".ek3,.bin"
        aria-label="Import encrypted Pokémon record"
        onChange={(e) => {
          void lab.importFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {lab.records[lab.target] && (
        <div className="loaded-record">
          <span>{lab.names[lab.target]}</span>
          <button
            aria-label={`Remove slot ${lab.target}`}
            onClick={() => lab.removeRecord(lab.target)}
          >
            Remove
          </button>
        </div>
      )}
      <RecordHexEditor
        key={lab.target}
        slot={lab.target}
        record={lab.records[lab.target]}
        renderer={lab.mode === "renderer"}
        onApply={(bytes, preview) => {
          lab.importBytes(bytes, "Edited hexadecimal", lab.target);
          if (preview) lab.setMode("renderer");
        }}
      />
      <details className="neighbor-input">
        <summary>Neighboring slots</summary>
        <p className="help">
          Only the top and bottom two rows use slots 4 and 6. Leave missing data
          unknown.
        </p>
        <label className="stacked-label">
          Import into
          <select
            value={lab.target}
            onChange={(e) => lab.setTarget(Number(e.target.value) as Slot)}
          >
            <option value={5}>Box 8 · slot 5 (main)</option>
            <option value={4}>Box 8 · slot 4</option>
            <option value={6}>Box 8 · slot 6</option>
          </select>
        </label>
        {([4, 6] as const).map((slot) => (
          <div key={slot} className="neighbor-row">
            <span>
              Slot {slot} · {lab.names[slot] ?? "unknown"}
            </span>
            {lab.records[slot] ? (
              <button
                onClick={() => lab.removeRecord(slot)}
                aria-label={`Remove slot ${slot}`}
              >
                Remove
              </button>
            ) : (
              <button
                onClick={() =>
                  lab.importBytes(new Uint8Array(80), "Known empty", slot)
                }
              >
                Set known empty
              </button>
            )}
          </div>
        ))}
      </details>
    </details>
  );
}
