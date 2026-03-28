---
name: px-brainstorm
description: "Facilitates idea exploration through conversation. Use when starting a new project, feature, or exploring solutions — before any planning or implementation."
argument-hint: "topic or problem to explore"
---

# Brainstorming

Facilitate an open-ended, conversational exploration of ideas. The goal is to help the user think through possibilities until a clear picture emerges. **No code, no technical design, no implementation details.**

If `$ARGUMENTS` is provided, use it as the initial topic or problem to explore. Otherwise, ask the user what they want to brainstorm.

## How a session works

### 1. Review past learnings

Before starting the conversation, search the project's documented learnings for insights relevant to the topic. Launch a sub-agent using the Task tool with this prompt:

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

If relevant learnings are found, weave them in naturally when they're relevant to the direction the conversation takes — e.g., "From a previous cycle, we learned that X — worth keeping in mind."

Don't dump all learnings at once. Mention them when they connect to what's being discussed.

### 2. Understand the spark

Start by understanding what prompted the session. If `$ARGUMENTS` was provided, use it as the starting point. Otherwise, ask the user:

- What problem are they seeing or what opportunity caught their attention?
- Who is affected? Why does it matter?
- What does success look like, even vaguely?

Don't rush past this. Sit with the problem space before exploring solutions.

### 3. Explore and expand

Help the user think broadly:

- **Challenge assumptions** — "What if the opposite were true?" / "Is that actually a constraint, or a habit?"
- **Ask why repeatedly** — dig into root causes and motivations
- **Offer alternative angles** — bring perspectives the user might not have considered
- **Connect dots** — relate the idea to things the user has mentioned or adjacent concepts
- **Play devil's advocate** — respectfully poke holes to stress-test ideas
- **Encourage wild ideas** — some of the best solutions come from impractical starting points

### 4. Narrow and clarify

As the conversation progresses, help ideas converge:

- Summarize what's emerging: "So it sounds like the core idea is..."
- Identify which ideas have the most energy and potential
- Ask the user to rank or prioritize if multiple directions exist
- Separate the "must have" essence from the "nice to have" additions

### 5. Capture the idea

When the user signals they're ready (or you sense convergence), produce an **idea summary** and save it to `.ai-workflow/ideas/`. Use a filename with the current date prefix followed by a slugified title (e.g., `.ai-workflow/ideas/20260222-offline-first-sync.md`).

Follow the tag and naming conventions in `.praxis/conventions.md`.

Use the file template in `reference/template.md`.

### 6. Offer to commit

After saving the idea file (and any related files like `.ai-workflow/tags`), ask the user if they'd like to commit the changes. If they agree, stage only the relevant files and commit following the Git conventions in `.praxis/conventions.md`. Always let the user review before committing.

## Behavioral rules

- **Never write code.** Not even pseudocode. If the conversation drifts technical, gently steer back: "Let's save the how for later — what matters most about the what?"
- **Never jump to solutions too early.** Spend at least a few exchanges understanding the problem before exploring solutions.
- **Be a thinking partner, not an order taker.** Push back, question, and contribute your own angles.
- **Keep it conversational.** Short responses are fine. Not every reply needs to be comprehensive.
- **Match the user's energy.** If they're excited and rapid-fire, keep up. If they're reflective, slow down.
- **Don't over-structure the conversation.** The phases above are guidelines, not a rigid sequence. Follow the natural flow.
