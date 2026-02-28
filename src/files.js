import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import * as p from "@clack/prompts";
import { createPatch } from "diff";
import { hashContent } from "./manifest.js";

/**
 * Installs a single file, prompting for conflict resolution if a different
 * version already exists on disk.
 *
 * Returns:
 *   { status: "written",  hash } — file was written to disk (new or overwritten)
 *   { status: "matched",  hash } — file already existed with identical content
 *   { status: "skipped",  hash } — user chose to keep their existing version
 */
export async function installFile(fullPath, relativePath, content) {
  if (existsSync(fullPath)) {
    const existingContent = await readFile(fullPath, "utf-8");

    if (existingContent === content) {
      return { status: "matched", hash: hashContent(content) };
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
      return { status: "skipped", hash: hashContent(existingContent) };
    }
  }

  await writeFile(fullPath, content);
  return { status: "written", hash: hashContent(content) };
}
