import { useSyncExternalStore } from "react";

// Keep in sync with workbench.css. Listen to the breakpoint, not every resize
// or virtual-keyboard height change, so typing never switches workspace views.
export const MOBILE_LAYOUT_QUERY = "(max-width: 900px)";
const subscribe = (changed: () => void) => {
  const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
};
const snapshot = () => window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
export function useMobileLayout() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
