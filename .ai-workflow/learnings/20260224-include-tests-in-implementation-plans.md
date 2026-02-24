---
title: Include automated tests in implementation plans
date: 2026-02-24
category: anti-pattern
plans:
  - .ai-workflow/plans/20260223-npm-cli-distribution.md
tags: [cli, planning, testing]
---

# Include automated tests in implementation plans

## Context

During the NPM CLI implementation, all verification was done manually — running `node bin/cli.js init` in temp directories after each step. Automated tests were only added after the user explicitly requested them, as a separate effort producing 61 tests across 6 files.

## Insight

Implementation plans should include a testing step for each module, not defer testing to a separate request. Manual testing during implementation is valuable for fast feedback, but it doesn't persist — the next person (or AI session) has no way to verify the code still works.

## Evidence

The test suite was written after all implementation and review were complete. It uncovered no new bugs, but required substantial effort (61 tests, ~1100 lines of test code). Had tests been written alongside each step, the effort would have been spread across the implementation rather than concentrated at the end.

## Recommendation

Every implementation plan should include test creation as part of each step, or as a dedicated step immediately after the core module it validates. The plan's acceptance criteria should include a coverage target.
