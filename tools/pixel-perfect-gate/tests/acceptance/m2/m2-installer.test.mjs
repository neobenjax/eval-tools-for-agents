/**
 * M2.3 installer gap tests. Every test fails with ERR_ASSERTION until the product meets it.
 * M1-AC-01 through M1-AC-15 are green. M2-AC-01 through M2-AC-37 are gaps. ENFORCED_MILESTONES is M1 and M2.
 * Promote to tests/acceptance/m2/*.test.mjs, check the section 8 box, and set suite to "pass" together
 * (SPEC.md section 13). Section 6: schemaVersion 1; gates.gate1/gate2/gate3; findings[].id is the stable
 * branch key; error is null or { message }; a skipped gate is { passed: true, skipped: true, reason };
 * --help and --version are the only non-JSON exits. Playwright is pinned to 1.65.1 (asserted below).
 * mismatchPct blocks on ubuntu-latest; Windows and macOS report it (guard process.platform !== "win32").
 * Editing this file requires "Acceptance-test change rationale:" in the PR body.
 * Installer: tools/pixel-perfect-gate/scripts/install.mjs.
 * Interface pinned by these tests:
 *   --home <dir>      home directory for skill destinations (default os.homedir())
 *   --bin-dir <dir>   directory that receives the `pixel-gate` command
 *   --skip-chromium   do not install Chromium
 *   --dry-run         write nothing; print one JSON object { dryRun: true, actions: [...] }
 * Plan actions: { type: 'link-skill', agent, source, target }, { type: 'install-bin', path },
 * { type: 'install-chromium', version }.
 * Every test installs into a throwaway home and bin dir; the real profile is never touched.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serialTest } from '../harness.mjs';
import {
  HARNESSES,
  SKILL_DESTINATIONS,
  diffTrees,
  freshDir,
  installToTemp,
  installerPath,
  linkKind,
  onPathEnv,
  pkgRoot,
  playwrightSpec,
  realOrNull,
  repoRoot,
  runInstaller,
  runOnPath,
  sha256,
  skillDestination,
  skillDir,
  snapshotTree,
  whichOnPath,
} from '../m2-helpers.mjs';

const EXPECTED_LINK = process.platform === 'win32' ? 'junction' : 'symlink';

function installedOk(run) {
  assert.ok(fs.existsSync(path.join(skillDir, 'SKILL.md')), 'the skill directory with SKILL.md must exist before it can be linked');
  assert.equal(run.code, 0, `installer must exit 0 (spawnError=${run.spawnError}; stderr=${String(run.stderr).slice(0, 300)})`);
}

serialTest('M2-AC-30: On Windows the installer creates a directory junction for the skill. On Unix it creates the skill link with `ln -sfn`.', async () => {
  assert.ok(fs.existsSync(installerPath), 'tools/pixel-perfect-gate/scripts/install.mjs must exist');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts', 'install.mjs')),
    false,
    'there is one installer path; no scripts/install.mjs at the repo root'
  );
  const { run, home } = await installToTemp('ac30');
  installedOk(run);
  for (const harness of HARNESSES) {
    const dest = skillDestination(home, harness);
    assert.equal(
      linkKind(dest),
      EXPECTED_LINK,
      `${harness}: on ${process.platform} the skill is a ${EXPECTED_LINK} (Windows directory junction; Unix ln -sfn symlink)`
    );
    assert.equal(realOrNull(dest), realOrNull(skillDir), `${harness}: the link resolves to the skill directory in this package`);
  }
});

serialTest('M2-AC-30 break-it: edits to SKILL.md in the package are visible through every destination', async () => {
  const { run, home } = await installToTemp('ac30-live');
  installedOk(run);
  for (const harness of HARNESSES) {
    const through = path.join(skillDestination(home, harness), 'SKILL.md');
    assert.ok(fs.existsSync(through), `${harness}: SKILL.md is reachable through the link`);
    assert.equal(sha256(through), sha256(path.join(skillDir, 'SKILL.md')), `${harness}: the link serves the package file, not a copy`);
  }
});

serialTest('M2-AC-31: Skill destinations: Antigravity Desktop `~/.gemini/config/skills/`, Antigravity CLI `~/.gemini/antigravity-cli/skills/`, Cursor `~/.cursor/skills/`.', async () => {
  const home = freshDir('ac31', 'home');
  const sibling = path.join(home, '.cursor', 'skills', 'other-skill', 'SKILL.md');
  fs.mkdirSync(path.dirname(sibling), { recursive: true });
  fs.writeFileSync(sibling, 'keep me\n');
  const before = snapshotTree(home);
  const { run } = await installToTemp('ac31', ['--skip-chromium'], { home });
  installedOk(run);
  assert.deepEqual(
    Object.fromEntries(Object.entries(SKILL_DESTINATIONS).map(([h, parts]) => [h, parts.join('/')])),
    {
      'antigravity-desktop': '.gemini/config/skills',
      'antigravity-cli': '.gemini/antigravity-cli/skills',
      cursor: '.cursor/skills',
    },
    'the destination table matches section 8'
  );
  for (const harness of HARNESSES) {
    assert.ok(
      fs.existsSync(path.join(skillDestination(home, harness), 'SKILL.md')),
      `${harness}: ${skillDestination(home, harness)} must contain SKILL.md`
    );
  }
  const diff = diffTrees(before, snapshotTree(home));
  const allowed = Object.values(SKILL_DESTINATIONS).map((parts) => `${parts.join('/')}/pixel-perfect-gate`);
  for (const file of diff.added) {
    assert.ok(allowed.some((prefix) => file === prefix || file.startsWith(`${prefix}/`)), `installer wrote outside its skill links: ${file}`);
  }
  assert.deepEqual(diff.changed, [], 'no existing file under home changes');
  assert.deepEqual(diff.removed, [], 'no existing file under home is removed');
  assert.equal(fs.readFileSync(sibling, 'utf8'), 'keep me\n', 'a sibling skill is left alone');
});

serialTest('M2-AC-31 break-it: the home directory comes from --home and never from the real profile', async () => {
  const decoy = freshDir('ac31-decoy');
  const { run, home } = await installToTemp('ac31-decoy-run', ['--skip-chromium'], {
    run: { env: { HOME: decoy, USERPROFILE: decoy, HOMEPATH: decoy } },
  });
  installedOk(run);
  assert.ok(fs.existsSync(skillDestination(home, 'cursor')), 'the links land in --home');
  assert.deepEqual(fs.readdirSync(decoy), [], 'the decoy profile directory stays empty');
});

serialTest('M2-AC-32: The installer puts `pixel-gate` on `PATH` and installs the pinned Chromium.', async () => {
  const { run, binDir } = await installToTemp('ac32');
  installedOk(run);
  const shim = process.platform === 'win32' ? path.join(binDir, 'pixel-gate.cmd') : path.join(binDir, 'pixel-gate');
  assert.ok(fs.existsSync(shim), `the command shim ${path.basename(shim)} is in the bin dir`);
  if (process.platform !== 'win32') assert.ok((fs.statSync(shim).mode & 0o111) !== 0, 'the shim is executable');
  const env = onPathEnv(binDir);
  assert.ok(whichOnPath('pixel-gate', env), 'pixel-gate resolves on PATH once the bin dir is on PATH');
  assert.equal(runOnPath('pixel-gate', ['--help'], env).code, 0, 'the installed command runs');

  const spec = playwrightSpec();
  assert.equal(spec, '1.65.1', `playwright must be pinned to 1.65.1 (got ${spec})`);

  const plan = await runInstaller(['--home', freshDir('ac32', 'plan-home'), '--bin-dir', freshDir('ac32', 'plan-bin'), '--dry-run']);
  installedOk(plan);
  assert.ok(plan.json && plan.json.dryRun === true && Array.isArray(plan.json.actions), 'dry-run prints { dryRun: true, actions: [...] }');
  const chromium = plan.json.actions.filter((a) => a.type === 'install-chromium');
  assert.equal(chromium.length, 1, 'the plan installs Chromium exactly once');
  assert.equal(chromium[0].version, '1.65.1', 'the Chromium install uses the pinned playwright version');
  assert.equal(plan.json.actions.filter((a) => a.type === 'install-bin').length, 1, 'the plan puts pixel-gate on PATH');

  const browsersDir = freshDir('ac32', 'browsers');
  const live = await installToTemp('ac32-live', [], {
    run: { env: { PLAYWRIGHT_BROWSERS_PATH: browsersDir } },
  });
  installedOk(live.run);
  const findExe = (dir, target) => {
    if (!fs.existsSync(dir)) return false;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory() && findExe(full, target)) return true;
      if (ent.isFile() && ent.name.toLowerCase() === target.toLowerCase()) return true;
    }
    return false;
  };
  const expectedExe = process.platform === 'win32' ? 'chrome.exe' : 'chrome';
  assert.ok(findExe(browsersDir, expectedExe), `the pinned browser executable (${expectedExe}) exists under PLAYWRIGHT_BROWSERS_PATH`);
});

serialTest('M2-AC-32 break-it: dry-run writes nothing and --skip-chromium drops only the browser action', async () => {
  const home = freshDir('ac32-dry', 'home');
  const binDir = freshDir('ac32-dry', 'bin');
  const full = await runInstaller(['--home', home, '--bin-dir', binDir, '--dry-run']);
  installedOk(full);
  assert.deepEqual(fs.readdirSync(home), [], 'dry-run leaves the home directory empty');
  assert.deepEqual(fs.readdirSync(binDir), [], 'dry-run leaves the bin directory empty');
  const skipped = await runInstaller(['--home', home, '--bin-dir', binDir, '--dry-run', '--skip-chromium']);
  installedOk(skipped);
  const types = skipped.json.actions.map((a) => a.type);
  assert.equal(types.includes('install-chromium'), false, '--skip-chromium removes the install-chromium action');
  assert.equal(types.filter((t) => t === 'link-skill').length, 3, 'three skill links are planned');
  assert.equal(types.filter((t) => t === 'install-bin').length, 1);
  for (const action of skipped.json.actions.filter((a) => a.type === 'link-skill')) {
    assert.ok(String(action.target).endsWith('pixel-perfect-gate'), 'every link target ends with the skill name');
    assert.equal(realOrNull(action.source), realOrNull(skillDir), 'every link source is the skill directory');
  }
});

serialTest('M2-AC-33: The installer does not add this package to the dependencies of the target application.', async () => {
  const app = freshDir('ac33', 'app');
  fs.writeFileSync(path.join(app, 'package.json'), `${JSON.stringify({ name: 'target-app', version: '1.0.0', dependencies: { left: '^1.0.0' } }, null, 2)}\n`);
  fs.writeFileSync(path.join(app, 'package-lock.json'), '{"lockfileVersion":3}\n');
  fs.writeFileSync(path.join(app, 'index.html'), '<!doctype html><title>app</title>\n');
  const before = snapshotTree(app);
  const { run } = await installToTemp('ac33-run', ['--skip-chromium'], { run: { cwd: app } });
  installedOk(run);
  assert.deepEqual(diffTrees(before, snapshotTree(app)), { added: [], removed: [], changed: [] }, 'running the installer from the app directory changes nothing in the app');
  assert.equal(fs.existsSync(path.join(app, 'node_modules')), false, 'no node_modules is created in the app');
});

serialTest('M2-AC-33 break-it: the installer leaves this repository manifests unchanged', async () => {
  const manifests = [
    path.join(repoRoot, 'package.json'),
    path.join(repoRoot, 'package-lock.json'),
    path.join(pkgRoot, 'package.json'),
  ];
  const before = manifests.map((file) => sha256(file));
  const { run } = await installToTemp('ac33-repo', ['--skip-chromium'], { run: { cwd: repoRoot } });
  installedOk(run);
  assert.deepEqual(manifests.map((file) => sha256(file)), before, 'no workspace dependency or lockfile entry is added');
});

serialTest('M2-AC-34: Re-running the installer replaces the links and leaves a working `pixel-gate --help`.', async () => {
  const home = freshDir('ac34', 'home');
  const binDir = freshDir('ac34', 'bin');
  const stale = freshDir('ac34', 'stale-target');
  fs.writeFileSync(path.join(stale, 'keep.txt'), 'untouched\n');
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  const desktop = skillDestination(home, 'antigravity-desktop');
  const cli = skillDestination(home, 'antigravity-cli');
  const first = await installToTemp('ac34', ['--skip-chromium'], { home, binDir });
  installedOk(first.run);
  // Replace two of the links with stale links to another directory.
  for (const link of [desktop, cli]) {
    try {
      fs.unlinkSync(link);
    } catch {
      fs.rmdirSync(link);
    }
  }
  let plantError = null;
  try {
    fs.symlinkSync(stale, desktop, linkType);
    fs.symlinkSync(stale, cli, linkType);
  } catch (err) {
    plantError = err.message;
  }
  assert.equal(plantError, null, `the test could not plant stale links: ${plantError}`);
  const second = await installToTemp('ac34', ['--skip-chromium'], { home, binDir });
  installedOk(second.run);
  for (const harness of HARNESSES) {
    const dest = skillDestination(home, harness);
    assert.equal(linkKind(dest), EXPECTED_LINK, `${harness}: still a ${EXPECTED_LINK} after two runs`);
    assert.equal(realOrNull(dest), realOrNull(skillDir), `${harness}: resolves to the skill directory`);
  }
  assert.equal(fs.readFileSync(path.join(stale, 'keep.txt'), 'utf8'), 'untouched\n', 'replacing a stale link does not delete its old target');
  const help = runOnPath('pixel-gate', ['--help'], onPathEnv(binDir), os.tmpdir());
  assert.equal(help.code, 0, 'pixel-gate --help still works after the re-run');
});

serialTest('M2-AC-34 break-it: a re-run does not nest or duplicate links', async () => {
  const home = freshDir('ac34-nest', 'home');
  const binDir = freshDir('ac34-nest', 'bin');
  const one = await installToTemp('ac34-nest', ['--skip-chromium'], { home, binDir });
  installedOk(one.run);
  const two = await installToTemp('ac34-nest', ['--skip-chromium'], { home, binDir });
  installedOk(two.run);
  for (const harness of HARNESSES) {
    const dest = skillDestination(home, harness);
    assert.deepEqual(fs.readdirSync(path.dirname(dest)), ['pixel-perfect-gate'], `${harness}: exactly one entry in the skills directory`);
    assert.equal(realOrNull(path.join(dest, 'pixel-perfect-gate')), null, `${harness}: no link nested inside the skill directory`);
  }
});
