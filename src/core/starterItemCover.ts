import { starterItemSource } from "./starterItems";

const count = (mask: number) => {
  let total = 0;
  for (; mask; mask &= mask - 1) total++;
  return total;
};

/** Each requirement lists the items that can distinguish one still-confusable
 * SID pair. Cover all available distinctions, with shared shopping trips and
 * one test per item. A bounded search improves a greedy incumbent; a final
 * removal pass guarantees no retained item is redundant even at the bound. */
export function coverStarterItems(requirements: number[], ids: number[]) {
  if (ids.length > 30) throw Error("Too many early-route item choices.");
  const constraints: number[] = [];
  for (const mask of [...new Set(requirements)]
    .filter(Boolean)
    .sort((a, b) => count(a) - count(b)))
    if (!constraints.some((required) => (required & mask) === required))
      constraints.push(mask);
  if (!constraints.length) return [];
  const sources = ids.map(starterItemSource);
  const cost = (mask: number) => {
    let seconds = 0,
      price = 0,
      shops = 0;
    for (let i = 0; i < ids.length; i++)
      if (mask & (1 << i)) {
        seconds += 30 + (sources[i]?.seconds ?? 0);
        price += sources[i]?.price ?? 0;
        if (sources[i]?.shop === "Rustboro") shops |= 1;
        if (sources[i]?.shop === "Petalburg") shops |= 2;
      }
    return [seconds + count(shops) * 30, count(mask), price];
  };
  const better = (a: number, b: number) => {
    const ca = cost(a),
      cb = cost(b);
    return (
      ca[0] < cb[0] ||
      (ca[0] === cb[0] && (ca[1] < cb[1] || (ca[1] === cb[1] && ca[2] < cb[2])))
    );
  };
  const complete = (mask: number) =>
    constraints.every((required) => (required & mask) !== 0);
  let greedy = 0;
  while (!complete(greedy)) {
    let next = -1,
      rate = -1;
    for (let i = 0; i < ids.length; i++)
      if (!(greedy & (1 << i))) {
        const gain = constraints.filter(
          (required) => !(required & greedy) && required & (1 << i),
        ).length;
        const value = gain / (cost(greedy | (1 << i))[0] - cost(greedy)[0]);
        if (value > rate) {
          rate = value;
          next = i;
        }
      }
    if (next < 0 || rate <= 0) throw Error("Item coverage is unreachable.");
    greedy |= 1 << next;
  }
  let best = greedy;
  const visited = new Set<number>();
  const visit = (selected: number) => {
    if (visited.has(selected) || visited.size >= 20000) return;
    visited.add(selected);
    const required = constraints.find((mask) => !(mask & selected));
    if (required === undefined) {
      if (better(selected, best)) best = selected;
      return;
    }
    if (cost(selected)[0] >= cost(best)[0]) return;
    const choices = ids.flatMap((_, i) =>
      required & (1 << i) ? [selected | (1 << i)] : [],
    );
    choices.sort((a, b) => cost(a)[0] - cost(b)[0]);
    for (const next of choices) if (cost(next)[0] <= cost(best)[0]) visit(next);
  };
  visit(0);
  for (let i = ids.length - 1; i >= 0; i--)
    if (best & (1 << i) && complete(best & ~(1 << i))) best &= ~(1 << i);
  return ids.filter((_, i) => (best & (1 << i)) !== 0);
}
