import { loadInvestigation } from "./investigation";
import { defaultSpindaMatcher } from "./spindaMatcher";
export const AUTOSAVE_KEY = "emerald-curtain-investigation-v1";
export function readAutosave(
  storage: Pick<Storage, "getItem">,
  key = AUTOSAVE_KEY,
  options: { resetSpindaGuide?: boolean } = {},
) {
  try {
    const saved = storage.getItem(key);
    if (!saved) return null;
    const investigation = loadInvestigation(saved);
    const hasSpindaGuide = !!(
      investigation.spindaMatcher?.journey ||
      investigation.spindaMatcher?.guide ||
      investigation.spindaMatcher?.sidProgress
    );
    if (options.resetSpindaGuide && hasSpindaGuide) {
      if (
        investigation.identity.species === undefined ||
        investigation.identity.species === 308
      )
        return null;
      return { ...investigation, spindaMatcher: defaultSpindaMatcher() };
    }
    return investigation;
  } catch {
    return null;
  }
}
