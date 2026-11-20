#!/usr/bin/env node
/**
 * Validates PR readiness:
 * 1. Current branch (or GITHUB_HEAD_REF on detached HEAD) is not `main`.
 * 2. Branch name on `feat/` includes a Linear `SIDE-XX` key.
 * 3. `SPEC.md` has zero `NEW-*` placeholders and enforces bidirectional parity:
 *    - Section 8 headings (`### SIDE-XX` / `### RS-XX`) MUST equal the unchecked `[ ]` keys in Section 4,
 *      plus fully-checked (`- [x]`) headings for keys whose milestone family is in `ENFORCED_MILESTONES`.
 *    - Section 9 (`SIDE-XX` / `RS-XX` refs) may cite only Section 4 keys, and MUST include every unchecked `[ ]` key from Section 4.
 *    `RS-XX` are proposed (pre-Linear) keys; they get the same parity checks as Linear `SIDE-XX` keys.
 * 4. No untracked secrets (.env) staged.
 */
import fs from 'fs';
import { execSync } from 'child_process';
import { acceptanceEditRequiresRationale, milestoneFamily } from './acceptance-lib.mjs';
import { ENFORCED_MILESTONES } from '../tools/pixel-perfect-gate/tests/acceptance/manifest.mjs';

const specArgIdx = process.argv.indexOf('--spec');
const specPath = specArgIdx !== -1 ? process.argv[specArgIdx + 1] : process.env.SPEC_PATH || 'SPEC.md';

const envBranch = (process.env.GITHUB_HEAD_REF || '').trim();
const gitBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
const branch = envBranch || gitBranch;

if (!branch) {
  console.error('❌ Detached HEAD with no GITHUB_HEAD_REF set.');
  process.exit(1);
}
if (branch === 'main') {
  console.error('❌ Cannot open a PR from `main`. Cut a `feat/SIDE-XX-...` branch.');
  process.exit(1);
}

const spec = fs.readFileSync(specPath, 'utf8').replace(/\r\n/g, '\n');

// 1. Reject any NEW-* placeholders
const newPlaceholders = [...spec.matchAll(/\b(NEW-\d+)\b/g)].map((m) => m[1]);
if (newPlaceholders.length > 0) {
  console.error(`❌ ${specPath} still contains unresolved placeholders: ${[...new Set(newPlaceholders)].join(', ')}`);
  process.exit(1);
}

// 2. Extract Section 4 matrix keys (all + open `[ ]`)
const sec4Match = spec.match(/## 4\.[^\n]*\n([\s\S]*?)\n## 5\./);
if (!sec4Match) {
  console.error(`❌ Could not locate Section 4 in ${specPath}.`);
  process.exit(1);
}
const sec4 = sec4Match[1];
const KEY = '(?:SIDE|RS)-\\d+';
const capitalXSec4 = [...sec4.matchAll(new RegExp(`^- \\[X\\] \\*\\*(${KEY})\\*\\*`, 'gm'))].map((m) => m[1]);
if (capitalXSec4.length > 0) {
  console.error(`❌ Section 4 uses capital [X] for: ${capitalXSec4.join(', ')}. Use "- [x]" or "- [ ]".`);
  process.exit(1);
}
const sec4Keys = new Set();
const openSec4 = new Set();
const sec4Families = new Map();
const dupSec4 = [];
for (const m of sec4.matchAll(new RegExp(`^- \\[([ x])\\] \\*\\*(${KEY})\\*\\*(.*)$`, 'gm'))) {
  if (sec4Keys.has(m[2])) dupSec4.push(m[2]);
  sec4Keys.add(m[2]);
  if (m[1] === ' ') openSec4.add(m[2]);
  const family = milestoneFamily(m[3]);
  if (family) sec4Families.set(m[2], family);
}
if (dupSec4.length > 0) {
  console.error(`❌ Duplicate keys in Section 4 of ${specPath}: ${[...new Set(dupSec4)].join(', ')}.`);
  process.exit(1);
}
if (sec4Keys.size === 0) {
  console.error(`❌ No SIDE-XX keys found in Section 4 of ${specPath}.`);
  process.exit(1);
}

// 3. Section 8 headings must equal unchecked Section 4 keys (plus fully-checked enforced-milestone keys)
const sec8Match = spec.match(/## 8\.[^\n]*\n([\s\S]*?)\n## 9\./);
if (!sec8Match) {
  console.error(`❌ Could not locate Section 8 in ${specPath}.`);
  process.exit(1);
}
const enforcedFamilies = new Set(ENFORCED_MILESTONES);
const sec8Keys = new Set();
const sec8Checkboxes = new Map();
let currentSec8Key = null;
for (const line of sec8Match[1].split('\n')) {
  const heading = line.match(new RegExp(`^### (${KEY})\\b`));
  if (heading) {
    currentSec8Key = heading[1];
    sec8Keys.add(currentSec8Key);
    if (!sec8Checkboxes.has(currentSec8Key)) sec8Checkboxes.set(currentSec8Key, []);
    continue;
  }
  if (currentSec8Key && /^- \[[ xX]\] /.test(line)) {
    sec8Checkboxes.get(currentSec8Key).push(line[3]);
  }
}
const missingSec8 = [...openSec4].filter((k) => !sec8Keys.has(k));
const extraSec8 = [...sec8Keys].filter((k) => !sec4Keys.has(k));
const closedAllowedEnforced = (k) => {
  if (!enforcedFamilies.has(sec4Families.get(k))) return false;
  const boxes = sec8Checkboxes.get(k) || [];
  return boxes.length > 0 && boxes.every((mark) => mark === 'x');
};
const closedInSec8 = [...sec8Keys].filter(
  (k) => sec4Keys.has(k) && !openSec4.has(k) && !closedAllowedEnforced(k)
);
const closedEnforcedCount = [...sec8Keys].filter(
  (k) => sec4Keys.has(k) && !openSec4.has(k) && closedAllowedEnforced(k)
).length;
if (missingSec8.length || extraSec8.length || closedInSec8.length) {
  console.error(
    `❌ Section 8 headings must equal open Section 4 keys. Missing: ${missingSec8.join(', ') || 'none'}. Unknown: ${extraSec8.join(', ') || 'none'}. Closed-but-in-§8: ${closedInSec8.join(', ') || 'none'}.`
  );
  process.exit(1);
}

// 4. Section 9 may cite only Section 4 keys AND must include every open Section 4 key
const sec9Match = spec.match(/## 9\.[^\n]*\n([\s\S]*?)\n## 10\./);
if (!sec9Match) {
  console.error(`❌ Could not locate Section 9 in ${specPath}.`);
  process.exit(1);
}
const sec9Keys = new Set([...sec9Match[1].matchAll(new RegExp(`\\b(${KEY})\\b`, 'g'))].map((m) => m[1]));
const missingSec9 = [...openSec4].filter((k) => !sec9Keys.has(k));
const unknownSec9 = [...sec9Keys].filter((k) => !sec4Keys.has(k));
if (missingSec9.length || unknownSec9.length) {
  console.error(
    `❌ Section 9 must cite all open Section 4 keys and no unknown keys. Missing: ${missingSec9.join(', ') || 'none'}. Unknown: ${unknownSec9.join(', ') || 'none'}.`
  );
  process.exit(1);
}

// 5. Ensure .env is never staged
const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' });
if (/^\.env\r?$/m.test(staged)) {
  console.error('❌ .env is staged for commit! Unstage it immediately.');
  process.exit(1);
}

// 6. Enforce feat/SIDE-XX branch naming
const branchMatch = branch.match(/\b(SIDE-\d+)\b/i);
if (branch.startsWith('feat/') && !branchMatch) {
  console.error(`❌ Feature branch "${branch}" must include a Linear key (e.g. feat/SIDE-11-...).`);
  process.exit(1);
}

const baseName = (process.env.GITHUB_BASE_REF || 'main').trim() || 'main';
const baseRef = `origin/${baseName}`;
try {
  execSync(`git rev-parse --verify --quiet ${baseRef}`, { stdio: 'ignore' });
} catch {
  execSync(`git fetch --depth=1 origin ${baseName}`, { stdio: 'inherit' });
}
let nameStatus = '';
try {
  nameStatus += execSync(`git diff --name-status ${baseRef}...HEAD`, { encoding: 'utf8' });
} catch {
  nameStatus += execSync(`git diff --name-status ${baseRef}`, { encoding: 'utf8' });
}
nameStatus += execSync('git diff --name-status HEAD', { encoding: 'utf8' });
nameStatus += execSync('git diff --name-status --cached', { encoding: 'utf8' });
const acceptanceEdit = acceptanceEditRequiresRationale(nameStatus, process.env.PR_BODY || '');
if (!acceptanceEdit.ok) {
  console.error(`❌ ${acceptanceEdit.message}`);
  process.exit(1);
}

console.log(
  `✅ PR ready on branch "${branch}" (Section 4: ${sec4Keys.size} total / ${openSec4.size} open; Section 8: ${sec8Keys.size} headings (${openSec4.size} open, ${closedEnforcedCount} closed enforced); Section 9: ${sec9Keys.size} refs covering all open).`
);
