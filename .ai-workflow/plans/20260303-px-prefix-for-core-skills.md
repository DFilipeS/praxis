---
title: px- Prefix for Core Skills
date: 2026-03-03
status: ready
ideas:
  - .ai-workflow/ideas/20260303-px-prefix-for-core-skills.md
group: px-prefix-for-core-skills
phase: 1
tags: [developer-experience, naming]
---

# px- Prefix for Core Skills

## Goal

Rename the 5 core workflow skills with a `px-` prefix to namespace them and prevent command conflicts with user-defined commands.

## Background

See [.ai-workflow/ideas/20260303-px-prefix-for-core-skills.md](.ai-workflow/ideas/20260303-px-prefix-for-core-skills.md) for the full problem statement. Users of Praxis may have their own commands that conflict with core skill names (e.g., Claude Code's `/review` vs Praxis's `reviewing`). The `px-` prefix provides namespacing while staying short and distinctive.

## Research Summary

**Codebase analysis** found ~60+ references across:
- 5 skill directories (`.agents/skills/{name}/`)
- 5 SKILL.md frontmatter `name` fields
- 1 hardcoded `CORE_SKILLS` set in `src/components.js` (lines 2-8)
- Cross-skill text references in SKILL.md files
- README.md, AGENTS.md, and conventions.md documentation
- Test files (`test/components.test.js`, `test/commands/*.test.js`)
- Workflow documents and tags

**External research** confirms 2-character prefixes are ideal for minimal typing while being distinctive. The `px-` prefix is well-suited: short, unique, pronounceable, and extensible.

## Steps

1. **Rename skill directories** — Rename each core skill directory:
   - `.agents/skills/brainstorming/` → `.agents/skills/px-brainstorm/`
   - `.agents/skills/planning/` → `.agents/skills/px-plan/`
   - `.agents/skills/implementing/` → `.agents/skills/px-implement/`
   - `.agents/skills/reviewing/` → `.agents/skills/px-review/`
   - `.agents/skills/retrospective/` → `.agents/skills/px-retrospective/`

2. **Update SKILL.md frontmatter** — In each renamed directory's `SKILL.md`, update the `name` field:
   - `brainstorming` → `px-brainstorm`
   - `planning` → `px-plan`
   - `implementing` → `px-implement`
   - `reviewing` → `px-review`
   - `retrospective` → `px-retrospective`

3. **Update CORE_SKILLS in src/components.js** — Update the hardcoded set (lines 2-8):
   ```javascript
   const CORE_SKILLS = new Set([
     "px-brainstorm",
     "px-plan",
     "px-implement",
     "px-review",
     "px-retrospective",
   ]);
   ```

4. **Update cross-skill text references** — In each SKILL.md file, update text references to other core skills:
   - `px-plan/SKILL.md`: Change "brainstorming" → "px-brainstorm" (lines 3, 13, 21)
   - `px-brainstorm/SKILL.md`: Change "planning" → "px-plan" (line 3)
   - `px-implement/SKILL.md`: Change "reviewing" → "px-review" (lines 57, 80), "retrospective" → "px-retrospective" (line 65)
   - `px-retrospective/SKILL.md`: Change "planning" → "px-plan" (line 69)

5. **Update sub-agent references** — Update text references in:
   - `.agents/agents/knowledge-reviewer.md` (line 3): "planning" → "px-plan"
   - `.agents/agents/external-researcher.md` (line 3): "planning" → "px-plan"
   - `.agents/agents/codebase-explorer.md` (line 3): "planning" → "px-plan"

6. **Update AGENTS.md** — Update all core skill name references:
   - Line 7: workflow list
   - Line 29: "reviewing" reference
   - Lines 42-45: status transitions
   - Line 71: "reviewing" reference

7. **Update README.md** — Update all core skill name references:
   - Line 24: workflow list
   - Lines 33, 245: text references
   - Lines 43-47: skill table
   - Lines 130-134: `/skill` command examples
   - Lines 157-163: directory tree

8. **Update conventions.md** — Update skill name references in text (lines 7, 45, 46).

9. **Update test files** — Update all core skill name references in:
   - `test/components.test.js`: CORE_SKILLS set tests, skill paths in test data
   - `test/commands/components.test.js`: mock file paths
   - `test/commands/init.test.js`: mock file paths and assertions

10. **Update workflow documents** — Update references in:
    - `.ai-workflow/ideas/20260227-selective-component-installation.md` (line 20)
    - `.ai-workflow/plans/20260227-selective-component-installation.md` (line 35)
    - `.ai-workflow/tags`: Change "planning" → "px-plan", "reviewing" → "px-review"

11. **Update learnings files** — Update tag references where applicable:
    - `.ai-workflow/learnings/20260224-verify-library-apis-before-planning.md`
    - `.ai-workflow/learnings/20260224-include-tests-in-implementation-plans.md`
    - `.ai-workflow/learnings/20260228-multi-round-reviews-can-contradict-prior-decisions.md`
    - `.ai-workflow/learnings/20260224-parallel-reviewers-catch-cross-cutting-issues.md`

## Acceptance Criteria

- [ ] All 5 skill directories renamed with `px-` prefix
- [ ] All SKILL.md frontmatter `name` fields updated
- [ ] `src/components.js` CORE_SKILLS set updated
- [ ] All cross-skill text references updated
- [ ] All sub-agent text references updated
- [ ] AGENTS.md updated
- [ ] README.md updated
- [ ] conventions.md updated
- [ ] All test files pass with updated names
- [ ] `.ai-workflow/tags` updated (planning → px-plan, reviewing → px-review)
- [ ] Workflow documents and learnings updated with new skill names

## Dependencies

None — this is a self-contained renaming effort.

## Related Documents

- .ai-workflow/ideas/20260303-px-prefix-for-core-skills.md
