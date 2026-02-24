---
title: Parallel reviewers catch cross-cutting issues that manual testing misses
date: 2026-02-24
category: pattern
plans:
  - .ai-workflow/plans/20260223-npm-cli-distribution.md
tags: [cli, reviewing, tooling]
---

# Parallel reviewers catch cross-cutting issues that manual testing misses

## Context

After implementing the NPM CLI, three parallel reviewer agents (security, code quality, architecture/simplicity) reviewed the code. They found 5 actionable warnings and 6 suggestions.

## Insight

Running multiple focused reviewers in parallel is highly effective for CLI tools that handle untrusted input (network data, user files). Security, code quality, and architecture reviewers each found issues the others didn't — path traversal (security), socket leaks (code quality), and dead code (architecture). The combined findings led to a single focused commit that addressed all warnings.

## Evidence

The security reviewer found path traversal via tarball paths and manifest keys — template file paths were used directly in `writeFile`/`rm` without validating they stay within the project root. The code quality reviewer found HTTP socket leaks and incomplete stream error handling. The architecture reviewer found `isLocallyModified` was exported but never used while its logic was duplicated inline. None of these were caught during manual testing.

## Recommendation

Always run the reviewing skill after implementation, especially for code that processes external input (network responses, user-supplied files, config files). The review step is most valuable when it runs multiple specialized reviewers in parallel rather than a single general review.
