# Milestone 2b acceptance tests

M2b-AC-01 through M2b-AC-59 are the gap suite for section 8 criteria under the M2b.1 through M2b.9 rows. Their own tests, and the break-its that still fail, live in `../pending/m2b-*.pending.mjs` and fail with `ERR_ASSERTION` until the product meets them. `node scripts/acceptance-status.mjs` runs those files and exits 0 only while every remaining gap test fails that way.

Five break-its already pass and are registered `{ title, suite: "pass" }` in `m2b-shipped-break-its.test.mjs` under still-unchecked criteria: a Gate 1 finding does not grow `refBox`, `expected`, or `actual` (M2b-AC-19); omitting `pwa` does not fail installability (M2b-AC-23); and the three M2b-AC-59 skill-checker directions (a deleted playbook heading fails, a complete skill passes, an extra heading does not fail). The section 8 boxes stay unchecked until each criterion's own test passes.

`ENFORCED_MILESTONES` is `M1`, `M2`, `M2b`, and `M3`. M2b is its own suite. `npm test` runs this green file and must not invoke a pending file directly. Helpers live in `../m2b-helpers.mjs`. Skill text checks live in `../m2b-skill-checks.mjs`. Fixtures live in `../../fixtures/m2b/`. Figma, WordPress, and the dev server are local stubs. Pixel `mismatchPct` blocks on `ubuntu-latest` only (`process.platform !== 'win32'`).
