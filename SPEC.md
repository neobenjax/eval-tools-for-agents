# `SPEC.md` — Project Scope & Linear-Synced Task Matrix

**Project:** `eval-tools-for-agents` (`P-SIDE-6`)  
**Repository:** `git@github.com:neobenjax/eval-tools-for-agents.git`  
**Linear Team:** `Side Projects` (`SIDE`)  
**Leader & Assignee:** Benjamin Sanchez (`neobenjax`)

---

## 1. Objective & Grounding Premise
Build a reusable, cross-harness monorepo of deterministic evaluation tools for AI agents, harnesses (Antigravity Desktop, Antigravity CLI, Cursor), and AI models—starting with **Pixel-Perfect Visual Gate** (`tools/pixel-perfect-gate`):
- **Hybrid Architecture:** Single-browser Playwright CLI for Gate 1 (DOM geometry, overflow, clipping, overlaps, console/network) + Gate 2 (`pixelmatch`, `@2x` DPR, `--full-page`, `--mask`, 3-panel composite diff, `--mode wireframe`), paired with a cross-harness `SKILL.md` for **Agent Looping** (5-iteration cap) and Gate 3 interactive flows.
- **Windows-First Cross-Platform:** Pure Node.js ESM + directory junctions on Windows / symlinks on Unix.

## 2. Out of Scope (Current Phase)
- Cloud SaaS visual hosting (Percy/Chromatic/S3 sync).
- Claude Code-specific installation testing (not installed on target workstation; symlink support remains compatible).
- Multi-reviewer GitHub PR triage bots or minimum-approval branch blockers.

## 3. Standard DoR & DoD (All Issues)
- **DoR:** Upstream dependency `Approved`, scope defined in `SPEC.md`, feature branch cut from `main`.
- **DoD:** `node scripts/verify.mjs` passes, PR (`Closes SIDE-XX`) squash-merged to `main`, feature branch purged, `SPEC.md` & Linear stage set to `Approved`.

---

## 4. Linear-Synced Milestone & Task Matrix (1:1 `SIDE-XX` Parity)

### Milestone 0: Repo Bootstrap & Linear Sync
- [x] **SIDE-10** `[M0.1]` Initialize `main` branch & GitHub remote *(Spine · Approved)*
- [ ] **SIDE-11** `[M0.2]` Create `CONTEXT.md`, `AGENTS.md`, `SPEC.md` & npm workspaces *(Track A · Depends on: SIDE-10 · In Progress)*
- [ ] **SIDE-12** `[M0.3]` Create PR template & GitHub Actions CI workflow *(Track A · Depends on: SIDE-10 · In Progress)*
- [ ] **SIDE-13** `[M0.4]` Implement verification & 1:1 Linear sync CLI scripts *(Track B · Depends on: SIDE-11, SIDE-12 · Todo)*

### Milestone 1: Core Deterministic Engine (`pixel-gate`)
- [ ] **SIDE-14** `[M1.1]` Scaffold `tools/pixel-perfect-gate` workspace package *(Spine · Depends on: SIDE-13 · Todo)*
- [ ] **SIDE-15** `[M1.2]` Implement Gate 1 `layout-audit.mjs` (DOM, console, network) *(Track A · Depends on: SIDE-14 · Todo)*
- [ ] **SIDE-16** `[M1.3]` Implement Gate 2 `visual-diff.mjs` (`pixelmatch`, `@2x` DPR, composite, wireframe) *(Track A · Depends on: SIDE-14 · Todo)*
- [ ] **SIDE-17** `[M1.4]` Implement Eval Telemetry logger (`telemetry.mjs`) *(Track A · Depends on: SIDE-14 · Todo)*
- [ ] **SIDE-18** `[M1.5]` Wire unified `pixel-gate` CLI & controlled fixture test suite *(Integration · Depends on: SIDE-15, SIDE-16, SIDE-17 · Todo)*

### Milestone 2: Cross-Harness Skill & Gate 3
- [ ] **SIDE-19** `[M2.1]` Implement Gate 3 `interaction-audit.js` scanner *(Track A · Depends on: SIDE-18 · Todo)*
- [ ] **SIDE-20** `[M2.2]` Author cross-harness `SKILL.md` with Agent Looping protocol *(Track A · Depends on: SIDE-18 · Todo)*
- [ ] **SIDE-21** `[M2.3]` Implement cross-platform multi-harness installer (`install.mjs`) *(Track B · Depends on: SIDE-18 · Todo)*
- [ ] **SIDE-22** `[M2.4]` E2E Agent Loop verification in Antigravity Desktop, CLI & Cursor *(Verification · Depends on: SIDE-19, SIDE-20, SIDE-21 · Todo)*

### Milestone 3: Progression Dashboard & Telemetry
- [ ] **SIDE-23** `[M3.1]` Build Progression Dashboard & Eval Telemetry viewer *(Integration · Depends on: SIDE-13, SIDE-17 · Todo)*
