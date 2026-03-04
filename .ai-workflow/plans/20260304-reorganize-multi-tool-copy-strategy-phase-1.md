---
title: Reorganize Multi-Tool Copy Strategy - Phase 1
date: 2026-03-04
status: ready
ideas:
  - .ai-workflow/ideas/20260304-reorganize-multi-tool-copy-strategy.md
group: reorganize-multi-tool-copy-strategy
phase: 1
tags: [developer-experience, portability, tooling]
---

# Reorganize Multi-Tool Copy Strategy - Phase 1: Core Infrastructure

## Goal

Restructure Praxis repository from `.agents/` to `praxis/` source directory and update CLI to copy skills/agents directly to tool-specific directories (`.cursor/`, `.claude/`) instead of `.agents/`. The manifest tracks files per-tool, and the copy process stops on first error.

## Background

Current Praxis copies content to `.agents/` directory, but tools like Cursor and Claude Code ignore `.agents/` when tool-specific directories exist. This means users with existing configurations never see Praxis content. We need to deliver Praxis files directly to each tool's expected location while tracking everything in `.praxis-manifest.json`.

## Research Summary

**Existing infrastructure:**
- `src/templates.js` fetches tarball from GitHub, extracts `.agents/` content
- `src/manifest.js` tracks files with SHA256 hashes in `.praxis-manifest.json`
- `src/adapters.js` already generates tool-specific configs for claude-code/cursor/opencode
- Current architecture assumes single destination (`.agents/`)

**Tool directory expectations:**
- **Cursor:** `.cursor/rules/*.mdc` (project rules), `.cursor/skills/` (optional)
- **Claude Code:** `.claude/agents/` (custom subagents)

**Key constraints:**
- CLI fetches from GitHub tarball at runtime, so repo structure changes don't need backward compatibility
- Must stop on first copy error
- Praxis files overwrite existing content by default (Praxis is authority for its own files)

## Steps

1. **Restructure repository source directory** — Rename `.agents/` to `praxis/` at repository root. Move `conventions.md` and `reviewer-output-format.md` to appropriate subdirectories (`praxis/` root or `praxis/shared/`). Ensure `praxis/skills/`, `praxis/agents/`, and `praxis/agents/reviewers/` directory structure is preserved. Update any internal references in the repository.

2. **Update template fetching logic** — Modify `src/templates.js` to fetch from `praxis/` directory instead of `.agents/`. The tarball extraction should map `praxis/` paths in the GitHub tarball to the local file map. Test that all expected files are retrieved correctly from the new location.

3. **Design modular tool adapter interface** — Create a clean interface/adapter pattern in `src/adapters.js` where each tool is a self-contained module that implements:
   
   **File installation methods:**
   - `getDestinationPath(sourceFile)` - returns where to install a given source file
   - `isEnabled(projectRoot)` - checks if this tool is configured for the project
   - `getToolName()` - returns the tool identifier
   
   **MCP configuration methods:**
   - `generateMcpConfig(projectRoot, skillMcpConfigs)` - generates tool-specific MCP configuration file from per-skill mcp.json data. Each tool has different formats:
     - Amp Code: reads per-skill `mcp.json` files directly, no generation needed
     - Claude Code: generates `.mcp.json` with `{ "mcpServers": { ... } }` format, merging per-skill configs
     - Cursor: generates `.cursor/mcp.json` with `${env:VAR}` syntax (transformed from `${VAR}`)
     - OpenCode: generates `opencode.json` with merged `command` array, `environment` key, `{env:VAR}` syntax, and `"type": "local"`
   - `getMcpConfigPath()` - returns the path where MCP config should be written
   
   The core installation and MCP configuration logic should not need to change when adding or removing tools - it simply iterates over available tool adapters.

4. **Implement tool adapters for Cursor, Claude Code, Amp Code, and OpenCode** — Create adapter modules in `src/adapters/` that implement the adapter interface:
   
   **File installation:**
   - **Cursor adapter:** Maps skills to `.cursor/skills/`, agents to `.cursor/`, shared files to `.cursor/` preserving relative paths. Uses `.mdc` extension where appropriate for Cursor rules format.
   - **Claude Code adapter:** Maps skills to `.claude/skills/`, agents to `.claude/agents/`, shared files to `.claude/` preserving relative paths.
   - **Amp Code adapter:** Maps all content to `.agents/` directory (maintaining backward compatibility for Amp Code users). Skills go to `.agents/skills/`, agents to `.agents/agents/`, shared files to `.agents/` preserving current structure.
   - **OpenCode adapter:** Maps skills to `.opencode/skills/`, agents to `.opencode/agents/`, shared files to `.opencode/` preserving relative paths. OpenCode has compatibility with `.agents/` and `.claude/` structures, but we provide the native `.opencode/` location for clarity.
   
   **MCP configuration:**
   - **Amp Code adapter:** Reads per-skill `mcp.json` files directly from `.agents/skills/<skill>/mcp.json`. No generation needed - Amp Code natively supports this format. `generateMcpConfig()` is a no-op or returns null.
   - **Claude Code adapter:** Generates `.mcp.json` at project root. Collects all per-skill mcp.json files from installed skills, merges them into `{ "mcpServers": { <skill-name>: { ... } } }` format. Each skill's MCP config gets its own key in the mcpServers object.
   - **Cursor adapter:** Generates `.cursor/mcp.json`. Similar to Claude Code but transforms environment variable syntax from `${VAR}` to `${env:VAR}`. Uses Cursor's expected JSON structure.
   - **OpenCode adapter:** Generates `opencode.json` with MCP servers in the `mcp` key. Transforms environment variables to `{env:VAR}` syntax. Each MCP server gets `type: "local"`, merged `command` array from the skill's mcp.json, and `environment` key for env vars.
   
   Each adapter handles tool-specific logic internally without leaking into the core installation or MCP generation code.

5. **Update manifest structure for per-tool tracking** — Extend `.praxis-manifest.json` schema to track files per-tool. Change from `files: { path: { hash } }` to `files: { path: { tool: destinationPath, hash: sha256 } }` or similar structure. Update `src/manifest.js` read/write functions to handle the new schema. Ensure existing manifests without tool information can be migrated or are handled gracefully.

6. **Update file installation for adapter-driven destinations** — Modify `src/files.js` to work with the adapter system. The install function should accept a source file and iterate through all registered tool adapters, asking each: "If this tool is enabled, where should this file go?" For each enabled tool with a valid destination, write the file. Stop immediately on first write error. Remove any hardcoded tool-specific logic from `files.js` - it should only coordinate adapter calls and handle I/O.

7. **Update init command to use adapter system** — Modify `src/commands/init.js` to use the adapter system. Fetch templates, determine which tool adapters report as enabled for this project, then for each file in the install set, ask each enabled adapter where to install it and proceed. If any copy fails, abort immediately. Write the manifest only after all successful copies. Adding a new tool should only require registering its adapter - no changes to `init.js` logic.

8. **Update update command for per-tool comparison** — Modify `src/commands/update.js` to compare files per-tool using the adapter system. For each source file, ask each enabled adapter for its destination path, check if the file at that path matches the stored hash. If not, copy the new version. Stop on first error. If a tool is newly enabled, the adapter will report new destinations and files will be installed there.

9. **Update status command to use adapters** — Modify `src/commands/status.js` to iterate through tool adapters, asking each to report its state. Each adapter knows how to check its own directory structure. Display per-tool installation status, file sync state, which tools are enabled, and whether MCP configs are present and up to date. The status command should not have tool-specific logic - it delegates to adapters.

10. **Add MCP configuration generation to init and update commands** — After installing skill files, collect all per-skill `mcp.json` files from the installed skills. For each enabled tool adapter, call `generateMcpConfig()` with the collected MCP configurations. The adapter transforms the per-skill configs into the tool-specific format and writes to the appropriate location. Stop on first error. If a skill is added or removed, regenerate MCP configs for all tools during update. MCP configs are written after successful file installation but before writing the manifest.

11. **Test the full flow and verify modularity** — Run through `praxis init` with multiple tools enabled. Verify files appear in correct tool directories (`.cursor/skills/`, `.claude/skills/`, `.agents/skills/`, `.opencode/skills/`). Verify MCP configs are generated in correct locations (`.mcp.json`, `.cursor/mcp.json`, `opencode.json`). Run `praxis status` to confirm tracking. Modify a local file and run `praxis update` to verify selective updates. Test error handling with a permission error. Finally, verify that adding a mock fifth tool adapter (without implementing full functionality) doesn't require changes to any other files - demonstrating the modular architecture.

## Acceptance Criteria

- [ ] Repository `.agents/` directory renamed to `praxis/`
- [ ] `src/templates.js` successfully fetches from `praxis/` in GitHub tarball
- [ ] Tool adapter interface defined in `src/adapters.js` or similar
- [ ] Cursor adapter implemented with proper destination mappings
- [ ] Claude Code adapter implemented with proper destination mappings
- [ ] Amp Code adapter implemented for `.agents/` directory (backward compatibility)
- [ ] OpenCode adapter implemented for `.opencode/` directory
- [ ] Files are copied to `.agents/` when Amp Code is enabled
- [ ] Files are copied to `.opencode/skills/` when OpenCode is enabled
- [ ] Files are copied to `.claude/agents/` when Claude Code is enabled
- [ ] Shared files (conventions.md, etc.) copied preserving relative paths, not transformed
- [ ] `.praxis-manifest.json` tracks each file's location per-tool with SHA256 hash
- [ ] Copy process stops immediately on first error with clear error message
- [ ] `praxis init` uses adapter system, requires no changes when adding new tools
- [ ] `praxis update` uses adapter system for per-tool comparison
- [ ] `praxis status` uses adapter system to show per-tool state
- [ ] Tested with Cursor, Claude Code, Amp Code, and OpenCode enabled simultaneously
- [ ] Tool adapter interface includes MCP configuration methods (`generateMcpConfig()`, `getMcpConfigPath()`)
- [ ] Amp Code adapter reads per-skill `mcp.json` directly (no generation needed)
- [ ] Claude Code adapter generates `.mcp.json` with merged `{ "mcpServers": { ... } }` format
- [ ] Cursor adapter generates `.cursor/mcp.json` with `${env:VAR}` syntax
- [ ] OpenCode adapter generates `opencode.json` with `mcp` key, `{env:VAR}` syntax, `type: "local"`
- [ ] MCP configs regenerated when skills are added/removed during update
- [ ] MCP config generation stops on first error
- [ ] `praxis status` shows MCP config status per tool
- [ ] Mock fifth adapter can be added without modifying init/update/status/MCP commands
- [ ] Error simulation produces expected stop-and-report behavior

## Dependencies

None - this is the first phase. Requires no prior implementation.

## Related Documents

- .ai-workflow/ideas/20260304-reorganize-multi-tool-copy-strategy.md
