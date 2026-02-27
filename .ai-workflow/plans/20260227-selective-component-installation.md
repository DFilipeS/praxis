---
title: Selective Component Installation
date: 2026-02-27
status: ready
ideas:
  - .ai-workflow/ideas/20260227-selective-component-installation.md
group: selective-component-installation
phase: 1
tags: [cli, developer-experience, distribution, tooling]
---

# Selective Component Installation

## Goal

Users can choose which optional Praxis components (skills, reviewers) to install during `praxis init`, change their selection at any time with `praxis select`, and receive nudges about new optional components during `praxis update`. Core workflow components are always installed.

## Background

Praxis currently installs all components into every project. Project-specific skills like `figma-to-code`, `agent-browser`, and `mobile-mcp` clutter projects where they're irrelevant and can mislead the AI agent. The v1 CLI (shipped via the npm-cli-distribution idea) explicitly deferred selective installation. See `.ai-workflow/ideas/20260227-selective-component-installation.md` for the full idea.

## Research Summary

**Codebase:** The CLI uses Commander.js for commands and `@clack/prompts` for interactive UI — which already provides `groupMultiselect()` with a `selectableGroups` option, a perfect fit. Templates are fetched via `fetchTemplates()` as a flat `Map<relativePath, content>` from a GitHub tarball. The manifest (`.praxis-manifest.json`) tracks files with SHA-256 hashes but has no component awareness. There are 3 commands (`init`, `update`, `status`), each in `src/commands/`.

**Past learnings:** The v1 retrospective warned to verify library APIs before committing to them in plans and to include tests in each step rather than deferring. It also flagged path traversal risks in file operations.

**External patterns:** `@clack/prompts` (already a dependency) supports grouped multi-select via `groupMultiselect()`. The create-t3-app pattern of collecting selections into a set and running installers independently is a good model. Allowlist stored as a simple array in config is the standard approach.

## Steps

1. **Create the component registry (`src/components.js`)** — Only **core** components are hardcoded. Optional components are discovered dynamically at runtime from the fetched templates `Map` using directory conventions.

   **What's hardcoded — a `CORE_SKILLS` set:**
   `brainstorming`, `planning`, `implementing`, `reviewing`, `retrospective`

   Everything else is derived at runtime by scanning the templates `Map`:
   - A file matching `.agents/skills/{name}/**` where `{name}` is **not** in `CORE_SKILLS` → optional skill component named `{name}`.
   - A file matching `.agents/agents/reviewers/{name}.md` → optional reviewer component named `{name}` (no prefix needed — the `type` field distinguishes it from skills).
   - All other files (root-level `.agents/*.md`, `.agents/agents/*.md`, core skill files) → core, always installed.

   Descriptions are extracted from each component's primary file frontmatter at runtime: skills use `.agents/skills/{name}/SKILL.md`, reviewers use `.agents/agents/reviewers/{name}.md`. Parse with a simple regex (e.g. `/^description:\s*"?(.+?)"?\s*$/m`) — no YAML parser dependency needed. Fall back to the component name if unparseable.

   Exported functions:
   - `getComponentForFile(relativePath)` — returns the optional component name a file belongs to, or `null` for core files. Uses the path conventions above.
   - `getComponentFiles(templates, componentName)` — filters a templates `Map` to just the files belonging to that component.
   - `getCoreFiles(templates)` — returns all files not belonging to any optional component.
   - `discoverOptionalComponents(templates)` — scans the templates `Map` and returns an array of `{ name, type, description }` for every optional component found, grouped by type (`"skill"` or `"reviewer"`). This is the main discovery function — no hardcoded list of optional components exists.
   - `getComponentDescription(templates, componentName)` — reads the primary file for the component from the templates `Map`, parses the `description` from YAML frontmatter. Returns component name as fallback.
   - `getSelectedComponents(manifest, templates)` — returns the `selectedComponents` array from the manifest, or falls back to all discovered optional component names if the field is absent (backward compatibility).

   This design means adding a new optional skill or reviewer to Praxis requires **zero changes** to the CLI — it's automatically discovered and presented in the checklist.

   Write tests for this module: `getComponentForFile` correctly classifies core vs optional files, `getCoreFiles` excludes optional files, `getComponentFiles` returns the right subset, `discoverOptionalComponents` finds all optional components from a mock templates `Map`, `getComponentDescription` extracts descriptions from frontmatter.

2. **Extend the manifest with `selectedComponents`** — In `src/manifest.js`, no code changes are needed to read/write the field (it's just JSON). In consuming code, treat a manifest without `selectedComponents` as "all optional components selected" for backward compatibility. The field is an object grouped by type, e.g. `{ "skills": ["agent-browser"], "reviewers": ["security", "architecture"] }`. This avoids name collisions between types and matches the grouped display. Write a helper `getSelectedComponents(manifest, templates)` in `src/components.js` that returns the object from the manifest, or falls back to all discovered optional component names (grouped by type) if the field is absent.

3. **Modify `init` to present interactive component selection** — In `src/commands/init.js`, after fetching templates and before the file installation loop:

   a. Call `discoverOptionalComponents(templates)` to get all optional components with their names, types, and descriptions. Build the `groupMultiselect` options grouped by type. Each option's `value` is the component name, `label` is the description. All options are initially selected (checked).

   b. Call `p.groupMultiselect()` to present the checklist. Handle cancellation.

   c. Compute the set of files to install: `getCoreFiles(templates)` plus `getComponentFiles(templates, name)` for each selected component.

   d. The existing file installation loop iterates over this filtered set instead of all templates.

   e. When writing the manifest, include `selectedComponents: selectedNames` alongside the existing fields.

4. **Add the `select` command (`src/commands/select.js`)** — Register it in `bin/cli.js` with description "Change which optional components are installed". The command:

   a. Reads the manifest (error if not initialized).

   b. Fetches templates (needed to install newly selected components).

   c. Calls `getSelectedComponents(manifest)` to get the current selection.

   d. Presents `p.groupMultiselect()` with current selection as initial values.

   e. Computes additions (newly selected) and removals (newly deselected).

   f. For each addition: install files from `getComponentFiles(templates, name)`, following the same overwrite/skip/diff logic as `init` for files that already exist on disk. Add files to the manifest.

   g. For each removal: for each file in `getComponentFiles(templates, name)`, check if locally modified via `isLocallyModified()`. If modified, warn with `p.confirm()` before deleting. If unmodified, delete directly. Remove files from the manifest. After deleting files, attempt to remove empty parent directories (clean up empty skill directories).

   h. Update the manifest's `selectedComponents` and `updatedAt`.

   i. Print a summary of changes (added/removed counts).

   Write tests for the addition and removal flows, including the locally-modified warning path.

5. **Modify `update` to detect and nudge for new optional components** — In `src/commands/update.js`, after categorizing files into `newFiles`/`changedFiles`/`unchangedFiles`/`removedFiles`:

   a. Import `getComponentForFile` and `getSelectedComponents` from `components.js`.

   b. Filter `newFiles` to exclude files belonging to optional components that are not in the current selection. These are files the user hasn't opted into — they should not be auto-installed.

   c. Collect the names of unselected optional components whose files appear in the templates but not in the manifest (i.e., new upstream components the user hasn't seen yet). If any exist, log a nudge after the update summary: `"N new optional component(s) available. Run \`praxis select\` to review."` with `p.log.info()`.

   d. Write tests: an update with a new optional component that's not selected should not install it, and should log the nudge message.

6. **Update `status` to show component information** — In `src/commands/status.js`, after displaying the file list:

   a. Import `getSelectedComponents` and `getOptionalComponents` from `components.js`.

   b. Display the count of selected optional components vs total optional components, e.g. `"Components: 5 of 11 optional components selected"`.

   c. No need to list individual components — `praxis select` is the UI for that.

7. **End-to-end verification** — Run the full test suite. Manually verify `praxis init` in a temp directory shows the grouped checklist, `praxis select` lets you toggle components, and `praxis update` nudges for new upstream components when selection doesn't include them.

## Acceptance Criteria

- [ ] `praxis init` presents a grouped multi-select of optional components (skills, reviewers) after fetching templates, with all pre-selected by default.
- [ ] Only core files and files belonging to selected optional components are installed during `init`.
- [ ] The manifest includes a `selectedComponents` array after `init`.
- [ ] Existing manifests without `selectedComponents` are treated as "all selected" — backward compatible.
- [ ] `praxis select` shows the current selection, allows toggling, installs newly selected component files, and removes deselected component files.
- [ ] Removing a locally modified component file warns and asks for confirmation.
- [ ] `praxis update` does not auto-install files for unselected optional components.
- [ ] `praxis update` logs a nudge when new optional components are available upstream that the user hasn't selected.
- [ ] `praxis status` shows the count of selected vs total optional components.
- [ ] All new functionality has tests.
- [ ] Component names cannot cause path traversal (validated by the convention-based path derivation in `getComponentForFile`).

## Dependencies

None — builds on the existing v1 CLI shipped via the npm-cli-distribution idea.

## Related Documents

- .ai-workflow/ideas/20260227-selective-component-installation.md
- .ai-workflow/ideas/20260223-npm-cli-distribution.md
