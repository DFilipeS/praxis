---
name: implementing
description: "Executes an implementation plan by writing code. Use when ready to implement a plan that has been brainstormed, planned, and approved."
argument-hint: "path to plan file, e.g. .ai-workflow/plans/20260222-offline-first-sync-phase-1.md"
---

# Implementing

Execute a concrete implementation plan by writing code. Follow the plan's steps precisely. **This is the only skill that produces code.**

## How a session works

### 1. Load the plan

If `$ARGUMENTS` is provided, treat it as the path to a plan file and read it. Otherwise, ask the user which plan to implement. Only accept plans with `status: ready`.

Read the plan thoroughly, including:
- The goal and background
- The research summary (this contains relevant existing code, learnings, and best practices — no need to re-research)
- All steps and acceptance criteria
- Dependencies (verify they are met before starting)

Update the plan's `status` to `in-progress`.

### 2. Set up a branch

Create a new Git branch for this implementation. Use a descriptive branch name based on the plan slug (e.g., `implement/offline-first-sync-phase-1`).

- If currently on `main` or `master`, branch from it.
- If on another branch, ask the user whether to branch from the current branch, `main`/`master`, or a specific branch.

The user may also request a Git worktree instead of a regular branch. If so, create the worktree and work there.

### 3. Implement step by step

Work through the plan's steps in order. For each step:

1. Confirm what you're about to do
2. Write the code
3. Verify it works (run tests, type checks, or whatever validation is appropriate)
4. Commit the work (see Git conventions below)
5. Move to the next step

If something in the plan is ambiguous or doesn't work as described, stop and ask the user rather than guessing. The plan should have enough detail — if it doesn't, that's a signal to clarify, not to improvise. Once clarified, update the plan file with the new information so it stays accurate and complete.

### 4. Verify acceptance criteria

After all steps are complete, go through each acceptance criterion from the plan and verify it's met. Report the results to the user:

- [ ] Criterion — ✅ met / ❌ not met (explain why)

If any criteria are not met, discuss with the user whether to address them now or defer.

### 5. Run automated review

Once implementation is complete and acceptance criteria are verified, invoke the **reviewing** skill to run all configured reviewers against the changed files.

Present the review findings to the user. Fix any issues the user approves.

### 6. Update related documents

After implementation and review are complete:
- Update the plan's acceptance criteria checkboxes to reflect final state
- Leave the plan's `status` as `in-progress` (the retrospective skill will set it to `done`)

## Git conventions

Follow the Git conventions in @.agents/conventions.md.

Commits should tell a story to reviewers (AI or human). It is fine to have multiple commits per step if they make logical sense — prefer meaningful, reviewable units over one giant commit.

## Behavioral rules

- **Follow the plan.** The plan was researched, written, and approved for a reason. Don't deviate without the user's explicit agreement.
- **Work incrementally.** Small changes, verified as you go. Don't write all the code at once and hope it works.
- **Stop on ambiguity.** If a step is unclear, ask. Don't interpret creatively.
- **Don't over-engineer.** Implement exactly what the plan says. No extra features, no "while we're here" improvements.
- **Test as you go.** Run relevant tests after each step, not just at the end.
- **Don't skip the review.** Always run the reviewing skill after implementation.
