import type { CurtainLab } from "../hooks/useCurtainLab";
import { NATURES } from "../core/pokemon";
import { CONTEST_NAMES, STAT_NAMES } from "../core/facts";
import { speciesTraits } from "../core/traits";
import species from "../data/species.json";
import { useId } from "react";
import { NamedIdInput } from "./NamedIdInput";
import {
  FACT_CATALOGS,
  HELD_ITEM_CATALOG,
  type CatalogEntry,
} from "../core/catalogs";

export function KnownFactsForm({ lab }: { lab: CurtainLab }) {
  const titleId = useId();
  const traits = speciesTraits(Number(lab.factDraft.species));
  const abilities =
    traits?.abilities.filter(
      (a, i, all) => a.id !== 0 && all.findIndex((b) => b.id === a.id) === i,
    ) ?? [];
  const assumed = new Set(lab.facts.assumed);
  const named = (
    key: string,
    label: string,
    entries: CatalogEntry[],
    max: number,
  ) => (
    <NamedIdInput
      key={`${lab.activeId}-${key}`}
      label={label}
      value={lab.factDraft[key]}
      entries={entries}
      max={max}
      onChange={(value) => lab.editFact(key, value)}
    />
  );
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
    <section className="input-section known-facts" aria-labelledby={titleId}>
      <h2 id={titleId}>Known Pokémon information</h2>
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
      <label>
        Nickname
        <input
          aria-label="Known nickname"
          value={lab.factDraft.nickname ?? ""}
          placeholder="Exact name / blank = unknown"
          autoComplete="off"
          className={assumed.has("nickname") ? "assumed-input" : undefined}
          onChange={(e) => lab.editFact("nickname", e.target.value)}
        />
      </label>
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
        <summary>Moves, PP &amp; where it was met</summary>
        <p className="help">
          Type a name and choose a suggestion. Its stored ID appears in the grey
          box automatically. Blank means unknown; “No move” means a known empty
          move slot. Origin game means the game where this Pokémon originated,
          not necessarily the game you are playing now.
        </p>
        <div className="form-table">
          {Array.from({ length: 4 }, (_, i) =>
            named(`move_${i}`, `Move ${i + 1}`, FACT_CATALOGS.moves, 65535),
          )}
          {Array.from({ length: 4 }, (_, i) => (
            <label key={`pp-${i}`}>
              Move {i + 1} current PP
              {input(`pp_${i}`, `Move ${i + 1} current PP`, 255)}
            </label>
          ))}
          {named(
            "metLocation",
            "Met location",
            FACT_CATALOGS.metLocations,
            255,
          )}
          <label>Met level{input("metLevel", "Met level", 127)}</label>
          {named("metGame", "Origin game", FACT_CATALOGS.games, 15)}
          {named("ball", "Poké Ball", FACT_CATALOGS.balls, 15)}
          {named("language", "Language", FACT_CATALOGS.languages, 255)}
        </div>
        <p className="help">
          Met location names use Emerald's Gen 3 map-section IDs, including
          named Kanto sections and special met locations. Met level is the
          stored value; hatched Pokémon may store zero.
        </p>
      </details>
      <details className="stat-details technical-fields">
        <summary>Advanced raw storage fields · filler and flags</summary>
        <p className="help">
          These are optional internal record values, not information you need to
          find on a summary screen. A “word” means two bytes (a 16-bit number).
          Header flags 0x02 means “has species”; the Egg bit is 0x04. “Is egg”
          also constrains that header bit.
        </p>
        <div className="form-table">
          {(
            [
              ["headerFlags", "Header flags byte", 255],
              ["checksum", "Known checksum", 65535],
              ["headerPadding", "Header reserved word", 65535],
              ["growthPadding", "Growth reserved word", 65535],
              ["ribbonTail", "Upper five ribbon / flag bits", 31],
            ] as const
          ).map(([key, label, max]) => (
            <label key={key}>
              {label}
              {input(key, label, max)}
            </label>
          ))}
        </div>
        <p className="help">
          <strong>Header reserved word:</strong> the uninterpreted two-byte
          field at record offsets 0x1E–0x1F, outside encryption.{" "}
          <strong>Growth reserved word:</strong> the two-byte filler at
          Growth-block offsets 0x0A–0x0B, inside encryption. Neither is an IV,
          stat or trainer ID. For ordinary, unmodified Emerald wild catches,
          creation starts these at zero. Miscellaneous’s last five bits contain
          four unused bits and the fateful-encounter flag; ordinary wild catches
          start with all five clear. Event or edited Pokémon may differ.
        </p>
        {lab.origin === "wild" && (
          <button type="button" onClick={lab.applyWildStorageDefaults}>
            Use normal wild-catch storage defaults
          </button>
        )}
        <p className="help">
          This optional preset fills missing filler/upper-flag values with zero
          and normal header flags, marking them as assumptions. The checksum is
          calculated automatically once the secure data is exact. A nickname
          only fixes characters through its terminator; trailing nickname bytes
          may remain ambiguous.
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
          {named("heldItem", "Held item", HELD_ITEM_CATALOG, 65535)}
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
            <strong>{assumed.size} default assumptions active.</strong>{" "}
            Defaulted fields are tinted, including move/PP, nickname and storage
            assumptions where active. These are supplied assumptions, not
            recovered values. Edit or clear them for trained, traded or modified
            Pokémon.
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
