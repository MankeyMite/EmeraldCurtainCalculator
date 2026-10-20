import { advanceSeed, nextSeed } from "./rng";
import {
  applyFacts,
  allowedValues,
  recordMasks,
  type KnownFacts,
} from "./constraints";
import { knownPlaintext } from "./inference";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import { genderPidCases } from "./traits";
import { xorMask } from "./cryptoConstraints";
import { compileHypothesisValidator, makeHypothesis, solveSids } from "./sid";
import type { Snapshot } from "./investigation";
import { isEvidence } from "./itemTests";
import {
  matchingDewfordCases,
  validateDewford,
  type DewfordEvidence,
} from "./dewford";

export type SidRngSettings = {
  minAdvance: number;
  maxAdvance: number;
  dewford?: DewfordEvidence;
};
export type SidRngRow = {
  sid: number;
  advances: number[];
  witnessPid?: number;
  unresolved?: boolean;
};
export type SidRngResult = {
  rows: SidRngRow[];
  pidValues: number[] | null;
  pidMasks: number[];
  analysis: ReturnType<typeof solveSids> | null;
  exact: boolean;
};
export const DEFAULT_SID_RNG: SidRngSettings = {
  minAdvance: 1,
  maxAdvance: 3600,
};
export function validateSidRng(value: unknown): SidRngSettings {
  if (!value || typeof value !== "object")
    throw Error("Invalid new-game SID RNG window");
  const s = value as SidRngSettings;
  if (
    ![s.minAdvance, s.maxAdvance].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= 0xffffffff,
    ) ||
    s.maxAdvance < s.minAdvance ||
    s.maxAdvance - s.minAdvance >= 1000000
  )
    throw Error(
      "SID RNG advances must be positive inclusive bounds spanning at most 1,000,000 calls",
    );
  const dewford =
    s.dewford === undefined ? undefined : validateDewford(s.dewford);
  if (
    dewford &&
    dewford.enabled !== false &&
    s.maxAdvance - s.minAdvance >= 100000
  )
    throw Error(
      "With Dewford evidence, narrow the SID window to at most 100,000 calls",
    );
  return {
    minAdvance: s.minAdvance,
    maxAdvance: s.maxAdvance,
    ...(dewford ? { dewford } : {}),
  };
}
export function sidWindowFromSeconds(min: number, max: number): SidRngSettings {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min)
    throw Error("Enter a valid approximate time window");
  return validateSidRng({
    minAdvance: Math.max(1, Math.ceil(min * 60)),
    maxAdvance: Math.max(1, Math.floor(max * 60)),
  });
}
export function widenSidRng(settings: SidRngSettings): SidRngSettings {
  const { minAdvance, maxAdvance, dewford } = validateSidRng(settings);
  const span = maxAdvance - minAdvance + 1,
    extra = Math.min(
      span,
      (dewford && dewford.enabled !== false ? 100000 : 1000000) - span,
    );
  let left = Math.min(minAdvance - 1, Math.floor(extra / 2));
  const right = Math.min(0xffffffff - maxAdvance, extra - left);
  left = Math.min(minAdvance - 1, extra - right);
  return {
    minAdvance: minAdvance - left,
    maxAdvance: maxAdvance + right,
    ...(dewford ? { dewford } : {}),
  };
}
export function generateSidRng(
  tid: number,
  settings: SidRngSettings,
): SidRngRow[] {
  if (!Number.isInteger(tid) || tid < 0 || tid > 65535)
    throw Error("Public TID must be 0–65535");
  const { minAdvance, maxAdvance, dewford } = validateSidRng(settings);
  let seed = advanceSeed(tid, minAdvance - 1);
  const rows = new Map<number, SidRngRow>();
  for (let advance = minAdvance; advance <= maxAdvance; advance++) {
    seed = nextSeed(seed);
    if (
      dewford &&
      dewford.enabled !== false &&
      !matchingDewfordCases(seed, advance, dewford).length
    )
      continue;
    const sid = seed >>> 16;
    const row = rows.get(sid);
    if (row) row.advances.push(advance);
    else rows.set(sid, { sid, advances: [advance] });
  }
  return [...rows.values()].sort((a, b) => a.sid - b.sid);
}
export function intersectSidCandidates(
  analysis: ReturnType<typeof solveSids>,
  rng: SidRngRow[],
): SidRngResult {
  const allowed = new Set(rng.map((r) => r.sid));
  const candidates = analysis.candidates.filter((h) => allowed.has(h.sid));
  const sids = new Set(candidates.map((h) => h.sid));
  return {
    rows: rng.filter((r) => sids.has(r.sid)),
    pidValues: [...new Set(candidates.map((h) => h.pid))],
    pidMasks: Array.from({ length: 8 }, (_, n) =>
      candidates.reduce(
        (mask, h) => mask | (1 << ((h.pid >>> (n * 4)) & 15)),
        0,
      ),
    ),
    exact: true,
    analysis: {
      ...analysis,
      candidates,
      sidValues: [...sids].sort((a, b) => a - b),
      model: `${analysis.model} Intersected with the selected new-game TID-seeded SID RNG evidence (including Dewford evidence when enabled).`,
    },
  };
}
type Model = { choices: number[][]; target: number; modulus: number };
function modelsForSid(identity: KnownFacts, snapshots: Snapshot[]) {
  const headers = snapshots.map((s) =>
    applyFacts(recordMasks(s.observations, 5), {
      ...s.knownFacts,
      ...identity,
    }),
  );
  const plains = snapshots.map((s) =>
    knownPlaintext({ ...s.knownFacts, ...identity }),
  );
  const pidMasks = Array.from({ length: 8 }, (_, n) =>
    headers.reduce((m, h) => m & h[n], 0xffff),
  );
  const keys = SUBSTRUCT_POSITIONS.map((positions) => {
    const key = Array<number>(8).fill(0xffff);
    snapshots.forEach((_, index) => {
      for (let logical = 0; logical < 96; logical++) {
        const physical =
          positions[Math.floor(logical / 24)] * 24 + (logical % 24);
        const plain = plains[index][logical],
          cipher = headers[index][64 + physical];
        if (plain === 0xffff && cipher) continue;
        let mask = 0;
        for (const p of allowedValues(plain)) mask |= xorMask(cipher, p);
        key[physical % 8] &= mask;
      }
    });
    return key;
  });
  return (sid: number): Model[] => {
    if (identity.sid !== undefined && identity.sid !== sid) return [];
    if (
      headers.some(
        (h) =>
          h.slice(8, 64).some((m) => !m) ||
          [0, 1, 2, 3].some(
            (n) => !(h[12 + n] & (1 << ((sid >>> (n * 4)) & 15))),
          ),
      )
    )
      return [];
    const otid = ((sid << 16) | identity.tid!) >>> 0,
      models: Model[] = [];
    const modulus = identity.nature === undefined ? 24 : 600;
    for (const [lo, hi] of genderPidCases(identity.species, identity.gender))
      for (let order = 0; order < 24; order++) {
        const choices = keys[order].map((m, n) =>
          allowedValues(
            xorMask(m, (otid >>> (n * 4)) & 15) &
              pidMasks[n] &
              (n === 0 ? lo : n === 1 ? hi : 0xffff),
          ).filter((p) => n !== 0 || p % 8 === order % 8),
        );
        if (choices.some((c) => !c.length)) continue;
        models.push({
          choices,
          modulus,
          target:
            identity.nature === undefined
              ? order
              : order + 24 * ((order - identity.nature + 25) % 25),
        });
      }
    return models;
  };
}
// Exact existence search over PID digit models. A bounded search that cannot
// prove compatibility or rejection returns unresolved, never a fabricated PID
// or an exclusion. Witnesses remain diagnostics, not supplied facts.
export function searchUnknownPidSids(
  identity: KnownFacts,
  all: Snapshot[],
  rng: SidRngRow[],
  progress?: (done: number, total: number) => void,
): SidRngResult {
  if (identity.tid === undefined) throw Error("Enter the original trainer TID");
  const snapshots = all.filter(isEvidence),
    models = modelsForSid(identity, snapshots),
    fits = compileHypothesisValidator(identity, snapshots);
  const rows: SidRngRow[] = [],
    pids = new Set<number>(),
    pidMasks = Array<number>(8).fill(0);
  let complete = true;
  for (let index = 0; index < rng.length; index++) {
    if (index % 32 === 0) progress?.(index, rng.length);
    const row = rng[index];
    let witness: number | undefined,
      unresolved = false,
      visits = 0;
    const candidateModels = models(row.sid);
    for (const model of candidateModels) {
      const { choices, modulus, target } = model,
        limit = (1n << BigInt(modulus)) - 1n;
      const weights = Array.from({ length: 8 }, (_, n) => 16 ** n % modulus);
      const rotate = (bits: bigint, shift: number) =>
        ((bits << BigInt(shift)) | (bits >> BigInt(modulus - shift))) & limit;
      const suffix = Array<bigint>(9).fill(0n);
      suffix[8] = 1n;
      for (let n = 7; n >= 0; n--)
        for (const p of choices[n])
          suffix[n] |= rotate(suffix[n + 1], (p * weights[n]) % modulus);
      if (!(suffix[0] & (1n << BigInt(target)))) continue;
      const small =
        choices.reduce((product, c) => product * c.length, 1) <= 4096;
      let stopped = false,
        compatible = false;
      const visit = (n: number, residue: number, pid: number) => {
        if (stopped) return;
        if (n === 8) {
          if (++visits > 50000) {
            unresolved = true;
            stopped = true;
            return;
          }
          if (fits(makeHypothesis(pid, identity.tid!, row.sid))) {
            compatible = true;
            witness ??= pid;
            pids.add(pid);
            if (!small) {
              complete = false;
              stopped = true;
            }
          }
          return;
        }
        for (const p of choices[n]) {
          if (identity.shiny === true && n >= 4) {
            const lowKey =
              ((pid >>> ((n - 4) * 4)) ^
                ((row.sid * 65536 + identity.tid!) >>> ((n - 4) * 4))) &
              15;
            const highKey = p ^ ((row.sid >>> ((n - 4) * 4)) & 15);
            if (n === 4 ? (lowKey ^ highKey) >= 8 : lowKey !== highKey)
              continue;
          }
          const next = (residue + p * weights[n]) % modulus,
            needed = (target - next + modulus) % modulus;
          if (suffix[n + 1] & (1n << BigInt(needed)))
            visit(n + 1, next, pid + p * 16 ** n);
          if (stopped) break;
        }
      };
      visit(0, 0, 0);
      if (compatible || unresolved)
        choices.forEach((digits, n) =>
          digits.forEach((d) => (pidMasks[n] |= 1 << d)),
        );
      if (stopped && unresolved) {
        // An unfinished model cannot exclude PID digits in later models.
        candidateModels.forEach(({ choices }) =>
          choices.forEach((digits, n) =>
            digits.forEach((d) => (pidMasks[n] |= 1 << d)),
          ),
        );
        complete = false;
        break;
      }
    }
    if (witness !== undefined || unresolved)
      rows.push({
        ...row,
        ...(witness === undefined ? {} : { witnessPid: witness }),
        ...(witness === undefined && unresolved ? { unresolved: true } : {}),
      });
  }
  progress?.(rng.length, rng.length);
  return {
    rows,
    pidValues:
      complete && pids.size <= 256 ? [...pids].sort((a, b) => a - b) : null,
    pidMasks,
    analysis: null,
    exact: rows.every((r) => !r.unresolved),
  };
}
