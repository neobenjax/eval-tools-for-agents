#!/usr/bin/env node
/**
 * Unified pre-flight verifier for eval-tools-for-agents.
 * Checks required governance files, JSON/package validity, and workspace tests.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const root = process.cwd();
const requiredFiles = [
  'CONTEXT.md',
  'AGENTS.md',
  'SPEC.md',
  'package.json',
  '.gitignore',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/workflows/ci.yml',
];

let failed = false;

console.log('==> [verify] Checking required governance & memory files...');
for (const file of requiredFiles) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.error(`  FAIL: Missing ${file}`);
    failed = true;
  }
}

console.log('==> [verify] Validating .gitignore protects .env and .visual-eval/...');
const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
for (const pattern of ['.env', '.visual-eval/']) {
  if (!gitignore.includes(pattern)) {
    console.error(`  FAIL: .gitignore missing "${pattern}"`);
    failed = true;
  }
}

console.log('==> [verify] Validating package.json & workspace tests...');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
let executedSuites = 0;
for (const wsGlob of ['tools', 'apps']) {
  const wsDir = path.join(root, wsGlob);
  if (!fs.existsSync(wsDir)) continue;
  for (const entry of fs.readdirSync(wsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const subPkgPath = path.join(wsDir, entry.name, 'package.json');
    if (!fs.existsSync(subPkgPath)) continue;
    const subPkg = JSON.parse(fs.readFileSync(subPkgPath, 'utf8'));
    if (subPkg.scripts?.test) {
      console.log(`  Running tests in ${wsGlob}/${entry.name}...`);
      executedSuites++;
      try {
        execSync('npm test', { cwd: path.join(wsDir, entry.name), stdio: 'inherit' });
      } catch {
        failed = true;
      }
    }
  }
}

if (executedSuites === 0) {
  console.error('  FAIL: Zero workspace test suites executed.');
  failed = true;
}

if (failed) {
  console.error('\n❌ Pre-flight verification FAILED.');
  process.exit(1);
}

console.log(`\n✅ Pre-flight verification PASSED (${pkg.name}@${pkg.version}).`);
