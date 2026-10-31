import type { CurtainLab } from "../hooks/useCurtainLab";
import { SpindaMatcher } from "./SpindaMatcher";

export function SpindaWizard({
  lab,
  onExit,
}: {
  lab: CurtainLab;
  onExit: () => void;
}) {
  return (
    <main className="starter-wizard spinda-wizard">
      <header>
        <div>
          <p className="starter-eyebrow">SID Finder</p>
          <h1>Find SID with Spinda</h1>
        </div>
        <button onClick={onExit}>Return to investigator</button>
      </header>
      <p className="starter-progress">
        Refreshing the site starts a new Spinda guide.
      </p>
      <SpindaMatcher lab={lab} startAtBeginning resetOnRefresh />
    </main>
  );
}
