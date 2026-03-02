---
title: Use Object.create(null) when merging untrusted JSON
date: 2026-03-02
category: pattern
plans:
  - .ai-workflow/plans/20260302-tool-adapter-system.md
tags: [cli, tooling]
---

# Use Object.create(null) when merging untrusted JSON

## Context
The Tool Adapter System merges per-skill `mcp.json` files into a single configuration object. These JSON files are read from disk and could contain keys like `__proto__` or `constructor` that would pollute the object prototype if merged into a standard `{}` object.

## Insight
Using `Object.create(null)` as the merge target creates a prototype-less object that is immune to prototype pollution. Keys like `__proto__` are treated as ordinary string properties rather than triggering prototype chain manipulation.

## Evidence
A security reviewer flagged that `collectMcpConfig` used `Object.assign({}, ...)` to merge parsed JSON from skill `mcp.json` files. A crafted `mcp.json` with a `__proto__` key could inject properties into all objects in the process. Switching to `Object.create(null)` as the target eliminated the attack vector with zero functional impact.

## Recommendation
Whenever merging or accumulating data from external or untrusted JSON sources (config files, API responses, user input), use `Object.create(null)` as the target object instead of `{}`. This is a zero-cost defense that should be the default for any merge/reduce pattern over external data.
