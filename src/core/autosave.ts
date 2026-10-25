import { loadInvestigation } from "./investigation";
export const AUTOSAVE_KEY = "emerald-curtain-investigation-v1";
export function readAutosave(
  storage: Pick<Storage, "getItem">,
  key = AUTOSAVE_KEY,
) {
  try {
    const saved = storage.getItem(key);
    return saved ? loadInvestigation(saved) : null;
  } catch {
    return null;
  }
}
