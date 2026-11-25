/**
 * M2b.9 skill playbooks. The product SKILL.md does not exist yet, so each
 * checker fails with ERR_ASSERTION against an empty file.
 */
import assert from 'node:assert/strict';
import { serialTest } from '../harness.mjs';
import { skillText } from '../m2b-helpers.mjs';
import {
  advisoryRuleProblems,
  copyrightRuleProblems,
  loopRuleProblems,
  mcpContextProblems,
  playbookProblems,
  skillRuleProblems,
  splitLoopProblems,
} from '../m2b-skill-checks.mjs';

serialTest('M2b-AC-53: `SKILL.md` has one playbook per `reference.kind` (cases 1–5 in section 12.1): which command to run first, which tier applies, and which optional MCP servers help.', async () => {
  assert.deepEqual(playbookProblems(skillText()), []);
});

serialTest('M2b-AC-54: The skill tells the agent to obey `loop.continue` and `loop.stopReason`, and to return to `loop.best.iteration` on `regression`.', async () => {
  assert.deepEqual(loopRuleProblems(skillText()), []);
});

serialTest('M2b-AC-55: The skill tells the agent to check whether Figma, Penpot, Sketch, WordPress, Playwright, or Chrome DevTools MCP servers are enabled and to use them only for context, never to change `passed`.', async () => {
  assert.deepEqual(mcpContextProblems(skillText()), []);
});

serialTest("M2b-AC-56: The skill tells the agent to show the user the copyright disclaimer before a `url` capture and never to set `reference.acknowledgeCopyright` or pass `--acknowledge-copyright` on the user's behalf.", async () => {
  assert.deepEqual(copyrightRuleProblems(skillText()), []);
});

serialTest('M2b-AC-57: The skill tells the agent to split a large migration into separate loops (one `runId` per route or small route group) instead of exceeding 5 iterations, and never to move `scenarios.draft.json` entries into the scenario file itself (a human approves them).', async () => {
  assert.deepEqual(splitLoopProblems(skillText()), []);
});

serialTest('M2b-AC-58: The skill tells the agent that tier B/C results are advisory: keep looping toward the similarity target, but never report the route as failed because of them.', async () => {
  assert.deepEqual(advisoryRuleProblems(skillText()), []);
});

serialTest('M2b-AC-59: A test reads the skill file and fails if any of the five playbooks, the `loop.continue` rule, the copyright-acknowledgement rule, the advisory rule, the split-loops rule, or the draft-scenario rule is missing.', async () => {
  assert.deepEqual(skillRuleProblems(skillText()), []);
});
