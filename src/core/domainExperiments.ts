import { STARTER_ITEM_IDS } from "./starterItems";
import { isEvidence } from "./itemTests";
import type { KnownFacts } from "./constraints";
import { knownPlaintext, type Inference } from "./inference";
import type { Snapshot } from "./investigation";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import { ITEM_CATALOG, type rankItemExperiments } from "./experiments";
import {
  controlledActions,
  controlledFacts,
  type rankControlledExperiments,
} from "./controlledExperiments";
import { experimentChecksumSupports, type Hypothesis } from "./sid";
import { checksumPixelOutcomes, scoreOutcomes } from "./checksum";
import { experimentChecksumDelta } from "./checksumExperiments";
import { rankPixelDomains } from "./experimentOutcomes";

export type DomainQuestion = {
  index: number;
  keyDigit: number;
  digits: number[];
  transparentCount: number;
  blackCount: number;
  total: number;
  conditional: boolean;
  countBasis: "PID" | "PID/SID pair" | "PID/SID/IV hypothesis";
  countKind: "exact" | "upper-bound";
  scopeRelaxed: boolean;
  combinedChecksum?: boolean;
  combinedOutcomes?: boolean;
};
export type ExperimentDomain = Pick<
  Inference,
  "consistent" | "orders" | "headerPairCount" | "orderKeyCounts"
>;

/** Joint identities stay in weighted residue-DP form, with key marginals kept
 * separately for each order. A SINGLE question does not multiply marginals.
 * Unknown plaintext retains the identity in both outcome sets. The symbolic
 * model is an outer approximation when payload/checksum correlations remain.
 * Small validated sets can also combine this question with linked checksums.
 */
export function rankDomainExperiments(
  identity: KnownFacts,
  snapshots: Snapshot[],
  source: Snapshot,
  inference: ExperimentDomain,
  options: {
    candidates?: Hypothesis[];
    scopeRelaxed?: boolean;
    backupGuide?: boolean;
  } = {},
) {
  const experiments: ReturnType<typeof rankItemExperiments> = [],
    controlledExperiments: ReturnType<typeof rankControlledExperiments> = [],
    questions: Record<string, DomainQuestion> = {};
  const total = Number(inference.headerPairCount);
  if (identity.tid === undefined || !inference.consistent || total <= 1)
    return {
      experiments,
      controlledExperiments,
      questions,
      checksumLimited: false,
      outcomeLimited: false,
    };
  const original = { ...source.knownFacts, ...identity };
  // Bound expensive nuisance-outcome materialization. Above this budget the
  // encrypted question remains valid; no candidate subset is substituted.
  const candidates = options.candidates;
  const supports =
    candidates && !options.backupGuide
      ? experimentChecksumSupports(identity, snapshots, source, candidates)
      : undefined;
  const checksumSupports =
    supports &&
    !supports.every((s) => s === supports[0]) &&
    !supports.every((s) => s.length === 65536)
      ? supports
      : undefined;
  const checksumLimited = !options.backupGuide && !!candidates && !supports;
  let outcomeLimited = false;
  const countBasis: DomainQuestion["countBasis"] = candidates?.some(
    (h) => h.rng,
  )
    ? "PID/SID/IV hypothesis"
    : identity.sid === undefined
      ? "PID/SID pair"
      : "PID";
  const previous = snapshots
    .filter((s) =>
      options.backupGuide ? isEvidence(s) : s.itemTest?.sourceId === source.id,
    )
    .map((s) => ({
      snapshot: s,
      plain: knownPlaintext({ ...s.knownFacts, ...identity }),
    }));
  const keyMasks = Array.from({ length: 8 }, (_, n) =>
    inference.orders.reduce(
      (mask, order) =>
        inference.orderKeyCounts[order][n].reduce(
          (m, count, digit) => (count ? m | (1 << digit) : m),
          mask,
        ),
      0,
    ),
  );
  const actions = controlledActions(
    source,
    identity.species,
    identity,
    keyMasks,
    { allowVitamins: !options.backupGuide },
  ).filter(
    (a) =>
      !options.backupGuide ||
      a.kind === "moves" ||
      (a.kind === "learn" && /^teach-15(?:-|$)/.test(a.id)),
  );
  const rank = (id: string, changes: KnownFacts, logical: number[]) => {
    const action = actions.find((a) => a.id === id);
    const facts = action
      ? controlledFacts(original, action)
      : { ...original, ...changes };
    delete facts.checksum;
    // Match the recorded experiment's conservative side-effect policy.
    if (action?.kind !== "moves" && changes.friendship === undefined)
      delete facts.friendship;
    const plain = knownPlaintext(facts);
    const positions = new Set<number>();
    for (const order of inference.orders)
      for (const n of logical)
        positions.add(
          80 + SUBSTRUCT_POSITIONS[order][Math.floor(n / 24)] * 24 + (n % 24),
        );
    const verified = new Set<number>();
    for (const { snapshot: s, plain: before } of previous) {
      const same =
        (id.startsWith("item-")
          ? !s.itemTest?.actionId && s.knownFacts.heldItem === changes.heldItem
          : s.itemTest?.actionId === id) &&
        plain.every((m, n) => n === 18 || n === 19 || m === before[n]);
      if (same)
        s.observations.forEach((v, n) => {
          if (v !== -1) verified.add(n);
        });
    }
    let best: DomainQuestion | null = null;
    const useful: DomainQuestion[] = [];
    let checksumFallback: DomainQuestion | null = null;
    for (const index of positions) {
      if (verified.has(index)) continue;
      const physical = index - 80,
        keyDigit = physical % 8;
      let transparentCount = 0,
        blackCount = 0;
      const digits = new Set<number>();
      for (const order of inference.orders) {
        const blocks = SUBSTRUCT_POSITIONS[order],
          logical =
            blocks.indexOf(Math.floor(physical / 24)) * 24 + (physical % 24),
          counts = inference.orderKeyCounts[order][keyDigit];
        const mask = plain[logical];
        if (mask && !(mask & (mask - 1))) digits.add(Math.log2(mask));
        counts.forEach((count, k) => {
          if (mask & (1 << k)) transparentCount += count;
          if (mask & (65535 ^ (1 << k))) blackCount += count;
        });
      }
      const question: DomainQuestion = {
        index,
        keyDigit,
        digits: [...digits].sort((a, b) => a - b),
        transparentCount,
        blackCount,
        total,
        conditional: transparentCount + blackCount > total,
        countBasis,
        countKind:
          candidates && transparentCount + blackCount === total
            ? "exact"
            : "upper-bound",
        scopeRelaxed: !!options.scopeRelaxed,
      };
      checksumFallback ??= question;
      if (
        !transparentCount ||
        !blackCount ||
        Math.min(transparentCount, blackCount) >= total
      )
        continue;
      useful.push(question);
      const worst = (q: DomainQuestion) =>
          Math.max(q.transparentCount, q.blackCount),
        bestCase = (q: DomainQuestion) =>
          Math.min(q.transparentCount, q.blackCount);
      if (
        !best ||
        worst(question) < worst(best) ||
        (worst(question) === worst(best) && bestCase(question) < bestCase(best))
      )
        best = question;
    }
    const encryptedInformative = !!best;
    if (!best && checksumSupports) best = checksumFallback;
    if (!best) return null;
    questions[id] = best;
    const sizes = [best.transparentCount, best.blackCount],
      worstCase = Math.max(...sizes),
      expectedRemaining =
        best.conditional || !candidates
          ? worstCase
          : sizes.reduce((sum, n) => sum + (n * n) / total, 0),
      informationGain =
        best.conditional || !candidates
          ? 0
          : sizes.reduce(
              (sum, n) => sum - (n / total) * Math.log2(n / total),
              0,
            );
    const ranked = {
      groups: 2,
      worstCase,
      expectedRemaining,
      informationGain,
      pixels: [...useful]
        .sort(
          (a, b) =>
            Math.max(a.transparentCount, a.blackCount) -
            Math.max(b.transparentCount, b.blackCount),
        )
        .map((q) => ({ index: q.index, value: 0 })),
      // Physical question + its per-order plaintext semantics define a test;
      // matching counts alone do not establish equivalence.
      signature:
        `${best.index}:` +
        inference.orders
          .map((order) => {
            const physical = best!.index - 80,
              blocks = SUBSTRUCT_POSITIONS[order],
              n =
                blocks.indexOf(Math.floor(physical / 24)) * 24 +
                (physical % 24);
            return `${order}/${plain[n]}`;
          })
          .join(";"),
      checksumContributes: false,
      checksumQuestions: [] as {
        index: number;
        transparentCount: number;
        blackCount: number;
      }[],
      checksumDelta: null as number | null,
    };
    // With multiple positions, unknown plaintext at the selected physical
    // pixel is a nuisance variable. Never use the candidate's own item/move
    // location as though that location had already been observed.
    const target = {
      ...source,
      knownFacts: { ...source.knownFacts, ...changes },
      itemTest: {
        sourceId: source.id,
        phase: "question" as const,
        ...(id.startsWith("item-")
          ? {}
          : {
              actionId: id,
              action,
            }),
      },
    };
    delete target.knownFacts.checksum;
    if (action?.kind !== "moves" && changes.friendship === undefined)
      delete target.knownFacts.friendship;
    const delta = experimentChecksumDelta(source, target);
    ranked.checksumDelta = delta;
    if (candidates && candidates.length <= 256) {
      const positions = ranked.pixels.map((p) => p.index);
      const joint = rankPixelDomains(
        candidates,
        plain,
        positions,
        checksumSupports,
        delta,
        verified,
      );
      if (!joint) outcomeLimited = true;
      if (joint && joint.pixels.length && joint.worstCase <= worstCase) {
        best.combinedOutcomes = true;
        best.combinedChecksum = joint.checksumQuestions.length > 0;
        return {
          ...ranked,
          ...joint,
          checksumContributes: joint.checksumQuestions.length > 0,
        };
      }
    }
    if (checksumSupports && candidates && delta !== null) {
      const checksumPatterns = new Map<
        number[],
        ReturnType<typeof checksumPixelOutcomes>
      >();
      const outcomes = candidates.map((h, i) => {
        const physical = best!.index - 80,
          blocks = SUBSTRUCT_POSITIONS[h.pid % 24],
          n = blocks.indexOf(Math.floor(physical / 24)) * 24 + (physical % 24),
          mask = plain[n],
          k = (h.key >>> ((physical % 8) * 4)) & 15,
          binary = [
            ...(mask & (1 << k) ? [0] : []),
            ...(mask & (65535 ^ (1 << k)) ? [1] : []),
          ];
        let checksum = checksumPatterns.get(checksumSupports[i]);
        if (!checksum) {
          checksum = checksumPixelOutcomes(checksumSupports[i], delta);
          checksumPatterns.set(checksumSupports[i], checksum);
        }
        return binary.flatMap((value) =>
          checksum.map((cs) => [...cs, { index: best!.index, value }]),
        );
      });
      const combined = scoreOutcomes(outcomes);
      if (combined.worstCase < worstCase) {
        best.combinedChecksum = true;
        return { ...ranked, ...combined, checksumContributes: true };
      }
    }
    if (!encryptedInformative) {
      delete questions[id];
      return null;
    }
    return ranked;
  };
  for (const item of ITEM_CATALOG) {
    if (
      !item.experiment ||
      item.id === source.knownFacts.heldItem ||
      (options.backupGuide && !STARTER_ITEM_IDS.includes(item.id))
    )
      continue;
    const ranked = rank(`item-${item.id}`, { heldItem: item.id }, [4, 5, 6, 7]);
    if (ranked)
      experiments.push({
        ...ranked,
        item,
        questions: [],
        effort:
          "Sequential useful pixels across every compatible block order; symbolic ranking uses the best single-pixel bound without multiplying marginals.",
      });
  }
  for (const action of actions) {
    const ranked = rank(action.id, action.changes, action.logical);
    if (ranked) controlledExperiments.push({ ...ranked, action });
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
  experiments.sort(compare);
  controlledExperiments.sort(compare);
  return {
    experiments,
    controlledExperiments,
    questions,
    checksumLimited,
    outcomeLimited,
  };
}
