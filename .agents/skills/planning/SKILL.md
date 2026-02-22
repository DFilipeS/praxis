---
name: planning
description: "Creates concrete implementation plans from brainstormed ideas. Use when ready to turn an idea into actionable steps — after brainstorming, before implementation."
argument-hint: "path to idea file(s), e.g. .ai-workflow/ideas/20260222-offline-first-sync.md"
---

# Planning

Turn a brainstormed idea into one or more concrete, actionable implementation plans. Each plan file represents a single deliverable phase. **No code — only precise descriptions of what to build and how.**

## Prerequisites

Every plan **must** be linked to one or more idea files from `.ai-workflow/ideas/`. If the user hasn't brainstormed yet, direct them to use the brainstorming skill first.

## How a session works

### 1. Load the idea

If `$ARGUMENTS` is provided, treat it as the path(s) to idea file(s) and read them. Otherwise, ask the user which idea(s) they want to plan. Read the referenced idea files from `.ai-workflow/ideas/` to understand the problem, core idea, insights, and open questions.

Review the idea thoroughly before proceeding. If open questions from the brainstorming phase are blockers, resolve them with the user now.

### 2. Research

Before writing the plan, gather context by launching **three parallel sub-agents** using the Task tool. Do not do this research in the main thread — delegate to sub-agents so results come back summarized without polluting the main context.

Each sub-agent should receive the idea summary (problem, core idea, key insights) as context.

Launch these three in parallel using `Task`:
- **`codebase-explorer`** — searches the repository for relevant existing code
- **`knowledge-reviewer`** — searches `.ai-workflow/learnings/` for insights from previous cycles
- **`external-researcher`** — searches the web for best practices and documentation

Once all three sub-agents report back, synthesize their findings and share a brief summary with the user before proceeding. This research should inform the plan's steps, dependencies, and acceptance criteria.

### 3. Define scope and phases

Assess the size of the idea:

- **Can it be delivered in one focused effort?** → One plan file.
- **Is it too large for a single deliverable?** → Break it into phases. Each phase must be independently valuable — no phase should leave things in a broken state.

For multi-phase work, discuss the breakdown with the user:

- What is the minimal first phase that delivers value?
- What depends on what? Order phases by dependency.
- Are there phases that can run in parallel?

### 4. Write the plan

For each phase, create a plan file in `.ai-workflow/plans/` using the file format below. Be as concrete and specific as possible:

- **Bad**: "Add authentication"
- **Good**: "Add session-based authentication using Phoenix.Token. Create a login LiveView at /login that accepts email/password, validates against the users table, and sets a signed session cookie."

Push for specificity. Ask the user clarifying questions rather than leaving things vague. A good plan should leave minimal ambiguity for the implementation phase.

### 5. Review with the user

Present the plan(s) to the user for review before finalizing. Walk through the steps and acceptance criteria. Adjust based on feedback. Only proceed to the next step once the user explicitly approves the plan.

### 6. Update related documents

After the user approves the plan:

- Set the plan's `status` to `ready`
- Update the idea file's `status` to `planning`
- Add the plan file path(s) to the idea's "Related Documents" section
- If multiple plans were created, they reference each other via `group` and `phase` in frontmatter

## File conventions

Follow the tag, naming, and status conventions in @.agents/conventions.md.

Use the file template in `reference/template.md`.

## Behavioral rules

- **Never write code.** Describe what to build, not how to code it. If the conversation drifts into writing code, steer back: "Let's capture that as a step in the plan — we'll implement it later."
- **Require idea files.** No exceptions. Every plan traces back to a brainstormed idea.
- **Be ruthlessly concrete.** Vague plans create vague implementations. Push for specificity in every step.
- **One deliverable per file.** If a plan has natural phase breaks, split into separate files. Each file should be implementable on its own.
- **Keep phases independently valuable.** No phase should leave the system in a broken or half-done state.
- **Challenge scope.** If a plan is growing too large, suggest splitting. If steps are too vague, ask clarifying questions.
