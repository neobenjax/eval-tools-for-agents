#!/usr/bin/env node
/**
 * Report milestone acceptance criteria.
 * Green-suite tests are executed by the package `npm test` script.
 * Gap tests are executed here and must fail their assertions.
 * Exits 1 when a criterion is missing, skipped, or a gap test starts passing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  breakItItems,
  criterionTitle,
  gapExecutionErrors,
  listAcceptanceSources,
  classifyAcceptanceFile,
  staticAcceptanceErrors,
} from './acceptance-lib.mjs';

function findRepoRoot(start) {
  if (process.env.ACCEPTANCE_REPO_ROOT) return path.resolve(process.env.ACCEPTANCE_REPO_ROOT);
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, 'SPEC.md')) && fs.existsSync(path.join(dir, 'AGENTS.md'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not find repo root from ${start}`);
    dir = parent;
  }
}

function defaults() {
  const repoRoot = findRepoRoot(process.env.ACCEPTANCE_REPO_ROOT || process.cwd());
  const packageRoot = process.env.ACCEPTANCE_PACKAGE_ROOT
    || path.join(repoRoot, 'tools', 'pixel-perfect-gate');
  return {
    repoRoot,
    packageRoot,
    specPath: process.env.ACCEPTANCE_SPEC || path.join(repoRoot, 'SPEC.md'),
    manifestPath: process.env.ACCEPTANCE_MANIFEST
      || path.join(packageRoot, 'tests', 'acceptance', 'manifest.mjs'),
    acceptanceDir: process.env.ACCEPTANCE_DIR || path.join(packageRoot, 'tests', 'acceptance'),
    packageJsonPath: process.env.ACCEPTANCE_PACKAGE_JSON || path.join(packageRoot, 'package.json'),
  };
}

async function loadManifest(manifestPath) {
  const href = pathToFileURL(manifestPath).href;
  return import(href);
}

function runGapFiles(files) {
  if (files.length === 0) return { status: 0, stdout: '', stderr: '' };
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-reporter=tap', '--test-concurrency=1', ...files],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env }
  );
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export async function runAcceptanceStatus(argv = process.argv.slice(2)) {
  const staticOnly = argv.includes('--static-only');
  const paths = defaults();
  const specText = fs.readFileSync(paths.specPath, 'utf8');
  const manifest = await loadManifest(paths.manifestPath);
  const packageJson = JSON.parse(fs.readFileSync(paths.packageJsonPath, 'utf8'));
  const staticResult = staticAcceptanceErrors({
    specText,
    manifest,
    acceptanceDir: paths.acceptanceDir,
    packageRoot: paths.packageRoot,
    packageTestScript: packageJson.scripts?.test || '',
  });
  const errors = [...staticResult.errors];
  let gapTap = null;
  if (!staticOnly && errors.length === 0) {
    const gapFiles = listAcceptanceSources(paths.acceptanceDir).filter((file) => classifyAcceptanceFile(file) === 'gap');
    if ((manifest.criteria || []).some((entry) => entry.suite === 'gap') && gapFiles.length === 0) {
      errors.push('Gap criteria exist but no *.pending.mjs files were found.');
    } else if (gapFiles.length > 0) {
      gapTap = runGapFiles(gapFiles);
      const executed = gapExecutionErrors(manifest.criteria, gapTap.stdout);
      errors.push(...executed.errors);
      if ((executed.tap?.summary?.tests ?? 0) === 0 && gapTap.stderr) {
        errors.push(`Gap runner stderr: ${gapTap.stderr.slice(0, 800)}`);
      }
      if (executed.errors.length === 0 && gapTap.status === 0) {
        errors.push('Gap suite exited 0. Expected-fail tests must fail until they are promoted.');
      }
    }
  }

  const rows = (manifest.criteria || []).map((entry) => ({
    id: entry.id,
    milestone: entry.milestone,
    suite: entry.suite,
    execution: entry.suite === 'pass' ? 'green-suite' : 'expected-fail',
    text: entry.text,
    test: criterionTitle(entry),
  }));
  const report = {
    ok: errors.length === 0,
    enforcedMilestones: manifest.ENFORCED_MILESTONES,
    greenSuite: 'Executed by the package npm test script (this command checks that those files are wired and named).',
    criteria: rows,
    errors,
  };
  console.log('Milestone acceptance status');
  for (const row of rows) {
    const label = row.suite === 'pass' ? 'GREEN' : 'GAP  ';
    console.log(`${label}  ${row.id}  ${row.text}`);
  }
  const passCount = rows.filter((row) => row.suite === 'pass').length;
  const gapCount = rows.filter((row) => row.suite === 'gap').length;
  const greenBreakIts = (manifest.criteria || []).reduce((count, entry) => {
    if (entry.suite !== 'gap') return count;
    return count + breakItItems(entry).items.filter((item) => item.suite === 'pass').length;
  }, 0);
  console.log(`\n${passCount} green-suite criteria, ${gapCount} gap criteria (expected fail).`);
  if (greenBreakIts > 0) {
    console.log(`${greenBreakIts} green break-it tests are enforced under gap criteria.`);
  }
  if (errors.length) {
    console.error('\nAcceptance gate failed:');
    for (const error of errors) console.error(`  - ${error}`);
  }
  console.log(`\nACCEPTANCE_STATUS_JSON ${JSON.stringify(report)}`);
  return report.ok ? 0 : 1;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) {
  const code = await runAcceptanceStatus();
  process.exit(code);
}
