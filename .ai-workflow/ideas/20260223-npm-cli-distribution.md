---
title: NPM CLI for Praxis Distribution
date: 2026-02-23
status: raw
tags: [cli, distribution, npm, developer-experience, tooling]
---

# NPM CLI for Praxis Distribution

## Problem

Praxis needs to be installed into other projects' `.agents/` directories, but current methods (copy or git submodule + symlink) don't support easy updates or merging with existing project-specific files. Copying loses the ability to pull updates. Submodule + symlink takes over the entire `.agents/` directory, preventing project-specific files from coexisting. Committing symlinks is fragile across platforms (especially Windows) and feels wrong.

## Core Idea

Publish Praxis as a scoped npm package (`@DFilipeS/praxis`) with a CLI that manages installation, updates, and status of Praxis files in any project. Uses `npx` for zero-install execution. A manifest file tracks which files Praxis owns and their version, enabling intelligent updates that show diffs, detect local modifications, and handle adds/edits/removes cleanly.

## Key Insights

- **`npx` solves the distribution problem.** No one needs to clone the Praxis repo or install anything globally. `npx @DFilipeS/praxis init` just works. The npm package bundles the `.agents/` template files directly.
- **The manifest is the key differentiator over a simple copy.** It tracks owned files and their version, enabling smart updates: detect new files, changed files, removed files, and locally modified files.
- **Conflict handling via interactive diffs.** When a Praxis-managed file has been locally modified, `update` shows the diff and asks permission before overwriting. This respects project-specific tweaks while keeping updates possible.
- **All-or-nothing keeps v1 simple.** No selective installation (e.g., "only reviewers"). Install everything. This avoids complex dependency tracking between skills/agents.
- **`AGENTS.md` is not managed.** It's too project-specific. Praxis only manages files inside `.agents/`.
- **The CLI lives in the Praxis repo.** One repo, one release process. Publishing a new Praxis version = `npm publish`.

## Open Questions

- Where should the manifest file live? Root of the project or inside `.agents/`?
- What format for the manifest? JSON is natural for a Node.js tool. Should it track file hashes for modification detection, or just version numbers?
- Should `update` check npm for newer versions automatically, or only compare against locally bundled files?
- How should the CLI bundle the `.agents/` template files? Inline in the package, or fetched from GitHub at runtime?
- Should `init` be idempotent (safe to run multiple times) or error if already initialized?

## Possible Directions

The implementation is fairly clear — a Node.js CLI published to npm. The main decisions are around manifest format, conflict resolution UX, and whether template files are bundled or fetched.

## Related Documents

- (none yet)
