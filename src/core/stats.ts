import type { KnownFacts } from "./constraints";
import { speciesTraits } from "./traits";

// Separate summary observations: ranges are not silently promoted to exact IV facts.
export type SummaryStats = { level?: number; stats: (number | null)[] };
export function validateSummaryStats(value: unknown): SummaryStats {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw Error("Invalid summary stats");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((k) => k !== "level" && k !== "stats"))
    throw Error("Unsupported summary stat field");
  if (
    v.level !== undefined &&
    (!Number.isInteger(v.level) ||
      (v.level as number) < 1 ||
      (v.level as number) > 100)
  )
    throw Error("Level must be 1–100");
  if (
    !Array.isArray(v.stats) ||
    v.stats.length !== 6 ||
    !v.stats.every(
      (n) =>
        n === null ||
        (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 65535),
    )
  )
    throw Error(
      "Summary stats require six positive whole numbers or null for unknown",
    );
  return {
    ...(v.level === undefined ? {} : { level: v.level as number }),
    stats: v.stats.slice(),
  };
}
export function summaryFromDraft(draft: Record<string, string>): SummaryStats {
  const read = (key: string) => {
    const text = (draft[key] ?? "").trim();
    if (!text) return undefined;
    if (!/^\d+$/.test(text))
      throw Error("Summary stats and level require whole decimal numbers");
    return Number(text);
  };
  return validateSummaryStats({
    ...(read("level") === undefined ? {} : { level: read("level") }),
    stats: Array.from({ length: 6 }, (_, i) => read(`stat_${i}`) ?? null),
  });
}
export function summaryToDraft(summary?: SummaryStats): Record<string, string> {
  return summary
    ? {
        level: summary.level === undefined ? "" : String(summary.level),
        ...Object.fromEntries(
          summary.stats.map((n, i) => [
            `stat_${i}`,
            n === null ? "" : String(n),
          ]),
        ),
      }
    : {};
}

/** pret CalculateMonStats / ModifyStatByNature, ordinary English Emerald summary. */
export function calculateStat(
  base: number,
  iv: number,
  ev: number,
  level: number,
  index: number,
  nature: number,
  shedinja = false,
): number {
  const scaled = Math.floor(
    ((2 * base + iv + Math.floor(ev / 4)) * level) / 100,
  );
  if (index === 0) return shedinja ? 1 : scaled + level + 10;
  const plus = Math.floor(nature / 5) + 1,
    minus = (nature % 5) + 1;
  const percent =
    plus === minus ? 100 : index === plus ? 110 : index === minus ? 90 : 100;
  return Math.floor(((scaled + 5) * percent) / 100);
}
export function estimateIVs(
  facts: KnownFacts,
  summary: SummaryStats,
  curtain: number[][],
) {
  const data = speciesTraits(facts.species);
  return summary.stats.map((stat, i) => {
    let why = "";
    const ev = facts.evs?.[i];
    if (stat === null) why = "Enter the summary stat";
    else if (!data) why = "Choose the species";
    else if (summary.level === undefined) why = "Enter the current level";
    const evs = ev == null ? Array.from({ length: 64 }, (_, n) => n * 4) : [ev];
    const natures =
      facts.nature === undefined && i !== 0
        ? Array.from({ length: 25 }, (_, n) => n)
        : [facts.nature ?? 0];
    const statValues = why
      ? null
      : Array.from({ length: 32 }, (_, n) => n).filter((iv) =>
          evs.some((ev) =>
            natures.some(
              (nature) =>
                calculateStat(
                  data!.summaryBaseStats[i],
                  iv,
                  ev,
                  summary.level!,
                  i,
                  nature,
                  data!.name === "Shedinja",
                ) === stat,
            ),
          ),
        );
    return {
      why,
      note:
        !why && (ev == null || (i !== 0 && facts.nature === undefined))
          ? "Bounds include unknown EVs/natures; verified values narrow further."
          : "",
      curtain: curtain[i],
      stats: statValues,
      combined:
        statValues === null
          ? curtain[i]
          : curtain[i].filter((n) => statValues.includes(n)),
    };
  });
}
export function valueRanges(values: number[]) {
  const runs: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const first = values[i];
    let last = first;
    while (values[i + 1] === last + 1) last = values[++i];
    runs.push(first === last ? String(first) : `${first}–${last}`);
  }
  return runs.length ? runs.join(", ") : "None";
}
export function promoteExactIVs(
  facts: KnownFacts,
  estimates: ReturnType<typeof estimateIVs>,
): KnownFacts {
  if (estimates.some((row) => row.stats !== null && row.combined.length === 0))
    throw Error("Resolve conflicting summary stats before applying IVs");
  const ivs = (facts.ivs ?? Array<null>(6).fill(null)).slice();
  estimates.forEach((row, i) => {
    if (row.stats === null || row.combined.length !== 1) return;
    if (ivs[i] !== null && ivs[i] !== row.combined[0])
      throw Error("The IV estimate conflicts with known information");
    ivs[i] = row.combined[0];
  });
  return { ...facts, ivs };
}
