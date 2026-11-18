#!/usr/bin/env node
/**
 * Validates PR readiness:
 * 1. Current branch is not `main`.
 * 2. Branch name or SPEC.md references valid SIDE-XX keys.
 * 3. No untracked secrets (.env) staged.
 */
import fs from 'fs';
import { execSync } from 'child_process';

const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
if (branch === 'main') {
  console.error('❌ Cannot open a PR from `main`. Cut a `feat/SIDE-XX-...` branch.');
  process.exit(1);
}

const spec = fs.readFileSync('SPEC.md', 'utf8');
const sideKeys = [...spec.matchAll(/\b(SIDE-\d+)\b/g)].map((m) => m[1]);
if (sideKeys.length === 0) {
  console.error('❌ No SIDE-XX keys found in SPEC.md.');
  process.exit(1);
}

const staged = execSync('git diff --cached --name-only', { encoding: 'utf8' });
if (/^\.env$/m.test(staged)) {
  console.error('❌ .env is staged for commit! Unstage it immediately.');
  process.exit(1);
}

const branchMatch = branch.match(/\b(SIDE-\d+)\b/i);
if (branch.startsWith('feat/') && !branchMatch) {
  console.error(`❌ Feature branch "${branch}" must include a Linear key (e.g. feat/SIDE-11-...).`);
  process.exit(1);
}

console.log(`✅ PR ready on branch "${branch}" (${sideKeys.length} SIDE-XX keys tracked in SPEC.md).`);
