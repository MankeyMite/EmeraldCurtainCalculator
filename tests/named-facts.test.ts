import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FACT_CATALOGS,
  resolveCatalogInput,
  catalogName,
} from "../src/core/catalogs";
import { NamedIdInput } from "../src/components/NamedIdInput";

test("named catalogs use stored Gen 3 IDs, keeping Emerald, English and Ball code spaces distinct", () => {
  assert.equal(FACT_CATALOGS.moves.length, 355);
  for (const [text, catalog, max, expected] of [
    ["Tackle", FACT_CATALOGS.moves, 65535, 33],
    ["double slap", FACT_CATALOGS.moves, 65535, 3],
    ["No move (empty slot)", FACT_CATALOGS.moves, 65535, 0],
    ["Route 101", FACT_CATALOGS.metLocations, 255, 16],
    ["Ruby", FACT_CATALOGS.games, 15, 2],
    ["Emerald", FACT_CATALOGS.games, 15, 3],
    ["English", FACT_CATALOGS.languages, 255, 2],
    ["Poke Ball", FACT_CATALOGS.balls, 15, 4],
    ["Master Ball", FACT_CATALOGS.balls, 15, 1],
    ["Fateful encounter", FACT_CATALOGS.metLocations, 255, 255],
  ] as const)
    assert.equal(resolveCatalogInput(text, catalog, max), expected, text);
  for (const entries of Object.values(FACT_CATALOGS)) {
    for (const entry of entries)
      assert.equal(
        resolveCatalogInput(entry.name, entries, 65535),
        entry.id,
        entry.name,
      );
  }
});

test("partial names remain unknown, blank differs from no move, and legacy raw IDs are preserved", () => {
  assert.equal(resolveCatalogInput("Tack", FACT_CATALOGS.moves, 65535), null);
  assert.equal(
    resolveCatalogInput("Not a move", FACT_CATALOGS.moves, 65535),
    null,
  );
  assert.equal(resolveCatalogInput("", FACT_CATALOGS.moves, 65535), null);
  assert.equal(resolveCatalogInput("0", FACT_CATALOGS.moves, 65535), 0);
  assert.equal(resolveCatalogInput("0x21", FACT_CATALOGS.moves, 65535), 33);
  assert.equal(resolveCatalogInput("65535", FACT_CATALOGS.moves, 65535), 65535);
  assert.equal(resolveCatalogInput("65536", FACT_CATALOGS.moves, 65535), null);
  assert.equal(resolveCatalogInput("-1", FACT_CATALOGS.moves, 65535), null);
  assert.equal(catalogName("33", FACT_CATALOGS.moves), "Tackle");
  assert.equal(catalogName("65535", FACT_CATALOGS.moves), "65535");
  assert.equal(catalogName(undefined, FACT_CATALOGS.moves), "");
});

test("typing controls render searchable names and a separate read-only grey ID box from saved facts", () => {
  const html = renderToStaticMarkup(
    createElement(NamedIdInput, {
      label: "Move 1",
      value: "33",
      entries: FACT_CATALOGS.moves,
      max: 65535,
      onChange: () => {},
    }),
  );
  assert.match(html, /list="[^"]+-options"/);
  assert.match(html, /value="Tackle"/);
  assert.match(
    html,
    /class="catalog-id" aria-label="Move 1 ID"[^>]*readOnly=""[^>]*value="33"/,
  );
  assert.match(html, /value="No move \(empty slot\)"/);
});
