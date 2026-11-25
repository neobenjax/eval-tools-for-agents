# Milestone 2 acceptance tests

M1-AC-01 through M1-AC-15 (`../`) and M2-AC-01 through M2-AC-37 (this directory) are green. There is no M1 or M2 gap file left. M2b-AC-01 through M2b-AC-59 are a separate gap suite in `../pending/m2b-*.pending.mjs` (`../m2b/README.md`). M3-AC-01 through M3-AC-03 are a separate gap suite in `../pending/m3-*.pending.mjs`, and M3-AC-04 is green in `../m3/m3-depends.test.mjs` (`../m3/README.md`). `node scripts/acceptance-status.mjs` runs the remaining gap files and exits 0 only while every remaining gap test fails with `ERR_ASSERTION`. A missing, skipped, crashing, or passing gap test makes that command exit 1. `ENFORCED_MILESTONES` is `M1`, `M2`, `M2b`, and `M3`. `npm test` must not invoke a pending file directly.

The five early break-its in `m2-shipped-break-its.test.mjs` (`M2-AC-02`, `M2-AC-04`, `M2-AC-05`, `M2-AC-18`, `M2-AC-21`) continue to run alongside `m2-*.test.mjs` now that all 37 M2 criteria are green (`SPEC.md` section 13).

Section 6 report, on every exit except `--help` and `--version`: `schemaVersion` `1`, `gates.gate1` / `gates.gate2` / `gates.gate3`, `findings[].id` as the stable branch key, `error` `null` or `{ "message" }`, and a skipped gate `{ "passed": true, "skipped": true, "reason" }`. Playwright is pinned to `1.65.1`. Pixel `mismatchPct` blocks on `ubuntu-latest`; Windows and macOS report it without blocking (`SPEC.md` section 5). M2-AC-09 guards the blocking assert with `process.platform !== 'win32'`.

Interfaces the tests pin are listed in `SPEC.md` section 7 ("Interfaces pinned by the M2 acceptance tests"). Shared helpers: `../m2-helpers.mjs` (servers, temp repos, CLI runners) and `../m2-skill-checks.mjs` (SKILL.md text checks). Fixtures: `tests/fixtures/m2/`.

When you implement an M2 issue:

- Make its gap tests pass. Do not edit the assertions; change the product (`SPEC.md` section 13).
- Move each passing criterion test from `../pending/*.pending.mjs` into this directory as a `*.test.mjs` file, keeping the title `<id>: <criterion text verbatim>`. A break-it that starts passing before its criterion moves unchanged on its own, registered `{ title, suite: "pass" }`, and the section 8 box stays unchecked. When the criterion itself passes, its remaining break-its move with it.
- Check the matching section 8 boxes (`- [x]`) and flip `suite` to `'pass'` in `../manifest.mjs` in the same change.
- List each new green file in `tools/pixel-perfect-gate/package.json` `scripts.test`.
- A milestone is done only when every test passes on both `windows-latest` and `ubuntu-latest`.
- Changing an existing acceptance test or the acceptance gate requires a PR-body line `Acceptance-test change rationale:` followed by why. The blank template line, the template hint, and `n/a` do not count (`SPEC.md` section 13).
