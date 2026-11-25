#!/usr/bin/env node
/**
 * Eval Benchmarks & Linear Delivery Board CLI (SPEC.md §7, M3 / SIDE-23).
 */
import path from 'node:path';
import { readBenchmarks } from '../src/benchmarks.mjs';
import { checkClientBundle } from '../src/check-client.mjs';
import { startDashboardServer } from '../src/server.mjs';

const args = process.argv.slice(2);
const cmd = args[0];

function getFlag(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

if (cmd === 'benchmarks') {
  const telemetryOpt = getFlag('--telemetry');
  const telemetryPath = telemetryOpt
    ? path.resolve(process.cwd(), telemetryOpt)
    : path.join(process.cwd(), '.visual-eval', 'telemetry.jsonl');
  try {
    const out = readBenchmarks(telemetryPath);
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    process.exit(0);
  } catch (err) {
    process.stdout.write(JSON.stringify({ view: 'benchmarks', error: { message: err.message } }, null, 2) + '\n');
    process.exit(1);
  }
} else if (cmd === 'check-client') {
  const rootOpt = getFlag('--root');
  const res = checkClientBundle(rootOpt);
  process.stdout.write(JSON.stringify(res.json, null, 2) + '\n');
  process.exit(res.code);
} else if (cmd === 'serve') {
  const telemetryOpt = getFlag('--telemetry');
  const telemetryPath = telemetryOpt
    ? path.resolve(process.cwd(), telemetryOpt)
    : path.join(process.cwd(), '.visual-eval', 'telemetry.jsonl');
  const portOpt = getFlag('--port');
  const linearCliOpt = getFlag('--linear-cli');
  const linearCliPath = linearCliOpt ? path.resolve(process.cwd(), linearCliOpt) : null;
  try {
    const { url } = await startDashboardServer({
      telemetryPath,
      port: portOpt !== null ? Number(portOpt) : 0,
      linearCliPath,
    });
    process.stdout.write(JSON.stringify({ url }) + '\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ error: { message: err.message } }) + '\n');
    process.exit(1);
  }
} else {
  process.stdout.write(
    JSON.stringify({ error: { message: 'Usage: dashboard.mjs <benchmarks|serve|check-client>' } }) + '\n'
  );
  process.exit(1);
}
