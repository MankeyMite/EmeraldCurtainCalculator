import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { inflateRawSync } from "node:zlib";
import { sourceFiles, sourceZip } from "../scripts/package-source.mjs";
import { crc32 } from "../scripts/capture-lib.mjs";

test("GitHub source bundle excludes local work and faithfully preserves source and binary fixtures", () => {
  const files = sourceFiles();
  for (const required of [
    ".github/workflows/pages.yml",
    ".vscode/settings.json",
    ".vscode/tasks.json",
    ".gitignore",
    "package-lock.json",
    "src/core/inference.ts",
    "research/fixtures/whismur-test.ek3",
  ])
    assert.ok(files.includes(required));
  for (const file of files)
    assert.doesNotMatch(
      file,
      /node_modules|local-history|HANDOFF|research\/(pret|captures|mgba-source)|\.(sav|gba|ss\d+)$/,
    );
  assert.ok(!files.includes("docs/preview.jpg"));
  assert.ok(!files.includes("docs/hypothesis-checker.jpg"));
  const zip = sourceZip(files);
  const unpacked: string[] = [];
  for (let at = 0; zip.readUInt32LE(at) === 0x04034b50;) {
    const length = zip.readUInt32LE(at + 18),
      originalLength = zip.readUInt32LE(at + 22);
    const nameLength = zip.readUInt16LE(at + 26),
      extra = zip.readUInt16LE(at + 28);
    const name = zip.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extra;
    const data = inflateRawSync(zip.subarray(start, start + length));
    assert.equal(data.length, originalLength);
    assert.equal(crc32(data), zip.readUInt32LE(at + 14));
    assert.deepEqual(data, fs.readFileSync(name));
    unpacked.push(name);
    at = start + length;
  }
  assert.deepEqual(unpacked, files);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  assert.ok(
    lock.packages["node_modules/@esbuild/linux-x64"],
    "CI platform dependencies retained",
  );
});
