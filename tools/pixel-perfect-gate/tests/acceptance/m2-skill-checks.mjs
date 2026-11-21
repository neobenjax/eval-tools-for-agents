/**
 * Pure text checks for the cross-harness SKILL.md (SIDE-20). They live here so a test can run the
 * same check against a mutated copy of the skill and prove it fails (M2-AC-28).
 */
import path from 'node:path';
import { repoRoot } from './harness.mjs';

export function parseFrontmatter(text) {
  const match = String(text).replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const out = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function norm(text) {
  return String(text).replace(/\r\n/g, '\n');
}

function paragraphs(text) {
  return norm(text).split(/\n\s*\n/);
}

function sentences(text) {
  return norm(text)
    .split(/(?<=[.!?])\s+|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Fenced code in the skill must run the global command: a line that starts with `pixel-gate `. */
export function usesGlobalCommand(text) {
  return /^\s*(?:\$\s*|PS>\s*)?pixel-gate(?:\s|$)/m.test(norm(text));
}

/** Patterns that point an agent at this repository instead of the global command. */
export function repoPathProblems(text) {
  const body = norm(text);
  const problems = [];
  const repo = repoRoot.split(path.sep).join('/');
  const checks = [
    [/tools[\\/]pixel-perfect-gate[\\/](?:bin|src)/i, 'path into tools/pixel-perfect-gate/bin or src'],
    [/pixel-gate\.mjs/i, 'direct reference to pixel-gate.mjs'],
    [/\bnode\s+\S*pixel-gate/i, 'node <path>/pixel-gate invocation'],
    [/npx\s+@eval-tools/i, 'npx @eval-tools invocation'],
    [/npm\s+(?:run|exec)\b[^\n]*pixel-gate/i, 'npm run/exec invocation'],
    [/AGENT EVALS TOOLS/i, 'absolute path of this repository'],
  ];
  for (const [pattern, label] of checks) if (pattern.test(body)) problems.push(label);
  if (body.replace(/\\/g, '/').includes(repo)) problems.push('absolute path of this repository');
  return problems;
}

/** The skill must say: stop after 5 iterations, even when `passed` is still false. */
export function iterationCapProblems(text) {
  const problems = [];
  const stop = sentences(text).some(
    (s) => /\b(stop|halt|end)\b/i.test(s) && /(?<![\d.])5(?![\d.])/.test(s) && /iteration/i.test(s)
  );
  if (!stop) problems.push('no sentence says to stop after 5 iterations');
  const evenIf = /even (?:if|when)[^.\n]*passed[^.\n]*(?:false|not true|still)/i.test(norm(text));
  if (!evenIf) problems.push('no statement that the cap applies even if passed is still false');
  return problems;
}

export function parseReportProblems(text) {
  const body = norm(text);
  const problems = [];
  if (!/JSON/.test(body)) problems.push('does not mention JSON');
  for (const key of ['passed', 'findings']) {
    if (!new RegExp(`\\b${key}\\b`).test(body)) problems.push(`does not mention ${key}`);
  }
  if (!/exitCode|exit code/i.test(body)) problems.push('does not mention the exit code');
  return problems;
}

export function playwrightReplayProblems(text) {
  const ok = paragraphs(text).some(
    (p) => /\.spec\.ts/.test(p) && /playwright/i.test(p) && /scenario/i.test(p) && /replay/i.test(p)
  );
  return ok ? [] : ['no paragraph tells the agent to write a Playwright .spec.ts that replays the scenario file'];
}

export function modeGuidanceProblems(text) {
  const problems = [];
  const lines = sentences(text);
  const pixel = lines.some((l) => /pixel/i.test(l) && /committed/i.test(l) && /png/i.test(l) && !/wireframe/i.test(l));
  const wire = lines.some((l) => /wireframe/i.test(l) && /(structural|sketch)/i.test(l));
  if (!pixel) problems.push('no line says to use pixel mode when a committed PNG exists');
  if (!wire) problems.push('no line says to use wireframe mode for a structural sketch');
  if (!/--mode\s+wireframe/.test(norm(text))) problems.push('does not show --mode wireframe');
  return problems;
}

export function mcpAidProblems(text) {
  const ok = paragraphs(text).some(
    (p) =>
      /chrome-devtools-mcp/.test(p) &&
      /optional/i.test(p) &&
      /\bpassed\b/.test(p) &&
      /\bfindings\b/.test(p) &&
      /\bexitCode\b/.test(p) &&
      /(cannot|can not|never|does not|must not)/i.test(p)
  );
  return ok ? [] : ['no paragraph says optional chrome-devtools-mcp cannot change passed, findings, or exitCode'];
}

const VALIDATION_CLAIM = /passes?\s+(?:the\s+)?skill\s+structure\s+validation/i;

/**
 * A prose-only validation claim: the phrase appears but no checker script exists.
 * `hasChecker` is whether a validate-skill script exists in the repo.
 */
export function proseOnlyValidationClaims(text, hasChecker) {
  const hits = norm(text)
    .split('\n')
    .filter((line) => VALIDATION_CLAIM.test(line));
  return hasChecker ? [] : hits;
}

/** Section 8 checkbox lines only. */
export function checkboxLines(specText) {
  return norm(specText)
    .split('\n')
    .filter((line) => /^- \[[ x]\] /.test(line));
}
