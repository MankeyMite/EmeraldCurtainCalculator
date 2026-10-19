import { useState } from "react";
import { useCurtainLab } from "./hooks/useCurtainLab";
import { Workbench } from "./components/Workbench";
import LegacyWorkspace from "./LegacyWorkspace";
export default function App() {
  const lab = useCurtainLab(),
    [classic, setClassic] = useState(false);
  return classic ? (
    <>
      <button className="return-workbench" onClick={() => setClassic(false)}>
        Return to compact workspace
      </button>
      <LegacyWorkspace lab={lab} />
    </>
  ) : (
    <Workbench lab={lab} onClassic={() => setClassic(true)} />
  );
}
