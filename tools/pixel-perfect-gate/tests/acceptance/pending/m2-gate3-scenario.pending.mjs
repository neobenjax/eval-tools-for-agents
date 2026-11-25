/**
 * SIDE-19 (M2.1) scenario runner. `pixel-gate --config <file> --scenario <id>` replays the steps in the
 * scenario file and stops on the first failed step.
 * Step shapes: goto{url}, click{selector}, fill{selector,value}, toggle{selector},
 * wait{ms} or wait{selector,state}; any step may carry timeoutMs.
 * The fixture server records fetches to /__<name>, so a test proves what really happened in the page.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  envelopeProblems,
  findingsOf,
  gate3Findings,
  isPng,
  makeRepo,
  runGate,
  withServer,
} from '../m2-helpers.mjs';

const INTERACTIVE = '/m2/site/interactive.html';

function modalScenario(id = 'open-modal-and-submit', name = 'Ada') {
  return {
    id,
    steps: [
      { action: 'goto', url: INTERACTIVE },
      { action: 'click', selector: '#open-modal' },
      { action: 'wait', selector: '#modal', state: 'visible' },
      { action: 'fill', selector: '#name', value: name },
      { action: 'toggle', selector: '#newsletter' },
      { action: 'toggle', selector: '#digest' },
      { action: 'click', selector: '#submit' },
      { action: 'wait', selector: '#thanks', state: 'visible' },
      { action: 'wait', ms: 50 },
    ],
  };
}

async function runScenario(name, scenarios, id, body, extraArgs = []) {
  return withServer(async (server) => {
    const { repo, configPath } = makeRepo(name, server.baseUrl, {
      refs: [],
      config: { routes: [], scenarios: 'scenarios.json' },
      files: { 'scenarios.json': JSON.stringify({ scenarios }) },
    });
    const result = await runGate(repo, ['--config', configPath, '--scenario', id, ...extraArgs]);
    return body({ result, server, repo });
  });
}

function submitEvents(server) {
  return server.events.filter((e) => e.name === 'submit');
}

serialTest('M2-AC-15: A fixture opens a modal, flips a toggle, and submits a labeled form, and exits `0`.', async () => {
  const scenario = modalScenario();
  await runScenario('ac15', [scenario], scenario.id, async ({ result, server }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 0, `the scenario must pass (findings: ${JSON.stringify(findingsOf(result.json))})`);
    assert.equal(result.json.passed, true);
    assert.equal(result.json.exitCode, 0);
    const gate3 = result.json.gates.gate3;
    assert.equal(gate3.passed, true);
    assert.ok(Array.isArray(gate3.scenarios) && gate3.scenarios.length === 1, 'gates.gate3.scenarios lists the scenario that ran');
    const ran = gate3.scenarios[0];
    assert.equal(ran.id, scenario.id);
    assert.equal(ran.passed, true);
    assert.ok(Array.isArray(ran.steps), 'each scenario lists its steps');
    assert.deepEqual(
      ran.steps.map((s) => s.action),
      scenario.steps.map((s) => s.action),
      'every step ran, in file order'
    );
    assert.ok(ran.steps.every((s) => s.passed === true), 'every step passed');
    const submits = submitEvents(server);
    assert.equal(submits.length, 1, 'the form was really submitted once');
    assert.deepEqual(
      submits[0].query,
      { name: 'Ada', newsletter: '1', digest: '0' },
      'fill typed Ada; toggle turned the unchecked box on and the checked box off'
    );
  });
});

serialTest('M2-AC-15 break-it: fill sends the value verbatim, including spaces and ampersands', async () => {
  const scenario = modalScenario('verbatim', 'Ada Lovelace & Co');
  await runScenario('ac15-verbatim', [scenario], scenario.id, async ({ result, server }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 0);
    const submits = submitEvents(server);
    assert.equal(submits.length, 1);
    assert.equal(submits[0].query.name, 'Ada Lovelace & Co');
  });
});

serialTest('M2-AC-16: A broken step returns `passed: false`, exit `1`, and a finding with the step selector, the action name, and a screenshot path under `.visual-eval/`.', async () => {
  const scenario = {
    id: 'broken-step',
    steps: [
      { action: 'goto', url: INTERACTIVE },
      { action: 'click', selector: '#open-modal' },
      { action: 'click', selector: '#does-not-exist', timeoutMs: 500 },
      { action: 'click', selector: '#marker' },
    ],
  };
  await runScenario('ac16', [scenario], scenario.id, async ({ result, server, repo }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 1, 'a broken step exits 1');
    assert.equal(result.json.passed, false);
    assert.equal(result.json.exitCode, 1);
    assert.equal(result.json.error, null, 'a failed step is a gate failure, not a crashed run');
    const finding = gate3Findings(result.json).find((f) => f.id === 'gate3.scenario.broken-step.3' || f.id === 'gate3.scenario.broken-step');
    assert.ok(finding, `expected gate3.scenario.broken-step(.3), got ${JSON.stringify(findingsOf(result.json).map((f) => f.id))}`);
    assert.equal(finding.severity, 'fail');
    assert.equal(finding.selector, '#does-not-exist', 'the finding carries the step selector');
    const action = finding.action || (typeof finding.text === 'string' && /click/.test(finding.text) ? 'click' : null);
    assert.equal(action, 'click', 'the finding carries the action name');
    assert.ok(/click/.test(finding.text) || finding.action === 'click', 'the finding names the action');
    assert.equal(finding.box, null, 'an element that does not exist has no box');
    const screenshot = finding.screenshot || finding.artifacts?.screenshot;
    assert.equal(typeof screenshot, 'string', 'the finding carries a screenshot path');
    const shot = path.resolve(repo, screenshot);
    const rel = path.relative(path.join(repo, '.visual-eval'), shot);
    assert.ok(!rel.startsWith('..') && !path.isAbsolute(rel), `screenshot ${shot} must be under .visual-eval/`);
    assert.ok(isPng(shot), 'the screenshot is a real PNG file');
    const steps = result.json.gates.gate3.scenarios?.[0]?.steps;
    assert.ok(Array.isArray(steps), 'the scenario lists the steps that ran');
    assert.equal(steps.length, 3, 'the runner stops at the first failed step');
    assert.equal(steps[2].passed, false);
    assert.equal(server.events.some((e) => e.name === 'after-failure'), false, 'the step after the failure never ran');
  });
});

serialTest('M2-AC-16 break-it: a control that exists but is covered fails with the same finding shape', async () => {
  const scenario = {
    id: 'blocked-click',
    steps: [
      { action: 'goto', url: INTERACTIVE },
      { action: 'click', selector: '#blocked', timeoutMs: 500 },
    ],
  };
  await runScenario('ac16-blocked', [scenario], scenario.id, async ({ result, server, repo }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 1);
    const finding = gate3Findings(result.json).find((f) => f.id === 'gate3.scenario.blocked-click.2' || f.id === 'gate3.scenario.blocked-click');
    assert.ok(finding, `expected gate3.scenario.blocked-click(.2), got ${JSON.stringify(findingsOf(result.json).map((f) => f.id))}`);
    assert.equal(finding.selector, '#blocked');
    const action = finding.action || (typeof finding.text === 'string' && /click/.test(finding.text) ? 'click' : null);
    assert.equal(action, 'click');
    assert.ok(finding.box && finding.box.width > 0 && finding.box.height > 0, 'an element that exists reports its box');
    const screenshot = finding.screenshot || finding.artifacts?.screenshot;
    assert.ok(isPng(path.resolve(repo, String(screenshot))), 'a screenshot PNG is written');
    assert.equal(server.events.some((e) => e.name === 'blocked-click'), false, 'the covered button was never clicked');
  });
});

serialTest('M2-AC-16 break-it: a wait step whose selector never appears fails', async () => {
  const scenario = {
    id: 'never-visible',
    steps: [
      { action: 'goto', url: INTERACTIVE },
      { action: 'wait', selector: '#thanks', state: 'visible', timeoutMs: 500 },
    ],
  };
  await runScenario('ac16-wait', [scenario], scenario.id, async ({ result, repo }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 1);
    const finding = gate3Findings(result.json).find((f) => f.id === 'gate3.scenario.never-visible.2' || f.id === 'gate3.scenario.never-visible');
    assert.ok(finding, `expected gate3.scenario.never-visible(.2), got ${JSON.stringify(findingsOf(result.json).map((f) => f.id))}`);
    const action = finding.action || (typeof finding.text === 'string' && /wait/.test(finding.text) ? 'wait' : null);
    assert.equal(action, 'wait');
    assert.equal(finding.selector, '#thanks');
    const screenshot = finding.screenshot || finding.artifacts?.screenshot;
    assert.ok(fs.existsSync(path.resolve(repo, String(screenshot))), 'a screenshot path that exists is reported');
  });
});

serialTest('M2-AC-17: The runner performs the steps in the scenario file. It does not infer a flow from the static scan.', async () => {
  const scenario = {
    id: 'reordered',
    steps: [
      { action: 'goto', url: '/m2/site/click-order.html' },
      { action: 'click', selector: '#b' },
      { action: 'click', selector: '#a' },
      { action: 'click', selector: '#c' },
    ],
  };
  await runScenario('ac17', [scenario], scenario.id, async ({ result, server }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 0);
    assert.deepEqual(
      server.events.filter((e) => e.name === 'click').map((e) => e.query.id),
      ['b', 'a', 'c'],
      'steps run in scenario-file order, not DOM order, and nothing else is clicked (not the href="#" link)'
    );
    assert.equal(result.json.gates.gate3.scenarios?.[0]?.steps?.length, 4);
  });
});

serialTest('M2-AC-17 break-it: a scenario with one goto step clicks nothing even though the page has controls', async () => {
  const scenario = { id: 'only-goto', steps: [{ action: 'goto', url: '/m2/site/click-order.html' }] };
  await runScenario('ac17-goto', [scenario], scenario.id, async ({ result, server }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 0);
    assert.equal(result.json.gates.gate3.scenarios?.[0]?.steps?.length, 1, 'only the listed step ran');
    assert.deepEqual(server.events, [], 'no click or fetch was inferred from the page');
  });
});

serialTest('M2-AC-17 break-it: an unknown scenario id fails closed and runs nothing', async () => {
  const scenario = { id: 'known', steps: [{ action: 'goto', url: '/m2/site/click-order.html' }, { action: 'click', selector: '#a' }] };
  await runScenario('ac17-unknown', [scenario], 'nope', async ({ result, server }) => {
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints one section 6 object');
    assert.equal(result.code, 1, 'an unknown scenario id is a failed run');
    assert.equal(result.json.passed, false);
    assert.ok(JSON.stringify(result.json).includes('nope'), 'the report names the unknown scenario id');
    assert.equal(server.requests.length, 0, 'no page was loaded and no other scenario was run instead');
  });
});
