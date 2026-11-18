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

export function readReferencePng(refPath) {
  if (!fs.existsSync(refPath)) {
    throw new Error(`Reference image not found: ${refPath}`);
  }
  return PNG.sync.read(fs.readFileSync(refPath));
}

export function compareVisual({ refImg, actualPath, outDir, threshold, maxDiff, mode }) {
  const actualImg = PNG.sync.read(fs.readFileSync(actualPath));
  const compositePath = path.join(outDir, 'composite-diff.png');

  if (mode === 'wireframe') {
    buildCompositePng([refImg, actualImg], compositePath);
    return {
      passed: true,
      mode: 'wireframe',
      mismatchPct: null,
      dimensions: `${actualImg.width}x${actualImg.height}`,
      note: 'Wireframe mode: pixelmatch skipped; inspect composite-diff.png (Reference | Actual) for structural fidelity.',
      artifacts: {
        actual: actualPath,
        composite: compositePath,
        reference: null,
      },
    };
  }

  if (actualImg.width !== refImg.width || actualImg.height !== refImg.height) {
    return {
      passed: false,
      mode: 'pixel',
      error: `Dimension mismatch: Reference is ${refImg.width}x${refImg.height}, Actual is ${actualImg.width}x${actualImg.height}. Check CSS container dimensions or --dpr.`,
      dimensions: `${actualImg.width}x${actualImg.height}`,
      artifacts: { actual: actualPath },
    };
  }

  const diff = new PNG({ width: refImg.width, height: refImg.height });
  const numDiffPixels = pixelmatch(
    refImg.data,
    actualImg.data,
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

  return {
    passed,
    mode: 'pixel',
    mismatchPct,
    maxAllowedPct: maxDiff,
    diffPixels: numDiffPixels,
    dimensions: `${refImg.width}x${refImg.height}`,
    artifacts: {
      actual: actualPath,
      diff: diffPath,
      composite: compositePath,
    },
  };
}
