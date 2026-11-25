#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const skillDir = path.join(pkgRoot, 'skills', 'pixel-perfect-gate');
const cliPath = path.join(pkgRoot, 'bin', 'pixel-gate.mjs');
const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
const playwrightVersion = String(pkgJson.dependencies?.playwright || '1.65.1').replace(/^[~^]/, '');

function parseArgs(argv) {
  let home = os.homedir();
  let binDir = null;
  let skipChromium = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--home' && i + 1 < argv.length) {
      home = path.resolve(argv[++i]);
    } else if (arg === '--bin-dir' && i + 1 < argv.length) {
      binDir = path.resolve(argv[++i]);
    } else if (arg === '--skip-chromium') {
      skipChromium = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  if (!binDir) {
    binDir = path.join(home, '.local', 'bin');
  }
  return { home, binDir, skipChromium, dryRun };
}

function removeExistingLinkOrDir(target) {
  let stat = null;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return;
  }
  if (stat.isSymbolicLink()) {
    try {
      fs.unlinkSync(target);
    } catch {
      fs.rmdirSync(target);
    }
  } else {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function linkSkill(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (process.platform === 'win32') {
    removeExistingLinkOrDir(target);
    fs.symlinkSync(source, target, 'junction');
  } else {
    execFileSync('ln', ['-sfn', source, target], { stdio: 'pipe' });
  }
}

function installBinShim(binDir) {
  fs.mkdirSync(binDir, { recursive: true });
  if (process.platform === 'win32') {
    const cmdPath = path.join(binDir, 'pixel-gate.cmd');
    fs.writeFileSync(cmdPath, `@echo off\r\n"${process.execPath}" "${cliPath}" %*\r\n`, 'utf8');
    const shPath = path.join(binDir, 'pixel-gate');
    fs.writeFileSync(shPath, `#!/bin/sh\nexec "${process.execPath}" "${cliPath}" "$@"\n`, 'utf8');
    return cmdPath;
  }
  const shPath = path.join(binDir, 'pixel-gate');
  fs.writeFileSync(shPath, `#!/bin/sh\nexec "${process.execPath}" "${cliPath}" "$@"\n`, 'utf8');
  fs.chmodSync(shPath, 0o755);
  return shPath;
}

function installChromium() {
  const require = createRequire(path.join(pkgRoot, 'package.json'));
  const pwPkgDir = path.dirname(require.resolve('playwright/package.json'));
  const pwCli = path.join(pwPkgDir, 'cli.js');
  execFileSync(process.execPath, [pwCli, 'install', 'chromium'], {
    cwd: pkgRoot,
    stdio: 'pipe',
  });
}

const { home, binDir, skipChromium, dryRun } = parseArgs(process.argv.slice(2));

const destinations = [
  { agent: 'antigravity-desktop', target: path.join(home, '.gemini', 'config', 'skills', 'pixel-perfect-gate') },
  { agent: 'antigravity-cli', target: path.join(home, '.gemini', 'antigravity-cli', 'skills', 'pixel-perfect-gate') },
  { agent: 'cursor', target: path.join(home, '.cursor', 'skills', 'pixel-perfect-gate') },
];

const shimPath = process.platform === 'win32'
  ? path.join(binDir, 'pixel-gate.cmd')
  : path.join(binDir, 'pixel-gate');

const actions = [
  ...destinations.map((d) => ({
    type: 'link-skill',
    agent: d.agent,
    source: skillDir,
    target: d.target,
  })),
  {
    type: 'install-bin',
    path: shimPath,
  },
];

if (!skipChromium) {
  actions.push({
    type: 'install-chromium',
    version: playwrightVersion,
  });
}

if (dryRun) {
  process.stdout.write(`${JSON.stringify({ dryRun: true, actions }, null, 2)}\n`);
  process.exit(0);
}

for (const d of destinations) {
  linkSkill(skillDir, d.target);
}
installBinShim(binDir);
if (!skipChromium) {
  installChromium();
}

process.stdout.write(`${JSON.stringify({ dryRun: false, actions }, null, 2)}\n`);
