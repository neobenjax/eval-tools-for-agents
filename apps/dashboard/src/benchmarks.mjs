/**
 * Eval Benchmarks telemetry parser & grouper (SPEC.md §7, M3-AC-01).
 */
import fs from 'node:fs';

function utf16Compare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function readBenchmarks(telemetryPath) {
  if (!telemetryPath || !fs.existsSync(telemetryPath)) {
    throw new Error(`Telemetry file not found: ${telemetryPath}`);
  }
  const raw = fs.readFileSync(telemetryPath, 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/);
  const map = new Map();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    let row;
    try {
      row = JSON.parse(trimmed);
    } catch (err) {
      throw new Error(`Invalid JSON on line ${i + 1}: ${err.message}`);
    }

    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Invalid telemetry row on line ${i + 1}: expected object`);
    }
    if (row.schemaVersion !== 1) {
      throw new Error(`Invalid schemaVersion on line ${i + 1}: expected 1`);
    }
    if (typeof row.model !== 'string' || row.model.length === 0) {
      throw new Error(`Invalid model on line ${i + 1}: expected non-empty string`);
    }
    if (typeof row.harness !== 'string' || row.harness.length === 0) {
      throw new Error(`Invalid harness on line ${i + 1}: expected non-empty string`);
    }
    if (!Number.isInteger(row.iteration)) {
      throw new Error(`Invalid iteration on line ${i + 1}: expected integer`);
    }

    const key = `${row.model}\0${row.harness}\0${row.iteration}`;
    if (!map.has(key)) {
      map.set(key, {
        model: row.model,
        harness: row.harness,
        iteration: row.iteration,
        count: 0,
        rows: [],
      });
    }
    const group = map.get(key);
    group.rows.push(row);
    group.count = group.rows.length;
  }

  const groups = Array.from(map.values()).sort((a, b) => {
    const m = utf16Compare(a.model, b.model);
    if (m !== 0) return m;
    const h = utf16Compare(a.harness, b.harness);
    if (h !== 0) return h;
    return a.iteration - b.iteration;
  });

  return {
    view: 'benchmarks',
    primary: true,
    groups,
  };
}
