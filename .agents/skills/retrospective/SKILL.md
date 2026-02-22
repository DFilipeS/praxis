---
name: retrospective
description: "Reviews completed work to document learnings, mistakes, and patterns for future cycles. Use after implementation is done or when reflecting on past work."
argument-hint: "path to plan file(s), e.g. .ai-workflow/plans/20260222-offline-first-sync-phase-1.md"
---

# Retrospective

Look back at completed work to extract learnings and document them for future AI sessions. The goal is to build institutional knowledge that prevents repeated mistakes and reinforces effective patterns. **Focus on actionable insights, not summaries of what was done.**

## How a session works

### 1. Load context

If `$ARGUMENTS` is provided, treat it as the path(s) to completed plan file(s) and read them. Otherwise, ask the user which completed work they want to reflect on.

From the plan, follow links to:
- The original idea file(s)
- Any related plans in the same group
- Git history for the implementation period (use `git log` with relevant date ranges or file paths from the plan's steps)

### 2. Analyze the work

Do your own analysis first before asking the user anything. Use the plan, idea, git history, and the current session context to identify:

- **Plan vs reality** — Were all steps completed as described? Did scope change? Were acceptance criteria met? Did assumptions hold?
- **Patterns worth repeating** — techniques, tools, decisions, or approaches that worked well
- **Mistakes or friction** — things that went wrong, took too long, or required rework
- **Surprises** — unexpected findings, edge cases, or assumptions that turned out to be wrong

### 3. Present findings and ask for more

Present your analysis to the user as a structured summary of what you observed. Then ask: **"Is there anything I missed, or anything else you noticed that isn't reflected here?"**

The user may add context you don't have visibility into (e.g., external factors, time pressure, things they tried but didn't commit). Incorporate their additions into the learnings.

### 4. Capture learnings

Distill the conversation into one or more learning files and save to `.ai-workflow/learnings/`. Each file should focus on a single, specific insight — not a broad summary of the retrospective.

Follow the tag and naming conventions in @.agents/conventions.md.

**Good learning**: "Phoenix LiveView form validation must use `phx-debounce` to avoid excessive server round-trips on every keystroke."

**Bad learning**: "We learned a lot about forms in this project."

Use the file template in `reference/template.md`.

#### Categories

- `anti-pattern` — something to avoid, whether learned from a mistake or identified proactively
- `pattern` — an approach that worked well and should be repeated
- `decision` — an architectural or design choice and its rationale
- `surprise` — an unexpected finding worth remembering

### 5. Update related documents

After capturing learnings:
- Update the plan's `status` to `done`
- Update the idea's `status` to `done` (if all plans in the group are done)
- Add learning file paths to the plan's "Related Documents" section
- Add learning file paths to the idea's "Related Documents" section

## Behavioral rules

- **Prioritize specificity over completeness.** Three sharp, actionable learnings are worth more than ten vague observations.
- **Optimize for future scanning.** The knowledge-reviewer agent will search these files. Clear titles, accurate tags, and concrete recommendations make that search effective.
- **Don't force learnings.** If the work went smoothly and there's nothing notable, a single "pattern" learning capturing what worked is fine. Not every retrospective needs to uncover problems.
- **Challenge vague reflections.** If the user says "the planning was bad," ask why specifically. Turn feelings into concrete, documented insights.
- **Keep learnings standalone.** Each file should make sense without reading the full plan or idea. Include enough context in the "Context" section.
