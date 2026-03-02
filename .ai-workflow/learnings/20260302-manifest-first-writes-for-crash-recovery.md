---
title: Write the manifest first to declare intent before file I/O
date: 2026-03-02
category: pattern
plans:
  - .ai-workflow/plans/20260302-tool-adapter-system.md
tags: [cli, tooling]
---

# Write the manifest first to declare intent before file I/O

## Context
The `praxis tool add` command needs to both update the manifest (`enabledTools` array) and write multiple config files to disk. If the process crashes between these operations, the system is left in an inconsistent state.

## Insight
Writing the manifest first — before performing the actual file I/O — acts as a declaration of intent. On the next run, the system can detect the mismatch (tool is listed in manifest but files are missing) and reconcile by regenerating the missing files. The reverse order (files first, manifest second) is harder to recover from because there's no record of what was intended.

## Evidence
During the Tool Adapter System implementation, the `tool add` command was structured to update the manifest's `enabledTools` array before writing config files. This meant that even if the process died mid-write, re-running `tool add` or any command that triggers config regeneration would produce the correct files.

## Recommendation
When a CLI command needs to update both a state file (manifest, lockfile, etc.) and produce side-effect files, write the state file first. Design reconciliation logic that can detect and fix mismatches between declared state and actual files on disk.
