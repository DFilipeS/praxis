---
title: Multi-round reviews can contradict prior deliberate decisions
date: 2026-02-28
category: anti-pattern
plans:
  - .ai-workflow/plans/20260227-selective-component-installation.md
tags: [reviewing, workflow, ai-agents]
---

# Multi-round reviews can contradict prior deliberate decisions

## Context

During the selective component installation implementation, three consecutive rounds of automated code reviews were run. Each round launched 8 reviewer agents in parallel.

## Insight

Reviewer agents have no memory between rounds. By round 3, one reviewer flagged cancel paths as needing to save `manifest.selectedComponents` — which directly contradicted round 1's critical fix that changed exactly that to save `newSelection` instead. Without careful tracking of prior fix rationale, this kind of churn can loop indefinitely.

The problem isn't diminishing returns — it's that a finding can actively mislead when it reverses a deliberate decision made in a previous round.

## Evidence

Round 1 critical fix: cancel paths in `components.js` were saving `manifest.selectedComponents` (old selection) instead of `newSelection` (user's new intent). Fixed to save `newSelection`.

Round 3: the data integrity reviewer flagged those same cancel paths and recommended saving `manifest.selectedComponents`. This was the inverse of the round-1 fix.

## Recommendation

Before acting on a round-3+ finding, check whether it touches code that was deliberately changed in a prior round. If a finding contradicts a prior fix, it's circular — don't revert. After two rounds of reviews, filter findings by asking: "Was this decision already made and recorded?" Only fix findings that represent genuinely new observations.
