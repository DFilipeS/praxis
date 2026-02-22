---
name: reviewing
description: "Runs automated code reviews using configurable reviewer agents. Use during or after implementation to check code quality, security, and best practices."
argument-hint: "file paths or directories to review, or 'staged' for staged git changes"
---

# Reviewing

Run automated code reviews by discovering and launching reviewer sub-agents in parallel. Each reviewer focuses on a specific concern and reports findings in a consistent format. **Findings are presented to the user — nothing is auto-fixed.**

## How a session works

### 1. Determine scope

If `$ARGUMENTS` is provided, use it as the scope:
- File paths or directories → review those files
- `staged` → review staged git changes (`git diff --cached`)
- A plan file path → review files mentioned in the plan's steps

If no arguments, ask the user what to review.

### 2. Discover reviewers

Scan `.agents/agents/reviewers/` for all reviewer agent definitions. Each `.md` file in that directory is a reviewer to run.

If the directory is empty or doesn't exist, inform the user and stop.

### 3. Run reviewers in parallel

Launch all discovered reviewers as parallel sub-agents using `Task`. Each reviewer receives:
- The list of files to review
- The diff or file contents as appropriate

### 4. Synthesize and present findings

Collect results from all reviewers and present a unified summary to the user, organized by severity:

1. **Critical** — must fix before merging (security vulnerabilities, data loss risks, broken functionality)
2. **Warning** — should fix (bugs, performance issues, missing edge cases)
3. **Suggestion** — consider improving (style, readability, minor optimizations)

For each finding, include:
- Which reviewer flagged it
- File and location
- What the issue is
- How to fix it

If no findings, report a clean review.

### 5. Fix on request

After presenting findings, ask the user which (if any) they want to fix. Only make changes the user explicitly approves.

## Reviewer agent conventions

Each reviewer in `.agents/agents/reviewers/` must follow the output format defined in `.agents/reviewer-output-format.md`.

## Behavioral rules

- **Never auto-fix.** Present findings and wait for the user to decide.
- **Run all reviewers.** Don't skip any discovered reviewer unless the user explicitly asks to.
- **No false positives over missed issues.** Reviewers should err on the side of flagging things — the user filters.
- **Respect the plan.** If reviewing implementation of a plan, check the plan's acceptance criteria as part of the review.
