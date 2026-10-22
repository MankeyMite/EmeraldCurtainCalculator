import { useMemo } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { speciesTraits } from "../core/traits";
import { allowedValues } from "../core/constraints";
import { hex } from "../core/pokemon";
import { valueRanges } from "../core/stats";
import {
  workbenchMasks,
  workbenchOrders,
  workbenchEvs,
  digit,
} from "./WorkbenchData";
import { sidDisplay } from "../core/sidDisplay";
import { blockOrder, BLOCK_CODES } from "../core/inspection";

function evBounds(values: number[]) {
  if (!values.length) return "None";
  const min = Math.min(...values),
    max = Math.max(...values);
  return min === max ? String(min) : `${min}–${max}`;
}
export function RecoveryOverview({
  lab,
  onInvestigate,
}: {
  lab: CurtainLab;
  onInvestigate: (field: string) => void;
}) {
  const {
    imported,
    masks,
    pids,
    count,
    ivs,
    sidValues,
    sidCount,
    key,
    sidText,
  } = useMemo(() => {
    const imported = lab.mode === "renderer" ? lab.imported : undefined;
    const masks = workbenchMasks(lab),
      pids = imported
        ? [imported.pid]
        : lab.sidAnalysis
          ? [...new Set(lab.sidAnalysis.candidates.map((h) => h.pid))]
          : (lab.sidRngResult?.pidValues ??
            (lab.rngActive
              ? lab.wildRng.result?.spreads.map((s) => s.pid)
              : lab.inference.pidValues));
    const count = pids ? BigInt(new Set(pids).size) : lab.inference.pidCount;
    const ivs = Array.from({ length: 6 }, (_, i) => {
      if (imported) return [imported.ivs[i]];
      if (lab.recovery) {
        return Array.from({ length: 32 }, (_, v) => v).filter((v) => {
          const requirements = new Map<
            number,
            { mask: number; value: number }
          >();
          for (let bit = 0; bit < 5; bit++) {
            const pos = 320 + i * 5 + bit,
              n = Math.floor(pos / 4),
              shift = pos % 4,
              old = requirements.get(n) ?? { mask: 0, value: 0 };
            old.mask |= 1 << shift;
            old.value |= ((v >>> bit) & 1) << shift;
            requirements.set(n, old);
          }
          return (
            lab.ivEstimates[i].combined.includes(v) &&
            [...requirements].every(([n, r]) =>
              allowedValues(lab.recovery!.plaintext[n]).some(
                (d) => (d & r.mask) === r.value,
              ),
            )
          );
        });
      }
      return lab.ivEstimates[i].combined;
    });
    const sidValues = imported
      ? [imported.sid]
      : (lab.sidAnalysis?.sidValues ??
        lab.sidRngResult?.rows.map((r) => r.sid));
    const sidCount = sidValues?.length ?? Number(lab.sid.count);
    const key = imported
      ? Array.from(
          { length: 8 },
          (_, n) => 1 << ((imported.key >>> (n * 4)) & 15),
        )
      : lab.sidAnalysis
        ? Array.from({ length: 8 }, (_, n) =>
            lab.sidAnalysis!.candidates.reduce(
              (m, h) => m | (1 << ((h.key >>> (n * 4)) & 15)),
              0,
            ),
          )
        : lab.inference.keyMasks;
    const sidText = sidDisplay(masks.slice(12, 16), sidValues);
    return {
      imported,
      masks,
      pids,
      count,
      ivs,
      sidValues,
      sidCount,
      key,
      sidText,
    };
  }, [
    lab.mode,
    lab.imported,
    lab.recovery,
    lab.inference,
    lab.sidAnalysis,
    lab.sidRngSettings,
    lab.sidRngResult,
    lab.rngActive,
    lab.wildRng.result,
    lab.suppliedMasks,
    lab.ivEstimates,
    lab.sid.count,
  ]);
  const pattern = (start: number, length: number) =>
    masks
      .slice(start, start + length)
      .map(digit)
      .reverse()
      .join("");
  const evs = workbenchEvs(lab),
    orders = workbenchOrders(lab),
    blocks = blockOrder(orders);
  return (
    <section className="recovery-overview" aria-label="Live recovery values">
      <h2>
        Species:{" "}
        <span>
          {speciesTraits(imported?.species ?? lab.facts.species)?.name ??
            "Unknown"}
        </span>
      </h2>
      {imported && (
        <small>Imported record preview · separate from observed evidence</small>
      )}
      <div>
        <h3>
          PID:{" "}
          <code>0x{pids?.length === 1 ? hex(pids[0], 8) : pattern(0, 8)}</code>
        </h3>
        <small>
          {count.toLocaleString()}{" "}
          {pids
            ? "matching candidates"
            : "possible candidates · stored-data bound"}
        </small>
        {count !== 1n && (
          <button onClick={() => onInvestigate("PID")}>Investigate PID</button>
        )}
      </div>
      <div>
        <h3>
          SID: <code>{sidText}</code>
        </h3>
        <small>
          {sidCount.toLocaleString()}{" "}
          {sidValues ? "surviving SIDs" : "possible values · upper bound"}
        </small>
        {sidCount !== 1 && (
          <button onClick={() => onInvestigate("SID")}>Investigate SID</button>
        )}
      </div>
      <div>
        <h3>IVs</h3>
        {lab.ivEstimates?.some((row) => row.note) && (
          <small>
            IV bounds include unknown EVs or nature. Verified EVs/nature narrow
            them further.
          </small>
        )}
        <div className="iv-overview">
          {[0, 1, 2, 4, 5, 3].map((i) => (
            <span key={i}>
              <b>{["HP", "ATK", "DEF", "Speed", "Sp.Atk", "Sp.Def"][i]}:</b>{" "}
              {valueRanges(ivs[i])}
            </span>
          ))}
        </div>
        {ivs.some((v) => v.length !== 1) && (
          <button onClick={() => onInvestigate("IVs")}>Investigate IVs</button>
        )}
      </div>
      <div>
        <h3>EVs</h3>
        <small>
          Minimum–maximum bounds; some intermediate values may be excluded.
        </small>
        <div className="iv-overview ev-overview">
          {[0, 1, 2, 4, 5, 3].map((i) => (
            <span key={i}>
              <b>{["HP", "ATK", "DEF", "Speed", "Sp.Atk", "Sp.Def"][i]}:</b>{" "}
              {evBounds(evs[i])}
            </span>
          ))}
        </div>
        {evs.some((v) => v.length !== 1) && (
          <button onClick={() => onInvestigate("EVs")}>Investigate EVs</button>
        )}
      </div>
      <div>
        <h3>
          XOR key: <code>0x{key.slice().reverse().map(digit).join("")}</code>
        </h3>
        {key.some((m) => allowedValues(m).length !== 1) && (
          <button onClick={() => onInvestigate("XOR key")}>
            Narrow the key
          </button>
        )}
      </div>
      <div>
        <h3>
          Permutation:{" "}
          <code>
            {blocks.map((b) => (b === null ? "?" : BLOCK_CODES[b])).join(" - ")}
          </code>
        </h3>
        <small>
          Physical block order · G Growth · A Attacks · E EVs/condition · M Misc
        </small>
        <small>
          {orders.length
            ? `${orders.length} compatible ${orders.length === 1 ? "permutation" : "permutations"}`
            : "No compatible permutation established"}
        </small>
      </div>
      {lab.analysisBusy && <small role="status">{lab.analysisStatus}</small>}
    </section>
  );
}
