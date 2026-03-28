---
name: px-plan
description: "Creates concrete implementation plans from brainstormed ideas. Use when ready to turn an idea into actionable steps — after px-brainstorm, before px-implement."
argument-hint: "path to idea file(s), e.g. .ai-workflow/ideas/20260222-offline-first-sync.md"
---

# Planning

Turn a brainstormed idea into one or more concrete, actionable implementation plans. Each plan file represents a single deliverable phase. **No code — only precise descriptions of what to build and how.**

## Prerequisites

Every plan **must** be linked to one or more idea files from `.ai-workflow/ideas/`. If the user hasn't brainstormed yet, direct them to use the px-brainstorm skill first.

## How a session works

### 1. Load the idea

If `$ARGUMENTS` is provided, treat it as the path(s) to idea file(s) and read them. Otherwise, ask the user which idea(s) they want to plan. Read the referenced idea files from `.ai-workflow/ideas/` to understand the problem, core idea, insights, and open questions.

Review the idea thoroughly before proceeding. If open questions from the px-brainstorm phase are blockers, resolve them with the user now.

### 2. Research

Before writing the plan, gather context by launching **three parallel sub-agents** using the Task tool. Do not do this research in the main thread — delegate to sub-agents so results come back summarized without polluting the main context.

Each sub-agent should receive the idea summary (problem, core idea, key insights) as context.

Launch these three in parallel using `Task`, passing the corresponding prompt below as the task description:

#### Codebase explorer prompt

Pass this as the prompt for the first sub-agent:

> You are a codebase research agent. Your job is to explore the repository and find code relevant to the topic provided.
>
> ## What to look for
>
> - Existing modules, components, or patterns that relate to the topic
> - Code conventions, frameworks, and libraries already in use
> - Potential integration points or conflicts
> - Test patterns and coverage relevant to the area
>
> ## How to work
>
> 1. Use whatever tools are available to search the codebase
> 2. For text searches, consider `grep`, `ripgrep`, or `ast-grep` (https://github.com/ast-grep/ast-grep) for structural/AST-aware searches when you need more precision
> 3. Focus on understanding what already exists — do not suggest changes
> 4. Be thorough but concise — explore broadly, report only what's relevant
>
> ## Output format
>
> Return a structured summary:
>
> ### Relevant Code
>
> For each relevant area found:
>
> - **Path**: file path
> - **What it does**: brief description
> - **Relevance**: why this matters for the topic
>
> ### Conventions Observed
>
> - Framework, patterns, and libraries in use
>
> ### Potential Integration Points
>
> - Where new work would connect to existing code
>
> ### Potential Conflicts or Risks
>
> - Anything that could cause problems
>
> Keep the summary focused. Do not include code snippets unless essential for understanding. File paths and brief descriptions are preferred.

#### Knowledge reviewer prompt

Pass this as the prompt for the second sub-agent:

> You are a knowledge research agent. Your job is to search the project's documented learnings for insights relevant to the topic provided.
>
> ## Where to look
>
> Search the `.ai-workflow/learnings/` directory at the workspace root. This directory contains documented insights from previous development cycles.
>
> If `.ai-workflow/learnings/` does not exist or is empty, report "No prior learnings found." and stop.
>
> ## How to work
>
> 1. List files in `.ai-workflow/learnings/`
> 2. Scan frontmatter and headings to identify relevant documents
> 3. Read only the relevant files in full
> 4. Extract and summarize applicable insights
>
> ## Output format
>
> Return a structured summary:
>
> ### Relevant Learnings
>
> For each relevant learning found:
>
> - **Source**: file path
> - **Key insight**: what was learned
> - **Applies because**: why this is relevant to the current topic
>
> ### Warnings
>
> - Any documented pitfalls or "never do this" items that apply
>
> ### Recommended Patterns
>
> - Any documented "do this instead" patterns that apply
>
> If nothing relevant is found, say so clearly rather than stretching for connections.

#### External researcher prompt

Pass this as the prompt for the third sub-agent:

> You are a web research agent. Your job is to search the web for best practices, documentation, and expert guidance relevant to the topic provided.
>
> ## What to look for
>
> - Official documentation for technologies involved
> - Established patterns and best practices
> - Common pitfalls others have encountered
> - Recent developments or changes that might affect the approach
>
> ## How to work
>
> 1. Use whatever tools are available to search the web and read pages
> 2. Prioritize official documentation and well-known sources over blog posts
> 3. Verify information across multiple sources when possible
>
> ## Output format
>
> Return a structured summary:
>
> ### Key Findings
>
> For each relevant finding:
>
> - **Summary**: what was found
> - **Source**: URL
> - **Relevance**: how this applies to our topic
>
> ### Best Practices
>
> - Practice and source URL
>
> ### Common Pitfalls
>
> - Pitfall and source URL
>
> ### Recommended Reading
>
> - Links worth reading with brief descriptions
>
> Be selective. Only include findings directly relevant to the topic. Do not pad with tangentially related information.

#### After research completes

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

When referencing files to modify, **include line ranges** so the implementing agent can do targeted reads instead of loading entire files. For example:

- **Bad**: "Update `src/commands/update.js` to add the new handler"
- **Good**: "Update `src/commands/update.js` lines 45-80 (the `runUpdate` function) to add the new handler after the existing validation block"

Push for specificity. Ask the user clarifying questions rather than leaving things vague. A good plan should leave minimal ambiguity for the implementation phase.

### 5. Review with the user

Present the plan(s) to the user for review before finalizing. Walk through the steps and acceptance criteria. Adjust based on feedback. Only proceed to the next step once the user explicitly approves the plan.

### 6. Update related documents

After the user approves the plan:

- Set the plan's `status` to `ready`
- Update the idea file's `status` to `planning`
- Add the plan file path(s) to the idea's "Related Documents" section
- If multiple plans were created, they reference each other via `group` and `phase` in frontmatter

### 7. Offer to commit

After saving the plan and updating related documents, ask the user if they'd like to commit the changes. If they agree, stage only the relevant files and commit following the Git conventions in `.praxis/conventions.md`. Always let the user review before committing.

## File conventions

Follow the tag, naming, and status conventions in `.praxis/conventions.md`.

Use the file template in `reference/template.md`.

## Behavioral rules

- **Never write code.** Describe what to build, not how to code it. If the conversation drifts into writing code, steer back: "Let's capture that as a step in the plan — we'll implement it later."
- **Require idea files.** No exceptions. Every plan traces back to a brainstormed idea.
- **Be ruthlessly concrete.** Vague plans create vague implementations. Push for specificity in every step.
- **One deliverable per file.** If a plan has natural phase breaks, split into separate files. Each file should be implementable on its own.
- **Keep phases independently valuable.** No phase should leave the system in a broken or half-done state.
- **Challenge scope.** If a plan is growing too large, suggest splitting. If steps are too vague, ask clarifying questions.
