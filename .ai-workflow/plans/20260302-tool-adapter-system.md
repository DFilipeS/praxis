---
title: Tool Adapter System
date: 2026-03-02
status: in-progress
ideas:
  - .ai-workflow/ideas/20260302-tool-adapter-system.md
group: tool-adapter-system
phase: 1
tags: [cli, developer-experience, portability, tooling]
---

# Tool Adapter System

## Goal

Enable the Praxis CLI to generate tool-specific configuration files for Claude Code, Cursor, and Opencode — including instruction file symlinks where needed and MCP configuration — so that Praxis projects work seamlessly across all supported AI coding tools, not just Amp Code.

## Background

Praxis uses per-skill `mcp.json` files in Amp Code's format and `AGENTS.md` as its canonical instruction file. Other tools expect MCP configuration in different locations and formats, and Claude Code reads `CLAUDE.md` rather than `AGENTS.md`. Cursor and Opencode do support `AGENTS.md` natively.

See [Tool Adapter System idea](.ai-workflow/ideas/20260302-tool-adapter-system.md) for full context.

## Research Summary

- **Amp Code** is the canonical source — reads `AGENTS.md` natively and uses per-skill `mcp.json` with format `{ "server-name": { "command": "...", "args": [...], "env": {"KEY": "${VAR}"} } }`. No adapter needed.
- **Claude Code** reads `CLAUDE.md`, not `AGENTS.md`. The adapter must create a `CLAUDE.md → AGENTS.md` symlink so Claude Code picks up Praxis instructions. For MCP, it expects `.mcp.json` at the project root: `{ "mcpServers": { "server-name": { "command": "...", "args": [...], "env": {"KEY": "${VAR}"} } } }`. Env var syntax matches Amp's.
- **Cursor** reads `AGENTS.md` natively (no instruction file mapping needed). For MCP, it expects `.cursor/mcp.json`: `{ "mcpServers": { "server-name": { "command": "...", "args": [...], "env": {"KEY": "${env:VAR}"} } } }`. Env var syntax uses `${env:VAR}` instead of `${VAR}`.
- **Opencode** reads `AGENTS.md` natively (no instruction file mapping needed). For MCP, it expects `opencode.json` with an `mcp` key: `{ "mcp": { "server-name": { "type": "local", "command": ["cmd", ...args], "environment": {"KEY": "{env:VAR}"} } } }`. Key differences: `command` merges the executable and args into a single array, uses `environment` instead of `env`, requires a `type` field, and env var syntax is `{env:VAR}`.
- The `components` command provides the UX pattern: multi-select → compute additions/removals → apply changes.
- Only skills with `mcp.json` files need adaptation — currently `figma-to-code` and `mobile-mcp`. The adapter should only generate MCP entries for skills the user has selected via `praxis components`.
- Past learnings: verify APIs cross-platform before committing, include tests in every step, validate file paths to prevent traversal.

## Steps

1. **Create the tool adapter registry** (`src/adapters.js`) — Define a data structure mapping each tool name to its configuration. Each entry specifies: the tool's display name, a list of files it generates (relative paths), and a transform function that takes merged MCP config and returns `{ path, content }` pairs. Register three adapters:
   - `claude-code`: creates a `CLAUDE.md → AGENTS.md` relative symlink at the project root (so Claude Code picks up Praxis instructions), and generates `.mcp.json` at the project root. Wraps merged servers in `{ "mcpServers": { ... } }`. Env var syntax: `${VAR}` (same as Amp, no transformation needed). If `CLAUDE.md` already exists and is not a symlink to `AGENTS.md`, warn the user and skip the symlink (don't overwrite their file).
   - `cursor`: generates `.cursor/mcp.json`. Wraps merged servers in `{ "mcpServers": { ... } }`. Transforms env var references from `${VAR}` to `${env:VAR}`.
   - `opencode`: generates `opencode.json`. For each server entry, merges `command` and `args` into a single `command` array, renames `env` to `environment`, transforms env var references from `${VAR}` to `{env:VAR}`, and adds `"type": "local"`. If `opencode.json` already exists, merges only the `mcp` key into the existing content (preserving other user settings). Wraps in `{ "mcp": { ... } }`.

   Export a `getAdapter(name)` function and a `listAdapters()` function. Also export a `collectMcpConfig(projectRoot, manifest)` function that reads all per-skill `mcp.json` files for currently selected components, merges them into a single object keyed by server name, and returns the result.

   Add tests: verify each adapter's transform produces correct output format, verify env var syntax transformation, verify `opencode.json` merge-vs-create logic, verify `collectMcpConfig` merges multiple skill configs correctly.

2. **Add the `praxis tool` command group** — Register a `tool` command in `bin/cli.js` with three subcommands:
   - `praxis tool add [names...]`: accepts one or more tool names (e.g., `praxis tool add claude-code cursor`). If no names are given, show an interactive multi-select (using `@clack/prompts`) listing all available adapters with their display names, pre-selecting any already-enabled tools. For each selected tool: run its adapter to generate config files, write them to disk, and record the tool name in the manifest under a new `enabledTools` array.
   - `praxis tool remove [names...]`: accepts one or more tool names. For each: delete its generated config files from disk (with a confirmation prompt if the file has been manually modified — detect this by comparing content to what the adapter would generate), remove the tool name from `enabledTools` in the manifest, and clean up empty parent directories.
   - `praxis tool list`: display a table of all available adapters and whether each is currently enabled, plus which files it manages.

   Follow the pattern of the existing `components` command for UX (spinner for loading, `p.log.success` for each file written/removed, `p.outro` with summary). The command must validate that Praxis is initialized before running.

   Add tests: verify add writes correct files, verify remove deletes files and updates manifest, verify list output, verify interactive multi-select when no names given, verify error when Praxis not initialized.

3. **Extend the manifest schema** — Add an `enabledTools` field (array of strings) to the manifest in `src/manifest.js`. This records which tool adapters are active. The `readManifest` function should default `enabledTools` to `[]` for existing manifests that lack the field (backward compatibility). No migration needed — the field is simply absent until `praxis tool add` is first used.

   Add tests: verify `readManifest` returns `enabledTools: []` for old manifests, verify `writeManifest` persists the field.

4. **Regenerate tool configs on component changes** — When `praxis components` adds or removes a skill that has an `mcp.json`, automatically regenerate the MCP configs for all enabled tools. Add a post-change hook at the end of the `components` command: if `manifest.enabledTools.length > 0`, call `collectMcpConfig` and re-run each enabled adapter's transform, overwriting the existing config files. Log a message like "Updated MCP config for claude-code, cursor" so the user knows it happened.

   Add tests: verify that adding a skill with MCP config regenerates tool configs, verify that removing such a skill also regenerates, verify no-op when no tools are enabled.

5. **Regenerate tool configs on `praxis update`** — When `praxis update` pulls new template files, if any `mcp.json` files changed and there are enabled tools, regenerate their configs. Add the same post-change hook as in step 4.

   Add tests: verify update regenerates tool configs when `mcp.json` templates change, verify no-op when no tools enabled.

6. **Document the feature** — Add a "Tool Adapters" section to `README.md` covering: what it does, supported tools (Amp Code is native / no adapter needed, Claude Code, Cursor, Opencode), usage examples (`praxis tool add claude-code`, `praxis tool remove cursor`, `praxis tool list`), and a note that MCP configs are committable (contain env var references, not secrets) so the whole team benefits.

## Acceptance Criteria

- [ ] `praxis tool add claude-code` creates a `CLAUDE.md → AGENTS.md` symlink and generates a valid `.mcp.json` at the project root containing merged MCP servers from all selected skills, with correct env var syntax
- [ ] If `CLAUDE.md` already exists and is not a symlink to `AGENTS.md`, the user is warned and the symlink is skipped
- [ ] `praxis tool add cursor` generates a valid `.cursor/mcp.json` with `${env:VAR}` env var syntax
- [ ] `praxis tool add opencode` generates a valid `opencode.json` (or merges `mcp` key into existing) with `{env:VAR}` syntax, array `command`, `environment` key, and `type: "local"`
- [ ] `praxis tool remove <name>` deletes the generated files and removes the tool from the manifest
- [ ] `praxis tool list` shows all available adapters and their enabled/disabled status
- [ ] Running `praxis tool add` with no arguments shows an interactive multi-select
- [ ] Changing components (adding/removing a skill with `mcp.json`) automatically regenerates configs for all enabled tools
- [ ] Running `praxis update` regenerates tool configs when upstream `mcp.json` files change
- [ ] The `enabledTools` manifest field is backward-compatible with existing installs
- [ ] All new code has corresponding tests
- [ ] README documents the feature with usage examples

## Dependencies

- The selective component installation feature must be complete (it is — status `done`)
- The existing per-skill `mcp.json` format is stable (currently used by `figma-to-code` and `mobile-mcp`)

## Related Documents

- [Tool Adapter System idea](.ai-workflow/ideas/20260302-tool-adapter-system.md)
- [Selective Component Installation plan](.ai-workflow/plans/20260227-selective-component-installation.md)
