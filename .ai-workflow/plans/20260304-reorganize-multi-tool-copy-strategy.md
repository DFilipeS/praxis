---
title: Reorganize Multi-Tool Copy Strategy
date: 2026-03-04
status: in-progress
ideas:
  - .ai-workflow/ideas/20260304-reorganize-multi-tool-copy-strategy.md
group: reorganize-multi-tool-copy-strategy
tags: [developer-experience, portability, tooling]
---

# Reorganize Multi-Tool Copy Strategy: Core Infrastructure

## Goal

Restructure Praxis repository from `.agents/` to `praxis/` source directory and update CLI to copy skills/agents directly to tool-specific directories (`.cursor/`, `.claude/`, `.opencode/`, `.agents/`) instead of `.agents/`. Support adding, updating, and removing tools/components with the manifest tracking files per-tool. The copy process stops on first error, and removal preserves locally modified files.

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
   - `getManagedFiles(projectRoot)` - returns list of files managed by Praxis for this tool (used during tool removal cleanup)
   
   **MCP configuration methods:**
   - `generateMcpConfig(projectRoot, skillMcpConfigs)` - generates tool-specific MCP configuration file from per-skill mcp.json data. Each tool has different formats:
     - Amp Code: reads per-skill `mcp.json` files directly, no generation needed
     - Claude Code: generates `.mcp.json` with `{ "mcpServers": { ... } }` format, merging per-skill configs
     - Cursor: generates `.cursor/mcp.json` with `${env:VAR}` syntax (transformed from `${VAR}`)
     - OpenCode: generates `opencode.json` with merged `command` array, `environment` key, `{env:VAR}` syntax, and `"type": "local"`
   - `getMcpConfigPath()` - returns the path where MCP config should be written
   - `cleanupMcpConfig(projectRoot)` - removes MCP config file when tool is disabled (optional, can be handled by generic cleanup)
   
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

10. **Update tool remove command for cleanup** — Modify `src/commands/tool.js` (or create `src/commands/remove.js`) to handle tool removal. When a tool is removed (e.g., `praxis tool remove cursor`), the command should: 1) Ask the adapter which files it manages for this project by calling `getManagedFiles()`, 2) Verify each file in the manifest belongs to the tool being removed and matches the stored hash (to avoid deleting user files), 3) Delete only Praxis-managed files that haven't been modified locally, 4) Remove the tool from the manifest's `enabledTools` list, 5) Clean up empty directories. Stop on first error. Warn if files were modified locally (skip deletion, notify user).

11. **Add component remove command** — Create or modify the command for removing optional components (skills, reviewers). When a component is removed: 1) Determine which files belong to the component, 2) For each enabled tool, ask the adapter where those files are installed, 3) Verify files in manifest match stored hashes, 4) Delete unmodified Praxis-managed files from all tool directories, 5) Regenerate MCP configs (since skill mcp.json files are being removed), 6) Update manifest's `selectedComponents`. Stop on first error. This allows selective removal without touching core files or other components.

12. **Add MCP configuration generation to init and update commands** — After installing skill files, collect all per-skill `mcp.json` files from the installed skills. For each enabled tool adapter, call `generateMcpConfig()` with the collected MCP configurations. The adapter transforms the per-skill configs into the tool-specific format and writes to the appropriate location. Stop on first error. If a skill is added or removed, regenerate MCP configs for all tools during update. MCP configs are written after successful file installation but before writing the manifest.

13. **Test the full flow including removal** — Run complete test cycle: `praxis init` with multiple tools, verify files in all directories, run `praxis status`, add a skill, verify MCP configs regenerated, remove a skill, verify files deleted but core remains, remove a tool, verify only that tool's files cleaned up while others remain, test error handling during removal (stops on first error, leaves partial state), verify adding mock fifth adapter still requires no core command changes.

## Acceptance Criteria

- [x] Repository `.agents/` directory renamed to `praxis/`
- [x] `src/templates.js` successfully fetches from `praxis/` in GitHub tarball
- [x] Tool adapter interface defined in `src/adapters.js` or similar
- [x] Cursor adapter implemented with proper destination mappings
- [x] Claude Code adapter implemented with proper destination mappings
- [x] Amp Code adapter implemented for `.agents/` directory (backward compatibility)
- [x] OpenCode adapter implemented for `.opencode/` directory
- [x] Files are copied to `.agents/` when Amp Code is enabled
- [x] Files are copied to `.opencode/skills/` when OpenCode is enabled
- [x] Files are copied to `.claude/agents/` when Claude Code is enabled
- [x] Shared files (conventions.md, etc.) copied preserving relative paths, not transformed
- [x] `.praxis-manifest.json` tracks each file's location per-tool with SHA256 hash
- [x] Copy process stops immediately on first error with clear error message
- [x] `praxis init` uses adapter system, requires no changes when adding new tools
- [x] `praxis update` uses adapter system for per-tool comparison
- [x] `praxis status` uses adapter system to show per-tool state
- [x] Tested with Cursor, Claude Code, Amp Code, and OpenCode enabled simultaneously
- [x] Tool adapter interface includes MCP configuration methods (`generateMcpConfig()`, `getMcpConfigPath()`)
- [x] Amp Code adapter reads per-skill `mcp.json` directly (no generation needed)
- [x] Claude Code adapter generates `.mcp.json` with merged `{ "mcpServers": { ... } }` format
- [x] Cursor adapter generates `.cursor/mcp.json` with `${env:VAR}` syntax
- [x] OpenCode adapter generates `opencode.json` with `mcp` key, `{env:VAR}` syntax, `type: "local"`
- [x] MCP configs regenerated when skills are added/removed during update
- [x] MCP config generation stops on first error
- [x] `praxis status` shows MCP config status per tool
- [x] Mock fifth adapter can be added without modifying init/update/status/MCP/removal commands
- [x] Error simulation produces expected stop-and-report behavior
- [x] `praxis tool remove <tool>` removes only that tool's Praxis-managed files
- [x] Tool removal verifies file hashes before deleting (skips modified files)
- [x] Tool removal cleans up empty directories after file deletion
- [x] `praxis components remove <component>` removes component from all enabled tools
- [x] Component removal regenerates MCP configs (removed skill's mcp.json no longer included)
- [x] Modified files are preserved during removal (warning shown to user)

## Dependencies

None - this is the first phase. Requires no prior implementation.

## Related Documents

- .ai-workflow/ideas/20260304-reorganize-multi-tool-copy-strategy.md
