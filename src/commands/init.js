import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { createPatch } from "diff";
import pc from "picocolors";
import { fetchTemplates } from "../templates.js";
import { hashContent, readManifest, writeManifest } from "../manifest.js";

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

  const manifestFiles = {};
  let installed = 0;
  let skipped = 0;

  for (const [relativePath, content] of [...templates.entries()].sort()) {
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
    files: manifestFiles,
  });

  const summary = [`${pc.green(installed)} files installed`];
  if (skipped > 0) summary.push(`${pc.yellow(skipped)} files skipped`);

  p.outro(`Praxis initialized! ${summary.join(", ")}.`);
}
