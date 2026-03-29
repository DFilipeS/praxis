# Praxis — Agent Guidelines

This repository contains a portable AI-assisted development workflow. It is a collection of skills and conventions — not application code.

## What this project is

Praxis defines a full development cycle: px-brainstorm → px-plan → px-implement → px-review → px-retrospect. Each phase is implemented as a skill in `skills/`. Reviewers live in `reviewers/`. Shared conventions and formats live at the repo root.

The output of this workflow lives in `.ai-workflow/` (ideas, plans, learnings) in whatever project adopts Praxis. This repository itself is the tooling, not the project being built.

## Critical: context window efficiency

Every design decision in this project must respect the limited context window of AI agents. Tokens spent on infrastructure are tokens not spent on real work. When modifying or adding to this project:

- **Load on demand.** Templates, conventions, and reference files should only enter the context when actually needed. Use progressive disclosure (`reference/template.md`) and file read instructions.
- **Delegate to sub-agents.** Research and review work runs in parallel sub-agents that return summaries. Never do exploratory work in the main thread.
- **Don't duplicate.** Shared conventions, output formats, and status definitions live in one place, referenced by many. If you find yourself repeating content across files, extract it.
- **Keep files lean.** Skill files should contain instructions, not data. Move templates, examples, and reference material to separate files.

## Architecture

### Skills-only design
Everything is a skill. There are no sub-agents — research and review prompts are embedded directly in the parent skill's SKILL.md. Each skill is self-contained and can be installed via `npx skills add`.

### Installed project structure
When `praxis init` runs in a target project:
- Skills are copied to `.agents/skills/`
- Symlinks are created for other agents (`.claude/skills/`, `.cursor/skills/`, etc.)
- Shared files are copied to `.praxis/` (conventions.md, reviewer-output-format.md)
- Reviewers are copied to `.praxis/reviewers/`
- Workflow directories are created at `.ai-workflow/`

### Discovery-based reviewers
The px-review skill scans `.praxis/reviewers/` at runtime and runs whatever it finds. Adding a reviewer = adding a file. Removing one = deleting a file. No config needed.

### Self-contained research prompts
px-plan and px-brainstorm include inline research prompts that are passed to the Task tool as sub-agent instructions. No separate agent files needed.

### Shared tag registry
All document types (ideas, plans, learnings) share `.ai-workflow/tags`. Skills read existing tags before creating new ones to prevent vocabulary sprawl.

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
- **Shared files**: Skills reference `.praxis/conventions.md` and `.praxis/reviewer-output-format.md` (plain file paths, not tool-specific `@` mentions)

## When modifying this project

### Adding a new skill
1. Create `skills/skill-name/SKILL.md` with frontmatter (`name`, `description`)
2. If it produces files, add a `reference/template.md` for progressive disclosure
3. Reference `.praxis/conventions.md` for shared conventions (as a file read instruction)
4. Update the README with the new skill

### Adding a new reviewer
1. Create `reviewers/reviewer-name.md` with frontmatter (`name`, `description`)
2. Reference `.praxis/reviewer-output-format.md` for the output format
3. No other changes needed — the px-review skill discovers it automatically

### Modifying shared conventions
Edit `conventions.md`. The CLI copies it to `.praxis/conventions.md` during installation. Be careful with status values — multiple skills depend on the lifecycle.

### Modifying file templates
Edit the relevant `reference/template.md`. Changes affect all future documents created by that skill. Existing documents are not affected.

## Things to watch out for

- **Don't add tool-specific features** to core skills. Keep everything in standard markdown for portability.
- **The reviewer output format is centralized** in `reviewer-output-format.md`. If you change it, all reviewers pick up the change. Test with at least one reviewer after modifying.
- **Tags are append-only in practice.** Skills add new tags but never remove or rename existing ones. If you need to clean up tags, do it manually in `.ai-workflow/tags` and update any documents that use the old tags.
- **Skills reference `.praxis/` paths** — these are files the CLI installs in the target project, not paths in this repo. In this repo, the source files are `conventions.md` and `reviewer-output-format.md` at the root.
