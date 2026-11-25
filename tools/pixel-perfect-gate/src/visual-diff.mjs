/**
 * Gate 2: Visual Diff Runner (pixelmatch + @2x DPR + masking + 3-panel composite + wireframe mode).
 */
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

function blitPng(src, dst, offsetX) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (y * src.width + x) * 4;
      const dstIdx = (y * dst.width + (offsetX + x)) * 4;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }
}

export function buildCompositePng(panels, outPath) {
  const gap = 8;
  const width = panels.reduce((acc, p) => acc + p.width, 0) + gap * (panels.length - 1);
  const height = Math.max(...panels.map((p) => p.height));
  const composite = new PNG({ width, height, fill: true });

  // Fill background with dark slate (#0f172a)
  for (let i = 0; i < composite.data.length; i += 4) {
    composite.data[i] = 15;
    composite.data[i + 1] = 23;
    composite.data[i + 2] = 42;
    composite.data[i + 3] = 255;
  }

  let offsetX = 0;
  for (const panel of panels) {
    blitPng(panel, composite, offsetX);
    offsetX += panel.width + gap;
  }

  fs.writeFileSync(outPath, PNG.sync.write(composite));
  return outPath;
}

export function cropPng(src, x, y, width, height) {
  const dst = new PNG({ width, height, fill: true });
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const srcX = x + dx;
      const srcY = y + dy;
      const dstIdx = (dy * width + dx) * 4;
      if (srcX >= 0 && srcX < src.width && srcY >= 0 && srcY < src.height) {
        const srcIdx = (srcY * src.width + srcX) * 4;
        dst.data[dstIdx] = src.data[srcIdx];
        dst.data[dstIdx + 1] = src.data[srcIdx + 1];
        dst.data[dstIdx + 2] = src.data[srcIdx + 2];
        dst.data[dstIdx + 3] = src.data[srcIdx + 3];
      } else {
        dst.data[dstIdx] = 0;
        dst.data[dstIdx + 1] = 0;
        dst.data[dstIdx + 2] = 0;
        dst.data[dstIdx + 3] = 0;
      }
    }
  }
  return dst;
}

export function readReferencePng(refPath) {
  if (!fs.existsSync(refPath)) {
    throw new Error(`Reference image not found: ${refPath}`);
  }
  return PNG.sync.read(fs.readFileSync(refPath));
}

function slugifySelector(selector) {
  return String(selector || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function axisDelta(actual, expected) {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return Infinity;
  return Math.abs(actual - expected);
}

export function compareWireframeLandmarks(actualLandmarks = [], expectedLandmarks = null, tolerance = 4, hasSidecar = false) {
  const findings = [];
  let normalizedExpected = expectedLandmarks;
  if (
    normalizedExpected &&
    !Array.isArray(normalizedExpected) &&
    typeof normalizedExpected === 'object'
  ) {
    normalizedExpected = Object.entries(normalizedExpected)
      .filter(([, box]) => box && typeof box === 'object')
      .map(([selector, box]) => ({ selector, index: 0, ...box }));
  }

  if (hasSidecar && (!Array.isArray(normalizedExpected) || normalizedExpected.length === 0)) {
    findings.push({
      id: 'gate2.landmark.invalid-sidecar',
      gate: 'gate2',
      severity: 'fail',
      selector: '',
      box: null,
      text: 'Expected landmarks sidecar is present but does not contain a non-empty array of landmarks.',
    });
    return { passed: false, findings, actualLandmarks };
  }

  if (!Array.isArray(actualLandmarks) || actualLandmarks.length === 0) {
    findings.push({
      id: 'gate2.landmark.missing-page-landmarks',
      gate: 'gate2',
      severity: 'fail',
      selector: '',
      box: null,
      text: 'No visible landmarks found on page (blank or unsemantic page).',
    });
    return { passed: false, findings, actualLandmarks: [] };
  }

  if (Array.isArray(normalizedExpected) && normalizedExpected.length > 0) {
    const actualByKey = new Map();
    for (const lm of actualLandmarks) {
      const key = `${lm.selector}::${lm.index ?? 0}`;
      actualByKey.set(key, lm);
    }

    for (const exp of normalizedExpected) {
      const idx = exp.index ?? 0;
      const key = `${exp.selector}::${idx}`;
      const act = actualByKey.get(key);
      const slug = slugifySelector(exp.selector);
      const suffix = idx > 0 ? `.${idx + 1}` : '';
      const id = `gate2.landmark.${slug}${suffix}`;

      if (!act) {
        findings.push({
          id,
          gate: 'gate2',
          severity: 'fail',
          selector: exp.selector,
          box: null,
          text: `Expected landmark "${exp.selector}" (index ${idx}) is missing from the page.`,
        });
        continue;
      }

      const dx = axisDelta(act.x, exp.x);
      const dy = axisDelta(act.y, exp.y);
      const dw = axisDelta(act.width, exp.width);
      const dh = axisDelta(act.height, exp.height);
      const maxDelta = Math.max(dx, dy, dw, dh);

      if (maxDelta > tolerance) {
        findings.push({
          id,
          gate: 'gate2',
          severity: 'fail',
          selector: exp.selector,
          box: { x: act.x, y: act.y, width: act.width, height: act.height },
          text: `Landmark "${exp.selector}" shifted/resized beyond ${tolerance}px tolerance (dx=${dx}, dy=${dy}, dw=${dw}, dh=${dh}).`,
        });
      }
    }
  }

  return {
    passed: findings.length === 0,
    findings,
    actualLandmarks,
  };
}

export function compareVisual({
  refImg,
  actualPath,
  outDir,
  threshold,
  maxDiff,
  mode,
  maskBoxes = [],
  dpr = 1,
  fullPage = false,
  wireframe = null,
}) {
  let actualImg = PNG.sync.read(fs.readFileSync(actualPath));
  const compositePath = path.join(outDir, 'composite-diff.png');

  if (mode === 'wireframe') {
    buildCompositePng([refImg, actualImg], compositePath);
    const lmResult = compareWireframeLandmarks(
      wireframe?.actualLandmarks ?? [],
      wireframe?.expectedLandmarks ?? null,
      wireframe?.tolerance ?? 4,
      wireframe?.hasSidecar ?? false
    );
    return {
      passed: lmResult.passed,
      mode: 'wireframe',
      mismatchPct: null,
      regions: [],
      regionCount: 0,
      dimensions: `${actualImg.width}x${actualImg.height}`,
      landmarks: lmResult.actualLandmarks,
      findings: lmResult.findings,
      note: lmResult.passed
        ? 'Wireframe mode: landmark boxes within <=4px tolerance; inspect composite-diff.png (Reference | Actual).'
        : `Wireframe mode failed: ${lmResult.findings.map((f) => f.text).join(' ')}`,
      artifacts: {
        actual: actualPath,
        composite: compositePath,
        reference: null,
      },
    };
  }

  // Handle minor rounding differences from subpixel --selector cropping when not --full-page
  if (actualImg.width !== refImg.width || actualImg.height !== refImg.height) {
    const diffW = Math.abs(actualImg.width - refImg.width);
    const diffH = Math.abs(actualImg.height - refImg.height);
    const maxDrift = fullPage ? 0 : Math.ceil(dpr);

    if (maxDrift > 0 && diffW <= maxDrift && diffH <= maxDrift) {
      // Crop / pad actualImg to match refImg dimensions exactly
      const conformed = new PNG({ width: refImg.width, height: refImg.height, fill: true });
      for (let y = 0; y < refImg.height; y++) {
        for (let x = 0; x < refImg.width; x++) {
          const dstIdx = (y * refImg.width + x) * 4;
          if (x < actualImg.width && y < actualImg.height) {
            const srcIdx = (y * actualImg.width + x) * 4;
            conformed.data[dstIdx] = actualImg.data[srcIdx];
            conformed.data[dstIdx + 1] = actualImg.data[srcIdx + 1];
            conformed.data[dstIdx + 2] = actualImg.data[srcIdx + 2];
            conformed.data[dstIdx + 3] = actualImg.data[srcIdx + 3];
          } else {
            conformed.data[dstIdx] = 0;
            conformed.data[dstIdx + 1] = 0;
            conformed.data[dstIdx + 2] = 0;
            conformed.data[dstIdx + 3] = 0;
          }
        }
      }
      actualImg = conformed;
      fs.writeFileSync(actualPath, PNG.sync.write(actualImg));
    } else {
      const errorMsg = `Dimension mismatch: Reference is ${refImg.width}x${refImg.height}, Actual is ${actualImg.width}x${actualImg.height}. Check CSS container dimensions or --dpr.`;
      return {
        passed: false,
        mode: 'pixel',
        mismatchPct: null,
        regions: [],
        regionCount: 0,
        error: errorMsg,
        dimensions: `${actualImg.width}x${actualImg.height}`,
        findings: [
          {
            id: 'gate2.dimension-mismatch',
            gate: 'gate2',
            severity: 'fail',
            selector: '',
            box: null,
            text: errorMsg,
          },
        ],
        artifacts: { actual: actualPath },
      };
    }
  }

  // Prepare buffers for pixelmatch. If maskBoxes are provided, paint those regions with the same opaque fill on both images
  const refData = Buffer.from(refImg.data);
  const actData = Buffer.from(actualImg.data);
  const MASK_FILL = [20, 20, 20, 255];

  if (maskBoxes && maskBoxes.length > 0) {
    for (const box of maskBoxes) {
      const startX = Math.max(0, Math.floor(box.x * dpr));
      const startY = Math.max(0, Math.floor(box.y * dpr));
      const endX = Math.min(refImg.width, Math.ceil((box.x + box.width) * dpr));
      const endY = Math.min(refImg.height, Math.ceil((box.y + box.height) * dpr));
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * refImg.width + x) * 4;
          for (const buf of [refData, actData, refImg.data, actualImg.data]) {
            buf[idx] = MASK_FILL[0];
            buf[idx + 1] = MASK_FILL[1];
            buf[idx + 2] = MASK_FILL[2];
            buf[idx + 3] = MASK_FILL[3];
          }
        }
      }
    }
    fs.writeFileSync(actualPath, PNG.sync.write(actualImg));
  }

  const diff = new PNG({ width: refImg.width, height: refImg.height });
  const numDiffPixels = pixelmatch(
    refData,
    actData,
    diff.data,
    refImg.width,
    refImg.height,
    { threshold }
  );

  const diffPath = path.join(outDir, 'diff.png');
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  buildCompositePng([refImg, actualImg, diff], compositePath);

  const totalPixels = refImg.width * refImg.height;
  const mismatchPct = Number(((numDiffPixels / totalPixels) * 100).toFixed(3));
  const passed = mismatchPct <= maxDiff;
  const { regions, regionCount } = numDiffPixels > 0
    ? clusterDiffRegions(diff.data, refImg.width, refImg.height, dpr, 8)
    : { regions: [], regionCount: 0 };

  const findings = passed
    ? []
    : regions.length > 0
      ? regions.map((r) => ({
          id: r.id,
          gate: 'gate2',
          severity: 'fail',
          selector: '',
          box: r.box,
          text: `Visual diff in ${r.box.width}x${r.box.height}px region at (${r.box.x},${r.box.y}): ${r.mismatchPct}% mismatch.`,
        }))
      : [
          {
            id: 'gate2.pixel-mismatch',
            gate: 'gate2',
            severity: 'fail',
            selector: '',
            box: null,
            text: `Visual mismatch ${mismatchPct}% exceeds max-diff ${maxDiff}%.`,
          },
        ];

  return {
    passed,
    mode: 'pixel',
    mismatchPct,
    maxAllowedPct: maxDiff,
    diffPixels: numDiffPixels,
    regions,
    regionCount,
    dimensions: `${refImg.width}x${refImg.height}`,
    findings,
    artifacts: {
      actual: actualPath,
      diff: diffPath,
      composite: compositePath,
    },
  };
}

/**
 * Cluster differing pixels into bounding-box regions in CSS pixels using an 8 CSS px gap.
 * Returns reading-order sorted regions (top, then left), capped at 20, plus total regionCount.
 */
export function clusterDiffRegions(diffData, width, height, dpr = 1, gapCssPx = 8) {
  const cssW = Math.ceil(width / dpr);
  const cssH = Math.ceil(height / dpr);
  const totalCells = cssW * cssH;
  const active = new Uint8Array(totalCells);
  const cellDiffs = new Uint16Array(totalCells);

  for (let py = 0; py < height; py++) {
    const cy = Math.floor(py / dpr);
    const rowOffset = py * width;
    for (let px = 0; px < width; px++) {
      const idx = (rowOffset + px) * 4;
      if (diffData[idx] === 255 && diffData[idx + 1] === 0 && diffData[idx + 2] === 0 && diffData[idx + 3] === 255) {
        const cx = Math.floor(px / dpr);
        const cIdx = cy * cssW + cx;
        active[cIdx] = 1;
        cellDiffs[cIdx] += 1;
      }
    }
  }

  // Disjoint-set union over active CSS cells
  const parent = new Int32Array(totalCells);
  parent.fill(-1);

  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let curr = i;
    while (curr !== root) {
      const next = parent[curr];
      parent[curr] = root;
      curr = next;
    }
    return root;
  };

  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < totalCells; i++) {
    if (active[i]) parent[i] = i;
  }

  // Pass 1: 4-neighbor union
  for (let cy = 0; cy < cssH; cy++) {
    const row = cy * cssW;
    for (let cx = 0; cx < cssW; cx++) {
      const idx = row + cx;
      if (!active[idx]) continue;
      if (cx + 1 < cssW && active[idx + 1]) union(idx, idx + 1);
      if (cy + 1 < cssH && active[idx + cssW]) union(idx, idx + cssW);
    }
  }

  // Pass 2: gap union for boundary cells
  for (let cy = 0; cy < cssH; cy++) {
    const row = cy * cssW;
    for (let cx = 0; cx < cssW; cx++) {
      const idx = row + cx;
      if (!active[idx]) continue;
      const isBoundary =
        cx === 0 || cx === cssW - 1 || cy === 0 || cy === cssH - 1 ||
        !active[idx - 1] || !active[idx + 1] || !active[idx - cssW] || !active[idx + cssW];
      if (!isBoundary) continue;

      const maxY = Math.min(cssH - 1, cy + gapCssPx);
      const minX = Math.max(0, cx - gapCssPx);
      const maxX = Math.min(cssW - 1, cx + gapCssPx);
      for (let ny = cy; ny <= maxY; ny++) {
        const nRow = ny * cssW;
        for (let nx = minX; nx <= maxX; nx++) {
          if (ny === cy && nx <= cx) continue;
          const nIdx = nRow + nx;
          if (active[nIdx]) union(idx, nIdx);
        }
      }
    }
  }

  // Aggregate bounding boxes per root
  const boxes = new Map();
  for (let cy = 0; cy < cssH; cy++) {
    const row = cy * cssW;
    for (let cx = 0; cx < cssW; cx++) {
      const idx = row + cx;
      if (!active[idx]) continue;
      const root = find(idx);
      let entry = boxes.get(root);
      if (!entry) {
        entry = { minX: cx, minY: cy, maxX: cx, maxY: cy, diffPixels: 0 };
        boxes.set(root, entry);
      } else {
        if (cx < entry.minX) entry.minX = cx;
        if (cy < entry.minY) entry.minY = cy;
        if (cx > entry.maxX) entry.maxX = cx;
        if (cy > entry.maxY) entry.maxY = cy;
      }
      entry.diffPixels += cellDiffs[idx];
    }
  }

  const sorted = Array.from(boxes.values())
    .map((b) => {
      const boxW = b.maxX - b.minX + 1;
      const boxH = b.maxY - b.minY + 1;
      const areaPx = boxW * boxH * dpr * dpr;
      const pct = Math.min(100, Number(((b.diffPixels / areaPx) * 100).toFixed(3)));
      return {
        box: { x: b.minX, y: b.minY, width: boxW, height: boxH },
        mismatchPct: pct,
      };
    })
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

  const allRegions = sorted.map((r, i) => ({
    id: `gate2.region.${i + 1}`,
    box: r.box,
    mismatchPct: r.mismatchPct,
  }));

  return {
    regions: allRegions.slice(0, 20),
    regionCount: allRegions.length,
  };
}
