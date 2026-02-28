import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { fetchTemplates } from "../templates.js";
import { isLocallyModified, readManifest, writeManifest } from "../manifest.js";
import {
  discoverOptionalComponents,
  getComponentFiles,
  getSelectedComponents,
  buildGroupOptions,
  decodeComponentValue,
} from "../components.js";
import { installFile } from "../files.js";

export async function components() {
  const projectRoot = process.cwd();
  const resolvedRoot = resolve(projectRoot);

  p.intro(pc.bold("Praxis — Components"));

  const manifest = await readManifest(projectRoot);
  if (!manifest) {
    p.log.error(
      'Praxis is not initialized in this project. Run "praxis init" first.'
    );
    process.exit(1);
  }

  const s = p.spinner();
  s.start("Fetching templates from GitHub");

  let templates;
  try {
    templates = await fetchTemplates();
  } catch (err) {
    s.stop("Failed to fetch templates");
    p.log.error(err.message);
    process.exit(1);
  }

  s.stop(`Fetched ${templates.size} template files`);

  const optionalComponents = discoverOptionalComponents(templates);

  if (optionalComponents.length === 0) {
    p.outro("No optional components available.");
    return;
  }

  const currentSelection = getSelectedComponents(manifest, templates);
  const currentValues = new Set([
    ...currentSelection.skills.map((n) => `skill:${n}`),
    ...currentSelection.reviewers.map((n) => `reviewer:${n}`),
  ]);

  const { groupOptions, allValues } = buildGroupOptions(optionalComponents);
  const initialValues = allValues.filter((v) => currentValues.has(v));

  const selected = await p.groupMultiselect({
    message: "Select optional components to install:",
    options: groupOptions,
    initialValues,
    required: false,
  });

  if (p.isCancel(selected)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const newSelection = { skills: [], reviewers: [] };
  for (const value of selected) {
    const { type, name } = decodeComponentValue(value);
    if (type === "skill") newSelection.skills.push(name);
    else newSelection.reviewers.push(name);
  }

  // Compute additions and removals
  const newSet = new Set(selected);
  const additions = allValues.filter((v) => newSet.has(v) && !currentValues.has(v));
  const removals = allValues.filter((v) => !newSet.has(v) && currentValues.has(v));

  if (additions.length === 0 && removals.length === 0) {
    p.log.info("No changes to component selection.");
    p.outro("Done.");
    return;
  }

  const updatedManifestFiles = { ...manifest.files };
  let filesAdded = 0;
  let filesRemoved = 0;

  try {
    // Handle additions
    for (const value of additions) {
      const { name } = decodeComponentValue(value);
      const componentFiles = getComponentFiles(templates, name);

      for (const [relativePath, content] of componentFiles) {
        const resolvedPath = resolve(projectRoot, relativePath);
        if (!resolvedPath.startsWith(resolvedRoot + sep)) {
          continue;
        }

        const fullPath = join(projectRoot, relativePath);
        await mkdir(dirname(fullPath), { recursive: true });

        const { status, hash } = await installFile(fullPath, relativePath, content);
        updatedManifestFiles[relativePath] = { hash };
        if (status === "written") {
          filesAdded++;
          p.log.success(`${pc.green("added")} ${relativePath}`);
        }
      }
    }

    // Handle removals
    for (const value of removals) {
      const { name } = decodeComponentValue(value);
      const componentFiles = getComponentFiles(templates, name);

      for (const [relativePath] of componentFiles) {
        const resolvedPath = resolve(projectRoot, relativePath);
        if (!resolvedPath.startsWith(resolvedRoot + sep)) {
          continue;
        }

        const fullPath = join(projectRoot, relativePath);

        if (!existsSync(fullPath)) {
          delete updatedManifestFiles[relativePath];
          continue;
        }

        const locallyModified = await isLocallyModified(
          projectRoot,
          relativePath,
          manifest
        );

        if (locallyModified) {
          const shouldRemove = await p.confirm({
            message: `${relativePath} has local modifications. Remove it anyway?`,
          });

          if (p.isCancel(shouldRemove)) {
            p.cancel("Cancelled.");
            process.exit(0);
          }

          if (!shouldRemove) {
            p.log.warn(`${pc.dim("kept")} ${relativePath}`);
            continue;
          }
        }

        await rm(fullPath);
        delete updatedManifestFiles[relativePath];
        filesRemoved++;
        p.log.success(`${pc.red("removed")} ${relativePath}`);
      }

      // Remove empty parent directories — reuse the already-fetched componentFiles
      const dirs = new Set(
        [...componentFiles.keys()].map((f) => dirname(join(projectRoot, f)))
      );
      for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
        if (!dir.startsWith(resolvedRoot + sep)) continue;
        try {
          await rm(dir, { recursive: false });
        } catch {
          // Directory not empty or already gone — ignore
        }
      }
    }
  } catch (err) {
    // On unexpected error, save partial state so the manifest stays consistent
    // with whatever filesystem changes already completed.
    await writeManifest(projectRoot, {
      ...manifest,
      updatedAt: new Date().toISOString(),
      selectedComponents: newSelection,
      files: updatedManifestFiles,
    }).catch(() => {});
    throw err;
  }

  await writeManifest(projectRoot, {
    ...manifest,
    updatedAt: new Date().toISOString(),
    selectedComponents: newSelection,
    files: updatedManifestFiles,
  });

  const parts = [];
  if (filesAdded > 0) parts.push(`${pc.green(filesAdded)} file(s) added`);
  if (filesRemoved > 0) parts.push(`${pc.red(filesRemoved)} file(s) removed`);

  p.outro(`Done! ${parts.join(", ")}.`);
}
