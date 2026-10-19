// English Easy Chat IDs and strings from the project's pinned pret checkout.
import fs from "node:fs";
const root = process.argv[2] || "research/pret";
const constants = fs.readFileSync(
  `${root}/include/constants/easy_chat.h`,
  "utf8",
);
const mapping = JSON.parse(fs.readFileSync("src/data/mapping.json", "utf8"));
const groups = {};
for (const [name, group, count] of [
  ["conditions", 10, 69],
  ["lifestyle", 12, 45],
  ["hobbies", 13, 54],
]) {
  const source = fs.readFileSync(
    `${root}/src/data/easy_chat/easy_chat_group_${name}.h`,
    "utf8",
  );
  const strings = new Map(
    [...source.matchAll(/const u8 (\w+)\[\] = _\("([^"\n]*)"\);/g)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const words = [];
  for (const m of source.matchAll(
    /\[EC_INDEX\((EC_WORD_\w+)\)\]\s*=\s*\{\s*\.text\s*=\s*(\w+)/g,
  )) {
    const index = Number(
      constants.match(
        new RegExp(
          `#define ${m[1]}\\s+\\(\\(EC_GROUP_\\w+ << EC_MASK_BITS\\) \\| (\\d+)\\)`,
        ),
      )?.[1],
    );
    if (!Number.isInteger(index) || !strings.has(m[2]))
      throw Error(`Unresolved word ${m[1]}`);
    words[index] = { id: (group << 9) | index, text: strings.get(m[2]) };
  }
  if (words.length !== count || words.some((w) => !w))
    throw Error(`Invalid ${name} catalog`);
  groups[name] = words;
}
fs.writeFileSync(
  "src/data/dewford-words.json",
  JSON.stringify({ commit: mapping.commit, ...groups }, null, 2) + "\n",
);
console.log("Extracted 69 Conditions, 45 Lifestyle and 54 Hobbies words.");
