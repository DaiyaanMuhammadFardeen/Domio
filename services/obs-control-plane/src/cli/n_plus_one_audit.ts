/**
 * @domio/obs-control-plane — N+1 audit CLI.
 *
 * Reads an OTel-JSON trace from stdin, runs `detectNPlusOne`, and
 * writes the JSON report to stdout. Used by the audit script.
 */

import { readFileSync } from 'node:fs';
import { detectNPlusOne, type OtelTrace } from '../n_plus_one.js';

function main(): void {
  const raw = readFileSync(0, 'utf8');
  const trace = JSON.parse(raw) as OtelTrace;
  const report = detectNPlusOne(trace);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main();
