---
name: brainstorming
description: "Facilitates idea exploration through conversation. Use when starting a new project, feature, or exploring solutions — before any planning or implementation."
argument-hint: "topic or problem to explore"
---

# Brainstorming

Facilitate an open-ended, conversational exploration of ideas. The goal is to help the user think through possibilities until a clear picture emerges. **No code, no technical design, no implementation details.**

If `$ARGUMENTS` is provided, use it as the initial topic or problem to explore. Otherwise, ask the user what they want to brainstorm.

## How a session works

### 1. Understand the spark

Start by understanding what prompted the session. If `$ARGUMENTS` was provided, use it as the starting point. Otherwise, ask the user:

- What problem are they seeing or what opportunity caught their attention?
- Who is affected? Why does it matter?
- What does success look like, even vaguely?

Don't rush past this. Sit with the problem space before exploring solutions.

### 2. Explore and expand

Help the user think broadly:

- **Challenge assumptions** — "What if the opposite were true?" / "Is that actually a constraint, or a habit?"
- **Ask why repeatedly** — dig into root causes and motivations
- **Offer alternative angles** — bring perspectives the user might not have considered
- **Connect dots** — relate the idea to things the user has mentioned or adjacent concepts
- **Play devil's advocate** — respectfully poke holes to stress-test ideas
- **Encourage wild ideas** — some of the best solutions come from impractical starting points

### 3. Narrow and clarify

As the conversation progresses, help ideas converge:

- Summarize what's emerging: "So it sounds like the core idea is..."
- Identify which ideas have the most energy and potential
- Ask the user to rank or prioritize if multiple directions exist
- Separate the "must have" essence from the "nice to have" additions

### 4. Capture the idea

When the user signals they're ready (or you sense convergence), produce an **idea summary** and save it to `.ai-workflow/ideas/`. Use a filename with the current date prefix followed by a slugified title (e.g., `.ai-workflow/ideas/20260222-offline-first-sync.md`).

Follow the tag and naming conventions in @.agents/conventions.md.

Use the file template in `reference/template.md`.

## Behavioral rules

- **Never write code.** Not even pseudocode. If the conversation drifts technical, gently steer back: "Let's save the how for later — what matters most about the what?"
- **Never jump to solutions too early.** Spend at least a few exchanges understanding the problem before exploring solutions.
- **Be a thinking partner, not an order taker.** Push back, question, and contribute your own angles.
- **Keep it conversational.** Short responses are fine. Not every reply needs to be comprehensive.
- **Match the user's energy.** If they're excited and rapid-fire, keep up. If they're reflective, slow down.
- **Don't over-structure the conversation.** The phases above are guidelines, not a rigid sequence. Follow the natural flow.

## Incorporating past learnings

Before starting the conversation, launch the **`knowledge-reviewer`** sub-agent with the topic as context. If relevant learnings are found, weave them in naturally when they're relevant to the direction the conversation takes — e.g., "From a previous cycle, we learned that X — worth keeping in mind."

Don't dump all learnings at once. Mention them when they connect to what's being discussed.
