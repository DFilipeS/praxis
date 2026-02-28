import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { sep } from "node:path";
import * as p from "@clack/prompts";
import { createPatch } from "diff";
import { hashContent } from "./manifest.js";

/**
 * Returns true if resolvedPath is safely within resolvedRoot.
 * Guards against path traversal from template-supplied paths.
 */
export function isSafePath(resolvedRoot, resolvedPath) {
  return resolvedPath.startsWith(resolvedRoot + sep);
}

/**
 * Installs a single file, prompting for conflict resolution if a different
 * version already exists on disk.
 *
 * Returns:
 *   { status: "written",  hash } — file was written to disk (new or overwritten)
 *   { status: "matched",  hash } — file already existed with identical content
 *   { status: "skipped",  hash } — user chose to keep their existing version
 *   { status: "cancelled" }      — user cancelled the prompt; no file was written
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
      return { status: "cancelled" };
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
        return { status: "cancelled" };
      }
    }

    if (action === "skip") {
      return { status: "skipped", hash: hashContent(existingContent) };
    }
  }

  await writeFile(fullPath, content);
  return { status: "written", hash: hashContent(content) };
}
