import { useState } from "react";
import { SummaryStatInputs } from "./SummaryStatInputs";
import {
  STARTERS,
  battleEvs,
  type StarterGuideState,
  type BattleEntry,
  type RouteSetup,
} from "../core/starterGuide";
import {
  estimatedStarterWindow,
  starterTargetFrame,
  STARTER_SEARCH_RADIUS,
  type StarterTiming,
} from "../core/starterTiming";
import { speciesTraits, genderForPid } from "../core/traits";
import { NATURES, hex } from "../core/pokemon";
import { type RngSpread } from "../core/rng";
import { STAT_NAMES } from "../core/facts";
import yields from "../data/ev-yields.json";

const images = {
  "trainer-name": new URL(
    "../assets/starter-guide/trainer-name.png",
    import.meta.url,
  ).href,
  "birch-final": new URL(
    "../assets/starter-guide/birch-final.png",
    import.meta.url,
  ).href,
  "starter-bag": new URL(
    "../assets/starter-guide/starter-bag.png",
    import.meta.url,
  ).href,
  "starter-confirm": new URL(
    "../assets/starter-guide/starter-confirm.png",
    import.meta.url,
  ).href,
  "box-placement": new URL(
    "../assets/starter-guide/box-placement.png",
    import.meta.url,
  ).href,
  "trainer-school": new URL(
    "../assets/starter-guide/trainer-school.png",
    import.meta.url,
  ).href,
};
export function GuideImage({
  name,
  caption,
}: {
  name: keyof typeof images;
  caption: string;
}) {
  return (
    <figure className="starter-guide-image">
      <img
        src={images[name]}
        alt={caption}
        width={240}
        height={160}
        decoding="async"
      />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
export function TimingOptions({
  value,
  onChange,
  intro = false,
}: {
  value: StarterTiming;
  onChange: (t: StarterTiming) => void;
  intro?: boolean;
}) {
  const field = (
    key: keyof StarterTiming,
    label: string,
    min: number,
    max: number,
  ) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={key === "first" || key === "second" ? 0.1 : 1}
        value={
          key === "calibration" && !intro
            ? value.calibration + value.offset
            : key === "uncertainty" && !intro
              ? Math.min(value[key], STARTER_SEARCH_RADIUS)
              : value[key]
        }
        onChange={(e) =>
          onChange({
            ...value,
            [key]:
              key === "uncertainty" && !intro
                ? Math.min(Number(e.target.value), STARTER_SEARCH_RADIUS)
                : Number(e.target.value),
            ...(!intro && key === "calibration" ? { offset: 0 } : {}),
          })
        }
      />
    </label>
  );
  return (
    <details open={!intro}>
      <summary>Timing uncertainty and calibration</summary>
      {!intro && <StarterTargetWindow timing={value} />}
      <div className="starter-input-grid">
        {field("first", "First countdown (seconds)", 4, 7200)}
        {field("second", "Second countdown (seconds)", 4, 7200)}
        {field(
          "uncertainty",
          intro
            ? "Search uncertainty (± RNG calls)"
            : "Search radius (± advances)",
          0,
          intro ? 10000 : STARTER_SEARCH_RADIUS,
        )}
        {intro &&
          field(
            "offset",
            "Estimated final-dialogue delay (advances)",
            -10000,
            10000,
          )}
        {field(
          "calibration",
          "Calibration adjustment (advances)",
          -10000,
          10000,
        )}
      </div>
      <p className="help">
        {intro
          ? "The initial 50-advance delay is a calibration estimate. The timer begins at the name-confirmation cue; the game seeds after the naming-screen fade. Extra calls and input delays can shift the result."
          : "The default search covers about one second early or late (±60 advances). Use A+B+Start+Select to soft reset on console or emulator. Calibration starts at zero; adjust it from a known landed advance if needed."}
      </p>
    </details>
  );
}
export function StarterTargetWindow({ timing }: { timing: StarterTiming }) {
  try {
    const target = starterTargetFrame(timing),
      range = estimatedStarterWindow(timing);
    return (
      <p className="help">
        Estimated target advance: <strong>{target}</strong> · Search:{" "}
        <strong>
          {range.minAdvance}–{range.maxAdvance}
        </strong>{" "}
        (±{Math.min(timing.uncertainty, STARTER_SEARCH_RADIUS)} advances).
        Results outside this range are excluded from the RNG search.
      </p>
    );
  } catch {
    return (
      <p role="alert">
        Correct the countdown settings to calculate the target advance.
      </p>
    );
  }
}
export function StarterTraitsForm({
  species,
  nature,
  gender,
  onChange,
  chooseSpecies = false,
}: {
  species: number;
  nature: string;
  gender: string;
  onChange: (
    key: "species" | "nature" | "gender" | "ability",
    value: string,
  ) => void;
  chooseSpecies?: boolean;
}) {
  return (
    <div className="starter-input-grid">
      {chooseSpecies && (
        <label>
          Starter
          <select
            value={species}
            onChange={(e) => onChange("species", e.target.value)}
          >
            {STARTERS.map((id) => (
              <option key={id} value={id}>
                {speciesTraits(id)?.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Nature
        <select
          value={nature}
          onChange={(e) => onChange("nature", e.target.value)}
        >
          <option value="">Not sure</option>
          {NATURES.map((name, i) => (
            <option key={i} value={i}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Gender
        <select
          value={gender}
          onChange={(e) => onChange("gender", e.target.value)}
        >
          <option value="">Not sure</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </label>
      <label>
        Ability
        <input value={speciesTraits(species)!.abilities[0].name} readOnly />
      </label>
    </div>
  );
}
export function BattleLog({
  state,
  onChange,
}: {
  state: StarterGuideState;
  onChange: (patch: Partial<StarterGuideState>) => void;
}) {
  const [species, setSpecies] = useState(288),
    [count, setCount] = useState(1),
    [multiplier, setMultiplier] = useState<1 | 2 | 4>(1),
    [error, setError] = useState("");
  const add = () => {
    try {
      const entry: BattleEntry = {
        id: crypto.randomUUID(),
        species,
        count,
        multiplier,
      };
      battleEvs([...state.battles, entry]);
      onChange({ battles: [...state.battles, entry] });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details className="starter-battle-log">
      <summary>
        Battle log and EVs · {state.battles.reduce((n, b) => n + b.count, 0)}{" "}
        defeated Pokémon
      </summary>
      <p>
        Record any defeated opponent not already listed here, including trainer
        battles and switch training. Do not log catches, escapes or victories
        while the starter was fainted. Birch’s first Zigzagoon is already
        recorded. Normal early-game gain is ×1.
      </p>
      <div className="starter-input-grid">
        <label>
          Defeated Pokémon
          <select
            value={species}
            onChange={(e) => setSpecies(Number(e.target.value))}
          >
            {yields.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Number defeated
          <input
            type="number"
            min={1}
            max={510}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <label>
          EV multiplier
          <select
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value) as 1 | 2 | 4)}
          >
            <option value={1}>×1 — no Pokérus or Macho Brace</option>
            <option value={2}>×2 — verified Pokérus or Macho Brace</option>
            <option value={4}>×4 — verified both</option>
          </select>
        </label>
      </div>
      <button onClick={add}>Record defeated Pokémon</button>
      {error && <p role="alert">{error}</p>}
      <ul>
        {state.battles.map((b) => (
          <li key={b.id}>
            {b.count} × {speciesTraits(b.species)?.name}
            {b.level !== undefined && ` (level ${b.level})`} (×{b.multiplier} EV
            gain){" "}
            <button
              onClick={() =>
                onChange({
                  battles: state.battles.filter((x) => x.id !== b.id),
                })
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <label>
        <input
          type="checkbox"
          checked={state.evsKnown}
          onChange={(e) => onChange({ evsKnown: e.target.checked })}
        />
        I have recorded every EV gain, with no unrecorded vitamins or berries
      </label>
      {!state.evsKnown && (
        <p>
          EVs will stay unknown for curtain analysis. Restore the battle log
          before using summary stats to lock IVs or planning exact training.
        </p>
      )}
      <p>
        {STAT_NAMES.map(
          (name, i) =>
            `${name} ${state.evsKnown ? battleEvs(state.battles)[i] : "?"}`,
        ).join(" · ")}
      </p>
    </details>
  );
}
export function ReadingInputs({
  draft,
  onChange,
}: {
  draft: Record<string, string>;
  onChange: (draft: Record<string, string>) => void;
}) {
  return (
    <SummaryStatInputs
      draft={draft}
      onChange={(key, value) => onChange({ ...draft, [key]: value })}
    />
  );
}
export function StarterTravelChecklist({
  plan,
  onCheck,
}: {
  plan: RouteSetup;
  onCheck?: (index: number, checked: boolean) => void;
}) {
  return (
    <>
      <p>Get to Rustboro City and do these specific things along the way:</p>
      <ol>
        {plan.instructions.slice(0, -2).map((text, i) => (
          <li key={i}>
            {onCheck ? (
              <label>
                <input
                  type="checkbox"
                  checked={plan.done[i] ?? false}
                  onChange={(e) => onCheck(i, e.target.checked)}
                />
                {text}
              </label>
            ) : (
              text
            )}
          </li>
        ))}
      </ol>
      <p>
        Checking off a listed battle records its EVs. Log any other battles
        below. If the moves differ from the plan, leave those move steps
        unchecked and choose Next to enter the actual moves.
      </p>
    </>
  );
}

export function StarterSearchResults({
  spreads,
  species,
  retry = false,
}: {
  spreads: RngSpread[];
  species: number;
  retry?: boolean;
}) {
  return (
    <>
      <p role="status">
        {spreads.length} matching PID/IV spread{spreads.length === 1 ? "" : "s"}
        .{" "}
        {spreads.length === 0
          ? "Recheck stats and EVs, or adjust the timer calibration. The search stays within the displayed range."
          : spreads.length > 1
            ? retry
              ? "Choose Back, reset with the timer and try again until exactly one PID matches. Keep your pre-starter save."
              : "After each level-up, log battles and enter all six stats again to narrow the IVs. EV recommendations use all remaining spreads."
            : "One matching PID/IV spread. Choose Next to prepare your Rustboro route."}
      </p>
      {!!spreads.length && (
        <StarterSpreadTable
          spreads={spreads.slice(0, 30)}
          species={species}
          compact
        />
      )}
      {spreads.length > 30 && (
        <p className="help">
          Showing the first 30 matches; all {spreads.length} remain possible.
        </p>
      )}
    </>
  );
}
export function StarterSpreadTable({
  spreads,
  species,
  selected,
  onSelect,
  compact = false,
}: {
  spreads: RngSpread[];
  species: number;
  selected?: number;
  onSelect?: (spread: RngSpread) => void;
  compact?: boolean;
}) {
  return (
    <div className="table-scroll">
      <table aria-label={compact ? "Matching starter advances" : undefined}>
        <thead>
          <tr>
            <th>Advance</th>
            <th>PID</th>
            {!compact && <th>Nature / gender / ability</th>}
            <th>
              {compact
                ? "IVs: HP / Atk / Def / SpA / SpD / Spe"
                : "IVs: HP / Atk / Def / Spe / SpA / SpD"}
            </th>
            {onSelect && <th>Target</th>}
          </tr>
        </thead>
        <tbody>
          {spreads.map((e) => (
            <tr
              key={`${e.advance}/${e.pid}`}
              className={selected === e.advance ? "selected" : ""}
            >
              <td>{e.advance}</td>
              <td>
                <code>{hex(e.pid, 8)}</code>
              </td>
              {!compact && (
                <td>
                  {NATURES[e.pid % 25]} / {genderForPid(species, e.pid)} /{" "}
                  {speciesTraits(species)?.abilities[e.abilitySlot].name}
                </td>
              )}
              <td>
                {(compact
                  ? [0, 1, 2, 4, 5, 3].map((i) => e.ivs[i])
                  : e.ivs
                ).join(" / ")}
              </td>
              {onSelect && (
                <td>
                  <button onClick={() => onSelect(e)}>
                    {selected === e.advance ? "Selected" : "Use this target"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
