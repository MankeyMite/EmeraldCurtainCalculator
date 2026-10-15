import species from "../data/species.json";
export type Gender = "male" | "female" | "genderless";
export const speciesTraits = (id: number | undefined) =>
  species.find((s) => s.id === id);

export function genderForPid(id: number, pid: number): Gender | null {
  const data = speciesTraits(id);
  if (!data) return null;
  const ratio = data.genderRatio;
  return ratio === 255
    ? "genderless"
    : ratio === 254
      ? "female"
      : ratio === 0
        ? "male"
        : (pid & 255) < ratio
          ? "female"
          : "male";
}

// Disjoint rectangles of low/high PID nibbles preserve the low-byte gender
// correlation exactly without enumerating PIDs. Equal low masks share a case.
export function genderPidCases(
  id?: number,
  gender?: Gender,
): [number, number][] {
  if (gender === undefined) return [[0xffff, 0xffff]];
  const groups = new Map<number, number>();
  for (let hi = 0; hi < 16; hi++) {
    let loMask = 0;
    for (let lo = 0; lo < 16; lo++)
      if (genderForPid(id!, hi * 16 + lo) === gender) loMask |= 1 << lo;
    if (loMask) groups.set(loMask, (groups.get(loMask) ?? 0) | (1 << hi));
  }
  return [...groups];
}
