/** Common digits across the surviving SIDs. Marginal header domains are a safe
 * fallback when joint candidates have not been enumerated: they may leave more
 * question marks, but never invent a fixed decimal digit from a hex wildcard. */
export function sidDisplay(
  masks: readonly number[],
  candidates?: readonly number[],
): string {
  const values =
    candidates ??
    Array.from({ length: 65536 }, (_, v) => v).filter((v) =>
      masks.every((mask, n) => !!(mask & (1 << ((v >>> (n * 4)) & 15)))),
    );
  if (!values.length) return "????? - 0x????";
  const common = (strings: string[]) =>
    Array.from(strings[0], (digit, n) =>
      strings.every((value) => value[n] === digit) ? digit : "?",
    ).join("");
  const decimal =
    values.length === 1
      ? String(values[0])
      : common(values.map((v) => String(v).padStart(5, "0")));
  const hex = common(
    values.map((v) => v.toString(16).toUpperCase().padStart(4, "0")),
  );
  return `${decimal} - 0x${hex}`;
}
