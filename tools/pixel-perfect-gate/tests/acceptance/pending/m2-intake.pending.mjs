/**
 * SIDE-26 (M2.0b) spec intake: reference PNGs keyed by route and viewport, the markdown acceptance
 * list, missing references, and the section 5 determinism checks that need a project fixture.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  baseConfig,
  ciWorkflowPath,
  envelopeProblems,
  findingsOf,
  findingIds,
  freshDir,
  m2Fixtures,
  makeRepo,
  runGate,
  snapshotTree,
  diffTrees,
  startSink,
  withServer,
  writeConfig,
} from '../m2-helpers.mjs';

const ROUTES_TWO = [
  { id: 'home', path: '/m2/site/home.html', referenceRequired: true },
  { id: 'about', path: '/m2/site/about.html', referenceRequired: false },
];

const SCENARIOS = {
  scenarios: [
    { id: 'open-modal', steps: [{ action: 'goto', url: '/m2/site/interactive.html' }] },
    { id: 'submit-form', steps: [{ action: 'goto', url: '/m2/site/interactive.html' }] },
  ],
};

const ACCEPTANCE_OK = [
  '# Acceptance list',
  '',
  'Free text under the title is ignored.',
  '',
  '## open-modal: Visitor opens the signup modal',
  '',
  '- The modal opens.',
  '',
  '## submit-form',
  '',
  '- The form submits.',
  '',
].join('\n');

function intakeRepo(name, baseUrl, { acceptance = ACCEPTANCE_OK, scenarios = SCENARIOS, refs = ['home/desktop', 'home/mobile'] } = {}) {
  return makeRepo(name, baseUrl, {
    refs,
    config: { acceptance: 'acceptance.md', scenarios: 'scenarios.json' },
    files: { 'acceptance.md': acceptance, 'scenarios.json': JSON.stringify(scenarios) },
  });
}

function gate3Ids(report) {
  return findingIds(report).filter((id) => id.startsWith('gate3.'));
}

serialTest('M2-AC-06: Reference PNGs are keyed by route id and viewport name, as in section 7.', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac06', server.baseUrl, {
      refs: ['home/desktop', 'home/mobile', 'about/desktop'],
      config: { routes: ROUTES_TWO },
    });
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.equal(result.code, 0, `all keyed references pass (findings: ${findingIds(result.json).join(', ')})`);
    const checks = result.json.gates.gate2.checks;
    assert.ok(Array.isArray(checks), 'config runs report gates.gate2.checks[]');
    const keys = checks.map((c) => `${c.route}/${c.viewport}`).sort();
    assert.deepEqual(keys, ['about/desktop', 'home/desktop', 'home/mobile'], 'one check per route and viewport that has a reference');
    for (const check of checks) {
      const expected = path.join('references', check.route, `${check.viewport}.png`);
      assert.ok(
        path.normalize(String(check.reference)).endsWith(expected),
        `${check.route}/${check.viewport} reads ${expected}, got ${check.reference}`
      );
    }
    assert.equal(
      findingIds(result.json).some((id) => id.includes('missing-reference')),
      false,
      'about/mobile has no reference and referenceRequired false, so it is not a finding'
    );
  });
});

serialTest('M2-AC-06 break-it: a PNG in the wrong viewport slot fails only that route and viewport', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac06-wrongslot', server.baseUrl);
    fs.copyFileSync(
      path.join(repo, 'references', 'home', 'desktop.png'),
      path.join(repo, 'references', 'home', 'mobile.png')
    );
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.equal(result.code, 1, 'a 400x300 PNG in the 200x300 mobile slot fails');
    const checks = result.json.gates.gate2.checks;
    assert.ok(Array.isArray(checks), 'config runs report gates.gate2.checks[]');
    const desktop = checks.find((c) => c.route === 'home' && c.viewport === 'desktop');
    const mobile = checks.find((c) => c.route === 'home' && c.viewport === 'mobile');
    assert.equal(desktop && desktop.passed, true, 'home/desktop still passes');
    assert.equal(mobile && mobile.passed, false, 'home/mobile fails on its own reference');
  });
});

serialTest('M2-AC-06 break-it: flat file names such as home-desktop.png are not read', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac06-flat', server.baseUrl, { refs: ['home/mobile'] });
    fs.copyFileSync(
      path.join(repo, 'references', 'home', 'mobile.png'),
      path.join(repo, 'references', 'home-desktop.png')
    );
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.equal(result.code, 1, 'home-desktop.png is not the keyed path references/home/desktop.png');
    assert.ok(
      findingIds(result.json).includes('gate2.missing-reference.home.desktop'),
      `expected gate2.missing-reference.home.desktop, got ${findingIds(result.json).join(', ')}`
    );
  });
});

serialTest('M2-AC-07: A markdown acceptance list maps each scenario heading to a scenario id. An unmapped heading and an unmapped scenario each produce a finding and exit `1`.', async () => {
  await withServer(async (server) => {
    const ok = intakeRepo('ac07-ok', server.baseUrl);
    const mapped = await runGate(ok.repo, []);
    assert.deepEqual(envelopeProblems(mapped.json), [], 'the run prints a section 6 object');
    assert.deepEqual(gate3Ids(mapped.json), [], 'every heading maps to a scenario and every scenario to a heading');
    assert.equal(mapped.code, 0, 'a fully mapped list passes');

    const extraHeading = intakeRepo('ac07-heading', server.baseUrl, {
      acceptance: `${ACCEPTANCE_OK}\n## Checkout flow\n\n- Pays.\n`,
    });
    const unmappedHeading = await runGate(extraHeading.repo, []);
    assert.equal(unmappedHeading.code, 1, 'an unmapped heading exits 1');
    const headingFinding = findingsOf(unmappedHeading.json).find((f) => f.id === 'gate3.unmapped-acceptance.checkout-flow');
    assert.ok(headingFinding, `expected gate3.unmapped-acceptance.checkout-flow, got ${findingIds(unmappedHeading.json).join(', ')}`);
    assert.equal(headingFinding.severity, 'fail');
    assert.equal(headingFinding.gate, 'gate3');

    const extraScenario = intakeRepo('ac07-scenario', server.baseUrl, {
      scenarios: {
        scenarios: [...SCENARIOS.scenarios, { id: 'ghost-scenario', steps: [{ action: 'goto', url: '/m2/site/interactive.html' }] }],
      },
    });
    const unmappedScenario = await runGate(extraScenario.repo, []);
    assert.equal(unmappedScenario.code, 1, 'an unmapped scenario exits 1');
    const scenarioFinding = findingsOf(unmappedScenario.json).find((f) => f.id === 'gate3.unmapped-scenario.ghost-scenario');
    assert.ok(scenarioFinding, `expected gate3.unmapped-scenario.ghost-scenario, got ${findingIds(unmappedScenario.json).join(', ')}`);
    assert.equal(scenarioFinding.severity, 'fail');
    assert.equal(scenarioFinding.gate, 'gate3');
  });
});

serialTest('M2-AC-07 break-it: an unmapped heading is the only finding when every scenario has a heading', async () => {
  await withServer(async (server) => {
    const { repo } = intakeRepo('ac07-only-heading', server.baseUrl, {
      acceptance: `${ACCEPTANCE_OK}\n## Checkout flow\n`,
    });
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.deepEqual(gate3Ids(result.json), ['gate3.unmapped-acceptance.checkout-flow'], 'exactly one gate3 finding');
    assert.equal(result.code, 1);
  });
});

serialTest('M2-AC-07 break-it: an unmapped scenario is the only finding when every heading has a scenario', async () => {
  await withServer(async (server) => {
    const { repo } = intakeRepo('ac07-only-scenario', server.baseUrl, {
      scenarios: { scenarios: [...SCENARIOS.scenarios, { id: 'ghost-scenario', steps: [{ action: 'goto', url: '/m2/site/interactive.html' }] }] },
    });
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.deepEqual(gate3Ids(result.json), ['gate3.unmapped-scenario.ghost-scenario'], 'exactly one gate3 finding');
    assert.equal(result.code, 1);
  });
});

serialTest('M2-AC-07 break-it: only level 2 headings are scenario headings and the id must match exactly', async () => {
  await withServer(async (server) => {
    const acceptance = [
      '# Title is not a scenario',
      '## open-modal: Visitor opens the signup modal',
      '### Details are not a scenario',
      '## submit-form-extra',
      '',
    ].join('\n');
    const { repo } = intakeRepo('ac07-levels', server.baseUrl, { acceptance });
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.deepEqual(
      gate3Ids(result.json).sort(),
      ['gate3.unmapped-acceptance.submit-form-extra', 'gate3.unmapped-scenario.submit-form'],
      'the # title and ### heading are ignored; a near-miss id is unmapped in both directions'
    );
  });
});

serialTest('M2-AC-08: A configured route with no reference PNG fails with `gate2.missing-reference.<route-id>.<viewport-name>`.', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac08', server.baseUrl, { refs: ['home/desktop'] });
    const before = snapshotTree(repo);
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.equal(result.code, 1, 'a required reference that is missing fails the run');
    assert.equal(result.json.passed, false);
    const finding = findingsOf(result.json).find((f) => f.id === 'gate2.missing-reference.home.mobile');
    assert.ok(finding, `expected gate2.missing-reference.home.mobile, got ${findingIds(result.json).join(', ')}`);
    assert.equal(finding.gate, 'gate2');
    assert.equal(finding.severity, 'fail');
    assert.equal(finding.selector, '');
    assert.equal(finding.box, null);
    assert.equal(
      findingIds(result.json).includes('gate2.missing-reference.home.desktop'),
      false,
      'the viewport that has a reference is not reported missing'
    );
    const checks = result.json.gates.gate2.checks;
    assert.ok(Array.isArray(checks), 'config runs report gates.gate2.checks[]');
    assert.equal(checks.find((c) => c.route === 'home' && c.viewport === 'desktop')?.passed, true, 'the present reference is still compared');
    const diff = diffTrees(before, snapshotTree(repo));
    assert.equal(
      fs.existsSync(path.join(repo, 'references', 'home', 'mobile.png')),
      false,
      'the run does not invent a screenshot and save it as the reference'
    );
    for (const file of diff.added) assert.ok(file.startsWith('.visual-eval/'), `wrote outside .visual-eval/: ${file}`);
  });
});

serialTest('M2-AC-08 break-it: referenceRequired false with no PNG is not a finding', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac08-optional', server.baseUrl, {
      refs: ['home/desktop', 'home/mobile'],
      config: { routes: ROUTES_TWO },
    });
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.equal(result.code, 0, 'about has no reference and does not require one');
    assert.equal(
      findingIds(result.json).some((id) => id.startsWith('gate2.missing-reference')),
      false,
      'no missing-reference finding for an optional route'
    );
  });
});

serialTest('M2-AC-08 break-it: a route that requires a reference fails for every viewport that lacks one', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac08-all', server.baseUrl, { refs: [] });
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.equal(result.code, 1);
    const ids = findingIds(result.json).filter((id) => id.startsWith('gate2.missing-reference.')).sort();
    assert.deepEqual(ids, ['gate2.missing-reference.home.desktop', 'gate2.missing-reference.home.mobile']);
  });
});

serialTest('M2-AC-09: The determinism checks in section 5 that need a project fixture run here: pinned font on the committed PNG, non-fixture network aborted, `ubuntu-latest` as the pixel source of truth, and a `windows-latest` CI job satisfying the Section 5 Windows v1 requirement.', async () => {
  const sink = await startSink();
  try {
    await withServer(
      async (server) => {
        const { repo } = makeRepo('ac09', server.baseUrl, {
          refs: ['font/desktop', 'network/desktop'],
          config: {
            viewports: [{ name: 'desktop', width: 400, height: 300 }],
            maxDiff: 0.5,
            masks: [],
            routes: [
              { id: 'font', path: '/m2/site/font.html', referenceRequired: true },
              { id: 'network', path: `/m2/site/network.html?ext=${encodeURIComponent(sink.origin)}`, referenceRequired: true },
            ],
          },
        });
        const result = await runGate(repo, []);
        assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
        assert.equal(result.json.gates.gate1.passed, true, 'Gate 1 must pass on all platforms');
        if (process.platform !== 'win32') {
          assert.equal(result.code, 0, `committed PNGs must match on Linux (findings: ${findingIds(result.json).join(', ')})`);
        }
        assert.equal(sink.hits.length, 0, 'a request to a non-fixture origin is aborted before it reaches the network');
        const checks = result.json.gates.gate2.checks;
        assert.ok(Array.isArray(checks) && checks.length === 2, 'both committed-PNG routes are compared');
        for (const check of checks) assert.equal(typeof check.mismatchPct, 'number');
        const ci = fs.readFileSync(ciWorkflowPath, 'utf8');
        assert.ok(/ubuntu-latest/.test(ci) && /windows-latest/.test(ci), 'CI runs on ubuntu-latest and windows-latest');
        assert.ok(
          /scripts[\\/]install\.mjs/.test(ci) && /^\s*run:\s*pixel-gate --help\s*$/m.test(ci),
          'CI installs the global command and runs pixel-gate --help from PATH on both operating systems'
        );
      },
      { delays: { '/m2/site/fonts/codicon.ttf': 600 } }
    );
  } finally {
    await sink.close();
  }
});

serialTest('M2-AC-09 break-it: the pinned font is awaited before the capture', async () => {
  await withServer(
    async (server) => {
      const { repo } = makeRepo('ac09-font', server.baseUrl, {
        refs: ['font/desktop'],
        config: {
          viewports: [{ name: 'desktop', width: 400, height: 300 }],
          maxDiff: 0.5,
          masks: [],
          routes: [{ id: 'font', path: '/m2/site/font.html', referenceRequired: true }],
        },
      });
      const result = await runGate(repo, []);
      assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
      assert.equal(result.json.gates.gate1.passed, true, 'Gate 1 must pass on all platforms');
      assert.ok(
        server.requests.includes('/m2/site/fonts/codicon.ttf'),
        'the committed font file was requested from the fixture server'
      );
      const mismatchPct = result.json.gates.gate2.checks?.[0]?.mismatchPct;
      assert.equal(typeof mismatchPct, 'number', 'Gate 2 reports mismatchPct');
      if (process.platform !== 'win32') {
        assert.equal(result.code, 0, 'the plus glyph from the 600 ms delayed font must be on screen at capture time');
        assert.ok(mismatchPct <= 0.5);
      }
    },
    { delays: { '/m2/site/fonts/codicon.ttf': 600 } }
  );
});

serialTest('M2-AC-09 break-it: only an origin named in allowNetwork may be loaded, and it changes the pixels', async () => {
  const sink = await startSink();
  try {
    await withServer(async (server) => {
      const routes = [
        { id: 'network', path: `/m2/site/network.html?ext=${encodeURIComponent(sink.origin)}`, referenceRequired: true },
      ];
      const viewports = [{ name: 'desktop', width: 400, height: 300 }];
      const closed = makeRepo('ac09-closed', server.baseUrl, { refs: ['network/desktop'], config: { viewports, routes, masks: [] } });
      const blocked = await runGate(closed.repo, []);
      assert.deepEqual(envelopeProblems(blocked.json), [], 'the run prints a section 6 object');
      assert.equal(blocked.json.gates.gate1.passed, true, 'Gate 1 must pass on all platforms');
      assert.equal(sink.hits.length, 0, 'the sink saw no request');
      const blockedMismatch = blocked.json.gates.gate2.checks?.[0]?.mismatchPct;
      assert.equal(typeof blockedMismatch, 'number', 'closed run reports mismatchPct');
      if (process.platform !== 'win32') {
        assert.equal(blocked.code, 0, 'with the default allowlist the red square never loads');
      }

      const open = makeRepo('ac09-open', server.baseUrl, {
        refs: ['network/desktop'],
        config: { viewports, routes, masks: [], allowNetwork: [sink.origin] },
      });
      const allowed = await runGate(open.repo, []);
      assert.deepEqual(envelopeProblems(allowed.json), [], 'the run prints a section 6 object');
      assert.ok(sink.hits.length >= 1, 'an origin listed in allowNetwork is reachable');
      const allowedMismatch = allowed.json.gates.gate2.checks?.[0]?.mismatchPct;
      assert.equal(typeof allowedMismatch, 'number', 'open run reports mismatchPct');
      assert.ok(allowedMismatch > blockedMismatch, 'the loaded red square increases mismatchPct');
      if (process.platform !== 'win32') {
        assert.equal(allowed.code, 1, 'the loaded red square flips the pixel result, so the abort in the closed run was real');
      }
    });
  } finally {
    await sink.close();
  }
});
