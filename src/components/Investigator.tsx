import { useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { download } from "../hooks/useCurtainLab";
import { KnownFactsForm } from "./KnownFactsForm";
import { WildRngPanel } from "./WildRngPanel";
import { ORIGINS } from "../core/investigation";
import { isRecorded } from "../core/itemTests";
import {
  allowedValues,
  summarizeField,
  constraintHex,
} from "../core/constraints";
import { hex, recordHex } from "../core/pokemon";
import { diagnoseHypothesis, makeHypothesis } from "../core/sid";
import species from "../data/species.json";
import growth from "../data/growth-rates.json";
import type { DomainQuestion } from "../core/domainExperiments";
import { ExperimentProgress } from "./ExperimentProgress";
import { PokeblockExperiment } from "./PokeblockExperiment";

function DomainExplanation({ question }: { question?: DomainQuestion }) {
  if (!question) return null;
  return (
    <p className="help">
      {question.combinedChecksum ? "Encrypted component: byte" : "Inspect byte"}{" "}
      0x{hex(Math.floor((question.index - 16) / 2))},{" "}
      {question.index % 2 ? "high" : "low"} digit. This tests XOR-key digit{" "}
      {question.keyDigit} across all compatible block orders. With known
      TID/SID, key restrictions also restrict PID; with unknown SID they jointly
      constrain PID, SID, key and permutation. Transparent retains at most{" "}
      {question.transparentCount.toLocaleString()} {question.countBasis}{" "}
      possibilities; black retains at most{" "}
      {question.blackCount.toLocaleString()}.
      {question.digits.length > 0 && question.digits.length < 16 && (
        <>
          {" "}
          Known plaintext digits tested:{" "}
          {question.digits.map((n) => hex(n, 1)).join(", ")}.
        </>
      )}
      {question.conditional &&
        " The sets can overlap because some block orders leave this pixel's plaintext unknown."}{" "}
      Counts are stored-data bounds; no encounter timing or zero EVs are
      assumed.
      {question.combinedChecksum &&
        " These counts describe the encrypted component alone. Follow all highlighted targets to combine it with linked checksum evidence."}
      {question.scopeRelaxed &&
        " The optional SID RNG scope uses a conservative digit envelope because exact scope ranking exceeds the computation budget."}
    </p>
  );
}

export function InvestigationFlow({
  lab,
  openEditor,
  openRecovery,
}: {
  lab: CurtainLab;
  openEditor: () => void;
  openRecovery: () => void;
}) {
  const [query, setQuery] = useState("");
  const selected = species.find((s) => s.id === lab.facts.species);
  return (
    <section className="investigation-flow">
      <div className="investigation-intro">
        <h2>Recover what your Pokémon can reveal</h2>
        <p>
          Select your Pokémon, enter what you know, then record the curtains.
          The investigator narrows hidden data and suggests the next useful item
          swap.
        </p>
        <p>
          <strong>English Emerald:</strong> put this Pokémon in{" "}
          <strong>Box 8, slot 5</strong>, preferably leave slots 4 and 6 empty,
          and enter Rustboro Trainer School.
        </p>
      </div>
      <div className="investigation-steps">
        <section className="investigation-card">
          <h3>1 · Which Pokémon do you have in Box 8, slot 5?</h3>
          <label>
            Search species
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Poochyena"
            />
          </label>
          <label>
            Choose Pokémon
            <select
              value={lab.factDraft.species ?? ""}
              onChange={(e) => lab.editFact("species", e.target.value)}
            >
              <option value="">Select a species</option>
              {species
                .filter(
                  (s) =>
                    s.name.toLowerCase().includes(query.toLowerCase()) ||
                    s.id === selected?.id,
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          {selected && (
            <p className="help">
              <strong>Known species rules:</strong> internal ID {selected.id};
              base stats (HP / Atk / Def / Spe / SpA / SpD):{" "}
              {selected.summaryBaseStats.join(" / ")}; gender threshold{" "}
              {selected.genderRatio} (255 genderless, 254 female only, 0 male
              only); abilities{" "}
              {[...new Set(selected.abilities.map((a) => a.name))].join(" / ")};
              growth {(growth as Record<string, string>)[selected.id]}.
            </p>
          )}
        </section>
        <section className="investigation-card">
          <h3>2 · How did you obtain this Pokémon?</h3>
          <label>
            Obtaining method
            <select
              value={lab.origin}
              onChange={(e) => {
                lab.setOrigin(e.target.value as typeof lab.origin);
                lab.clearDefaults();
              }}
            >
              {ORIGINS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <p className="help">
            {lab.origin === "wild" || lab.origin === "static"
              ? "Enter met level and location if known. For a newly caught, untouched Pokémon you can explicitly apply the labeled fresh-catch assumptions below. Wild origins can use the seed and advance search below; Static includes starters and ordinary gifts and uses Method 1 or Method 4."
              : lab.origin === "egg"
                ? "Eggs use breeding-specific PID and inherited IV mechanics. This version uses stored-data constraints and makes no breeding RNG assumptions."
                : lab.origin === "trade" || lab.origin === "transferred"
                  ? "Use the original trainer's name and IDs. Another trainer's Pokémon reveals that trainer's SID, not your own. Its origin generation is not assumed to be Emerald wild RNG."
                  : lab.origin === "event"
                    ? "Only enter distribution or encounter values you have verified. No fixed PID, IVs, trainer IDs or generation method are assumed."
                    : "Choose the origin when known. The stored-data solver also works without an encounter model."}
          </p>
        </section>
        <section className="investigation-card">
          <h3>3 · Enter what you already know</h3>
          <p>
            Known = supplied facts. Derived = deduced under active constraints.
            Assumed = explicitly applied defaults. Blank = unknown. Results that
            use assumptions remain conditional on them.
          </p>
          <KnownFactsForm lab={lab} />
        </section>
        <section className="investigation-card">
          <h3>4 · Record and investigate</h3>
          <p>
            Click to paint black; click black again to make it transparent.
            Check the whole pattern before Finish drawing confirms remaining
            blanks as transparent. Calculations pause while drawing and resume
            when you finish.
          </p>
          <div className="inline-buttons">
            <button onClick={openEditor}>Draw curtains</button>
            <button onClick={openRecovery}>View data recovery</button>
            <button
              disabled={
                !!(
                  lab.factError ||
                  lab.summaryError ||
                  lab.ppError ||
                  lab.analysisError ||
                  lab.analysisBusy ||
                  lab.drawingInProgress
                )
              }
              onClick={lab.saveDrawing}
            >
              Save investigation
            </button>
            <button onClick={() => lab.sessionRef.current?.click()}>
              Load investigation / old drawing
            </button>
          </div>
        </section>
      </div>
      <WildRngPanel lab={lab} />
      <InvestigationResults lab={lab} />
    </section>
  );
}

export function ObservationManager({ lab }: { lab: CurtainLab }) {
  return (
    <section
      className="observation-manager"
      aria-label="Investigation observations"
    >
      <label>
        Observation
        <select
          value={lab.activeId}
          onChange={(e) => lab.activateSnapshot(e.target.value)}
        >
          {lab.currentSnapshots.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
              {s.id === lab.itemTestBaseline.id ? " · original baseline" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Name
        <input
          maxLength={100}
          value={lab.activeSnapshot.name}
          onChange={(e) => lab.editSnapshot("name", e.target.value)}
        />
      </label>
      <button
        disabled={
          !!(
            lab.factError ||
            lab.summaryError ||
            lab.ppError ||
            lab.analysisError ||
            lab.analysisBusy ||
            lab.drawingInProgress
          ) || lab.currentSnapshots.length >= 100
        }
        onClick={() => lab.addObservation()}
      >
        Add observation
      </button>
      <button
        disabled={
          !lab.canRemoveObservation ||
          !!(
            lab.factError ||
            lab.summaryError ||
            lab.ppError ||
            lab.analysisError ||
            lab.analysisBusy ||
            lab.drawingInProgress
          )
        }
        onClick={lab.removeObservation}
      >
        Remove observation
      </button>
      <details>
        <summary>Notes and snapshot comparison</summary>
        <label>
          What changed?
          <textarea
            maxLength={10000}
            value={lab.activeSnapshot.notes}
            onChange={(e) => lab.editSnapshot("notes", e.target.value)}
          />
        </label>
        <p>
          PID, IVs and original trainer identity are shared. Every drawing and
          mutable field belongs to its observation. New generic observations
          start with mutable fields unknown.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Observation</th>
                <th>Observed pixels</th>
                <th>Held item</th>
                <th>EXP</th>
                <th>EVs</th>
                <th>PP</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {lab.currentSnapshots.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.observations.filter((n) => n !== -1).length}/192</td>
                  <td>{s.knownFacts.heldItem ?? "Unknown"}</td>
                  <td>{s.knownFacts.experience ?? "Unknown"}</td>
                  <td>
                    {s.knownFacts.evs?.map((v) => v ?? "?").join(" / ") ??
                      "Unknown"}
                  </td>
                  <td>
                    {s.knownFacts.pp?.map((v) => v ?? "?").join(" / ") ??
                      "Unknown"}
                  </td>
                  <td>{s.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function InvestigationResults({ lab }: { lab: CurtainLab }) {
  const [itemQuery, setItemQuery] = useState(""),
    [showAll, setShowAll] = useState(false),
    [trialSid, setTrialSid] = useState("");
  const analysis = lab.sidAnalysis,
    recovery = isRecorded(lab.activeSnapshot) ? lab.recovery : null;
  const useful = lab.experiments.filter(
    (e) =>
      e.groups > 1 &&
      e.item.id !== lab.activeSnapshot.knownFacts.heldItem &&
      e.item.name.toLowerCase().includes(itemQuery.toLowerCase()),
  );
  const recommendations = showAll ? useful : useful.slice(0, 8);
  const savedTest = lab.activeSnapshot.itemTest
    ? lab.activeSnapshot
    : lab.activeId === lab.itemTestBaseline.id
      ? lab.lastCompletedItemTest
      : undefined;
  const rngPids = lab.wildRng.result
    ? [...new Set(lab.wildRng.result.spreads.map((s) => s.pid))]
    : null;
  const targets = lab.activeSnapshot.targets ?? [];
  const tryDiagnostic = () => {
    if (
      !/^\d+$/.test(trialSid) ||
      Number(trialSid) > 65535 ||
      lab.identity.pid === undefined ||
      lab.identity.tid === undefined
    )
      return "Enter a known PID, TID and a trial SID (0–65535).";
    const h = makeHypothesis(
      lab.identity.pid,
      lab.identity.tid,
      Number(trialSid),
    );
    return (
      lab.currentSnapshots
        .map((s) => diagnoseHypothesis(lab.identity, s, h))
        .filter(Boolean)
        .join(" ") ||
      "Compatible with every snapshot under the stated model; identity is not proven."
    );
  };
  return (
    <section className="investigation-results">
      <h2>Investigation findings</h2>
      {lab.factError || lab.summaryError ? (
        <p role="alert">Correct invalid input before interpreting results.</p>
      ) : (
        <>
          <p>
            <strong>PID:</strong>{" "}
            {lab.facts.pid !== undefined
              ? `${lab.facts.pid} · Known`
              : lab.rngActive
                ? rngPids
                  ? `${rngPids.length} compatible within the active encounter RNG scope${rngPids.length === 1 ? ` · ${rngPids[0]} derived` : ""}`
                  : "Encounter RNG search pending; no PID selected"
                : lab.investigationInference.pidCount === 1n
                  ? `${lab.investigationInference.pidValues?.[0]} · Derived`
                  : `${lab.investigationInference.pidCount.toLocaleString()} compatible with the saved observations and facts`}
            . <strong>Evidence:</strong>{" "}
            {(lab.facts.assumed?.length ?? 0)
              ? `${lab.facts.assumed!.length} assumptions active; derived results depend on them.`
              : "No fresh-catch defaults active."}
          </p>
          {!analysis ? (
            <p>
              {lab.rngActive
                ? "Encounter RNG results feed joint recovery automatically. Enter the original trainer TID if missing; wait for the search to finish or resolve the search message above."
                : lab.identity.tid !== undefined &&
                    lab.identity.sid !== undefined
                  ? "Known TID and SID let pixel experiments narrow the XOR key and PID directly, even with millions of possibilities. RNG limits are optional. Counts remain stored-data bounds until joint validation is possible."
                  : "The original trainer TID enables joint PID/SID, XOR-key and permutation experiments even when PID and SID are unknown. Encounter and new-game SID RNG limits are optional. Broad counts are conservative bounds."}
            </p>
          ) : (
            <>
              <p role="status">
                <strong>Original trainer SID:</strong>{" "}
                {analysis.sidValues.length.toLocaleString()} compatible values;{" "}
                {analysis.candidates.length.toLocaleString()}{" "}
                {lab.hypothesisLabel} across{" "}
                {lab.currentSnapshots.filter(isRecorded).length} saved
                observations.{" "}
                {analysis.sidValues.length === 1
                  ? `Derived SID: ${analysis.sidValues[0]} - 0x${hex(analysis.sidValues[0], 4)}.`
                  : "No unique SID established."}
              </p>
              <p className="help">{analysis.model}</p>
              {analysis.candidates.length === 0 && (
                <p role="alert">
                  No compatible PID/SID pair survives every snapshot. Recheck
                  copied mutable facts, assumptions, drawing accuracy and
                  snapshot refresh. Use the candidate diagnostics below to
                  locate a contradiction.
                </p>
              )}
              <details>
                <summary>Compatible SID list and elimination counts</summary>
                <textarea
                  readOnly
                  aria-label="Compatible SID list"
                  value={analysis.sidValues.join(", ")}
                />
                <button
                  onClick={() =>
                    download(
                      "compatible-sids.txt",
                      new Blob([analysis.sidValues.join("\n")], {
                        type: "text/plain",
                      }),
                    )
                  }
                >
                  Export SID list
                </button>
                {analysis.eliminated.map((s) => (
                  <p key={s.id}>
                    {s.name}: {s.count.toLocaleString()} hypotheses first
                    rejected here
                    {lab.rngActive ? " after key-domain filtering" : ""}.
                  </p>
                ))}
              </details>
              {analysis.candidates.length === 1 && (
                <p>
                  <strong>Derived OTID:</strong> 0x
                  {hex(analysis.candidates[0].otId, 8)} ·{" "}
                  <strong>Encryption key:</strong> 0x
                  {hex(analysis.candidates[0].key, 8)}
                </p>
              )}
              {recovery && (
                <>
                  <RecoveredSummary lab={lab} />
                  {lab.origin === "wild" &&
                    (lab.facts.growthPadding === undefined ||
                      lab.facts.ribbonTail === undefined ||
                      lab.facts.headerPadding === undefined) && (
                      <p className="help">
                        For an ordinary, unmodified Emerald wild catch, the
                        remaining Growth filler and unused/fateful bits normally
                        start at zero. Apply these explicitly as assumptions to
                        finish the secure data and calculate its checksum.
                        <button
                          type="button"
                          onClick={lab.applyWildStorageDefaults}
                        >
                          Use normal wild-catch storage defaults
                        </button>
                      </p>
                    )}
                  {lab.facts.nickname &&
                    recovery.bytes.slice(8, 18).some((b) => b === null) && (
                      <p className="help">
                        The visible nickname does not specify memory after its
                        end marker. Those trailing bytes can contain leftover
                        data; they are not automatically zero or 0xFF. The
                        secure-data checksum does not cover the nickname.
                      </p>
                    )}
                  <p>
                    <strong>80-byte record:</strong> {recovery.exactByteCount}{" "}
                    exact bytes under active constraints. Remaining bytes retain
                    their full allowed domains.{" "}
                    {recovery.checksumInvalid
                      ? "Exact bytes fail the checksum; export is blocked."
                      : recovery.record
                        ? "All bytes exact and checksum verified."
                        : "Full recovery is not yet established."}
                  </p>
                  <details>
                    <summary>Per-byte evidence and uncertainty</summary>
                    <p>
                      Exact values are conditional on supplied facts and
                      assumptions. These domains project the compatible
                      hypotheses; values at different bytes may be correlated.
                    </p>
                    <textarea
                      readOnly
                      aria-label="Joint encrypted record constraints"
                      value={constraintHex(recovery.masks)}
                    />
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Offset</th>
                            <th>Domain</th>
                            <th>Evidence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recovery.bytes.map((byte, i) => {
                            const lo = allowedValues(recovery.masks[i * 2]),
                              hi = allowedValues(recovery.masks[i * 2 + 1]);
                            return (
                              <tr key={i}>
                                <td>0x{hex(i)}</td>
                                <td>
                                  {byte !== null
                                    ? hex(byte)
                                    : `${lo.length * hi.length} possibilities · low ${lo.map((v) => hex(v, 1)).join("")} / high ${hi.map((v) => hex(v, 1)).join("")}`}
                                </td>
                                <td>
                                  {byte !== null
                                    ? "Exact under constraints"
                                    : lo.length === 16 && hi.length === 16
                                      ? "Unknown"
                                      : "Restricted"}
                                  {lab.facts.assumed?.length
                                    ? " · may depend on assumptions"
                                    : ""}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  {recovery.record && (
                    <div className="inline-buttons">
                      <button
                        onClick={() =>
                          download(
                            "recovered.ek3",
                            new Blob([Uint8Array.from(recovery.record!)], {
                              type: "application/octet-stream",
                            }),
                          )
                        }
                      >
                        Export exact .ek3
                      </button>
                      <button
                        onClick={() =>
                          download(
                            "recovered-hex.txt",
                            new Blob([recordHex(recovery.record!)], {
                              type: "text/plain",
                            }),
                          )
                        }
                      >
                        Export exact hex
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <details>
            <summary>Candidate diagnostics</summary>
            <p>
              Test a suspected SID without adding it as a fact. Contradictions
              depend on the entered facts and drawing, not on an assumed
              encounter time.
            </p>
            <label>
              Trial SID
              <input
                inputMode="numeric"
                value={trialSid}
                onChange={(e) => setTrialSid(e.target.value)}
              />
            </label>
            {trialSid && <p>{tryDiagnostic()}</p>}
          </details>
        </>
      )}
      {targets.length > 0 && (
        <details className="target-pixels">
          <summary>Advanced: inspect individual target pixels</summary>
          <p>
            Orange outlines locate these pixels in the Curtain Editor. Each
            answer records an independent in-game observation. “Cannot
            determine” leaves it unknown.
          </p>
          {targets.map((index) => (
            <label key={index}>
              Byte 0x{hex(Math.floor((index - 16) / 2))},{" "}
              {(index - 16) % 2 ? "high" : "low"} nibble (pixel {index})
              <select
                value={lab.obs[index]}
                onChange={(e) =>
                  lab.observePixel(index, Number(e.target.value) as -1 | 0 | 1)
                }
              >
                <option value={-1}>Cannot determine</option>
                <option value={0}>Transparent</option>
                <option value={1}>Black</option>
              </select>
            </label>
          ))}
        </details>
      )}
      <section className="next-item-experiments">
        <h3>Best next experiments</h3>
        <p role="status">
          {lab.analysisBusy
            ? "Analysis still running; recommendations will update when it finishes."
            : lab.analysisError
              ? "Analysis could not complete. Resolve the computation message above."
              : lab.experimentStatus === "inconsistent"
                ? "Supplied observations or active RNG constraints are inconsistent. Resolve the conflicts before performing another experiment."
                : lab.experimentStatus === "available"
                  ? "Experiments available. They can discover block position and key digits while narrowing joint PID/SID possibilities. A test can rule out SID/key combinations while the distinct PID and SID counts stay unchanged."
                  : lab.experimentStatus === "insufficient-information"
                    ? "Insufficient known information: enter the original trainer TID to predict joint identity experiments reliably."
                    : lab.experimentStatus === "computation-limited"
                      ? "The solver could not rank experiments within the current computation scope. Add verified observations or narrow the optional search."
                      : "No evaluated supported experiment distinguishes the remaining possibilities under the current model. More known data may enable predictions: vitamins need EVs; PP Up / PP Max need moves and packed PP Up counters; Pokéblocks need Nature, contest values and flavors. Other actions and uncertain side effects are not modeled."}
        </p>
        {lab.experimentLimitations?.map((message) => (
          <p className="help" key={message}>
            {message}
          </p>
        ))}
        <p>
          Every test starts from the original Pokémon and drawing. After
          recording, the drawing resets automatically; restore the Pokémon
          in-game as instructed. For consumable tests, make a baseline save and
          reload it afterwards.
        </p>
        <PokeblockExperiment key={lab.itemTestBaseline.id} lab={lab} />
        {(lab.experiments.some((e) => e.groups > 1) ||
          lab.controlledExperiments.some((e) => e.groups > 1)) && (
          <ol className="investigation-cards">
            {[
              ...lab.experiments
                .filter(
                  (e) =>
                    e.groups > 1 &&
                    e.item.id !== lab.itemTestBaseline.knownFacts.heldItem,
                )
                .map((e) => ({
                  key: `item-${e.item.id}`,
                  name: `Hold ${e.item.name}`,
                  worstCase: e.worstCase,
                  informationGain: e.informationGain,
                  groups: e.groups,
                  cost: 1,
                  checksumContributes: e.checksumContributes,
                  select: () => lab.startItemTest(e.item.id),
                })),
              ...lab.controlledExperiments
                .filter((e) => e.groups > 1)
                .map((e) => ({
                  key: e.action.id,
                  name: e.action.name,
                  worstCase: e.worstCase,
                  informationGain: e.informationGain,
                  groups: e.groups,
                  cost: e.action.cost ?? 1,
                  checksumContributes: e.checksumContributes,
                  select: () => lab.startControlledTest(e.action.id),
                })),
            ]
              .sort(
                (a, b) =>
                  a.worstCase - b.worstCase ||
                  b.informationGain - a.informationGain ||
                  a.cost - b.cost,
              )
              .slice(0, 6)
              .map((e, i) => (
                <li className="investigation-card" key={e.key}>
                  <h4>
                    {i + 1}. {e.name}
                  </h4>
                  <button
                    disabled={
                      !!lab.pendingItemTest ||
                      !!(
                        lab.factError ||
                        lab.summaryError ||
                        lab.ppError ||
                        lab.analysisError ||
                        lab.analysisBusy ||
                        lab.drawingInProgress
                      )
                    }
                    onClick={e.select}
                  >
                    Try {e.name}
                  </button>
                  <small>
                    {e.groups} patterns · worst case{" "}
                    {lab.domainQuestions[e.key] && "at most "}
                    {e.worstCase.toLocaleString()}{" "}
                    {lab.domainQuestions[e.key]?.countBasis ?? "hypotheses"}
                    {lab.domainQuestions[e.key]
                      ? lab.domainQuestions[e.key].combinedOutcomes ||
                        lab.domainQuestions[e.key].combinedChecksum
                        ? " · conservative combined bounds"
                        : " · conservative best-pixel bound; additional targets rechecked after each answer"
                      : ` · ${e.informationGain.toFixed(2)} bits (uniform identity / supported-outcome model)`}
                    {e.checksumContributes &&
                      " · Combined encrypted and checksum pixels improve this test."}
                  </small>
                  {lab.domainQuestions[e.key] && (
                    <details>
                      <summary>Why this experiment?</summary>
                      <DomainExplanation
                        question={lab.domainQuestions[e.key]}
                      />
                    </details>
                  )}
                </li>
              ))}
          </ol>
        )}
        <details>
          <summary>
            Move learning, swaps, Rare Candy, vitamin, PP and Pokéblock
            experiments
          </summary>
          <p>
            These tests use the original moves, current level and EVs. Move
            swaps carry PP and PP Ups. With a known empty slot, compatible
            TMs/HMs and learning followed by a move swap are evaluated together.
            Rare Candy also checks the next automatic move-learning level,
            including the required EXP and PP changes. Vitamins require all six
            original EVs. Every compatible block order is considered when
            choosing useful target pixels.
          </p>
          {lab.controlledExperiments
            .filter((e) => e.groups > 1)
            .map((e) => (
              <article className="investigation-card" key={e.action.id}>
                <h4>{e.action.name}</h4>
                <p>{e.action.instructions}</p>
                <p>{e.action.restore}</p>
                <DomainExplanation
                  question={lab.domainQuestions[e.action.id]}
                />
                <p>
                  {e.groups} patterns; worst case{" "}
                  {lab.domainQuestions[e.action.id] && "at most "}
                  {e.worstCase.toLocaleString()} compatible{" "}
                  {lab.domainQuestions[e.action.id]?.countBasis ?? "hypotheses"}{" "}
                  remain.
                  {e.checksumContributes &&
                    " Combined encrypted and checksum pixels eliminate additional identities."}
                </p>
                <button
                  disabled={
                    !!lab.pendingItemTest ||
                    !!(
                      lab.factError ||
                      lab.summaryError ||
                      lab.ppError ||
                      lab.analysisError ||
                      lab.analysisBusy ||
                      lab.drawingInProgress
                    )
                  }
                  onClick={() => lab.startControlledTest(e.action.id)}
                >
                  Try {e.action.name}
                </button>
              </article>
            ))}
          {!lab.controlledExperiments.some((e) => e.groups > 1) && (
            <p>
              No informative supported controlled test is established by the
              current facts and candidate set. Check the original trainer TID,
              known moves and level. Unknown EVs prevent vitamin predictions,
              but do not prevent move or eligible Rare Candy tests. PP tests
              require known counters and eligible moves; Pokéblocks require
              known Nature, contest values and entered flavors. Unknown
              friendship side effects disable linked checksum predictions, while
              predictable encrypted fields can still be tested.
            </p>
          )}
        </details>
        {!lab.analysisBusy &&
          !lab.analysisError &&
          !lab.pendingItemTest &&
          lab.experimentStatus === "indistinguishable" &&
          lab.identity.tid !== undefined &&
          lab.identity.sid === undefined && (
            <section className="investigation-card">
              <h4>Try another Pokémon from the same original trainer</h4>
              <p>
                Save this investigation first. Catch another Pokémon with the
                same original trainer and TID, then start a separate
                investigation for it. Its SID is shared; its PID, XOR key and
                block order must be deduced from that Pokémon’s own known
                information and observations.
              </p>
              <p>
                Record clearly transparent encrypted-data pixels and their black
                neighbors. Once its details are entered, use the highlighted
                useful questions to narrow its candidates and compare the
                surviving SIDs with this investigation. A specific
                discriminating pixel cannot be predicted before those details
                are known.
              </p>
            </section>
          )}
        <h3>Best items to try next</h3>
        {savedTest?.itemTest?.phase === "recorded" && (
          <p role="status">
            <strong>{savedTest.name} saved separately.</strong>{" "}
            <ExperimentProgress lab={lab} snapshotId={savedTest.id} />
          </p>
        )}
        <p>
          Choose an item, perform the test, then answer black or transparent for
          the highlighted useful pixels. Each verified answer updates the
          candidates and next recommendations. Unexamined pixels stay unknown.
        </p>
        <label>
          Find an item
          <input
            type="search"
            value={itemQuery}
            onChange={(e) => setItemQuery(e.target.value)}
            placeholder="REPEL, ASPEAR BERRY…"
          />
        </label>
        {lab.pendingItemTest ? (
          <p>
            Finish the current item test above to update these recommendations.
          </p>
        ) : !analysis && !Object.keys(lab.domainQuestions).length ? (
          <p>
            {lab.rngActive
              ? "Item recommendations appear when the encounter RNG search finishes with compatible hypotheses and the original trainer TID is entered."
              : "Joint experiments use the original trainer TID and saved observations. PID and SID may remain unknown. See the experiment status above for missing facts, conflicts or indistinguishable outcomes."}
          </p>
        ) : !useful.length ? (
          <p>
            {itemQuery
              ? "No useful items match that search."
              : "No supported held item currently distinguishes the remaining possibilities. Try the move or EXP experiments above, or add verified information."}
          </p>
        ) : (
          <>
            <p className="help">
              Choose whichever listed item is practical for you. Key items,
              Safari Balls, placeholders and Mail tests are excluded. No item is
              assumed to be in your Bag.
            </p>
            <ol className="experiment-list">
              {recommendations.map((e, index) => {
                const equivalent = useful.filter(
                  (other) =>
                    other.item.id !== e.item.id &&
                    other.signature === e.signature,
                );
                return (
                  <li className="investigation-card" key={e.item.id}>
                    <h4>
                      {index + 1}. {e.item.name}
                    </h4>
                    <button
                      disabled={
                        !!(
                          lab.factError ||
                          lab.summaryError ||
                          lab.ppError ||
                          lab.analysisError ||
                          lab.analysisBusy ||
                          lab.drawingInProgress
                        )
                      }
                      onClick={() => lab.startItemTest(e.item.id)}
                    >
                      Try {e.item.name}
                    </button>
                    <details>
                      <summary>Why this item?</summary>
                      <p>
                        {e.groups} possible pixel patterns; worst case{" "}
                        {lab.domainQuestions[`item-${e.item.id}`] && "at most "}
                        {e.worstCase.toLocaleString()} compatible hypotheses
                        remain.
                      </p>
                      {lab.domainQuestions[`item-${e.item.id}`] ? (
                        <DomainExplanation
                          question={lab.domainQuestions[`item-${e.item.id}`]}
                        />
                      ) : (
                        <p>
                          Expected survivors {e.expectedRemaining.toFixed(1)};
                          information gain {e.informationGain.toFixed(2)} bits,
                          using a uniform prior over remaining hypotheses.
                          Ranked by worst-case survivors, then information gain.{" "}
                          {e.effort}
                        </p>
                      )}
                      {e.questions?.map((q) => (
                        <p key={q.index}>
                          Byte 0x{hex(Math.floor((q.index - 16) / 2))},{" "}
                          {q.index % 2 ? "high" : "low"} digit: transparent
                          confirms XOR-key digit {q.keyDigit} ={" "}
                          {hex(q.digit, 1)} (
                          {q.transparentCount.toLocaleString()} hypotheses);{" "}
                          black excludes {hex(q.digit, 1)} (
                          {q.blackCount.toLocaleString()} hypotheses). Remaining
                          digits: {q.values.map((v) => hex(v, 1)).join(", ")}.
                        </p>
                      ))}
                      {!!e.questions?.length && (
                        <small>XOR-key digit 0 is the rightmost digit.</small>
                      )}
                      {e.checksumQuestions.map((q) => (
                        <p key={q.index}>
                          Checksum byte 0x{hex(Math.floor((q.index - 16) / 2))},{" "}
                          {q.index % 2 ? "high" : "low"} digit: transparent
                          retains {q.transparentCount.toLocaleString()}{" "}
                          hypotheses; black retains{" "}
                          {q.blackCount.toLocaleString()}. These compatible sets
                          can overlap when checksum values are unknown. Inspect
                          together with the other highlighted pixels.
                        </p>
                      ))}
                      {equivalent.length > 0 && (
                        <p>
                          Equivalent tests:{" "}
                          {equivalent
                            .map((other) => other.item.name)
                            .join(", ")}
                          .
                        </p>
                      )}
                    </details>
                  </li>
                );
              })}
            </ol>
            <button onClick={() => setShowAll(!showAll)}>
              {showAll
                ? "Show best eight"
                : `Browse all ${useful.length} useful items`}
            </button>
          </>
        )}
      </section>
    </section>
  );
}

function RecoveredSummary({ lab }: { lab: CurtainLab }) {
  const recovery = lab.recovery;
  if (!recovery || !lab.sidAnalysis?.candidates.length) return null;
  const fields: {
    name: string;
    offset: number;
    size: number;
    known?: number | null;
    key: string;
  }[] = [
    {
      name: "Species ID",
      offset: 0,
      size: 2,
      known: lab.facts.species,
      key: "species",
    },
    {
      name: "Held item ID",
      offset: 2,
      size: 2,
      known: lab.facts.heldItem,
      key: "heldItem",
    },
    {
      name: "Experience",
      offset: 4,
      size: 4,
      known: lab.facts.experience,
      key: "experience",
    },
    {
      name: "PP Ups byte",
      offset: 8,
      size: 1,
      known: lab.facts.ppBonuses,
      key: "ppBonuses",
    },
    {
      name: "Friendship",
      offset: 9,
      size: 1,
      known: lab.facts.friendship,
      key: "friendship",
    },
    ...Array.from({ length: 4 }, (_, i) => ({
      name: `Move ${i + 1} ID`,
      offset: 12 + i * 2,
      size: 2,
      known: lab.facts.moves?.[i],
      key: `move_${i}`,
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      name: `Move ${i + 1} PP`,
      offset: 20 + i,
      size: 1,
      known: lab.facts.pp?.[i],
      key: `pp_${i}`,
    })),
    ...["HP", "Attack", "Defense", "Speed", "Sp. Attack", "Sp. Defense"].map(
      (name, i) => ({
        name: `${name} EV`,
        offset: 24 + i,
        size: 1,
        known: lab.facts.evs?.[i],
        key: `ev_${i}`,
      }),
    ),
    ...["Cool", "Beauty", "Cute", "Smart", "Tough", "Sheen"].map((name, i) => ({
      name,
      offset: 30 + i,
      size: 1,
      known: lab.facts.contest?.[i],
      key: `contest_${i}`,
    })),
    {
      name: "Pokérus byte",
      offset: 36,
      size: 1,
      known: lab.facts.pokerus,
      key: "pokerus",
    },
    {
      name: "Met location ID",
      offset: 37,
      size: 1,
      known: lab.facts.metLocation,
      key: "metLocation",
    },
    { name: "Origins packed word", offset: 38, size: 2, key: "origins" },
    {
      name: "IVs / Egg / ability packed word",
      offset: 40,
      size: 4,
      key: "ivs",
    },
    {
      name: "Ribbons / flags packed word",
      offset: 44,
      size: 4,
      key: "ribbonsWord",
    },
  ];
  const keyDigits = Array.from({ length: 8 }, (_, n) => {
    const values = new Set(
      lab.sidAnalysis!.candidates.map((h) => (h.key >>> (n * 4)) & 15),
    );
    return values.size === 1 ? hex([...values][0], 1) : "?";
  })
    .reverse()
    .join("");
  return (
    <details>
      <summary>Recovered fields · current observation</summary>
      <p>
        <strong>Encryption key:</strong> 0x{keyDigits}. Unknown digits remain ?.
        Non-exact field counts below are upper bounds from nibble projections;
        fields and bytes may be correlated. Derived values may depend on active
        assumptions.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Value / possibilities</th>
              <th>Evidence status</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const result = summarizeField(
                recovery.plaintext,
                field.offset,
                field.size,
              );
              const known = field.known !== undefined && field.known !== null;
              const status = known
                ? lab.facts.assumed?.includes(field.key)
                  ? "Assumed"
                  : "Known"
                : result.exact !== null
                  ? "Derived"
                  : result.count === 16n ** BigInt(field.size * 2)
                    ? "Unknown"
                    : "Derived bounds";
              return (
                <tr key={field.key}>
                  <td>{field.name}</td>
                  <td>
                    {result.exact !== null
                      ? result.exact.toString()
                      : `≤ ${result.count.toLocaleString()} values · 0x${result.hex}`}
                  </td>
                  <td>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        Individual IV ranges and packed ability/origins fields are also
        available in advanced data recovery below. Those legacy views analyze
        the active observation; the joint byte domains above include every
        snapshot.
      </p>
    </details>
  );
}
