import defaultRules from "../data/starter-catalogue-rules.json";
import learnsets from "../data/level-up-learnsets.json";
import machines from "../data/machine-learnsets.json";
import { scanStaticSpreads } from "./staticRng";
import { SUBSTRUCT_POSITIONS } from "./pokemon";
import { makeHypothesis } from "./sid";
import { knownPlaintext } from "./inference";
import {
  newStarterGuide,
  creationMoves,
  battleEvs,
  STARTERS,
  type BattleEntry,
} from "./starterGuide";
import {
  starterJourney,
  starterBattleExperience,
  starterLevelAt,
  restoredMoveFacts,
} from "./starterJourney";
import {
  legalMoveOrders,
  routeCheckpoint,
  starterPlaintext,
} from "./starterRoute";
import { levelExperience } from "./controlledExperiments";
import { maxPp } from "./pp";
import { moveName, swapMoveFacts } from "./moveLearningExperiments";
import {
  STARTER_ITEMS,
  starterItemCost,
  starterAcquisitionSteps,
} from "./starterItems";
import type { KnownFacts } from "./constraints";
import { calculateStat } from "./stats";
import { speciesTraits } from "./traits";
import { validateFacts } from "./session";

export type SidTestMasks = [number, number, number, number]; // S4, S3, S2, S1.
export type ExtraCataloguePlaintext = {
  id: string;
  facts: KnownFacts;
  source: string;
  species?: number[];
};
export type StarterCatalogueRules = Omit<
  typeof defaultRules,
  "forestTrainer" | "additionalPlaintext"
> & {
  forestTrainer: BattleEntry;
  additionalPlaintext: ExtraCataloguePlaintext[];
};
export const STARTER_CATALOGUE_RULES: StarterCatalogueRules =
  defaultRules as StarterCatalogueRules;
export type CataloguePreparation = {
  id: number;
  species: number;
  level: number;
  experience: number;
  facts: KnownFacts;
  battles: BattleEntry[];
  extraLevelBattles: number;
  consumedItems: number[];
  instructions: string[];
  seconds: number;
  plaintextMasks: SidTestMasks;
  withoutTrainingMasks: SidTestMasks;
  shortTrainingMasks: SidTestMasks;
  trainingMasks: { cap: number; masks: SidTestMasks }[];
};
export type CatalogueItem = {
  id: number;
  name: string;
  instructions: string[];
  seconds: number;
  plaintextMasks: SidTestMasks;
};
export type CatalogueOption = {
  preparation: number;
  item: number;
  seconds: number;
  plaintextMasks: SidTestMasks;
};
export type CatalogueSpread = {
  advance: number;
  pid: number;
  ivs: number[];
  abilitySlot: number;
  ivMasks: SidTestMasks;
  baseMasks: SidTestMasks; // IVs + known zero plaintext + SID-header zero tests.
  level5Stats: Record<number, number[]>;
  ivTests: {
    position: number;
    candidate: number;
    plaintext: number;
    logicalNibble: number;
    observation: number;
  }[];
};
export type StarterCatalogue = {
  version: 2;
  rules: StarterCatalogueRules;
  seed: 0;
  method: "Method1";
  statOrder: string[];
  digitOrder: string[];
  plaintextSources: string[];
  spreads: CatalogueSpread[];
  preparations: CataloguePreparation[];
  items: CatalogueItem[];
  options: Record<number, CatalogueOption[]>;
};

/** Singleton plaintext tests only: no guessed EXP, friendship, checksums or
 * information pooled across incompatible items/moves/training checkpoints. */
export function cataloguePlaintextMasks(plain: number[]): SidTestMasks {
  const masks: SidTestMasks = [0, 0, 0, 0];
  plain.forEach((mask, n) => {
    if (n % 8 >= 4 && mask && !(mask & (mask - 1))) masks[(n % 8) - 4] |= mask;
  });
  return masks;
}
function applyAdditionalSources(
  facts: KnownFacts,
  species: number,
  experience: number,
  rules: StarterCatalogueRules,
): KnownFacts {
  let result = { ...facts };
  for (const source of rules.additionalPlaintext) {
    if (
      !source.id?.trim() ||
      !source.source?.trim() ||
      !source.facts ||
      !Object.keys(source.facts).length
    )
      throw Error(
        "Additional catalogue plaintext needs known facts and a verified source.",
      );
    if (source.species && !source.species.includes(species)) continue;
    const added = validateFacts(source.facts);
    for (const key of Object.keys(added) as (keyof KnownFacts)[]) {
      if (
        [
          "pid",
          "tid",
          "sid",
          "ivs",
          "nature",
          "gender",
          "shiny",
          "assumed",
          "notes",
        ].includes(key)
      )
        throw Error(
          "Additional plaintext must not supply a hidden identity or guessed RNG result.",
        );
      if (
        result[key] !== undefined &&
        JSON.stringify(result[key]) !== JSON.stringify(added[key])
      )
        throw Error("Additional plaintext contradicts the preparation.");
    }
    if (added.experience !== undefined && added.experience !== experience)
      throw Error("Additional EXP contradicts the modeled battles.");
    result = { ...result, ...added };
  }
  return result;
}
export function catalogueBattles(
  species: number,
  rules = STARTER_CATALOGUE_RULES,
): BattleEntry[] {
  const state = newStarterGuide();
  const journey = starterJourney(species).flatMap((step) => step.battles);
  // Lyle is included as a conservative route assumption, not an unavoidable fight.
  return [
    ...state.battles,
    ...journey.slice(0, 2),
    { ...rules.forestTrainer },
    ...journey.slice(2),
  ];
}

type Learning = {
  moves: number[];
  instructions: string[];
  consumedItems: number[];
  seconds: number;
};
function naturalMoves(species: number, level: number): Learning[] {
  let states: Learning[] = [
    {
      moves: creationMoves(species) as number[],
      instructions: [],
      consumedItems: [],
      seconds: 0,
    },
  ];
  for (const [learnLevel, move] of (learnsets as Record<number, number[][]>)[
    species
  ] ?? []) {
    if (learnLevel <= 5 || learnLevel > level) continue;
    const next: Learning[] = [];
    for (const state of states) {
      next.push({
        ...state,
        instructions: [
          ...state.instructions,
          `Decline ${moveName(move)} at level ${learnLevel}.`,
        ],
      });
      if (state.moves.includes(move)) continue;
      const empty = state.moves.indexOf(0),
        slots = empty < 0 ? [0, 1, 2, 3] : [empty];
      for (const slot of slots) {
        const moves = state.moves.slice(),
          replaced = moves[slot];
        moves[slot] = move;
        next.push({
          ...state,
          moves,
          instructions: [
            ...state.instructions,
            `Learn ${moveName(move)} at level ${learnLevel}${replaced ? `, replacing ${moveName(replaced)}` : ""}.`,
          ],
        });
      }
    }
    states = [...new Map(next.map((s) => [s.moves.join(), s])).values()];
  }
  return states;
}
function machineVariants(
  states: Learning[],
  species: number,
  rules: StarterCatalogueRules,
) {
  const compatible =
    (machines.compatibility as Record<number, number[]>)[species] ?? [];
  const options = states.slice(),
    seen = new Set(options.map((s) => `${s.moves}/${s.consumedItems}`));
  const hmMoves = new Set(
    machines.machines
      .filter((m) => m.machine.startsWith("HM"))
      .map((m) => m.move),
  );
  for (let at = 0; at < options.length; at++) {
    const state = options[at];
    for (const move of rules.machineMoves) {
      if (!compatible.includes(move) || state.moves.includes(move)) continue;
      const tm = move === 331;
      if (tm && state.consumedItems.includes(297)) continue;
      const empty = state.moves.indexOf(0),
        slots = empty < 0 ? [0, 1, 2, 3] : [empty];
      for (const slot of slots) {
        if (hmMoves.has(state.moves[slot])) continue; // HMs cannot be forgotten here.
        const moves = state.moves.slice(),
          replaced = moves[slot];
        moves[slot] = move;
        const consumedItems = tm
          ? [...state.consumedItems, 297]
          : state.consumedItems.slice();
        const key = `${moves}/${consumedItems}`;
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({
          moves,
          consumedItems,
          seconds: state.seconds + (tm ? 60 : 45),
          instructions: [
            ...state.instructions,
            tm
              ? "Get TM09 Bullet Seed from the boy south of the Route 104 Flower Shop."
              : "Get HM01 Cut from Cutter's House in Rustboro; no badge is needed to teach it.",
            `Teach ${moveName(move)}${replaced ? `, replacing ${moveName(replaced)}` : " into the empty slot"}.`,
          ],
        });
      }
    }
  }
  return options;
}

function buildPreparations(rules: StarterCatalogueRules) {
  const result: CataloguePreparation[] = [];
  for (const species of STARTERS) {
    const battles = catalogueBattles(species, rules),
      baseExperience = starterBattleExperience(battles);
    if (baseExperience === undefined)
      throw Error(
        "Catalogue route needs verified battle levels and EXP yields.",
      );
    const baseLevel = starterLevelAt(species, baseExperience);
    const levels = [
      ...new Set([
        baseLevel,
        ...((learnsets as Record<number, number[][]>)[species] ?? [])
          .filter(([level]) => level > baseLevel && level <= rules.maxLevel)
          .map(([level]) => level),
      ]),
    ];
    const seen = new Map<string, CataloguePreparation>();
    for (const level of levels) {
      const training = rules.levelTraining;
      const one: BattleEntry = {
        id: `catalogue-level-${level}`,
        species: training.species,
        level: training.level,
        trainer: false,
        multiplier: 1,
        count: 1,
      };
      const gain = starterBattleExperience([...battles, one])! - baseExperience;
      if (!Number.isFinite(gain) || gain <= 0)
        throw Error(
          "Catalogue level training needs a verified positive EXP yield.",
        );
      const count = Math.max(
        0,
        Math.ceil((levelExperience(species, level) - baseExperience) / gain),
      );
      if (count > training.maximumBattles) continue;
      const actualBattles = count ? [...battles, { ...one, count }] : battles;
      const experience = starterBattleExperience(actualBattles)!;
      const state = newStarterGuide();
      state.species = species;
      state.battles = actualBattles;
      const base = { ...routeCheckpoint(state) };
      delete base.heldItem; // Selected separately; never pool several items.
      for (const learned of machineVariants(
        naturalMoves(species, level),
        species,
        rules,
      ))
        for (const order of legalMoveOrders(restoredMoveFacts(learned.moves))) {
          const facts = applyAdditionalSources(
            { ...base, ...order.facts },
            species,
            experience,
            rules,
          );
          const plain = knownPlaintext(facts);
          const seconds =
            count * 60 + learned.seconds + order.instructions.length * 30;
          const key = `${facts.moves}/${facts.evs}/${learned.consumedItems}`;
          const old = seen.get(key);
          if (old && old.seconds <= seconds) continue;
          const prep: CataloguePreparation = {
            id: -1,
            species,
            level,
            experience,
            facts,
            battles: actualBattles,
            extraLevelBattles: count,
            consumedItems: learned.consumedItems,
            instructions: [
              ...starterJourney(species).flatMap((step, index) =>
                index === 2
                  ? [
                      "Fight Bug Catcher Lyle's four level-3 Wurmple in Petalburg Woods with only the starter (+4 HP EVs).",
                      step.text,
                    ]
                  : [step.text],
              ),
              ...learned.instructions,
              ...(count
                ? [
                    `After the listed battles, defeat exactly ${count} level-${training.level} Wurmple to reach level ${level}; these add HP EVs only.`,
                  ]
                : []),
              `Arrange the moves as: ${facts.moves!.map((m) => (m ? moveName(m) : "empty")).join(" / ")}.`,
              "Heal and deposit the starter to restore PP. Cancel evolution.",
            ],
            seconds,
            plaintextMasks: cataloguePlaintextMasks(plain),
            withoutTrainingMasks: [0, 0, 0, 0],
            shortTrainingMasks: [0, 0, 0, 0],
            trainingMasks: [],
          };
          seen.set(key, prep);
        }
    }
    for (const prep of seen.values()) {
      prep.id = result.length;
      result.push(prep);
    }
  }
  return result;
}

export function buildStarterCatalogue(
  rules: StarterCatalogueRules = STARTER_CATALOGUE_RULES,
): StarterCatalogue {
  if (
    !Number.isInteger(rules.minAdvance) ||
    !Number.isInteger(rules.maxAdvance) ||
    rules.minAdvance < 0 ||
    rules.maxAdvance < rules.minAdvance ||
    rules.maxAdvance - rules.minAdvance > 5000
  )
    throw Error("Use an ordered catalogue range of at most 5001 advances.");
  if (rules.machineMoves.some((m) => ![15, 331].includes(m)))
    throw Error(
      "Add verified machine acquisition rules before extending this move list.",
    );
  const preparations = buildPreparations(rules);
  const items: CatalogueItem[] = [
    {
      id: 0,
      name: "No held item",
      instructions: ["Remove any held item."],
      seconds: 0,
      plaintextMasks: cataloguePlaintextMasks(knownPlaintext({ heldItem: 0 })),
    },
    ...STARTER_ITEMS.map((source) => ({
      id: source.id,
      name: source.item.name,
      instructions: starterAcquisitionSteps([source.id]).map((s) => s.text),
      seconds: 30 + starterItemCost([source.id]).seconds,
      plaintextMasks: cataloguePlaintextMasks(
        knownPlaintext({ heldItem: source.id }),
      ),
    })),
  ];
  // Separate future experiments from the one-item initial drawing.
  const evCoverage = new Map<string, SidTestMasks>();
  for (const prep of preparations) {
    const easy = prep.plaintextMasks.slice() as SidTestMasks;
    const add = (to: SidTestMasks, masks: SidTestMasks) =>
      masks.forEach((m, n) => (to[n] |= m));
    for (const item of items)
      if (!prep.consumedItems.includes(item.id)) add(easy, item.plaintextMasks);
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++)
        if (prep.facts.moves?.[a] && prep.facts.moves[b])
          add(
            easy,
            cataloguePlaintextMasks(
              knownPlaintext(swapMoveFacts(prep.facts, a, b)),
            ),
          );
    prep.withoutTrainingMasks = easy;
    const short = easy.slice() as SidTestMasks;
    const evs = prep.facts.evs as number[];
    for (const stat of [2, 3])
      for (let target = evs[stat] + 1; target <= 10; target++) {
        const next = evs.slice();
        next[stat] = target;
        add(short, cataloguePlaintextMasks(knownPlaintext({ evs: next })));
      }
    prep.shortTrainingMasks = short;
    prep.trainingMasks = [16, 32, 64, 110, 240].map((cap) => {
      const masks = short.slice() as SidTestMasks;
      const key = evs.join() + "/" + cap;
      let evMasks = evCoverage.get(key);
      if (!evMasks) {
        evMasks = [0, 0, 0, 0];
        for (const stat of [2, 3])
          for (let target = 11; target <= cap; target++) {
            const next = evs.slice();
            next[stat] = target;
            add(
              evMasks,
              cataloguePlaintextMasks(knownPlaintext({ evs: next })),
            );
          }
        evCoverage.set(key, evMasks);
      }
      add(masks, evMasks);
      return { cap, masks };
    });
  }
  const options: Record<number, CatalogueOption[]> = {};
  for (const species of STARTERS) {
    const unique = new Map<string, CatalogueOption>();
    for (const prep of preparations.filter((p) => p.species === species))
      for (const item of items) {
        if (prep.consumedItems.includes(item.id)) continue;
        const masks = prep.plaintextMasks.map(
          (m, n) => m | item.plaintextMasks[n],
        ) as SidTestMasks;
        const key = [
            masks,
            prep.withoutTrainingMasks,
            prep.shortTrainingMasks,
            ...prep.trainingMasks.map((t) => t.masks),
          ]
            .map((m) => m.join())
            .join("/"),
          seconds = prep.seconds + item.seconds;
        if (!unique.has(key) || unique.get(key)!.seconds > seconds)
          unique.set(key, {
            preparation: prep.id,
            item: item.id,
            seconds,
            plaintextMasks: masks,
          });
      }
    // Keep the cheapest representative of each equivalent coverage. Every
    // legal recipe/order remains in preparations for inspection/extension.
    const ordered = [...unique.values()].sort(
      (a, b) =>
        a.seconds - b.seconds ||
        a.preparation - b.preparation ||
        a.item - b.item,
    );
    options[species] = [];
    const covers = (a: CatalogueOption, b: CatalogueOption) =>
      [
        a.plaintextMasks,
        preparations[a.preparation].withoutTrainingMasks,
        preparations[a.preparation].shortTrainingMasks,
        ...preparations[a.preparation].trainingMasks.map((t) => t.masks),
      ].every((masks, index) => {
        const other = [
          b.plaintextMasks,
          preparations[b.preparation].withoutTrainingMasks,
          preparations[b.preparation].shortTrainingMasks,
          ...preparations[b.preparation].trainingMasks.map((t) => t.masks),
        ][index];
        return masks.every((m, n) => (m & other[n]) === other[n]);
      });
    for (const option of ordered) {
      if (
        options[species].some(
          (other) => other.seconds <= option.seconds && covers(other, option),
        )
      )
        continue;
      options[species] = options[species].filter(
        (other) => !(other.seconds === option.seconds && covers(option, other)),
      );
      options[species].push(option);
    }
  }
  const spreads: CatalogueSpread[] = [];
  for (let advance = rules.minAdvance; advance <= rules.maxAdvance; advance++) {
    const spread = scanStaticSpreads(
      {
        kind: "static",
        seed: 0,
        minAdvance: advance,
        maxAdvance: advance,
        methods: ["Method1"],
        areaId: "",
        lead: "none",
        synchronizeNature: 0,
      },
      { species: 277, metLevel: 5 },
      [],
    )[0];
    const h = {
      ...makeHypothesis(spread.pid, 0, 0),
      rng: { ivs: spread.ivs, abilitySlot: spread.abilitySlot },
    };
    const plain = starterPlaintext({ ivs: spread.ivs }, h);
    const ivMasks: SidTestMasks = [0, 0, 0, 0];
    const ivTests = [84, 85, 86, 87].map((n) => {
      const digit = (n % 8) - 4,
        plaintext = Math.log2(plain[n]);
      if (!Number.isInteger(plaintext))
        throw Error("IV generation did not establish an exact nibble.");
      const candidate = plaintext ^ ((spread.pid >>> ((digit + 4) * 4)) & 15);
      ivMasks[digit] |= 1 << candidate;
      const physical = SUBSTRUCT_POSITIONS[spread.pid % 24][3] * 24 + (n % 24);
      return {
        position: 4 - digit,
        candidate,
        plaintext,
        logicalNibble: n,
        observation: 80 + physical,
      };
    });
    spreads.push({
      advance,
      pid: spread.pid,
      ivs: spread.ivs,
      abilitySlot: spread.abilitySlot,
      ivMasks,
      baseMasks: ivMasks.map(
        (mask, n) => mask | 1 | (1 << ((spread.pid >>> ((n + 4) * 4)) & 15)),
      ) as SidTestMasks,
      level5Stats: Object.fromEntries(
        STARTERS.map((species) => [
          species,
          spread.ivs.map((iv, stat) =>
            calculateStat(
              speciesTraits(species)!.summaryBaseStats[stat],
              iv,
              stat === 3 ? 1 : 0,
              5,
              stat,
              spread.pid % 25,
            ),
          ),
        ]),
      ),
      ivTests,
    });
  }
  return {
    version: 2,
    rules: structuredClone(rules),
    seed: 0,
    method: "Method1",
    statOrder: [
      "HP",
      "Attack",
      "Defense",
      "Speed",
      "Sp. Attack",
      "Sp. Defense",
    ],
    digitOrder: ["S4", "S3", "S2", "S1"],
    plaintextSources: [
      "Known IV word and single starter ability slot",
      "Fresh starter: no egg, PP Ups, contest condition, ribbons or Pokerus",
      "Early-starter stored padding, matching the existing guide assumptions",
      "Modeled route EVs, including Lyle and James",
      "One obtainable held item",
      "One legal move order, full PP after PC storage",
      "Unencrypted SID header tests digit zero",
    ],
    spreads,
    preparations,
    items,
    options,
  };
}

/** Resolve a winning option into facts/instructions for the existing curtain
 * engine. The SID is never supplied to preparation or route selection. */
export function cataloguePreparation(
  catalogue: StarterCatalogue,
  spread: CatalogueSpread,
  option: CatalogueOption,
) {
  const prep = catalogue.preparations[option.preparation],
    item = catalogue.items.find((i) => i.id === option.item)!;
  return {
    facts: {
      ...structuredClone(prep.facts),
      pid: spread.pid,
      ivs: spread.ivs.slice(),
      heldItem: item.id,
    },
    instructions: [
      ...prep.instructions,
      ...item.instructions,
      item.id
        ? `Give ${item.name} to the starter before depositing it.`
        : "Keep the starter without a held item.",
      "Put the starter in Box 8, slot 5, with slots 4 and 6 empty. Reenter Rustboro Trainer's School.",
    ],
    battles: structuredClone(prep.battles),
    consumedItems: prep.consumedItems.slice(),
  };
}
