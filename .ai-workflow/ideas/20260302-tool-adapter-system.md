---
title: Tool Adapter System
date: 2026-03-02
status: done
tags: [cli, developer-experience, portability, tooling]
---

# Tool Adapter System

## Problem

Praxis uses `.agents/` and `AGENTS.md` as its canonical structure, but different AI coding tools expect different conventions — Claude Code uses `CLAUDE.md` and `.claude/`, Cursor uses `.cursor/` and `.cursorrules`, and so on. MCP server configuration also varies: Amp Code reads `mcp.json` from skill directories, Claude Code uses `.mcp.json` at the project root or `claude mcp add`, and Cursor uses `.cursor/mcp.json`. This means skills that depend on MCP servers (like `figma-to-code`) only work in Amp Code today. Developers who jump between tools on the same project — to test different models or harnesses — have to manually replicate configuration for each one.

## Core Idea

Extend the Praxis CLI to act as a tool adapter layer. The CLI asks which AI tools you use (multi-select), then generates the necessary symlinks and configuration files so each tool sees what it expects — all pointing back to the Praxis canonical structure as the single source of truth. Tool support can be toggled on or off at any time.

## Key Insights

- **Symlink the root instruction file, manage directories surgically.** `CLAUDE.md → AGENTS.md` works cleanly, but symlinking an entire directory (`.claude/ → .agents/`) is problematic because tools write their own state and cache files into their directories. Instead, create the tool-specific directory and symlink or generate only the specific files within it that map to Praxis concepts.
- **MCP configs are committable.** They reference environment variables by name (`${FIGMA_API_KEY}`), not by value. The config files contain no secrets and can be shared via git. Teammates only need to set the actual env var values on their machines.
- **Everything gets committed.** Symlinks, MCP configs, tool-specific directory contents — all committed to git so teammates get the setup automatically. True zero-setup for the team.
- **CLI-first over MCP when possible.** Skills like `agent-browser` prove that CLI-based tools (called via Bash) work across all AI tools without any configuration. This is the preferred pattern. MCP should only be used when there's no viable CLI alternative (e.g., Figma, where the MCP server does significant data processing beyond what a simple API call provides).
- **Multi-tool coexistence is natural.** Since all tool-specific files point back to the same source of truth, multiple tools can be set up simultaneously without conflict.

## Open Questions

- What's the exact CLI UX? A `praxis setup` interactive prompt during first install, plus `praxis tool add claude-code` / `praxis tool remove claude-code` for toggling later?
- For directory-level adaptation, which specific files within `.claude/` or `.cursor/` need to be symlinked or generated? This needs a per-tool audit.
- How do we handle tools we haven't mapped yet? A plugin/extension point, or just add them to the CLI as we go?
- Should the CLI detect which tools are installed and suggest them, or always ask explicitly?

## Possible Directions

1. **Interactive setup flow** — `praxis setup` asks "which tools do you use?" with a multi-select, then generates everything in one pass. A `praxis tool` subcommand manages individual tools after the fact.
2. **Auto-detection with confirmation** — the CLI scans for installed tools (e.g., checks for `claude` binary, `.cursor/` directory) and pre-selects them, letting the user confirm or adjust.

## Related Documents

- [Selective Component Installation](20260227-selective-component-installation.md) — the tool adapter could integrate with the component selection flow (e.g., only generate MCP configs for installed optional skills)
- [Tool Adapter System plan](../plans/20260302-tool-adapter-system.md)
- [existsSync returns false for dangling symlinks](../learnings/20260302-existssync-false-for-dangling-symlinks.md)
- [Write the manifest first to declare intent](../learnings/20260302-manifest-first-writes-for-crash-recovery.md)
- [Use Object.create(null) for untrusted JSON](../learnings/20260302-object-create-null-for-untrusted-json.md)
- [Validate resolved paths to prevent traversal](../learnings/20260302-path-traversal-through-dynamic-path-join.md)
