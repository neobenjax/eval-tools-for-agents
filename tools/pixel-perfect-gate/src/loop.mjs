/**
 * Audit loop contract (SPEC.md §12.6, M2b.3 / SIDE-30).
 * Tracks runId-scoped best iteration, delta, advisory status, and deterministic stop reasons.
 */
import fs from 'node:fs';
import path from 'node:path';

export const HARD_MAX_ITERATIONS = 5;

const BLOCKED_PREFIXES = [
  'gate2.missing-reference.',
  'gate2.reference-tampered.',
  'gate2.reference-copy-unacknowledged.',
  'gate2.reference-scale-unknown.',
  'gate2.frame-viewport-mismatch.',
  'gate3.unmapped-acceptance.',
  'gate3.unmapped-scenario.',
];

export function validateMaxIterations(rawValue) {
  if (rawValue === undefined || rawValue === null) return HARD_MAX_ITERATIONS;
  const n = Number(rawValue);
  if (!Number.isInteger(n) || n < 1 || n > HARD_MAX_ITERATIONS) {
    throw new Error(`Invalid maxIterations "${rawValue}": maxIterations cannot exceed ${HARD_MAX_ITERATIONS}.`);
  }
  return n;
}

export function resolveRunId(flagRunId, config) {
  if (flagRunId && String(flagRunId).trim()) return String(flagRunId).trim();
  if (config?.loop?.runId && String(config.loop.runId).trim()) return String(config.loop.runId).trim();
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readRunTelemetry(outDir, runId) {
  if (!outDir || !runId) return [];
  const telemetryPath = path.join(outDir, 'telemetry.jsonl');
  if (!fs.existsSync(telemetryPath)) return [];
  let raw = '';
  try {
    raw = fs.readFileSync(telemetryPath, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && parsed.runId === runId) {
        rows.push(parsed);
      }
    } catch {}
  }
  return rows;
}

function getRowFailIds(row) {
  if (Array.isArray(row.failIds)) return row.failIds;
  if (Array.isArray(row.findingIds)) return row.findingIds;
  return [];
}

function getRowFailCount(row) {
  if (typeof row.failCount === 'number' && Number.isFinite(row.failCount)) return row.failCount;
  return getRowFailIds(row).length;
}

function getRowMismatch(row) {
  return typeof row.mismatchPct === 'number' && Number.isFinite(row.mismatchPct) ? row.mismatchPct : null;
}

function isBetterRow(candidate, currentBest) {
  if (!currentBest) return true;
  if (candidate.failCount !== currentBest.failCount) {
    return candidate.failCount < currentBest.failCount;
  }
  const cMis = candidate.mismatchPct;
  const bMis = currentBest.mismatchPct;
  if (cMis !== null && bMis !== null) {
    return cMis < bMis;
  }
  if (cMis !== null && bMis === null) return true;
  return false;
}

function pickBest(rows) {
  let best = null;
  for (const r of rows) {
    const entry = {
      iteration: Number.isInteger(r.iteration) ? r.iteration : 1,
      failCount: getRowFailCount(r),
      mismatchPct: getRowMismatch(r),
    };
    if (isBetterRow(entry, best)) {
      best = entry;
    }
  }
  return best;
}

function sameIdSet(a, b) {
  const setA = new Set(a || []);
  const setB = new Set(b || []);
  if (setA.size !== setB.size) return false;
  for (const id of setA) {
    if (!setB.has(id)) return false;
  }
  return true;
}

function isNoProgressPair(prev, curr) {
  if (!prev || !curr) return false;
  const prevIds = prev.ids;
  const currIds = curr.ids;
  if (!sameIdSet(prevIds, currIds)) return false;
  if (prev.metric === null || curr.metric === null) return false;
  const diff = Number(Math.abs(curr.metric - prev.metric).toFixed(6));
  return diff < 0.1;
}

export function isBlockedFinding(finding) {
  if (!finding || typeof finding.id !== 'string') return false;
  return BLOCKED_PREFIXES.some((prefix) => finding.id.startsWith(prefix));
}

export function computeLoop({
  outDir = null,
  runId = 'run-1',
  iteration = 1,
  passed = false,
  errorMessage = null,
  findings = [],
  mismatchPct = null,
  advisory = null,
  blocked = false,
} = {}) {
  const safeIter = Number.isInteger(iteration) && iteration >= 1 ? iteration : 1;
  const priorRows = readRunTelemetry(outDir, runId);
  const failIds = (findings || []).filter((f) => f && f.severity === 'fail').map((f) => f.id);
  const failCount = failIds.length;
  const currMismatch = typeof mismatchPct === 'number' && Number.isFinite(mismatchPct) ? mismatchPct : null;

  const currentSummary = {
    iteration: safeIter,
    failCount,
    failIds,
    findingIds: (findings || []).map((f) => f.id),
    mismatchPct: currMismatch,
  };

  const prevBest = priorRows.length > 0 ? pickBest(priorRows) : null;
  const best = pickBest([...priorRows, currentSummary]);

  const prevRow = priorRows.length > 0 ? priorRows[priorRows.length - 1] : null;
  let delta;
  if (!prevRow) {
    delta = {
      mismatchPct: null,
      newFailIds: [],
      resolvedFailIds: [],
    };
  } else {
    const prevFailIds = getRowFailIds(prevRow);
    const prevSet = new Set(prevFailIds);
    const currSet = new Set(failIds);
    const prevMis = getRowMismatch(prevRow);
    delta = {
      mismatchPct: currMismatch !== null && prevMis !== null ? Number((currMismatch - prevMis).toFixed(4)) : null,
      newFailIds: [...currSet].filter((id) => !prevSet.has(id)),
      resolvedFailIds: [...prevSet].filter((id) => !currSet.has(id)),
    };
  }

  const hasBlockedFinding = (findings || []).some(isBlockedFinding);
  const isBlocked = Boolean(blocked || errorMessage || hasBlockedFinding);

  let stopReason = null;
  if (isBlocked) {
    stopReason = 'blocked';
  } else if (passed && (!advisory || advisory.met === true)) {
    stopReason = 'passed';
  } else if (prevBest && delta.newFailIds.length > 0 && failCount > prevBest.failCount) {
    stopReason = 'regression';
  } else if (priorRows.length >= 2) {
    const r2 = priorRows[priorRows.length - 2];
    const r1 = priorRows[priorRows.length - 1];
    const advisoryOnly = advisory !== null && failCount === 0;
    const toPoint = (row, isCurrent = false) => {
      if (isCurrent) {
        return advisoryOnly
          ? {
              ids: (findings || []).filter((f) => f && f.severity === 'info').map((f) => f.id),
              metric: typeof advisory.similarityPct === 'number' ? advisory.similarityPct : currMismatch,
            }
          : { ids: failIds, metric: currMismatch };
      }
      return advisoryOnly
        ? {
            ids: Array.isArray(row.findingIds) ? row.findingIds : getRowFailIds(row),
            metric: typeof row.similarityPct === 'number' ? row.similarityPct : getRowMismatch(row),
          }
        : { ids: getRowFailIds(row), metric: getRowMismatch(row) };
    };
    const p0 = toPoint(r2, false);
    const p1 = toPoint(r1, false);
    const p2 = toPoint(currentSummary, true);
    if (isNoProgressPair(p0, p1) && isNoProgressPair(p1, p2)) {
      stopReason = 'no-progress';
    }
  }

  if (!stopReason && safeIter >= HARD_MAX_ITERATIONS) {
    stopReason = 'max-iterations';
  }

  return {
    runId,
    iteration: safeIter,
    maxIterations: HARD_MAX_ITERATIONS,
    best,
    delta,
    stopReason,
    continue: stopReason === null,
    advisory: advisory ?? null,
  };
}
