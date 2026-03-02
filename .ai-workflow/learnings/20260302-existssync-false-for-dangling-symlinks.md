---
title: existsSync returns false for dangling symlinks
date: 2026-03-02
category: surprise
plans:
  - .ai-workflow/plans/20260302-tool-adapter-system.md
tags: [cli, testing]
---

# existsSync returns false for dangling symlinks

## Context
While implementing the Tool Adapter System, the `tool add` command needed to detect whether a symlink already existed before creating a new one (e.g., `CLAUDE.md → AGENTS.md`).

## Insight
Node.js `fs.existsSync()` follows symlinks. If the symlink target doesn't exist (a "dangling" symlink), `existsSync` returns `false` — even though the symlink entry itself is present on disk. This means code that uses `existsSync` to guard a `symlink()` call will crash with `EEXIST` when the dangling symlink is already there.

## Evidence
The `tool add claude-code` command used `existsSync('CLAUDE.md')` to decide whether to create the symlink. When `AGENTS.md` was temporarily missing (or the symlink was left over from a previous run against a different directory), `existsSync` returned `false`, the code attempted to create the symlink, and Node threw `EEXIST`.

## Recommendation
Use `fs.lstatSync()` (or `fs.lstat()`) instead of `existsSync()` when you need to detect the presence of a filesystem entry regardless of whether it's a valid symlink. `lstat` inspects the entry itself without following the link. Wrap it in a try/catch for the `ENOENT` case.
