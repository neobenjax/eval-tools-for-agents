/**
 * Green break-its under still-unchecked M2b criteria.
 * Registered in the manifest as { title, suite: "pass" }. The section 8 boxes stay unchecked.
 * M2b-AC-59 checkers already pass against a complete fixture string.
 * M2b-AC-19 and M2b-AC-23 lock behavior the current CLI already has.
 */
import assert from 'node:assert/strict';
import { serialTest } from '../harness.mjs';
import { freshDir, runGate, withServer } from '../m2-helpers.mjs';
import { completeSkillText, skillRuleProblems } from '../m2b-skill-checks.mjs';

serialTest('M2b-AC-19 break-it: a Gate 1 finding does not grow refBox, expected, or actual keys', async () => {
  await withServer(async (server) => {
    const cwd = freshDir('m2b', 'ac19-gate1');
    const result = await runGate(cwd, ['--url', `${server.baseUrl}/broken-layout.html`]);
    assert.equal(result.json && result.json.schemaVersion, 1);
    assert.ok(Array.isArray(result.json.findings) && result.json.findings.length >= 1);
    for (const finding of result.json.findings) {
      assert.equal(Object.hasOwn(finding, 'refBox'), false);
      assert.equal(Object.hasOwn(finding, 'expected'), false);
      assert.equal(Object.hasOwn(finding, 'actual'), false);
    }
  });
});

serialTest('M2b-AC-23 break-it: with pwa omitted, a page is not failed for installability', async () => {
  await withServer(async (server) => {
    const cwd = freshDir('m2b', 'ac23-omit');
    const result = await runGate(cwd, ['--url', `${server.baseUrl}/m2/site/home.html`]);
    assert.equal(result.json && result.json.schemaVersion, 1);
    const ids = (result.json.findings || []).map((finding) => finding.id);
    assert.equal(ids.some((id) => String(id).startsWith('gate1.pwa-installability.')), false);
    assert.equal(result.json.gates && result.json.gates.gate1 && result.json.gates.gate1.pwa, undefined);
  });
});

serialTest('M2b-AC-59 break-it: deleting one playbook heading from a complete skill is detected', async () => {
  const text = completeSkillText().replace('## Playbook: screenshot\n', '');
  const problems = skillRuleProblems(text);
  assert.ok(problems.some((problem) => problem.includes('## Playbook: screenshot')));
});

serialTest('M2b-AC-59 break-it: a skill that keeps every required rule has no problems', async () => {
  assert.deepEqual(skillRuleProblems(completeSkillText()), []);
});

serialTest('M2b-AC-59 break-it: an extra playbook heading does not fail the checker', async () => {
  const text = `${completeSkillText()}\n## Playbook: extra\nRun pixel-gate first. tier A applies. Optional MCP: Playwright helps.\n`;
  assert.deepEqual(skillRuleProblems(text), []);
});
