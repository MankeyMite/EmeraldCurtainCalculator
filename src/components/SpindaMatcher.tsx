import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import {
  SPINDA_ASSETS,
  SPINDA_SPECIES,
  moveSpindaSpot,
  spindaPositions,
} from "../core/spinda";
import {
  defaultSpindaMatcher,
  SPINDA_AREAS,
  validateSpindaMatcher,
  type SpindaMatcherState,
  type SpindaMatch,
} from "../core/spindaMatcher";
import { parseRngNumber, WILD_METHODS, type WildLead } from "../core/rng";
import { hex, NATURES } from "../core/pokemon";
import { genderForPid } from "../core/traits";
import { SpindaSprite } from "./SpindaSprite";
import type { SpindaWorkerResponse } from "../core/spindaWorker";
import { newSpindaSidGuide } from "../core/spindaSidGuide";
import { SpindaSidGuide } from "./SpindaSidGuide";

const names = [
  "Left ear (on screen)",
  "Right ear (on screen)",
  "Left face (on screen)",
  "Right face (on screen)",
];
const maskPaths = SPINDA_ASSETS.spots.map((s) =>
  s.rows
    .flatMap((bits, y) =>
      Array.from({ length: 16 }, (_, x) =>
        bits & (1 << x) ? `M${x} ${y}h1v1h-1z` : "",
      ),
    )
    .join(""),
);
const maskOutlines = SPINDA_ASSETS.spots.map((s) =>
  s.rows
    .flatMap((bits, y) =>
      Array.from({ length: 16 }, (_, x) => {
        if (!(bits & (1 << x))) return "";
        return `${y === 0 || !(s.rows[y - 1] & (1 << x)) ? `M${x} ${y}h1` : ""}${y === 15 || !(s.rows[y + 1] & (1 << x)) ? `M${x} ${y + 1}h1` : ""}${x === 0 || !(bits & (1 << (x - 1))) ? `M${x} ${y}v1` : ""}${x === 15 || !(bits & (1 << (x + 1))) ? `M${x + 1} ${y}v1` : ""}`;
      }),
    )
    .join(""),
);
type SearchState = {
  key: string;
  pid: number;
  matches: SpindaMatch[];
  progress: number;
  busy: boolean;
  error: string;
};

export function SpindaMatcher({
  lab,
  locatePixel,
}: {
  lab: CurtainLab;
  locatePixel?: (nibble: number) => void;
}) {
  const value = lab.spindaMatcher ?? defaultSpindaMatcher();
  const update = (next: SpindaMatcherState) =>
    lab.setSpindaMatcher(validateSpindaMatcher(next));
  const guideRef = useRef<HTMLDetailsElement>(null);
  const useGuide = (pid: number) => {
    update({
      ...value,
      guide: { ...(value.guide ?? newSpindaSidGuide(pid)), pid, enabled: true },
    });
    requestAnimationFrame(() =>
      guideRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  };
  const [open, setOpen] = useState(!!value.guide?.enabled),
    [selectedSpot, setSelectedSpot] = useState(0),
    [handles, setHandles] = useState(true),
    [shiny, setShiny] = useState(false),
    [selectedPid, setSelectedPid] = useState<number | null>(null),
    [overlay, setOverlay] = useState(false),
    [limit, setLimit] = useState(10),
    [confirm, setConfirm] = useState<number | null>(null),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [cancelled, setCancelled] = useState(false),
    [pidText, setPidText] = useState(hex(value.pid, 8));
  const [numbers, setNumbers] = useState({
    seed: String(value.settings.seed),
    minAdvance: String(value.settings.minAdvance),
    maxAdvance: String(value.settings.maxAdvance),
  });
  const [search, setSearch] = useState<SearchState>({
    key: "",
    pid: 0,
    matches: [],
    progress: 0,
    busy: false,
    error: "",
  });
  const worker = useRef<Worker | null>(null),
    latestPid = useRef(value.pid);
  latestPid.current = value.pid;
  const key = JSON.stringify({
    settings: value.settings,
    level: value.level,
    nature: value.nature,
    gender: value.gender,
  });
  const validNumbers = (() => {
    try {
      return Object.entries(numbers).every(
        ([k, v]) =>
          parseRngNumber(v) === value.settings[k as keyof typeof numbers],
      );
    } catch {
      return false;
    }
  })();
  useEffect(() => setPidText(hex(value.pid, 8)), [value.pid]);
  useEffect(
    () =>
      setNumbers({
        seed: String(value.settings.seed),
        minAdvance: String(value.settings.minAdvance),
        maxAdvance: String(value.settings.maxAdvance),
      }),
    [value.settings.seed, value.settings.minAdvance, value.settings.maxAdvance],
  );
  useEffect(() => {
    if (!open || cancelled || !validNumbers) return;
    setSearch({
      key,
      pid: latestPid.current,
      matches: [],
      progress: 0,
      busy: true,
      error: "",
    });
    const timer = setTimeout(() => {
      let w: Worker;
      try {
        w = new Worker(
          new URL("../workers/spinda.worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch {
        setSearch((s) => ({
          ...s,
          busy: false,
          error: "Background search unavailable. Reload and try again.",
        }));
        return;
      }
      worker.current = w;
      w.onmessage = ({ data }: MessageEvent<SpindaWorkerResponse>) => {
        if (data.type === "progress")
          setSearch((s) => ({
            ...s,
            progress: Math.round((90 * data.done) / Math.max(1, data.total)),
          }));
        if (data.type === "preparing")
          setSearch((s) => ({ ...s, progress: 95 }));
        if (data.type === "error") {
          setSearch((s) => ({
            ...s,
            matches: [],
            busy: false,
            error: data.message,
          }));
          w.terminate();
          worker.current = null;
        }
        if (data.type === "result" && data.pid === latestPid.current)
          setSearch({
            key,
            pid: data.pid,
            matches: data.matches,
            progress: 100,
            busy: false,
            error: "",
          });
      };
      w.onerror = () => {
        setSearch((s) => ({
          ...s,
          busy: false,
          matches: [],
          error: "Background search failed. Try again.",
        }));
        w.terminate();
        worker.current = null;
      };
      w.postMessage({ type: "generate", state: value, pid: latestPid.current });
    }, 180);
    return () => {
      clearTimeout(timer);
      worker.current?.terminate();
      worker.current = null;
    };
  }, [key, open, revision, cancelled, validNumbers]);
  useEffect(() => {
    if (!worker.current || cancelled) return;
    setSearch((s) => ({ ...s, busy: true }));
    const timer = setTimeout(
      () => worker.current?.postMessage({ type: "rank", pid: value.pid }),
      70,
    );
    return () => clearTimeout(timer);
  }, [value.pid]);
  const ready =
    validNumbers &&
    !cancelled &&
    search.key === key &&
    search.pid === value.pid &&
    !search.busy &&
    !search.error;
  const matches = ready ? search.matches : [],
    selected = matches.find((m) => m.pid === selectedPid),
    positions = spindaPositions(value.pid);
  const drag = useRef<{
    pointer: number;
    spot: number;
    pid: number;
    x: number;
    y: number;
    scale: number;
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const comparisonRef = useRef<HTMLDivElement>(null),
    confirmationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    comparisonRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedPid]);
  useEffect(() => {
    confirmationRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [confirm]);
  const setPid = (pid: number) => {
    update({ ...value, pid });
    setError("");
  };
  function pointerDown(e: ReactPointerEvent<SVGGElement>, spot: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = svg.current!.getBoundingClientRect();
    drag.current = {
      pointer: e.pointerId,
      spot,
      pid: value.pid,
      x: e.clientX,
      y: e.clientY,
      scale: 64 / rect.width,
    };
    setSelectedSpot(spot);
    svg.current!.setPointerCapture(e.pointerId);
  }
  function pointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = spindaPositions(d.pid)[d.spot];
    setPid(
      moveSpindaSpot(
        d.pid,
        d.spot,
        p.x + Math.round((e.clientX - d.x) * d.scale),
        p.y + Math.round((e.clientY - d.y) * d.scale),
      ),
    );
  }
  function nudge(dx: number, dy: number) {
    const p = positions[selectedSpot];
    setPid(moveSpindaSpot(value.pid, selectedSpot, p.x + dx, p.y + dy));
  }
  function changeNumber(field: keyof typeof numbers, text: string) {
    const next = { ...numbers, [field]: text };
    setNumbers(next);
    setCancelled(false);
    try {
      const settings = {
        ...value.settings,
        seed: parseRngNumber(next.seed),
        minAdvance: parseRngNumber(next.minAdvance),
        maxAdvance: parseRngNumber(next.maxAdvance),
      };
      update({ ...value, settings });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function shortlist(pid: number) {
    if (!value.shortlist.includes(pid) && value.shortlist.length >= 5000) {
      setError(
        "The saved shortlist is full. Remove an earlier estimate first.",
      );
      return;
    }
    update({
      ...value,
      shortlist: value.shortlist.includes(pid)
        ? value.shortlist.filter((p) => p !== pid)
        : [...value.shortlist, pid],
    });
  }
  const configurable = (patch: Partial<SpindaMatcherState>) => {
    try {
      update({ ...value, ...patch });
      setError("");
      setCancelled(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const settings = (patch: Partial<SpindaMatcherState["settings"]>) =>
    configurable({ settings: { ...value.settings, ...patch } });
  return (
    <details
      className="spinda-matcher investigation-card"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Find Spinda PID from its spot pattern</summary>
      <p>
        Soft reset Emerald, encounter a wild Spinda, then match its settled
        front pose here before catching it. No trainer ID, IVs or curtain
        drawing needed.
      </p>
      <div className="spinda-workflow">
        <section
          className="spinda-config"
          aria-label="Spinda encounter RNG settings"
        >
          <h3>1. RNG range</h3>
          <div className="rng-inputs">
            {(
              [
                ["seed", "Initial seed"],
                ["minAdvance", "Minimum advance"],
                ["maxAdvance", "Maximum advance"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  value={numbers[k]}
                  inputMode={k === "seed" ? "text" : "numeric"}
                  onChange={(e) => changeNumber(k, e.target.value)}
                />
              </label>
            ))}
          </div>
          <label>
            Encounter location
            <select
              value={value.settings.areaId}
              onChange={(e) => settings({ areaId: e.target.value })}
            >
              {SPINDA_AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.kind === "land" ? "grass / cave" : a.kind}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="rng-methods">
            <legend>Wild methods</legend>
            {WILD_METHODS.map((m) => (
              <label key={m}>
                <input
                  type="checkbox"
                  checked={value.settings.methods.includes(m)}
                  onChange={(e) =>
                    settings({
                      methods: e.target.checked
                        ? [...value.settings.methods, m]
                        : value.settings.methods.filter((v) => v !== m),
                    })
                  }
                />
                {m}
              </label>
            ))}
          </fieldset>
          <label>
            Lead effect
            <select
              value={value.settings.lead}
              onChange={(e) => settings({ lead: e.target.value as WildLead })}
            >
              <option value="none">None / ordinary lead</option>
              <option value="synchronize">Synchronize</option>
              <option value="cuteCharmM">Cute Charm · male lead</option>
              <option value="cuteCharmF">Cute Charm · female lead</option>
              <option value="pressure">Pressure / Hustle / Vital Spirit</option>
            </select>
          </label>
          {value.settings.lead === "synchronize" && (
            <label>
              Lead nature
              <select
                value={value.settings.synchronizeNature}
                onChange={(e) =>
                  settings({ synchronizeNature: Number(e.target.value) })
                }
              >
                {NATURES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <details>
            <summary>Optional observed traits</summary>
            <label>
              Encounter level
              <input
                type="number"
                min={1}
                max={100}
                value={value.level ?? ""}
                onChange={(e) =>
                  configurable({
                    level:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Nature
              <select
                value={value.nature ?? ""}
                onChange={(e) =>
                  configurable({
                    nature:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  })
                }
              >
                <option value="">Unknown</option>
                {NATURES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </details>
          <p className="help">
            Inclusive RNG-call bounds; advance 0 is the seed before the
            encounter-slot call. Decimal or 0x hex. This searches wild
            encounters, separately from TID-seeded new-game SID RNG.
          </p>
          <p className="help">
            Ordinary Emerald encounters only; extra effects such as Static,
            Magnet Pull, Intimidate / Keen Eye, Safari blocks and special
            encounters are outside this model.
          </p>
          <button
            type="button"
            onClick={() => {
              setCancelled(false);
              setRevision((n) => n + 1);
            }}
          >
            Search again
          </button>
          {search.busy && (
            <button type="button" onClick={() => setCancelled(true)}>
              Cancel search
            </button>
          )}
        </section>
        <section className="spinda-editor" aria-label="Spinda spot editor">
          <h3>2. Drag the four spots</h3>
          <label>
            Observed Spinda gender
            <select
              aria-label="Observed Spinda gender"
              value={value.gender ?? ""}
              onChange={(e) =>
                configurable({
                  gender:
                    e.target.value === ""
                      ? undefined
                      : (e.target.value as "male" | "female"),
                })
              }
            >
              <option value="">Unknown / either</option>
              <option value="male">Male ♂</option>
              <option value="female">Female ♀</option>
            </select>
          </label>
          <p className="help">
            Choose the gender shown in battle to filter RNG candidates before
            matching. This is the encountered Spinda’s gender, separately from
            any Cute Charm lead.
          </p>
          <div className="spinda-pid-line">
            <label>
              Pattern PID (hex)
              <input
                aria-label="Spinda pattern PID hexadecimal"
                value={pidText}
                maxLength={10}
                spellCheck={false}
                onChange={(e) => {
                  setPidText(e.target.value);
                  try {
                    const text = e.target.value.replace(/^0x/i, "");
                    if (!/^[0-9a-f]{8}$/i.test(text))
                      throw Error("Enter all eight hexadecimal PID digits");
                    setPid(Number.parseInt(text, 16));
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
            </label>
            <small>
              {value.pid.toLocaleString()} decimal · {NATURES[value.pid % 25]} ·{" "}
              {genderForPid(SPINDA_SPECIES, value.pid)}
            </small>
          </div>
          {value.gender &&
            genderForPid(SPINDA_SPECIES, value.pid) !== value.gender && (
              <p role="status">
                This dragged pattern’s PID is{" "}
                {genderForPid(SPINDA_SPECIES, value.pid)}, but you selected{" "}
                {value.gender}. Matching results use your observed gender.
                Recheck the first spot or compare the closest compatible
                candidates; the spots have not been moved automatically.
              </p>
            )}
          <div
            className="spinda-stage"
            onKeyDown={(e) => {
              const d = (
                {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                } as Record<string, number[]>
              )[e.key];
              if (d) {
                e.preventDefault();
                nudge(d[0], d[1]);
              }
            }}
          >
            <SpindaSprite
              pid={value.pid}
              shiny={shiny}
              overlayPid={overlay ? selected?.pid : undefined}
            />
            <svg
              ref={svg}
              viewBox="0 0 64 64"
              aria-label="Drag a spot one sprite pixel at a time"
              className="spinda-drag-layer"
              onPointerMove={pointerMove}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            >
              {positions.map((p, i) => (
                <g
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={`${names[i]}, drag or use arrow keys`}
                  aria-pressed={selectedSpot === i}
                  onFocus={() => setSelectedSpot(i)}
                  onPointerDown={(e) => pointerDown(e, i)}
                  className={selectedSpot === i ? "selected" : ""}
                >
                  <path
                    transform={`translate(${p.x} ${p.y})`}
                    d={maskPaths[i]}
                    className="spinda-spot-hit"
                  />
                  {handles && (
                    <path
                      transform={`translate(${p.x} ${p.y})`}
                      d={maskOutlines[i]}
                      className="spinda-spot-handle"
                    />
                  )}
                  {handles && (
                    <text
                      x={p.x + 5}
                      y={p.y + 6}
                      textAnchor="middle"
                      className="spinda-spot-number"
                    >
                      {i + 1}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
          <div className="spinda-spots" aria-label="Select a spot">
            {positions.map((p, i) => (
              <button
                key={i}
                aria-pressed={selectedSpot === i}
                onClick={() => setSelectedSpot(i)}
                title={names[i]}
              >
                Spot {i + 1}{" "}
                <code>{hex((value.pid >>> (i * 8)) & 255, 2)}</code>
              </button>
            ))}
          </div>
          <div className="inline-buttons spinda-nudge">
            <button
              aria-label="Move spot left one pixel"
              onClick={() => nudge(-1, 0)}
            >
              ←
            </button>
            <button
              aria-label="Move spot up one pixel"
              onClick={() => nudge(0, -1)}
            >
              ↑
            </button>
            <button
              aria-label="Move spot down one pixel"
              onClick={() => nudge(0, 1)}
            >
              ↓
            </button>
            <button
              aria-label="Move spot right one pixel"
              onClick={() => nudge(1, 0)}
            >
              →
            </button>
          </div>
          <p className="help">
            Drag or use arrows. Every step snaps to one original sprite pixel.
            Spot {selectedSpot + 1}: X digit{" "}
            {((value.pid >>> (selectedSpot * 8)) & 15)
              .toString(16)
              .toUpperCase()}
            , Y digit{" "}
            {((value.pid >>> (selectedSpot * 8 + 4)) & 15)
              .toString(16)
              .toUpperCase()}
            . Each has 16 positions per axis.
          </p>
          <div className="inline-buttons">
            <label>
              <input
                type="checkbox"
                checked={handles}
                onChange={(e) => setHandles(e.target.checked)}
              />{" "}
              Spot handles
            </label>
            <label>
              <input
                type="checkbox"
                checked={shiny}
                onChange={(e) => setShiny(e.target.checked)}
              />{" "}
              Shiny palette
            </label>
          </div>
          <p className="help">
            Outlines show draggable masks, including hidden parts. Turn handles
            off to compare the actual clipped Emerald pattern. Wait for the
            battle entrance animation to settle.
          </p>
          <button onClick={() => useGuide(value.pid)}>
            Use this pattern PID: show SID pixels
          </button>
          <button onClick={() => setConfirm(value.pid)}>
            Use pattern PID in Pokémon info…
          </button>
          <p className="help">
            Start immediately from the spots. No Pokémon info fields or RNG
            result are required for the pixel guide.
          </p>
        </section>
      </div>
      <details
        ref={guideRef}
        open={value.guide?.enabled ?? false}
        onToggle={(e) => {
          const enabled = e.currentTarget.open;
          if (enabled !== (value.guide?.enabled ?? false))
            update({
              ...value,
              guide: {
                ...(value.guide ?? newSpindaSidGuide(value.pid)),
                enabled,
              },
            });
        }}
      >
        <summary>SID pixel guide · highlight by estimated PID</summary>
        <SpindaSidGuide
          value={value.guide ?? newSpindaSidGuide(value.pid)}
          facts={lab.facts}
          infoError={!!lab.factError}
          sidDigitFilters={lab.sidDigitFilters}
          rngCandidate={
            ready
              ? matches.find((m) => m.pid === (value.guide?.pid ?? value.pid))
              : undefined
          }
          rngStatus={
            !validNumbers
              ? "Correct the RNG range to use encounter IVs."
              : cancelled
                ? "Search cancelled; encounter IVs are not applied."
                : search.error
                  ? "Search failed; encounter IVs are not applied."
                  : !ready
                    ? "Searching the current RNG scope for this PID's IVs..."
                    : "This exact PID was not found in the current RNG scope. Encounter IVs are not applied; review the pattern or widen the range."
          }
          onChange={(guide) => update({ ...value, guide })}
          onLocate={locatePixel}
        />
        {value.guide && value.guide.pid !== value.pid && (
          <button onClick={() => useGuide(value.pid)}>
            Switch guide to current editor PID 0x{hex(value.pid, 8)}
          </button>
        )}
      </details>
      {(error || search.error) && <p role="alert">{error || search.error}</p>}
      <section
        className="spinda-results"
        aria-label="Best matching Spinda PIDs"
      >
        <h3>3. Best matching PIDs</h3>
        {cancelled ? (
          <p role="status">
            Search cancelled. No partial candidate pool is shown. Search again
            to rank the full range.
          </p>
        ) : !ready ? (
          <p role="status">
            {search.error
              ? "No complete results available."
              : !validNumbers
                ? "Correct the RNG inputs to search."
                : `Searching / matching… ${search.progress}%`}
          </p>
        ) : (
          <>
            <p role="status">
              {matches.length.toLocaleString()} distinct wild Spinda PIDs in
              this scope. Showing {Math.min(limit, matches.length)}. All
              advances, methods and IV variants are retained.
            </p>
            {!!matches.length && (
              <p>
                {matches[0].score < 65
                  ? "No close visual match. Widen the range, adjust the spots or review the encounter settings."
                  : matches.filter((m) => m.score >= matches[0].score - 3)
                        .length > 1
                    ? "Several candidates are visually plausible. Compare them and preserve the alternatives."
                    : "The highlighted pattern ranks first in this scope; its PID is still a visual estimate."}{" "}
                Similarity is not certainty or a probability.
              </p>
            )}
            {!matches.length && (
              <p>
                No wild Spinda candidates in this scope. Widen the advance range
                or review the seed, location, lead and observed traits.
              </p>
            )}
            {selected && (
              <div className="spinda-comparison" ref={comparisonRef}>
                <div className="spinda-enlarged">
                  <SpindaSprite pid={selected.pid} shiny={shiny} />
                </div>
                <div>
                  <strong>Selected 0x{hex(selected.pid, 8)}</strong>
                  <p>
                    {selected.score.toFixed(1)}% visual similarity ·{" "}
                    {selected.identicalPatterns} PID(s) share this exact visible
                    pattern in the scope.
                  </p>
                  <label>
                    <input
                      type="checkbox"
                      checked={overlay}
                      onChange={(e) => setOverlay(e.target.checked)}
                    />{" "}
                    Overlay differences on editor
                  </label>
                  <p className="help">
                    Cyan: candidate-only spots. Pink: editor-only spots. The
                    editor PID stays unchanged.
                  </p>
                  <button onClick={() => setConfirm(selected.pid)}>
                    Use estimated PID in Pokémon info…
                  </button>
                  <button onClick={() => useGuide(selected.pid)}>
                    Show SID pixels for this candidate
                  </button>
                </div>
              </div>
            )}
            <div className="spinda-match-grid">
              {matches.slice(0, limit).map((m, i) => (
                <article
                  key={m.pid}
                  className={`spinda-match ${i === 0 ? "best" : ""}`}
                >
                  <button
                    className="spinda-match-preview"
                    onClick={() => setSelectedPid(m.pid)}
                    aria-label={`Inspect PID ${hex(m.pid, 8)}`}
                  >
                    <SpindaSprite pid={m.pid} shiny={shiny} />
                  </button>
                  <strong>
                    {i === 0 ? "Best in scope · " : ""}0x{hex(m.pid, 8)}
                  </strong>
                  <span>{m.pid} decimal</span>
                  <span>{m.score.toFixed(1)}% similarity</span>
                  <span>
                    {NATURES[m.pid % 25]} ·{" "}
                    {genderForPid(SPINDA_SPECIES, m.pid)}
                  </span>
                  {m.identicalPatterns > 1 && (
                    <strong>
                      {m.identicalPatterns} visually identical PIDs
                    </strong>
                  )}
                  <details>
                    <summary>
                      {new Set(m.encounters.map((e) => e.advance)).size}{" "}
                      possible advance(s) ·{" "}
                      {[
                        ...new Set(m.encounters.flatMap((e) => e.methods)),
                      ].join(" / ")}
                    </summary>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Advance</th>
                            <th>Method</th>
                            <th>Slot / level</th>
                            <th>IVs: HP/Atk/Def/Spe/SpA/SpD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.encounters.map((e, j) => (
                            <tr key={j}>
                              <td>{e.advance}</td>
                              <td>{e.methods.join("/")}</td>
                              <td>
                                {e.slot + 1} / {e.level}
                              </td>
                              <td>{e.ivs.join("/")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <button
                    aria-pressed={value.shortlist.includes(m.pid)}
                    onClick={() => shortlist(m.pid)}
                  >
                    {value.shortlist.includes(m.pid)
                      ? "Saved as plausible"
                      : "Keep as plausible"}
                  </button>
                </article>
              ))}
            </div>
            {limit < matches.length && (
              <button onClick={() => setLimit((n) => n + 20)}>
                Show 20 more patterns
              </button>
            )}
          </>
        )}
        {confirm !== null && (
          <div
            className="spinda-confirm"
            ref={confirmationRef}
            role="group"
            aria-label="Confirm estimated PID transfer"
          >
            <p>
              Apply <strong>0x{hex(confirm, 8)}</strong> as an{" "}
              <strong>unverified visual estimate</strong> to this Spinda? This
              replaces the current PID input
              {lab.facts.pid === undefined
                ? ""
                : ` (0x${hex(lab.facts.pid, 8)})`}
              . Recovery will be conditional on it. Saved curtain observations
              and other facts are preserved.
            </p>
            {lab.facts.species !== undefined &&
              lab.facts.species !== SPINDA_SPECIES && (
                <p>
                  First choose Spinda in Pokémon info for the Pokémon you intend
                  to investigate. Save your current investigation before
                  switching Pokémon.
                </p>
              )}
            {lab.facts.species === undefined && (
              <p>
                Species will be set to Spinda automatically. No other Pokémon
                info is required.
              </p>
            )}
            {(lab.pendingItemTest || lab.factError || lab.summaryError) && (
              <p>
                Finish the current experiment and correct invalid inputs before
                transferring.
              </p>
            )}
            <button
              disabled={
                (lab.facts.species !== undefined &&
                  lab.facts.species !== SPINDA_SPECIES) ||
                !!lab.pendingItemTest ||
                !!lab.factError ||
                !!lab.summaryError
              }
              onClick={() => {
                if (lab.applySpindaEstimate(confirm)) setConfirm(null);
              }}
            >
              Confirm: apply estimated PID
            </button>
            <button onClick={() => setConfirm(null)}>Cancel transfer</button>
          </div>
        )}
        {!!value.shortlist.length && (
          <details>
            <summary>
              {value.shortlist.length} saved plausible PID(s) · advisory only
            </summary>
            <p>
              Preserved in investigation backups; these PIDs do not constrain
              the solver until you explicitly apply one.
            </p>
            {value.shortlist.map((pid) => (
              <div key={pid} className="inline-buttons">
                <code>0x{hex(pid, 8)}</code>
                {!matches.some((m) => m.pid === pid) && (
                  <small>Outside current results</small>
                )}
                <button onClick={() => setConfirm(pid)}>Use estimate…</button>
                <button onClick={() => useGuide(pid)}>Show SID pixels</button>
                <button onClick={() => shortlist(pid)}>Remove</button>
              </div>
            ))}
          </details>
        )}
        <details>
          <summary>How patterns are compared</summary>
          <p>
            65% exact pixel overlap and 35% overlap within two sprite pixels,
            with symmetric penalties for extra and missing spots. Only pixels
            that can carry a PID spot are compared. The score is visual
            similarity, not a probability. Hidden or overlapping spots can leave
            multiple PIDs indistinguishable.
          </p>
        </details>
      </section>
      <p className="help">
        After comparing, catch the Spinda and use its curtain pixels and known
        facts to check your estimate and recover SID. Spots, filters and
        plausible PIDs save separately with your investigation.
      </p>
    </details>
  );
}
