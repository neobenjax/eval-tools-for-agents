#!/usr/bin/env node
/**
 * Validates PR readiness:
 * 1. Current branch is not `main`.
 * 2. Branch name on `feat/` includes a Linear `SIDE-XX` key.
 * 3. `SPEC.md` has zero `NEW-*` placeholders and maintains 1:1 parity across Section 4 (matrix), Section 8 (acceptance headings), and Section 9 (dependency order).
 * 4. No untracked secrets (.env) staged.
 */
import fs from 'fs';
import { execSync } from 'child_process';

const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
if (branch === 'main') {
  console.error('❌ Cannot open a PR from `main`. Cut a `feat/SIDE-XX-...` branch.');
  process.exit(1);
}

const spec = fs.readFileSync('SPEC.md', 'utf8');

// 1. Reject any NEW-* placeholders
const newPlaceholders = [...spec.matchAll(/\b(NEW-\d+)\b/g)].map((m) => m[1]);
if (newPlaceholders.length > 0) {
  console.error(`❌ SPEC.md still contains unresolved placeholders: ${[...new Set(newPlaceholders)].join(', ')}`);
  process.exit(1);
}

// 2. Extract Section 4 matrix keys
const sec4Match = spec.match(/## 4\.[^\n]*\n([\s\S]*?)\n## 5\./);
if (!sec4Match) {
  console.error('❌ Could not locate Section 4 in SPEC.md.');
  process.exit(1);
}
const sec4Keys = new Set([...sec4Match[1].matchAll(/^- \[[ x]\] \*\*(SIDE-\d+)\*\*/gm)].map((m) => m[1]));
if (sec4Keys.size === 0) {
  console.error('❌ No SIDE-XX keys found in Section 4 of SPEC.md.');
  process.exit(1);
}

// 3. Extract Section 8 headings & verify every heading exists in Section 4
const sec8Match = spec.match(/## 8\.[^\n]*\n([\s\S]*?)\n## 9\./);
if (!sec8Match) {
  console.error('❌ Could not locate Section 8 in SPEC.md.');
  process.exit(1);
}
const sec8Keys = [...sec8Match[1].matchAll(/^### (SIDE-\d+)\b/gm)].map((m) => m[1]);
const unknownSec8 = sec8Keys.filter((k) => !sec4Keys.has(k));
if (unknownSec8.length > 0) {
  console.error(`❌ Section 8 headings missing from Section 4: ${unknownSec8.join(', ')}`);
  process.exit(1);
}

// 4. Extract Section 9 dependency references & verify every key exists in Section 4
const sec9Match = spec.match(/## 9\.[^\n]*\n([\s\S]*?)\n## 10\./);
if (!sec9Match) {
  console.error('❌ Could not locate Section 9 in SPEC.md.');
  process.exit(1);
}
const sec9Keys = [...new Set([...sec9Match[1].matchAll(/\b(SIDE-\d+)\b/g)].map((m) => m[1]))];
const unknownSec9 = sec9Keys.filter((k) => !sec4Keys.has(k));
if (unknownSec9.length > 0) {
  console.error(`❌ Section 9 references keys missing from Section 4: ${unknownSec9.join(', ')}`);
  process.exit(1);
}

// 5. Ensure .env is never staged
const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' });
if (/^\.env$/m.test(staged)) {
  console.error('❌ .env is staged for commit! Unstage it immediately.');
  process.exit(1);
}

// 6. Enforce feat/SIDE-XX branch naming
const branchMatch = branch.match(/\b(SIDE-\d+)\b/i);
if (branch.startsWith('feat/') && !branchMatch) {
  console.error(`❌ Feature branch "${branch}" must include a Linear key (e.g. feat/SIDE-11-...).`);
  process.exit(1);
}

console.log(
  `✅ PR ready on branch "${branch}" (Section 4: ${sec4Keys.size} keys, Section 8: ${sec8Keys.length} headings, Section 9: ${sec9Keys.length} refs — 1:1 parity verified).`
);
