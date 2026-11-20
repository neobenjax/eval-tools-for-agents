/**
 * Milestone acceptance traceability.
 * Section 8 checkboxes for enforced milestones must match the manifest,
 * and every criterion is either a green test or an expected-fail gap test.
 */
import fs from 'node:fs';
import path from 'node:path';

const KEY = '(?:SIDE|RS)-\\d+';

export function normalizeNewlines(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sectionBody(spec, startHeading, endHeading) {
  const start = spec.indexOf(startHeading);
  const end = spec.indexOf(endHeading);
  if (start === -1 || end === -1 || end <= start) return null;
  return spec.slice(start, end);
}

/**
 * Milestone family from a section 4 tag: [M1.6] -> M1, [M2.0a] -> M2, [M2b.1] -> M2b.
 */
export function milestoneFamily(section4Rest) {
  const tag = String(section4Rest).match(/\[(M\d+[a-z]?)\./);
  return tag ? tag[1] : null;
}

export function extractEnforcedCriteria(specText, enforcedMilestones) {
  const spec = normalizeNewlines(specText);
  const errors = [];
  const sec4 = sectionBody(spec, '## 4.', '## 5.');
  const sec8 = sectionBody(spec, '## 8.', '## 9.');
  if (sec4 == null) errors.push('Could not locate Section 4.');
  if (sec8 == null) errors.push('Could not locate Section 8.');
  if (errors.length) return { criteria: [], families: new Map(), errors };

  const families = new Map();
  for (const match of sec4.matchAll(new RegExp(`^- \\[[ x]\\] \\*\\*(${KEY})\\*\\*(.*)$`, 'gm'))) {
    const family = milestoneFamily(match[2]);
    if (family) families.set(match[1], family);
  }

  const enforced = new Set(enforcedMilestones);
  const criteria = [];
  let currentKey = null;
  for (const line of sec8.split('\n')) {
    const heading = line.match(new RegExp(`^### (${KEY})\\b`));
    if (heading) {
      currentKey = heading[1];
      continue;
    }
    if (!currentKey || !enforced.has(families.get(currentKey))) continue;
    if (/^- \[X\] /.test(line)) {
      errors.push(
        `Section 8 checkbox under ${currentKey} uses capital X ("${line.trim()}"). Use "- [x]" or "- [ ]". A capital X is not a criterion and cannot hide one.`
      );
      continue;
    }
    const box = line.match(/^- \[([ x])\] (.*)$/);
    if (!box) continue;
    criteria.push({
      key: currentKey,
      milestone: families.get(currentKey),
      checked: box[1] === 'x',
      text: box[2].trim(),
    });
  }

  const seen = new Set();
  for (const criterion of criteria) {
    if (seen.has(criterion.text)) {
      errors.push(`Duplicate section 8 criterion text under ${criterion.milestone}: ${criterion.text}`);
    }
    seen.add(criterion.text);
  }
  return { criteria, families, errors };
}

export function criterionTitle(entry) {
  return `${entry.id}: ${entry.text}`;
}

export function matchManifest(specCriteria, manifestCriteria) {
  const errors = [];
  const byText = new Map();
  const ids = new Set();
  for (const entry of manifestCriteria) {
    if (!entry.id || !/^M\d+[a-z]?-AC-\d+$/.test(entry.id)) {
      errors.push(`Manifest id "${entry.id}" must look like M1-AC-01.`);
    }
    if (ids.has(entry.id)) errors.push(`Duplicate manifest id ${entry.id}.`);
    ids.add(entry.id);
    if (entry.suite !== 'pass' && entry.suite !== 'gap') {
      errors.push(`${entry.id} suite must be "pass" or "gap" (got ${JSON.stringify(entry.suite)}).`);
    }
    if (byText.has(entry.text)) errors.push(`Duplicate manifest text for ${entry.id}.`);
    byText.set(entry.text, entry);
    if (!Array.isArray(entry.breakIt)) errors.push(`${entry.id} breakIt must be an array.`);
  }

  const specTexts = new Set(specCriteria.map((criterion) => criterion.text));
  for (const criterion of specCriteria) {
    const entry = byText.get(criterion.text);
    if (!entry) {
      errors.push(`Section 8 criterion has no manifest entry: ${criterion.text}`);
      continue;
    }
    if (entry.milestone !== criterion.milestone) {
      errors.push(`${entry.id} milestone is ${entry.milestone}; section 4 tag is ${criterion.milestone}.`);
    }
    const expectedSuite = criterion.checked ? 'pass' : 'gap';
    if (entry.suite !== expectedSuite) {
      errors.push(
        `${entry.id} is ${criterion.checked ? 'checked' : 'unchecked'} in section 8, so its suite must be "${expectedSuite}" (got "${entry.suite}").`
      );
    }
  }
  for (const entry of manifestCriteria) {
    if (!specTexts.has(entry.text)) {
      errors.push(`${entry.id} text is not a section 8 criterion for an enforced milestone: ${entry.text}`);
    }
  }
  return errors;
}

export function classifyAcceptanceFile(filePath) {
  const name = path.basename(filePath);
  if (name.endsWith('.pending.mjs')) return 'gap';
  if (name.endsWith('.test.mjs')) return 'pass';
  return null;
}

export function listAcceptanceSources(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && classifyAcceptanceFile(full)) files.push(full);
    }
  };
  walk(dir);
  return files.sort();
}

const TITLE_CALL = /\b(?:test|serialTest)\(\s*'([^']*)'/g;

export function indexAcceptanceSources(files) {
  const errors = [];
  const tests = [];
  for (const file of files) {
    const source = normalizeNewlines(fs.readFileSync(file, 'utf8'));
    const kind = classifyAcceptanceFile(file);
    if (/\b(?:test|describe)\.(?:skip|todo)\b/.test(source)) {
      errors.push(`${file} uses skip or todo. Acceptance tests cannot be skipped.`);
    }
    const chunks = source.split(/\n(?=(?:test|serialTest)\()/);
    for (const chunk of chunks) {
      if (!/^(?:test|serialTest)\(/.test(chunk)) continue;
      if (!/\bassert\./.test(chunk)) {
        errors.push(`${file} has a test without an assert: ${chunk.slice(0, 80)}`);
      }
    }
    for (const match of source.matchAll(TITLE_CALL)) {
      tests.push({ title: match[1], file, kind });
    }
  }
  return { tests, errors };
}

export function relPosix(fromDir, file) {
  return path.relative(fromDir, file).split(path.sep).join('/');
}

export function staticAcceptanceErrors({ specText, manifest, acceptanceDir, packageRoot, packageTestScript }) {
  const errors = [];
  if (!Array.isArray(manifest.ENFORCED_MILESTONES) || manifest.ENFORCED_MILESTONES.length === 0) {
    errors.push('ENFORCED_MILESTONES must list at least one milestone.');
  }
  const extracted = extractEnforcedCriteria(specText, manifest.ENFORCED_MILESTONES || []);
  errors.push(...extracted.errors);
  errors.push(...matchManifest(extracted.criteria, manifest.criteria || []));

  const files = listAcceptanceSources(acceptanceDir);
  const indexed = indexAcceptanceSources(files);
  errors.push(...indexed.errors);

  const titlesByKind = new Map();
  for (const found of indexed.tests) {
    if (titlesByKind.has(found.title)) {
      errors.push(`Duplicate acceptance test title "${found.title}".`);
    }
    titlesByKind.set(found.title, found);
  }

  const allowed = new Set();
  for (const entry of manifest.criteria || []) {
    const title = criterionTitle(entry);
    allowed.add(title);
    const found = titlesByKind.get(title);
    const expectedKind = entry.suite === 'pass' ? 'pass' : 'gap';
    if (!found) errors.push(`${entry.id} test is missing. Expected a ${expectedKind} test named: ${title}`);
    else if (found.kind !== expectedKind) {
      errors.push(`${entry.id} is suite "${entry.suite}" but ${relPosix(packageRoot, found.file)} is a ${found.kind} file.`);
    }
    for (const breakTitle of entry.breakIt || []) {
      allowed.add(breakTitle);
      const breakFound = titlesByKind.get(breakTitle);
      if (!breakFound) errors.push(`${entry.id} break-it test is missing: ${breakTitle}`);
      else if (breakFound.kind !== expectedKind) {
        errors.push(`${entry.id} break-it "${breakTitle}" must live in a ${expectedKind} file.`);
      }
    }
  }
  for (const found of indexed.tests) {
    if (!allowed.has(found.title)) {
      errors.push(`Acceptance test is not in the manifest: ${found.title}`);
    }
  }

  const script = String(packageTestScript || '');
  if (!script.includes('acceptance-status.mjs')) {
    errors.push('The package test script must run scripts/acceptance-status.mjs so gap tests cannot be skipped.');
  }
  for (const file of files) {
    const rel = relPosix(packageRoot, file);
    if (classifyAcceptanceFile(file) === 'pass' && !script.includes(rel)) {
      errors.push(`npm test does not run green acceptance file ${rel}.`);
    }
    if (classifyAcceptanceFile(file) === 'gap' && script.includes(rel)) {
      errors.push(`npm test must not run gap file ${rel} directly; acceptance-status.mjs runs it as an expected failure.`);
    }
  }
  return { errors, extracted };
}

export function parseTap(tap) {
  const text = normalizeNewlines(tap);
  const lines = text.split('\n');
  const tests = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(ok|not ok) (\d+) - (.*)$/);
    if (!match) continue;
    const rawName = match[3].replace(/\\#/g, '#');
    const directive = /# (SKIP|TODO)\b/.exec(rawName);
    const name = rawName.replace(/\s+# (?:SKIP|TODO)\b.*$/, '').trim();
    let code = null;
    let failureType = null;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^(ok|not ok) \d+ - /.test(lines[j]) || /^1\.\.\d+/.test(lines[j])) break;
      const codeMatch = lines[j].match(/^\s+code:\s*'([^']+)'\s*$/) || lines[j].match(/^\s+code:\s*([A-Za-z0-9_]+)\s*$/);
      if (codeMatch) code = codeMatch[1];
      const failureMatch = lines[j].match(/^\s+failureType:\s*'([^']+)'\s*$/);
      if (failureMatch) failureType = failureMatch[1];
    }
    tests.push({
      ok: match[1] === 'ok',
      name,
      directive: directive ? directive[1] : null,
      code,
      failureType,
    });
  }
  const summary = {};
  for (const key of ['tests', 'pass', 'fail', 'skipped', 'todo', 'cancelled']) {
    const summaryMatch = text.match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
    summary[key] = summaryMatch ? Number(summaryMatch[1]) : null;
  }
  return { tests, summary };
}

export function gapExecutionErrors(manifestCriteria, tapText) {
  const errors = [];
  const tap = parseTap(tapText);
  if (!tap.summary.tests) errors.push('Gap suite executed zero tests.');
  if ((tap.summary.cancelled || 0) > 0) errors.push('Gap suite cancelled tests (hook failure). That is not an expected product gap.');
  if ((tap.summary.skipped || 0) > 0 || (tap.summary.todo || 0) > 0) {
    errors.push('Gap suite skipped or todo tests. Acceptance tests cannot be skipped.');
  }
  const gapEntries = (manifestCriteria || []).filter((entry) => entry.suite === 'gap');
  const breakTitles = gapEntries.flatMap((entry) => entry.breakIt || []);
  const expected = [...gapEntries.map((entry) => criterionTitle(entry)), ...breakTitles];
  for (const title of expected) {
    const found = tap.tests.find((test) => test.name === title);
    if (!found) {
      errors.push(`Gap test did not run: ${title}`);
      continue;
    }
    if (found.directive) errors.push(`Gap test ${title} was ${found.directive}.`);
    else if (found.ok) errors.push(`Gap test passed and must be promoted to the green suite: ${title}`);
    else if (found.code !== 'ERR_ASSERTION') {
      errors.push(`Gap test ${title} failed without ERR_ASSERTION (${found.code || found.failureType || 'unknown'}). Fix the test harness; do not treat a crash as a product gap.`);
    }
  }
  return { errors, tap };
}

const WATCHED_EXACT = new Set([
  'scripts/acceptance-lib.mjs',
  'scripts/acceptance-status.mjs',
  'scripts/acceptance-status.test.mjs',
  'scripts/verify.mjs',
  'tools/pixel-perfect-gate/package.json',
  '.github/workflows/ci.yml',
]);

export function isWatchedAcceptancePath(file) {
  const normalized = String(file).split('\\').join('/');
  return normalized.startsWith('tools/pixel-perfect-gate/tests/') || WATCHED_EXACT.has(normalized);
}

/**
 * @returns {{ok: boolean, changed: string[], message: string}}
 */
export function acceptanceEditRequiresRationale(nameStatus, prBody) {
  const changed = [];
  for (const line of normalizeNewlines(nameStatus).split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0];
    if (status.startsWith('A')) continue;
    for (const file of parts.slice(1)) {
      if (isWatchedAcceptancePath(file)) changed.push(`${status} ${file}`);
    }
  }
  if (changed.length === 0) {
    return { ok: true, changed, message: '' };
  }
  const body = String(prBody || '');
  if (/Acceptance-test change rationale:\s*\S/.test(body)) {
    return { ok: true, changed, message: '' };
  }
  return {
    ok: false,
    changed,
    message:
      'Existing acceptance tests or the acceptance gate changed. The PR body must include a line starting with "Acceptance-test change rationale:" explaining why. Do not weaken a test to make it pass.\n' +
      changed.map((line) => `  ${line}`).join('\n'),
  };
}
