/// <reference lib="webworker" />
import { layerBuffers, type GcodeLayer } from './model';
import { GcodeParser } from './parser';

// Runs the parser off the main thread. The main thread downloads the file and sends it here in
// chunks; layers go back as soon as they're complete, transferred (not copied).

export type ToWorker =
  | { type: 'start'; options?: ConstructorParameters<typeof GcodeParser>[0] }
  | { type: 'chunk'; data: ArrayBuffer }
  | { type: 'end' };

export type FromWorker =
  | { type: 'layers'; layers: GcodeLayer[]; hint: number | null; busyMs: number }
  | {
      type: 'done';
      layers: GcodeLayer[];
      summary: ReturnType<GcodeParser['finish']>['summary'];
      busyMs: number;
    }
  | { type: 'error'; message: string };

declare const self: DedicatedWorkerGlobalScope;

let parser: GcodeParser | null = null;
/** Time spent parsing, for the info panel. */
let busy = 0;

function send(msg: FromWorker, layers: GcodeLayer[]) {
  self.postMessage(msg, layers.flatMap(layerBuffers));
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    if (m.type === 'start') {
      parser = new GcodeParser(m.options);
      busy = 0;
    } else if (m.type === 'chunk') {
      const t0 = performance.now();
      const layers = parser!.push(new Uint8Array(m.data));
      busy += performance.now() - t0;
      if (layers.length)
        send(
          { type: 'layers', layers, hint: parser!.peekSummary().layersHint, busyMs: busy },
          layers,
        );
    } else if (m.type === 'end') {
      const t0 = performance.now();
      const { layers, summary } = parser!.finish();
      busy += performance.now() - t0;
      send({ type: 'done', layers, summary, busyMs: busy }, layers);
      parser = null;
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message } satisfies FromWorker);
  }
};
