import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LegacyWorkspace from "../src/LegacyWorkspace";
import { useCurtainLab } from "../src/hooks/useCurtainLab";
function ClassicHarness() {
  return createElement(LegacyWorkspace, { lab: useCurtainLab() });
}

test("guided investigation shares the existing editor and advanced recovery without implicit fresh-catch facts", () => {
  const html = renderToStaticMarkup(createElement(ClassicHarness));
  const main = html.slice(
    html.indexOf('id="panel-1"'),
    html.indexOf('id="panel-2"'),
  );
  assert.match(html, /id="tab-0" aria-selected="true"/);
  assert.match(main, /width="640" height="520"/);
  assert.match(main, /Pixel inspector/);
  assert.match(main, /class="setup-instructions"/);
  assert.match(main, /English Emerald only/);
  assert.match(main, /Box 8, slot 5/);
  assert.match(main, /keep slots 4 and 6 empty/);
  assert.ok(
    main.indexOf('class="setup-instructions"') <
      main.indexOf('class="input-panel"'),
  );
  assert.doesNotMatch(
    main,
    /Use completed drawing|Feebas Tile Calculator|mucksw/,
  );
  assert.match(html, /Only English Emerald is independently validated here/);
  assert.match(html, /Load DOTS Seedot example/);
  assert.match(html, /Load Skarmory example/);
  assert.ok(html.includes("Load Latios (illegal test record) example"));
  assert.match(html, /Restore previous workspace/);
  assert.match(main, /Finish drawing/);
  assert.doesNotMatch(main, /advanced-brushes|class="paint-tools"/);
  assert.match(main, /Click a black pixel again to erase it/);
  assert.match(main, /Known Pokémon information/);
  assert.doesNotMatch(
    main,
    /PID possibilities|Guaranteed reconstruction|Both windows|LIVE ANALYSIS/,
  );
  assert.match(html, /id="panel-1"[^>]*hidden=""/);
  assert.match(html, /id="panel-2"[^>]*hidden=""/);
  const about = html.slice(html.indexOf('id="panel-3"'));
  assert.ok(
    about.indexOf('id="research-title"') <
      about.indexOf("Using the classic workspace"),
  );
  assert.match(about, /From black curtains to hidden Pokémon data/);
  assert.match(about, /id="research-sid-rng"/);
  assert.match(about, /bulbapedia.bulbagarden.net/);
  assert.match(about, /Glitch City researchers/);
  const references = about.slice(about.indexOf('class="research-references"'));
  for (const credit of [
    "maractite",
    "Lincoln",
    "HappyLappy",
    "Shao",
    "mucksw",
    "Goppier",
    "yuhasem",
  ])
    assert.ok(references.includes(credit));
  assert.ok(
    references.includes(
      'href="https://www.pokemonrng.com/emerald-sid-feebas/"',
    ),
  );
  assert.equal(
    (
      about.match(
        /<h4>Dewford phrases can add another independent observation<\/h4>/g,
      ) ?? []
    ).length,
    1,
  );
  assert.equal((html.match(/<canvas/g) ?? []).length, 1);
  assert.match(main, /aria-label="Pokémon gender" disabled=""/);
  assert.match(main, /Ability<select disabled=""/);
  assert.match(main, /aria-label="Original trainer name"/);
  assert.match(main, /aria-label="Original trainer gender"/);
  const trainerGender = main.slice(
    main.indexOf('aria-label="Original trainer gender"'),
  );
  assert.match(trainerGender, /value="male">Male/);
  assert.match(trainerGender, /value="female">Female/);
  const setup = main.slice(0, main.indexOf('class="input-panel"'));
  assert.ok(
    setup.indexOf("add the information you know") <
      setup.indexOf("Finish drawing"),
  );
  assert.match(main, /EVs, IVs &amp; contest stats/);
  assert.match(main, /aria-label="HP IV"[^>]*value=""/);
  assert.match(main, /aria-label="HP EV"[^>]*value=""/);
  assert.match(main, /aria-label="Cool condition"[^>]*value=""/);
  assert.doesNotMatch(main, /17 default assumptions active/);
  assert.match(main, /Use newly caught defaults/);
  assert.match(main, /aria-label="Current EXP"/);
  assert.match(main, /aria-label="Current level"/);
  assert.match(main, /aria-label="Summary maximum HP"/);
  const reconstruction = html.slice(
    html.indexOf('id="panel-2"'),
    html.indexOf('id="panel-3"'),
  );
  assert.match(reconstruction, /Data reconstruction/);
  assert.doesNotMatch(
    reconstruction,
    /Guaranteed reconstruction|exact zeros|unobserved|class="stats"|Test a hypothesis/,
  );
  assert.ok(
    reconstruction.indexOf('aria-label="Encrypted byte constraints"') <
      reconstruction.indexOf('id="hypothesis-title"'),
  );
  assert.match(reconstruction, /list="possible-pids"/);
  assert.match(reconstruction, /Fixed PID digits/);
  assert.match(reconstruction, /More than 100 PIDs remain/);
  assert.match(reconstruction, /Stats only/);
  assert.match(reconstruction, /Curtain \+ known facts/);
  assert.match(html, /Emerald Curtain Investigator/);
  assert.match(html, /Which Pokémon do you have in Box 8, slot 5/);
  assert.match(html, /How did you obtain this Pokémon/);
  assert.match(html, /Save investigation/);
  assert.match(html, /Best items to try next/);
  assert.doesNotMatch(html, /Items I own|useful owned items/);
  assert.match(html, /Saving on this device/);
  assert.match(html, /Auto pixels/);
  assert.match(html, /known facts already constrain calculations/i);
});
