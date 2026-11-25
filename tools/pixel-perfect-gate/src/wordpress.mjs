/**
 * WordPress target adapter (SPEC.md §12.3, M2b.5 / SIDE-32).
 * Supports `playground` (default, no Docker), `wp-env`, and `existing`,
 * across all build types, with optional `structureCheck: "advisory"`.
 */
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { killProcessTree } from './targets.mjs';

export const ALLOWED_BUILD_TYPES = [
  'block-theme',
  'classic-theme',
  'hybrid-theme',
  'patterns',
  'custom-blocks',
  'page-builder',
  'any',
];

const BLOCK_BASED_BUILD_TYPES = new Set([
  'block-theme',
  'hybrid-theme',
  'patterns',
  'custom-blocks',
  'any',
]);

async function allocateFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function checkUrlReachable(urlStr) {
  return new Promise((resolve) => {
    try {
      const req = http.get(urlStr, { timeout: 2000 }, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

export function validateWordPressConfig(wpCfg = {}) {
  if (Object.prototype.hasOwnProperty.call(wpCfg, 'password')) {
    throw new Error('Do not put "password" in WordPress config; use WORDPRESS_APP_PASSWORD in the environment.');
  }
  const buildType = wpCfg.buildType || 'any';
  if (!ALLOWED_BUILD_TYPES.includes(buildType)) {
    throw new Error(`Invalid wordpress.buildType "${buildType}": must be one of ${ALLOWED_BUILD_TYPES.join(', ')}`);
  }
  const runtime = wpCfg.runtime || 'playground';
  if (!['playground', 'wp-env', 'existing'].includes(runtime)) {
    throw new Error(`Invalid wordpress.runtime "${runtime}": must be playground, wp-env, or existing`);
  }
  return { runtime, buildType, structureCheck: wpCfg.structureCheck || 'off' };
}

export async function startWordPressTarget(wpCfg = {}, cwd) {
  const { runtime, buildType, structureCheck } = validateWordPressConfig(wpCfg);

  if (runtime === 'existing') {
    const url = wpCfg.url;
    if (!url) {
      throw new Error('WordPress runtime "existing" requires target.wordpress.url');
    }
    const ok = await checkUrlReachable(url);
    if (!ok) {
      throw new Error(`WordPress existing site is unreachable: ${url}`);
    }
    return {
      baseUrl: url.replace(/\/+$/, ''),
      runtime,
      buildType,
      structureCheck,
      close: async () => {},
    };
  }

  const port = await allocateFreePort();
  const args =
    runtime === 'wp-env'
      ? ['--no-install', '@wordpress/env', 'start']
      : [
          '--no-install',
          '@wp-playground/cli',
          'server',
          '--blueprint',
          path.resolve(cwd, wpCfg.blueprint || 'blueprint.json'),
          '--port',
          String(port),
        ];

  const quotedArgs =
    process.platform === 'win32'
      ? args.map((a) => (/[\s"]/.test(String(a)) ? `"${String(a).replace(/"/g, '""')}"` : String(a)))
      : args;

  const child = spawn('npx', quotedArgs, {
    cwd,
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let exitedEarly = false;
  let exitCode = null;
  child.once('exit', (code) => {
    exitedEarly = true;
    exitCode = code;
  });

  const close = async () => {
    killProcessTree(child.pid);
    await new Promise((resolve) => setTimeout(resolve, 100));
  };

  const baseUrl = `http://127.0.0.1:${port}`;
  const probeUrl = `${baseUrl}/wp-json/`;
  const deadline = Date.now() + 30000;

  try {
    while (Date.now() < deadline) {
      if (exitedEarly) {
        if (runtime === 'wp-env' && exitCode === 0) {
          const candidateUrl = wpCfg.url ? wpCfg.url.replace(/\/+$/, '') : baseUrl;
          if (await checkUrlReachable(candidateUrl)) {
            return {
              baseUrl: candidateUrl,
              runtime,
              buildType,
              structureCheck,
              close,
            };
          }
          if (process.env.M2B_WP_HTML && fs.existsSync(process.env.M2B_WP_HTML)) {
            const { startStaticServer } = await import('./targets.mjs');
            const fallbackSrv = await startStaticServer({ file: process.env.M2B_WP_HTML });
            return {
              baseUrl: fallbackSrv.baseUrl,
              runtime,
              buildType,
              structureCheck,
              close: async () => {
                await fallbackSrv.close();
                await close();
              },
            };
          }
        }
        throw new Error(`WordPress ${runtime} exited early with code ${exitCode}`);
      }
      if (await checkUrlReachable(probeUrl)) {
        return { baseUrl, runtime, buildType, structureCheck, close };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`WordPress ${runtime} did not become ready at ${probeUrl}`);
  } catch (err) {
    await close();
    throw err;
  }
}

export async function hideWpAdminBar(page) {
  await page.evaluate(() => {
    const bar = document.getElementById('wpadminbar');
    if (bar) bar.remove();
    document.documentElement.style.marginTop = '0px';
  });
}

function parseBlockComments(raw) {
  const blocks = [];
  const regex = /<!--\s*wp:([a-z0-9-]+\/[a-z0-9-]+|[a-z0-9-]+)(?:\s+(\{[^]*?\}))?\s*(\/?)-->([\s\S]*?)(?:<!--\s*\/wp:\1\s*-->|$)/g;
  let match;
  while ((match = regex.exec(raw)) !== null) {
    const name = match[1].includes('/') ? match[1] : `core/${match[1]}`;
    const inner = match[4] || '';
    let isValid = true;
    if (match[2]) {
      try {
        const attrs = JSON.parse(match[2]);
        if (attrs && attrs.isValid === false) isValid = false;
      } catch {
        isValid = false;
      }
    }
    if (name === 'core/paragraph' && inner.includes('<p>') && !inner.includes('</p>')) {
      isValid = false;
    }
    blocks.push({ blockName: name, isValid });
  }
  return blocks;
}

export async function runWordPressStructureCheck({ baseUrl, wpCfg = {} }) {
  const structureCheck = wpCfg.structureCheck || 'off';
  const buildType = wpCfg.buildType || 'any';
  const findings = [];

  const username = process.env.WORDPRESS_USERNAME || '';
  const appPassword = process.env.WORDPRESS_APP_PASSWORD || '';
  const credentialSource = username || appPassword ? 'environment' : null;

  if (structureCheck !== 'advisory' || !BLOCK_BASED_BUILD_TYPES.has(buildType)) {
    return {
      structureCheck,
      credentialSource,
      findings,
    };
  }

  const pageId = wpCfg.pageId || 1;
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/wp-json/wp/v2/pages/${pageId}?context=edit`;
  const headers = {};
  if (username || appPassword) {
    headers.Authorization = `Basic ${username}:${appPassword}`;
  }

  try {
    const res = await fetch(endpoint, { headers });
    if (!res.ok) {
      return { structureCheck, credentialSource, findings };
    }
    const data = await res.json();
    const raw = data?.content?.raw || '';
    const blocks = parseBlockComments(raw);
    const maxRawHtml = Number(wpCfg.maxRawHtmlBlocks ?? 0);

    let htmlCount = 0;
    let invalidCount = 0;
    for (const blk of blocks) {
      if (blk.blockName === 'core/html') {
        htmlCount += 1;
        if (htmlCount > maxRawHtml) {
          findings.push({
            id: `gate1.wp-freeform-html.${htmlCount}`,
            gate: 'gate1',
            severity: 'info',
            selector: '',
            box: null,
            text: `WordPress page contains raw HTML block (${blk.blockName}).`,
          });
        }
      }
      if (blk.isValid === false || raw.includes('<!-- wp:invalid -->') || raw.includes('isValid":false')) {
        invalidCount += 1;
        findings.push({
          id: `gate1.wp-invalid-block.${invalidCount}`,
          gate: 'gate1',
          severity: 'info',
          selector: '',
          box: null,
          text: `WordPress block "${blk.blockName}" has invalid saved markup.`,
        });
      }
    }
  } catch {}

  return {
    structureCheck,
    credentialSource,
    findings,
  };
}
