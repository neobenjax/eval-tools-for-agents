/**
 * Eval Telemetry Logger: appends structured JSONL entries for Agent Looping & model/harness benchmarking.
 */
import fs from 'fs';
import path from 'path';

export function recordTelemetry(outDir, entry) {
  fs.mkdirSync(outDir, { recursive: true });
  const telemetryPath = path.join(outDir, 'telemetry.jsonl');
  const payload = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(telemetryPath, JSON.stringify(payload) + '\n', 'utf8');
  return telemetryPath;
}
