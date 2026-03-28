---
title: Skills-only Architecture
date: 2026-03-28
status: in-progress
tags: [cli, distribution, portability, tooling]
---

# Skills-only Architecture

## Problem

Delivering Praxis across different coding agents is painful because each tool has different conventions for subagents — different directory names (`.agents/`, `.claude/`, `.cursor/`), different levels of subagent support, and no standard discovery mechanism. The current CLI is ~2,350 lines with ~5,300 lines of tests, mostly dealing with per-tool adapter logic, MCP config generation, and the tool-destination vs. direct-file branching. Maintaining it is disproportionate to the value it provides.

## Core Idea

Eliminate subagents entirely. Convert everything to skills (the one mechanism every coding agent supports uniformly) and reduce the CLI to the thinnest possible bootstrap script that just copies files and creates symlinks.

## Key Insights

- **Skills are the universal interface.** The Agent Skills specification (agentskills.io) is supported by 40+ tools. `npx skills add` from vercel-labs/skills handles installation into each tool's expected directory.
- **Subagent instructions can be inlined or referenced as skills.** Parent skills read child skill files and pass their content as Task prompts. On tools without Task support, the agent follows instructions in-thread.
- **Reviewers don't need to be subagents.** They can live at `.praxis/reviewers/` in the project root, discovered by convention at runtime by px-review.
- **The CLI only needs to scaffold.** Copy skills, create symlinks, copy shared files and reviewers. No adapters, no MCP config generation, no component system, no manifest hash tracking.
- **Updates are idempotent re-runs.** No dedicated update command. Running init again overwrites everything. If users customized files, they manage that themselves (or use git).

## Open Questions

- Should `knowledge-reviewer` (shared by px-brainstorm and px-plan) be a standalone skill or inlined into both parents?
- Should reviewers ship inside px-review and self-install to `.praxis/reviewers/` on first run, or should the CLI always copy them?
- How does the CLI find source files? GitHub tarball for remote, local directory for development.

## Possible Directions

- **Thin CLI**: Single ~150-200 line script that copies files + creates symlinks. No dependencies beyond Node.js built-ins. Fetches from GitHub or reads local files.
- **npx skills + CLI split**: Use `npx skills add` for skill installation, CLI only for `.praxis/` setup. More steps but reuses existing infrastructure.

## Related Documents

- .ai-workflow/ideas/20260223-npm-cli-distribution.md
- .ai-workflow/ideas/20260304-reorganize-multi-tool-copy-strategy.md
- .ai-workflow/ideas/20260303-px-prefix-for-core-skills.md
- .ai-workflow/plans/20260328-skills-only-architecture.md
