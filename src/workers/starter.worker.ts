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
type Request = {
  kind: "search" | "shiny" | "route" | "nearby" | "landing" | "outlook";
  state: StarterGuideState;
  sidValues?: number[];
  spread?: RngSpread;
  key?: string;
};
self.onmessage = ({ data }: { data: Request }) => {
  try {
    const { kind, state } = data;
    if (kind === "outlook") {
      if (!data.spread) throw Error("Identify one starter spread first.");
      const prepared = { ...state, identifiedStarter: data.spread };
      const route = planStarterRoute(prepared, [data.spread]);
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
