import catalogs from "../data/named-facts.json";
import items from "../data/items.json";
export type CatalogEntry = { id: number; name: string };
export const FACT_CATALOGS = catalogs;
export const HELD_ITEM_CATALOG: CatalogEntry[] = [
  { id: 0, name: "No held item" },
  ...items.map((i) => ({ id: i.id, name: i.name })),
];
export const normalizeCatalogName = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function resolveCatalogInput(
  text: string,
  entries: CatalogEntry[],
  max: number,
): number | null {
  const value = text.trim();
  if (!value) return null;
  if (/^(?:\d+|0x[\da-f]+)$/i.test(value)) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 && number <= max
      ? number
      : null;
  }
  const matches = entries.filter(
    (entry) => normalizeCatalogName(entry.name) === normalizeCatalogName(value),
  );
  return matches.length === 1 ? matches[0].id : null;
}
export function catalogName(
  value: string | undefined,
  entries: CatalogEntry[],
): string {
  if (!value?.trim()) return "";
  return entries.find((entry) => entry.id === Number(value))?.name ?? value;
}
