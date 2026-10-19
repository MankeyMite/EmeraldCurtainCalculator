import catalog from "../data/dewford-words.json";
import { advanceSeed, nextSeed } from "./rng";

export const DEWFORD_WORDS = catalog;
export type DewfordPhrase = [number, number];
export type DewfordTest = { phrase: DewfordPhrase; present: boolean };
export type DewfordEvidence = {
  enabled?: boolean;
  currentPhrase: DewfordPhrase;
  tests: DewfordTest[];
  minGap: number;
  maxGap: number;
  pending?: DewfordPhrase;
};
export type DewfordTrend = {
  phrase: DewfordPhrase;
  firstAdvance: number;
  lastAdvance: number;
  gaining: boolean;
  maxTrendiness: number;
  trendiness: number;
  rand: number;
};
export type DewfordCase = {
  sid: number;
  advance: number;
  gap: number;
  trends: DewfordTrend[];
};
const allWords = [
  ...catalog.conditions,
  ...catalog.lifestyle,
  ...catalog.hobbies,
];
const wordNames = new Map(allWords.map((w) => [w.id, w.text]));
export const phraseKey = (phrase: DewfordPhrase) => phrase.join("/");
export const phraseName = (phrase: DewfordPhrase) =>
  phrase.map((w) => wordNames.get(w) ?? "?").join(" · ");
export function validateDewfordPhrase(value: unknown): DewfordPhrase {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !catalog.conditions.some((w) => w.id === value[0]) ||
    ![...catalog.lifestyle, ...catalog.hobbies].some((w) => w.id === value[1])
  )
    throw Error(
      "Choose a Conditions word followed by a Lifestyle or Hobbies word",
    );
  return [value[0], value[1]];
}
export function validateDewford(value: unknown): DewfordEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid Dewford evidence");
  const v = value as DewfordEvidence;
  if (v.enabled !== undefined && typeof v.enabled !== "boolean")
    throw Error("Invalid Dewford enabled flag");
  if (
    ![v.minGap, v.maxGap].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 12,
    ) ||
    v.maxGap < v.minGap ||
    v.maxGap - v.minGap > 4
  )
    throw Error(
      "Dewford gap bounds must be 0–12 and cover at most five offsets",
    );
  if (!Array.isArray(v.tests) || v.tests.length > 100)
    throw Error("Invalid Dewford tests");
  const seen = new Map<string, boolean>();
  const tests = v.tests.map((test) => {
    if (!test || typeof test.present !== "boolean")
      throw Error("Invalid Dewford test answer");
    const phrase = validateDewfordPhrase(test.phrase),
      key = phraseKey(phrase);
    if (seen.has(key))
      throw Error("A Dewford phrase test is recorded more than once");
    seen.set(key, test.present);
    return { phrase, present: test.present };
  });
  return {
    ...(v.enabled === undefined ? {} : { enabled: v.enabled }),
    currentPhrase: validateDewfordPhrase(v.currentPhrase),
    tests,
    minGap: v.minGap,
    maxGap: v.maxGap,
    ...(v.pending === undefined
      ? {}
      : { pending: validateDewfordPhrase(v.pending) }),
  };
}

// Source model: the state after SID, followed by a configurable number of
// intervening calls, then five uninterrupted InitDewfordTrend iterations.
// Three intervening calls is the established community calibration, not three
// explicit Random() calls in NewGameInitData. VBlank can disturb this model.
export function generateDewfordTrends(
  seedAfterSid: number,
  advance: number,
  gap = 3,
): DewfordTrend[] {
  let seed = advanceSeed(seedAfterSid, gap),
    call = advance + gap;
  const random = () => {
    seed = nextSeed(seed);
    call++;
    return seed >>> 16;
  };
  const trends: DewfordTrend[] = [];
  for (let i = 0; i < 5; i++) {
    const firstAdvance = call + 1;
    const first = catalog.conditions[random() % catalog.conditions.length].id;
    const secondGroup = random() & 1 ? catalog.lifestyle : catalog.hobbies;
    const second = secondGroup[random() % secondGroup.length].id;
    const gaining = !!(random() & 1);
    let r = random() % 98;
    if (r > 50) {
      r = random() % 98;
      if (r > 80) r = random() % 98;
    }
    const maxTrendiness = r + 30,
      trendiness = (random() % (r + 1)) + 30;
    const rand = random();
    trends.push({
      phrase: [first, second],
      firstAdvance,
      lastAdvance: call,
      gaining,
      maxTrendiness,
      trendiness,
      rand,
    });
  }
  // Sorting/tie-break calls occur after generation. We use membership of all
  // five phrases, so neither their initial rank nor daily resorting is assumed.
  return trends;
}
export function matchingDewfordCases(
  seedAfterSid: number,
  advance: number,
  evidence: DewfordEvidence,
): DewfordCase[] {
  const matches: DewfordCase[] = [];
  for (let gap = evidence.minGap; gap <= evidence.maxGap; gap++) {
    const trends = generateDewfordTrends(seedAfterSid, advance, gap);
    const phrases = new Set(trends.map((t) => phraseKey(t.phrase)));
    if (
      !phrases.has(phraseKey(evidence.currentPhrase)) ||
      evidence.tests.some((t) => phrases.has(phraseKey(t.phrase)) !== t.present)
    )
      continue;
    matches.push({ sid: seedAfterSid >>> 16, advance, gap, trends });
  }
  return matches;
}
export function searchDewford(
  tid: number,
  minAdvance: number,
  maxAdvance: number,
  evidence: DewfordEvidence,
): DewfordCase[] {
  if (!Number.isInteger(tid) || tid < 0 || tid > 65535)
    throw Error("Enter public TID 0–65535");
  if (
    ![minAdvance, maxAdvance].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= 0xffffffff,
    ) ||
    maxAdvance < minAdvance ||
    maxAdvance - minAdvance >= 100000
  )
    throw Error(
      "Dewford searches require positive inclusive bounds spanning at most 100,000 SID calls",
    );
  const checked = validateDewford(evidence);
  let seed = advanceSeed(tid, minAdvance - 1);
  const cases: DewfordCase[] = [];
  for (let advance = minAdvance; advance <= maxAdvance; advance++) {
    seed = nextSeed(seed);
    cases.push(...matchingDewfordCases(seed, advance, checked));
  }
  return cases;
}
export function rankDewfordTests(cases: DewfordCase[]) {
  const sidCount = new Set(cases.map((c) => c.sid)).size;
  const phrases = new Map<string, DewfordPhrase>();
  const memberships = cases.map((c) => {
    c.trends.forEach((t) => phrases.set(phraseKey(t.phrase), t.phrase));
    return new Set(c.trends.map((t) => phraseKey(t.phrase)));
  });
  return [...phrases]
    .flatMap(([key, phrase]) => {
      const present = new Set<number>(),
        absent = new Set<number>();
      cases.forEach((c, i) =>
        (memberships[i].has(key) ? present : absent).add(c.sid),
      );
      // A SID may occur at several advances with different phrase sets. Retain
      // it in both outcome sets where appropriate; never invent disjoint counts.
      if (
        !present.size ||
        !absent.size ||
        (present.size === sidCount && absent.size === sidCount)
      )
        return [];
      return [
        {
          phrase,
          rejectedSids: present.size,
          acceptedSids: absent.size,
          worstCase: Math.max(present.size, absent.size),
        },
      ];
    })
    .sort(
      (a, b) =>
        a.worstCase - b.worstCase ||
        a.acceptedSids + a.rejectedSids - b.acceptedSids - b.rejectedSids ||
        phraseName(a.phrase).localeCompare(phraseName(b.phrase)),
    );
}
export function answerDewfordTest(
  evidence: DewfordEvidence,
  accepted: boolean,
): DewfordEvidence {
  if (!evidence.pending) throw Error("Select a Dewford phrase test first");
  const { pending, ...rest } = evidence;
  return validateDewford({
    ...rest,
    tests: [
      ...rest.tests.filter((t) => phraseKey(t.phrase) !== phraseKey(pending)),
      { phrase: pending, present: !accepted },
    ],
  });
}
