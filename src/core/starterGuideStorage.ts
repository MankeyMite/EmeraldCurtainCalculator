import {
  GUIDE_KEY,
  GUIDE_LAB_KEY,
  newStarterGuide,
  validateStarterGuide,
  type StarterGuideState,
} from "./starterGuide";

export const GUIDE_RESET_BACKUP_KEY = "emerald-starter-guide-reset-backup-v1";
type GuideStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Only this guide's two saves are replaced; advanced investigations stay put. */
export function resetGuideProgress(
  storage: GuideStorage,
  current: StarterGuideState,
) {
  const fresh = newStarterGuide();
  fresh.intro = { ...current.intro };
  fresh.starter = { ...current.starter };
  const previous = {
    guide: storage.getItem(GUIDE_KEY),
    investigation: storage.getItem(GUIDE_LAB_KEY),
  };
  // Preserve a recoverable copy before clearing any progress.
  storage.setItem(GUIDE_RESET_BACKUP_KEY, JSON.stringify(previous));
  try {
    storage.setItem(GUIDE_KEY, JSON.stringify(validateStarterGuide(fresh)));
    storage.removeItem(GUIDE_LAB_KEY);
  } catch (error) {
    if (previous.guide === null) storage.removeItem(GUIDE_KEY);
    else storage.setItem(GUIDE_KEY, previous.guide);
    throw error;
  }
  return fresh;
}

export function restoreGuideProgress(storage: GuideStorage) {
  const saved = storage.getItem(GUIDE_RESET_BACKUP_KEY);
  if (!saved) throw Error("No previous guide is available to restore.");
  const previous = JSON.parse(saved);
  if (
    !previous ||
    ![previous.guide, previous.investigation].every(
      (value) => value === null || typeof value === "string",
    )
  )
    throw Error("The previous guide could not be restored.");
  if (previous.guide !== null) validateStarterGuide(JSON.parse(previous.guide));
  for (const [key, value] of [
    [GUIDE_KEY, previous.guide],
    [GUIDE_LAB_KEY, previous.investigation],
  ] as const)
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  storage.removeItem(GUIDE_RESET_BACKUP_KEY);
}
