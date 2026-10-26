import type { KnownFacts } from "./constraints";
import {
  allowedSidValues,
  sidAllowed,
  validateSidDigitFilters,
} from "./sidDigitFilters";
import { emptyObservations } from "./constraints";
import type { Snapshot } from "./investigation";
import {
  analyzeConstraints,
  ivPossibilities,
  knownPlaintext,
} from "./inference";
import { analyzeObservations } from "./jointInference";
import { isEvidence, isRecorded, itemTestBaseline } from "./itemTests";
import { starterExperimentSource } from "./starterExperimentFlow";
import { usefulStarterPixels, type SidQuestion } from "./starterRoute";
import { solveSids, projectRecord, compileChecksumSupport } from "./sid";
import { rankPixelDomains } from "./experimentOutcomes";
import { rankItemExperiments, isInformativeExperiment } from "./experiments";
import { experimentProgress } from "./experimentProgress";
import { judgeIvDomains } from "./ivJudge";
import { rankControlledExperiments } from "./controlledExperiments";
import {
  rankDomainExperiments,
  type DomainQuestion,
} from "./domainExperiments";
import { pixelAssistance } from "./pixelAssistance";
import { scopeExperimentDomain } from "./experimentScope";
import { estimateIVs } from "./stats";
import { searchWild } from "./rngSearch";
import { scanWildSpreads, type RngSettings } from "./rng";
import {
  spindaInfoPlaintext,
  spindaRngEvidence,
  type SpindaSidGuideState,
} from "./spindaSidGuide";
import {
  spindaRemainingSids,
  spindaStatCandidate,
  testedSpindaDigits,
} from "./spindaUsefulness";
import { estimateNextSpinda } from "./nextSidStep";
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
  sidDigitFilters?: number[];
  sidCandidates?: number[];
  renderMasks?: number[];
  spindaGuide?: { guide: SpindaSidGuideState; settings: RngSettings };
  spindaPlanning?: { settings: RngSettings; tested: number[] };
  backupGuide?: boolean;
  starterGuide?: boolean; // The guided questions use encrypted pixels, not checksums.
};
export const DEDUCTION_PHASE_LABELS = {
  waiting: "Waiting to calculate…",
  inference: "Checking curtain constraints…",
  rng: "Searching encounter spreads and SIDs…",
  sid: "Filtering Secret ID candidates…",
  recovery: "Projecting recovered pixels…",
  experiments: "Ranking next experiments…",
} as const;
export type DeductionPhase = keyof typeof DEDUCTION_PHASE_LABELS;
/** All expensive deduction runs in a worker. Pure core entry point also makes
 * complete multi-observation/reranking behavior reproducible in tests. */
export function computeDeduction(
  input: DeductionInput,
  progress?: (done: number, total: number) => void,
  phase?: (phase: DeductionPhase) => void,
) {
  phase?.("inference");
  if (input.sidDigitFilters) validateSidDigitFilters(input.sidDigitFilters);
  const { identity, snapshots } = input,
    active = snapshots.find((s) => s.id === input.activeId)!;
  const evidence = snapshots.filter(isEvidence),
    baseline = input.starterGuide
      ? starterExperimentSource(snapshots, input.activeId)
      : itemTestBaseline(snapshots);
  const pendingExperiment = snapshots.some((s) => !isRecorded(s));
  const reference = isEvidence(active)
    ? active
    : snapshots.find(
        (s) => s.id === (active.supersededBy ?? active.itemTest!.sourceId),
      )!;
  const investigationInference = analyzeObservations(
    identity,
    evidence,
    reference,
    input.sidDigitFilters,
  );
  const inference = input.renderMasks
    ? analyzeConstraints(input.renderMasks)
    : investigationInference;
  const pids =
    identity.pid !== undefined
      ? [identity.pid]
      : investigationInference.pidValues;
  if (input.rng) phase?.("rng");
  const wildResult = input.rng
    ? searchWild(
        {
          settings: input.rng,
          identity,
          snapshots: evidence,
          ...(input.sidRng ? { sidRng: input.sidRng } : {}),
          sidDigitFilters: input.sidDigitFilters,
          sidCandidates: input.sidCandidates,
        },
        progress,
      )
    : null;
  phase?.("sid");
  const carriedSids = input.sidCandidates && new Set(input.sidCandidates);
  let candidateLimit = false;
  const solveSmallSet = () => {
    if (identity.tid === undefined || !pids?.length || pids.length > 32)
      return null;
    try {
      return solveSids(
        identity,
        evidence,
        pids,
        undefined,
        200000,
        input.sidCandidates?.filter((s) =>
          sidAllowed(s, input.sidDigitFilters),
        ) ?? allowedSidValues(input.sidDigitFilters),
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.startsWith("More than 200,000 joint hypotheses")
      )
        throw error;
      candidateLimit = true;
      return null;
    }
  };
  const curtainSidAnalysis = input.rng
    ? (wildResult?.analysis ?? null)
    : solveSmallSet();
  const sidRows =
    input.sidRng && identity.tid !== undefined
      ? generateSidRng(identity.tid, input.sidRng).filter(
          (r) =>
            sidAllowed(r.sid, input.sidDigitFilters) &&
            (!carriedSids || carriedSids.has(r.sid)),
        )
      : [];
  const sidResult =
    !input.sidRng || identity.tid === undefined
      ? null
      : curtainSidAnalysis
        ? intersectSidCandidates(curtainSidAnalysis, sidRows)
        : searchUnknownPidSids(identity, evidence, sidRows, progress);
  let sidAnalysis = input.sidRng
    ? (sidResult?.analysis ?? null)
    : curtainSidAnalysis;
  // Complete unknown-PID enumeration supplies a set, not a single witness.
  // Only that complete set may power guide experiments and confirmation.
  if (
    input.starterGuide &&
    !sidAnalysis &&
    sidResult?.pidValues?.length &&
    sidResult.pidValues.length <= 256
  ) {
    try {
      sidAnalysis = solveSids(
        identity,
        evidence,
        sidResult.pidValues,
        undefined,
        200000,
        sidResult.rows.map((r) => r.sid),
      );
      sidResult.analysis = sidAnalysis;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.startsWith("More than 200,000 joint hypotheses")
      )
        throw error;
      candidateLimit = true;
    }
  }
  // Keep the pre-guide set separate: editing or clearing a guide answer must
  // be able to bring candidates back. Interpret baseline pixels using baseline
  // facts even while a changed-item or training experiment is active.
  const spindaBaseSidValues = sidAnalysis?.sidValues;
  let spindaGuideProgress:
    { remainingSids: number[]; tested: number[] } | undefined;
  if (
    input.spindaGuide &&
    identity.species === 308 &&
    input.spindaGuide.guide.pid === identity.pid
  ) {
    const { guide, settings } = input.spindaGuide;
    const facts = { ...baseline.knownFacts, ...identity };
    const info = spindaInfoPlaintext(facts);
    const encounters = scanWildSpreads(
      settings,
      { species: 308, pid: guide.pid },
      [],
    );
    const candidate = encounters.length
      ? spindaStatCandidate(
          { pid: guide.pid, encounters },
          facts,
          baseline.summaryStats,
        )
      : undefined;
    const rng = spindaRngEvidence(guide.pid, candidate, info);
    const remainingSids = spindaRemainingSids(
      guide,
      spindaBaseSidValues ?? input.sidCandidates,
      input.sidDigitFilters ?? Array(4).fill(65535),
      info,
      rng?.plaintexts,
    );
    spindaGuideProgress = {
      remainingSids,
      tested: testedSpindaDigits(guide, info, rng?.masks),
    };
    const allowed = new Set(remainingSids);
    if (sidAnalysis) {
      const perIvWord = new Map<string, Set<number>>();
      const candidates = sidAnalysis.candidates.filter((h) => {
        if (!allowed.has(h.sid)) return false;
        if (!h.rng) return true;
        const key = `${h.rng.ivs.join(",")}/${h.rng.abilitySlot}`;
        let supported = perIvWord.get(key);
        if (!supported) {
          const word =
            (h.rng.ivs.reduce((v, iv, n) => v | (iv << (n * 5)), 0) |
              (h.rng.abilitySlot << 31)) >>>
            0;
          const plain = Array<number>(96).fill(65535);
          for (let n = 0; n < 8; n++)
            plain[80 + n] = 1 << ((word >>> (n * 4)) & 15);
          supported = new Set(
            spindaRemainingSids(
              guide,
              remainingSids,
              input.sidDigitFilters ?? Array(4).fill(65535),
              info,
              [plain],
            ),
          );
          perIvWord.set(key, supported);
        }
        return supported.has(h.sid);
      });
      const supportedSids = [...new Set(candidates.map((h) => h.sid))].sort(
        (a, b) => a - b,
      );
      sidAnalysis = {
        ...sidAnalysis,
        candidates,
        sidValues: supportedSids,
      };
      spindaGuideProgress.remainingSids = supportedSids;
    }
    if (sidResult) {
      sidResult.analysis = sidAnalysis;
      const supported = new Set(sidAnalysis?.sidValues ?? remainingSids);
      sidResult.rows = sidResult.rows.filter((r) => supported.has(r.sid));
    }
  }
  // A pending experiment previews facts/key deductions without treating unseen
  // baseline pixels as observations of the changed record.
  phase?.("recovery");
  const recovery = sidAnalysis
    ? projectRecord(identity, active, sidAnalysis.candidates, evidence)
    : null;
  const previewInference =
    active === reference
      ? inference
      : analyzeObservations(identity, evidence, active, input.sidDigitFilters);
  const assistance = pixelAssistance(
    active.observations,
    { ...active.knownFacts, ...identity },
    previewInference,
    recovery?.masks,
  );
  const ivCurtain = judgeIvDomains(
    identity.ivJudge,
    Array.from({ length: 6 }, (_, i) => {
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
    }),
  );
  const estimatedIVs = estimateIVs(
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
  const judgeCombined = judgeIvDomains(
    identity.ivJudge,
    estimatedIVs.map((r) => r.combined),
  );
  const ivEstimates = estimatedIVs.map((r, i) => ({
    ...r,
    combined: judgeCombined[i],
  }));
  let experimentTargets = (active.targets ?? []).filter(
    (n) => active.observations[n] === -1 && assistance.predictions[n] === -1,
  );
  // Re-score the remaining questions after each real answer. This removes
  // redundant columns without ever writing predicted values as observations.
  if (
    active.itemTest?.mode === "pixels" &&
    sidAnalysis?.candidates.length &&
    sidAnalysis.candidates.length <= 128 &&
    experimentTargets.length
  ) {
    const wantsChecksum = experimentTargets.some((n) => n >= 72 && n < 76);
    const supports = wantsChecksum
      ? sidAnalysis.candidates.map(
          compileChecksumSupport(identity, evidence, active),
        )
      : undefined;
    if (
      !supports ||
      [...new Set(supports)].reduce((n, s) => n + s.length, 0) <= 131072
    ) {
      const verified = new Set(
        Array.from({ length: 4 }, (_, i) => 72 + i).filter(
          (n) => !experimentTargets.includes(n),
        ),
      );
      const ranked = rankPixelDomains(
        sidAnalysis.candidates,
        knownPlaintext({ ...active.knownFacts, ...identity }),
        experimentTargets.filter((n) => n >= 80),
        supports,
        wantsChecksum ? 0 : null,
        verified,
      );
      if (ranked)
        experimentTargets = experimentTargets.filter((n) =>
          ranked.pixels.some((p) => p.index === n),
        );
    }
  }
  let scopeRelaxed = false;
  const starterQuestions =
    input.starterGuide &&
    active.itemTest?.mode === "pixels" &&
    !isRecorded(active) &&
    sidAnalysis &&
    sidAnalysis.candidates.length <= 4096
      ? usefulStarterPixels(
          sidAnalysis.candidates,
          { ...active.knownFacts, ...identity },
          active.observations,
        ).filter((q) => active.targets?.includes(q.index))
      : [];
  // A SID search supplies allowed SIDs, never an exhaustive list of witness
  // PIDs. Small scopes are disjoint fixed-SID DP models. Large scopes use a
  // digit envelope, explicitly an outer bound (including unresolved rows).
  const scopedInference = (() => {
    if (!sidResult || sidAnalysis || identity.sid !== undefined)
      return investigationInference;
    const scoped = scopeExperimentDomain(
      identity,
      evidence,
      reference,
      sidResult.rows,
    );
    scopeRelaxed = scoped.scopeRelaxed;
    return scoped.inference;
  })();
  const domainCandidates = sidAnalysis
    ? input.rng
      ? sidAnalysis.candidates
      : [
          ...new Map(
            sidAnalysis.candidates.map((h) => [`${h.pid}/${h.sid}`, h]),
          ).values(),
        ]
    : undefined;
  const domainInference = domainCandidates
    ? (() => {
        const counts = Array.from({ length: 24 }, () =>
          Array.from({ length: 8 }, () => Array<number>(16).fill(0)),
        );
        const candidates = domainCandidates;
        for (const h of candidates)
          for (let n = 0; n < 8; n++)
            counts[h.pid % 24][n][(h.key >>> (n * 4)) & 15]++;
        return {
          ...investigationInference,
          orderKeyCounts: counts,
          pidCount: BigInt(candidates.length),
          headerPairCount: BigInt(candidates.length),
          consistent: candidates.length > 0,
          orders: [...new Set(candidates.map((h) => h.pid % 24))],
        };
      })()
    : scopedInference;
  const sidScopeAllows = !input.sidRng || !!sidResult?.rows.length;
  // Answer the chosen test first. Ranking the entire catalogue here can cost
  // tens of seconds after linked tests, while none of those results is visible.
  if (!pendingExperiment) phase?.("experiments");
  const domain =
    !pendingExperiment &&
    (!input.starterGuide || input.backupGuide) &&
    (!input.rng || sidAnalysis) &&
    sidScopeAllows
      ? rankDomainExperiments(identity, evidence, baseline, domainInference, {
          candidates:
            input.backupGuide && (domainCandidates?.length ?? 0) > 4096
              ? undefined
              : domainCandidates,
          scopeRelaxed,
          backupGuide: input.backupGuide,
        })
      : null;
  const items =
    !pendingExperiment && sidAnalysis
      ? rankItemExperiments(
          sidAnalysis.candidates,
          undefined,
          input.starterGuide ? undefined : baseline,
          identity,
          evidence,
        )
      : [];
  const controlled = pendingExperiment
    ? []
    : rankControlledExperiments(
        baseline,
        identity.species,
        sidAnalysis?.candidates ?? [],
        identity,
        evidence,
        !input.starterGuide,
        { allowVitamins: !input.starterGuide },
      );
  // Prefer the existing joint/checksum ranker wherever it can score the action.
  // Domain questions also cover small sets with differing block positions.
  const domainQuestions: Record<string, DomainQuestion> = {};
  for (const e of domain?.experiments ?? [])
    if (
      !items.some((p) => p.item.id === e.item.id && isInformativeExperiment(p))
    ) {
      const at = items.findIndex((p) => p.item.id === e.item.id);
      if (at >= 0) items.splice(at, 1);
      items.push(e);
      domainQuestions[`item-${e.item.id}`] =
        domain!.questions[`item-${e.item.id}`];
    }
  for (const e of domain?.controlledExperiments ?? [])
    if (
      !controlled.some(
        (p) => p.action.id === e.action.id && isInformativeExperiment(p),
      )
    ) {
      const at = controlled.findIndex((p) => p.action.id === e.action.id);
      if (at >= 0) controlled.splice(at, 1);
      controlled.push(e);
      domainQuestions[e.action.id] = domain!.questions[e.action.id];
    }
  const compare = (
    a: {
      worstCase: number;
      informationGain: number;
      action?: { cost?: number };
    },
    b: {
      worstCase: number;
      informationGain: number;
      action?: { cost?: number };
    },
  ) =>
    a.worstCase - b.worstCase ||
    b.informationGain - a.informationGain ||
    (a.action?.cost ?? 1) - (b.action?.cost ?? 1);
  items.sort(compare);
  controlled.sort(compare);
  const experimentLimitations = [
    ...(domain?.outcomeLimited
      ? [
          "Some joint multi-pixel outcome tables exceed the computation budget. Those tests retain conservative individual-pixel bounds; remaining questions are rechecked after every answer.",
        ]
      : []),
    ...(identity.ivJudge && !input.rng
      ? [
          "IV judge maximum and total constraints use conservative packed-IV projections. Remaining identity counts may include unresolved IV/checksum correlations.",
        ]
      : []),
    ...(domain?.checksumLimited
      ? [
          "Checksum experiment ranking exceeded its computation budget; encrypted-pixel ranking still uses every surviving identity. No candidates were discarded.",
        ]
      : []),
    ...(scopeRelaxed
      ? [
          "The SID RNG scope exceeds the exact ranking budget. Counts use a conservative SID digit envelope; witness PIDs are not an exhaustive candidate set.",
        ]
      : []),
    ...(candidateLimit
      ? [
          "Joint identity enumeration exceeded 200,000 candidates; ranking uses symbolic bounds.",
        ]
      : []),
    ...(!sidAnalysis
      ? [
          "Symbolic counts are upper bounds. Unresolved payload and linked checksum correlations can reduce the actual identity set; encrypted pixel questions remain conservative.",
        ]
      : []),
  ];
  const experimentStatus =
    !investigationInference.consistent ||
    !domainInference.consistent ||
    (!!identity.ivJudge && ivEstimates.some((r) => !r.combined.length)) ||
    (sidAnalysis && !sidAnalysis.candidates.length) ||
    (sidResult && !sidResult.rows.length)
      ? "inconsistent"
      : pendingExperiment ||
          items.some(isInformativeExperiment) ||
          controlled.some(isInformativeExperiment)
        ? "available"
        : identity.tid === undefined
          ? "insufficient-information"
          : input.rng && !sidAnalysis
            ? "computation-limited"
            : "indistinguishable";
  const nextSpinda =
    !pendingExperiment &&
    input.spindaPlanning &&
    sidAnalysis?.sidValues.length &&
    experimentStatus !== "inconsistent"
      ? estimateNextSpinda(
          input.spindaPlanning.settings,
          sidAnalysis.sidValues,
          input.spindaPlanning.tested.map(
            (m, n) => m | (spindaGuideProgress?.tested[n] ?? 0),
          ),
          identity.otGender,
        )
      : null;
  return {
    experimentProgress: experimentProgress(
      identity,
      evidence,
      baseline,
      active,
      investigationInference,
      input.sidDigitFilters,
    ),
    experimentStatus,
    experimentLimitations,
    domainQuestions,
    investigationInference,
    inference,
    wildResult,
    curtainSidAnalysis,
    sidRows,
    sidResult,
    sidAnalysis,
    spindaBaseSidValues,
    spindaGuideProgress,
    nextSpinda,
    recovery,
    assistance,
    ivEstimates,
    experimentTargets,
    starterQuestions,
    experiments: items.filter(isInformativeExperiment),
    controlledExperiments: controlled.filter(isInformativeExperiment),
  };
}
export type DeductionResult = ReturnType<typeof computeDeduction>;
const emptyInference = analyzeConstraints(Array(160).fill(65535));
export const EMPTY_DEDUCTION: DeductionResult = {
  experimentProgress: null,
  experimentStatus: "insufficient-information",
  experimentLimitations: [],
  domainQuestions: {} as Record<string, DomainQuestion>,
  experimentTargets: [],
  starterQuestions: [] as SidQuestion[],
  investigationInference: emptyInference,
  inference: emptyInference,
  wildResult: null,
  curtainSidAnalysis: null,
  sidRows: [],
  sidResult: null,
  sidAnalysis: null,
  spindaBaseSidValues: undefined,
  spindaGuideProgress: undefined,
  nextSpinda: null,
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
