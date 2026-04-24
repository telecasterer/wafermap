import { buildWaferMap } from '../renderer/buildWaferMap.js';
import type { WaferMapInput } from '../renderer/buildWaferMap.js';

export type WorkerRequest =
  | { type: 'run'; id: number; input: WaferMapInput }
  | { type: 'ping' };

export type WorkerResponse =
  | { type: 'result'; id: number; result: ReturnType<typeof buildWaferMap> }
  | { type: 'error'; id: number; message: string }
  | { type: 'pong' };

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;

  if (msg.type === 'ping') {
    (self as unknown as Worker).postMessage({ type: 'pong' } satisfies WorkerResponse);
    return;
  }

  if (msg.type === 'run') {
    try {
      const result = buildWaferMap(msg.input);
      (self as unknown as Worker).postMessage(
        { type: 'result', id: msg.id, result } satisfies WorkerResponse,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      (self as unknown as Worker).postMessage(
        { type: 'error', id: msg.id, message } satisfies WorkerResponse,
      );
    }
  }
};
