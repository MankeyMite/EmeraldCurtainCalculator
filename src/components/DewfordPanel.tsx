import { useEffect, useMemo, useState } from "react";
import type { CurtainLab } from "../hooks/useCurtainLab";
import { DEFAULT_SID_RNG } from "../core/sidRng";
import {
  DEWFORD_WORDS,
  answerDewfordTest,
  phraseKey,
  phraseName,
  rankDewfordTests,
  searchDewford,
  validateDewfordPhrase,
  type DewfordEvidence,
  type DewfordPhrase,
} from "../core/dewford";

function PhraseInputs({
  value,
  onChange,
  prefix,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  prefix: string;
}) {
  return (
    <div className="timing-inputs">
      {[
        DEWFORD_WORDS.conditions,
        [...DEWFORD_WORDS.lifestyle, ...DEWFORD_WORDS.hobbies],
      ].map((words, index) => (
        <label key={index}>
          {index === 0 ? "Conditions word" : "Lifestyle / Hobbies word"}
          <select
            aria-label={`${prefix} word ${index + 1}`}
            value={value[index]}
            onChange={(e) =>
              onChange(value.map((v, n) => (n === index ? e.target.value : v)))
            }
          >
            <option value="">Select word</option>
            {words
              .slice()
              .sort((a, b) => a.text.localeCompare(b.text))
              .map((w) => (
                <option key={w.id} value={w.id}>
                  {w.text}
                </option>
              ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export function DewfordPanel({ lab }: { lab: CurtainLab }) {
  const settings = lab.sidRngSettings ?? DEFAULT_SID_RNG,
    saved = lab.sidRngSettings?.dewford;
  const evidence = saved?.enabled === false ? undefined : saved;
  const [phrase, setPhrase] = useState(
    saved?.currentPhrase.map(String) ?? ["", ""],
  );
  const [history, setHistory] = useState(saved ? "original" : "");
  const [gap, setGap] = useState([
    String(saved?.minGap ?? 3),
    String(saved?.maxGap ?? 3),
  ]);
  const [manual, setManual] = useState(["", ""]),
    [error, setError] = useState("");
  const inputKey = JSON.stringify([
    saved?.currentPhrase,
    saved?.minGap,
    saved?.maxGap,
  ]);
  useEffect(() => {
    setPhrase(saved?.currentPhrase.map(String) ?? ["", ""]);
    setGap([String(saved?.minGap ?? 3), String(saved?.maxGap ?? 3)]);
    setHistory(saved ? "original" : "");
    setManual(["", ""]);
    setError("");
  }, [inputKey, lab.activeId]);
  const signature = JSON.stringify({ tid: lab.facts.tid, settings });
  const research = useMemo(() => {
    if (!evidence || lab.facts.tid === undefined)
      return { cases: [], error: "" };
    try {
      return {
        cases: searchDewford(
          lab.facts.tid,
          settings.minAdvance,
          settings.maxAdvance,
          evidence,
        ),
        error: "",
      };
    } catch (e) {
      return { cases: [], error: (e as Error).message };
    }
  }, [signature]);
  const compatible = lab.sidRngResult?.rows;
  const alive = compatible ? new Set(compatible.map((r) => r.sid)) : null;
  const cases = research.cases.filter((c) => !alive || alive.has(c.sid));
  const tests = rankDewfordTests(cases);
  const ready =
    !!lab.sidRngResult &&
    !lab.sidRngBusy &&
    !lab.sidRngError &&
    !research.error;
  const update = (next: DewfordEvidence) => {
    try {
      lab.setSidRngSettings({ ...settings, dewford: next });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const apply = () => {
    try {
      const currentPhrase = validateDewfordPhrase(phrase.map(Number));
      const samePhrase =
        saved && phraseKey(currentPhrase) === phraseKey(saved.currentPhrase);
      lab.setSidRngSettings({
        ...settings,
        dewford: {
          currentPhrase,
          enabled: true,
          tests: samePhrase ? saved.tests : [],
          ...(samePhrase && saved.pending ? { pending: saved.pending } : {}),
          minGap: Number(gap[0]),
          maxGap: Number(gap[1]),
        },
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const start = (phrase: DewfordPhrase) =>
    evidence && update({ ...evidence, pending: phrase });
  return (
    <details className="dewford-panel" open={!!saved}>
      <summary>Dewford trendy phrases · experimental SID filter</summary>
      <p>
        Emerald generates five phrases shortly after SID. An original phrase and
        carefully reset phrase tests can narrow the same TID-seeded SID
        candidates, together with your curtain.
      </p>
      <p className="micro">
        English stock Emerald. Read the phrase from the boy outside Dewford
        Hall. This does not require changing a Pokémon or knowing its PID. A
        working clock may reorder the five phrases; this filter checks
        membership in all five, not which is currently ranked first.
      </p>
      <label>
        Phrase history
        <select
          aria-label="Dewford phrase history"
          value={history}
          onChange={(e) => {
            setHistory(e.target.value);
            if (e.target.value !== "original" && evidence)
              update({ ...evidence, enabled: false });
          }}
        >
          <option value="">Choose history</option>
          <option value="original">
            Never changed the phrase or mixed records
          </option>
          <option value="changed">Changed / mixed records / unsure</option>
        </select>
      </label>
      {history === "changed" && (
        <p role="alert">
          Do not use first-submission tests on this save. Rejection may mean low
          trendiness instead of membership. Disable Dewford evidence if its
          original-history assumption does not hold.
        </p>
      )}
      <PhraseInputs
        prefix="Observed Dewford"
        value={phrase}
        onChange={setPhrase}
      />
      <details>
        <summary>Advanced initialization gap</summary>
        <p className="micro">
          Default: three intervening RNG calls after SID, then the first phrase
          starts on call SID + 4. This is the established community calibration.
          VBlank interruptions or modified ROMs can break it; no new emulator
          timing capture is claimed.
        </p>
        <div className="timing-inputs">
          {["Minimum", "Maximum"].map((label, i) => (
            <label key={label}>
              {label} intervening calls
              <input
                aria-label={`Dewford ${label.toLowerCase()} gap`}
                type="number"
                min={0}
                max={12}
                value={gap[i]}
                onChange={(e) =>
                  setGap(gap.map((v, n) => (n === i ? e.target.value : v)))
                }
              />
            </label>
          ))}
        </div>
        <p className="micro">
          At most five gap offsets and 100,000 SID advances per search. A wider
          gap covers uncertainty before generation, not interrupts between the
          five phrases.
        </p>
      </details>
      <button
        disabled={
          history !== "original" ||
          phrase.some((v) => !v) ||
          lab.facts.tid === undefined
        }
        onClick={apply}
      >
        {evidence
          ? "Update original phrase"
          : saved
            ? "Re-enable saved Dewford evidence"
            : "Use original phrase for SID search"}
      </button>
      <p className="micro">
        Uses public original-trainer TID {lab.facts.tid ?? "— enter TID first"}{" "}
        and SID calls {settings.minAdvance.toLocaleString()}–
        {settings.maxAdvance.toLocaleString()}. Change the timing window below
        if needed. Your Pokémon must belong to this same original trainer.
      </p>
      {(error || research.error) && (
        <p role="alert">{error || research.error}</p>
      )}
      {saved?.enabled === false && (
        <p className="micro">
          Dewford evidence is disabled. Its phrase and recorded answers are
          retained; the result currently uses the timing window and
          Pokémon/curtain evidence only.
        </p>
      )}
      {evidence && (
        <>
          <div className="inline-buttons">
            <button onClick={() => update({ ...evidence, enabled: false })}>
              Disable Dewford evidence
            </button>
          </div>
          <p>
            <strong>{new Set(research.cases.map((c) => c.sid)).size}</strong>{" "}
            distinct SIDs match the phrase evidence before curtain checks.{" "}
            {compatible
              ? `${compatible.length} remain after the current joint checks.`
              : "Joint curtain checks are pending."}
          </p>
          {!research.cases.length && (
            <p role="alert">
              No initial phrase set matches. Widen the SID window, review
              phrase/history/gap assumptions, or disable Dewford evidence. No
              candidate is independently verified by this model alone.
            </p>
          )}
          <div className="dewford-baseline">
            <strong>Before every test: load the same baseline save.</strong>
            <ol>
              <li>
                Keep a save from before any successful phrase change or record
                mixing.
              </li>
              <li>
                Tell the boy “No” about the current trend, then submit the exact
                two recommended words.
              </li>
              <li>
                Record whether he accepted your submitted phrase as the new
                trend.
              </li>
              <li>
                Reset without saving and reload that baseline before testing
                again, even after rejection.
              </li>
            </ol>
            <p className="micro">
              Accepted = absent from the original five. Rejected = present, only
              under these first-submission conditions. Do not overwrite the
              baseline save. Your curtain drawing stays as it was.
            </p>
          </div>
          {evidence.pending ? (
            <div className="dewford-question">
              <h4>Test: {phraseName(evidence.pending)}</h4>
              <p>Did he accept this phrase as the new trend?</p>
              <div className="inline-buttons">
                <button
                  disabled={history !== "original"}
                  onClick={() => update(answerDewfordTest(evidence, true))}
                >
                  Yes · accepted
                </button>
                <button
                  disabled={history !== "original"}
                  onClick={() => update(answerDewfordTest(evidence, false))}
                >
                  No · rejected
                </button>
                <button
                  onClick={() => {
                    const { pending: _cancelled, ...rest } = evidence;
                    update(rest);
                  }}
                >
                  Cancel phrase test
                </button>
              </div>
              <p className="micro">
                After recording, reload your baseline in-game. This pending test
                adds no constraint until you answer.
              </p>
            </div>
          ) : (
            <>
              <h4>Best phrases to test next</h4>
              {!ready ? (
                <p className="micro">
                  Waiting for the current SID / curtain intersection before
                  ranking tests.
                </p>
              ) : tests.length ? (
                <div className="dewford-recommendations">
                  {tests.slice(0, 6).map((t) => (
                    <div key={phraseKey(t.phrase)}>
                      <strong>{phraseName(t.phrase)}</strong>
                      <small>
                        If accepted: {t.acceptedSids} SIDs · if rejected:{" "}
                        {t.rejectedSids} SIDs
                      </small>
                      <button
                        disabled={history !== "original"}
                        onClick={() => start(t.phrase)}
                      >
                        Test {phraseName(t.phrase)}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="micro">
                  No phrase membership test separates the remaining SIDs. Verify
                  a unique result independently, or use curtain/Pokémon evidence
                  to narrow the remaining ambiguity.
                </p>
              )}
              <details>
                <summary>Test another phrase</summary>
                <PhraseInputs
                  prefix="Custom Dewford test"
                  value={manual}
                  onChange={setManual}
                />
                <button
                  disabled={manual.some((v) => !v) || history !== "original"}
                  onClick={() =>
                    start(validateDewfordPhrase(manual.map(Number)))
                  }
                >
                  Start custom phrase test
                </button>
              </details>
            </>
          )}
          {!!evidence.tests.length && (
            <details open>
              <summary>Recorded phrase tests ({evidence.tests.length})</summary>
              <ul>
                {evidence.tests.map((t, i) => (
                  <li key={phraseKey(t.phrase)}>
                    {phraseName(t.phrase)} ·{" "}
                    {t.present ? "rejected / present" : "accepted / absent"}{" "}
                    <button
                      aria-label={`Remove phrase test ${phraseName(t.phrase)}`}
                      onClick={() =>
                        update({
                          ...evidence,
                          tests: evidence.tests.filter((_, n) => n !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <details>
            <summary>Compatible initial phrase sets</summary>
            {cases.slice(0, 30).map((c) => (
              <p key={`${c.advance}/${c.gap}`} className="micro">
                <strong>
                  SID {c.sid} · call {c.advance} · gap {c.gap}
                </strong>
                <br />
                {c.trends.map((t) => phraseName(t.phrase)).join(" / ")}
              </p>
            ))}
            {cases.length > 30 && (
              <p className="micro">
                Showing 30 of {cases.length} compatible advance/gap cases. All
                cases enter filtering and ranking.
              </p>
            )}
          </details>
        </>
      )}
      <p className="micro">
        Research credit:{" "}
        <a
          href="https://www.reddit.com/r/pokemonrng/comments/16ei2ej/"
          target="_blank"
          rel="noreferrer"
        >
          maractite’s Dewford SID method
        </a>
        ,{" "}
        <a
          href="https://github.com/Goppier/FindingFeebas"
          target="_blank"
          rel="noreferrer"
        >
          Goppier’s FindingFeebas
        </a>{" "}
        and{" "}
        <a
          href="https://github.com/pret/pokeemerald/blob/731ad5bfd6e6f265508d0efcca0ba42f9dcf5881/src/dewford_trend.c"
          target="_blank"
          rel="noreferrer"
        >
          pret’s trend routines
        </a>
        . Independent implementation; timing assumptions remain experimental
        here.
      </p>
    </details>
  );
}
