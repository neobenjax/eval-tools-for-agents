/**
 * SIDE-25 (M2.0a) global pixel-gate install and per-project config.
 * Gap suite: every test fails with ERR_ASSERTION until the product meets it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  cliPath,
  copyRefs,
  diffTrees,
  envelopeProblems,
  findingIds,
  freshDir,
  installToTemp,
  makeRepo,
  onPathEnv,
  runGate,
  runOnPath,
  snapshotTree,
  whichOnPath,
  withServer,
  runNode,
} from '../m2-helpers.mjs';

const HOME_URL = '/m2/site/home.html';

serialTest('M2-AC-01: After one install, `pixel-gate` resolves on `PATH`.', async () => {
  const { run, binDir } = await installToTemp('ac01');
  assert.equal(run.code, 0, `installer must exit 0 (spawnError=${run.spawnError}; stderr=${run.stderr.slice(0, 300)})`);
  const env = onPathEnv(binDir);
  const hit = whichOnPath('pixel-gate', env);
  assert.ok(hit, 'pixel-gate must resolve on PATH after the install');
  assert.ok(
    path.resolve(hit).toLowerCase().startsWith(path.resolve(binDir).toLowerCase()),
    `PATH must resolve pixel-gate to the install bin dir ${binDir}, got ${hit}`
  );
  const help = runOnPath('pixel-gate', ['--help'], env);
  assert.equal(help.code, 0, `pixel-gate --help through PATH must exit 0 (${help.error || help.stderr.slice(0, 200)})`);
});

serialTest('M2-AC-01 break-it: the PATH shim forwards arguments, stdout, and the exit code', async () => {
  const { run, binDir } = await installToTemp('ac01-forward');
  assert.equal(run.code, 0, 'installer must exit 0');
  const cwd = freshDir('ac01-forward', 'cwd');
  const result = runOnPath('pixel-gate', ['--config', 'does-not-exist.config.json'], onPathEnv(binDir), cwd);
  assert.equal(result.code, 1, 'the shim must forward the CLI exit code 1 for a missing config');
  let report = null;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    report = null;
  }
  assert.deepEqual(envelopeProblems(report), [], 'the shim must forward the one section 6 JSON object on stdout');
  assert.ok(report.error && typeof report.error.message === 'string', 'a missing config is an error object, not a crash');
});

serialTest('M2-AC-02: `pixel-gate --help` exits `0` on Windows and on Ubuntu.', async () => {
  const cwd = freshDir('ac02');
  const before = snapshotTree(cwd);
  const result = await runNode([cliPath, '--help'], { cwd });
  assert.equal(result.code, 0, '--help must exit 0');
  assert.ok(result.stdout.includes('pixel-gate'), '--help must name the command');
  for (const flag of ['--config', '--scenario', '--gate3-static', '--vision-verdict']) {
    assert.ok(result.stdout.includes(flag), `--help must document ${flag}`);
  }
  assert.ok(result.stdout.includes('pixel-gate.config.json'), '--help must name the default config file');
  assert.equal(result.json, null, '--help prints text, not a report');
  assert.deepEqual(diffTrees(before, snapshotTree(cwd)), { added: [], removed: [], changed: [] }, '--help writes nothing');
  const { run, binDir } = await installToTemp('ac02-installed');
  assert.equal(run.code, 0, 'installer must exit 0 so --help can be run from PATH');
  const viaPath = runOnPath('pixel-gate', ['--help'], onPathEnv(binDir), cwd);
  assert.equal(viaPath.code, 0, `pixel-gate --help from PATH must exit 0 on ${process.platform}`);
});

serialTest('M2-AC-03: A config file in a second repo supplies base URL, viewports, reference directory, masks, routes, and scenarios.', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac03', server.baseUrl, {
      config: { scenarios: 'scenarios.json' },
      files: { 'scenarios.json': JSON.stringify({ scenarios: [] }) },
    });
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'a run from the repo root finds pixel-gate.config.json by name');
    assert.equal(result.code, 0, `desktop and mobile references must pass (findings: ${findingIds(result.json).join(', ')})`);
    assert.equal(result.json.passed, true);
    const checks = result.json.gates.gate2.checks;
    assert.ok(Array.isArray(checks), 'config runs report gates.gate2.checks[]');
    const keys = checks.map((c) => `${c.route}/${c.viewport}`).sort();
    assert.deepEqual(keys, ['home/desktop', 'home/mobile'], 'every configured viewport of the route is compared');
    for (const check of checks) {
      assert.equal(check.passed, true, `${check.route}/${check.viewport} must pass`);
      assert.equal(typeof check.mismatchPct, 'number');
      assert.ok(check.mismatchPct <= 0.5, 'the config mask keeps the random #clock region out of the diff');
    }
    assert.ok(server.requests.includes(HOME_URL), 'the route path from config is the page that was loaded');
  });
});

serialTest('M2-AC-03 break-it: a mask listed in config is what keeps the dynamic region out of the diff', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac03-nomask', server.baseUrl, { config: { masks: [] } });
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'a config run prints a section 6 object');
    assert.equal(result.code, 1, 'without the mask the random #clock region must fail Gate 2');
    assert.equal(result.json.gates.gate2.passed, false);
    assert.ok(Array.isArray(result.json.gates.gate2.checks), 'config runs report gates.gate2.checks[]');
  });
});

serialTest('M2-AC-03 break-it: --config selects a config file with another name', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac03-named', server.baseUrl, { configName: 'custom.config.json' });
    assert.equal(fs.existsSync(path.join(repo, 'pixel-gate.config.json')), false, 'fixture has no default config');
    const result = await runGate(repo, ['--config', 'custom.config.json']);
    assert.deepEqual(envelopeProblems(result.json), [], 'a run with --config prints a section 6 object');
    assert.equal(result.code, 0, 'the named config drives the run');
    const bare = await runGate(repo, []);
    assert.equal(bare.code, 1, 'without --config and without the default name the run fails');
    assert.deepEqual(envelopeProblems(bare.json), [], 'and still prints one section 6 object');
  });
});

serialTest('M2-AC-03 break-it: a missing required config field is a config error', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac03-nobase', server.baseUrl, { config: { baseUrl: undefined } });
    const result = await runGate(repo, []);
    assert.equal(result.code, 1, 'a config without baseUrl is rejected');
    assert.deepEqual(envelopeProblems(result.json), [], 'the rejection is one section 6 object');
    assert.ok(/baseUrl/.test(JSON.stringify(result.json.error)), 'the error names the missing field');
    assert.equal(server.requests.length, 0, 'nothing is loaded when the config is invalid');
  });
});

serialTest('M2-AC-03 break-it: a scenarios path that does not exist is a config error', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac03-noscen', server.baseUrl, { config: { scenarios: 'missing-scenarios.json' } });
    const result = await runGate(repo, []);
    assert.equal(result.code, 1, 'a configured scenario file that is missing fails closed');
    assert.deepEqual(envelopeProblems(result.json), [], 'the failure is one section 6 object');
    assert.ok(/scenarios/i.test(JSON.stringify(result.json.error)), 'the error names the scenarios setting');
  });
});

serialTest('M2-AC-04: The tool writes only `.visual-eval/` in that repo and does not change its dependency manifest.', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac04', server.baseUrl);
    const before = snapshotTree(repo);
    const result = await runGate(repo, []);
    assert.deepEqual(envelopeProblems(result.json), [], 'the run prints a section 6 object');
    assert.equal(result.code, 0, 'the run itself must pass so the file check is about a real run');
    const after = snapshotTree(repo);
    const diff = diffTrees(before, after);
    assert.ok(diff.added.length > 0, 'the run writes telemetry and artifacts under .visual-eval/');
    for (const file of diff.added) assert.ok(file.startsWith('.visual-eval/'), `wrote outside .visual-eval/: ${file}`);
    assert.deepEqual(diff.changed, [], 'no existing file in the repo may change');
    assert.deepEqual(diff.removed, [], 'no file may be removed');
    assert.equal(fs.existsSync(path.join(repo, 'node_modules')), false, 'no node_modules is created');
    assert.equal(after.get('package.json'), before.get('package.json'), 'package.json is untouched');
    assert.equal(after.get('package-lock.json'), before.get('package-lock.json'), 'package-lock.json is untouched');
  });
});

serialTest('M2-AC-04 break-it: --out cannot leave the .visual-eval tree', async () => {
  await withServer(async (server) => {
    const { repo } = makeRepo('ac04-out', server.baseUrl);
    const escaped = path.join(path.dirname(repo), 'ac04-escaped-out');
    fs.rmSync(escaped, { recursive: true, force: true });
    const relative = await runGate(repo, ['--out', '../ac04-escaped-out']);
    assert.equal(relative.code, 1, 'a relative --out that leaves the tree is rejected');
    assert.deepEqual(envelopeProblems(relative.json), [], 'the rejection is one section 6 object');
    assert.ok(/out/i.test(JSON.stringify(relative.json.error)), 'the error names --out');
    assert.equal(fs.existsSync(escaped), false, 'nothing is written outside the repo');
    const absolute = await runGate(repo, ['--out', path.join(os.tmpdir(), 'pixel-gate-ac04-escape')]);
    assert.equal(absolute.code, 1, 'an absolute --out outside the tree is rejected');
    assert.equal(fs.existsSync(path.join(os.tmpdir(), 'pixel-gate-ac04-escape')), false, 'nothing is written to the absolute path');
    const inside = await runGate(repo, ['--out', '.visual-eval/custom']);
    assert.equal(inside.code, 0, 'a --out inside .visual-eval/ is accepted');
    assert.ok(fs.existsSync(path.join(repo, '.visual-eval', 'custom')), 'artifacts land in the custom directory');
  });
});

serialTest('M2-AC-05: `--url` and `--ref` still run Gate 1 and Gate 2 without a config file.', async () => {
  await withServer(async (server) => {
    const flagsOnly = freshDir('ac05', 'flags-only');
    copyRefs(flagsOnly, ['home/desktop'], 'refs');
    const ref = path.join(flagsOnly, 'refs', 'home', 'desktop.png');
    const url = `${server.baseUrl}${HOME_URL}`;
    const plain = await runGate(flagsOnly, ['--url', url, '--ref', ref, '--mask', '#clock']);
    assert.deepEqual(envelopeProblems(plain.json), [], 'flag-only run prints a section 6 object');
    assert.equal(plain.code, 0, 'flag-only run with no config file still passes');
    assert.equal(plain.json.gates.gate1.skipped === true, false, 'Gate 1 ran');
    assert.equal(plain.json.gates.gate2.skipped === true, false, 'Gate 2 ran');
    assert.equal(typeof plain.json.gates.gate2.mismatchPct, 'number');

    // Flags override the matching config field for a single run.
    const { repo, configPath } = makeRepo('ac05-override', 'http://127.0.0.1:9', { refs: ['home/desktop'] });
    const refInRepo = path.join(repo, 'references', 'home', 'desktop.png');
    const over = await runGate(repo, ['--config', configPath, '--url', url, '--ref', refInRepo, '--mask', '#clock']);
    assert.deepEqual(envelopeProblems(over.json), [], 'flags plus --config print a section 6 object');
    assert.equal(over.code, 0, '--url overrides a dead baseUrl in config');
    const about = `${server.baseUrl}/m2/site/about.html`;
    const mismatch = await runGate(repo, ['--config', configPath, '--url', about, '--ref', refInRepo, '--mask', '#clock']);
    assert.equal(mismatch.code, 1, 'config maxDiff 0.5 applies when no flag is given');
    const lenient = await runGate(repo, ['--config', configPath, '--url', about, '--ref', refInRepo, '--max-diff', '100']);
    assert.equal(lenient.code, 0, '--max-diff overrides the config maxDiff for one run');
  });
});
