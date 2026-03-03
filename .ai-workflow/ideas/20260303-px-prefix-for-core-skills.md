---
title: px- Prefix for Core Skills
date: 2026-03-03
status: done
tags: [developer-experience, naming]
---

# px- Prefix for Core Skills

## Problem

Users of Praxis may have their own commands that conflict with the core skill names. For example, Claude Code already has a `/review` command, which collides with Praxis's `reviewing` skill. This creates friction and makes Praxis feel "in the way."

## Core Idea

Add a `px-` prefix to the 5 core workflow skills to namespace them and avoid command conflicts. The prefix is short, distinctive, and looks clean.

## Key Insights

- Prefix (`px-`) was chosen over suffix or compound names for brevity and aesthetics
- Only core workflow skills get the prefix — sub-agents and auxiliary skills (like `agent-browser`, `figma-to-code`) remain unchanged since users don't invoke them directly
- All internal references and `@` mentions between files will need updating

## Open Questions

- None — scope is clear and contained

## Possible Directions

Single approach identified:
- Rename: `brainstorming` → `px-brainstorm`, `planning` → `px-plan`, `implementing` → `px-implement`, `reviewing` → `px-review`, `retrospective` → `px-retrospective`
- Update all skill files and internal references accordingly

## Related Documents

- .ai-workflow/plans/20260303-px-prefix-for-core-skills.md
- .ai-workflow/learnings/20260303-verify-context-before-applying-pattern-based-changes.md
- .ai-workflow/learnings/20260303-parallel-reviewer-disagreement-reveals-nuance.md
