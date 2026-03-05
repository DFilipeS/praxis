# Praxis — Agent Guidelines

This repository contains a portable AI-assisted development workflow. It is a collection of skills, sub-agents, and conventions — not application code.

## What this project is

Praxis defines a full development cycle: px-brainstorm → px-plan → px-implement → px-review → px-retrospect. Each phase is implemented as a skill (`praxis/skills/`) with supporting sub-agents (`praxis/agents/`).

The output of this workflow lives in `.ai-workflow/` (ideas, plans, learnings) in whatever project adopts Praxis. This repository itself is the tooling, not the project being built.

## Critical: context window efficiency

Every design decision in this project must respect the limited context window of AI agents. Tokens spent on infrastructure are tokens not spent on real work. When modifying or adding to this project:

- **Load on demand.** Templates, conventions, and reference files should only enter the context when actually needed. Use progressive disclosure (`reference/template.md`) and `@` mentions.
- **Delegate to sub-agents.** Research and review work runs in parallel sub-agents that return summaries. Never do exploratory work in the main thread.
- **Don't duplicate.** Shared conventions, output formats, and status definitions live in one place, referenced by many. If you find yourself repeating content across files, extract it.
- **Keep files lean.** Skill files should contain instructions, not data. Move templates, examples, and reference material to separate files.

## Architecture decisions

### Portability over features
Every file uses standard markdown with YAML frontmatter. No tool-specific features (like Amp's `.agents/checks/` or Claude Code's hooks) are used in the core workflow. This ensures compatibility across AI coding tools.

### Progressive disclosure for context efficiency
File templates live in `reference/template.md` under each skill, loaded only when needed. Shared conventions live in `praxis/conventions.md` and are `@` mentioned by skills. This keeps the initial skill load small.

### Discovery-based reviewers
The px-review skill scans `praxis/agents/reviewers/` and runs whatever it finds. No config file lists reviewers. Adding a reviewer = adding a file. Removing one = deleting a file.

### Shared tag registry
All document types (ideas, plans, learnings) share `.ai-workflow/tags`. Skills read existing tags before creating new ones to prevent vocabulary sprawl.

### Sub-agents for research
Planning uses three parallel sub-agents (`codebase-explorer`, `knowledge-reviewer`, `external-researcher`) to gather context without bloating the main thread. Results come back as summaries.

### Status lifecycle
Ideas: `raw` → `planning` → `in-progress` → `done` / `abandoned`
Plans: `draft` → `ready` → `in-progress` → `done` / `abandoned`

Status transitions are owned by specific skills:
- px-brainstorm creates ideas as `raw`
- px-plan sets ideas to `planning`, creates plans as `draft`, sets to `ready` after approval
- px-implement sets plans to `in-progress`
- px-retrospect sets plans and ideas to `done`

## Key conventions

- **File naming**: `YYYYMMDD-slug.md` for all documents
- **Multi-phase plans**: append `-phase-N` to the slug
- **Branch naming**: `implement/plan-slug` for implementation branches
- **Commit messages**: single summary sentence + blank line + detailed description
- **Cross-linking**: plans reference ideas in frontmatter, Related Documents sections link bidirectionally

## When modifying this project

### Adding a new skill
1. Create `praxis/skills/skill-name/SKILL.md` with frontmatter (`name`, `description`)
2. If it produces files, add a `reference/template.md` for progressive disclosure
3. Reference `@../../conventions.md` for shared conventions (relative from `skills/<name>/SKILL.md`)
4. Update the README with the new skill

### Adding a new sub-agent
1. Create `praxis/agents/agent-name.md` with frontmatter (`name`, `description`)
2. Do not specify `tools` — let each AI tool determine available tools
3. Define a clear output format so the calling skill can synthesize results

### Adding a new reviewer
1. Create `praxis/agents/reviewers/reviewer-name.md` with frontmatter (`name`, `description`)
2. Reference `../../reviewer-output-format.md` for the output format
3. No other changes needed — the px-review skill discovers it automatically

### Modifying shared conventions
Edit `praxis/conventions.md`. All skills that `@` mention it will pick up changes automatically. Be careful with status values — multiple skills depend on the lifecycle.

### Modifying file templates
Edit the relevant `reference/template.md`. Changes affect all future documents created by that skill. Existing documents are not affected.

## Things to watch out for

- **Don't add tool-specific features** to core skills/agents. Keep everything in standard markdown for portability.
- **Don't put non-agent files in `praxis/agents/`** — some tools load every file in that directory as an agent definition.
- **The reviewer output format is centralized** in `praxis/reviewer-output-format.md`. If you change it, all reviewers pick up the change. Test with at least one reviewer after modifying.
- **Tags are append-only in practice.** Skills add new tags but never remove or rename existing ones. If you need to clean up tags, do it manually in `.ai-workflow/tags` and update any documents that use the old tags.
- **The `@` mention syntax** (e.g., `@../../conventions.md`) triggers automatic context loading. Use paths relative to the skill file's location since skills are installed into tool-specific directories, not `praxis/`. Plain file paths without `@` are just text — the agent would have to manually read them.
