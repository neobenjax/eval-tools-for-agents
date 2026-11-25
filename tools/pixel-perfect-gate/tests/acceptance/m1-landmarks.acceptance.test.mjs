/**
 * Green break-it tests for M1-AC-01 (landmark coordinates and the 4px boundary).
 * M1-AC-01 through M1-AC-15 are the green suite. M2-AC-01 through M2-AC-37 are pending gap tests
 * and must fail with ERR_ASSERTION until promoted (SPEC.md section 13). ENFORCED_MILESTONES is M1 and M2.
 * Section 6: schemaVersion 1; gates.gate1/gate2/gate3; findings[].id is the stable branch key;
 * error is null or { message }; a skipped gate is { passed: true, skipped: true, reason };
 * --help and --version are the only non-JSON exits.
 * Playwright is pinned to 1.65.1. mismatchPct blocks on ubuntu-latest; Windows and macOS report it
 * without blocking. Editing this file requires "Acceptance-test change rationale:" in the PR body.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareWireframeLandmarks } from '../../src/visual-diff.mjs';

const aligned = { selector: 'main', index: 0, x: 10, y: 20, width: 30, height: 40 };

test('M1-AC-01 break-it: NaN or null landmark coordinate fails closed', () => {
  for (const axis of ['x', 'y', 'width', 'height']) {
    for (const bad of [Number.NaN, null, undefined, Number.POSITIVE_INFINITY]) {
      const box = { ...aligned, [axis]: bad };
      const result = compareWireframeLandmarks([aligned], [box], 4, true);
      assert.equal(result.passed, false, `${axis}=${String(bad)} must fail closed`);
      assert.ok(result.findings.some((finding) => finding.id === 'gate2.landmark.main'));
    }
  }

  const finite = compareWireframeLandmarks([aligned], [aligned], 4, true);
  assert.equal(finite.passed, true);
  assert.equal(finite.findings.length, 0);
});

test('M1-AC-01 break-it: width or height of 5 CSS px fails and 4 CSS px stays within tolerance', () => {
  for (const axis of ['width', 'height']) {
    const over = { ...aligned, [axis]: aligned[axis] + 5 };
    const overResult = compareWireframeLandmarks([aligned], [over], 4, true);
    assert.equal(overResult.passed, false, `${axis}+5`);
    assert.ok(overResult.findings.some((finding) => finding.id === 'gate2.landmark.main'));

    const edge = { ...aligned, [axis]: aligned[axis] + 4 };
    const edgeResult = compareWireframeLandmarks([aligned], [edge], 4, true);
    assert.equal(edgeResult.passed, true, `${axis}+4`);
    assert.equal(edgeResult.findings.length, 0);
  }
});
