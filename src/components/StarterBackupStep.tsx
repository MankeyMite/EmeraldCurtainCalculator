import { useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import type { StarterGuideState } from "../core/starterGuide";
import { backupMoves, backupPokemonInput } from "../core/starterBackup";
import { speciesTraits } from "../core/traits";
import { NATURES } from "../core/pokemon";
import { WILD_AREAS } from "../core/rng";
import names from "../data/named-facts.json";
import { ITEM_CATALOG } from "../core/experiments";
import { ReadingInputs } from "./StarterGuideParts";
import { StarterCurtainStep } from "./StarterCurtainStep";
import { estimatedSidWindow } from "../core/starterTiming";

const speciesIds = [
  ...new Set(
    WILD_AREAS.filter(
      (a) =>
        a.kind === "land" &&
        ["Route 101", "Route 102", "Route 103"].includes(a.name),
    ).flatMap((a) => a.slots.map((s) => s.species)),
  ),
].sort((a, b) =>
  (speciesTraits(a)?.name ?? "").localeCompare(speciesTraits(b)?.name ?? ""),
);
export function StarterBackupStep({
  state,
  lab,
  onChange,
  onReturn,
}: {
  state: StarterGuideState;
  lab: CurtainLab;
  onChange: (backup: NonNullable<StarterGuideState["backup"]>) => void;
  onReturn: () => void;
}) {
  const [error, setError] = useState("");
  const backup = state.backup!;
  const draft = backup.draft;
  const update = (key: string, value: string) => {
    const next = { ...draft, [key]: value };
    if (key === "species" || key === "level") {
      const species = Number(next.species),
        level = Number(next.level);
      if (species && level >= 1 && level <= 100)
        backupMoves(species, level).forEach(
          (m, n) => (next[`move_${n}`] = String(m)),
        );
      if (key === "species") {
        const abilities =
          speciesTraits(species)?.abilities.filter((a) => a.id !== 0) ?? [];
        next.ability = abilities.length === 1 ? String(abilities[0].id) : "";
      }
    }
    onChange({ ...backup, draft: next });
    setError("");
  };
  const abilities =
    speciesTraits(Number(draft.species))?.abilities.filter((a) => a.id !== 0) ??
    [];
  return (
    <>
      <p>
        <strong>
          Swap your caught Pokémon with the starter, placing the caught Pokémon
          in Box 8, slot 5.
        </strong>{" "}
        Keep slots 4 and 6 empty. The starter's drawings and experiments stay
        saved.
      </p>
      <button
        disabled={!!lab.pendingItemTest}
        title={
          lab.pendingItemTest
            ? "Finish or cancel this experiment before swapping back."
            : undefined
        }
        onClick={onReturn}
      >
        Swap back to the starter
      </button>
      {backup.phase === "details" ? (
        <>
          <p>
            Use the Pokémon you caught and kept boxed without battling. Read its
            PC summary, then check the suggested moves and held item below.
          </p>
          <div className="starter-input-grid">
            <label>
              Species
              <select
                value={draft.species ?? ""}
                onChange={(e) => update("species", e.target.value)}
              >
                <option value="">Choose Pokémon</option>
                {speciesIds.map((id) => (
                  <option key={id} value={id}>
                    {speciesTraits(id)?.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nature
              <select
                value={draft.nature ?? ""}
                onChange={(e) => update("nature", e.target.value)}
              >
                <option value="">Choose nature</option>
                {NATURES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Gender
              <select
                value={draft.gender ?? ""}
                onChange={(e) => update("gender", e.target.value)}
              >
                <option value="">Choose gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label>
              Ability
              <select
                value={draft.ability ?? ""}
                onChange={(e) => update("ability", e.target.value)}
              >
                <option value="">Choose ability</option>
                {abilities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ReadingInputs
            draft={draft}
            onChange={(next) => {
              const levelChanged = next.level !== draft.level;
              if (levelChanged) update("level", next.level ?? "");
              else onChange({ ...backup, draft: next });
            }}
          />
          <div className="starter-input-grid">
            {Array.from({ length: 4 }, (_, n) => (
              <label key={n}>
                Move slot {n + 1}
                <select
                  value={draft[`move_${n}`] ?? ""}
                  onChange={(e) => update(`move_${n}`, e.target.value)}
                >
                  <option value="">Unknown</option>
                  <option value="0">Empty</option>
                  {names.moves
                    .filter((m) => m.id !== 0)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <label>
              Held item
              <select
                value={draft.heldItem ?? "0"}
                onChange={(e) => update("heldItem", e.target.value)}
              >
                <option value="0">None</option>
                {ITEM_CATALOG.filter((i) => i.id !== 0).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && <p role="alert">{error}</p>}
          <button
            onClick={() => {
              try {
                const input = backupPokemonInput(state, draft);
                lab.configureBackupInvestigation(
                  input.facts,
                  input.summary,
                  estimatedSidWindow(state.intro),
                  !!backup.configured,
                );
                onChange({ ...backup, configured: true, phase: "curtains" });
                setError("");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Draw this Pokémon
          </button>
        </>
      ) : (
        <>
          <p>
            The starter's remaining SIDs constrain this Pokémon's unknown PID.
            All compatible possibilities are retained.
          </p>
          <StarterCurtainStep
            lab={lab}
            state={{ ...state, species: lab.identity.species ?? state.species }}
            backup
            onTraining={() => {}}
            onMoreInfo={() =>
              onChange({
                ...backup,
                phase: "details",
                draft: {
                  ...draft,
                  ...lab.summaryDraft,
                  ...Object.fromEntries(
                    (lab.itemTestBaseline.knownFacts.moves ?? []).map(
                      (m, n) => [`move_${n}`, m === null ? "" : String(m)],
                    ),
                  ),
                  heldItem: String(
                    lab.itemTestBaseline.knownFacts.heldItem ?? 0,
                  ),
                },
              })
            }
          />
        </>
      )}
    </>
  );
}
