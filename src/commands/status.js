import { existsSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { hashFile, readManifest } from "../manifest.js";
import { discoverOptionalComponents, getSelectedComponents } from "../components.js";

export async function status() {
  const projectRoot = process.cwd();

  p.intro(pc.bold("Praxis — Status"));

  const manifest = await readManifest(projectRoot);
  if (!manifest) {
    p.log.warn("Praxis is not installed in this project.");
    p.outro('Run "praxis init" to get started.');
    return;
  }

  p.log.info(`Installed: ${pc.dim(manifest.installedAt)}`);
  p.log.info(`Updated:   ${pc.dim(manifest.updatedAt)}`);

  const files = Object.keys(manifest.files).sort();
  let unchanged = 0;
  let modified = 0;
  let missing = 0;

  const lines = [];
  for (const relativePath of files) {
    const fullPath = join(projectRoot, relativePath);

    if (!existsSync(fullPath)) {
      lines.push(`  ${pc.red("✗")} ${relativePath} ${pc.red("(missing)")}`);
      missing++;
    } else {
      const currentHash = await hashFile(fullPath);
      const entry = manifest.files[relativePath];

      if (currentHash !== entry.hash) {
        lines.push(
          `  ${pc.yellow("✎")} ${relativePath} ${pc.yellow("(modified)")}`
        );
        modified++;
      } else {
        lines.push(`  ${pc.green("✓")} ${relativePath}`);
        unchanged++;
      }
    }
  }

  p.log.message(lines.join("\n"));

  const parts = [];
  if (unchanged > 0) parts.push(`${pc.green(unchanged)} unchanged`);
  if (modified > 0) parts.push(`${pc.yellow(modified)} modified`);
  if (missing > 0) parts.push(`${pc.red(missing)} missing`);

  // Show component selection summary if available
  const selection = manifest.selectedComponents;
  if (selection) {
    const selectedCount = selection.skills.length + selection.reviewers.length;
    p.log.info(
      `Components: ${selectedCount} optional component(s) selected. Run ${pc.dim("praxis select")} to change.`
    );
  }

  p.outro(`${files.length} managed files: ${parts.join(", ")}.`);
}
