---
title: Selective Component Installation
date: 2026-02-27
status: raw
tags: [cli, developer-experience, distribution, tooling]
---

# Selective Component Installation

## Problem

Praxis installs all components (skills, reviewers, sub-agents) into every project, but not all are relevant everywhere. Project-specific skills like `figma-to-code`, `agent-browser`, and `mobile-mcp` end up in projects where they don't make sense — a backend CLI project doesn't need Figma integration, a web app doesn't need mobile simulator automation. This clutters the `.agents/` directory and can mislead the AI agent into considering irrelevant tools.

## Core Idea

Split Praxis components into **core** (always installed, part of the workflow) and **optional** (project-specific). During `praxis init`, present an interactive multi-select of optional components grouped by type (skills, reviewers). Track the selection as an allowlist in the manifest. A new `praxis select` command lets users change their selection at any time. `update` respects the selection and nudges when new optional components are available upstream.

## Key Insights

- **Core vs optional is hardcoded for now.** The core workflow (brainstorming → planning → implementing → reviewing → retrospective) plus its supporting sub-agents and shared files are always required. Optional components are everything else. A future iteration could move to self-declaration via frontmatter.
- **Allowlist over blocklist.** Tracking what's included is more predictable than tracking what's excluded. New optional components added to Praxis don't appear uninvited — `update` nudges instead: "2 new optional components available. Run `praxis select` to review."
- **Component-level granularity, not file-level.** Users think in terms of "I want the Figma skill" not "I want these 3 files." The CLI maps component names to their constituent files.
- **Selection grouped by type.** The checklist during `init` and `select` groups optional components by type (skills, reviewers) for clarity.
- **Removing a component deletes its files.** Since Praxis owns these files, deselecting a component via `select` removes them from disk and the manifest.
- **`update` stays unchanged.** It already only operates on manifest-tracked files, so the selection is automatically respected. The only addition is detecting new optional components upstream and suggesting `praxis select`.
- **Builds on the existing v1 CLI.** The manifest already tracks files and hashes. The selection is an additional field (`selectedComponents` or similar) in the manifest that `init`, `update`, and the new `select` command all reference.

## Resolved Questions

- **Default selection during `init`**: everything pre-selected (opt-out within the checklist).
- **Core component definition**: hardcoded in the CLI for now. Future iteration could move to self-declaration via frontmatter.
- **Removing locally modified components**: warn and ask for confirmation before deleting.
- **Non-interactive mode**: not needed for now, keep it simple.
- **All reviewers are optional.** The reviewing skill is core (the workflow step), but the reviewer agents are a starting set people can swap entirely. Users who bring their own reviewers can toggle all built-in ones off.
- **Backward compatible.** Existing manifests without `selectedComponents` are treated as "everything selected." Existing projects keep working and gain the selection capability when they next run `select` or `update`.

## Open Questions

None — ready for planning.

## Related Documents

- .ai-workflow/ideas/20260223-npm-cli-distribution.md (predecessor — explicitly deferred selective installation as v2)
