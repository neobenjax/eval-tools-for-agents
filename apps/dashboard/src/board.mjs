/**
 * Linear Delivery Board loader (SPEC.md §7, M3-AC-02).
 * Invokes local --linear-cli once per process when LINEAR_API_KEY is non-empty.
 */
import { execFileSync } from 'node:child_process';

export const STAGES = ['Todo', 'In Progress', 'In Review', 'Approved', 'Rework'];
const STAGE_SET = new Set(STAGES);

export function createBoardLoader(linearCliPath) {
  let cached = null;

  return function getBoardState() {
    if (cached) return cached;

    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      cached = {
        status: 200,
        body: {
          view: 'board',
          primary: false,
          empty: true,
          stages: STAGES.map((name) => ({ name, issues: [] })),
        },
      };
      return cached;
    }

    if (!linearCliPath) {
      cached = {
        status: 400,
        body: { view: 'board', error: { message: 'Missing --linear-cli path' } },
      };
      return cached;
    }

    let stdout;
    try {
      stdout = execFileSync(process.execPath, [linearCliPath], {
        env: { ...process.env },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      cached = {
        status: 400,
        body: {
          view: 'board',
          error: { message: `Linear CLI failed: ${err.message || 'non-zero exit'}` },
        },
      };
      return cached;
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      cached = {
        status: 400,
        body: {
          view: 'board',
          error: { message: `Invalid JSON from Linear CLI: ${err.message}` },
        },
      };
      return cached;
    }

    const issues = Array.isArray(parsed?.issues) ? parsed.issues : null;
    if (!issues) {
      cached = {
        status: 400,
        body: { view: 'board', error: { message: 'Linear CLI JSON missing issues array' } },
      };
      return cached;
    }

    const byStage = new Map(STAGES.map((s) => [s, []]));
    for (const issue of issues) {
      if (!issue || !STAGE_SET.has(issue.stage)) {
        cached = {
          status: 400,
          body: {
            view: 'board',
            error: { message: `Unknown Linear stage "${issue?.stage}"` },
          },
        };
        return cached;
      }
      byStage.get(issue.stage).push({
        id: String(issue.id),
        title: String(issue.title),
        stage: issue.stage,
      });
    }

    cached = {
      status: 200,
      body: {
        view: 'board',
        primary: false,
        empty: false,
        stages: STAGES.map((name) => ({ name, issues: byStage.get(name) })),
      },
    };
    return cached;
  };
}
