---
title: Validate resolved paths to prevent traversal via dynamic path.join
date: 2026-03-02
category: anti-pattern
plans:
  - .ai-workflow/plans/20260302-tool-adapter-system.md
tags: [cli, tooling]
---

# Validate resolved paths to prevent traversal via dynamic path.join

## Context
The Tool Adapter System reads skill names from the manifest and uses them in `path.join(projectRoot, '.agents/skills', skillName, 'mcp.json')` to locate per-skill MCP configuration files.

## Insight
Any time a user-controlled or file-sourced string is interpolated into a filesystem path via `path.join` or `path.resolve`, an attacker can use `../` segments to escape the intended directory. Even if the data source seems trusted (like a project manifest), it may have been tampered with or corrupted.

## Evidence
A security reviewer flagged that skill names read from the manifest were passed directly to `path.join` without validation. A malicious manifest entry like `../../etc` would cause the code to read files outside the project directory. The fix was to resolve the full path and verify it starts with the expected prefix (e.g., `resolvedPath.startsWith(expectedRoot)`).

## Recommendation
Create an `isSafePath(resolvedPath, allowedRoot)` helper and call it before every filesystem operation that uses a dynamically constructed path. Reject any path that resolves outside the allowed root. Apply this consistently — not just at the command layer, but also in utility functions that accept path components as arguments.
