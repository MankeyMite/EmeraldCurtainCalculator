import { useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { matchingAreas } from "../core/rng";
import { WildRngPanel } from "./WildRngPanel";
export function WildRngCompact({ lab }: { lab: CurtainLab }) {
  const [error, setError] = useState("");
  const defaults = {
    seed: 0,
    minAdvance: 0,
    maxAdvance: 3600,
    methods: ["H1", "H2", "H4"] as ("H1" | "H2" | "H4")[],
    areaId: matchingAreas(lab.facts)[0]?.id ?? "",
    lead: "none" as const,
    synchronizeNature: 0,
  };
  const settings = lab.rngSettings ?? defaults;
  const update = (key: "minAdvance" | "maxAdvance", value: string) => {
    try {
      lab.runRngSearch({ ...settings, [key]: Number(value) });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="wild-rng-compact">
      <label className="check-label">
        <input
          type="checkbox"
          checked={lab.rngActive}
          disabled={
            lab.origin !== "wild" || !lab.facts.species || !defaults.areaId
          }
          onChange={(e) =>
            e.target.checked ? lab.runRngSearch(settings) : lab.stopRngSearch()
          }
        />
        Limit wild RNG advances
      </label>
      <p className="micro">
        From the initial seed (default 0). Select Wild encounter and a species
        to enable.
      </p>
      <div className="timing-inputs">
        <label>
          Start advance
          <input
            aria-label="Wild RNG start advance"
            type="number"
            min={0}
            disabled={!lab.rngActive}
            value={settings.minAdvance}
            onChange={(e) => update("minAdvance", e.target.value)}
          />
        </label>
        <label>
          End advance
          <input
            aria-label="Wild RNG end advance"
            type="number"
            min={0}
            disabled={!lab.rngActive}
            value={settings.maxAdvance}
            onChange={(e) => update("maxAdvance", e.target.value)}
          />
        </label>
      </div>
      <p className="micro">
        ≈ {(settings.maxAdvance / 60).toFixed(0)} seconds at 60 calls/s. Calls
        can differ from elapsed frames.
      </p>
      {(error || lab.wildRng.error) && (
        <p role="alert" className="micro">
          {error || lab.wildRng.error}
        </p>
      )}
      <details>
        <summary>Seed, encounter and lead settings</summary>
        <WildRngPanel lab={lab} />
      </details>
    </section>
  );
}
