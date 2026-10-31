import type { CurtainLab } from "../hooks/useCurtainLab";
import { FACT_CATALOGS, HELD_ITEM_CATALOG } from "../core/catalogs";
import { NATURES } from "../core/pokemon";
import { speciesTraits } from "../core/traits";
import {
  type SpindaJourneyState,
  type VitaminRoute,
  spindaStoragePlacement,
} from "../core/spindaJourney";
import { NamedIdInput } from "./NamedIdInput";
import { MovePpInput } from "./MovePpInput";
import { KnownFactsForm } from "./KnownFactsForm";
import { ShinySetting } from "./ShinySetting";
import { curtainLocation } from "./SidPixelQuestion";
import { hitForNibble, recordStripLayout } from "./WorkbenchData";

export function SpindaPreparation({
  language,
  onLanguageChange,
  disabled,
}: {
  language: number;
  onLanguageChange: (language: number) => void;
  disabled?: boolean;
}) {
  const placement = spindaStoragePlacement(language);
  return (
    <>
      <label>
        Game language
        <select
          aria-label="Spinda game language"
          value={language}
          disabled={disabled}
          onChange={(e) => onLanguageChange(Number(e.target.value))}
        >
          {FACT_CATALOGS.languages
            .filter((l) => l.id !== 6)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
        </select>
      </label>
      <p>Before catching a new Spinda:</p>
      <ol>
        <li>
          Keep a full party of six Pokémon so new catches go straight to
          storage.
        </li>
        <li>
          {language === 1
            ? "For Japanese, use Box 7, slot 27 for viewing pixels. Fill slots 1–26 with any Pokémon for an easier time, and leave slot 27 empty."
            : "For English and other non-Japanese versions, fill Box 8 slots 1–4 with any Pokémon and leave slot 5 empty for viewing pixels."}
        </li>
        <li>
          Exit the PC while Box {placement.box} is selected. Your next caught
          Spinda will go directly into slot {placement.slot}.
        </li>
      </ol>
    </>
  );
}

export function SpindaInformationPage({
  lab,
  page,
}: {
  lab: CurtainLab;
  page: "information" | "moves" | "details";
}) {
  const placement = spindaStoragePlacement(
    lab.spindaMatcher?.journey?.language ?? lab.facts.language,
  );
  const field = (key: string, label: string, numeric = false) => (
    <label key={key}>
      {label}
      <input
        aria-label={label}
        inputMode={numeric ? "numeric" : "text"}
        value={lab.factDraft[key] ?? ""}
        placeholder="Unknown"
        onChange={(e) => lab.editFact(key, e.target.value)}
      />
    </label>
  );
  const named = (
    key: string,
    label: string,
    entries: typeof FACT_CATALOGS.moves,
    max: number,
  ) => (
    <NamedIdInput
      key={`${lab.activeId}/${key}`}
      label={label}
      value={lab.factDraft[key]}
      entries={entries}
      max={max}
      onChange={(v) => lab.editFact(key, v)}
    />
  );
  const select = (
    key: string,
    label: string,
    entries: { id: string | number; name: string }[],
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={lab.factDraft[key] ?? ""}
        onChange={(e) => lab.editFact(key, e.target.value)}
      >
        <option value="">Unknown</option>
        {entries.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="spinda-information">
      {page === "information" && (
        <>
          <h3>Copy the summary information</h3>
          <p>
            Enter everything you know about this catch. Leave unknown values
            blank.
          </p>
          <div className="spinda-form-grid">
            {field("nickname", "Nickname")}
            {select(
              "nature",
              "Nature",
              NATURES.map((name, id) => ({ id, name })),
            )}
            {select(
              "ability",
              "Ability",
              speciesTraits(308)!.abilities.filter(
                (a, i, all) =>
                  a.id && all.findIndex((b) => b.id === a.id) === i,
              ),
            )}
            {select("gender", "Pokémon gender", [
              { id: "male", name: "Male" },
              { id: "female", name: "Female" },
            ])}
            {field("experience", "Current EXP", true)}
            {named("ball", "Caught in", FACT_CATALOGS.balls, 15)}
          </div>
          <ShinySetting lab={lab} />
        </>
      )}
      {page === "moves" && (
        <>
          <h3>Confirm all four move slots and PP</h3>
          <p>
            The encountered level supplies a starting moveset. Copy the moves
            and PP from Spinda’s summary in Box {placement.box}, slot{" "}
            {placement.slot}. Correct every value to match. Empty slots must
            read 0.
          </p>
          {Array.from({ length: 4 }, (_, i) => (
            <div className="move-row" key={i}>
              {named(`move_${i}`, `Move ${i + 1}`, FACT_CATALOGS.moves, 65535)}
              <MovePpInput lab={lab} index={i} />
            </div>
          ))}
          <p className="help">
            Level 16 Spinda adds Psybeam as its fourth move. The exact moves and
            PP can reveal more SID digits and make move swaps useful.
          </p>
        </>
      )}
      {page === "details" && (
        <>
          <h3>Trainer and catch details</h3>
          <div className="spinda-form-grid">
            {field("tid", "Trainer ID", true)}
            {field("otName", "Original trainer name")}
            {select("otGender", "Original trainer gender", [
              { id: "male", name: "Male" },
              { id: "female", name: "Female" },
            ])}
            {named(
              "metLocation",
              "Met location",
              FACT_CATALOGS.metLocations,
              255,
            )}
            {field("metLevel", "Met level", true)}
            {named("heldItem", "Held item", HELD_ITEM_CATALOG, 65535)}
          </div>
          <p className="help">
            Fresh-catch defaults assume zero EVs and contest values. Correct
            exceptions below. Use catches belonging to this same original
            trainer throughout the guide.
          </p>
          <details>
            <summary>All remaining Pokémon information and defaults</summary>
            <KnownFactsForm lab={lab} />
          </details>
        </>
      )}
      {(lab.factError || lab.summaryError || lab.ppError) && (
        <p role="alert">{lab.factError || lab.summaryError || lab.ppError}</p>
      )}
    </section>
  );
}

export function SpindaCurtainLocator({ nibble }: { nibble: number }) {
  const bounds = recordStripLayout().bounds;
  return (
    <div
      className="spinda-inline-locator"
      aria-label={`Curtain: ${curtainLocation(nibble)}`}
    >
      <span />
      {Array.from({ length: 8 }, (_, i) => (
        <small key={i}>{i + 1}</small>
      ))}
      {Array.from({ length: 20 }, (_, y) => (
        <div className="spinda-guide-row" key={y}>
          <small>{y + 1}</small>
          {Array.from({ length: 8 }, (_, x) => {
            const hit = hitForNibble(nibble)!;
            return (
              <span
                key={x}
                className={
                  hit.displayX - bounds.x === x && hit.displayY - bounds.y === y
                    ? "selected"
                    : ""
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function SpindaVitaminShopping({
  route,
  value,
  onChange,
}: {
  route: VitaminRoute;
  value: SpindaJourneyState;
  onChange: (next: SpindaJourneyState) => void;
}) {
  return (
    <>
      <h3>Use Defense and Speed vitamin checkpoints</h3>
      <p>
        This route tests S{route.digits.join(", S")} with up to{" "}
        {route.actions.length} useful checkpoints.{" "}
        {route.unresolvedGroups
          ? "Some outcomes will still need another catch or experiment."
          : "Together these checkpoints distinguish every remaining SID."}
      </p>
      <p>
        Keep {route.iron} Iron and {route.carbos} Carbos available. After
        buying, save with the original Spinda and all vitamins in your bag.
        Reload that save after each test to reuse them.
      </p>
      {!!(route.buyIron || route.buyCarbos) && (
        <p>
          Buy {route.buyIron} Iron and {route.buyCarbos} Carbos from the left
          clerk on Lilycove Department Store 3F: ₽
          {((route.buyIron + route.buyCarbos) * 9800).toLocaleString()}.
        </p>
      )}
      <p className="help">
        Estimated {Math.ceil(route.seconds / 60)} minutes including shopping.
        The comparison uses the remaining digit values, useful checkpoints, and
        your travel estimate.
      </p>
      {!!(route.buyIron || route.buyCarbos) && (
        <button
          onClick={() =>
            onChange({
              ...value,
              iron: Math.max(value.iron, route.iron),
              carbos: Math.max(value.carbos, route.carbos),
            })
          }
        >
          I have these vitamins
        </button>
      )}
    </>
  );
}

export function SpindaStockInputs({
  value,
  onChange,
}: {
  value: SpindaJourneyState;
  onChange: (next: SpindaJourneyState) => void;
}) {
  return (
    <details>
      <summary>Vitamin stock and travel estimate</summary>
      <div className="spinda-form-grid">
        {(
          [
            ["iron", "Iron available"],
            ["carbos", "Carbos available"],
            ["shoppingSeconds", "Round trip to shop (seconds)"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={0}
              max={key === "shoppingSeconds" ? 3600 : 99}
              value={value[key]}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (
                  Number.isInteger(n) &&
                  n >= 0 &&
                  n <= (key === "shoppingSeconds" ? 3600 : 99)
                )
                  onChange({ ...value, [key]: n });
              }}
            />
          </label>
        ))}
      </div>
    </details>
  );
}
