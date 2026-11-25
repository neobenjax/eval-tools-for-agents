# Milestone 2 acceptance tests

The M2 suite is written as a gap suite: `M2-AC-01` to `M2-AC-37` (and their break-it tests) live in `../pending/m2-*.pending.mjs`. They fail with `ERR_ASSERTION` until the product meets them. `node scripts/acceptance-status.mjs` runs them and exits 0 only while every one fails that way.

Interfaces the tests pin are listed in `SPEC.md` section 7 ("Interfaces pinned by the M2 acceptance tests"). Shared helpers: `../m2-helpers.mjs` (servers, temp repos, CLI runners) and `../m2-skill-checks.mjs` (SKILL.md text checks). Fixtures: `tests/fixtures/m2/`.

When you implement an M2 issue:

- Make its gap tests pass. Do not edit the assertions; change the product (`SPEC.md` section 13).
- Move each passing test from `../pending/*.pending.mjs` into this directory as a `*.test.mjs` file, keeping the title `<id>: <criterion text verbatim>`. Break-it tests move with their criterion.
- Check the matching section 8 boxes (`- [x]`) and flip `suite` to `'pass'` in `../manifest.mjs` in the same change.
- List each new green file in `tools/pixel-perfect-gate/package.json` `scripts.test`.
- A milestone is done only when every test passes on both `windows-latest` and `ubuntu-latest`.
- Changing an existing acceptance test or the acceptance gate requires a PR-body line `Acceptance-test change rationale:` followed by why. The blank template line, the template hint, and `n/a` do not count (`SPEC.md` section 13).
