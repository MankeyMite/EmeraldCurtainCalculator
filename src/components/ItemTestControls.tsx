import type { CurtainLab } from "../hooks/useCurtainLab";
import { ITEM_CATALOG } from "../core/experiments";

export function ItemTestControls({
  lab,
  openEditor,
  openResults,
}: {
  lab: CurtainLab;
  openEditor: () => void;
  openResults: () => void;
}) {
  const pending = lab.pendingItemTest;
  const active = lab.activeSnapshot;
  const baseline = lab.itemTestBaseline;
  const savedTest = active.itemTest
    ? active
    : active.id === baseline.id
      ? lab.lastCompletedItemTest
      : undefined;
  function showNextItems() {
    openResults();
    requestAnimationFrame(() =>
      document
        .querySelector("#panel-2 .next-item-experiments")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }
  if (!pending) {
    if (!savedTest?.itemTest) return null;
    return (
      <section className="item-test-status" role="status">
        <strong>{savedTest.name} saved separately.</strong>{" "}
        {savedTest.itemTest.changed
          ? "Updated drawing recorded."
          : "Unchanged pixels recorded for this test."}{" "}
        {active.id === baseline.id && (
          <>Original drawing “{baseline.name}” restored for the next test. </>
        )}
        {savedTest.itemTest.candidatesBefore !== undefined && lab.sidAnalysis
          ? `${savedTest.itemTest.candidatesBefore.toLocaleString()} → ${lab.sidAnalysis.candidates.length.toLocaleString()} ${lab.hypothesisLabel}.`
          : "Findings updated."}{" "}
        <p>
          {savedTest.itemTest.action?.restore ??
            "Restore the original held item (or remove the test item if none was originally held) before the next test. The app restores the drawing only."}
        </p>
        <button onClick={showNextItems}>Choose the next test</button>
      </section>
    );
  }
  if (pending.id !== active.id)
    return (
      <section className="item-test-status">
        <strong>{pending.name} is unfinished.</strong>
        <button
          onClick={() => {
            lab.activateSnapshot(pending.id);
            if (pending.itemTest!.phase === "editing") openEditor();
          }}
        >
          Continue item test
        </button>
      </section>
    );
  const item = ITEM_CATALOG.find((i) => i.id === active.knownFacts.heldItem);
  const action = active.itemTest!.action;
  const testName = action?.name ?? item?.name ?? "held item";
  const comparison = lab.currentSnapshots.find(
    (s) => s.id === active.itemTest!.sourceId,
  )!;
  const reference =
    comparison.id === baseline.id
      ? "original drawing"
      : "saved comparison drawing";
  const disabled = !!(lab.factError || lab.summaryError);
  return (
    <section
      id="current-item-test"
      className="item-test-status active-test"
      aria-label="Current item test"
    >
      <h2>Testing {testName}</h2>
      {active.itemTest!.phase === "question" ? (
        <>
          <p>
            {action ? (
              action.instructions
            ) : (
              <>
                Start with the original Pokémon state. Give{" "}
                <strong>{item?.name}</strong> to this Pokémon.
              </>
            )}{" "}
            Put it back in Box 8 slot 5, then leave and reenter the school.
            Compare its curtains with the{" "}
            <strong>
              {reference} “{comparison.name}”
            </strong>
            . Avoid battles and other changes.{" "}
            {action?.restore ??
              "After recording, restore the original held item before the next test."}
          </p>
          <h3>Did the pixels change compared with the {reference}?</h3>
          <div className="inline-buttons">
            <button
              disabled={disabled}
              onClick={() => {
                if (lab.reportItemChange(true)) openEditor();
              }}
            >
              Yes, edit differences from the {reference}
            </button>
            <button
              disabled={disabled}
              onClick={() => {
                if (lab.reportItemChange(false)) showNextItems();
              }}
            >
              No, matches the {reference}
            </button>
            <button onClick={lab.cancelItemTest}>Cancel test</button>
          </div>
          <p className="help">
            “No” records that this test matches “{comparison.name}”. Unreadable
            pixels remain unknown. The original drawing is restored after
            saving; this test is kept separately.
          </p>
        </>
      ) : (
        <>
          <p>
            The {reference} “{comparison.name}” is copied below. Edit only the
            differences you see for <strong>{testName}</strong>, then save this
            test. This draft does not affect the findings until saved.
          </p>
          <div className="inline-buttons">
            <button
              disabled={disabled}
              onClick={() => {
                if (lab.confirmItemTest()) showNextItems();
              }}
            >
              Save drawing &amp; analyze test
            </button>
            <button
              disabled={disabled}
              onClick={() => {
                if (lab.reportItemChange(false)) showNextItems();
              }}
            >
              Matches comparison drawing after all
            </button>
            <button onClick={openEditor}>Go to drawing</button>
            <button onClick={lab.cancelItemTest}>Cancel test</button>
          </div>
        </>
      )}
    </section>
  );
}
