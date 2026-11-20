/**
 * Section 6 Agent Report Contract builder (`schemaVersion: 1`).
 */

function slugifySelector(selector) {
  const cleaned = String(selector || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'unknown';
}

function normalizeBox(box) {
  if (!box || typeof box !== 'object') return null;
  const x = Math.round(Number(box.x));
  const y = Math.round(Number(box.y));
  const width = Math.round(Number(box.width));
  const height = Math.round(Number(box.height));
  if (![x, y, width, height].every(Number.isInteger)) return null;
  return { x, y, width, height };
}

export function buildGate1Findings(gate1) {
  if (!gate1 || gate1.skipped) return [];
  const findings = [];
  const seen = new Map();

  const nextId = (rule, selector) => {
    if (!selector) {
      const count = (seen.get(rule) || 0) + 1;
      seen.set(rule, count);
      return `gate1.${rule}.${count}`;
    }
    const base = `gate1.${rule}.${slugifySelector(selector)}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}.${count}`;
  };

  for (const el of gate1.overflowingElements || []) {
    const selector = el.selector || 'html';
    findings.push({
      id: nextId('overflow', selector),
      gate: 'gate1',
      severity: 'fail',
      selector,
      box: normalizeBox(el.box),
      text: el.scrollWidth
        ? `Horizontal overflow on ${selector} (scrollWidth ${el.scrollWidth}px > clientWidth ${el.clientWidth}px).`
        : `Element ${selector} overflows viewport right edge (${el.rightEdge}px > ${el.viewportWidth}px).`,
    });
  }

  for (const el of gate1.clippedTextElements || []) {
    const selector = el.selector || 'unknown';
    findings.push({
      id: nextId('clipped-text', selector),
      gate: 'gate1',
      severity: 'fail',
      selector,
      box: normalizeBox(el.box),
      text: `Clipped text on ${selector} ("${el.textPreview || ''}", scroll ${el.scrollSize} > client ${el.clientSize}).`,
    });
  }

  for (const ov of gate1.overlappingSiblings || []) {
    const selector = ov.selector || ov.elA || 'unknown';
    findings.push({
      id: nextId('overlap', selector),
      gate: 'gate1',
      severity: 'fail',
      selector,
      box: normalizeBox(ov.box),
      text: `Siblings ${ov.elA} and ${ov.elB} under ${ov.parent} overlap by ${ov.overlapPx}px.`,
    });
  }

  for (const img of gate1.brokenImages || []) {
    const selector = img.selector || 'img';
    findings.push({
      id: nextId('broken-image', selector),
      gate: 'gate1',
      severity: 'fail',
      selector,
      box: normalizeBox(img.box),
      text: `Broken image ${selector} failed to load (src="${img.src}").`,
    });
  }

  for (const err of gate1.consoleErrors || []) {
    findings.push({
      id: nextId('console-error', ''),
      gate: 'gate1',
      severity: 'fail',
      selector: '',
      box: null,
      text: `${err.type || 'console.error'}: ${err.text || ''}`.trim(),
    });
  }

  for (const err of gate1.networkErrors || []) {
    findings.push({
      id: nextId('network-error', ''),
      gate: 'gate1',
      severity: 'fail',
      selector: '',
      box: null,
      text: `Network error ${err.status} (${err.statusText || 'failed'}) for ${err.url}`.trim(),
    });
  }

  return findings;
}

export function buildReport({
  passed,
  iteration,
  durationMs,
  errorMessage = null,
  gate1Result = null,
  gate2Result = null,
  gate3Result = null,
  telemetryPath = null,
}) {
  const isPassed = Boolean(passed) && !errorMessage;
  const gate1Findings = buildGate1Findings(gate1Result);
  const gate2Findings = Array.isArray(gate2Result?.findings) ? gate2Result.findings : [];
  const gate3Findings = Array.isArray(gate3Result?.findings) ? gate3Result.findings : [];
  const findings = [...gate1Findings, ...gate2Findings, ...gate3Findings];

  const rawArtifacts = gate2Result?.artifacts ? { ...gate2Result.artifacts } : {};
  if (telemetryPath) rawArtifacts.telemetry = telemetryPath;
  const artifacts = Object.keys(rawArtifacts).length > 0 ? rawArtifacts : null;

  return {
    schemaVersion: 1,
    passed: isPassed,
    exitCode: isPassed ? 0 : 1,
    iteration: Number.isInteger(iteration) ? iteration : 1,
    durationMs: Math.max(0, Math.round(Number(durationMs) || 0)),
    error: errorMessage ? { message: String(errorMessage) } : null,
    findings,
    gates: {
      gate1: gate1Result || {
        passed: !errorMessage,
        skipped: true,
        reason: errorMessage || 'Gate 1 did not run',
      },
      gate2: gate2Result || {
        passed: !errorMessage,
        skipped: true,
        reason: errorMessage || 'Gate 2 did not run',
      },
      gate3: gate3Result || {
        passed: true,
        skipped: true,
        reason: 'Gate 3 not enabled in M1',
      },
    },
    artifacts,
    telemetry: telemetryPath ?? null,
  };
}
