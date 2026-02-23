---
title: NPM CLI for Praxis Distribution
date: 2026-02-23
status: in-progress
ideas:
  - .ai-workflow/ideas/20260223-npm-cli-distribution.md
group: npm-cli-distribution
phase: 1
tags: [cli, distribution, npm, developer-experience, tooling]
---

# NPM CLI for Praxis Distribution

## Goal

Publish Praxis as a scoped npm package (`@DFilipeS/praxis`) with a CLI that installs, updates, and reports on Praxis files in any project's `.agents/` directory. After this plan is executed, any developer can run `npx @DFilipeS/praxis init` to get a working Praxis setup and `npx @DFilipeS/praxis update` to pull the latest changes from the Praxis repo's main branch.

## Background

Praxis currently has no good distribution story. Copying `.agents/` into a project loses the ability to pull updates. Git submodule + symlink takes over the entire `.agents/` directory and breaks on Windows. See `.ai-workflow/ideas/20260223-npm-cli-distribution.md` for full context.

## Research Summary

- **21 Markdown files** in `.agents/` need to be distributed. All are plain Markdown with YAML frontmatter — no build step needed.
- **No existing `package.json` or CLI tooling** in the repo — this is greenfield.
- **No prior learnings** — first development cycle for Praxis.
- **CLI best practices**: `commander` for argument parsing, `@clack/prompts` for interactive UX, `diff` (jsdiff) for showing file diffs, `picocolors` for terminal colors. Use ESM (`"type": "module"`).
- **Template fetching**: Use the GitHub API to download a tarball of the main branch and extract only the `.agents/` directory. This decouples template updates from npm releases.
- **Manifest pattern**: JSON file with SHA-256 hashes per file enables modification detection. Use built-in `node:crypto` for hashing.
- **npx compatibility**: Requires shebang (`#!/usr/bin/env node`), `bin` field in `package.json`, and `chmod +x` on the entry point.

## Steps

### 1. Initialize the npm package

Create `package.json` at the repo root with:
- `"name": "@DFilipeS/praxis"`
- `"type": "module"` (ESM)
- `"bin": { "praxis": "./bin/cli.js" }`
- `"files": ["bin/", "src/"]` — no `templates/` directory since templates are fetched from GitHub
- `"engines": { "node": ">=18" }`
- Dependencies: `commander`, `@clack/prompts`, `diff`, `picocolors`
- No devDependencies needed for v1

Create a `.gitignore` with `node_modules/`.

### 2. Create the CLI entry point

Create `bin/cli.js` with:
- Shebang line `#!/usr/bin/env node`
- Import and configure `commander` with three subcommands: `init`, `update`, `status`
- Set the program name to `praxis` and version from `package.json`
- Each subcommand delegates to its handler module in `src/commands/`

### 3. Build the template fetching module

Create `src/templates.js` that:
- Downloads the tarball of the Praxis repo's main branch from GitHub (`https://api.github.com/repos/DFilipeS/praxis/tarball/main`)
- Extracts only the `.agents/` directory from the tarball into a temporary directory
- Returns a map of relative file paths to their contents (e.g., `{ ".agents/conventions.md": "<content>", ... }`)
- Uses built-in `node:https`, `node:zlib`, and `node:fs` — plus `tar` (npm package) for extraction, or Node's built-in tar support if available
- Handles errors gracefully: network failures, GitHub rate limiting, missing repo

Evaluate whether `tar` (npm package) is needed or if a lighter approach works. The GitHub tarball is a `.tar.gz` — Node can decompress with `node:zlib` (gunzip) but needs a tar parser. Options:
- Use the `tar` npm package (well-maintained, standard)
- Use the GitHub Trees API + raw content endpoints instead of a tarball (avoids tar parsing but requires multiple HTTP requests)

Prefer the tarball approach with the `tar` package for simplicity — one HTTP request gets everything.

### 4. Build the manifest module

Create `src/manifest.js` that manages `.praxis-manifest.json` in the project root:

**Manifest schema:**
```json
{
  "version": "1.0.0",
  "installedAt": "2026-02-23T12:00:00Z",
  "updatedAt": "2026-02-23T12:00:00Z",
  "files": {
    ".agents/conventions.md": {
      "hash": "sha256-hex-of-file-content"
    }
  }
}
```

- `hash`: SHA-256 of the file content at the time it was installed or last updated. Used to detect if the user has locally modified the file — if the current file on disk hashes differently, it's been modified.

Functions to implement:
- `readManifest(projectRoot)` — reads and parses `.praxis-manifest.json`, returns `null` if not found
- `writeManifest(projectRoot, manifest)` — writes the manifest to disk
- `hashContent(content)` — SHA-256 hex hash of a string/buffer using `node:crypto`
- `hashFile(filePath)` — reads a file and returns its SHA-256 hash
- `isLocallyModified(filePath, manifest)` — compares current file hash against stored `hash`

### 5. Implement the `init` command

Create `src/commands/init.js`:

1. Check if `.praxis-manifest.json` exists in the current working directory.
   - If it exists: display a message saying Praxis is already initialized, then fall back to running the `update` command instead.
2. Fetch templates from GitHub (using the template fetching module).
3. Create the `.agents/` directory structure if it doesn't exist.
4. Write each template file to disk. If a file already exists (e.g., the project has its own `.agents/conventions.md`), prompt the user: overwrite, skip, or show diff.
5. Create the `.ai-workflow/` directory structure (`ideas/`, `plans/`, `learnings/`) if it doesn't exist. These directories are created but not tracked in the manifest — they hold project-specific content.
6. Create the `.ai-workflow/tags` file if it doesn't exist (empty file or with default tags).
7. Write the manifest with all installed files and their hashes.
8. Display a success summary showing how many files were installed.

Use `@clack/prompts` for all interactive output (intro, outro, confirm prompts, spinners for the GitHub fetch).

### 6. Implement the `update` command

Create `src/commands/update.js`:

1. Read the existing manifest. If not found, error with a message to run `init` first.
2. Fetch the latest templates from GitHub.
3. Compare fetched files against the manifest to categorize each file:
   - **New files**: present in fetched templates but not in manifest → will be added
   - **Removed files**: present in manifest but not in fetched templates → will be removed
   - **Changed files**: present in both, but stored `hash` differs from the new file's hash → Praxis updated this file
   - **Unchanged files**: present in both, hashes match → skip
4. For changed files, check if the local file has been modified by the user (`currentHash !== hash`):
   - **Not locally modified**: update silently
   - **Locally modified (conflict)**: show a unified diff (using `diff` library) between the user's version and the new Praxis version. Prompt the user: overwrite with new version, skip this file, or show diff again.
5. For removed files, prompt the user before deleting. If locally modified, warn explicitly.
6. Apply all changes (write new/updated files, delete removed files).
7. Update the manifest with new file list and hashes.
8. Display a summary: files added, updated, removed, skipped.

### 7. Implement the `status` command

Create `src/commands/status.js`:

1. Read the manifest. If not found, display "Praxis is not installed" and exit.
2. For each file in the manifest:
   - Check if the file exists on disk
   - If it exists, compare its current hash against `installedHash` to detect local modifications
3. Display a summary:
   - Praxis version installed and installation date
   - List of files with their status: ✓ (unchanged), ✎ (locally modified), ✗ (missing/deleted)
   - Total counts

### 8. Add a README section about the CLI

Update the existing `README.md` to replace or supplement the current installation instructions with the `npx` approach:
- `npx @DFilipeS/praxis init` to install
- `npx @DFilipeS/praxis update` to update
- `npx @DFilipeS/praxis status` to check status
- Mention that the manifest file (`.praxis-manifest.json`) should be committed to version control
- Keep the manual copy method as an alternative for those who don't use Node.js

## Acceptance Criteria

- [ ] `npx @DFilipeS/praxis init` in a fresh project creates `.agents/` with all 21 template files, creates `.ai-workflow/` directories, and writes `.praxis-manifest.json` at the project root
- [ ] Running `init` when already initialized displays a message and falls back to `update`
- [ ] `npx @DFilipeS/praxis update` fetches latest files from the Praxis repo's main branch and applies changes
- [ ] `update` detects locally modified files and prompts the user before overwriting, showing a unified diff
- [ ] `update` handles new files (added in Praxis since last install) and removed files (deleted in Praxis since last install)
- [ ] `npx @DFilipeS/praxis status` shows the state of all managed files (unchanged, modified, missing)
- [ ] The manifest tracks a SHA-256 hash per managed file for modification detection
- [ ] The CLI works via `npx` with no prior installation
- [ ] `AGENTS.md` is never created or managed by the CLI
- [ ] `.ai-workflow/` directories are created but not tracked in the manifest
- [ ] Existing project files in `.agents/` that aren't managed by Praxis are left untouched
- [ ] The README documents the CLI usage

## Dependencies

- A GitHub repository at `DFilipeS/praxis` with the `.agents/` directory on the `main` branch (already exists)
- An npm account with access to publish `@DFilipeS/praxis`

## Related Documents

- .ai-workflow/ideas/20260223-npm-cli-distribution.md
