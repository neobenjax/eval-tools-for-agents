/**
 * M3-AC-04 is green. It reads the section 4 Depends on list for the viewer row.
 * Break-its run this parser on scratch spec text. No product command is involved.
 * No assert in this file is OS-specific.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const REQUIRED = ['SIDE-24', 'SIDE-19'];
const specPath = path.resolve(import.meta.dirname, '../../../../../SPEC.md');

function section4Body(specText) {
  const spec = String(specText).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const start = spec.indexOf('## 4.');
  const end = spec.indexOf('\n## 5.');
  if (start === -1 || end === -1 || end <= start) return null;
  return spec.slice(start, end);
}

/** Issue ids after `Depends on:` on the single section 4 row for `key`, in file order. */
export function section4DependsOn(specText, key) {
  const body = section4Body(specText);
  if (body == null) return { ids: null, error: 'section 4 not found' };
  const rows = [];
  for (const line of body.split('\n')) {
    const match = line.match(/^- \[[ x]\] \*\*((?:SIDE|RS)-\d+)\*\*(.*)$/);
    if (match && match[1] === key) rows.push(match[2]);
  }
  if (rows.length !== 1) {
    return { ids: null, error: rows.length === 0 ? 'missing row' : 'duplicate row' };
  }
  const depends = rows[0].match(/Depends on:\s*([^·\n]*)/);
  if (!depends) return { ids: [], error: null };
  const raw = depends[1].trim();
  if (raw === '' || raw.toLowerCase() === 'none') return { ids: [], error: null };
  return { ids: raw.split(',').map((id) => id.trim()).filter(Boolean), error: null };
}

/** Empty when `key`'s section 4 Depends on list is exactly `required`, in any order, with no duplicates. */
export function dependencyProblems(specText, key, required) {
  const parsed = section4DependsOn(specText, key);
  if (parsed.error) return [parsed.error];
  const problems = [];
  const seen = new Set();
  for (const id of parsed.ids) {
    if (seen.has(id)) problems.push(`duplicate ${id}`);
    seen.add(id);
    if (!required.includes(id)) problems.push(`extra ${id}`);
  }
  for (const id of required) {
    if (!parsed.ids.includes(id)) problems.push(`missing ${id}`);
  }
  return problems;
}

function scratchSpec(dependsOn) {
  return [
    '## 4. Matrix',
    '',
    `- [ ] **SIDE-23** \`[M3.1]\` viewer *(Integration · Depends on: ${dependsOn} · Todo)*`,
    '',
    '## 5. Next',
    '',
  ].join('\n');
}

test('M3-AC-04: The viewer\'s dependency in Linear `blockedBy` is `SIDE-24` and `SIDE-19`.', () => {
  const spec = fs.readFileSync(specPath, 'utf8');
  assert.deepEqual(dependencyProblems(spec, 'SIDE-23', REQUIRED), []);
  const parsed = section4DependsOn(spec, 'SIDE-23');
  assert.deepEqual([...parsed.ids].sort(), [...REQUIRED].sort());
  assert.equal(parsed.ids.length, REQUIRED.length);
  const rowAt = spec.indexOf('**SIDE-23**');
  const dependsAt = spec.indexOf('Depends on: SIDE-24, SIDE-19', rowAt);
  assert.ok(rowAt !== -1 && dependsAt > rowAt);
  const from = 'Depends on: SIDE-24, SIDE-19';
  const flipped = `${spec.slice(0, dependsAt)}Depends on: SIDE-19, SIDE-24${spec.slice(dependsAt + from.length)}`;
  assert.deepEqual(section4DependsOn(flipped, 'SIDE-23').ids, ['SIDE-19', 'SIDE-24']);
  assert.deepEqual(dependencyProblems(flipped, 'SIDE-23', REQUIRED), []);
  assert.deepEqual(section4DependsOn(flipped, 'SIDE-27').ids, section4DependsOn(spec, 'SIDE-27').ids);
});

test('M3-AC-04 break-it: an extra dependency id is rejected', () => {
  const problems = dependencyProblems(scratchSpec('SIDE-24, SIDE-19, SIDE-190'), 'SIDE-23', REQUIRED);
  assert.deepEqual(problems, ['extra SIDE-190']);
});

test('M3-AC-04 break-it: a missing dependency id is rejected', () => {
  const problems = dependencyProblems(scratchSpec('SIDE-24'), 'SIDE-23', REQUIRED);
  assert.deepEqual(problems, ['missing SIDE-19']);
});

test('M3-AC-04 break-it: a duplicate dependency id is rejected', () => {
  const problems = dependencyProblems(scratchSpec('SIDE-24, SIDE-19, SIDE-24'), 'SIDE-23', REQUIRED);
  assert.deepEqual(problems, ['duplicate SIDE-24']);
});
