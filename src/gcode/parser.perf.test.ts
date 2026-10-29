import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { layerBytes } from './model';
import { GcodeParser } from './parser';

// npm run bench:gcode — parse speed and model memory with synthetic files, plus real ones from
// GCODE_BENCH_DIR when set (the printer's big files stay out of the repository).
// Skipped in the normal test run.

const run = process.env.GCODE_BENCH === '1';

describe.runIf(run)('GcodeParser performance', async () => {
  // @ts-expect-error plain JS module without types
  const { generateGcode } = await import('../../scripts/gen-gcode.mjs');
  const files: [string, Uint8Array][] = [10, 50].map((mb) => [
    `synthetic ${mb} MB`,
    new Uint8Array(generateGcode(mb)),
  ]);
  const dir = process.env.GCODE_BENCH_DIR;
  if (dir && existsSync(dir))
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.gcode')))
      files.push([f, new Uint8Array(readFileSync(join(dir, f)))]);

  for (const [name, data] of files) {
    it(name, () => {
      let best = Infinity;
      let result!: ReturnType<GcodeParser['finish']> & { all: number };
      for (let round = 0; round < 3; round++) {
        const t0 = performance.now();
        const p = new GcodeParser();
        let model = 0;
        for (let i = 0; i < data.length; i += 64 * 1024)
          for (const l of p.push(data.subarray(i, i + 64 * 1024))) model += layerBytes(l);
        const end = p.finish();
        for (const l of end.layers) model += layerBytes(l);
        best = Math.min(best, performance.now() - t0);
        result = { ...end, all: model };
      }
      const mb = data.length / 1e6;
      console.log(
        `${name.padEnd(42)} ${mb.toFixed(1).padStart(5)} MB  ${best.toFixed(0).padStart(5)} ms  ` +
          `${(mb / (best / 1000)).toFixed(0).padStart(4)} MB/s  ` +
          `${(result.summary.points / 1e6).toFixed(2)} M points  model ${(result.all / 1e6).toFixed(1)} MB`,
      );
      expect(result.summary.points).toBeGreaterThan(0);
    });
  }
});
