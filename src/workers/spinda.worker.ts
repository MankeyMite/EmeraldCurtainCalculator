import {
  createSpindaWorkerHandler,
  type SpindaWorkerRequest,
} from "../core/spindaWorker";

const handle = createSpindaWorkerHandler((data) => self.postMessage(data));
self.onmessage = ({ data }: MessageEvent<SpindaWorkerRequest>) => handle(data);
