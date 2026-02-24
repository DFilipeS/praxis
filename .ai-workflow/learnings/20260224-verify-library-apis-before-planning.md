---
title: Verify library APIs before committing to them in plans
date: 2026-02-24
category: anti-pattern
plans:
  - .ai-workflow/plans/20260223-npm-cli-distribution.md
tags: [cli, npm, planning]
---

# Verify library APIs before committing to them in plans

## Context

The NPM CLI plan specified using `node:https` and `node:zlib` for downloading the GitHub tarball, and the `tar` package with a `buffer` option for extraction. During implementation, the `tar` package's `extract()` does not accept a `buffer` option — it requires streaming input via `pipe()`. The tar filter also needed to allow directory entries, not just files.

## Insight

Planning-phase research should verify that assumed library APIs actually exist with the expected signatures. Reading documentation or checking types during planning prevents implementation-time debugging loops.

## Evidence

The tarball extraction took two debugging iterations: first fixing the `buffer` option (switching to `Readable.from(buffer).pipe(extract(...))`), then fixing the filter that blocked directory entries. Later, the entire `node:https` approach was replaced with the global `fetch` API during review, which was simpler and already available in the minimum Node version (18+).

## Recommendation

During the planning research phase, write a small proof-of-concept snippet for any non-trivial library API. If the plan specifies `tar.extract({ buffer })`, verify that signature exists before finalizing the plan. Also consider whether a simpler built-in alternative exists (e.g., `fetch` vs manual `node:https` + redirect handling).
