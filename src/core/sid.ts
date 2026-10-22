import {
  allowedValues,
  applyFacts,
  recordMasks,
  type KnownFacts,
} from "./constraints";
import { knownPlaintext } from "./inference";
import { SUBSTRUCT_POSITIONS, decodePokemon, hex } from "./pokemon";
import { genderForPid } from "./traits";
import { xorMask } from "./cryptoConstraints";
import { validateFacts } from "./session";
import type { Snapshot } from "./investigation";
import type { RngSpread } from "./rng";
import { fitsShiny } from "./shiny";
import {
  checksumValues,
  iterateChecksumValues,
  checksumMasks,
  refineChecksumPayload,
  mod16,
} from "./checksum";
import {
  experimentChecksumDelta,
  constrainLinkedChecksums,
} from "./checksumExperiments";
import { refineJudgePlaintext } from "./ivJudge";

export type Hypothesis = {
  pid: number;
  sid: number;
  tid: number;
  otId: number;
  key: number;
  rng?: { ivs: number[]; abilitySlot: number };
};
type Prepared = ReturnType<typeof prepare>;
function prepare(
  snapshot: Snapshot,
  identity: KnownFacts,
  pid: number,
  tid: number,
  generated?: Hypothesis["rng"],
) {
  const suppliedIvs = identity.ivs;
  const facts = validateFacts({
    ...snapshot.knownFacts,
    ...identity,
    pid,
    tid,
    ...(generated ? { ivs: generated.ivs } : {}),
  });
  const header = applyFacts(recordMasks(snapshot.observations, 5), facts);
  const logical = knownPlaintext(facts);
  if (generated) logical[87] &= generated.abilitySlot === 0 ? 0x00ff : 0xff00;
  const order = SUBSTRUCT_POSITIONS[pid % 24];
  const plain = Array<number>(96).fill(0xffff);
  logical.forEach((m, i) => {
    plain[order[Math.floor(i / 24)] * 24 + (i % 24)] = m;
  });
  const keys = Array<number>(8).fill(0xffff);
  const plaintextDomains = Array.from({ length: 96 }, () =>
    Array<number>(16).fill(0),
  );
  const ciphertextDomains = Array.from({ length: 96 }, () =>
    Array<number>(16).fill(0),
  );
  const rules: { byte: number; side: number; allowed: number }[] = [];
  plain.forEach((p, n) => {
    let allowed = 0;
    for (let k = 0; k < 16; k++) {
      const domain = xorMask(header[64 + n], k) & p;
      plaintextDomains[n][k] = domain;
      ciphertextDomains[n][k] = xorMask(domain, k);
      if (domain) allowed |= 1 << k;
    }
    keys[n % 8] &= allowed;
    if (allowed !== 0xffff)
      rules.push({ byte: 32 + (n >> 1), side: n % 2, allowed });
  });
  return {
    snapshot,
    facts,
    header,
    plain,
    keys,
    plaintextDomains,
    ciphertextDomains,
    rules,
    checksumTransitions: Array.from(
      { length: 4 },
      () => new Map<number, number[]>(),
    ),
    checksumValuesCache: new Map<number, number[]>(),
    judgeCache: new Map<number, boolean>(),
    valid:
      (!generated ||
        !suppliedIvs?.some((v, i) => v !== null && v !== generated.ivs[i])) &&
      header.every(Boolean) &&
      (facts.nature === undefined || pid % 25 === facts.nature) &&
      (facts.gender === undefined ||
        genderForPid(facts.species!, pid) === facts.gender),
  };
}
const unrestrictedChecksumCache = new Map<string, number[]>();
const singletonChecksums = new Map<number, number[]>();
function possibleChecksums(p: Prepared, h: Hypothesis): number[] {
  const cached = p.checksumValuesCache.get(h.key);
  if (cached) return cached;
  if (p.header.slice(56, 60).every((m) => m && !(m & (m - 1)))) {
    const value = p.header
      .slice(56, 60)
      .reduce((v, m, n) => v | ((31 - Math.clz32(m)) << (4 * n)), 0);
    let values = singletonChecksums.get(value);
    if (!values) {
      values = [value];
      singletonChecksums.set(value, values);
    }
    return values;
  }
  const domains = p.plain.map(
    (_, n) => p.plaintextDomains[n][(h.key >>> ((n % 8) * 4)) & 15],
  );
  const masks = p.header.slice(56, 60);
  // One unrestricted word makes every modular sum possible, independently of
  // all the other words. Reuse that common support instead of enumerating it
  // for each of thousands of identities.
  if (
    Array.from({ length: 24 }, (_, w) =>
      domains.slice(w * 4, w * 4 + 4).every((m) => m === 65535),
    ).some(Boolean)
  ) {
    const signature = masks.join(",");
    let values = unrestrictedChecksumCache.get(signature);
    if (!values) {
      values = [0];
      masks.forEach(
        (m, n) =>
          (values = values!.flatMap((v) =>
            allowedValues(m).map((d) => v | (d << (n * 4))),
          )),
      );
      if (unrestrictedChecksumCache.size > 64)
        unrestrictedChecksumCache.clear();
      unrestrictedChecksumCache.set(signature, values);
    }
    return values;
  }
  const values = checksumValues(domains, masks);
  if (p.checksumValuesCache.size > 64) p.checksumValuesCache.clear();
  p.checksumValuesCache.set(h.key, values);
  return values;
}

function checksumLinks(snapshots: Snapshot[]) {
  return snapshots.flatMap((target, j) => {
    const i = snapshots.findIndex((s) => s.id === target.itemTest?.sourceId);
    if (i < 0) return [];
    const delta = experimentChecksumDelta(snapshots[i], target);
    return delta === null ? [] : [{ i, j, delta }];
  });
}
function linkedChecksumValues(
  prepared: Prepared[],
  h: Hypothesis,
  links: ReturnType<typeof checksumLinks>,
  index?: number,
): number[] | boolean {
  const done = new Set<number>();
  let selected: number[] =
    index === undefined ? [] : possibleChecksums(prepared[index], h);
  for (const edge of links) {
    if (done.has(edge.i)) continue;
    const offsets = new Map<number, number>([[edge.i, 0]]),
      queue = [edge.i];
    for (const i of queue)
      for (const link of links) {
        const j = link.i === i ? link.j : link.j === i ? link.i : -1;
        if (j < 0) continue;
        const offset = mod16(
          offsets.get(i)! + (link.i === i ? link.delta : -link.delta),
        );
        if (offsets.has(j)) {
          if (offsets.get(j)! !== offset)
            return index === undefined ? false : [];
        } else {
          offsets.set(j, offset);
          queue.push(j);
        }
      }
    const supports = [...offsets].map(([i, offset]) => ({
      i,
      offset,
      size: prepared[i].header
        .slice(56, 60)
        .reduce((v, m) => v * allowedValues(m).length, 1),
    }));
    const smallest = supports.reduce((a, b) => (a.size <= b.size ? a : b));
    const smallestPrepared = prepared[smallest.i];
    const values =
      index === undefined
        ? iterateChecksumValues(
            smallestPrepared.plain.map(
              (_, n) =>
                smallestPrepared.plaintextDomains[n][
                  (h.key >>> ((n % 8) * 4)) & 15
                ],
            ),
            smallestPrepared.header.slice(56, 60),
          )
        : possibleChecksums(smallestPrepared, h);
    // A projection needs every root, rather than a single witness. Enumerate
    // each snapshot's exact support once and intersect by constant-time lookup
    // instead of re-running four-column carry checks for every checksum value.
    const memberships =
      index === undefined
        ? undefined
        : supports.map((s) => {
            const membership = new Uint8Array(65536);
            if (checksumFits(prepared[s.i], h))
              for (const value of possibleChecksums(prepared[s.i], h))
                membership[value] = 1;
            return membership;
          });
    const roots: number[] = [];
    for (const v of values) {
      const root = mod16(v - smallest.offset);
      if (
        supports.every((s, n) =>
          memberships
            ? memberships[n][mod16(root + s.offset)]
            : checksumFits(prepared[s.i], h, mod16(root + s.offset)),
        )
      ) {
        roots.push(root);
        if (index === undefined) break; // Existence, not enumeration, for validation.
      }
    }
    if (!roots.length) return index === undefined ? false : [];
    if (index !== undefined && offsets.has(index))
      selected = roots.map((v) => mod16(v + offsets.get(index)!));
    queue.forEach((i) => done.add(i));
  }
  return index === undefined ? true : selected;
}

/** Support accessor for experiment ranking. Identity candidates retain their
 * own nuisance checksum supports, including exact links to other snapshots. */
export function compileChecksumSupport(
  identity: KnownFacts,
  snapshots: Snapshot[],
  source: Snapshot,
) {
  const all = snapshots.some((s) => s.id === source.id)
    ? snapshots
    : [source, ...snapshots];
  const links = checksumLinks(all),
    index = all.findIndex((s) => s.id === source.id);
  const cache = new Map<string, Prepared[]>();
  return (h: Hypothesis): number[] => {
    const signature = `${h.pid % 24}/${h.rng?.ivs.join(",") ?? ""}/${h.rng?.abilitySlot ?? ""}`;
    let prepared = cache.get(signature);
    if (!prepared) {
      prepared = all.map((s) => prepare(s, identity, h.pid, h.tid, h.rng));
      cache.set(signature, prepared);
    }
    return linkedChecksumValues(prepared, h, links, index) as number[];
  };
}
/** Bound optional experiment scoring, never the identity candidate set. Broad
 * sets still rank all identities using encrypted pixels. Avoid materializing
 * thousands of large nuisance checksum supports for every catalog action. */
export function experimentChecksumSupports(
  identity: KnownFacts,
  snapshots: Snapshot[],
  source: Snapshot,
  candidates: Hypothesis[],
) {
  if (!candidates.length || candidates.length > 256) return undefined;
  const support = compileChecksumSupport(identity, snapshots, source),
    distinct = new Set<number[]>(),
    supports: number[][] = [];
  let size = 0;
  for (const h of candidates) {
    const values = support(h);
    if (!distinct.has(values)) {
      size += values.length;
      if (size > 131072) return undefined;
      distinct.add(values);
    }
    supports.push(values);
  }
  return supports;
}
function headerFits(p: Prepared, h: Hypothesis) {
  if (!p.valid) return false;
  if (!fitsShiny(p.facts, h.key)) return false;
  if (p.facts.sid !== undefined && p.facts.sid !== h.sid) return false;
  for (let n = 0; n < 4; n++)
    if (!(p.header[12 + n] & (1 << ((h.sid >>> (n * 4)) & 15)))) return false;
  return true;
}
function checksumFits(p: Prepared, h: Hypothesis, checksum?: number) {
  if (p.facts.ivJudge) {
    let fits = p.judgeCache.get(h.key);
    if (fits === undefined) {
      const positions = SUBSTRUCT_POSITIONS[h.pid % 24];
      const logical = Array.from({ length: 96 }, (_, n) => {
        const physical = positions[Math.floor(n / 24)] * 24 + (n % 24);
        return p.plaintextDomains[physical][
          (h.key >>> ((physical % 8) * 4)) & 15
        ];
      });
      fits = refineJudgePlaintext(logical, p.facts.ivJudge).every(Boolean);
      p.judgeCache.set(h.key, fits);
    }
    if (!fits) return false;
  }
  if (
    checksum === undefined &&
    p.header.slice(56, 60).every((m) => m === 0xffff)
  )
    return true;
  // Exact addition of 24 independently constrained 16-bit words modulo 65536.
  // Each digit column has at most 361 possible sums and carries 0..23.
  // Cache column transitions by its two repeating XOR-key digits (256 cases).
  let carries = 1;
  for (let column = 0; column < 4; column++) {
    const lowKey = (h.key >>> (column * 4)) & 15;
    const highKey = (h.key >>> ((column + 4) * 4)) & 15;
    const digit =
      checksum === undefined ? -1 : (checksum >>> (4 * column)) & 15;
    const mask = p.header[56 + column] & (digit < 0 ? 65535 : 1 << digit);
    if (!mask) return false;
    const cacheKey = (lowKey | (highKey << 4)) + (digit + 1) * 256;
    let transitions = p.checksumTransitions[column].get(cacheKey);
    if (!transitions) {
      let sums = 1n;
      for (let n = column; n < 96; n += 4) {
        const key = n % 8 < 4 ? lowKey : highKey;
        const domain = p.plain[n] & xorMask(p.header[64 + n], key);
        let next = 0n;
        for (const digit of allowedValues(domain))
          next |= sums << BigInt(digit);
        sums = next;
      }
      const values: number[] = [];
      for (let s = 0; s <= 360; s++)
        if (sums & (1n << BigInt(s))) values.push(s);
      transitions = Array<number>(24).fill(0);
      for (let carry = 0; carry < 24; carry++)
        for (const sum of values) {
          const total = sum + carry;
          if (mask & (1 << (total & 15)))
            transitions[carry] |= 1 << (total >>> 4);
        }
      p.checksumTransitions[column].set(cacheKey, transitions);
    }
    let next = 0;
    for (let carry = 0; carry < 24; carry++)
      if (carries & (1 << carry)) next |= transitions[carry];
    carries = next;
    if (!carries) return false;
  }
  return true;
}
export function makeHypothesis(
  pid: number,
  tid: number,
  sid: number,
): Hypothesis {
  const otId = ((sid << 16) | tid) >>> 0;
  return { pid, sid, tid, otId, key: (pid ^ otId) >>> 0 };
}
// Reuse payload/checksum domain caches for different PIDs with the same order.
// Actual PID/header/trait checks stay dynamic; the representative PID is never
// treated as a known value or returned as a recovered candidate.
export function compileHypothesisValidator(
  identity: KnownFacts,
  snapshots: Snapshot[],
) {
  if (identity.tid === undefined) throw Error("Enter the original trainer TID");
  const pidMasks = snapshots.map((s) =>
    applyFacts(recordMasks(s.observations, 5), {
      ...s.knownFacts,
      ...identity,
    }).slice(0, 8),
  );
  const contexts = Array.from({ length: 24 }, (_, order) =>
    snapshots.map((s) => prepare(s, identity, order, identity.tid!)),
  );
  const links = checksumLinks(snapshots);
  return (h: Hypothesis) => {
    if (!fitsShiny(identity, h.key)) return false;
    if (
      h.tid !== identity.tid ||
      (identity.sid !== undefined && identity.sid !== h.sid) ||
      (identity.pid !== undefined && identity.pid !== h.pid)
    )
      return false;
    if (identity.nature !== undefined && h.pid % 25 !== identity.nature)
      return false;
    if (
      identity.gender !== undefined &&
      genderForPid(identity.species!, h.pid) !== identity.gender
    )
      return false;
    return (
      contexts[h.pid % 24].every(
        (p, i) =>
          pidMasks[i].every(
            (m, n) => !!(m & (1 << ((h.pid >>> (n * 4)) & 15))),
          ) &&
          p.header.slice(8, 64).every(Boolean) &&
          [0, 1, 2, 3].every(
            (n) => !!(p.header[12 + n] & (1 << ((h.sid >>> (n * 4)) & 15))),
          ) &&
          p.keys.every((m, n) => !!(m & (1 << ((h.key >>> (n * 4)) & 15)))) &&
          checksumFits(p, h),
      ) && linkedChecksumValues(contexts[h.pid % 24], h, links) === true
    );
  };
}
export function solveSids(
  identity: KnownFacts,
  snapshots: Snapshot[],
  pids: number[],
  spreads?: RngSpread[],
  maxCandidates = Infinity,
  allowedSids?: number[],
) {
  validateFacts(identity);
  if (identity.tid === undefined)
    throw Error("Enter the original trainer's public TID");
  if (
    !pids.length ||
    pids.some((p) => !Number.isInteger(p) || p < 0 || p > 0xffffffff)
  )
    throw Error("Supply compatible PIDs");
  const candidates: Hypothesis[] = [];
  const links = checksumLinks(snapshots);
  const eliminated = snapshots.map((s) => ({
    id: s.id,
    name: s.name,
    count: 0,
  }));
  const uniquePids = [...new Set(pids)];
  const variants = spreads
    ? spreads.map((s) => ({
        pid: s.pid,
        rng: { ivs: s.ivs, abilitySlot: s.abilitySlot },
      }))
    : uniquePids.map((pid) => ({ pid, rng: undefined }));
  for (const { pid, rng } of variants) {
    if (identity.pid !== undefined && identity.pid !== pid) continue;
    const prepared = snapshots.map((s) =>
      prepare(s, identity, pid, identity.tid!, rng),
    );
    if (rng && prepared.some((p) => !p.valid)) continue;
    // RNG searches can supply many PIDs. Intersect key/header digit domains
    // before enumeration, rather than visiting all 65,536 SIDs for each spread.
    let sidChoices: number[] | null = null;
    if (rng) {
      const keyMasks = Array<number>(8).fill(0xffff);
      for (const p of prepared) p.keys.forEach((m, n) => (keyMasks[n] &= m));
      const lowKey = (pid ^ identity.tid) & 65535;
      if (
        keyMasks
          .slice(0, 4)
          .some((m, n) => !(m & (1 << ((lowKey >>> (n * 4)) & 15))))
      )
        continue;
      sidChoices = [0];
      for (let n = 0; n < 4; n++) {
        const digits = allowedValues(keyMasks[n + 4])
          .map((k) => k ^ ((pid >>> ((n + 4) * 4)) & 15))
          .filter(
            (d) =>
              prepared.every((p) => !!(p.header[12 + n] & (1 << d))) &&
              (identity.sid === undefined ||
                d === ((identity.sid >>> (n * 4)) & 15)),
          );
        sidChoices = sidChoices.flatMap((s) =>
          digits.map((d) => s | (d << (n * 4))),
        );
      }
    }
    if (allowedSids) {
      const allowed = new Set(allowedSids);
      sidChoices = sidChoices
        ? sidChoices.filter((s) => allowed.has(s))
        : [...allowed];
    }
    for (let index = 0; index < (sidChoices?.length ?? 65536); index++) {
      const sid = sidChoices ? sidChoices[index] : index;
      const h = makeHypothesis(pid, identity.tid, sid);
      if (!fitsShiny(identity, h.key)) continue;
      if (rng) h.rng = rng;
      let valid = true;
      for (let i = 0; i < prepared.length; i++) {
        const p = prepared[i];
        if (
          !headerFits(p, h) ||
          p.keys.some((m, n) => !(m & (1 << ((h.key >>> (n * 4)) & 15)))) ||
          !checksumFits(p, h)
        ) {
          eliminated[i].count++;
          valid = false;
          break;
        }
      }
      if (valid && linkedChecksumValues(prepared, h, links) === true) {
        candidates.push(h);
        if (candidates.length > maxCandidates)
          throw Error(
            "More than 200,000 joint hypotheses remain. Narrow the RNG range or add more known information; no partial result has been applied.",
          );
      }
    }
  }
  return {
    candidates,
    sidValues: [...new Set(candidates.map((h) => h.sid))].sort((a, b) => a - b),
    eliminated,
    model: spreads
      ? "Conditional on the selected Emerald encounter RNG settings, generated PID/IV spreads, supplied facts, all saved pixels and the 16-bit checksum."
      : identity.ivJudge
        ? "Conservative compatibility bound for stored facts, judge answers, saved pixels and checksums. Joint IV maximum/total and checksum correlations may remain unresolved; no unseen tied stat is excluded."
        : "Exact for supplied stored facts, all observed zero/nonzero nibbles and the 16-bit checksum. Legality and unresolved summary-stat ranges are not searched.",
  };
}
export function diagnoseHypothesis(
  identity: KnownFacts,
  snapshot: Snapshot,
  h: Hypothesis,
): string | null {
  const p = prepare(snapshot, identity, h.pid, h.tid, h.rng);
  const original = recordMasks(snapshot.observations, 5);
  const trialHeader = applyFacts(original, {
    ...p.facts,
    pid: h.pid,
    tid: h.tid,
    sid: h.sid,
  });
  const conflict = trialHeader.slice(0, 64).findIndex((m) => m === 0);
  if (conflict >= 0)
    return `${snapshot.name}: byte 0x${hex(conflict >> 1)}, ${conflict % 2 ? "high" : "low"} header nibble conflicts with the supplied fact or observed pixel (observation ${16 + conflict}).`;
  if (!headerFits(p, h))
    return `${snapshot.name}: supplied PID nature, gender or SID conflicts with this hypothesis.`;
  for (const rule of p.rules) {
    const digit =
      (h.key >>> ((((rule.byte - 32) % 4) * 2 + rule.side) * 4)) & 15;
    if (!(rule.allowed & (1 << digit)))
      return `${snapshot.name}: byte 0x${hex(rule.byte)}, ${rule.side ? "high" : "low"} nibble conflicts with known plaintext after XOR (observation ${16 + rule.byte * 2 + rule.side}).`;
  }
  return checksumFits(p, h)
    ? null
    : `${snapshot.name}: no compatible secure payload satisfies the observed or known checksum.`;
}
export function projectRecord(
  identity: KnownFacts,
  snapshot: Snapshot,
  candidates: Hypothesis[],
  snapshots: Snapshot[] = [snapshot],
) {
  const masks = Array<number>(160).fill(0),
    plaintext = Array<number>(96).fill(0);
  const prepared = new Map<string, Prepared>();
  const linkedSupport = checksumLinks(snapshots).length
    ? compileChecksumSupport(identity, snapshots, snapshot)
    : null;
  let checksumUpper: number[] | undefined;
  if (linkedSupport) {
    const all = snapshots.some((s) => s.id === snapshot.id)
      ? snapshots
      : [snapshot, ...snapshots];
    const headers = all.map((s) =>
      applyFacts(recordMasks(s.observations, 5), {
        ...s.knownFacts,
        ...identity,
      }),
    );
    const consistent = constrainLinkedChecksums(
      all,
      headers,
      all.map((s) => knownPlaintext({ ...s.knownFacts, ...identity })),
    );
    checksumUpper = consistent
      ? headers[all.findIndex((s) => s.id === snapshot.id)].slice(56, 60)
      : [0, 0, 0, 0];
  }
  for (const h of candidates) {
    const signature = `${h.pid}/${h.rng?.ivs.join(",") ?? ""}/${h.rng?.abilitySlot ?? ""}`;
    let p = prepared.get(signature);
    if (!p) {
      p = prepare(snapshot, identity, h.pid, h.tid, h.rng);
      prepared.set(signature, p);
    }
    const header = applyFacts(p.header, { pid: h.pid, tid: h.tid, sid: h.sid });
    // For large sets, payload refinement is disabled below. Once the checksum
    // union already contains this candidate's entire header domain, computing
    // its (often 50,000-value) support cannot add another projected digit.
    const checksum =
      candidates.length <= 32 ||
      p.header
        .slice(56, 60)
        .some((m, n) => !!(m & (checksumUpper?.[n] ?? 65535) & ~masks[56 + n]))
        ? checksumMasks(
            linkedSupport ? linkedSupport(h) : possibleChecksums(p, h),
          )
        : p.header
            .slice(56, 60)
            .map((m, n) => m & (checksumUpper?.[n] ?? 65535));
    checksum.forEach((m, n) => (header[56 + n] &= m));
    const refinedDomains =
      candidates.length <= 32 && checksum.some((m) => m !== 65535)
        ? refineChecksumPayload(
            p.plain.map(
              (_, n) => p!.plaintextDomains[n][(h.key >>> ((n % 8) * 4)) & 15],
            ),
            checksum,
          )
        : null;
    let sum = 0,
      word = 0,
      exactPayload = true;
    p.plain.forEach((m, n) => {
      const key = (h.key >>> ((n % 8) * 4)) & 15;
      const decoded = refinedDomains
        ? refinedDomains[n]
        : p!.plaintextDomains[n][key];
      const domain = refinedDomains
        ? xorMask(decoded, key)
        : p!.ciphertextDomains[n][key];
      if (!decoded || decoded & (decoded - 1)) exactPayload = false;
      else word |= (31 - Math.clz32(decoded)) << ((n % 4) * 4);
      if (n % 4 === 3) {
        sum = (sum + word) & 65535;
        word = 0;
      }
      masks[n + 64] |= domain;
      // Logical order, independent of PID-dependent storage order.
      const physical = Math.floor(n / 24),
        logical = SUBSTRUCT_POSITIONS[h.pid % 24].indexOf(physical);
      plaintext[logical * 24 + (n % 24)] |= decoded;
    });
    if (exactPayload)
      for (let n = 0; n < 4; n++)
        header[56 + n] &= 1 << ((sum >>> (n * 4)) & 15);
    header.slice(0, 64).forEach((m, n) => {
      masks[n] |= m;
    });
  }
  const bytes = Array.from({ length: 80 }, (_, i) => {
    const low = allowedValues(masks[i * 2]),
      high = allowedValues(masks[i * 2 + 1]);
    return low.length === 1 && high.length === 1
      ? low[0] | (high[0] << 4)
      : null;
  });
  const exact =
    candidates.length && bytes.every((v) => v !== null)
      ? Uint8Array.from(bytes as number[])
      : null;
  const record = exact && decodePokemon(exact).checksumValid ? exact : null;
  const predictions = masks.map((m) => (m === 1 ? 0 : m && !(m & 1) ? 1 : -1));
  return {
    masks,
    plaintext,
    bytes,
    record,
    predictions,
    exactByteCount: bytes.filter((v) => v !== null).length,
    checksumInvalid: !!exact && !record,
  };
}
