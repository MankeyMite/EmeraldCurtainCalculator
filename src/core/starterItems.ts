import sources from "../data/starter-items.json";
import { ITEM_CATALOG } from "./experiments";

// The guide stops at the first Rustboro curtain reading: no badge, rescue,
// random drops, Cut or other field moves are prerequisites. Mail cannot be
// stored on a boxed Pokemon; key items and HMs are not held-item experiments.
export const STARTER_ITEMS = sources
  .filter((source) => source.stage === "early")
  .flatMap((source) => {
    const item = ITEM_CATALOG.find((item) => item.id === source.id);
    return item?.experiment ? [{ ...source, item }] : [];
  });
export const STARTER_ITEM_IDS = STARTER_ITEMS.map((source) => source.id);
export function starterItemSource(id: number) {
  return STARTER_ITEMS.find((source) => source.id === id);
}

/** Acquisition estimates rank route convenience, not displayed test timers.
 * A shared Mart visit is paid once, regardless of the number of purchases. */
export function starterItemCost(ids: number[]) {
  let seconds = 0,
    price = 0;
  const shops = new Set<string>();
  for (const id of new Set(ids)) {
    const source = starterItemSource(id);
    if (!source) continue;
    seconds += source.seconds;
    price += source.price ?? 0;
    if (source.shop) shops.add(source.shop);
  }
  return { seconds: seconds + shops.size * 30, price };
}

export function starterAcquisitionSteps(ids: number[]) {
  const sources = [...new Set(ids)]
    .map(starterItemSource)
    .filter((source) => source !== undefined);
  const buy = (shop: string) => {
    const purchases = sources.filter((source) => source.shop === shop);
    return purchases.length
      ? [
          {
            text: `At the ${shop} Mart${shop === "Petalburg" ? " on the way" : " when you arrive"}, buy one each: ${purchases.map((source) => source.item.name).join(", ")} (${purchases.reduce((total, source) => total + (source.price ?? 0), 0)} money total).`,
            order: shop === "Petalburg" ? 30 : 90,
            acquiredItems: purchases.map((source) => source.id),
          },
        ]
      : [];
  };
  return [
    ...buy("Petalburg"),
    ...sources
      .filter((source) => !source.shop)
      .map((source) => ({
        text: source.instruction,
        order: source.routeOrder ?? 80,
        acquiredItems: [source.id],
      })),
    ...buy("Rustboro"),
  ];
}
export function starterShoppingInstructions(ids: number[]): string[] {
  return starterAcquisitionSteps(ids).map((step) => step.text);
}
