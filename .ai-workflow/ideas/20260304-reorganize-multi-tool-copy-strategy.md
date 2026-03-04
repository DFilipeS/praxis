---
title: Reorganize for Multi-Tool Compatibility via Copy Strategy
date: 2026-03-04
status: raw
tags: [developer-experience, portability, tooling]
---

# Reorganize for Multi-Tool Compatibility via Copy Strategy

## Problem

Praxis copies its skills, agents, and configurations from the repository into the `.agents/` directory of a project. However, tools like Cursor and Claude Code ignore `.agents/` when a tool-specific directory already exists (`.cursor/`, `.claude/`). This means users with existing tool configurations never see Praxis skills and agents, even though they're correctly installed in `.agents/`.

We need a strategy that delivers Praxis configurations directly to each tool's expected location while maintaining the ability to track, update, and manage those configurations over time.

## Core Idea

Instead of copying Praxis skills, agents, and MCP configs to `.agents/` (which gets ignored when tool-specific directories exist), we should copy them directly to each tool's expected location: `.cursor/` for Cursor, `.claude/` for Claude Code, etc. Track all Praxis-managed files in `.praxis-manifest.json` at the project root. This enables conflict detection and selective updates while ensuring Praxis configurations are always available regardless of what other configurations the user has.

## Key Insights

- **`.agents/` is not a tool directory:** Tools like Cursor and Claude Code only look in their own directories (`.cursor/`, `.claude/`), not in `.agents/`. Praxis was installing there, but the tools never saw it when user configs existed.
- **Copy directly to tool locations:** We need to deliver files where tools expect them — `.cursor/`, `.claude/`, etc. — not to a custom directory.
- **Centralized tracking:** `.praxis-manifest.json` at root records all Praxis-managed files per tool, enabling updates, conflict detection, and cleanup
- **Overwrite by default:** If there are no conflicts, Praxis content overwrites existing content (Praxis is the authority for its own files)

## Open Questions

- `src/` is already used for CLI code. Should we use `praxis/` for the source of truth directory structure? (e.g., `praxis/skills/`, `praxis/agents/`, `praxis/reviewers/`)
- Should we maintain backward compatibility with the old `.agents/` approach during transition?
- How do we handle partial failures during the copy process?

## Possible Directions

1. **Pure copy strategy:** Copy everything from source structure to tool directories, track in manifest
2. **Hybrid approach:** Keep `.agents/` as source, but copy individual items instead of symlinking directories
3. **Namespace approach:** Praxis files get `.praxis` suffix or subdirectory to avoid collisions

## Related Documents

- Past learnings on Tool Adapter System: `20260302-*` files in `.ai-workflow/learnings/`
