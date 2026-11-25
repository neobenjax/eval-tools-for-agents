import fs from 'node:fs';
import path from 'node:path';

export function slugifyHeading(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

/**
 * Parse level-2 (`## `) scenario headings from a markdown acceptance file.
 * A heading maps to a scenario id when its text is exactly `<id>` or starts with `<id>:`.
 */
export function parseAcceptanceHeadings(markdown) {
  const headings = [];
  const lines = String(markdown || '').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (!match) continue;
    const raw = match[1].trim();
    const idMatch = raw.match(/^([a-zA-Z0-9._-]+)(?:\s*:.*)?$/);
    headings.push({
      raw,
      id: idMatch ? idMatch[1] : null,
      slug: slugifyHeading(raw),
    });
  }
  return headings;
}

/**
 * Verify 1:1 mapping between markdown acceptance headings and scenarios[].
 */
export function checkAcceptanceMapping(cwd, acceptanceRelPath, scenarios = []) {
  if (!acceptanceRelPath) return [];
  const fullPath = path.resolve(cwd, String(acceptanceRelPath));
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Configured acceptance file not found: ${acceptanceRelPath}`);
  }
  const markdown = fs.readFileSync(fullPath, 'utf8');
  const headings = parseAcceptanceHeadings(markdown);
  const scenarioIds = new Set(scenarios.map((s) => s.id).filter(Boolean));
  const matchedScenarioIds = new Set();
  const findings = [];

  for (const h of headings) {
    if (h.id && scenarioIds.has(h.id)) {
      matchedScenarioIds.add(h.id);
    } else {
      findings.push({
        id: `gate3.unmapped-acceptance.${h.slug}`,
        gate: 'gate3',
        severity: 'fail',
        selector: '',
        box: null,
        text: `Acceptance heading "## ${h.raw}" does not map to any scenario id.`,
      });
    }
  }

  for (const s of scenarios) {
    if (s?.id && !matchedScenarioIds.has(s.id)) {
      findings.push({
        id: `gate3.unmapped-scenario.${s.id}`,
        gate: 'gate3',
        severity: 'fail',
        selector: '',
        box: null,
        text: `Scenario "${s.id}" has no matching "## ${s.id}" heading in acceptance file.`,
      });
    }
  }

  return findings;
}

/**
 * Resolve keyed reference path `<references>/<route-id>/<viewport-name>.png`.
 */
export function resolveKeyedReferencePath(cwd, referencesDir, routeId, viewportName) {
  return path.resolve(cwd, referencesDir || 'references', routeId, `${viewportName}.png`);
}
