/**
 * Design-file reference intake (SPEC.md §12.2, §12.4, §12.5; M2b.7 / SIDE-34).
 * Supports Figma REST /v1/images when FIGMA_TOKEN is set, or manual exportDir PNGs.
 * Extracts .landmarks.json, .tokens.json, and scenarios.draft.json under Tier B.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getBundleDir, sha256Buffer, sha256File } from './reference-bundle.mjs';

const DEFAULT_LANDMARKS = new Set(['header', 'nav', 'main', 'footer']);

function collectLandmarksFromNode(node, frameBox, out, landmarkSet) {
  if (!node || typeof node !== 'object') return;
  const name = String(node.name || '').trim().toLowerCase();
  if (landmarkSet.has(name) && node.absoluteBoundingBox) {
    const b = node.absoluteBoundingBox;
    out[name] = {
      x: Math.round(b.x - (frameBox?.x || 0)),
      y: Math.round(b.y - (frameBox?.y || 0)),
      width: Math.round(b.width),
      height: Math.round(b.height),
    };
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectLandmarksFromNode(child, frameBox, out, landmarkSet);
    }
  }
}

function collectDraftInteractions(node, drafts) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node.interactions)) {
    for (const inter of node.interactions) {
      const trigger = inter?.trigger?.type;
      const action = Array.isArray(inter?.actions) ? inter.actions[0] : null;
      if (trigger === 'ON_CLICK' && action?.type === 'NODE' && action?.destinationId) {
        drafts.push({
          id: `draft-${String(node.id || 'node').replace(/[^a-z0-9]+/gi, '-')}`,
          draft: true,
          steps: [
            { action: 'click', selector: `[data-figma-node="${node.id}"]` },
            { action: 'wait', ms: 100, expectDestinationId: action.destinationId, navigation: action.navigation || 'NAVIGATE' },
          ],
        });
      }
    }
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectDraftInteractions(child, drafts);
    }
  }
}

async function fetchFigmaImage(apiBase, fileKey, nodeId, dpr, token) {
  const base = String(apiBase || 'https://api.figma.com').replace(/\/+$/, '');
  const url = `${base}/v1/images/${encodeURIComponent(fileKey)}?ids=${encodeURIComponent(nodeId)}&format=png&scale=${dpr}`;
  const res = await fetch(url, {
    headers: { 'X-Figma-Token': token },
  });
  if (!res.ok) {
    throw new Error(`Figma REST /v1/images returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const imgUrl = data?.images?.[nodeId];
  if (!imgUrl) {
    throw new Error(`Figma REST /v1/images did not return an image URL for node ${nodeId}`);
  }
  const imgRes = await fetch(imgUrl);
  if (!imgRes.ok) {
    throw new Error(`Figma image download returned HTTP ${imgRes.status}`);
  }
  return Buffer.from(await imgRes.arrayBuffer());
}

export async function prepareDesignFileBundle({ cwd, config, route, viewport, dpr = 1 }) {
  const design = config?.design || {};
  const frames = Array.isArray(design.frames) ? design.frames : [];
  const frame = frames.find((f) => f.route === route.id && f.viewport === viewport.name);
  if (!frame) {
    throw new Error(`No design.frames entry matches route "${route.id}" and viewport "${viewport.name}"`);
  }

  let nodesDoc = null;
  if (design.nodesFile) {
    const nodesPath = path.resolve(cwd, design.nodesFile);
    if (fs.existsSync(nodesPath)) {
      const parsed = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));
      nodesDoc = parsed?.nodes?.[frame.nodeId]?.document || null;
    }
  }

  if (nodesDoc?.absoluteBoundingBox) {
    const frameW = Number(nodesDoc.absoluteBoundingBox.width);
    if (frameW !== viewport.width) {
      return {
        ok: false,
        blocked: true,
        finding: {
          id: `gate2.frame-viewport-mismatch.${frame.nodeId}`,
          gate: 'gate2',
          severity: 'fail',
          selector: '',
          box: null,
          text: `Design frame "${frame.nodeId}" width (${frameW}) does not match viewport "${viewport.name}" width (${viewport.width}).`,
        },
      };
    }
  }

  const bDir = getBundleDir(cwd, route.id, viewport.name);
  fs.mkdirSync(bDir, { recursive: true });
  const outPngPath = path.join(bDir, `${viewport.name}.png`);

  const token = process.env.FIGMA_TOKEN ? String(process.env.FIGMA_TOKEN).trim() : '';
  let pngBuf;
  let sourceHash;
  if (token) {
    pngBuf = await fetchFigmaImage(design.apiBase, design.fileKey, frame.nodeId, dpr, token);
    sourceHash = sha256Buffer(pngBuf);
  } else {
    const exportDir = design.exportDir || 'export';
    const manualPath = path.resolve(cwd, exportDir, route.id, `${viewport.name}.png`);
    if (!fs.existsSync(manualPath)) {
      throw new Error(`Manual design export PNG not found: ${manualPath}`);
    }
    pngBuf = fs.readFileSync(manualPath);
    sourceHash = sha256File(manualPath);
  }

  fs.writeFileSync(outPngPath, pngBuf);

  if (nodesDoc) {
    const landmarks = {};
    const landmarkSet = new Set(
      Array.isArray(config?.landmarks)
        ? config.landmarks.map((s) => String(s).trim().toLowerCase())
        : [...DEFAULT_LANDMARKS]
    );
    collectLandmarksFromNode(nodesDoc, nodesDoc.absoluteBoundingBox, landmarks, landmarkSet);
    if (Object.keys(landmarks).length > 0) {
      fs.writeFileSync(path.join(bDir, '.landmarks.json'), `${JSON.stringify(landmarks, null, 2)}\n`);
    }

    const drafts = [];
    collectDraftInteractions(nodesDoc, drafts);
    if (drafts.length > 0) {
      const routeDir = path.join(cwd, '.visual-eval', 'references', route.id);
      fs.mkdirSync(routeDir, { recursive: true });
      fs.writeFileSync(path.join(routeDir, 'scenarios.draft.json'), `${JSON.stringify({ scenarios: drafts }, null, 2)}\n`);
    }
  }

  if (design.variableDefs) {
    const varsPath = path.resolve(cwd, design.variableDefs);
    if (fs.existsSync(varsPath)) {
      const varsData = JSON.parse(fs.readFileSync(varsPath, 'utf8'));
      const tokens = varsData?.tokens && typeof varsData.tokens === 'object' ? varsData.tokens : varsData;
      fs.writeFileSync(path.join(bDir, '.tokens.json'), `${JSON.stringify({ tokens }, null, 2)}\n`);
    }
  }

  const manifest = {
    kind: 'design-file',
    source: `${design.fileKey || 'manual'}:${frame.nodeId}`,
    sha256: {
      source: sourceHash,
      png: sha256Buffer(pngBuf),
    },
    capturedAt: new Date().toISOString(),
    playwright: '1.65.1',
    viewport: { name: viewport.name, width: viewport.width, height: viewport.height },
    dpr,
    tier: 'B',
    copyAcknowledgedAt: null,
    sourceFormat: 'png',
  };
  fs.writeFileSync(path.join(bDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { ok: true, bundleDir: bDir, pngPath: outPngPath, manifest };
}
