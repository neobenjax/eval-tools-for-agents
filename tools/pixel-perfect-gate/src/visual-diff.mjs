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

export function compareVisual({ refImg, actualPath, outDir, threshold, maxDiff, mode, maskBoxes = [], dpr = 1 }) {
  let actualImg = PNG.sync.read(fs.readFileSync(actualPath));
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

  // Handle minor rounding differences from odd reference dimensions at higher DPR
  if (actualImg.width !== refImg.width || actualImg.height !== refImg.height) {
    const diffW = Math.abs(actualImg.width - refImg.width);
    const diffH = Math.abs(actualImg.height - refImg.height);
    const maxDrift = Math.ceil(dpr);

    if (diffW <= maxDrift && diffH <= maxDrift) {
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
      return {
        passed: false,
        mode: 'pixel',
        error: `Dimension mismatch: Reference is ${refImg.width}x${refImg.height}, Actual is ${actualImg.width}x${actualImg.height}. Check CSS container dimensions or --dpr.`,
        dimensions: `${actualImg.width}x${actualImg.height}`,
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
