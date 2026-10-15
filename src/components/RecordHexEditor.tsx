import { useEffect, useState } from "react";
import { parseHex, recordHex } from "../core/pokemon";
import type { Slot } from "../core/memory";

type Props = {
  slot: Slot;
  record?: Uint8Array;
  renderer: boolean;
  onApply: (bytes: Uint8Array, preview: boolean) => void;
};

export function RecordHexEditor({ slot, record, renderer, onApply }: Props) {
  const [draft, setDraft] = useState(() => (record ? recordHex(record) : ""));
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!renderer) setLive(false);
  }, [renderer]);

  let bytes: Uint8Array | undefined;
  let error = "";
  try {
    bytes = parseHex(draft);
  } catch (e) {
    error = (e as Error).message;
  }

  function edit(value: string) {
    setDraft(value);
    if (live) {
      // Partial edits never overwrite the last accepted record or fill bytes.
      let next: Uint8Array;
      try {
        next = parseHex(value);
      } catch {
        return;
      }
      onApply(next, true);
    }
  }

  return (
    <details open={renderer} className="hex-editor">
      <summary>Paste / edit 80-byte hex</summary>
      <p className="micro">
        Type or paste 160 hex digits, with optional whitespace. Edit the
        encrypted bytes directly to experiment with the curtain pattern.
      </p>
      <textarea
        aria-label="80-byte encrypted hexadecimal record"
        aria-describedby={`hex-draft-status-${slot}`}
        value={draft}
        onChange={(e) => edit(e.target.value)}
        placeholder="00 FF 01 10 A0 0A …"
        spellCheck={false}
      />
      <p id={`hex-draft-status-${slot}`} className="micro">
        {bytes
          ? "80 / 80 bytes · ready"
          : draft.trim()
            ? `${error} Preview keeps the last accepted record.`
            : "No draft entered. Missing bytes are never filled automatically."}
      </p>
      <label className="hex-live-toggle">
        <input
          type="checkbox"
          checked={live}
          onChange={(e) => {
            setLive(e.target.checked);
            if (e.target.checked && bytes) onApply(bytes, true);
          }}
        />
        Live hex preview (Renderer)
      </label>
      <div className="inline-buttons">
        <button disabled={!record} onClick={() => edit(recordHex(record!))}>
          Edit loaded slot {slot}
        </button>
        <button disabled={!bytes} onClick={() => onApply(bytes!, renderer)}>
          {renderer ? "Render hex" : "Apply as candidate"}
        </button>
      </div>
      <p className="micro">
        Live preview switches to Renderer. Painted observations stay separate.
        Edits do not repair the checksum or re-encrypt the record.
      </p>
    </details>
  );
}
