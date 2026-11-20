# Milestone 2 acceptance tests

No milestone 2 tests are written yet.

When milestone 2 starts:

- Add one test per section 8 criterion whose section 4 tag family is `M2` (`[M2.…]`). Milestone 2b (`[M2b.…]`) stays out of that set until `M2b` is enforced on its own.
- Green tests go in this directory as `*.test.mjs`. Gap tests go in `pending/` as `*.pending.mjs`.
- Test names are `<id>: <criterion text verbatim>`. Ids stay stable (`M2-AC-01`, …). Do not renumber them.
- Register each criterion in `../manifest.mjs` and add the milestone id to `ENFORCED_MILESTONES` in the same change as the tests. The acceptance gate fails if a milestone is enforced and any of its criteria lacks a test.
- List every new green file in `tools/pixel-perfect-gate/package.json` `scripts.test`.
- A milestone is done only when every test in its suite passes on both `windows-latest` and `ubuntu-latest`.
