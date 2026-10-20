import type { CurtainLab } from "../hooks/useCurtainLab";
import species from "../data/species.json";
import { speciesTraits } from "../core/traits";
import { NATURES } from "../core/pokemon";
import { NamedIdInput } from "./NamedIdInput";
import { FACT_CATALOGS } from "../core/catalogs";
import { KnownFactsForm } from "./KnownFactsForm";
import { SidRngPanel } from "./SidRngPanel";
import { WildRngCompact } from "./WildRngCompact";
import { speciesNickname } from "../core/facts";
import { ORIGINS } from "../core/investigation";
import { ShinySetting } from "./ShinySetting";
import { MovePpInput } from "./MovePpInput";
export function PokemonInfoForm({
  lab,
  onSid,
}: {
  lab: CurtainLab;
  onSid: () => void;
}) {
  const traits = speciesTraits(lab.facts.species),
    assumed = new Set(lab.facts.assumed);
  const input = (key: string, label: string, placeholder = "Unknown") => (
    <input
      aria-label={label}
      value={lab.factDraft[key] ?? ""}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      inputMode={
        ["metLevel", "tid", "sid", "experience"].includes(key)
          ? "numeric"
          : "text"
      }
      placeholder={placeholder}
      className={assumed.has(key) ? "assumed-input" : ""}
      onChange={(e) => lab.editFact(key, e.target.value)}
    />
  );
  const named = (
    key: string,
    label: string,
    catalog: typeof FACT_CATALOGS.moves,
    max: number,
  ) => (
    <NamedIdInput
      key={`${lab.activeId}/${key}`}
      label={label}
      value={lab.factDraft[key]}
      entries={catalog}
      max={max}
      onChange={(value) => lab.editFact(key, value)}
      zeroHint={
        key.startsWith("move_") ? "Empty move · type a move name" : undefined
      }
    />
  );
  const abilities =
    traits?.abilities.filter(
      (a, i, all) => a.id && all.findIndex((b) => a.id === b.id) === i,
    ) ?? [];
  return (
    <div className="pokemon-info-form">
      <div className="primary-facts">
        <div className="species-name-field">
          <label>
            Species
            <select
              value={lab.factDraft.species ?? ""}
              onChange={(e) => lab.editFact("species", e.target.value)}
            >
              <option value="">Unknown</option>
              {species.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="nickname-field">
            <span>
              Nickname{" "}
              {lab.facts.nickname === undefined &&
                speciesNickname(lab.facts.species) && (
                  <button
                    type="button"
                    onClick={() =>
                      lab.editFact(
                        "nickname",
                        speciesNickname(lab.facts.species)!,
                      )
                    }
                  >
                    Use species name
                  </button>
                )}
            </span>
            {input("nickname", "Nickname", "Exact name / blank = unknown")}
          </label>
        </div>
        {named("metLocation", "Met location", FACT_CATALOGS.metLocations, 255)}
        <label>Met level{input("metLevel", "Met level")}</label>
        <ShinySetting lab={lab} />
        <label>
          Nature
          <select
            value={lab.factDraft.nature ?? ""}
            onChange={(e) => lab.editFact("nature", e.target.value)}
          >
            <option value="">Unknown</option>
            {NATURES.map((name, i) => (
              <option key={i} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ability
          <select
            value={lab.factDraft.ability ?? ""}
            disabled={!traits}
            onChange={(e) => lab.editFact("ability", e.target.value)}
          >
            <option value="">{traits ? "Unknown" : "Select species"}</option>
            {abilities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gender
          <select
            aria-label="Pokémon gender"
            value={lab.factDraft.gender ?? ""}
            disabled={!traits}
            onChange={(e) => lab.editFact("gender", e.target.value)}
          >
            <option value="">{traits ? "Unknown" : "Select species"}</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="genderless">Genderless</option>
          </select>
        </label>
        {lab.facts.ability !== undefined &&
          new Set(abilities.map((a) => a.id)).size > 1 && (
            <small className="ability-note">
              Ability constrains the stored ability bit. PID counts narrow when
              curtain pixels or the selected encounter RNG link that bit to the
              identity.
            </small>
          )}
        <label>Trainer ID{input("tid", "Trainer ID")}</label>
        <label>Secret ID{input("sid", "Secret ID")}</label>
        {named("ball", "Poké Ball", FACT_CATALOGS.balls, 15)}
        <label>OT name{input("otName", "Original trainer name")}</label>
        <label>
          OT gender
          <select
            value={lab.factDraft.otGender ?? ""}
            aria-label="Original trainer gender"
            onChange={(e) => lab.editFact("otGender", e.target.value)}
          >
            <option value="">Unknown</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </label>
        <label>EXP points{input("experience", "Current EXP")}</label>
      </div>
      <div className="stats-moves">
        <section className="summary-inputs">
          <h2>Summary stats</h2>
          <label className="level-field">
            Current level
            <input
              aria-label="Current level"
              inputMode="numeric"
              placeholder="Required"
              aria-required="true"
              title="Required for stat-based IV recovery; 1–100. SID and pixel analysis can run without it."
              value={lab.summaryDraft.level ?? ""}
              onChange={(e) => lab.editSummaryStat("level", e.target.value)}
            />
          </label>
          <div className="summary-grid">
            {[0, 4, 1, 5, 2, 3].map((i) => (
              <label key={i}>
                {
                  [
                    "Max HP",
                    "Attack",
                    "Defense",
                    "Speed",
                    "Sp. Atk",
                    "Sp. Def",
                  ][i]
                }
                <input
                  aria-label={`Summary ${["maximum HP", "Attack", "Defense", "Speed", "Sp. Attack", "Sp. Defense"][i]}`}
                  placeholder="Required"
                  aria-required="true"
                  title="Required for stat-based IV recovery. Copy the summary screen value."
                  inputMode="numeric"
                  value={lab.summaryDraft[`stat_${i}`] ?? ""}
                  onChange={(e) =>
                    lab.editSummaryStat(`stat_${i}`, e.target.value)
                  }
                />
              </label>
            ))}
          </div>
        </section>
        <section className="moves-inputs">
          <h2>Moves and PP</h2>
          {Array.from({ length: 4 }, (_, i) => (
            <div className="move-row" key={i}>
              {named(`move_${i}`, `Move ${i + 1}`, FACT_CATALOGS.moves, 65535)}
              <MovePpInput lab={lab} index={i} />
            </div>
          ))}
        </section>
      </div>
      <div className="assumption-controls">
        <div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={
                !!lab.facts.assumed?.some(
                  (key) => key.startsWith("ev_") || key.startsWith("contest_"),
                )
              }
              onChange={(e) =>
                e.target.checked
                  ? lab.applyFreshDefaults()
                  : lab.clearDefaults()
              }
            />
            Assume freshly caught Pokémon
          </label>
          <p className="micro">
            Zero EVs/contest data, base friendship, no held item and full known
            move PP. IVs remain unknown. Assumed inputs are tinted; edit any
            exception.
          </p>
          <SidRngPanel lab={lab} compact onCandidates={onSid} />
        </div>
        <div>
          <label>
            Obtaining method
            <select
              value={lab.origin}
              onChange={(e) =>
                lab.setOrigin(e.target.value as typeof lab.origin)
              }
            >
              {ORIGINS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <WildRngCompact lab={lab} />
        </div>
      </div>
      <details className="remaining-fields">
        <summary>View and edit remaining fields</summary>
        <label>
          Known PID (optional)
          {input("pid", "Known PID", "Decimal or 0x hexadecimal")}
        </label>
        <KnownFactsForm lab={lab} showShiny={false} />
      </details>
      <p className="entry-defaults-note micro">
        New tests start with English Emerald, normal non-Egg flags, empty move
        slots and full PP as you select moves. The species name is the default
        nickname; edit its exact spelling and case if renamed. All defaults can
        be edited or cleared. Stats are required for stat-based IV recovery.
      </p>
    </div>
  );
}
