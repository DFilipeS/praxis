import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { isDestinationModified, readManifest, writeManifest } from "../manifest.js";
import {
  collectMcpConfig,
  getAdapter,
  listAdapters,
  writeMcpConfigFile,
} from "../adapters.js";
import { installToDestinations, isSafePath } from "../files.js";
import { fetchTemplates } from "../templates.js";

/**
 * Writes MCP config for a single tool adapter.
 * Returns the number of files written.
 */
async function writeToolMcpConfig(projectRoot, resolvedRoot, adapter, mcpConfig) {
  const result = adapter.generateMcpConfig(mcpConfig);
  if (!result) return 0;

  const fullPath = resolve(projectRoot, result.path);
  /* v8 ignore next */
  if (!isSafePath(resolvedRoot, fullPath)) return 0;

  await writeMcpConfigFile(fullPath, result);
  p.log.success(`${pc.green("written")} ${result.path}`);
  return 1;
}

/**
 * Removes MCP config file for a single tool adapter.
 * Returns the number of files removed.
 */
async function removeToolMcpConfig(projectRoot, resolvedRoot, adapter, mcpConfig) {
  const result = adapter.generateMcpConfig(mcpConfig);
  if (!result) return 0;

  const fullPath = resolve(projectRoot, result.path);
  /* v8 ignore next */
  if (!isSafePath(resolvedRoot, fullPath)) return 0;

  try {
    await lstat(fullPath);
  } catch {
    return 0;
  }

  if (result.mergeKey) {
    try {
      const existing = JSON.parse(await readFile(fullPath, "utf-8"));
      delete existing[result.mergeKey];

      if (Object.keys(existing).length === 0) {
        await rm(fullPath);
      } else {
        await writeFile(
          fullPath,
          JSON.stringify(existing, null, 2) + "\n"
        );
      }
    } catch {
      await rm(fullPath);
    }
  } else {
    await rm(fullPath);
  }

  p.log.success(`${pc.red("removed")} ${result.path}`);

  const dir = dirname(fullPath);
  if (dir.length > resolvedRoot.length) {
    try {
      await rmdir(dir);
    } catch {
      // Not empty or already gone
    }
  }

  return 1;
}

export async function toolAdd(names, { ref = "main" } = {}) {
  const projectRoot = process.cwd();
  const resolvedRoot = resolve(projectRoot);

  p.intro(pc.bold("Praxis — Tool Add"));

  const manifest = await readManifest(projectRoot);
  if (!manifest) {
    p.log.error(
      'Praxis is not initialized in this project. Run "praxis init" first.'
    );
    process.exit(1);
  }

  const allAdapters = listAdapters();
  const enabledTools = new Set(manifest.enabledTools);

  let selectedNames;

  if (names.length === 0) {
    const options = allAdapters.map((a) => ({
      value: a.name,
      label: a.displayName,
    }));

    const selected = await p.multiselect({
      message: "Select tools to configure:",
      options,
      initialValues: [...enabledTools],
      required: false,
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    selectedNames = selected;
  } else {
    const validNames = new Set(allAdapters.map((a) => a.name));
    for (const name of names) {
      if (!validNames.has(name)) {
        p.log.error(
          `Unknown tool "${name}". Available: ${[...validNames].join(", ")}`
        );
        process.exit(1);
      }
    }
    selectedNames = names;
  }

  if (selectedNames.length === 0) {
    p.outro("No tools selected.");
    return;
  }

  // Fetch templates to get file contents for installation
  const s = p.spinner();
  s.start("Fetching templates from GitHub");

  let templates;
  try {
    templates = await fetchTemplates({ ref });
  } catch (err) {
    s.stop("Failed to fetch templates");
    p.log.error(err.message);
    process.exit(1);
  }

  s.stop(`Fetched ${templates.size} template files`);

  // Install files to the new tool destinations
  const updatedManifestFiles = { ...manifest.files };
  let filesInstalled = 0;

  // Only install to the newly added tools, not all enabled tools
  const newTools = selectedNames.filter((n) => !manifest.enabledTools?.includes(n));

  for (const [sourcePath, entry] of Object.entries(manifest.files)) {
    const content = templates.get(sourcePath);
    if (!content) continue;

    const toolsToInstall = newTools.length > 0 ? newTools : selectedNames;
    const existingDestinations = entry.destinations || {};
    const newDestinations = { ...existingDestinations };

    for (const toolName of toolsToInstall) {
      const adapter = getAdapter(toolName);
      /* v8 ignore next */
      if (!adapter) continue;

      const destPath = adapter.getDestinationPath(sourcePath);
      /* v8 ignore next */
      if (!destPath) continue;

      const fullPath = resolve(projectRoot, destPath);
      /* v8 ignore next */
      if (!isSafePath(resolvedRoot, fullPath)) continue;

      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
      newDestinations[toolName] = destPath;
      filesInstalled++;
    }

    updatedManifestFiles[sourcePath] = { ...entry, destinations: newDestinations };
  }

  // Update manifest with new enabled tools and updated destinations
  for (const name of selectedNames) {
    enabledTools.add(name);
  }

  const updatedManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    enabledTools: [...enabledTools],
    files: updatedManifestFiles,
  };
  await writeManifest(projectRoot, updatedManifest);

  // Write MCP configs
  const mcpConfig = await collectMcpConfig(projectRoot, updatedManifest);
  let mcpWritten = 0;

  for (const name of selectedNames) {
    const adapter = getAdapter(name);
    /* v8 ignore next */
    if (!adapter) continue;
    const written = await writeToolMcpConfig(projectRoot, resolvedRoot, adapter, mcpConfig);
    mcpWritten += written;
  }

  const totalWritten = filesInstalled + mcpWritten;
  p.outro(
    `Done! ${pc.green(totalWritten)} file(s) written for ${selectedNames.join(", ")}.`
  );
}

export async function toolRemove(names) {
  const projectRoot = process.cwd();
  const resolvedRoot = resolve(projectRoot);

  p.intro(pc.bold("Praxis — Tool Remove"));

  const manifest = await readManifest(projectRoot);
  if (!manifest) {
    p.log.error(
      'Praxis is not initialized in this project. Run "praxis init" first.'
    );
    process.exit(1);
  }

  const enabledTools = new Set(manifest.enabledTools);

  if (names.length === 0) {
    p.log.error("Please specify one or more tool names to remove.");
    process.exit(1);
  }

  const validNames = new Set(listAdapters().map((a) => a.name));
  for (const name of names) {
    if (!validNames.has(name)) {
      p.log.error(
        `Unknown tool "${name}". Available: ${[...validNames].join(", ")}`
      );
      process.exit(1);
    }
  }

  const updatedManifestFiles = { ...manifest.files };
  let totalRemoved = 0;
  let totalSkipped = 0;
  const removedDirs = new Set();

  // Remove Praxis-managed files from the tool's directories
  for (const name of names) {
    const adapter = getAdapter(name);
    /* v8 ignore next */
    if (!adapter) continue;

    for (const [sourcePath, entry] of Object.entries(manifest.files)) {
      if (!entry.destinations || !entry.destinations[name]) continue;

      const destPath = entry.destinations[name];
      const fullDest = resolve(projectRoot, destPath);
      /* v8 ignore next */
      if (!isSafePath(resolvedRoot, fullDest)) continue;

      if (!existsSync(fullDest)) {
        // File already gone — just clean up manifest
        const newDests = { ...entry.destinations };
        delete newDests[name];
        updatedManifestFiles[sourcePath] = { ...entry, destinations: newDests };
        continue;
      }

      const modified = await isDestinationModified(projectRoot, destPath, entry.hash);

      if (modified) {
        p.log.warn(`${pc.dim("skipped")} ${destPath} ${pc.yellow("(locally modified)")}`);
        totalSkipped++;
        continue;
      }

      await rm(fullDest);
      totalRemoved++;
      p.log.success(`${pc.red("removed")} ${destPath}`);

      // Track dirs for cleanup
      let dir = dirname(fullDest);
      while (dir.length > resolvedRoot.length) {
        removedDirs.add(dir);
        dir = dirname(dir);
      }

      // Update manifest destinations
      const newDests = { ...entry.destinations };
      delete newDests[name];
      updatedManifestFiles[sourcePath] = { ...entry, destinations: newDests };
    }
  }

  // Clean up empty directories (deepest first)
  for (const dir of [...removedDirs].sort((a, b) => b.length - a.length)) {
    try {
      await rmdir(dir);
    } catch {
      // Not empty or already gone
    }
  }

  // Remove MCP configs
  const mcpConfig = await collectMcpConfig(projectRoot, manifest);
  for (const name of names) {
    const adapter = getAdapter(name);
    /* v8 ignore next */
    if (!adapter) continue;
    await removeToolMcpConfig(projectRoot, resolvedRoot, adapter, mcpConfig);
  }

  // Update manifest: remove tool from enabledTools, update file destinations
  for (const name of names) {
    enabledTools.delete(name);
  }
  await writeManifest(projectRoot, {
    ...manifest,
    updatedAt: new Date().toISOString(),
    enabledTools: [...enabledTools],
    files: updatedManifestFiles,
  });

  const parts = [];
  if (totalRemoved > 0) parts.push(`${pc.red(totalRemoved)} removed`);
  if (totalSkipped > 0) parts.push(`${pc.yellow(totalSkipped)} skipped`);

  p.outro(
    `Done! ${parts.length > 0 ? parts.join(", ") : "0 file(s) removed"} for ${names.join(", ")}.`
  );
}

export async function toolList() {
  const projectRoot = process.cwd();

  p.intro(pc.bold("Praxis — Tool List"));

  const manifest = await readManifest(projectRoot);
  if (!manifest) {
    p.log.error(
      'Praxis is not initialized in this project. Run "praxis init" first.'
    );
    process.exit(1);
  }

  const enabledTools = new Set(manifest.enabledTools);
  const allAdapters = listAdapters();

  for (const adapter of allAdapters) {
    const status = enabledTools.has(adapter.name)
      ? pc.green("enabled")
      : pc.dim("disabled");
    p.log.message(`${adapter.displayName} (${adapter.name}) — ${status}`);
  }

  p.outro(`${allAdapters.length} tool adapter(s) available.`);
}
