## Linear Issue Reference (1:1 Key Parity)
<!-- Use the exact Linear native key from SPEC.md (e.g. SIDE-11). Docs/chore PRs may reference a GitHub issue instead (Closes #N). -->
Closes SIDE-

---

## Summary of Changes
- **Issue Key:** `SIDE-`
- **Milestone:** [ ] M0 | [ ] M1 | [ ] M2 | [ ] M2b | [ ] M3
- **Description:**
- **Out of scope / left for later (be explicit):**

---

## Acceptance Criteria Evidence
<!-- Copy EVERY acceptance criterion from the Linear issue / SPEC.md section 8. One row each.
     Evidence = exact command + key output, a test name that asserts it, or a CI job link.
     "Looks right" or "should work" is not evidence. If a criterion is not met, say so. -->

| Criterion (verbatim) | Evidence (command / output / test / CI link) | Status |
|---|---|---|
|  |  | met / not met |

---

## Acceptance tests
<!-- Section 13. List M*-AC-* ids this PR moves from gap to pass. Write "none" when it does not promote any.
     Paste the gap summary from `node scripts/acceptance-status.mjs`.
     If an existing test, the acceptance gate, package test script, verify.mjs, or ci.yml changes,
     write why on the rationale line. Leave that line blank when nothing changed.
     The blank line, this comment, and "n/a" do not satisfy the check. -->
- Turned green:
- Still gap:
- Acceptance-test change rationale:

---

## Before you open a PR
- [ ] After each fix, `git grep` updated every other statement of that rule in the same commit (`SPEC.md`, docs, test headers, and this PR body)
- [ ] Each fix was undone once on a scratch copy and a test failed. If none failed, the assert now checks finding ids and required keys, not only a message string or a value
- [ ] Every OS-specific assert, including break-its, has a platform guard (pixel `mismatchPct` blocks on `ubuntu-latest` only; Windows and macOS report it; existing guard is `process.platform !== 'win32'`)
- [ ] Break-It Checks and Consistency Sweep below contain the command and the output
- [ ] `node scripts/verify.mjs` passed, and CI stays green on `windows-latest` and `ubuntu-latest`
- [ ] Rebased on (or merged) the latest `main`, then `node scripts/verify.mjs` was run again before requesting review (PR CI checks the merge commit only as of when it ran)

---

## Break-It Checks (must-fail cases)
<!-- For every new check, gate, test, or validation: show at least one input that MUST fail, and that it does.
     A check you could not make fail is not tested. Cover both directions (extra AND missing). -->
- [ ] Failure case: `<command>` → exit `1`, output: `<message>`
- [ ] Both directions covered (extra items rejected **and** missing/deleted items rejected)
- [ ] Error paths still emit the documented JSON contract on stdout

---

## Consistency Sweep
- [ ] Every changed fact (status, decision, key, flag, behavior) was grepped repo-wide and updated everywhere (`git grep -n "<old wording>"` returns nothing stale)
- [ ] `SPEC.md` sections agree with each other (matrix §4, acceptance §8, dependencies §9, decisions §11) and with `README.md` / `CONTEXT.md`
- [ ] Saved artifacts (PNGs, JSON, logs) were opened and agree with the reported result, not just the exit code

---

## Pre-Flight Verification Checklist
- [ ] `node scripts/verify.mjs` passes cleanly
- [ ] `node scripts/verify-pr-ready.mjs` confirms `SPEC.md` & `SIDE-XX` key parity
- [ ] `npm test` passes from the repo root
- [ ] Acceptance-test ids turned green are listed above, and the gap summary is pasted (`node scripts/acceptance-status.mjs`)
- [ ] Any new script/check is wired into `.github/workflows/ci.yml` and works on a detached HEAD
- [ ] Verified on **Windows** (primary platform) and green on the CI matrix (`windows-latest` + `ubuntu-latest`)
- [ ] No `.env`, API keys, or `.visual-eval/` artifacts committed
- [ ] Self-review done as a strict reviewer (see `AGENTS.md` §7); every "verified/passes" claim above is backed by evidence
- [ ] Acceptance Criteria & DoD verified in Linear (`In Review` -> `Approved`)
