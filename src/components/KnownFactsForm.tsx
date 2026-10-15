import type { CurtainLab } from "../hooks/useCurtainLab";
import { NATURES } from "../core/pokemon";
import { CONTEST_NAMES, STAT_NAMES } from "../core/facts";
import { speciesTraits } from "../core/traits";
import species from "../data/species.json";

export function KnownFactsForm({ lab }: { lab: CurtainLab }) {
  const traits = speciesTraits(Number(lab.factDraft.species));
  const abilities =
    traits?.abilities.filter(
      (a, i, all) => a.id !== 0 && all.findIndex((b) => b.id === a.id) === i,
    ) ?? [];
  const assumed = new Set(lab.facts.assumed);
  const input = (key: string, label: string, max: number) => (
    <input
      aria-label={label}
      autoComplete="off"
      inputMode="numeric"
      value={lab.factDraft[key] ?? ""}
      onChange={(e) => lab.editFact(key, e.target.value)}
      placeholder="Unknown"
      title={`${label}: 0–${max}. Blank means unknown.${assumed.has(key) ? " Default assumption for a newly caught Pokémon." : ""}`}
      className={assumed.has(key) ? "assumed-input" : undefined}
    />
  );
  return (
    <section
      className="input-section known-facts"
      aria-labelledby="known-facts-title"
    >
      <h2 id="known-facts-title">Known Pokémon information</h2>
      <p className="help">
        Blank means unknown. Supplied values restrict reconstruction.
      </p>
      <div className="form-table">
        <label>
          Species
          <select
            value={lab.factDraft.species ?? ""}
            onChange={(e) => lab.editFact("species", e.target.value)}
          >
            <option value="">Unknown</option>
            {lab.factDraft.species && !traits && (
              <option value={lab.factDraft.species}>
                Internal ID {lab.factDraft.species}
              </option>
            )}
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nature
          <select
            value={lab.factDraft.nature ?? ""}
            onChange={(e) => lab.editFact("nature", e.target.value)}
          >
            <option value="">Unknown</option>
            {NATURES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pokémon gender
          <select
            aria-label="Pokémon gender"
            disabled={!traits}
            value={lab.factDraft.gender ?? ""}
            onChange={(e) => lab.editFact("gender", e.target.value)}
          >
            <option value="">
              {traits ? "Unknown" : "Select species first"}
            </option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="genderless">Genderless</option>
          </select>
        </label>
        <label>
          Ability
          <select
            disabled={!traits}
            value={lab.factDraft.ability ?? ""}
            onChange={(e) => lab.editFact("ability", e.target.value)}
          >
            <option value="">
              {traits ? "Unknown" : "Select species first"}
            </option>
            {lab.factDraft.ability &&
              !abilities.some(
                (a) => String(a.id) === lab.factDraft.ability,
              ) && (
                <option value={lab.factDraft.ability}>
                  Ability ID {lab.factDraft.ability}
                </option>
              )}
            {abilities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          OT name
          <input
            aria-label="Original trainer name"
            autoComplete="off"
            value={lab.factDraft.otName ?? ""}
            onChange={(e) => lab.editFact("otName", e.target.value)}
            placeholder="Unknown"
            title="Original trainer's exact name, including capitalization; 1 to 7 Gen 3 characters."
          />
        </label>
        <label>
          OT gender
          <select
            aria-label="Original trainer gender"
            value={lab.factDraft.otGender ?? ""}
            onChange={(e) => lab.editFact("otGender", e.target.value)}
          >
            <option value="">Unknown</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        {(["pid", "tid", "sid"] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()}
            <input
              autoComplete="off"
              value={lab.factDraft[key] ?? ""}
              onChange={(e) => lab.editFact(key, e.target.value)}
              placeholder={key === "pid" ? "Decimal or 0x…" : "Unknown"}
            />
          </label>
        ))}
        <label>
          Current EXP{input("experience", "Current EXP", 0xffffffff)}
        </label>
      </div>
      <p className="help">
        OT means original trainer, which may differ from the current player.
        Copy the exact name, including capitalization. English/international Gen
        3 characters are supported; bytes after the name terminator stay
        unknown. OT gender is separate from Pokémon gender.
      </p>
      <details className="stat-details">
        <summary>IV calculator · summary stats</summary>
        <p className="help">
          Optional. Copy the ordinary Pokémon summary values. Use maximum HP
          (the number after /), not remaining HP. Species, level, nature and EVs
          determine the IV ranges.
        </p>
        <div className="form-table">
          <label>
            Current level
            <input
              aria-label="Current level"
              inputMode="numeric"
              autoComplete="off"
              placeholder="1–100"
              value={lab.summaryDraft.level ?? ""}
              onChange={(e) => lab.editSummaryStat("level", e.target.value)}
            />
          </label>
          {STAT_NAMES.map((name, i) => (
            <label key={name}>
              {i === 0 ? "Maximum HP" : name}
              <input
                aria-label={`Summary ${i === 0 ? "maximum HP" : name}`}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Unknown"
                value={lab.summaryDraft[`stat_${i}`] ?? ""}
                onChange={(e) =>
                  lab.editSummaryStat(`stat_${i}`, e.target.value)
                }
              />
            </label>
          ))}
        </div>
        {lab.summaryError && (
          <p className="error-text" role="alert">
            {lab.summaryError}
          </p>
        )}
        <button className="text-button" onClick={lab.clearSummaryStats}>
          Clear summary stats
        </button>
        <p className="help">
          Reconstruction shows stat-only and curtain-assisted IV ranges. Ranges
          are compared separately from the PID model; only exact IVs you apply
          become known facts. Uses ordinary English Emerald summary stats.
        </p>
      </details>
      <details className="stat-details">
        <summary>EVs, IVs &amp; contest stats</summary>
        <p className="help">
          EVs: 0–255 · IVs: 0–31. IVs stay unknown until supplied.
        </p>
        <table className="known-stat-table">
          <thead>
            <tr>
              <th scope="col">Stat</th>
              <th scope="col">EV</th>
              <th scope="col">IV</th>
            </tr>
          </thead>
          <tbody>
            {STAT_NAMES.map((name, i) => (
              <tr key={name}>
                <th scope="row">{name}</th>
                <td>{input(`ev_${i}`, `${name} EV`, 255)}</td>
                <td>{input(`iv_${i}`, `${name} IV`, 31)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="text-button"
          onClick={lab.zeroEVs}
          disabled={!!lab.factError}
        >
          Set all EVs to 0
        </button>
        <h3>Contest condition</h3>
        <div className="form-table">
          {CONTEST_NAMES.map((name, i) => (
            <label key={name}>
              {name}
              {input(`contest_${i}`, `${name} condition`, 255)}
            </label>
          ))}
        </div>
        <h3>Other stored information</h3>
        <div className="form-table">
          <label>Pokérus byte{input("pokerus", "Pokérus byte", 255)}</label>
          <label>Markings byte{input("markings", "Markings byte", 255)}</label>
          <label>
            Is Egg
            <select
              className={assumed.has("isEgg") ? "assumed-input" : undefined}
              value={lab.factDraft.isEgg ?? ""}
              onChange={(e) => lab.editFact("isEgg", e.target.value)}
            >
              <option value="">Unknown</option>
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
          </label>
          <label>Held item ID{input("heldItem", "Held item ID", 65535)}</label>
          <label>Friendship{input("friendship", "Friendship", 255)}</label>
          <label>PP Ups byte{input("ppBonuses", "PP Ups byte", 255)}</label>
          <label>
            Ribbon bits{input("ribbons", "Ribbon bits", 0x07ffffff)}
          </label>
        </div>
        <p className="help">
          Pokérus uses its stored strain/duration byte; 0 means no infection
          history. Ability checks the stored selection bit, without assuming PID
          parity. For PP Ups and ribbons, 0 means none; nonzero values are
          packed data fields. Ribbon input excludes unused and fateful-encounter
          bits.
        </p>
      </details>
      <div className="fact-defaults">
        {assumed.size > 0 && (
          <p className="help">
            <strong>{assumed.size} default assumptions active.</strong> The
            preset uses EVs, contest condition, PP Ups, ribbons, Pokérus and
            markings = 0; not an Egg. Remaining defaulted fields are tinted.
            These are supplied assumptions, not recovered values. Edit or clear
            them for trained, traded or modified Pokémon.
          </p>
        )}
        <div className="inline-buttons">
          <button
            className="text-button"
            onClick={lab.applyFreshDefaults}
            disabled={!!lab.factError}
          >
            Use newly caught defaults
          </button>
          {assumed.size > 0 && (
            <button className="text-button" onClick={lab.clearDefaults}>
              Clear defaults
            </button>
          )}
          <button className="text-button" onClick={lab.clearFacts}>
            Clear all information
          </button>
        </div>
      </div>
    </section>
  );
}
