import { previewStarterTid } from "../core/starterTidPreview";
import {
  searchStarter,
  searchShinyStarters,
  nearbyStarters,
  type StarterGuideState,
} from "../core/starterGuide";
import { planStarterRoute } from "../core/starterRoute";
import { STARTER_LANDING_RADIUS } from "../core/starterTiming";
import { assessStarterOutlook } from "../core/starterOutlook";
import type { RngSpread } from "../core/rng";
import {
  recommendStarter,
  catalogueStarterRoute,
} from "../core/starterRecommendation";
import type { StarterCatalogue } from "../core/starterCatalogue";
let catalogueTask: Promise<StarterCatalogue> | undefined;
function loadCatalogue() {
  return (catalogueTask ??= fetch(
    new URL("../data/starter-catalogue.json", import.meta.url),
  ).then((response) => {
    if (!response.ok)
      throw Error(
        "The starter catalogue could not be loaded. Reload the guide and try again.",
      );
    return response.json() as Promise<StarterCatalogue>;
  }));
}
type Request = {
  kind:
    | "search"
    | "shiny"
    | "route"
    | "nearby"
    | "landing"
    | "outlook"
    | "recommendation"
    | "tid-preview";
  state: StarterGuideState;
  sidValues?: number[];
  spread?: RngSpread;
  key?: string;
};
self.onmessage = async ({ data }: { data: Request }) => {
  try {
    const { kind, state } = data;
    if (kind === "tid-preview") {
      self.postMessage({ result: previewStarterTid(state) });
      return;
    }
    if (kind === "recommendation") {
      const catalogue = await loadCatalogue();
      const result = recommendStarter(catalogue, state, (done, total) =>
        self.postMessage({
          progress: Math.min(99, Math.floor((done * 100) / total)),
        }),
      );
      self.postMessage({ result });
      return;
    }
    if (kind === "outlook") {
      if (!data.spread) throw Error("Identify one starter spread first.");
      const prepared = { ...state, identifiedStarter: data.spread };
      const cachedRoute = state.starterRecommendation
        ? catalogueStarterRoute(await loadCatalogue(), prepared, data.spread)
        : null;
      const route = cachedRoute ?? planStarterRoute(prepared, [data.spread]);
      self.postMessage({
        result: {
          key: data.key,
          route,
          outlook: assessStarterOutlook(prepared, data.spread, route),
        },
      });
      return;
    }
    const result =
      kind === "search"
        ? searchStarter(state)
        : kind === "shiny"
          ? searchShinyStarters(state)
          : kind === "nearby"
            ? nearbyStarters(state)
            : kind === "landing"
              ? nearbyStarters(state, STARTER_LANDING_RADIUS)
              : planStarterRoute(state, searchStarter(state), data.sidValues);
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: (e as Error).message });
  }
};
