---
title: V8 coverage counts anonymous arrow functions as distinct functions
date: 2026-02-28
category: surprise
plans:
  - .ai-workflow/plans/20260227-selective-component-installation.md
tags: [testing, coverage, nodejs]
---

# V8 coverage counts anonymous arrow functions as distinct functions

## Context

During the selective component installation implementation, a 100% function coverage target was maintained throughout. After adding `.catch(() => {})` inline callbacks in cancel paths, function coverage dropped from 100% to 91.66%.

## Insight

V8's function coverage treats every function expression as a distinct entry — including trivial inline callbacks like `.catch(() => {})` and `.sort((a, b) => b.length - a.length)`. Each one must be called at least once to register as covered. This is non-obvious because these callbacks look like part of the surrounding statement, not independent functions.

## Evidence

Three anonymous functions were uncovered after round-2 refactoring:
- The sort comparator in `removedDirs.sort((a, b) => b.length - a.length)`
- `.catch(() => {})` in the additions cancel path
- `.catch(() => {})` in the removals cancel path

Fixing required three dedicated tests: one that exercises the sort comparator with two directories at different depths, and two that make the async `writeManifest` call reject specifically in each cancel path.

## Recommendation

When targeting 100% function coverage in Node.js, treat every inline arrow function as a testable unit. For `.catch(() => {})` callbacks on async calls, write a test that makes the promise reject. For sort comparators, ensure the test provides at least two elements that aren't already in the target order.
