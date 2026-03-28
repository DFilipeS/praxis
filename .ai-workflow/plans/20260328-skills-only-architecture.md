---
title: Skills-only Architecture with Thin CLI
date: 2026-03-28
status: in-progress
ideas:
  - .ai-workflow/ideas/20260328-skills-only-architecture.md
tags: [cli, distribution, portability, tooling]
---

# Skills-only Architecture with Thin CLI

## Goal

Restructure Praxis so that skills are the only delivery mechanism for agent instructions. Eliminate the subagent directory and reduce the CLI from ~2,350 lines to ~100-200 lines — a thin bootstrap that handles only what `npx skills` cannot: copying shared files and reviewers to `.praxis/`.

## Background

See `.ai-workflow/ideas/20260328-skills-only-architecture.md` for the full brainstorm.

The key insight is that `npx skills add` (from vercel-labs/skills) already handles:
- Copying skill directories (including `reference/` subdirs) to `.agents/skills/`
- Creating symlinks from other agent directories (`.claude/skills/`, `.cursor/skills/`) to `.agents/skills/`
- Tracking installed skills in `skills-lock.json`
- Updates via `npx skills update`

This means the Praxis CLI only needs to handle what `npx skills` can't: scaffolding `.praxis/` with shared conventions, reviewer output format, and default reviewers.

## Research Summary

### Current structure (what gets installed)
- `praxis/skills/px-*/SKILL.md` → agent skills directory (5 core + 3 optional)
- `praxis/agents/*.md` → agent agents directory (3 subagents: codebase-explorer, knowledge-reviewer, external-researcher)
- `praxis/agents/reviewers/*.md` → agent agents/reviewers/ directory (8 reviewers)
- `praxis/conventions.md` → agent root directory
- `praxis/reviewer-output-format.md` → agent root directory

### Subagent usage
- `knowledge-reviewer` — used by px-brainstorm AND px-plan (shared)
- `codebase-explorer` — used by px-plan only
- `external-researcher` — used by px-plan only

### npx skills capabilities
- Copies entire skill directories verbatim
- Creates symlinks across agent tool directories
- No post-install hooks — can't run setup code
- Local lock file (`skills-lock.json`) for version tracking

### Decision: inline vs. separate skills for subagents
Since `codebase-explorer` and `external-researcher` are only used by px-plan, they'll be inlined into px-plan's SKILL.md as sections the agent follows when launching Task prompts.

`knowledge-reviewer` is shared by px-brainstorm and px-plan. It will also be inlined — duplicated into both skills. The content is ~40 lines, and duplication avoids needing a shared file that `npx skills` wouldn't know about.

### Decision: reviewers
Reviewers move to `.praxis/reviewers/` at the project root. The CLI copies default reviewers there. px-review scans that directory at runtime. Users customize by adding/removing files.

## Steps

### Phase 1: Restructure skill files

**Step 1.1 — Move skills to repo root `skills/` directory**

Move `praxis/skills/px-*` to `skills/px-*` at the repo root. This is where `npx skills add` expects to find them. The current `praxis/skills/` directory also contains optional skills (`agent-browser`, `figma-to-code`, `mobile-mcp`) — move those too.

Files to move:
- `praxis/skills/px-brainstorm/` → `skills/px-brainstorm/`
- `praxis/skills/px-plan/` → `skills/px-plan/`
- `praxis/skills/px-implement/` → `skills/px-implement/`
- `praxis/skills/px-review/` → `skills/px-review/`
- `praxis/skills/px-retrospect/` → `skills/px-retrospect/`
- `praxis/skills/agent-browser/` → `skills/agent-browser/`
- `praxis/skills/figma-to-code/` → `skills/figma-to-code/`
- `praxis/skills/mobile-mcp/` → `skills/mobile-mcp/`

**Step 1.2 — Inline codebase-explorer and external-researcher into px-plan**

Add the content from `praxis/agents/codebase-explorer.md` and `praxis/agents/external-researcher.md` into `skills/px-plan/SKILL.md`. In the research section (currently lines 24-33), replace the instruction to "launch sub-agent by name" with the actual instructions to pass as Task prompts. The agent reads the instructions from the skill file and passes them directly.

Update the "Research" section in px-plan to include inline prompts for each sub-agent:
- A `### codebase-explorer prompt` section with the current agent's instructions
- A `### external-researcher prompt` section with the current agent's instructions
- Instructions telling the agent to pass these sections as Task prompts

**Step 1.3 — Inline knowledge-reviewer into px-brainstorm and px-plan**

Add the content from `praxis/agents/knowledge-reviewer.md` into both `skills/px-brainstorm/SKILL.md` and `skills/px-plan/SKILL.md`.

In px-brainstorm: Update the "Incorporating past learnings" section (currently line 68) to include the full knowledge-reviewer instructions inline rather than referencing a sub-agent name.

In px-plan: Add a `### knowledge-reviewer prompt` section alongside the other two research prompts.

**Step 1.4 — Update px-review to scan `.praxis/reviewers/`**

Update `skills/px-review/SKILL.md`:
- Change the scan path from `../agents/reviewers/` to `.praxis/reviewers/` (absolute from project root)
- Change the reviewer output format reference from `../reviewer-output-format.md` to `.praxis/reviewer-output-format.md`
- Keep the convention-based discovery (any `.md` file in that directory)
- Keep the core reviewer default (security, code-quality, simplicity)

**Step 1.5 — Update `@` mention paths in all skills**

After moving skills to `skills/`, the relative path from a skill to `conventions.md` changes. Currently skills reference `@../../conventions.md` (from `praxis/skills/px-*/SKILL.md` up to `praxis/conventions.md`).

New structure: skills are at `skills/px-*/SKILL.md`, conventions is at `.praxis/conventions.md` (after CLI copies it).

Options:
- **A) Keep conventions.md in `praxis/` and reference from skills**: Skills use `@../../praxis/conventions.md`. But this means the conventions file needs to be in the repo at a known path that won't move.
- **B) Move conventions.md to `skills/` root**: Put it at `skills/conventions.md`. Skills reference `@../conventions.md`. The CLI also copies it to `.praxis/conventions.md` for other uses. But then there are two copies.
- **C) Put conventions.md inside each skill's references/ directory**: Too much duplication.
- **D) Have skills reference `.praxis/conventions.md` directly**: Skills say "Read `.praxis/conventions.md` for conventions." No `@` mention — just a file read instruction. This means the agent reads the file at runtime, not at skill load time.

**Recommendation: Option D.** Use a plain file path reference (not `@` mention) to `.praxis/conventions.md`. The `@` mention syntax is tool-specific and may not work consistently across all agents. A plain instruction like "Follow the conventions in `.praxis/conventions.md`" is universal — the agent reads the file when needed. Same for reviewer output format.

Update these files:
- `skills/px-brainstorm/SKILL.md` — change `@../../conventions.md` to `.praxis/conventions.md`
- `skills/px-plan/SKILL.md` — same
- `skills/px-implement/SKILL.md` — same
- `skills/px-retrospect/SKILL.md` — same
- `skills/px-review/SKILL.md` — change `../reviewer-output-format.md` to `.praxis/reviewer-output-format.md`

**Step 1.6 — Delete `praxis/agents/` directory**

Remove the entire `praxis/agents/` directory including all subagents and reviewers. The reviewer definitions will ship as part of the CLI's bootstrap (see Phase 2).

**Step 1.7 — Clean up root-level empty directories**

Remove `agents/` (root-level, empty) and any other leftover directories.

### Phase 2: Rebuild the CLI

**Step 2.1 — Delete all current CLI source and tests**

Remove:
- `src/` (entire directory)
- `bin/` (entire directory)
- `test/` (entire directory)
- `vitest.config.js`
- Current npm dependencies from `package.json`

**Step 2.2 — Create thin CLI script**

Create a single `bin/praxis.js` file (~100-150 lines) with one command: `init`.

The CLI:
1. **Determines source files**: Accepts `--source` flag (local path or GitHub owner/repo). Default: `DFilipeS/praxis` (fetches from GitHub). If `--source` is a local path, reads from disk.
2. **Copies skills to `.agents/skills/`**: Reads `skills/` from source, copies each `px-*` skill directory to `.agents/skills/` in the target project. Overwrites existing files.
3. **Asks about other agent support**: Uses `@clack/prompts` multiselect. Options: Claude Code (`.claude/skills/`), Cursor (`.cursor/skills/`), OpenCode (`.opencode/skills/`), etc. For each selected, creates symlinks pointing to `.agents/skills/<skill-name>/`.
4. **Creates `.praxis/`**: Copies `conventions.md` and `reviewer-output-format.md` from source.
5. **Copies reviewers**: Copies all `.md` files from source `reviewers/` directory to `.praxis/reviewers/`.
6. **Creates `.ai-workflow/`**: Creates empty `ideas/`, `plans/`, `learnings/` directories if they don't exist.
7. **Saves configuration**: Writes `.praxis/config.json` tracking which tools were selected (for future re-runs to remember the choice).

The script:
- Uses only Node.js built-ins + `@clack/prompts` for interactive UI
- For GitHub source: downloads tarball, extracts `skills/`, `praxis/`, and `reviewers/` directories
- For local source: copies from the specified directory
- Idempotent: re-running overwrites everything except `.praxis/reviewers/` (only adds missing reviewers, doesn't overwrite customizations)

**Step 2.3 — Create reviewers source directory**

Create a `reviewers/` directory at the repo root containing the 8 default reviewer definitions:
- `reviewers/security.md`
- `reviewers/code-quality.md`
- `reviewers/simplicity.md`
- `reviewers/performance.md`
- `reviewers/architecture.md`
- `reviewers/data-integrity.md`
- `reviewers/pattern-recognition.md`
- `reviewers/agent-accessibility.md`

These are moved from `praxis/agents/reviewers/`. Update the reviewer output format reference in each from `../../reviewer-output-format.md` to `.praxis/reviewer-output-format.md`.

**Step 2.4 — Update package.json**

Strip down to minimal dependencies:
- Keep `@clack/prompts` for interactive prompts
- Remove `commander`, `diff`, `tar` (use built-in `node:zlib` + `node:stream` for tarball, or keep `tar` if simpler)
- Remove vitest devDependencies (no tests for the thin CLI, or add minimal tests if desired)

### Phase 3: Update documentation and configuration

**Step 3.1 — Update AGENTS.md**

Reflect the new architecture:
- Remove references to `agents/` directory
- Remove subagent sections
- Update skill file locations from `praxis/skills/` to `skills/`
- Document the new reviewer location (`.praxis/reviewers/`)
- Document how skills reference conventions (`.praxis/conventions.md`)
- Remove adapter/tool sections
- Update the reviewer output format location

**Step 3.2 — Update README.md**

- Update installation instructions: two-step flow (`npx skills add` for skills + `npx praxis init` for scaffolding) OR single-step (`npx praxis init` which does everything)
- Update project structure diagram
- Remove references to subagents
- Update reviewer customization instructions to point to `.praxis/reviewers/`
- Remove adapter/tool adapter sections
- Simplify the component selection section (no more optional skills concept via CLI)

**Step 3.3 — Update .gitignore**

Add `.praxis/config.json` if desired (or commit it for team sharing). Consider adding `.agents/skills/` patterns if the team uses `npx skills add`.

**Step 3.4 — Delete obsolete files and directories**

- Delete `praxis/` directory entirely (its contents have been moved to `skills/`, `reviewers/`, and the root)
- Delete `agents/` at root level (empty)
- Delete `skills-lock.json` at root (obsolete if we're not using `npx skills` as primary installer — OR keep it if we want to support both flows)
- Delete `.praxis-manifest.json` references from docs

### Phase 4: Optional — Support `npx skills add` as alternative installation

**Step 4.1 — Ensure `skills/` directory structure is compatible**

Verify that `npx skills add DFilipeS/praxis` works out of the box:
- Each `skills/px-*/SKILL.md` has valid `name` and `description` frontmatter
- The `name` field matches the directory name
- Optional skills (`agent-browser`, `figma-to-code`, `mobile-mcp`) are also valid

**Step 4.2 — Document the two installation flows**

Flow A (full Praxis):
```bash
npx github:DFilipeS/praxis init
```

Flow B (skills only, no reviewers):
```bash
npx skills add DFilipeS/praxis
npx github:DFilipeS/praxis init  # still needed for .praxis/ setup
```

Or just document Flow A as the recommended approach, noting that `npx skills add` can be used instead for tools that support it.

## Acceptance Criteria

- [ ] No `agents/` directory exists anywhere in the repo
- [ ] No `praxis/` directory exists — skills are at `skills/`, reviewers at `reviewers/`, shared files at `praxis/` root or moved
- [ ] All 5 core skills work without subagents — instructions are self-contained
- [ ] `px-review` discovers reviewers at `.praxis/reviewers/`
- [ ] All skills reference conventions via `.praxis/conventions.md` (not `@` mentions)
- [ ] The CLI is a single file under 200 lines
- [ ] Running `npx praxis init` in a fresh project sets up everything correctly
- [ ] Re-running `npx praxis init` is idempotent (overwrites skill files, preserves custom reviewers)
- [ ] README and AGENTS.md reflect the new structure

## Dependencies

- Phase 2 depends on Phase 1 (new file locations must exist before CLI can reference them)
- Phase 3 depends on Phase 1 and 2 (docs must reflect final structure)
- Phase 4 is optional and can be done after everything else

## Related Documents

- .ai-workflow/ideas/20260328-skills-only-architecture.md
- .ai-workflow/ideas/20260223-npm-cli-distribution.md
- .ai-workflow/ideas/20260304-reorganize-multi-tool-copy-strategy.md
