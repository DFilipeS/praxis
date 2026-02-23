# Shared Conventions

## Directory structure

- `.ai-workflow/ideas/` — brainstormed ideas
- `.ai-workflow/plans/` — implementation plans
- `.ai-workflow/learnings/` — documented insights from retrospectives

## File naming

All document files use: `YYYYMMDD-slug.md` (e.g., `20260222-offline-first-sync.md`).

For multi-phase plans, append the phase: `20260222-offline-first-sync-phase-1.md`.

## Tags

All documents share a single tag registry at `.ai-workflow/tags` (one tag per line, lowercase, alphabetically sorted).

Before assigning tags, read `.ai-workflow/tags` and reuse existing tags whenever they fit. Only create a new tag when nothing existing covers the concept — if you do, append it to `.ai-workflow/tags` maintaining alphabetical order.

## Git conventions

### Commits

Commit message format:

```
Single sentence summarizing what the commit does, ending with a full stop.

Longer description with more details about the change. Explain the why,
not just the what. Reference the plan step if helpful for context.
```

The first line must be a complete, well-formed sentence with a final full stop.

Only stage files directly related to the current change — never use `git add -A` or `git add .`.

### Branches

Use the `implement/` prefix for implementation branch names: `implement/plan-slug` (e.g., `implement/offline-first-sync-phase-1`).

## Status values

### Ideas
- `raw` — just captured from brainstorming
- `planning` — picked up by the planning skill
- `in-progress` — currently being implemented
- `done` — implemented
- `abandoned` — discarded

### Plans
- `draft` — plan is being written
- `ready` — finalized, ready for implementation
- `in-progress` — currently being implemented
- `done` — implemented
- `abandoned` — discarded
