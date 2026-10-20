import type { CurtainLab } from "../hooks/useCurtainLab";
export function ShinySetting({ lab }: { lab: CurtainLab }) {
  return (
    <label>
      Is this Pokémon shiny?
      <select
        value={lab.factDraft.shiny ?? ""}
        onChange={(e) => lab.editFact("shiny", e.target.value)}
      >
        <option value="">Unknown</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}
