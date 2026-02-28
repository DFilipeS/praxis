import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { createPatch } from "diff";
import pc from "picocolors";
import { fetchTemplates } from "../templates.js";
import { hashContent, readManifest, writeManifest } from "../manifest.js";
import {
  discoverOptionalComponents,
  getCoreFiles,
  getComponentFiles,
} from "../components.js";

export async function init() {
  const projectRoot = process.cwd();

  p.intro(pc.bold("Praxis — Initialize"));

  const existing = await readManifest(projectRoot);
  if (existing) {
    p.log.warn(
      "Praxis is already initialized in this project. Running update instead."
    );
    const { update } = await import("./update.js");
    return update();
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

  // Present optional component selection
  const optionalComponents = discoverOptionalComponents(templates);
  let selectedComponents = { skills: [], reviewers: [] };

  if (optionalComponents.length > 0) {
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
      const [type, name] = value.split(":");
      if (type === "skill") selectedComponents.skills.push(name);
      else if (type === "reviewer") selectedComponents.reviewers.push(name);
    }
  }

  // Build the set of files to install: core files + selected optional component files
  const filesToInstall = new Map(getCoreFiles(templates));
  const selectedNames = [
    ...selectedComponents.skills,
    ...selectedComponents.reviewers,
  ];
  for (const name of selectedNames) {
    for (const [path, content] of getComponentFiles(templates, name)) {
      filesToInstall.set(path, content);
    }
  }

  const manifestFiles = {};
  let installed = 0;
  let skipped = 0;

  for (const [relativePath, content] of [...filesToInstall.entries()].sort()) {
    const resolvedPath = resolve(projectRoot, relativePath);
    if (!resolvedPath.startsWith(resolve(projectRoot))) {
      continue;
    }

    const fullPath = join(projectRoot, relativePath);

    await mkdir(dirname(fullPath), { recursive: true });

    if (existsSync(fullPath)) {
      const existingContent = await readFile(fullPath, "utf-8");
      if (existingContent === content) {
        manifestFiles[relativePath] = { hash: hashContent(content) };
        installed++;
        continue;
      }

      const action = await p.select({
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

      let finalAction = action;
      if (finalAction === "diff") {
        const patch = createPatch(
          relativePath,
          existingContent,
          content,
          "your version",
          "praxis"
        );
        p.log.info(patch);

        finalAction = await p.select({
          message: `Overwrite ${relativePath}?`,
          options: [
            { value: "overwrite", label: "Overwrite with Praxis version" },
            { value: "skip", label: "Skip this file" },
          ],
        });

        if (p.isCancel(finalAction)) {
          p.cancel("Cancelled.");
          process.exit(0);
        }
      }

      if (finalAction === "skip") {
        manifestFiles[relativePath] = { hash: hashContent(existingContent) };
        skipped++;
        continue;
      }
    }

    await writeFile(fullPath, content);
    manifestFiles[relativePath] = { hash: hashContent(content) };
    installed++;
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
  await writeManifest(projectRoot, {
    version: "1.0.0",
    installedAt: now,
    updatedAt: now,
    selectedComponents,
    files: manifestFiles,
  });

  const summary = [`${pc.green(installed)} files installed`];
  if (skipped > 0) summary.push(`${pc.yellow(skipped)} files skipped`);

  p.outro(`Praxis initialized! ${summary.join(", ")}.`);
}
