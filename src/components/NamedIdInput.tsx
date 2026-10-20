import { useId, useState } from "react";
import {
  catalogName,
  resolveCatalogInput,
  type CatalogEntry,
} from "../core/catalogs";

export function NamedIdInput({
  label,
  value,
  entries,
  max,
  onChange,
  zeroHint,
}: {
  label: string;
  value?: string;
  entries: CatalogEntry[];
  max: number;
  onChange: (value: string) => void;
  zeroHint?: string;
}) {
  const id = useId();
  const [pending, setPending] = useState<{
    text: string;
    value: string;
  } | null>(null);
  const stored = value ?? "";
  const text =
    pending?.value === stored
      ? pending.text
      : stored === "0" && zeroHint
        ? ""
        : catalogName(stored, entries);
  const unresolved =
    !!text.trim() &&
    !(zeroHint && text.trim().toLowerCase() === "unknown") &&
    resolveCatalogInput(text, entries, max) === null;
  function edit(next: string) {
    const resolved = resolveCatalogInput(next, entries, max);
    const nextValue =
      !next.trim() && zeroHint
        ? "0"
        : resolved === null
          ? ""
          : String(resolved);
    // A partial/unrecognized name removes the old fact instead of silently
    // retaining it while the screen shows a different name.
    setPending(
      resolved === 0 && zeroHint ? null : { text: next, value: nextValue },
    );
    onChange(nextValue);
  }
  return (
    <div className="named-fact">
      <label htmlFor={id}>{label}</label>
      <div className="named-id-input">
        <input
          id={id}
          list={`${id}-options`}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          value={text}
          placeholder={
            stored === "0" && zeroHint
              ? zeroHint
              : "Type a name · blank is unknown"
          }
          aria-invalid={unresolved || undefined}
          aria-describedby={unresolved ? `${id}-help` : undefined}
          onChange={(e) => edit(e.target.value)}
          onBlur={() => {
            if (!unresolved) setPending(null);
          }}
        />
        <input
          className="catalog-id"
          aria-label={`${label} ID`}
          title="Stored Gen 3 ID, set automatically from the name"
          readOnly
          tabIndex={-1}
          value={stored}
          placeholder="—"
        />
      </div>
      <datalist id={`${id}-options`}>
        {zeroHint && <option value="Unknown" />}
        {entries.map((entry) => (
          <option value={entry.name} key={entry.id} />
        ))}
      </datalist>
      {unresolved && (
        <small id={`${id}-help`} role="status">
          Choose a complete listed name. This field is unknown until a name
          matches.
        </small>
      )}
    </div>
  );
}
