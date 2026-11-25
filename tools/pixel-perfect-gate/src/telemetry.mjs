/**
 * Eval Telemetry Logger: appends structured JSONL entries for Agent Looping & model/harness benchmarking.
 */
import fs from 'fs';
import path from 'path';

export function recordTelemetry(outDir, entry) {
  fs.mkdirSync(outDir, { recursive: true });
  const telemetryPath = path.join(outDir, 'telemetry.jsonl');
  const payload = {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    ...entry,
    findingIds: Array.isArray(entry.findingIds) ? entry.findingIds : [],
  };
  fs.appendFileSync(telemetryPath, JSON.stringify(payload) + '\n', 'utf8');
  return telemetryPath;
}
