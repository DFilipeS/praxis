import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { fetchTemplates } from "../templates.js";
import { readManifest, writeManifest } from "../manifest.js";
import {
  discoverOptionalComponents,
  getCoreFiles,
  getComponentFiles,
  buildGroupOptions,
  decodeComponentValue,
} from "../components.js";
import { installFile, installToDestinations, isSafePath } from "../files.js";
import { listAdapters, regenerateToolConfigs } from "../adapters.js";

export async function init({ ref = "main" } = {}) {
  const projectRoot = process.cwd();
  const resolvedRoot = resolve(projectRoot);

  p.intro(pc.bold("Praxis — Initialize"));

  const existing = await readManifest(projectRoot);
  if (existing) {
    p.log.warn(
      "Praxis is already initialized in this project. Running update instead."
    );
    const { update } = await import("./update.js");
    return update({ ref });
  }

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

  // Present tool selection
  const allAdapters = listAdapters();
  const toolOptions = allAdapters.map((a) => ({
    value: a.name,
    label: a.displayName,
  }));

  const selectedTools = await p.multiselect({
    message: "Select tools to install for:",
    options: toolOptions,
    required: false,
  });

  if (p.isCancel(selectedTools)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const enabledTools = selectedTools;

  // Present optional component selection
  const optionalComponents = discoverOptionalComponents(templates);
  let selectedComponents = { skills: [], reviewers: [] };

  if (optionalComponents.length > 0) {
    const { groupOptions, allValues } = buildGroupOptions(optionalComponents);

    const selected = await p.groupMultiselect({
      message: "Select optional components to install:",
      options: groupOptions,
      initialValues: allValues,
      required: false,
    });

    if (p.isCancel(selected)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    for (const value of selected) {
      const { type, name } = decodeComponentValue(value);
      if (type === "skill") selectedComponents.skills.push(name);
      else selectedComponents.reviewers.push(name);
    }
  }

  // Build the set of files to install: core files + selected optional component files
  const filesToInstall = new Map(getCoreFiles(templates));
  const selectedComponentList = [
    ...selectedComponents.skills.map((name) => ({ type: "skill", name })),
    ...selectedComponents.reviewers.map((name) => ({ type: "reviewer", name })),
  ];
  for (const { type, name } of selectedComponentList) {
    for (const [path, content] of getComponentFiles(templates, name, type)) {
      filesToInstall.set(path, content);
    }
  }

  const manifestFiles = {};
  let installed = 0;
  let skipped = 0;

  for (const [relativePath, content] of [...filesToInstall.entries()].sort()) {
    // Install to each enabled tool's destination
    if (enabledTools.length > 0) {
      const { hash, destinations } = await installToDestinations(
        projectRoot,
        resolvedRoot,
        relativePath,
        content,
        enabledTools
      );
      manifestFiles[relativePath] = { hash, destinations };
      installed++;
    } else {
      // No tools enabled — just track the source hash
      const fullPath = resolve(projectRoot, relativePath);
      if (!isSafePath(resolvedRoot, fullPath)) continue;

      await mkdir(dirname(fullPath), { recursive: true });

      const { status, hash } = await installFile(fullPath, relativePath, content);
      if (status === "cancelled") {
        p.cancel("Cancelled.");
        process.exit(0);
      }
      manifestFiles[relativePath] = { hash };
      if (status === "skipped") skipped++;
      else installed++;
    }
  }

  // Create .ai-workflow directories (not tracked in manifest)
  for (const dir of [
    ".ai-workflow/ideas",
    ".ai-workflow/plans",
    ".ai-workflow/learnings",
  ]) {
    await mkdir(join(projectRoot, dir), { recursive: true });
  }

  const tagsPath = join(projectRoot, ".ai-workflow/tags");
  if (!existsSync(tagsPath)) {
    await writeFile(tagsPath, "");
  }

  const now = new Date().toISOString();
  const manifest = {
    version: "1.0.0",
    installedAt: now,
    updatedAt: now,
    enabledTools,
    selectedComponents,
    files: manifestFiles,
  };

  await writeManifest(projectRoot, manifest);

  // Generate MCP configs for enabled tools
  if (enabledTools.length > 0) {
    try {
      const regenerated = await regenerateToolConfigs(projectRoot, manifest);
      if (regenerated.length > 0) {
        p.log.info(
          `Generated MCP config for ${regenerated.join(", ")}`
        );
      }
    } catch (e) {
      p.log.warn(`Could not generate tool configs: ${e.message}`);
    }
  }

  const summary = [`${pc.green(installed)} files installed`];
  if (skipped > 0) summary.push(`${pc.yellow(skipped)} files skipped`);

  p.outro(`Praxis initialized! ${summary.join(", ")}.`);
}
