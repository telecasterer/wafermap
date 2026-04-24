import type { WaferMapInput, WaferMapResult } from '../renderer/buildWaferMap.js';
import type { WorkerRequest, WorkerResponse } from './wafermap.worker.js';

export interface WafermapWorker {
  /** Run buildWaferMap in the worker thread. Returns a promise that resolves with the result. */
  run(input: WaferMapInput): Promise<WaferMapResult>;
  /** Terminate the underlying Worker. Call when the worker is no longer needed. */
  terminate(): void;
}

/**
 * Creates a wrapper around a `wafermap.worker.js` Web Worker.
 *
 * Pass the worker URL (or a pre-constructed Worker instance) — the worker
 * script must be the compiled `wafermap.worker.js` served from your build
 * output.
 *
 * @example
 * // With a bundler (Vite, webpack…)
 * import workerUrl from 'wafermap/worker?url';
 * const worker = createWafermapWorker(new Worker(workerUrl, { type: 'module' }));
 *
 * @example
 * // Plain script tag / CDN
 * const worker = createWafermapWorker(
 *   new Worker('/dist/wafermap.worker.js', { type: 'module' })
 * );
 */
export function createWafermapWorker(worker: Worker): WafermapWorker {
  let nextId = 0;
  const pending = new Map<number, { resolve: (r: WaferMapResult) => void; reject: (e: Error) => void }>();

  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    if (msg.type === 'pong') return;
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.type === 'result') {
      entry.resolve(msg.result);
    } else {
      entry.reject(new Error(msg.message));
    }
  };

  worker.onerror = (ev) => {
    const err = new Error(ev.message ?? 'Worker error');
    for (const entry of pending.values()) entry.reject(err);
    pending.clear();
  };

  return {
    run(input: WaferMapInput): Promise<WaferMapResult> {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ type: 'run', id, input } satisfies WorkerRequest);
      });
    },
    terminate() {
      worker.terminate();
      const err = new Error('Worker terminated');
      for (const entry of pending.values()) entry.reject(err);
      pending.clear();
    },
  };
}
