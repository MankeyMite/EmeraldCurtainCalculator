import {
  generateSpindaCandidates,
  prepareSpindaCandidates,
  rankSpindaCandidates,
  type PreparedSpinda,
  type SpindaMatcherState,
  type SpindaMatch,
} from "./spindaMatcher";
import { spindaPattern } from "./spinda";

export type SpindaWorkerRequest =
  | { type: "generate"; state: SpindaMatcherState; pid: number }
  | { type: "rank"; pid: number };
export type SpindaWorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "preparing"; count: number }
  | { type: "result"; pid: number; matches: SpindaMatch[] }
  | { type: "error"; message: string };

/** A failed generation must not become a successful empty pool when another
 * rank request was queued during dragging. Only complete pools are ranked. */
export function createSpindaWorkerHandler(
  post: (data: SpindaWorkerResponse) => void,
) {
  let prepared: PreparedSpinda[] | null = null;
  return (data: SpindaWorkerRequest) => {
    try {
      if (data.type === "generate") {
        prepared = null;
        const candidates = generateSpindaCandidates(data.state, (done, total) =>
          post({ type: "progress", done, total }),
        );
        post({ type: "preparing", count: candidates.length });
        prepared = prepareSpindaCandidates(candidates);
      }
      if (!prepared) return;
      post({
        type: "result",
        pid: data.pid,
        matches: rankSpindaCandidates(prepared, spindaPattern(data.pid)),
      });
    } catch (error) {
      prepared = null;
      post({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
