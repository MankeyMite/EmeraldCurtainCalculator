import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { crc32 } from "./capture-lib.mjs";

// An explicit source manifest prevents local ROMs, saves, captures, dependency
// trees, private handoff notes and backup files from entering the release ZIP.
export const roots = [
  ".github",
  ".vscode",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "CONTRIBUTING.md",
  "package.json",
  "package-lock.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  "src",
  "scripts",
  "tests",
  "research",
];
const excluded = new Set([
  "research/pret",
  "research/mgba-source",
  "research/captures",
  "research/local-history",
  "research/HANDOFF.md",
]);
const project = fileURLToPath(new URL("../", import.meta.url));
export function sourceFiles() {
  const files = [];
  function visit(name) {
    if (excluded.has(name) || /^research\/[^/]+\.(png|jpg)$/.test(name)) return;
    const stat = fs.lstatSync(path.join(project, name));
    if (stat.isSymbolicLink()) throw Error(`Refusing source symlink: ${name}`);
    if (stat.isDirectory())
      for (const child of fs.readdirSync(path.join(project, name)).sort())
        visit(`${name}/${child}`);
    else if (stat.isFile()) {
      if (/\.(gba|sav|ss\d+)$/i.test(name))
        throw Error(`Unexpected game dump in source: ${name}`);
      files.push(name);
    }
  }
  for (const name of roots) visit(name);
  return files.sort();
}

// Small, dependency-free ZIP writer. Stable timestamps make exports reproducible.
export function sourceZip(files) {
  const local = [],
    central = [];
  let offset = 0;
  for (const name of files) {
    const data = fs.readFileSync(path.join(project, name));
    const compressed = deflateRawSync(data),
      filename = Buffer.from(name, "utf8"),
      crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0x21, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(0x21, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(compressed.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const files = sourceFiles(),
    zip = sourceZip(files);
  const release = path.join(project, "release");
  fs.mkdirSync(release, { recursive: true });
  const output = path.join(release, "emerald-curtain-calculator-source.zip");
  fs.writeFileSync(output, zip);
  console.log(
    `${output}\n${files.length} files · ${zip.length.toLocaleString()} bytes`,
  );
}
