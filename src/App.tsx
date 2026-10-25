import { useState } from "react";
import { useCurtainLab } from "./hooks/useCurtainLab";
import { Workbench } from "./components/Workbench";
import LegacyWorkspace from "./LegacyWorkspace";
import { StarterWizard } from "./components/StarterWizard";
export default function App() {
  const lab = useCurtainLab(),
    [classic, setClassic] = useState(false),
    [guided, setGuided] = useState(() => {
      try {
        return (
          typeof window !== "undefined" &&
          window.localStorage.getItem("emerald-starter-guide-open") === "true"
        );
      } catch {
        return false;
      }
    });
  const showGuide = (value: boolean) => {
    setGuided(value);
    try {
      window.localStorage.setItem("emerald-starter-guide-open", String(value));
    } catch {
      /* the guide reports its own storage status */
    }
  };
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
    />
  );
}
