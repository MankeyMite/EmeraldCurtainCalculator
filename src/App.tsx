import { useState } from "react";
import { useCurtainLab } from "./hooks/useCurtainLab";
import { Workbench } from "./components/Workbench";
import LegacyWorkspace from "./LegacyWorkspace";
import { StarterWizard } from "./components/StarterWizard";
import { SpindaWizard } from "./components/SpindaWizard";
import { AUTOSAVE_KEY } from "./core/autosave";
export default function App() {
  const lab = useCurtainLab(AUTOSAVE_KEY, { resetSpindaGuideOnLoad: true }),
    [classic, setClassic] = useState(false),
    [spindaOpen, showSpindaGuide] = useState(false),
    [guided, showGuide] = useState(false);
  if (spindaOpen)
    return <SpindaWizard lab={lab} onExit={() => showSpindaGuide(false)} />;
  if (guided) return <StarterWizard onExit={() => showGuide(false)} />;
  return classic ? (
    <>
      <button className="return-workbench" onClick={() => setClassic(false)}>
        Return to compact workspace
      </button>
      <LegacyWorkspace lab={lab} />
    </>
  ) : (
    <Workbench
      lab={lab}
      onClassic={() => setClassic(true)}
      onStarterGuide={() => showGuide(true)}
      onSpindaGuide={() => showSpindaGuide(true)}
    />
  );
}
