import { existsSync } from "node:fs";
import { mkdir, rm, rmdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { fetchTemplates } from "../templates.js";
import { isDestinationModified, isLocallyModified, readManifest, writeManifest } from "../manifest.js";
import {
  discoverOptionalComponents,
  encodeComponentValue,
  getComponentFiles,
  getSelectedComponents,
  buildGroupOptions,
  decodeComponentValue,
} from "../components.js";
import { installFile, installToDestinations, isSafePath } from "../files.js";
import { regenerateToolConfigs } from "../adapters.js";

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
    ...currentSelection.skills.map((n) => encodeComponentValue("skill", n)),
    ...currentSelection.reviewers.map((n) => encodeComponentValue("reviewer", n)),
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

  const enabledTools = manifest.enabledTools || [];

  try {
    // Handle additions
    for (const value of additions) {
      const { name, type } = decodeComponentValue(value);
      const componentFiles = getComponentFiles(templates, name, type);

      for (const [relativePath, content] of componentFiles) {
        if (enabledTools.length > 0) {
          const { hash, destinations } = await installToDestinations(
            projectRoot,
            resolvedRoot,
            relativePath,
            content,
            enabledTools
          );
          updatedManifestFiles[relativePath] = { hash, destinations };
          filesAdded++;
          p.log.success(`${pc.green("added")} ${relativePath}`);
        } else {
          const fullPath = resolve(projectRoot, relativePath);
          if (!isSafePath(resolvedRoot, fullPath)) {
            continue;
          }

          await mkdir(dirname(fullPath), { recursive: true });

          const { status, hash } = await installFile(fullPath, relativePath, content);
          if (status === "cancelled") {
            await writeManifest(projectRoot, {
              ...manifest,
              updatedAt: new Date().toISOString(),
              selectedComponents: newSelection,
              files: updatedManifestFiles,
            }).catch(() => {});
            p.cancel("Cancelled.");
            process.exit(0);
          }
          updatedManifestFiles[relativePath] = { hash };
          if (status === "written") {
            filesAdded++;
            p.log.success(`${pc.green("added")} ${relativePath}`);
          }
        }
      }
    }

    // Handle removals
    for (const value of removals) {
      const { name, type } = decodeComponentValue(value);
      const componentFiles = getComponentFiles(templates, name, type);
      const removedDirs = new Set();

      for (const [relativePath] of componentFiles) {
        const entry = manifest.files[relativePath];

        if (enabledTools.length > 0 && entry?.destinations) {
          // Remove from all tool destinations
          let anyRemoved = false;

          for (const [toolName, destPath] of Object.entries(entry.destinations)) {
            const fullDest = resolve(projectRoot, destPath);
            /* v8 ignore next */
            if (!isSafePath(resolvedRoot, fullDest)) continue;

            if (!existsSync(fullDest)) {
              anyRemoved = true;
              continue;
            }

            const modified = await isDestinationModified(projectRoot, destPath, entry.hash);

            if (modified) {
              const shouldRemove = await p.confirm({
                message: `${destPath} has local modifications. Remove it anyway?`,
              });

              if (p.isCancel(shouldRemove)) {
                await writeManifest(projectRoot, {
                  ...manifest,
                  updatedAt: new Date().toISOString(),
                  selectedComponents: newSelection,
                  files: updatedManifestFiles,
                }).catch(() => {});
                p.cancel("Cancelled.");
                process.exit(0);
              }

              if (!shouldRemove) {
                p.log.warn(`${pc.dim("kept")} ${destPath}`);
                continue;
              }
            }

            await rm(fullDest);
            anyRemoved = true;
            p.log.success(`${pc.red("removed")} ${destPath}`);

            let dir = dirname(fullDest);
            while (dir.length > resolvedRoot.length) {
              removedDirs.add(dir);
              dir = dirname(dir);
            }
          }

          if (anyRemoved) {
            delete updatedManifestFiles[relativePath];
            filesRemoved++;
          }
        } else {
          const fullPath = resolve(projectRoot, relativePath);
          if (!isSafePath(resolvedRoot, fullPath)) {
            continue;
          }

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
              await writeManifest(projectRoot, {
                ...manifest,
                updatedAt: new Date().toISOString(),
                selectedComponents: newSelection,
                files: updatedManifestFiles,
              }).catch(() => {});
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
          let dir = dirname(fullPath);
          while (dir.length > resolvedRoot.length) {
            removedDirs.add(dir);
            dir = dirname(dir);
          }
        }
      }

      // Remove empty parent directories
      for (const dir of [...removedDirs].sort((a, b) => b.length - a.length)) {
        try {
          await rmdir(dir);
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
    }).catch((e) => p.log.warn(`Could not save partial state: ${e.message}`));
    throw err;
  }

  const updatedManifest = {
    ...manifest,
    updatedAt: new Date().toISOString(),
    selectedComponents: newSelection,
    files: updatedManifestFiles,
  };

  await writeManifest(projectRoot, updatedManifest);

  // Regenerate tool configs if any tools are enabled
  try {
    const regenerated = await regenerateToolConfigs(projectRoot, updatedManifest);
    if (regenerated.length > 0) {
      p.log.info(
        `Updated MCP config for ${regenerated.join(", ")}`
      );
    }
  } catch (e) {
    p.log.warn(`Could not regenerate tool configs: ${e.message}`);
  }

  const parts = [];
  if (filesAdded > 0) parts.push(`${pc.green(filesAdded)} file(s) added`);
  if (filesRemoved > 0) parts.push(`${pc.red(filesRemoved)} file(s) removed`);

  p.outro(parts.length > 0 ? `Done! ${parts.join(", ")}.` : "Done!");
}
