import { STAT_NAMES } from "../core/facts";

// Emerald summary: HP / Sp. Atk, Attack / Sp. Def, Defense / Speed.
// Storage and stat formulas still use HP, Atk, Def, Spe, SpA, SpD indices.
const SUMMARY_DISPLAY_ORDER = [0, 4, 1, 5, 2, 3];
export function SummaryStatInputs({
  draft,
  onChange,
}: {
  draft: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="form-table summary-stat-inputs">
      <label className="summary-level">
        Current level
        <input
          aria-label="Current level"
          inputMode="numeric"
          autoComplete="off"
          placeholder="1–100"
          value={draft.level ?? ""}
          onChange={(e) => onChange("level", e.target.value)}
        />
      </label>
      {SUMMARY_DISPLAY_ORDER.map((i) => (
        <label key={i}>
          {i === 0 ? "Maximum HP" : STAT_NAMES[i]}
          <input
            aria-label={`Summary ${i === 0 ? "maximum HP" : STAT_NAMES[i]}`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Unknown"
            value={draft[`stat_${i}`] ?? ""}
            onChange={(e) => onChange(`stat_${i}`, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
