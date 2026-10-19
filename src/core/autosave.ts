import { loadInvestigation } from "./investigation";
export const AUTOSAVE_KEY = "emerald-curtain-investigation-v1";
export function readAutosave(storage: Pick<Storage, "getItem">) {
  try {
    const saved = storage.getItem(AUTOSAVE_KEY);
    return saved ? loadInvestigation(saved) : null;
  } catch {
    return null;
  }
}
