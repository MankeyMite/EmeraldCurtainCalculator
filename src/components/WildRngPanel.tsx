import { useEffect, useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import {
  matchingAreas,
  parseRngNumber,
  validateRngSettings,
  WILD_AREAS,
  WILD_METHODS,
  type WildMethod,
  type WildLead,
} from "../core/rng";
import { hex, NATURES } from "../core/pokemon";
import { valueRanges } from "../core/stats";

const kinds: Record<string, string> = {
  land: "Grass / cave",
  surf: "Surfing",
  rock: "Rock Smash (unmodified encounter rate)",
  oldRod: "Old Rod",
  goodRod: "Good Rod",
  superRod: "Super Rod",
};
const statNames = ["HP", "Attack", "Defense", "Speed", "Sp. Atk", "Sp. Def"];
export function WildRngPanel({ lab }: { lab: CurtainLab }) {
  const [seed, setSeed] = useState("0"),
    [min, setMin] = useState("0"),
    [max, setMax] = useState("99999");
  const [areaId, setAreaId] = useState(""),
    [methods, setMethods] = useState<WildMethod[]>([...WILD_METHODS]);
  const [lead, setLead] = useState<WildLead>("none"),
    [sync, setSync] = useState(0),
    [error, setError] = useState("");
  const saved = JSON.stringify(lab.rngSettings);
  useEffect(() => {
    const settings = lab.rngSettings;
    if (!settings) return;
    setSeed(String(settings.seed));
    setMin(String(settings.minAdvance));
    setMax(String(settings.maxAdvance));
    setAreaId(settings.areaId);
    setMethods(settings.methods);
    setLead(settings.lead);
    setSync(settings.synchronizeNature);
  }, [saved]);
  if (lab.origin !== "wild") return null;
  const areas = matchingAreas(lab.facts);
  const chosenArea = areaId || areas[0]?.id || "";
  const result = lab.wildRng.result;
  const pids = [...new Set(result?.spreads.map((s) => s.pid) ?? [])];
  const selected = WILD_AREAS.find((a) => a.id === lab.rngSettings?.areaId);
  const eligible =
    lab.facts.species !== undefined && !lab.factError && !lab.summaryError;
  return (
    <section
      className="wild-rng-panel investigation-card"
      aria-label="Wild encounter RNG search"
    >
      <h3>Find PID and IVs from wild RNG</h3>
      <p>
        Search your seed and advance range using known traits, summary stats and
        saved curtain drawings. A known PID is not required. Seed 0 is prefilled
        for Emerald.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            lab.runRngSearch(
              validateRngSettings({
                seed: parseRngNumber(seed),
                minAdvance: parseRngNumber(min),
                maxAdvance: parseRngNumber(max),
                areaId: chosenArea,
                methods,
                lead,
                synchronizeNature: sync,
              }),
            );
            setError("");
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        <div className="rng-inputs">
          <label>
            Seed
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="0 or 0x00000000"
            />
          </label>
          <label>
            Minimum advances
            <input
              inputMode="numeric"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </label>
          <label>
            Maximum advances
            <input
              inputMode="numeric"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </label>
        </div>
        <label>
          Encounter area
          <select
            value={chosenArea}
            onChange={(e) => setAreaId(e.target.value)}
          >
            {!areas.length && (
              <option value="">No matching encounter area</option>
            )}
            {!!areaId && !areas.some((a) => a.id === areaId) && (
              <option value={areaId}>
                {WILD_AREAS.find((a) => a.id === areaId)?.name} (check known met
                data)
              </option>
            )}
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {kinds[a.kind]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="rng-methods">
          <legend>Wild methods to search</legend>
          {WILD_METHODS.map((method) => (
            <label key={method}>
              <input
                type="checkbox"
                checked={methods.includes(method)}
                onChange={(e) =>
                  setMethods(
                    e.target.checked
                      ? [...methods, method]
                      : methods.filter((m) => m !== method),
                  )
                }
              />
              {method}
            </label>
          ))}
        </fieldset>
        <details>
          <summary>Lead ability at the encounter</summary>
          <label>
            Lead effect
            <select
              value={lead}
              onChange={(e) => setLead(e.target.value as WildLead)}
            >
              <option value="none">
                No generation effect (e.g. starter's Blaze / Torrent / Overgrow)
              </option>
              <option value="synchronize">Synchronize</option>
              <option value="cuteCharmM">Cute Charm · male lead</option>
              <option value="cuteCharmF">Cute Charm · female lead</option>
              <option value="pressure">Pressure / Hustle / Vital Spirit</option>
            </select>
          </label>
          {lead === "synchronize" && (
            <label>
              Lead's nature
              <select
                value={sync}
                onChange={(e) => setSync(Number(e.target.value))}
              >
                {NATURES.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="help">
            Use the lead and species as they were when caught. Static, Magnet
            Pull, Intimidate/Keen Eye extra calls, Safari Pokéblocks, Route 119
            Feebas tiles and special encounters are outside this search.
          </p>
        </details>
        <p className="help">
          Both advance bounds are included; at most 1,000,000 advances per
          search. Advance 0 is the seed before the encounter-slot call (before
          the encounter check for Rock Smash). These are RNG calls, not elapsed
          seconds.
        </p>
        <div className="inline-buttons">
          <button
            disabled={!eligible || !chosenArea || !methods.length}
            type="submit"
          >
            Search and use matching spreads
          </button>
          {lab.rngSettings && (
            <button type="button" onClick={lab.stopRngSearch}>
              {lab.wildRng.busy
                ? "Cancel RNG search"
                : "Turn off RNG constraints"}
            </button>
          )}
        </div>
        {!eligible && (
          <p className="help">
            Choose the species and correct invalid known information to search.
            PID and IVs can stay blank.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </form>
      {lab.rngSettings && (
        <p className="help">
          Active scope: seed 0x{hex(lab.rngSettings.seed, 8)}, advances{" "}
          {lab.rngSettings.minAdvance.toLocaleString()}–
          {lab.rngSettings.maxAdvance.toLocaleString()},{" "}
          {lab.rngSettings.methods.join(" / ")}, {selected?.name} ·{" "}
          {kinds[selected?.kind ?? ""]}, lead {lab.rngSettings.lead}. This scope
          is saved with your investigation.
        </p>
      )}
      {lab.wildRng.busy && (
        <p role="status">
          {lab.wildRng.progress < 100
            ? `Searching advances… ${lab.wildRng.progress}%`
            : "Checking matching spreads against saved observations and possible SIDs…"}
        </p>
      )}
      {lab.wildRng.error && <p role="alert">{lab.wildRng.error}</p>}
      {result && (
        <div className="rng-findings" role="status">
          <p>
            <strong>
              {pids.length.toLocaleString()} matching{" "}
              {pids.length === 1 ? "PID" : "PIDs"}
            </strong>{" "}
            · {result.spreads.length.toLocaleString()} distinct PID/IV{" "}
            {result.spreads.length === 1 ? "spread" : "spreads"}.{" "}
            {pids.length === 1 && (
              <>
                Derived PID:{" "}
                <strong>
                  {pids[0]} (0x{hex(pids[0], 8)})
                </strong>
                .
              </>
            )}
          </p>
          {!result.spreads.length ? (
            <p>
              No match in this scope. Widen the range or check the seed, lead,
              area, known facts and drawing. The search has not chosen a
              substitute PID.
            </p>
          ) : (
            <>
              <p>
                These results constrain recovery and the next item ranking
                automatically. They remain conditional on this RNG scope;
                supplied facts stay separate.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Derived IVs</th>
                      {statNames.map((name) => (
                        <th key={name}>{name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th>All matching spreads</th>
                      {statNames.map((name, i) => (
                        <td key={name}>
                          {valueRanges(
                            [
                              ...new Set(result.spreads.map((s) => s.ivs[i])),
                            ].sort((a, b) => a - b),
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {lab.identity.tid === undefined && (
                <p>
                  Enter the original trainer TID to combine these spreads with
                  joint SID recovery and item recommendations.
                </p>
              )}
              <details>
                <summary>Matching spreads and advances</summary>
                <p className="help">
                  Each row keeps one correlated PID/IV spread. Repeated
                  encounter advances and equivalent methods do not add extra
                  weight. Showing up to 100 rows of {result.spreads.length}.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>First advance</th>
                        <th>Last advance</th>
                        <th>Method</th>
                        <th>PID</th>
                        <th>IVs · HP / Atk / Def / Spe / SpA / SpD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.spreads.slice(0, 100).map((s) => (
                        <tr key={`${s.pid}/${s.ivs.join()}`}>
                          <td>{s.advance}</td>
                          <td>{s.lastAdvance}</td>
                          <td>{s.methods.join(" / ")}</td>
                          <td>
                            {s.pid} · 0x{hex(s.pid, 8)}
                          </td>
                          <td>{s.ivs.join(" / ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </div>
      )}
    </section>
  );
}
