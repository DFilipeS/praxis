---
title: Parallel reviewer disagreement reveals nuance
date: 2026-03-03
category: pattern
plans:
  - .ai-workflow/plans/20260303-px-prefix-for-core-skills.md
tags: [px-review]
---

# Parallel reviewer disagreement reveals nuance

## Context

During code review of the px-prefix implementation, 8 reviewer agents ran in parallel. Two reviewers disagreed on whether sub-agent descriptions needed updates.

## Insight

When parallel reviewers disagree, the disagreement itself is valuable signal — it reveals nuance that a single reviewer or sequential reviews would miss. One reviewer flagged an issue; another correctly identified it as a false positive by understanding the broader context.

## Evidence

The code quality reviewer flagged sub-agent descriptions as warnings: "Sub-agent description still uses lowercase 'planning'." The architecture reviewer correctly noted: "'planning' in those descriptions is grammatical usage, not a skill name reference." The disagreement surfaced the distinction between skill references and common words used as verbs.

## Recommendation

When running parallel reviewers, pay attention to disagreements rather than treating them as noise. A finding that one reviewer flags and another contextualizes often represents a subtle case worth understanding. This is different from multi-round review churn (where later rounds contradict earlier fixes) — parallel disagreement happens simultaneously and reveals interpretive ambiguity.
