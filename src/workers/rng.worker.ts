import { searchWild, type RngSearchInput } from "../core/rngSearch";
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RngSearchInput>) => void) | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const result = searchWild(data, (done, total) =>
      scope.postMessage({ type: "progress", done, total }),
    );
    scope.postMessage({ type: "result", result });
  } catch (error) {
    scope.postMessage({ type: "error", message: (error as Error).message });
  }
};
