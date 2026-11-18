#!/usr/bin/env node
/**
 * 1:1 Linear Sync CLI for eval-tools-for-agents (Team: SIDE, Project: eval-tools-for-agents).
 * Usage:
 *   node scripts/sync-linear.mjs --status
 *   node scripts/sync-linear.mjs --move SIDE-11 "In Review"
 *   node scripts/sync-linear.mjs --sync-spec
 */
import fs from 'fs';
import path from 'path';

const TEAM_KEY = 'SIDE';
const PROJECT_NAME = 'eval-tools-for-agents';

function loadApiKey() {
  if (process.env.LINEAR_API_KEY) return process.env.LINEAR_API_KEY;
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('Missing LINEAR_API_KEY in environment or .env');
  }
  const envText = fs.readFileSync(envPath, 'utf8');
  const match = envText.match(/^LINEAR_API_KEY=(.+)$/m);
  if (!match) throw new Error('LINEAR_API_KEY not found in .env');
  return match[1].trim().replace(/^['"]|['"]$/g, '');
}

async function graphql(query, variables = {}) {
  const key = loadApiKey();
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Linear API error: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function fetchProjectIssues() {
  const data = await graphql(
    `query($teamKey: String!) {
      team(id: $teamKey) {
        id
        states { nodes { id name type } }
      }
      issues(filter: { team: { key: { eq: $teamKey } }, project: { name: { eq: "${PROJECT_NAME}" } } }, first: 100) {
        nodes {
          id
          identifier
          title
          url
          state { id name type }
          projectMilestone { name }
        }
      }
    }`,
    { teamKey: TEAM_KEY }
  );
  return {
    states: data.team.states.nodes,
    issues: data.issues.nodes.sort((a, b) => {
      const na = Number(a.identifier.split('-')[1]);
      const nb = Number(b.identifier.split('-')[1]);
      return na - nb;
    }),
  };
}

async function printStatus() {
  const { issues } = await fetchProjectIssues();
  const counts = {};
  for (const issue of issues) {
    counts[issue.state.name] = (counts[issue.state.name] || 0) + 1;
  }
  console.log(`\n📊 Linear Progression (${PROJECT_NAME} · ${TEAM_KEY})`);
  console.log('   Stages:', Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(' | '));
  console.log('');
  for (const issue of issues) {
    const ms = issue.projectMilestone?.name?.split(':')[0] || '-';
    console.log(`  [${issue.state.name.padEnd(11)}] ${issue.identifier.padEnd(7)} (${ms}) ${issue.title}`);
  }
}

async function moveIssue(identifier, targetStateName) {
  const { states, issues } = await fetchProjectIssues();
  const issue = issues.find((i) => i.identifier.toUpperCase() === identifier.toUpperCase());
  if (!issue) throw new Error(`Issue ${identifier} not found in project ${PROJECT_NAME}`);

  const state = states.find((s) => s.name.toLowerCase() === targetStateName.toLowerCase());
  if (!state) {
    throw new Error(`State "${targetStateName}" not found. Available: ${states.map((s) => s.name).join(', ')}`);
  }

  await graphql(
    `mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
        issue { identifier state { name } }
      }
    }`,
    { id: issue.id, stateId: state.id }
  );
  console.log(`✅ Moved ${issue.identifier} -> ${state.name}`);
}

async function syncSpec() {
  const { issues } = await fetchProjectIssues();
  let spec = fs.readFileSync('SPEC.md', 'utf8');
  let updated = 0;

  for (const issue of issues) {
    const isDone = issue.state.name === 'Approved' || issue.state.type === 'completed';
    const box = isDone ? 'x' : ' ';
    const re = new RegExp(`^(- \\[)[ x](\\] \\*\\*${issue.identifier}\\*\\*.*)$`, 'm');
    if (re.test(spec)) {
      spec = spec.replace(re, `$1${box}$2`);
      updated++;
    }
  }

  fs.writeFileSync('SPEC.md', spec);
  console.log(`✅ Synced ${updated} issues into SPEC.md`);
}

const args = process.argv.slice(2);
if (args.includes('--status')) {
  await printStatus();
} else if (args.includes('--move')) {
  const idx = args.indexOf('--move');
  const id = args[idx + 1];
  const stateName = args[idx + 2];
  if (!id || !stateName) {
    console.error('Usage: node scripts/sync-linear.mjs --move SIDE-XX "In Review"');
    process.exit(1);
  }
  await moveIssue(id, stateName);
} else if (args.includes('--sync-spec')) {
  await syncSpec();
} else {
  console.log('Usage: node scripts/sync-linear.mjs [--status | --move SIDE-XX "<State>" | --sync-spec]');
}
