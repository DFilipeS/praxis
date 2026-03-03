---
title: Verify context before applying pattern-based plan changes
date: 2026-03-03
category: anti-pattern
plans:
  - .ai-workflow/plans/20260303-px-prefix-for-core-skills.md
tags: [px-plan]
---

# Verify context before applying pattern-based plan changes

## Context

During the px-prefix implementation, the plan listed sub-agent description files for update because they contained the word "planning" — matching the pattern of skill name references that needed changing.

## Insight

Pattern matching without context verification leads to unnecessary changes. A plan may identify files based on string matches, but the actual usage context determines whether changes are needed. "Planning" as a verb ("Use when planning work") is different from "planning" as a skill name reference.

## Evidence

The plan step 5 listed three sub-agent files as needing updates: knowledge-reviewer.md, external-researcher.md, and codebase-explorer.md. Reading the actual descriptions showed phrases like "Use when planning or investigating existing code" — grammatical usage, not skill references. These files were reverted after the false positive was caught during review.

## Recommendation

When a plan identifies files for changes based on pattern matching (string search, grep results), verify the actual context before applying changes. Ask: "Is this a reference to the thing being renamed, or coincidental text?" This is especially important for common words that serve multiple grammatical roles.
