import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as p from "@clack/prompts";
import { createPatch } from "diff";
import pc from "picocolors";
import { fetchTemplates } from "../templates.js";
import {
  hashContent,
  isLocallyModified,
  readManifest,
  writeManifest,
} from "../manifest.js";
import { getComponentForFile, getSelectedComponents } from "../components.js";
import { installFile, isSafePath } from "../files.js";

export async function update() {
  const projectRoot = process.cwd();
  const resolvedRoot = resolve(projectRoot);

  p.intro(pc.bold("Praxis — Update"));

  const manifest = await readManifest(projectRoot);
  if (!manifest) {
    p.log.error(
      'Praxis is not initialized in this project. Run "praxis init" first.'
    );
    process.exit(1);
  }

  const s = p.spinner();
  s.start("Fetching latest templates from GitHub");

  let templates;
  try {
    templates = await fetchTemplates();
  } catch (err) {
    s.stop("Failed to fetch templates");
    p.log.error(err.message);
    process.exit(1);
  }

  s.stop(`Fetched ${templates.size} template files`);

  const newFiles = [];
  const removedFiles = [];
  const changedFiles = [];
  const unchangedFiles = [];

  const currentSelection = getSelectedComponents(manifest, templates);
  const selectedSkillNames = new Set(currentSelection.skills);
  const selectedReviewerNames = new Set(currentSelection.reviewers);

  // Track new upstream optional components the user hasn't opted into
  const newUnselectedComponents = new Set();

  // Categorize files
  for (const [relativePath, content] of templates) {
    const newHash = hashContent(content);
    const entry = manifest.files[relativePath];

    if (!entry) {
      // New upstream file — check if it belongs to an unselected optional component
      const component = getComponentForFile(relativePath);
      if (component) {
        const isSelected =
          component.type === "skill"
            ? selectedSkillNames.has(component.name)
            : selectedReviewerNames.has(component.name);

        if (!isSelected) {
          // Don't auto-install — just record that a new optional component exists
          newUnselectedComponents.add(component.name);
          continue;
        }
      }

      newFiles.push({ relativePath, content, hash: newHash });
    } else if (entry.hash !== newHash) {
      // Skip changed files for deselected optional components
      const component = getComponentForFile(relativePath);
      if (component) {
        const isSelected =
          component.type === "skill"
            ? selectedSkillNames.has(component.name)
            : selectedReviewerNames.has(component.name);
        if (!isSelected) continue;
      }
      changedFiles.push({ relativePath, content, hash: newHash });
    } else {
      unchangedFiles.push(relativePath);
    }
  }

  for (const relativePath of Object.keys(manifest.files)) {
    if (!templates.has(relativePath)) {
      removedFiles.push(relativePath);
    }
  }

  if (
    newFiles.length === 0 &&
    changedFiles.length === 0 &&
    removedFiles.length === 0
  ) {
    if (newUnselectedComponents.size > 0) {
      p.log.info(
        `${newUnselectedComponents.size} new optional component(s) available. Run \`praxis components\` to review.`
      );
    }
    p.outro("Everything is up to date!");
    return;
  }

  // Summary of what will happen
  if (newFiles.length > 0) {
    p.log.info(`${pc.green(newFiles.length)} new file(s) to add`);
  }
  if (changedFiles.length > 0) {
    p.log.info(`${pc.yellow(changedFiles.length)} file(s) changed in Praxis`);
  }
  if (removedFiles.length > 0) {
    p.log.info(
      `${pc.red(removedFiles.length)} file(s) removed from Praxis`
    );
  }

  const updatedManifestFiles = { ...manifest.files };
  let added = 0;
  let updated = 0;
  let removed = 0;
  let skipped = 0;

  // Handle new files
  for (const { relativePath, content } of newFiles) {
    const fullPath = resolve(projectRoot, relativePath);
    if (!isSafePath(resolvedRoot, fullPath)) {
      continue;
    }

    await mkdir(dirname(fullPath), { recursive: true });
    const { status, hash } = await installFile(fullPath, relativePath, content);
    if (status === "cancelled") {
      p.cancel("Cancelled.");
      process.exit(0);
    }
    updatedManifestFiles[relativePath] = { hash };
    if (status === "written") {
      added++;
      p.log.success(`${pc.green("added")} ${relativePath}`);
    } else if (status === "skipped") {
      skipped++;
      p.log.warn(`${pc.dim("skipped")} ${relativePath}`);
    }
  }

  // Handle changed files
  for (const { relativePath, content, hash } of changedFiles) {
    const fullPath = resolve(projectRoot, relativePath);
    if (!isSafePath(resolvedRoot, fullPath)) {
      continue;
    }

    const locallyModified = existsSync(fullPath)
      ? await isLocallyModified(projectRoot, relativePath, manifest)
      : false;

    if (!locallyModified) {
      await writeFile(fullPath, content);
      updatedManifestFiles[relativePath] = { hash };
      updated++;
      p.log.success(`${pc.yellow("updated")} ${relativePath}`);
    } else {
      const localContent = await readFile(fullPath, "utf-8");
      let action = await p.select({
        message: `${relativePath} has local changes and a new Praxis version. What would you like to do?`,
        options: [
          { value: "overwrite", label: "Overwrite with new Praxis version" },
          { value: "skip", label: "Keep your version" },
          { value: "diff", label: "Show diff, then decide" },
        ],
      });

      if (p.isCancel(action)) {
        p.cancel("Cancelled.");
        process.exit(0);
      }

      if (action === "diff") {
        const patch = createPatch(
          relativePath,
          localContent,
          content,
          "your version",
          "new praxis version"
        );
        p.log.info(patch);

        action = await p.select({
          message: `Overwrite ${relativePath}?`,
          options: [
            {
              value: "overwrite",
              label: "Overwrite with new Praxis version",
            },
            { value: "skip", label: "Keep your version" },
          ],
        });

        if (p.isCancel(action)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
      }

      if (action === "overwrite") {
        await writeFile(fullPath, content);
        updatedManifestFiles[relativePath] = { hash };
        updated++;
        p.log.success(`${pc.yellow("updated")} ${relativePath}`);
      } else {
        skipped++;
        p.log.warn(`${pc.dim("skipped")} ${relativePath}`);
      }
    }
  }

  // Handle removed files
  for (const relativePath of removedFiles) {
    const fullPath = resolve(projectRoot, relativePath);
    if (!isSafePath(resolvedRoot, fullPath)) {
      continue;
    }

    if (!existsSync(fullPath)) {
      delete updatedManifestFiles[relativePath];
      removed++;
      continue;
    }

    const locallyModified = await isLocallyModified(projectRoot, relativePath, manifest);

    const warning = locallyModified
      ? ` ${pc.yellow("(locally modified)")}`
      : "";

    const shouldRemove = await p.confirm({
      message: `${relativePath} was removed from Praxis.${warning} Delete it?`,
    });

    if (p.isCancel(shouldRemove)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    if (shouldRemove) {
      await rm(fullPath);
      delete updatedManifestFiles[relativePath];
      removed++;
      p.log.success(`${pc.red("removed")} ${relativePath}`);
    } else {
      skipped++;
      p.log.warn(`${pc.dim("skipped")} ${relativePath}`);
    }
  }

  // Write manifest whenever files changed, or when new upstream files existed (even if skipped —
  // their current hashes need recording), or to migrate manifests that predate selectedComponents.
  const needsWrite =
    added > 0 || updated > 0 || removed > 0 || newFiles.length > 0 || !manifest.selectedComponents;
  if (needsWrite) {
    await writeManifest(projectRoot, {
      ...manifest,
      updatedAt: new Date().toISOString(),
      selectedComponents: currentSelection,
      files: updatedManifestFiles,
    });
  }

  const parts = [];
  if (added > 0) parts.push(`${pc.green(added)} added`);
  if (updated > 0) parts.push(`${pc.yellow(updated)} updated`);
  if (removed > 0) parts.push(`${pc.red(removed)} removed`);
  if (skipped > 0) parts.push(`${pc.dim(skipped)} skipped`);

  if (newUnselectedComponents.size > 0) {
    p.log.info(
      `${newUnselectedComponents.size} new optional component(s) available. Run \`praxis components\` to review.`
    );
  }

  p.outro(`Update complete! ${parts.join(", ")}.`);
}
