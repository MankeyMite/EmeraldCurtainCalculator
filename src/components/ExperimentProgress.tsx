import type { CurtainLab } from "../hooks/useCurtainLab";

export function ExperimentProgress({
  lab,
  snapshotId,
}: {
  lab: CurtainLab;
  snapshotId: string;
}) {
  if (lab.analysisBusy) return <>Updating candidates and recommendations…</>;
  const progress = lab.experimentProgress;
  if (!progress || progress.snapshotId !== snapshotId)
    return <>Findings updated.</>;
  const { pairsBefore, pairsAfter, pidsBefore, pidsAfter } = progress;
  return (
    <>
      {pairsBefore.toLocaleString()} → {pairsAfter.toLocaleString()} compatible{" "}
      PID/SID pairs (stored-data upper bounds, before optional RNG filtering).{" "}
      {pidsBefore === pidsAfter
        ? `Distinct PID bound remains ${pidsAfter.toLocaleString()}. `
        : `Distinct PID bound: ${pidsBefore.toLocaleString()} → ${pidsAfter.toLocaleString()}. `}
      {pairsAfter < pairsBefore &&
        pidsBefore === pidsAfter &&
        "The test rules out SID/key combinations without ruling out an entire PID. "}
      {pairsAfter === pairsBefore &&
        "This test adds no joint-count reduction under the current facts. "}
      {progress.excludedKeyDigits.map(
        ({ digit, values }) =>
          `XOR-key digit ${digit} excludes ${values.map((v) => v.toString(16).toUpperCase()).join(", ")}. `,
      )}
      {progress.eliminatedOrders.length > 0 &&
        `${progress.eliminatedOrders.length} block orders ruled out. `}
      <small>
        Contribution measured against the other currently recorded evidence.
      </small>
    </>
  );
}
