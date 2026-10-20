import { useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { defaultRngSettings, rngAppliesToOrigin } from "../core/rng";
import { WildRngPanel } from "./WildRngPanel";
export function WildRngCompact({ lab }: { lab: CurtainLab }) {
  const [error, setError] = useState("");
  const isStatic = lab.origin === "static";
  const defaults = defaultRngSettings(lab.origin, lab.facts);
  const settings = rngAppliesToOrigin(lab.rngSettings, lab.origin)
    ? lab.rngSettings!
    : defaults;
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
            (lab.origin !== "wild" && !isStatic) ||
            !lab.facts.species ||
            (!isStatic && !defaults.areaId)
          }
          onChange={(e) =>
            e.target.checked ? lab.runRngSearch(settings) : lab.stopRngSearch()
          }
        />
        Limit RNG advances
      </label>
      <p className="micro">
        From the initial seed (default 0). Select Wild or Static and a species.
        {isStatic &&
          " Static includes starters and ordinary gifts; Method 1 is selected by default."}
      </p>
      <div className="timing-inputs">
        <label>
          Start advance
          <input
            aria-label="RNG start advance"
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
            aria-label="RNG end advance"
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
        <summary>
          {isStatic
            ? "Seed and generation methods"
            : "Seed, encounter and lead settings"}
        </summary>
        <WildRngPanel lab={lab} />
      </details>
    </section>
  );
}
