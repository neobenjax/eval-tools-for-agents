/**
 * M2.2 cross-harness skill gap tests. Every test fails with ERR_ASSERTION until the product meets it.
 * M1-AC-01 through M1-AC-15 are green. M2-AC-01 through M2-AC-37 are gaps. ENFORCED_MILESTONES is M1 and M2.
 * Promote to tests/acceptance/m2/*.test.mjs, check the section 8 box, and set suite to "pass" together
 * (SPEC.md section 13). Section 6: schemaVersion 1; gates.gate1/gate2/gate3; findings[].id is the stable
 * branch key; error is null or { message }; a skipped gate is { passed: true, skipped: true, reason };
 * --help and --version are the only non-JSON exits. Playwright is pinned to 1.65.1. mismatchPct blocks
 * on ubuntu-latest; Windows and macOS report it (guard process.platform !== "win32").
 * Editing this file requires "Acceptance-test change rationale:" in the PR body.
 * Cross-harness SKILL.md.
 * The skill lives at tools/pixel-perfect-gate/skills/pixel-perfect-gate/SKILL.md so the installer
 * can link the whole directory under the skill name `pixel-perfect-gate`.
 * The text checks are in ../m2-skill-checks.mjs so M2-AC-28 can run the same check on mutated copies.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import { repoRoot, pkgRoot, runNode, skillFile } from '../m2-helpers.mjs';
import {
  checkboxLines,
  iterationCapProblems,
  mcpAidProblems,
  modeGuidanceProblems,
  parseFrontmatter,
  parseReportProblems,
  playwrightReplayProblems,
  proseOnlyValidationClaims,
  repoPathProblems,
  usesGlobalCommand,
} from '../m2-skill-checks.mjs';

function skillText() {
  assert.ok(fs.existsSync(skillFile), `the skill file must exist at ${path.relative(repoRoot, skillFile)}`);
  return fs.readFileSync(skillFile, 'utf8');
}

serialTest('M2-AC-23: `SKILL.md` tells the agent to run the global `pixel-gate` command, not a path into this repo.', () => {
  const text = skillText();
  const meta = parseFrontmatter(text);
  assert.ok(meta, 'SKILL.md starts with YAML frontmatter');
  assert.equal(meta.name, 'pixel-perfect-gate', 'the skill name matches the directory and the installed link name');
  assert.ok(meta.description && meta.description.trim().length > 0, 'the frontmatter has a non-empty description');
  assert.equal(usesGlobalCommand(text), true, 'a code line runs the global `pixel-gate` command');
  assert.deepEqual(repoPathProblems(text), [], 'the skill never points the agent at a path inside this repository');
});

serialTest('M2-AC-24: The skill tells the agent to parse the section 6 JSON and to stop after 5 iterations even if `passed` is still false.', () => {
  const text = skillText();
  assert.deepEqual(parseReportProblems(text), [], 'the skill tells the agent to parse the section 6 JSON (passed, findings, exit code)');
  assert.deepEqual(iterationCapProblems(text), [], 'the skill caps the loop at 5 iterations even when passed is still false');
  assert.match(text, /--iteration/, 'the skill tells the agent to pass --iteration');
});

serialTest('M2-AC-25: The skill tells the agent to write a Playwright `.spec.ts` that replays the scenario file.', () => {
  assert.deepEqual(playwrightReplayProblems(skillText()), []);
});

serialTest('M2-AC-26: The skill states when to use pixel mode and when to use wireframe mode (pixel when a committed PNG exists; wireframe when the reference is a structural sketch).', () => {
  assert.deepEqual(modeGuidanceProblems(skillText()), []);
});

serialTest('M2-AC-27: The skill states that optional host `chrome-devtools-mcp` inspection is an aid only and cannot change `passed`, `findings`, or `exitCode`.', () => {
  assert.deepEqual(mcpAidProblems(skillText()), []);
});

serialTest('M2-AC-28: A test reads the skill file and fails if the 5-iteration cap is missing.', () => {
  const text = skillText();
  assert.deepEqual(iterationCapProblems(text), [], 'the real skill has the 5-iteration cap');
  const mutations = {
    'cap sentence removed': text
      .split('\n')
      .filter((line) => !/iteration/i.test(line))
      .join('\n'),
    'cap raised to 10': text.replace(/(?<![\d.])5(?![\d.])/g, '10'),
    'cap raised to 50': text.replace(/(?<![\d.])5(?![\d.])/g, '50'),
    'cap without the even-if-passed-is-false rule': text.replace(/even (?:if|when)[^.\n]*passed[^.\n]*/gi, 'when appropriate'),
    'stop wording removed': text.replace(/\b(stop|halt|end)\b/gi, 'continue'),
  };
  for (const [label, mutated] of Object.entries(mutations)) {
    assert.notEqual(mutated, text, `${label}: the mutation must change the skill text`);
    assert.ok(iterationCapProblems(mutated).length > 0, `${label}: the cap check must fail`);
  }
});

serialTest('M2-AC-29: No acceptance line of the form "passes skill structure validation" unless a checker exists in this repo and the test runs it. Do not add a prose-only validation claim.', async () => {
  const text = skillText();
  const checkerPath = path.join(pkgRoot, 'scripts', 'validate-skill.mjs');
  let hasChecker = false;
  if (fs.existsSync(checkerPath)) {
    const run = await runNode([checkerPath]);
    assert.equal(run.code, 0, `validate-skill.mjs must pass (stderr=${run.stderr})`);
    hasChecker = true;
  }
  assert.deepEqual(proseOnlyValidationClaims(text, hasChecker), [], 'SKILL.md makes no prose-only validation claim');
  const contexts = ['CONTEXT.md', path.join('tools', 'pixel-perfect-gate', 'CONTEXT.md'), 'README.md'];
  for (const rel of contexts) {
    const file = path.join(repoRoot, rel);
    if (!fs.existsSync(file)) continue;
    assert.deepEqual(proseOnlyValidationClaims(fs.readFileSync(file, 'utf8'), hasChecker), [], `${rel} makes no prose-only validation claim`);
  }
  const spec = fs.readFileSync(path.join(repoRoot, 'SPEC.md'), 'utf8');
  const claimLines = checkboxLines(spec).filter((line) => !/No acceptance line of the form/.test(line));
  assert.deepEqual(proseOnlyValidationClaims(claimLines.join('\n'), hasChecker), [], 'no section 8 checkbox claims skill structure validation without a checker');
});

serialTest('M2-AC-29 break-it: a validation claim without a checker script is detected', () => {
  assert.ok(fs.existsSync(skillFile), 'the skill file must exist before the claim scan means anything');
  const claim = 'The skill passes skill structure validation.';
  assert.deepEqual(proseOnlyValidationClaims(claim, false), [claim], 'the claim is flagged when no checker exists');
  assert.deepEqual(proseOnlyValidationClaims(claim, true), [], 'the claim is allowed when a checker exists');
  assert.deepEqual(proseOnlyValidationClaims('The skill has a clear description.', false), [], 'unrelated text is not flagged');
});
