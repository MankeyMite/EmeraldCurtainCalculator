import { useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";

export function PokeblockExperiment({ lab }: { lab: CurtainLab }) {
  const [values, setValues] = useState(
    () =>
      lab.itemTestBaseline.experimentPokeblock?.map(String) ??
      Array<string>(6).fill(""),
  );
  const valid = values.every(
    (v) =>
      v.trim() !== "" && Number.isInteger(Number(v)) && +v >= 0 && +v <= 255,
  );
  return (
    <details>
      <summary>Evaluate a Pokéblock</summary>
      <p>
        Enter its five flavors and Feel. Known Nature and all six original
        contest values (including Sheen below 255) are required. Predictions
        account for Nature rounding and saturation; enter verified values or
        review any active assumptions.
      </p>
      <div className="stat-inputs">
        {["Spicy", "Dry", "Sweet", "Bitter", "Sour", "Feel"].map((name, i) => (
          <label key={name}>
            {name}
            <input
              type="number"
              min={0}
              max={255}
              value={values[i]}
              onChange={(e) =>
                setValues(values.map((v, n) => (n === i ? e.target.value : v)))
              }
            />
          </label>
        ))}
      </div>
      <button
        disabled={!valid || !!lab.pendingItemTest || lab.analysisBusy}
        onClick={() => lab.setExperimentPokeblock(values.map(Number))}
      >
        Evaluate this Pokéblock
      </button>
      <button
        disabled={!!lab.pendingItemTest}
        onClick={() => {
          setValues(Array<string>(6).fill(""));
          lab.setExperimentPokeblock(undefined);
        }}
      >
        Clear Pokéblock
      </button>
      {lab.itemTestBaseline.experimentPokeblock && (
        <p role="status">
          Entered Pokéblock included in ranking. A test appears only if its
          predicted changes can exclude remaining possibilities.
        </p>
      )}
    </details>
  );
}
