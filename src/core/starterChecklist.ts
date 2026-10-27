import type { RouteSetup, StarterGuideState } from "./starterGuide";
import { starterAcquisitionSteps } from "./starterItems";

export const STARTER_COMPANION_STEP =
  "Once you have Poké Balls, catch any Pokémon on Route 101, 102 or 103 before leaving Petalburg. Store it in the PC in Oldale Town or Petalburg City and keep it boxed until Rustboro; use only the starter for the listed battles.";

/** Refresh route instructions without changing Pokemon facts or replaying actions.
 * Old saved checklists keep their checkmarks and action indices when a catch
 * reminder is inserted. A catch adds no defeated Pokemon to the battle log. */
export function withStarterStorageInstructions(
  plan: RouteSetup,
  travelling: boolean,
): RouteSetup {
  const instructions = plan.instructions.map((text) =>
    text
      .replace(
        "Heal at the Pokémon Center; PC storage restores PP.",
        "PC storage fully heals the starter and restores PP.",
      )
      .replace(
        "Heal at the Pokémon Center and check the current moves.",
        "Check the current moves. PC storage fully heals the starter and restores PP.",
      )
      .replace(
        /^Heal at the Pokémon Center\.$/,
        "PC storage fully heals the starter and restores PP.",
      )
      .replace("Heal at the Pokémon Center. ", "")
      .replace(/^Heal and check/, "Check")
      .replace(
        /^(Place the starter|Withdraw your second Pokémon into your party, then place the starter)/,
        "Swap your caught Pokémon with the starter, placing the starter",
      ),
  );
  const done = plan.done.slice();
  let actions = plan.actions;
  if (
    travelling &&
    instructions.some((text) => text.startsWith("Avoid all wild battles")) &&
    !plan.train &&
    !instructions.includes(STARTER_COMPANION_STEP)
  ) {
    const rival = instructions.findIndex((text) =>
      text.startsWith("Defeat the Route 103 rival"),
    );
    const index = rival >= 0 ? rival + 1 : Math.min(1, instructions.length);
    instructions.splice(index, 0, STARTER_COMPANION_STEP);
    done.splice(index, 0, false);
    actions = actions?.map((action) => ({
      ...action,
      index: action.index >= index ? action.index + 1 : action.index,
    }));
  }
  // Older saved routes used the same order for Petalburg shopping and Lyle.
  // Move only late Petalburg purchases; retain checkmarks and action ownership.
  const firstForest = instructions.findIndex((text) =>
    text.includes("Petalburg Woods"),
  );
  const latePurchases = instructions
    .map((_, n) => n)
    .filter(
      (n) =>
        firstForest >= 0 &&
        n > firstForest &&
        instructions[n].includes("Petalburg Mart"),
    );
  const order = instructions
    .map((_, n) => n)
    .filter((n) => !latePurchases.includes(n));
  if (latePurchases.length)
    order.splice(order.indexOf(firstForest), 0, ...latePurchases);
  return {
    ...plan,
    instructions: order.map((n) => instructions[n]),
    done: order.map((n) => done[n]),
    ...(actions
      ? {
          actions: actions.map((action) => ({
            ...action,
            index: order.indexOf(action.index),
          })),
        }
      : {}),
  };
}

export function isStarterMoveStep(route: RouteSetup, index: number) {
  const text = route.instructions[index];
  return (
    !!route.actions?.some((a) => a.index === index && a.moves) ||
    text.startsWith("Confirm the starter has these moves") ||
    text.startsWith("Swap occupied move slots") ||
    text.includes("when learned") ||
    text.includes("and teach it")
  );
}

// Acquiring an item stays done when the Pokémon changes. Confirming its
// preparation does not: moves, checking and depositing refer to a specific setup.
function stepKey(route: RouteSetup, index: number) {
  const text = route.instructions[index];
  const setup =
    isStarterMoveStep(route, index) ||
    /^(Heal|Place the starter|PC storage|Withdraw your second|Swap your caught|Before depositing|Remove any held item|Restore|Box the starter)/.test(
      text,
    ) ||
    (!!route.train && !route.actions);
  return setup
    ? "setup:" +
        JSON.stringify([
          text,
          route.facts.moves,
          route.facts.evs,
          route.facts.heldItem,
        ])
    : "action:" + text;
}

function remembered(s: StarterGuideState) {
  const completed = new Set(s.completedRouteSteps ?? []);
  s.route?.done.forEach((done, index) => {
    if (done) stepKeys(s.route!, index).forEach((key) => completed.add(key));
  });
  return completed;
}

function stepKeys(route: RouteSetup, index: number) {
  const items =
    route.actions?.find((a) => a.index === index)?.acquiredItems ??
    starterAcquisitionSteps(route.items ?? []).find(
      (step) => step.text === route.instructions[index],
    )?.acquiredItems;
  return items?.length
    ? items.map((id) => `item:${id}`)
    : [stepKey(route, index)];
}

export function starterCollectedItems(s: StarterGuideState) {
  return new Set(
    [...remembered(s)]
      .filter((key) => key.startsWith("item:"))
      .map((key) => Number(key.slice(5))),
  );
}

/** Archive checked actions before discarding a plan, including older saves
 * whose only completion information is still in route.done. */
export function patchStarterGuide(
  s: StarterGuideState,
  patch: Partial<StarterGuideState>,
): StarterGuideState {
  const identityChanged =
    (patch.species !== undefined && patch.species !== s.species) ||
    (patch.tid !== undefined && patch.tid !== s.tid) ||
    (Object.hasOwn(patch, "identifiedStarter") &&
      patch.identifiedStarter?.pid !== s.identifiedStarter?.pid);
  const changed = <K extends "moves" | "battles" | "evsKnown">(key: K) =>
    Object.hasOwn(patch, key) &&
    JSON.stringify(patch[key]) !== JSON.stringify(s[key]);
  const setupChanged =
    changed("moves") || changed("battles") || changed("evsKnown");
  return {
    ...s,
    ...patch,
    ...(identityChanged ? { route: patch.route ?? null } : {}),
    completedRouteSteps: identityChanged
      ? []
      : [...remembered(s)].filter(
          (key) => !setupChanged || !key.startsWith("setup:"),
        ),
  };
}

export function recordStarterChecklist(
  s: StarterGuideState,
  index: number,
  checked: boolean,
) {
  const completed = remembered(s);
  if (s.route) {
    for (const key of stepKeys(s.route, index)) {
      if (checked) completed.add(key);
      else completed.delete(key);
    }
  }
  return [...completed];
}

/** Restore checkmarks only; never replay battles, teach a move or consume a TM. */
export function preserveStarterChecklist(
  s: StarterGuideState,
  plan: RouteSetup,
): RouteSetup {
  plan = withStarterStorageInstructions(plan, !s.routeDone);
  const completed = remembered(s);
  return {
    ...plan,
    done: plan.instructions.map((_, index) => {
      const battles = plan.actions?.find((a) => a.index === index)?.battles;
      if (
        battles &&
        !battles.every((b) =>
          s.battles.some((actual) =>
            (
              [
                "id",
                "species",
                "count",
                "multiplier",
                "level",
                "trainer",
              ] as const
            ).every((key) => actual[key] === b[key]),
          ),
        )
      )
        return false;
      return (
        plan.done[index] ||
        stepKeys(plan, index).every((key) => completed.has(key))
      );
    }),
  };
}

export function starterTravelReady(plan: RouteSetup) {
  // The arrival screen collects actual moves. Never require a false move
  // confirmation merely to get there when an extra battle taught a new move.
  return plan.instructions
    .slice(0, -2)
    .every((_, i) => plan.done[i] || isStarterMoveStep(plan, i));
}

/** Present old saved plans as concise instructions without requiring a migration
 * of their action indices or recorded completion state. */
export function starterRouteBulletPoints(plan: RouteSetup): string[] {
  return plan.instructions
    .map((text) =>
      text
        .replace(
          /Check off each battle once; cancel evolution\./,
          "Cancel evolution.",
        )
        .replace(
          "Check off the listed battles once, rather than recording them again in the battle log. ",
          "",
        )
        .replace(
          "Confirm the starter has these moves in this order:",
          "Arrange the moves in this order:",
        )
        .replace(
          /PC storage (?:fully heals the starter and restores PP|restores PP)\.?/g,
          "",
        )
        .replace(
          /Check all four current moves before boxing;\s*Cancel evolution during this investigation\./,
          "Cancel evolution during this investigation.",
        )
        .replace(/^Check the current moves\.\s*$/, "")
        .trim(),
    )
    .filter(Boolean);
}
