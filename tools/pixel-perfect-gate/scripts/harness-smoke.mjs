#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.join(__dirname, 'harness-smoke.prompt.txt');

const HARNESS_DESTS = {
  'antigravity-desktop': ['.gemini', 'config', 'skills', 'pixel-perfect-gate'],
  'antigravity-cli': ['.gemini', 'antigravity-cli', 'skills', 'pixel-perfect-gate'],
  cursor: ['.cursor', 'skills', 'pixel-perfect-gate'],
};

const REQUIRED_SECTION6_KEYS = [
  'schemaVersion',
  'passed',
  'exitCode',
  'iteration',
  'durationMs',
  'error',
  'findings',
  'gates',
  'artifacts',
  'telemetry',
];

function parseArgs(argv) {
  let harness = 'all';
  let home = os.homedir();
  let promptCmd = null;
  let recording = null;
  let unknownFlag = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--harness' && i + 1 < argv.length) {
      harness = argv[++i];
    } else if (arg === '--home' && i + 1 < argv.length) {
      home = path.resolve(argv[++i]);
    } else if (arg === '--prompt-cmd' && i + 1 < argv.length) {
      promptCmd = argv[++i];
    } else if (arg === '--recording' && i + 1 < argv.length) {
      recording = path.resolve(argv[++i]);
    } else if (arg.startsWith('--')) {
      unknownFlag = arg;
    }
  }

  return { harness, home, promptCmd, recording, unknownFlag };
}

function isValidSection6Report(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  if (obj.schemaVersion !== 1) return false;
  for (const key of REQUIRED_SECTION6_KEYS) {
    if (!(key in obj)) return false;
  }
  return typeof obj.passed === 'boolean' && Number.isInteger(obj.exitCode) && Array.isArray(obj.findings);
}

const { harness, home, promptCmd, recording, unknownFlag } = parseArgs(process.argv.slice(2));

if (unknownFlag) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: `Unknown flag: ${unknownFlag}`, results: [], recording: null }, null, 2)}\n`);
  process.exit(1);
}

const targets = harness === 'all' ? Object.keys(HARNESS_DESTS) : [harness];
for (const t of targets) {
  if (!HARNESS_DESTS[t]) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: `Unknown harness: ${t}`, results: [], recording: null }, null, 2)}\n`);
    process.exit(1);
  }
}

const promptText = promptCmd && fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';
const results = [];
let allOk = true;

for (const name of targets) {
  const dest = path.join(home, ...HARNESS_DESTS[name]);
  const skillMd = path.join(dest, 'SKILL.md');
  const skillListed = fs.existsSync(skillMd);
  let skillPath = null;
  if (skillListed) {
    try {
      skillPath = fs.realpathSync(dest);
    } catch {
      skillPath = dest;
    }
  }

  let promptPassed = null;
  let promptJson = null;

  if (promptCmd) {
    const run = spawnSync(promptCmd, {
      shell: true,
      input: promptText,
      encoding: 'utf8',
      env: { ...process.env, PIXEL_GATE_HARNESS: name },
      windowsHide: true,
    });
    let parsed = null;
    try {
      parsed = JSON.parse(run.stdout || '');
    } catch {
      parsed = null;
    }
    if (isValidSection6Report(parsed)) {
      promptPassed = true;
      promptJson = parsed;
    } else {
      promptPassed = false;
      promptJson = null;
    }
  }

  const entryOk = skillListed && (promptCmd ? promptPassed === true : true);
  if (!entryOk) allOk = false;

  results.push({
    harness: name,
    skillListed,
    skillPath,
    promptPassed,
    promptJson,
  });
}

const resolvedRecording = recording && fs.existsSync(recording) ? recording : null;

process.stdout.write(`${JSON.stringify({ ok: allOk, results, recording: resolvedRecording }, null, 2)}\n`);
process.exit(allOk ? 0 : 1);
