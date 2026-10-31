import { MAPPING } from "../core/tiles";
import { GuideImage } from "./StarterGuideParts";
import {
  NibbleExample,
  RecordDiagram,
  SidIntersectionDiagram,
  XorExample,
} from "./ResearchDiagrams";

const PRET = `https://github.com/pret/pokeemerald/blob/${MAPPING.commit}/`;
const REPO =
  "https://github.com/MankeyMite/EmeraldCurtainCalculator/blob/main/";
const HISTORY =
  "https://nintyconservation.github.io/glitchcity.wiki/glitchcity.wiki/Black_curtains_glitch.html";
function Source({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  return (
    <a href={PRET + path} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
function Research({
  path,
  children,
}: {
  path: string;
  children: React.ReactNode;
}) {
  const directory = path === "tests" || path === "research/fixtures";
  return (
    <a
      href={(directory ? REPO.replace("/blob/", "/tree/") : REPO) + path}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  );
}
const chapters = [
  ["origins", "From glitch to data recovery"],
  ["overflow", "Why Pokémon become graphics"],
  ["pixels", "Reading zero and nonzero pixels"],
  ["record", "Inside the 80-byte record"],
  ["xor", "The repeating XOR key"],
  ["plaintext", "Known plaintext and fresh catches"],
  ["wild-rng", "Finding PID and IVs with wild RNG"],
  ["sid-rng", "The new-game SID RNG connection"],
  ["shared-sid", "Several Pokémon, one trainer"],
  ["experiments", "Experiments that separate candidates"],
  ["reconstruction", "When all 80 bytes become exact"],
  ["applications", "Applications and limits"],
  ["evidence", "Evidence, open questions and credits"],
];

export function ResearchArticle() {
  return (
    <article className="research-article" aria-labelledby="research-title">
      <header className="research-masthead">
        <p className="research-eyebrow">
          Technical research · English Pokémon Emerald
        </p>
        <h2 id="research-title">From black curtains to hidden Pokémon data</h2>
        <p className="research-deck">
          A graphical overread becomes a constraint system: combine pixels,
          known Pokémon information and two distinct RNG histories to
          investigate PID, IVs and Secret ID.
        </p>
        <p className="research-meta">
          Source audit: 19 October 2026 · pret revision{" "}
          <code>{MAPPING.commit.slice(0, 8)}</code>
        </p>
      </header>
      <aside className="research-callout">
        <strong>A new game, a known SID, then a shiny starter.</strong>
        <p>
          The optional New Game SID Finder guide brings the RNG searches, route
          planning and curtain experiments together. Your starter’s own PID and
          IVs help decide which items, moves and EVs are useful on the way to
          Rustboro. Once the SID is found, return to your protected save to
          target a shiny starter.
        </p>
        <a href="#research-starter-guide">How the guided workflow works ↓</a>
      </aside>
      <details className="research-contents" open>
        <summary>In this article</summary>
        <p>
          <a href="#research-starter-guide">
            New Game SID Finder → Shiny Starter
          </a>
        </p>
        <ol>
          {chapters.map(([id, name]) => (
            <li key={id}>
              <a href={`#research-${id}`}>{name}</a>
            </li>
          ))}
        </ol>
      </details>

      <section id="research-starter-guide">
        <p className="research-eyebrow">Optional beginner guide</p>
        <h3>New Game SID Finder → Shiny Starter</h3>
        <p>
          Start with a new English Emerald game and an unknown Secret ID. The
          six-step guide takes you from timed trainer-ID generation to a
          starter-specific Rustboro checklist, then helps read the SID from the
          school’s curtains. Finally, it uses that SID to find shiny starter
          targets. Each screen asks only for the information needed next; the
          existing advanced investigator remains available.
        </p>

        <h4>Two RNG histories, one investigation</h4>
        <p>
          First, an audible two-stage timer marks when to confirm your trainer
          name and advance Birch’s final message. Your public TID seeds the
          new-game RNG sequence, so entering it gives a bounded list of possible
          SIDs. The guide starts with ±60 RNG calls around its estimated target,
          including an adjustable dialogue-delay estimate. Timing remains a
          hypothesis: a countdown cannot guarantee the game’s actual RNG
          advance.
        </p>
        <p>
          Next, save before Birch’s bag and keep that save untouched. A second
          timer helps reproduce the starter selection after an in-game soft
          reset. Species, nature, gender, ability and all six summary stats are
          checked against Method 1 PID/IV spreads in the selected advance
          window. The first Zigzagoon’s Speed EV is already included. The guide
          asks beginners to retry if more than one spread matches; one matching
          spread supplies the working PID and exact generated IVs, conditional
          on that search window and the entered information.
        </p>

        <h4>A route built around your starter’s data</h4>
        <p>
          Two starters of the same species can need different setups. The PID
          determines the encryption key’s relationship to SID and the order of
          the Pokémon’s four data blocks. The IVs supply known values in the
          encrypted record. Together with the remaining SIDs, these tell the
          planner which changes could actually separate candidates.
        </p>
        <ul>
          <li>
            <strong>IVs become useful curtain tests.</strong> The tool packs the
            generated IVs into their stored data, finds the relevant plaintext
            digits and maps their pixels through the PID’s data permutation. No
            manual hexadecimal conversion is needed.
          </li>
          <li>
            <strong>Battles and EVs shape the plan.</strong> The route includes
            the modeled journey battles and your starter’s different rival
            opponent. Choosing Next after following the route records its EVs.
            Extra Defense or Speed training is compared with other supported
            options, rather than recommended simply because it changes a digit.
          </li>
          <li>
            <strong>Moves and PP are part of the evidence.</strong> The planner
            compares legal arrangements of occupied move slots, useful level-up
            moves and compatible early TMs/HMs. PP follows each move, and PC
            storage restores PP for the curtain setup.
          </li>
          <li>
            <strong>Items earn their place on the checklist.</strong> The
            built-in early-game catalogue supplies obtainable pickups and
            purchases. The planner keeps a set that covers available SID
            distinctions without redundant items, groups shop purchases and
            tells you which item to hold before the first deposit. Two items
            that test the same SID digit do not automatically deserve two
            collection trips.
          </li>
        </ul>
        <p>
          The goal is to distinguish surviving SIDs, not collect the largest
          list of different hex digits. Candidate separation and practical
          action costs rank the supported setups. This produces a tailored plan,
          not a guarantee of the shortest possible route or of finding SID from
          one drawing.
        </p>
        <p>
          Enter your TID to preview the first shiny starter advance for the
          estimated SID timing and nine timings on either side. The dry-battery
          choice allows more time for the warning screen: practical minimums are
          900 advances with a dry battery and 650 without. Green, yellow and red
          rows show shorter or longer waits; these SIDs remain estimates. Choose
          Reset TID to repeat the unchanged intro timer, or Keep TID to search
          for an optimal starter PID. A progress bar tracks the comparison of
          all three starters at advances 1000–3000. The guide favours a precise
          target and its closest neighbours with lower EV training requirements,
          then drawing-only recovery. It selects the starter and sets the timer
          automatically. Expand the nearby PID list to see drawing-only coverage
          and which cases can be resolved using item changes and move swaps
          without EV training. Estimates prioritise nineteen nearby
          SID-generation timings while comparing against the entire SID search
          window. The full starter search also stays unchanged; precise timing
          improves your chance of landing in the recommended neighbourhood. Once
          the actual PID is identified, its matching move and held-item
          preparation becomes the route checklist. A second table shows nearby
          possible SIDs and their estimated experiment difficulty, with an
          optional starter retry when lengthy training may be needed. Timing and
          coverage remain estimates, not a guarantee of drawing-only recovery.
        </p>

        <h4>Draw the curtains, then ask only useful questions</h4>
        <div className="starter-guide-images">
          <GuideImage
            name="box-placement"
            caption="Your prepared starter goes in Box 8, slot 5."
          />
          <GuideImage
            name="trainer-school"
            caption="The school’s curtains become your SID evidence."
          />
        </div>
        <p>
          Put the starter in Box 8, slot 5 with slots 4 and 6 empty, then enter
          Rustboro Trainer’s School. Copy the visible black and transparent
          pixels into the curtain drawing. Marked boxes are pre-drawn from known
          Pokémon information, but still need checking against the game.
          Calculations wait until you choose Finish drawing, keeping painting
          responsive.
        </p>
        <p>
          A transparent pixel means its encrypted hex digit is exactly zero;
          black means it is nonzero. With known plaintext and PID, that can
          confirm or rule out a particular SID digit. The guide applies the
          whole drawing together with your Pokémon information, then suggests
          useful held-item changes, move swaps or EV experiments if several SIDs
          remain. It highlights the relevant pixels and records your Black or
          Transparent answers. The decimal SID and four hex digits update as
          evidence accumulates, with remaining possibilities shown for each
          position. Reenter the school after each in-game change.
        </p>

        <h4>Return to the original save for the shiny attempt</h4>
        <p>
          Once one SID remains under the recorded evidence and timing window,
          reset to the protected save before choosing a starter. Browse shiny
          Method 1 targets by advance, PID, nature, gender, ability and IVs.
          Selecting a target configures the two-stage timer automatically.
          Nearby predictions and an optional summary check help identify where
          an attempt landed and suggest a calibration correction. Getting close
          helps with consistency, but the exact target advance is still required
          for the chosen shiny.
        </p>
        <p>
          Guide notes, battle logs and curtain evidence are saved on this device
          between sessions; they do not save the game. Keeping the original
          pre-starter save is what lets the SID investigation and the final
          shiny attempt share the same trainer. See the{" "}
          <a href="#research-sid-rng">SID RNG source audit below</a> and the{" "}
          <Research path="research/STARTER_GUIDE.md">
            guide implementation notes
          </Research>{" "}
          for the mechanics, supported scope and assumptions.
        </p>
      </section>

      <section id="research-origins">
        <h3>1. From a graphical glitch to data recovery</h3>
        <p>
          The black curtains at Rustboro Trainer’s School have been documented
          since at least 2008. The preserved{" "}
          <a href={HISTORY} target="_blank" rel="noreferrer">
            Glitch City article
          </a>{" "}
          credits Chaos Rush with early documentation, Metarkai (also credited
          there as Metarkrai) and TheZZAZZGlitch with research into the cause,
          VaePomegGlitch with reporting it again, and ChickasaurusGL with
          demonstrations and article text. This project builds on that
          community’s work; it does not claim discovery of the glitch.
        </p>
        <p>
          The important change in perspective is to treat the pattern as
          evidence rather than decoration. The windows expose a lossy
          representation of an entire boxed Pokémon record. A pixel does not
          give a full hexadecimal digit, but it does give a mathematical
          condition. Pokémon structure, encryption and known gameplay facts
          connect those conditions across the record.
        </p>
        <p>
          Our research proceeds from source-derived graphics mapping, to
          independent emulator comparisons, to automated constraint tests, then
          to controlled gameplay observations. The pret/pokeemerald
          decompilation makes the memory and graphics behavior inspectable. The
          calculator turns that model into a deterministic search, keeping
          imported reference bytes separate from evidence supplied to the
          solver.
        </p>
        <p>
          A contributor reports a complete, original-record-verified 80-byte
          reconstruction of an Illumise under sufficiently informative known
          conditions, including its SID. The Illumise record and observation
          fixture are absent from this checkout, so we preserve it as a{" "}
          <strong>reported success, not a reproducible regression here</strong>.
          Synthetic full-record reconstruction is tested separately. Neither
          result establishes guaranteed recovery from one screenshot, and blind
          recovery of an unknown SID remains a distinct goal.
        </p>
      </section>

      <section id="research-overflow">
        <h3>2. Why Pokémon data become graphics</h3>
        <p>
          The school’s secondary graphics declaration contains{" "}
          <strong>278 tiles</strong>. The map loader requests{" "}
          <strong>512 secondary tiles</strong>, or 16,384 bytes. Each GBA 4bpp
          tile occupies 32 bytes, so the actual school payload is only 8,896
          bytes. The allocation/decompression routine uses that payload size,
          while the requested transfer extends beyond it.
        </p>
        <div className="research-flow" aria-label="Graphics overread sequence">
          <div>
            <strong>278 tiles</strong>
            <span>Decompressed school allocation</span>
          </div>
          <span aria-hidden="true">↓</span>
          <div>
            <strong>512-tile transfer</strong>
            <span>Reads past the allocation into remaining heap contents</span>
          </div>
          <span aria-hidden="true">↓</span>
          <div>
            <strong>VRAM tiles 791–793</strong>
            <span>96 bytes interpreted as 4bpp pixels</span>
          </div>
        </div>
        <p>
          See{" "}
          <Source path="src/data/tilesets/graphics.h">
            the school graphics declaration
          </Source>
          ,{" "}
          <Source path="src/fieldmap.c">
            CopyMapTilesetsToVram and the tileset copy routines
          </Source>
          , and{" "}
          <Source path="src/menu.c">
            malloc_and_decompress / DecompressAndLoadBgGfxUsingHeap
          </Source>
          . The school payload occupies tile IDs 512–789; the curtain tiles lie
          beyond it.
        </p>
        <p>
          Temporary copies of Pokémon storage can remain in this memory.{" "}
          <Source path="src/load_save.c">MoveSaveBlocks_ResetHeap</Source>{" "}
          copies save blocks and storage into the heap before resetting the
          allocator. The captured school upload reads this heap region, rather
          than directly reading a permanent live-storage address. Allocation
          history and refresh behavior therefore matter: put the Pokémon in
          place, leave the school and reenter before recording a new
          observation.
        </p>
        <table>
          <caption>
            Verified English Emerald mapping · one-based PC positions
          </caption>
          <thead>
            <tr>
              <th>PC location</th>
              <th>Exposed record bytes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Box 8, slot 4</td>
              <td>Final 8 bytes: 0x48–0x4F</td>
            </tr>
            <tr>
              <td>Box 8, slot 5</td>
              <td>All 80 bytes: 0x00–0x4F</td>
            </tr>
            <tr>
              <td>Box 8, slot 6</td>
              <td>First 8 bytes: 0x00–0x07</td>
            </tr>
          </tbody>
        </table>
        <p>
          These 96 bytes fill tiles 791–793. Map placements repeat each tile
          four times across the two windows, with horizontal mirroring on the
          opposite edges. The repeated appearances are the <em>same</em>{" "}
          evidence, not four independent readings. The main-record portion is
          one 8 × 20 strip, which is why the compact workspace needs only one
          side of one window.
        </p>
        <details>
          <summary>What the emulator captures establish</summary>
          <p>
            The retained DOTS and Latios English Emerald mGBA captures each
            match 96/96 assembled VRAM bytes and 768/768 displayed pixel
            appearances. All 192 distinct nibbles of the 96-byte region occur in
            the static layout. Sprites, menus and camera clipping can still
            obscure them in gameplay. Latios is a contributor-reported illegal
            test record: its capture validates rendering, not encounter
            legitimacy.
          </p>
          <p>
            A DOTS breakpoint trace records upload source 0x02006CB0 and
            transfer size 0x4000; the relevant 96 bytes begin at 0x02008F90.
            Live storage was relocated differently in the two captures. This
            supports the slot mapping in those configurations without asserting
            a universal fixed RAM address or tracing every preceding allocation.
          </p>
          <p>
            <Research path="research/RESEARCH.md">
              Mapping, provenance and byte formula
            </Research>{" "}
            ·{" "}
            <Research path="research/fixtures/emulator-ss8/evidence.json">
              DOTS capture evidence
            </Research>{" "}
            ·{" "}
            <Research path="research/fixtures/emulator-ss8/upload-trace.txt">
              Upload trace
            </Research>{" "}
            ·{" "}
            <Research path="research/fixtures/emulator-latios-ss9/evidence.json">
              Latios capture evidence
            </Research>{" "}
            ·{" "}
            <Research path="tests/capture.test.ts">
              Capture regressions
            </Research>
          </p>
        </details>
        <p>
          Only English Emerald is independently validated here. Historical
          research reports a different Japanese storage position (Box 7, slots
          26–28). Other languages require separate checks of storage alignment,
          graphics, palette, mirroring and runtime behavior; changing the box
          number alone is not established as sufficient.
        </p>
      </section>

      <section id="research-pixels">
        <h3>3. Black means nonzero; transparent means zero</h3>
        <p>
          An 80-byte record contains 160 four-bit values, called nibbles. In the
          verified school palette, index 0 is transparent and all 15 nonzero
          indices appear black. The underlying window artwork shows through a
          transparent pixel; “transparent” does not mean a white painted square.
        </p>
        <table>
          <thead>
            <tr>
              <th>Observation</th>
              <th>Allowed hexadecimal nibble</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Transparent</td>
              <td>
                <code>0</code> only
              </td>
            </tr>
            <tr>
              <td>Black</td>
              <td>
                <code>1, 2, …, F</code>
              </td>
            </tr>
            <tr>
              <td>Unknown / obscured</td>
              <td>
                <code>0, 1, …, F</code>
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          A black pixel does not distinguish 1 from F. Treating black as F would
          invent information. Blank drawing cells look transparent but stay
          unrecorded until Finish drawing confirms the whole visible pattern,
          including unchanged automatic pixels. Experiment questions record only
          the highlighted answers you verify.
        </p>
        <NibbleExample />
        <p>
          In raw GBA order, <code>0xA0 → transparent, black</code>: the low
          nibble 0 appears first. Bytes advance left to right, four per row,
          with rows running downward. Conventional hexadecimal still writes A
          before 0. The calculator resolves tile flips and uses a canonical
          nibble address to link the drawing and hex display in both directions.
        </p>
        <details>
          <summary>Byte-to-pixel addressing</summary>
          <pre>{`regionByte = (tileID - 791) × 32 + sy × 4 + floor(sx / 2)
side = sx % 2                 // 0: low; 1: high
nibble = (byte >> (side × 4)) & 15
main record byte = regionByte - 8`}</pre>
          <p>
            First undo any map horizontal flip to obtain source coordinates sx
            and sy. The last formula applies only to region bytes 8–87, the
            middle 80-byte record. For its unmirrored 8 × 20 strip, byte b has
            low nibble at row floor(b/4), column 2(b mod 4), using zero-based
            coordinates. The high nibble is the next column.
          </p>
        </details>
      </section>

      <section id="research-record">
        <h3>4. Inside a Generation 3 boxed Pokémon</h3>
        <p>
          The <Source path="include/pokemon.h">BoxPokemon structure</Source> is
          80 bytes. Its first 32 bytes are unencrypted. Only the following 48
          bytes are XOR encrypted; calling the whole file an “encrypted record”
          is shorthand for that storage format. A party record adds 20 bytes and
          must be converted before using the 80-byte importer.
        </p>
        <table>
          <thead>
            <tr>
              <th>Offset</th>
              <th>Contents</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>00–03</code>
              </td>
              <td>PID / personality, little-endian</td>
            </tr>
            <tr>
              <td>
                <code>04–07</code>
              </td>
              <td>OTID: public TID at 04–05, SID at 06–07</td>
            </tr>
            <tr>
              <td>
                <code>08–1F</code>
              </td>
              <td>
                Nickname, language, flags, OT name, markings, checksum and
                reserved header word
              </td>
            </tr>
            <tr>
              <td>
                <code>20–4F</code>
              </td>
              <td>Four encrypted 12-byte substructures</td>
            </tr>
          </tbody>
        </table>
        <p>
          The logical blocks are <strong>Growth</strong> (species, held item,
          EXP, PP Ups, friendship and filler), <strong>Attacks</strong> (four
          moves and current PP), <strong>EVs / Contest</strong> (six EVs, five
          conditions and Sheen), and <strong>Miscellaneous</strong> (Pokérus,
          met location, origins, IVs, Egg/ability bits and ribbons).
        </p>
        <p>
          <code>PID % 24</code> selects one of the 24 block permutations. A byte
          at physical offset 0x20 need not be Growth. All blocks are 12 bytes, a
          multiple of the four-byte key, so each block starts on key byte 0
          regardless of its position.
        </p>
        <RecordDiagram />
        <p>
          The header reserved word at 0x1E–0x1F and Growth filler at logical
          offsets 0x0A–0x0B are internal storage fields, not summary-screen
          stats. Do not assume their values just to finish an export. Nickname
          and OT name bytes use the game’s character encoding; visible text
          alone does not necessarily determine all trailing bytes.
        </p>
      </section>

      <section id="research-xor">
        <h3>5. One four-byte key, repeated twelve times</h3>
        <div className="research-equation">
          <code>OTID = (SID &lt;&lt; 16) | TID</code>
          <code>KEY = PID XOR OTID</code>
          <code>Ciphertext = Plaintext XOR KEY</code>
        </div>
        <p>
          The encryption routines in{" "}
          <Source path="src/pokemon.c">pokemon.c</Source> XOR each of twelve
          32-bit payload words with the same key. XOR is reversible:{" "}
          <code>C XOR K = P</code>. At each individual nibble,{" "}
          <code>C = P XOR K</code>. Most usefully, <code>A XOR A = 0</code>.
        </p>
        <div
          className="research-identity-map"
          aria-label="How public and secret IDs determine the key"
        >
          <div>
            <strong>PID upper 16 XOR SID</strong>
            <span>Upper 16 key bits</span>
          </div>
          <div>
            <strong>PID lower 16 XOR TID</strong>
            <span>Lower 16 key bits</span>
          </div>
        </div>
        <p>
          With known plaintext P, a transparent pixel requires{" "}
          <strong>K = P</strong>. A black pixel requires <strong>K ≠ P</strong>.
          Both are useful. A zero plaintext digit is convenient, but known
          nonzero digits work just as well.
        </p>
        <XorExample />
        <figure className="research-figure">
          <p>
            <strong>Example key:</strong> conventional word{" "}
            <code>0x12345678</code>
          </p>
          <div
            className="research-key-repeat"
            aria-label="Little-endian key bytes repeat three times in each block"
          >
            {Array.from({ length: 3 }, (_, r) => (
              <span key={r}>
                {["78", "56", "34", "12"].map((b, i) => (
                  <code key={i} className={`key-byte-${i}`}>
                    {b}
                  </code>
                ))}
              </span>
            ))}
          </div>
          <figcaption>
            Little-endian byte order: 78 56 34 12. Three repetitions fill one
            12-byte block; four blocks give twelve repetitions across 48 bytes.
          </figcaption>
        </figure>
        <p>
          This is like Sudoku: a known value eliminates choices elsewhere. One
          transparent known-plaintext pixel can fix a key digit reused
          throughout several fields. Black pixels at those same key alignments
          exclude additional digits. The solver combines these constraints
          rather than treating each black pixel as an unrelated guess.
        </p>
      </section>

      <section id="research-plaintext">
        <h3>6. Why a fresh catch is a useful starting point</h3>
        <p>
          Known plaintext means information about the decrypted data established
          without guessing its encrypted digits. A fresh, untouched catch gives
          several useful starting values. These must be recorded accurately, and
          defaults must be reviewed.
        </p>
        <ul>
          <li>
            <strong>Visible or recorded facts:</strong> species, held item,
            exact EXP, moves, current PP, public original-trainer TID, met
            location, level and ball.
          </li>
          <li>
            <strong>Conditional defaults:</strong> zero EVs and contest
            condition, no PP Ups, species base friendship and full PP after an
            appropriate heal. A wild catch may hold an item; battle PP use,
            friendship changes, traded origins and unusual encounters need
            attention.
          </li>
          <li>
            <strong>Derived information:</strong> nature and gender constrain
            PID; supported encounter RNG can supply correlated PID/IV spreads.
            Nature is PID modulo 25. Ability selection is a stored bit; the
            generic stored-data solver does not universally equate it to PID
            parity.
          </li>
        </ul>
        <p>
          If all six EVs and all six condition/Sheen bytes really are zero, the
          whole 12-byte EV/Contest block is zero plaintext. Its ciphertext is
          then exactly three byte repetitions of the key. The curtain still
          reveals only which key nibbles are zero or nonzero: it does{" "}
          <em>not</em> directly show all key digits.
        </p>
        <p>
          Once PID and public TID are known, the lower 16 key bits are already
          fixed. SID controls the upper half, together with the upper PID half.
          A transparent zero-plaintext nibble fixes the corresponding key digit
          to zero; in an upper key nibble this implies that SID digit equals the
          corresponding PID digit. Black excludes that equality. Nonzero
          plaintext and controlled changes test other possible digits.
        </p>
        <p>
          The optional fresh-catch checkbox supplies assumptions, not evidence
          observed by the calculator. Reserved words, random IVs and PID remain
          unknown. Exact conclusions using a default remain conditional on it.
          See{" "}
          <Research path="research/OT_INFORMATION.md">
            original-trainer facts
          </Research>{" "}
          and{" "}
          <Research path="research/TRAIT_STATS_CONSTRAINTS.md">
            trait constraints
          </Research>
          .
        </p>
      </section>

      <section id="research-wild-rng">
        <h3>7. Recovering PID and IVs without first knowing SID</h3>
        <p>
          Stock Emerald initializes its main RNG state to zero after a normal
          reset; the intended RTC seeding call is disabled in the original game.
          Continuing an existing save advances that state before an encounter. A
          controlled quick catch can therefore be searched over a bounded
          sequence, without supplying SID or choosing an arbitrary PID.
        </p>
        <pre>{`seed = (seed × 0x41C64E6D + 0x6073) mod 2^32
Random() returns seed >>> 16
// JavaScript unsigned implementation:
seed = (Math.imul(seed, 0x41C64E6D) + 0x6073) >>> 0;`}</pre>
        <p>
          See <Source path="src/random.c">Random / SeedRng</Source>,{" "}
          <Source path="include/random.h">the LCRNG constants</Source>, and{" "}
          <Source path="src/main.c">
            reset initialization and the disabled RTC seed
          </Source>
          . The search window counts RNG calls, not just elapsed frames.
        </p>
        <ol>
          <li>Save near a supported encounter area, then soft-reset.</li>
          <li>
            Encounter and catch a Pokémon promptly; note the area and lead
            ability at capture.
          </li>
          <li>
            Record species, capture level, nature, gender, ability, exact EXP
            and summary stats. Use maximum HP.
          </li>
          <li>
            Select Wild encounter, seed 0 and a generous minimum/maximum advance
            window. Search matching spreads.
          </li>
          <li>
            Combine matching PID/IV tuples with the curtain evidence and
            original-trainer TID; widen the window when needed.
          </li>
        </ol>
        <p>
          Emerald wild generation first consumes encounter and lead rolls,
          selects a nature, then rerolls PID pairs until its nature and any
          applicable gender condition match. IV calls follow. H1, H2 and H4
          differ in skipped calls around IV generation. The implementation
          follows these sequences and keeps PID/IV correlations; it does not mix
          the best-looking IV from unrelated spreads.
        </p>
        <details>
          <summary>Implemented encounter scope and validation</summary>
          <p>
            The separate Static option groups fixed encounters, starters and
            ordinary gifts. It searches Method 1 or Method 4 with the same seed
            and advance controls, without wild encounter-area or lead rolls.
            Special gifts, events, trades, roamers and breeding need other
            models.
          </p>
          <p>
            Supported tables include ordinary grass/cave, surfing, rods and Rock
            Smash. Supported lead models are no generation effect, Synchronize,
            Cute Charm and Pressure/Hustle/Vital Spirit. Safari/Pokéblocks,
            special Feebas fishing, Static/Magnet Pull, Intimidate/Keen Eye
            extra-call behavior, roamers, gifts, breeding and other special
            generators are outside this search. Use the species at capture;
            evolution backtracking is not implemented.
          </p>
          <p>
            Advance 0 denotes the state before the encounter-slot call, or
            before the preceding rate check for Rock Smash. Both bounds are
            inclusive. Independent BigInt arithmetic checks the LCRNG, and
            numeric PokéFinder vectors check H1, H2/Synchronize and H4/Cute
            Charm. Source references:{" "}
            <Source path="src/wild_encounter.c">wild_encounter.c</Source>,{" "}
            <Source path="src/pokemon.c">Pokémon creation</Source>,{" "}
            <Research path="research/WILD_RNG.md">
              implementation scope
            </Research>{" "}
            and <Research path="tests/rng.test.ts">RNG tests</Research>. No
            PokéFinder implementation code is bundled.
          </p>
        </details>
        <aside className="research-callout">
          <strong>A reproducible, conditional result</strong>
          <p>
            The reviewed Poochyena fixture, seed 0 and advances 0–99,999, leaves
            one PID/IV spread: <code>PID 0x8E251F50</code>, H2 at advance 603.
            IVs in HP/Atk/Def/Speed/SpA/SpD order are{" "}
            <code>2 / 1 / 30 / 4 / 22 / 13</code>. PID and IVs were withheld
            from search inputs. The review corrects the origin game and leaves
            two disputed pixels unknown. A larger window admits another spread,
            so uniqueness is conditional.{" "}
            <Research path="research/POOCHYENA_CASE.md">
              Read the case and corrections
            </Research>
            .
          </p>
        </aside>
        <p>
          Summary stats alone often leave IV ranges, especially at low levels.
          The stand-alone IV calculator’s unresolved ranges are not jointly
          searched by the generic stored-data solver; explicitly applied exact
          IVs are. The wild search separately checks generated spreads against
          summary observations. A narrow window can sometimes yield a unique
          spread, but this is not guaranteed. A recovered PID fixes the block
          order and simplifies SID analysis immediately.
        </p>
      </section>

      <section id="research-sid-rng" className="research-feature-section">
        <p className="research-eyebrow">New connection in this investigation</p>
        <h3>8. The visible TID also leads to a SID RNG search</h3>
        <p>
          SID is not an unrelated random number. Emerald’s new-game
          initialization ties it to the visible public TID through a
          deterministic sequence. This is newly useful to our curtain
          investigation; it is not a claim to have first discovered trainer-ID
          RNG in the wider Pokémon community.
        </p>
        <div
          className="research-flow"
          aria-label="New-game trainer ID generation"
        >
          <div>
            <strong>Player naming screen finishes</strong>
            <span>MainState_Exit calls SeedRngAndSetTrainerId</span>
          </div>
          <span aria-hidden="true">↓</span>
          <div>
            <strong>16-bit hardware timer → TID and RNG seed</strong>
            <span>The same timer value is retained as the public ID</span>
          </div>
          <span aria-hidden="true">↓</span>
          <div>
            <strong>Remaining Birch introduction / transitions</strong>
            <span>VBlank and other calls advance the main RNG</span>
          </div>
          <span aria-hidden="true">↓</span>
          <div>
            <strong>InitPlayerTrainerId</strong>
            <span>A later Random output supplies SID</span>
          </div>
        </div>
        <p>
          <Source path="src/naming_screen.c#L696">MainState_Exit</Source> takes
          this branch only for player naming, after the fade completes.{" "}
          <Source path="src/main.c#L208">SeedRngAndSetTrainerId</Source> reads
          timer 1, calls SeedRng with its 16-bit value, stops the timer and
          retains that value. Then{" "}
          <Source path="src/new_game.c#L84">InitPlayerTrainerId</Source>{" "}
          performs:
        </p>
        <pre>{`trainerId = (Random() << 16) | GetGeneratedTrainerIdLower();
// Enumerate possible later outputs:
seed = TID;
seed = (Math.imul(seed, 0x41C64E6D) + 0x6073) >>> 0;
possibleSID = seed >>> 16;   // output at this call`}</pre>
        <p>
          Random already returns the upper half of the updated 32-bit state.
          That 16-bit result is shifted into the stored trainer ID’s upper half;
          the retained TID supplies its lower half. Thus the visible TID
          reconstructs the initial seed of this particular sequence.
        </p>
        <h4>Timing is a search hypothesis</h4>
        <p>
          The useful interval starts at the final exit from the player naming
          screen and ends when SID is generated in NewGameInitData, before later
          map/truck setup. Entering the visible game world is a later
          checkpoint. Repeating player naming reseeds the sequence; Pokémon
          nicknaming does not.
        </p>
        <p>
          The contributor reports about 11 seconds between their quick
          introduction checkpoints. That is roughly 660 frames at 60 fps,{" "}
          <strong>not a verified call index</strong>. VBlank consumes the same
          RNG and other routines may consume more calls. There is no
          instrumented timing capture for this report in the retained fixtures.
        </p>
        <p>
          The optional filter defaults to calls <strong>1–3,600</strong>,
          presented as a generous approximate 60-second window. You can enter
          custom inclusive limits, including example upper bounds of 900, 1,800
          or 3,600. Distinct SID count is calculated from actual outputs:
          repeated outputs count once, and all their generating advances are
          retained. A genuine SID can fall outside a chosen window.
        </p>
        <details>
          <summary>Reseeding and the inspected source path</summary>
          <p>
            The inspected ordinary post-naming path goes through{" "}
            <Source path="src/main_menu.c#L1762">
              the Birch speech callback
            </Source>
            , <Source path="src/overworld.c#L1532">CB2_NewGame</Source> and{" "}
            <Source path="src/new_game.c">NewGameInitData</Source>. No main-RNG
            reseed was found between the final player-naming seed and trainer-ID
            generation in that path. The RTC seed is BUGFIX-guarded in stock
            Emerald and would precede naming anyway. Random2 has separate state.
            Modified ROMs and trainer IDs generated in another game are outside
            this model.
          </p>
          <p>
            <Source path="src/main.c#L343">VBlankIntr</Source> advances the main
            RNG during ordinary frames. Enumerating every call in a generous
            range avoids needing to assign each intervening call to a particular
            animation. Calls after SID creation cannot change the SID already
            stored. See the full{" "}
            <Research path="research/SID_RNG.md">
              source-sequence audit and limitations
            </Research>
            .
          </p>
        </details>
        <table className="research-rng-comparison">
          <caption>Two different RNG histories</caption>
          <thead>
            <tr>
              <th></th>
              <th>New-game SID filter</th>
              <th>Later wild PID/IV search</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Seed</th>
              <td>Public TID, set at player-naming exit</td>
              <td>Usually 0 after resetting an existing save</td>
            </tr>
            <tr>
              <th>Target</th>
              <td>Later Random output that became SID</td>
              <td>Encounter, PID rerolls and IV generation</td>
            </tr>
            <tr>
              <th>Time reference</th>
              <td>Final naming exit → SID initialization</td>
              <td>Reset → encounter-generation state</td>
            </tr>
            <tr>
              <th>Shared limitation</th>
              <td colSpan={2}>
                Elapsed seconds approximate neither exact call count nor a
                guaranteed bound
              </td>
            </tr>
          </tbody>
        </table>
        <h4>Intersect evidence, not candidate counts</h4>
        <div className="research-equation">
          <code>
            Final SIDs = Curtain-compatible SIDs ∩ New-game RNG-compatible SIDs
          </code>
        </div>
        <SidIntersectionDiagram />
        <p>
          With PID known, each generated SID is tested against exact
          known-plaintext, header, pixel and checksum constraints for all
          recorded snapshots. With PID unknown, compatibility is preserved
          across possible PIDs. A PID witness demonstrates possibility; it never
          becomes an entered fact. If a bounded search cannot resolve a
          candidate, the UI retains and labels it unresolved.
        </p>
        <p>
          For an actual repository example, public TID <strong>40492</strong>{" "}
          produces <strong>3,506 distinct SIDs</strong> in calls 1–3,600. In the
          reviewed Poochyena case with its reference PID supplied for this
          separate validation,{" "}
          <strong>4,394 curtain-compatible SIDs intersect to 237</strong>. The
          true SID 37399 appears at call 1,736. With PID/IVs withheld, combining
          the 0–99,999 wild search and SID window reduces 144 joint hypotheses
          to 9. Those nine share one PID/IV spread but have different SIDs.
          These are measured fixture results, not an independence estimate or a
          promised reduction for another catch.
        </p>
        <p>
          The filter is optional and reversible in both SID Finder and Data
          Recovery. Surviving rows show SIDs, their advances and Validate. No
          survivors means timing, facts or pixels may be wrong; widen or disable
          the filter and recheck the evidence. The tool never estimates the
          intersection by multiplying counts.
        </p>
        <h4>Dewford phrases can add another independent observation</h4>
        <p>
          Earlier community research by{" "}
          <a
            href="https://www.reddit.com/r/pokemonrng/comments/16ei2ej/"
            target="_blank"
            rel="noreferrer"
          >
            maractite
          </a>{" "}
          connects the five initially generated Dewford phrases with SID. The
          optional Dewford panel in SID Finder and Data Recovery now implements
          this source model: enter an unchanged original phrase, then test
          suggested phrases from a baseline save that predates any successful
          phrase change or record mixing.
        </p>
        <p>
          Under those first-submission conditions, a phrase already among the
          five is rejected; a new phrase is accepted. Reset without saving after
          every test. Later submissions use trendiness scoring and cannot be
          interpreted in the same way. The calculator ranks actual
          accepted/rejected SID survivor sets, keeps pending tests separate, and
          intersects recorded answers with curtain evidence.
        </p>
        <p>
          The published retail example, TID 63171 and TOGETHER · MOVIE, leaves
          seven SIDs in our tested window; its accepted WEIRD · MONEY and
          rejected APPROVED · FLOWERS narrow that to the reported SID 55567.
          This reproduces published data, not a new gameplay capture. The
          default three-call initialization gap is community calibration; VBlank
          interruptions can invalidate it. The feature is labeled experimental
          here, with editable gap bounds and reversible disabling.{" "}
          <Research path="research/DEWFORD_SID.md">
            Full protocol, timing conventions and validation
          </Research>
          .
        </p>
        <h4>What counts as validation?</h4>
        <p>
          Test a candidate against a different Pokémon with the same original
          trainer identity and independently recorded facts and curtain pixels.
          A predicted transparent pixel is particularly discriminating because
          it requires exact ciphertext zero. Avoid painting the tool’s
          predictions as observations without checking the game.
        </p>
        <p>
          A save-file reader such as{" "}
          <a
            href="https://github.com/kwsch/PKHeX"
            target="_blank"
            rel="noreferrer"
          >
            PKHeX
          </a>{" "}
          can provide an independent research check, but it is not required by
          the intended public workflow. A single candidate surviving the
          assumptions that generated it is conditional uniqueness, not
          independent verification of trainer identity.{" "}
          <Research path="tests/sid-rng.test.ts">SID RNG tests</Research> cover
          duplicates, inclusive bounds, exact intersections, unknown-PID
          handling and exclusion of the genuine SID outside the range.
        </p>
      </section>

      <section id="research-shared-sid">
        <h3>9. Several Pokémon can constrain one trainer’s SID</h3>
        <p>
          Pokémon caught under the same original trainer identity share OTID
          even when their PIDs, IVs, moves and block permutations differ. Public
          TID alone is not enough to establish shared identity: another trainer
          can have the same visible number. A traded Pokémon retains its own
          original trainer.
        </p>
        <pre>{`KEY_A = PID_A XOR OTID
KEY_B = PID_B XOR OTID
KEY_A XOR KEY_B = PID_A XOR PID_B`}</pre>
        <p>
          OTID cancels because a value XOR itself is zero. If a known plaintext
          nibble is zero, its ciphertext equals the corresponding key nibble; a
          transparent observation forces that key digit to zero. Each catch can
          exclude different upper-key/SID digits. Nonzero known plaintext tests
          other equalities. Zero EV/Contest blocks make fresh catches convenient
          sources of such constraints.
        </p>
        <figure className="research-figure">
          <div className="research-multi-flow">
            <div>
              <strong>Pokémon A</strong>
              <span>PID A + its facts + its curtain → SID set A</span>
            </div>
            <div>
              <strong>Pokémon B</strong>
              <span>PID B + its facts + its curtain → SID set B</span>
            </div>
            <div>
              <strong>Pokémon C</strong>
              <span>PID C + its facts + its curtain → SID set C</span>
            </div>
            <div className="shared-result">
              <strong>One shared SID</strong>
              <span>Set A ∩ Set B ∩ Set C ∩ optional TID-seeded RNG set</span>
            </div>
          </div>
          <figcaption>
            Each Pokémon retains its own PID and record model; only the trainer
            identity is shared. The Spinda SID guide carries the remaining SID
            candidates between catches.
          </figcaption>
        </figure>
        <p>
          Saved curtain observations represent changes to <em>one</em> Pokémon
          and share its PID. For successive Spinda catches, use
          <strong> Find SID with Spinda</strong> and continue to its recommended
          next encounter: it saves the remaining SID candidates and tested
          digits, then starts a fresh record for the next catch. Use catches
          from the same original trainer.
        </p>
        <p>
          Several catches may prove more efficient than repeated item changes on
          one Pokémon, but the project has not established an average number
          required, success rate or universal stopping rule. The algebra is
          established; practical efficiency still needs independent gameplay
          experiments.
        </p>
      </section>

      <section id="research-experiments">
        <h3>10. Change a known field to ask a better question</h3>
        <p>
          When candidates remain, a controlled change gives another ciphertext
          observation under the same identity and key. The experiment must
          specify the actual field position, before/after value and predicted
          black/transparent outcomes. Changing a Pokémon also changes its
          checksum; the solver checks each observation’s checksum separately.
        </p>
        <h4>Held items: simple, reversible key tests</h4>
        <p>
          The item is a two-byte value at Growth offsets 2–3, encrypted with key
          bytes 2–3 (counting key bytes from zero in little-endian order). If an
          item digit matches a candidate key digit, that ciphertext pixel
          becomes transparent. Most ordinary item IDs have similar high bytes,
          so many swaps repeat the same question or leave some key digits
          unresolved.
        </p>
        <p>
          The calculator ranks informative supported items by their actual
          binary outcome partitions over surviving hypotheses. No inventory
          checklist is required. Choose a usable item, answer whether the pixels
          changed <strong>compared with the original drawing</strong>, and
          edit/save its test drawing if needed. The next ranking uses all
          recorded evidence. A completed outcome that cannot separate remaining
          candidates offers no new information by repetition.
        </p>
        <h4>EV changes: choose the key alignment deliberately</h4>
        <table>
          <thead>
            <tr>
              <th>EV byte in its block</th>
              <th>Repeating key byte</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>HP</td>
              <td>0</td>
            </tr>
            <tr>
              <td>Attack</td>
              <td>1</td>
            </tr>
            <tr>
              <td>Defense</td>
              <td>2</td>
            </tr>
            <tr>
              <td>Speed</td>
              <td>3</td>
            </tr>
            <tr>
              <td>Sp. Attack</td>
              <td>0</td>
            </tr>
            <tr>
              <td>Sp. Defense</td>
              <td>1</td>
            </tr>
          </tbody>
        </table>
        <p>
          Defense and Speed affect the upper key bytes, often useful for SID.
          Small known EV changes can test digits that available items do not
          reach. The implemented vitamin recommendations require all six
          starting EVs and apply Generation 3’s vitamin/stat and total caps,
          including partial gains. Defense and Speed training recommendations
          also choose exact checkpoints using vitamins followed by battles,
          accounting for recorded Pokérus, Macho Brace and EV caps. Targets
          above 110 EVs are last resorts. Training tests use only predictable EV
          pixels; unknown EXP, PP, friendship and other battle side effects do
          not become plaintext or linked checksum constraints. Restore the
          baseline after each test. EV-reducing berry recommendations are not
          implemented.
        </p>
        <h4>Moves, PP and EXP</h4>
        <p>
          Implemented move swaps carry current PP and packed PP Ups with their
          move slots. Conditional Rare Candy recommendations use the species
          growth table’s exact next-level EXP and require known occupied moves;
          follow instructions to decline new moves and cancel evolution.
          Predictable PP-use experiments are mathematically useful, but
          arbitrary PP-use recommendations are still deferred. Joint per-order
          questions also work when PID, SID and affected block positions remain
          unknown, provided the original trainer TID is known.
        </p>
        <p>
          Finite candidate rankings measure worst-case survivors and estimated
          information under an explicit uniform identity/supported-outcome
          model. Broad joint domains use conservative survivor bounds and do not
          claim entropy for unknown fields. Item swaps have comparable effort.
          For a confirmed Spinda PID, next-step estimates compare experiments
          with another catch by information per minute: four minutes per catch,
          30 seconds per item swap, 10 seconds per vitamin and 60 seconds per
          training battle including the return to check. Catch estimates sample
          encounters in the configured RNG scope and assume stats resolve the IV
          spread. This is a planning model, not a measured success rate or an
          optimization of every possible experiment and item availability.
        </p>
        <aside className="research-callout">
          <strong>Always return to the original baseline</strong>
          <p>
            Saving a test keeps its observation and restores the original
            drawing. Restore the original Pokémon state in-game too. For
            consumable changes, retain a baseline save and reload it; do not
            overwrite it. An unfinished test draft contributes no constraints. A
            new Pokémon belongs in a new investigation.
          </p>
        </aside>
        <p>
          <Research path="research/INVESTIGATOR.md">
            Experiment mathematics and model
          </Research>{" "}
          ·{" "}
          <Research path="tests/controlled-experiments.test.ts">
            Controlled-action tests
          </Research>{" "}
          ·{" "}
          <Research path="tests/item-tests.test.ts">
            Baseline workflow tests
          </Research>
        </p>
      </section>

      <section id="research-reconstruction">
        <h3>11. Recovering the complete 80-byte record</h3>
        <p>
          Known PID and OTID fix the key, but they do not turn a black pixel
          into an exact digit. It still permits 15 ciphertext values. Full
          recovery needs enough additional information to remove that ambiguity:
          known plaintext, supported structural rules, RNG-derived IVs, checksum
          compatibility and further observations.
        </p>
        <p>
          The header checksum is the sum of the 24 decrypted 16-bit payload
          words, modulo 65,536. It constrains combinations, not just individual
          digits. The joint solver tests partial-payload checksum compatibility
          using digit sums and carries. It does not fill unknown trailing names
          or reserved words with convenient zeros.
        </p>
        <table>
          <thead>
            <tr>
              <th>Result category</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Exact recovery</td>
              <td>
                Every byte has one value under all active constraints; the
                decrypted checksum validates.
              </td>
            </tr>
            <tr>
              <td>Constrained / ambiguous</td>
              <td>
                Multiple values or correlated hypotheses remain. Marginal counts
                may be upper bounds.
              </td>
            </tr>
            <tr>
              <td>Assumed information</td>
              <td>
                A conditional input, such as zero EVs, that must actually be
                true.
              </td>
            </tr>
            <tr>
              <td>Unknown</td>
              <td>
                No value established. Predictions and imported previews are not
                observations.
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          Exact <code>.ek3</code> export is enabled only when all 80
          header/ciphertext bytes are unique and the decrypted checksum matches.
          The completeness percentage counts exact bytes out of 80; 75% does not
          mean a 75% chance of correctness. Recovery remains conditional on any
          supplied assumptions, and checksum validity is not a legality
          certificate.
        </p>
        <p>
          The reported Illumise success illustrates full reconstruction under
          supplied known conditions, including SID. Its fixture is needed for
          independent reproduction here.{" "}
          <Research path="tests/investigation.test.ts">
            Synthetic original-byte reconstruction and blind-SID tests
          </Research>{" "}
          exercise separate validation goals; they cannot establish universal
          single-screenshot recovery rates.
        </p>
      </section>

      <section id="research-applications">
        <h3>12. What this could make possible</h3>
        <ul>
          <li>
            <strong>Early-game SID recovery.</strong> Once Rustboro is
            reachable, combine a controlled catch, public TID and an estimated
            new-game window. This may avoid ACE and save inspection, but
            reliability and required observations still need broader gameplay
            validation.
          </li>
          <li>
            <strong>PID and IV investigation.</strong> Match supported
            encounters within a reset/advance scope, then use curtain evidence
            to reject incompatible spreads.
          </li>
          <li>
            <strong>EV investigation.</strong> Existing stored training
            information can be constrained by the key, pixels and summary facts.
            Exact recovery may require additional controlled observations;
            broader training histories remain future work.
          </li>
          <li>
            <strong>Pokémon preservation.</strong> Export exact reconstructed
            encrypted records for archival, sharing and compatible software.
          </li>
          <li>
            <strong>ACE integration.</strong> An exact record can serve as input
            to compatible Generation 3 writers, including Mettrich’s Base64
            writer/WELDR workflows. See the{" "}
            <a
              href="https://github.com/MankeyMite/Gen3ACEPokemonBuilder/blob/main/docs/spawn-setup.md"
              target="_blank"
              rel="noreferrer"
            >
              Builder’s WELDR setup documentation
            </a>{" "}
            and{" "}
            <a
              href="https://e-sh4rk.github.io/ACE3/emerald/hex-writer/hex-writer/"
              target="_blank"
              rel="noreferrer"
            >
              E-Sh4rk’s ACE3 writer reference
            </a>
            . This calculator does not execute ACE or implement a writer.
          </li>
        </ul>
        <p>
          An exact byte record can still describe an illegal Pokémon, and a
          legal-looking record is not automatically eligible for later-game
          transfers. Those are separate questions about provenance, game rules
          and receiving software.
        </p>
      </section>

      <section id="research-evidence">
        <h3>13. Evidence, open questions and acknowledgements</h3>
        <div className="research-evidence-list">
          <div>
            <h4>Verified source and capture findings</h4>
            <p>
              English byte mapping, the 96-byte exposed region, 80-byte
              structure, block permutations and XOR mechanism; the TID/SID
              generation functions; and the retained DOTS/Latios emulator
              comparisons. The ordinary new-game path has been source-audited,
              not newly instrumented in an emulator for this article.
            </p>
          </div>
          <div>
            <h4>Tested algorithms in this implementation</h4>
            <p>
              Zero/nonzero domains, PID-dependent blocks, supplied facts,
              exact/partial checksum compatibility, joint snapshot SID solving,
              supported summary/IV calculations, controlled experiments, wild
              H1/H2/H4 vectors and the reviewed Poochyena search, and reversible
              SID RNG intersections. Tests establish the supported model, not
              every in-game history.
            </p>
          </div>
          <div>
            <h4>Contributor-reported result</h4>
            <p>
              Complete Illumise reconstruction checked against an original
              record with known SID and other supplied data. The original
              fixture is needed before this result can be reproduced by this
              checkout’s tests. The roughly 11-second introduction timing is
              also a report, not an RNG trace.
            </p>
          </div>
          <div>
            <h4>Ongoing research</h4>
            <p>
              Reliable blind SID recovery from one fresh catch; a dedicated
              multi-Pokémon workflow and its success rates; optimal reachable
              experiments; general full-record recovery rates; precise timing
              calibration; special encounter models; and other
              languages/versions. No universal number of catches, screenshots or
              item swaps has been established.
            </p>
          </div>
        </div>
        <h4>Sources and reproducibility</h4>
        <p>
          Game-source links below are pinned to <code>{MAPPING.commit}</code>,
          the revision used for mapping extraction. Project links point to this
          repository’s research and tests; published files can lag a local
          checkout until it is released.
        </p>
        <ul className="research-references">
          <li>
            <strong>Dewford phrase SID recovery:</strong>{" "}
            <a
              href="https://www.reddit.com/r/pokemonrng/comments/16ei2ej/"
              target="_blank"
              rel="noreferrer"
            >
              maractite’s original method
            </a>{" "}
            and{" "}
            <a
              href="https://www.reddit.com/r/u_maractite/comments/16dyods"
              target="_blank"
              rel="noreferrer"
            >
              retail worked example
            </a>
            . This is established community research, independently implemented
            here and combined with curtain constraints.
          </li>
          <li>
            <strong>Related Feebas and SID tools:</strong>{" "}
            <a
              href="https://www.pokemonrng.com/emerald-sid-feebas/"
              target="_blank"
              rel="noreferrer"
            >
              Pokémon RNG’s Find SID with Feebas
            </a>
            , which credits Lincoln, HappyLappy and Shao for the{" "}
            <a
              href="https://github.com/HappyLappy1/Lappy-Python-Scripts/tree/main/RSE_Trendy_Saying_2_SID"
              target="_blank"
              rel="noreferrer"
            >
              Python SID Finder
            </a>
            , and mucksw for the{" "}
            <a
              href="https://mucksw.github.io/Feebas-Tile-Calculator/"
              target="_blank"
              rel="noreferrer"
            >
              Feebas Tile Calculator
            </a>
            . Additional research references include{" "}
            <a
              href="https://github.com/Goppier/FindingFeebas"
              target="_blank"
              rel="noreferrer"
            >
              Goppier’s FindingFeebas
            </a>{" "}
            and{" "}
            <a
              href="https://github.com/yuhasem/FeebasFinder"
              target="_blank"
              rel="noreferrer"
            >
              yuhasem’s FeebasFinder
            </a>
            . These tools are credited for related RNG research, not the
            curtain-memory mapping. No third-party tool implementation is
            bundled.
          </li>
          <li>
            <strong>Trainer IDs and RNG:</strong>{" "}
            <Source path="src/main.c">main.c</Source>,{" "}
            <Source path="src/naming_screen.c">naming_screen.c</Source>,{" "}
            <Source path="src/new_game.c">new_game.c</Source>,{" "}
            <Source path="src/random.c">random.c</Source>,{" "}
            <Source path="include/random.h">random.h</Source>,{" "}
            <Source path="src/main_menu.c">main_menu.c</Source> and{" "}
            <Source path="src/overworld.c">overworld.c</Source>.
          </li>
          <li>
            <strong>Record and encounters:</strong>{" "}
            <Source path="include/pokemon.h">pokemon.h</Source>,{" "}
            <Source path="src/pokemon.c">pokemon.c</Source> and{" "}
            <Source path="src/wild_encounter.c">wild_encounter.c</Source>.
            Independent numeric vectors:{" "}
            <a
              href="https://github.com/Admiral-Fish/PokeFinder/blob/master/Test/Gen3/wild3.json"
              target="_blank"
              rel="noreferrer"
            >
              PokéFinder Gen 3 wild fixtures
            </a>
            .
          </li>
          <li>
            <strong>Graphics and memory:</strong>{" "}
            <Source path="src/data/tilesets/graphics.h">graphics.h</Source>,{" "}
            <Source path="src/fieldmap.c">fieldmap.c</Source>,{" "}
            <Source path="src/menu.c">menu.c</Source>,{" "}
            <Source path="src/load_save.c">load_save.c</Source>,{" "}
            <Source path="src/field_camera.c">field_camera.c</Source> and{" "}
            <Source path="tools/gbagfx/gfx.c">4bpp conversion</Source>.
          </li>
          <li>
            <strong>Research notebook:</strong>{" "}
            <Research path="research/RESEARCH.md">Mapping</Research>,{" "}
            <Research path="research/VALIDATION.md">
              validation history
            </Research>
            , <Research path="research/INVESTIGATOR.md">solver model</Research>,{" "}
            <Research path="research/SID_RNG.md">SID RNG</Research>,{" "}
            <Research path="research/WILD_RNG.md">wild RNG</Research>,{" "}
            <Research path="research/EXPERIMENTS.md">
              gameplay experiments
            </Research>
            , <Research path="research/SOLVER_GUIDE.md">solver guide</Research>{" "}
            and{" "}
            <Research path="research/SUMMARY_STATS.md">summary stats</Research>.
          </li>
          <li>
            <strong>Retained cases:</strong>{" "}
            <Research path="research/SKARMORY_CASE.md">Skarmory</Research>,{" "}
            <Research path="research/WHISMUR_CHECK.md">Whismur</Research>,{" "}
            <Research path="research/POOCHYENA_CASE.md">Poochyena</Research>,{" "}
            <Research path="research/fixtures">
              emulator and record fixtures
            </Research>
            , <Research path="tests">automated tests</Research>.
          </li>
          <li>
            <strong>Historical context:</strong>{" "}
            <a href={HISTORY} target="_blank" rel="noreferrer">
              Glitch City’s preserved black curtains article and credits
            </a>{" "}
            and{" "}
            <a
              href="https://bulbapedia.bulbagarden.net/wiki/List_of_overworld_glitches_(Generation_III)#Trainer's_School_window_tile_quirks"
              target="_blank"
              rel="noreferrer"
            >
              Bulbapedia’s Trainer’s School window tile quirks
            </a>
            . The modern heap-upload analysis should not be confused with
            historical fixed live-address descriptions.
          </li>
        </ul>
        <p>
          Thanks to the Glitch City researchers and Dewford/Feebas tool authors
          named above, pret contributors, mGBA developers, PokéFinder
          contributors and the players who supplied drawings, records and
          careful follow-up tests. Research and development were{" "}
          <strong>AI-assisted</strong>: source analysis and deterministic code
          were developed with AI help, while claims remain tied to inspectable
          sources and retained evidence. No new emulator capture was produced
          for this article.
        </p>
        <p>
          This independent project is not affiliated with Nintendo, Game Freak
          or Creatures. Pokémon names/artwork and third-party research retain
          their respective rights. Calculations and autosave run locally in your
          browser; imported comparison records do not fill the solver or enter
          investigation JSON backups.
        </p>
        <a href="#research-title">Back to the article introduction ↑</a>
      </section>
    </article>
  );
}
