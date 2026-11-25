/**
 * Text checks for the M2b skill playbooks (M2b.9). Gap tests run them against
 * SKILL.md. The M2b-AC-59 break-its run them against fixture strings.
 */
export const PLAYBOOKS = [
  { heading: '## Playbook: html-file to wordpress', tier: 'tier A' },
  { heading: '## Playbook: html-file to pwa', tier: 'tier A' },
  { heading: '## Playbook: screenshot', tier: 'tier C' },
  { heading: '## Playbook: url', tier: 'tier A' },
  { heading: '## Playbook: design-file', tier: 'tier B' },
];

export const MCP_NAMES = ['Figma', 'Penpot', 'Sketch', 'WordPress', 'Playwright', 'Chrome DevTools'];

function norm(text) {
  return String(text).replace(/\r\n/g, '\n');
}

export function playbookProblems(text) {
  const body = norm(text);
  const problems = [];
  for (const book of PLAYBOOKS) {
    const start = body.indexOf(book.heading);
    if (start === -1) {
      problems.push(`missing ${book.heading}`);
      continue;
    }
    const rest = body.slice(start + book.heading.length);
    const next = rest.search(/\n## Playbook:/);
    const section = next === -1 ? rest : rest.slice(0, next);
    if (!/pixel-gate/.test(section)) problems.push(`${book.heading} does not name the pixel-gate command`);
    if (!section.includes(book.tier)) problems.push(`${book.heading} does not name ${book.tier}`);
    if (!/MCP/.test(section)) problems.push(`${book.heading} does not name an MCP server`);
  }
  return problems;
}

export function loopRuleProblems(text) {
  const body = norm(text);
  const problems = [];
  if (!body.includes('loop.continue')) problems.push('missing loop.continue');
  if (!body.includes('loop.stopReason')) problems.push('missing loop.stopReason');
  if (!body.includes('loop.best.iteration')) problems.push('missing loop.best.iteration');
  if (!body.includes('regression')) problems.push('missing regression');
  return problems;
}

export function mcpContextProblems(text) {
  const body = norm(text);
  const problems = [];
  for (const name of MCP_NAMES) {
    if (!body.includes(name)) problems.push(`missing ${name}`);
  }
  if (!body.includes('never to change passed')) problems.push('missing never to change passed');
  return problems;
}

export function copyrightRuleProblems(text) {
  const body = norm(text);
  const problems = [];
  if (!/copyright disclaimer/i.test(body)) problems.push('missing copyright disclaimer');
  if (!body.includes('reference.acknowledgeCopyright')) problems.push('missing reference.acknowledgeCopyright');
  if (!body.includes('--acknowledge-copyright')) problems.push('missing --acknowledge-copyright');
  if (!body.includes('behalf')) problems.push('missing behalf');
  return problems;
}

export function splitLoopProblems(text) {
  const body = norm(text);
  const problems = [];
  if (!body.includes('runId')) problems.push('missing runId');
  if (!body.includes('scenarios.draft.json')) problems.push('missing scenarios.draft.json');
  if (!/(?<![\d.])5(?![\d.])/.test(body)) problems.push('missing the 5 iteration cap');
  if (!body.includes('never move')) problems.push('missing never move');
  return problems;
}

export function advisoryRuleProblems(text) {
  const body = norm(text);
  const problems = [];
  if (!body.includes('tier B')) problems.push('missing tier B');
  if (!body.includes('tier C')) problems.push('missing tier C');
  if (!/advisory/i.test(body)) problems.push('missing advisory');
  if (!body.includes('never report the route as failed')) problems.push('missing never report the route as failed');
  return problems;
}

export function skillRuleProblems(text) {
  return [
    ...playbookProblems(text),
    ...loopRuleProblems(text),
    ...mcpContextProblems(text),
    ...copyrightRuleProblems(text),
    ...splitLoopProblems(text),
    ...advisoryRuleProblems(text),
  ];
}

/** A skill body that satisfies every M2b.9 checker. Not the product SKILL.md. */
export function completeSkillText() {
  return [
    '---',
    'name: pixel-perfect-gate',
    'description: Fixture skill used to prove the M2b checkers fail closed.',
    '---',
    '',
    '## Playbook: html-file to wordpress',
    'Run pixel-gate reference capture first. tier A applies. Optional MCP: the WordPress MCP Adapter helps.',
    '',
    '## Playbook: html-file to pwa',
    'Run pixel-gate reference capture first. tier A applies. Optional MCP: Chrome DevTools helps.',
    '',
    '## Playbook: screenshot',
    'Run pixel-gate for a screenshot reference first. tier C applies. Optional MCP: vision helps.',
    '',
    '## Playbook: url',
    'Run pixel-gate reference capture first. tier A applies. Optional MCP: Playwright helps. Show the copyright disclaimer.',
    '',
    '## Playbook: design-file',
    'Run pixel-gate reference capture first. tier B applies. Optional MCP: Figma helps.',
    '',
    'Obey loop.continue and loop.stopReason. On regression return to loop.best.iteration.',
    'Check whether Figma, Penpot, Sketch, WordPress, Playwright, or Chrome DevTools MCP servers are enabled and use them only for context, never to change passed.',
    'Show the user the copyright disclaimer before a url capture and never set reference.acknowledgeCopyright or pass --acknowledge-copyright on the user\'s behalf.',
    'Split a large migration into separate loops, one runId per route, instead of exceeding 5 iterations, and never move scenarios.draft.json entries into the scenario file itself.',
    'Tier B/C results are advisory: keep looping toward the similarity target, but never report the route as failed because of them.',
    '',
  ].join('\n');
}
