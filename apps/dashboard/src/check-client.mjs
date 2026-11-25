/**
 * Client-bundle secret scanner (SPEC.md §7, M3-AC-03).
 * Scans apps/dashboard/client (or --root) and fails if LINEAR_API_KEY appears.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CLIENT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'client'
);

function utf16Compare(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function checkClientBundle(rootOpt = null) {
  const root = rootOpt ? path.resolve(rootOpt) : DEFAULT_CLIENT_ROOT;
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    return {
      code: 1,
      json: {
        ok: false,
        root,
        files: [],
        error: { message: `Client root directory not found: ${root}` },
      },
    };
  }

  const allFiles = [];
  const leaks = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const rel = path.relative(root, full).split(path.sep).join('/');
        allFiles.push(rel);
        const content = fs.readFileSync(full, 'utf8');
        if (content.includes('LINEAR_API_KEY')) {
          leaks.push(rel);
        }
      }
    }
  };

  walk(root);
  allFiles.sort(utf16Compare);
  leaks.sort(utf16Compare);

  if (leaks.length > 0) {
    return {
      code: 1,
      json: { ok: false, root, files: leaks },
    };
  }
  return {
    code: 0,
    json: { ok: true, root, files: allFiles },
  };
}
