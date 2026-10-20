import type { KnownFacts } from "./constraints";
import { emptyObservations } from "./constraints";
import type { Snapshot } from "./investigation";
import { analyzeConstraints, ivPossibilities } from "./inference";
import { analyzeObservations } from "./jointInference";
import { isEvidence, itemTestBaseline } from "./itemTests";
import { solveSids, projectRecord } from "./sid";
import { rankItemExperiments } from "./experiments";
import { rankControlledExperiments } from "./controlledExperiments";
import {
  rankDomainExperiments,
  type DomainQuestion,
} from "./domainExperiments";
import { pixelAssistance, visibleState } from "./pixelAssistance";
import { estimateIVs } from "./stats";
import { searchWild } from "./rngSearch";
import type { RngSettings } from "./rng";
import {
  generateSidRng,
  intersectSidCandidates,
  searchUnknownPidSids,
  type SidRngSettings,
} from "./sidRng";

export type DeductionInput = {
  identity: KnownFacts;
  snapshots: Snapshot[];
  activeId: string;
  rng?: RngSettings;
  sidRng?: SidRngSettings;
  renderMasks?: number[];
};
/** All expensive deduction runs in a worker. Pure core entry point also makes
 * complete multi-observation/reranking behavior reproducible in tests. */
export function computeDeduction(
  input: DeductionInput,
  progress?: (done: number, total: number) => void,
) {
  const { identity, snapshots } = input,
    active = snapshots.find((s) => s.id === input.activeId)!;
  const evidence = snapshots.filter(isEvidence),
    baseline = itemTestBaseline(snapshots);
  const reference = isEvidence(active)
    ? active
    : snapshots.find((s) => s.id === active.itemTest!.sourceId)!;
  const investigationInference = analyzeObservations(
    identity,
    evidence,
    reference,
  );
  const inference = input.renderMasks
    ? analyzeConstraints(input.renderMasks)
    : investigationInference;
  const pids =
    identity.pid !== undefined
      ? [identity.pid]
      : investigationInference.pidValues;
  const wildResult = input.rng
    ? searchWild(
        {
          settings: input.rng,
          identity,
          snapshots: evidence,
          ...(input.sidRng ? { sidRng: input.sidRng } : {}),
        },
        progress,
      )
    : null;
  const curtainSidAnalysis = input.rng
    ? (wildResult?.analysis ?? null)
    : identity.tid !== undefined && pids?.length && pids.length <= 32
      ? solveSids(identity, evidence, pids, undefined, 200000)
      : null;
  const sidRows =
    input.sidRng && identity.tid !== undefined
      ? generateSidRng(identity.tid, input.sidRng)
      : [];
  const sidResult =
    !input.sidRng || identity.tid === undefined
      ? null
      : curtainSidAnalysis
        ? intersectSidCandidates(curtainSidAnalysis, sidRows)
        : searchUnknownPidSids(identity, evidence, sidRows, progress);
  const sidAnalysis = input.sidRng
    ? (sidResult?.analysis ?? null)
    : curtainSidAnalysis;
  // A pending experiment previews facts/key deductions without treating unseen
  // baseline pixels as observations of the changed record.
  const recovery = sidAnalysis
    ? projectRecord(identity, active, sidAnalysis.candidates, evidence)
    : null;
  const previewInference =
    active === reference
      ? inference
      : analyzeObservations(identity, evidence, active);
  const assistance = pixelAssistance(
    active.observations,
    { ...active.knownFacts, ...identity },
    previewInference,
    recovery?.masks,
  );
  const ivCurtain = Array.from({ length: 6 }, (_, i) => {
    const values = ivPossibilities(
      recovery
        ? { ...inference, plaintextMasks: recovery.plaintext }
        : inference,
      i,
    );
    // Generated spreads establish IV bounds even before TID enables joint SID
    // enumeration. Keep their correlated tuples in the RNG result itself.
    const generated =
      wildResult && new Set(wildResult.spreads.map((s) => s.ivs[i]));
    return generated ? values.filter((v) => generated.has(v)) : values;
  });
  const ivEstimates = estimateIVs(
    {
      ...active.knownFacts,
      ...identity,
      ...(identity.nature === undefined && inference.natures.length === 1
        ? { nature: inference.natures[0] }
        : {}),
    },
    active.summaryStats ?? { stats: Array(6).fill(null) },
    ivCurtain,
  );
  const experimentTargets = (active.targets ?? []).filter(
    (n) =>
      active.observations[n] === -1 &&
      (!recovery ||
        !sidAnalysis?.candidates.length ||
        visibleState(recovery.masks[n - 16]) === -1),
  );
  const fixedIds = identity.tid !== undefined && identity.sid !== undefined;
  const domainInference =
    sidAnalysis && fixedIds
      ? (() => {
          const counts = Array.from({ length: 24 }, () =>
            Array.from({ length: 8 }, () => Array<number>(16).fill(0)),
          );
          const candidates = [
            ...new Map(sidAnalysis.candidates.map((h) => [h.pid, h])).values(),
          ];
          for (const h of candidates)
            for (let n = 0; n < 8; n++)
              counts[h.pid % 24][n][(h.key >>> (n * 4)) & 15]++;
          return {
            ...investigationInference,
            orderKeyCounts: counts,
            pidCount: BigInt(candidates.length),
            consistent: candidates.length > 0,
            orders: [...new Set(candidates.map((h) => h.pid % 24))],
          };
        })()
      : investigationInference;
  // A separate SID-generation scope does not limit PID when the supplied SID
  // survives it. Do not suppress key experiments merely because it is enabled.
  const sidScopeAllowsKnown =
    !input.sidRng || sidResult?.rows.some((r) => r.sid === identity.sid);
  const domain =
    !input.rng && sidScopeAllowsKnown && fixedIds
      ? rankDomainExperiments(identity, evidence, baseline, domainInference)
      : null;
  const items = sidAnalysis
    ? rankItemExperiments(
        sidAnalysis.candidates,
        undefined,
        baseline,
        identity,
        evidence,
      )
    : [];
  const controlled = rankControlledExperiments(
    baseline,
    identity.species,
    sidAnalysis?.candidates ?? [],
    identity,
    evidence,
  );
  // Prefer the existing joint/checksum ranker wherever it can score the action.
  // Domain questions also cover small sets with differing block positions.
  const domainQuestions: Record<string, DomainQuestion> = {};
  for (const e of domain?.experiments ?? [])
    if (!items.some((p) => p.item.id === e.item.id && p.groups > 1)) {
      const at = items.findIndex((p) => p.item.id === e.item.id);
      if (at >= 0) items.splice(at, 1);
      items.push(e);
      domainQuestions[`item-${e.item.id}`] =
        domain!.questions[`item-${e.item.id}`];
    }
  for (const e of domain?.controlledExperiments ?? [])
    if (!controlled.some((p) => p.action.id === e.action.id && p.groups > 1)) {
      const at = controlled.findIndex((p) => p.action.id === e.action.id);
      if (at >= 0) controlled.splice(at, 1);
      controlled.push(e);
      domainQuestions[e.action.id] = domain!.questions[e.action.id];
    }
  const compare = (
    a: { worstCase: number; informationGain: number },
    b: { worstCase: number; informationGain: number },
  ) => a.worstCase - b.worstCase || b.informationGain - a.informationGain;
  items.sort(compare);
  controlled.sort(compare);
  return {
    domainQuestions,
    investigationInference,
    inference,
    wildResult,
    curtainSidAnalysis,
    sidRows,
    sidResult,
    sidAnalysis,
    recovery,
    assistance,
    ivEstimates,
    experimentTargets,
    experiments: items,
    controlledExperiments: controlled,
  };
}
export type DeductionResult = ReturnType<typeof computeDeduction>;
const emptyInference = analyzeConstraints(Array(160).fill(65535));
export const EMPTY_DEDUCTION: DeductionResult = {
  domainQuestions: {} as Record<string, DomainQuestion>,
  experimentTargets: [],
  investigationInference: emptyInference,
  inference: emptyInference,
  wildResult: null,
  curtainSidAnalysis: null,
  sidRows: [],
  sidResult: null,
  sidAnalysis: null,
  recovery: null,
  assistance: {
    predictions: emptyObservations(),
    reasons: Array(192).fill(""),
    contradictions: new Set(),
    consistent: true,
    conflictReason: null,
  },
  ivEstimates: estimateIVs(
    {},
    { stats: Array(6).fill(null) },
    Array.from({ length: 6 }, () => Array.from({ length: 32 }, (_, n) => n)),
  ),
  experiments: [],
  controlledExperiments: [],
};
