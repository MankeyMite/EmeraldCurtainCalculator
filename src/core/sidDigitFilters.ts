/** Internal order follows the stored little-endian SID: S4, S3, S2, S1. */
export function validateSidDigitFilters(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some((m) => !Number.isInteger(m) || m < 0 || m > 65535)
  )
    throw Error("Expected four SID digit masks");
  return value.slice();
}
export function sidAllowed(sid: number, masks?: number[]) {
  return (
    !masks || masks.every((m, n) => !!(m & (1 << ((sid >>> (n * 4)) & 15))))
  );
}
export function allowedSidValues(masks?: number[]) {
  if (!masks || masks.every((m) => m === 65535)) return undefined;
  validateSidDigitFilters(masks);
  return Array.from({ length: 65536 }, (_, s) => s).filter((s) =>
    sidAllowed(s, masks),
  );
}
