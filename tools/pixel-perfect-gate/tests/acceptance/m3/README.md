# M3 acceptance

M1-AC-01 through M1-AC-15, M2-AC-01 through M2-AC-37 (`../m2/README.md`), M2b-AC-01 through M2b-AC-59 (`../m2b/*.test.mjs`), and M3-AC-01 through M3-AC-04 (`./m3-*.test.mjs`) are all green. No M3 criteria remain in `pending/`. `M3-AC-04` parses the section 4 `Depends on:` list for the viewer row (`m3-depends.test.mjs`). `ENFORCED_MILESTONES` is `M1`, `M2`, `M2b`, and `M3`.

The viewer command, JSON shapes, and board routes for M3-AC-01 through M3-AC-03 are pinned in `SPEC.md` section 7 ("Interfaces pinned by the M3 acceptance tests"). Helpers: `../m3-helpers.mjs`. Fixture: `tests/fixtures/m3/telemetry.jsonl`. The tests do not call Linear or any other network host. A local Node stub stands in for the Linear CLI. `LINEAR_API_KEY` in these tests is the fixture value `m3-sentinel-key` or unset. Path equality is case-insensitive on Windows and exact on other systems (`samePath`). There is no pixel `mismatchPct` assert in this suite. No M3 assert is OS-specific.
