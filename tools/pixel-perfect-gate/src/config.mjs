import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve and validate `--out` so all artifacts stay inside `<cwd>/.visual-eval`.
 */
export function resolveSafeOutDir(cwd, outOpt = '.visual-eval', { allowTestDir = false } = {}) {
  const baseVisualEval = path.resolve(cwd, '.visual-eval');
  const resolvedOut = path.resolve(cwd, outOpt || '.visual-eval');
  const isInside = (base) => {
    const rel = path.relative(base, resolvedOut);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  const inside = isInside(baseVisualEval) || (allowTestDir && isInside(path.resolve(cwd, '.visual-eval-test')));
  if (!inside) {
    throw new Error(`Invalid --out "${outOpt}": output directory must stay inside .visual-eval/`);
  }
  return resolvedOut;
}

/**
 * Load and validate `pixel-gate.config.json` (or `--config <file>`).
 * Returns `{ configPath, config }` or `null` when no config file is requested or present.
 */
export function loadProjectConfig(cwd, configOpt = null) {
  let configPath = null;
  if (configOpt) {
    configPath = path.resolve(cwd, configOpt);
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found (--config): ${configOpt}`);
    }
  } else {
    const defaultPath = path.join(cwd, 'pixel-gate.config.json');
    if (!fs.existsSync(defaultPath)) {
      return null;
    }
    configPath = defaultPath;
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in config file ${configPath}: ${err.message}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`Invalid config in ${configPath}: expected a JSON object`);
  }
  if (typeof raw.baseUrl !== 'string' || !raw.baseUrl.trim()) {
    throw new Error(`Invalid config in ${configPath}: missing required field "baseUrl"`);
  }
  if (!Array.isArray(raw.viewports) || raw.viewports.length === 0) {
    throw new Error(`Invalid config in ${configPath}: missing required non-empty array "viewports"`);
  }
  for (const vp of raw.viewports) {
    if (!vp || typeof vp.name !== 'string' || !vp.name.trim() || !(Number(vp.width) > 0) || !(Number(vp.height) > 0)) {
      throw new Error(`Invalid config in ${configPath}: each viewport must have name, width, and height`);
    }
  }
  if (!Array.isArray(raw.routes)) {
    throw new Error(`Invalid config in ${configPath}: missing required array "routes"`);
  }
  for (const route of raw.routes) {
    if (!route || typeof route.id !== 'string' || !route.id.trim() || typeof route.path !== 'string') {
      throw new Error(`Invalid config in ${configPath}: each route must have id and path`);
    }
  }

  if (raw.scenarios !== undefined && raw.scenarios !== null) {
    const scenariosPath = path.resolve(cwd, String(raw.scenarios));
    if (!fs.existsSync(scenariosPath)) {
      throw new Error(`Configured scenarios file not found: ${raw.scenarios}`);
    }
  }
  if (raw.acceptance !== undefined && raw.acceptance !== null) {
    const acceptancePath = path.resolve(cwd, String(raw.acceptance));
    if (!fs.existsSync(acceptancePath)) {
      throw new Error(`Configured acceptance file not found: ${raw.acceptance}`);
    }
  }

  return { configPath, config: raw };
}

/**
 * Load scenarios JSON from config.scenarios.
 */
export function loadScenariosFile(cwd, scenariosRelPath) {
  if (!scenariosRelPath) return [];
  const fullPath = path.resolve(cwd, String(scenariosRelPath));
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Configured scenarios file not found: ${scenariosRelPath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in scenarios file ${scenariosRelPath}: ${err.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.scenarios;
  if (!Array.isArray(list)) {
    throw new Error(`Invalid scenarios file ${scenariosRelPath}: expected { scenarios: [...] }`);
  }
  return list;
}
