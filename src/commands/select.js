import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { createPatch } from "diff";
import pc from "picocolors";
import { fetchTemplates } from "../templates.js";
import { hashContent, isLocallyModified, readManifest, writeManifest } from "../manifest.js";
import {
  discoverOptionalComponents,
  getCoreFiles,
  getComponentFiles,
  getSelectedComponents,
} from "../components.js";

export async function select() {
  const projectRoot = process.cwd();

  p.intro(pc.bold("Praxis — Select Components"));

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

  const groupOptions = {};
  for (const { name, type, description } of optionalComponents) {
    const groupLabel = type === "skill" ? "Skills" : "Reviewers";
    if (!groupOptions[groupLabel]) groupOptions[groupLabel] = [];
    groupOptions[groupLabel].push({
      value: `${type}:${name}`,
      label: description,
    });
  }

  const allValues = optionalComponents.map((c) => `${c.type}:${c.name}`);
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
    const [type, name] = value.split(":");
    if (type === "skill") newSelection.skills.push(name);
    else if (type === "reviewer") newSelection.reviewers.push(name);
  }

  // Compute additions and removals
  const newSet = new Set(selected);
  const additions = allValues.filter(
    (v) => newSet.has(v) && !currentValues.has(v)
  );
  const removals = allValues.filter(
    (v) => !newSet.has(v) && currentValues.has(v)
  );

  if (additions.length === 0 && removals.length === 0) {
    p.log.info("No changes to component selection.");
    p.outro("Done.");
    return;
  }

  const updatedManifestFiles = { ...manifest.files };
  let added = 0;
  let removed = 0;

  // Handle additions
  for (const value of additions) {
    const [, name] = value.split(":");
    const componentFiles = getComponentFiles(templates, name);

    for (const [relativePath, content] of componentFiles) {
      const resolvedPath = resolve(projectRoot, relativePath);
      if (!resolvedPath.startsWith(resolve(projectRoot))) {
        continue;
      }

      const fullPath = join(projectRoot, relativePath);
      await mkdir(dirname(fullPath), { recursive: true });

      if (existsSync(fullPath)) {
        const existingContent = await readFile(fullPath, "utf-8");
        if (existingContent === content) {
          updatedManifestFiles[relativePath] = { hash: hashContent(content) };
          continue;
        }

        let action = await p.select({
          message: `${relativePath} already exists and differs. What would you like to do?`,
          options: [
            { value: "overwrite", label: "Overwrite with Praxis version" },
            { value: "skip", label: "Skip this file" },
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
            existingContent,
            content,
            "your version",
            "praxis"
          );
          p.log.info(patch);

          action = await p.select({
            message: `Overwrite ${relativePath}?`,
            options: [
              { value: "overwrite", label: "Overwrite with Praxis version" },
              { value: "skip", label: "Skip this file" },
            ],
          });

          if (p.isCancel(action)) {
            p.cancel("Cancelled.");
            process.exit(0);
          }
        }

        if (action === "skip") {
          updatedManifestFiles[relativePath] = {
            hash: hashContent(existingContent),
          };
          continue;
        }
      }

      await writeFile(fullPath, content);
      updatedManifestFiles[relativePath] = { hash: hashContent(content) };
      p.log.success(`${pc.green("added")} ${relativePath}`);
    }

    added++;
  }

  // Handle removals
  for (const value of removals) {
    const [, name] = value.split(":");
    const componentFiles = getComponentFiles(templates, name);

    for (const [relativePath] of componentFiles) {
      const resolvedPath = resolve(projectRoot, relativePath);
      if (!resolvedPath.startsWith(resolve(projectRoot))) {
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
      p.log.success(`${pc.red("removed")} ${relativePath}`);
    }

    // Remove empty parent directories left by the removal
    const componentFilesList = [...getComponentFiles(templates, name).keys()];
    const dirs = new Set(
      componentFilesList.map((f) => dirname(join(projectRoot, f)))
    );
    for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
      try {
        await rm(dir, { recursive: false });
      } catch {
        // Directory not empty or already gone — ignore
      }
    }

    removed++;
  }

  await writeManifest(projectRoot, {
    ...manifest,
    updatedAt: new Date().toISOString(),
    selectedComponents: newSelection,
    files: updatedManifestFiles,
  });

  const parts = [];
  if (added > 0) parts.push(`${pc.green(added)} component(s) added`);
  if (removed > 0) parts.push(`${pc.red(removed)} component(s) removed`);

  p.outro(`Done! ${parts.join(", ")}.`);
}
