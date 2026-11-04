#!/usr/bin/env node
// Synthetic G-code in Creality Print / OrcaSlicer style, for the simulator and the parser
// benchmark: layer comments, ;TYPE:, labelled objects, many G2/G3 arcs, numbers without a
// leading zero, retractions, Z hops, wipes, G92 E0 per layer and filament_colour at the end.
//
//   node scripts/gen-gcode.mjs 50 out.gcode     about 50 MB
//   import { generateGcode } from './gen-gcode.mjs'

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateGcode as generateText, objectDefinitions, OBJECTS } from '../src/demo/gcodeGen.ts';

export { objectDefinitions, OBJECTS };

/** The G-code as a Buffer (src/demo/gcodeGen.ts has the generator). */
export function generateGcode(megabytes = 4, options = {}) {
  return Buffer.from(generateText(megabytes, options));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mb = Number(process.argv[2] ?? 4);
  const file = process.argv[3] ?? 'generated.gcode';
  const buf = generateGcode(mb, { tools: Number(process.argv[4] ?? 1) });
  writeFileSync(file, buf);
  console.log(`${file}: ${(buf.length / 1e6).toFixed(1)} MB`);
}
