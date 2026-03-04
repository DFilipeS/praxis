import { existsSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { hashFile, readManifest } from "../manifest.js";
import { getAdapter, listAdapters } from "../adapters.js";

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

  const enabledTools = manifest.enabledTools || [];
  const hasToolDestinations = enabledTools.length > 0 &&
    Object.values(manifest.files).some((e) => e.destinations);

  const files = Object.keys(manifest.files).sort();
  let unchanged = 0;
  let modified = 0;
  let missing = 0;

  const lines = [];

  if (hasToolDestinations) {
    // Per-tool destination status
    for (const relativePath of files) {
      const entry = manifest.files[relativePath];

      if (entry.destinations && Object.keys(entry.destinations).length > 0) {
        for (const [toolName, destPath] of Object.entries(entry.destinations)) {
          const fullPath = join(projectRoot, destPath);

          if (!existsSync(fullPath)) {
            lines.push(`  ${pc.red("✗")} ${destPath} ${pc.red("(missing)")}`);
            missing++;
          } else {
            const currentHash = await hashFile(fullPath);
            if (currentHash !== entry.hash) {
              lines.push(
                `  ${pc.yellow("✎")} ${destPath} ${pc.yellow("(modified)")}`
              );
              modified++;
            } else {
              lines.push(`  ${pc.green("✓")} ${destPath}`);
              unchanged++;
            }
          }
        }
      } else {
        // Legacy entry without destinations
        const fullPath = join(projectRoot, relativePath);

        if (!existsSync(fullPath)) {
          lines.push(`  ${pc.red("✗")} ${relativePath} ${pc.red("(missing)")}`);
          missing++;
        } else {
          const currentHash = await hashFile(fullPath);
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
    }
  } else {
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
  }

  p.log.message(lines.join("\n"));

  const parts = [];
  if (unchanged > 0) parts.push(`${pc.green(unchanged)} unchanged`);
  if (modified > 0) parts.push(`${pc.yellow(modified)} modified`);
  if (missing > 0) parts.push(`${pc.red(missing)} missing`);

  // Show enabled tools
  if (enabledTools.length > 0) {
    const toolNames = enabledTools.map((t) => {
      const adapter = getAdapter(t);
      return adapter ? adapter.getDisplayName() : t;
    });
    p.log.info(`Tools: ${toolNames.join(", ")}`);
  }

  // Show component selection summary if available
  const selection = manifest.selectedComponents;
  if (selection) {
    const selectedCount = selection.skills.length + selection.reviewers.length;
    p.log.info(
      `Components: ${selectedCount} optional component(s) selected. Run ${pc.dim("praxis components")} to change.`
    );
  }

  // Show MCP config status per tool
  if (enabledTools.length > 0) {
    const mcpLines = [];
    for (const toolName of enabledTools) {
      const adapter = getAdapter(toolName);
      if (!adapter) continue;

      const mcpConfigPath = adapter.getMcpConfigPath();
      if (!mcpConfigPath) {
        mcpLines.push(`  ${pc.dim("—")} ${adapter.getDisplayName()}: ${pc.dim("reads mcp.json directly")}`);
        continue;
      }

      const fullPath = join(projectRoot, mcpConfigPath);
      if (existsSync(fullPath)) {
        mcpLines.push(`  ${pc.green("✓")} ${adapter.getDisplayName()}: ${mcpConfigPath}`);
      } else {
        mcpLines.push(`  ${pc.red("✗")} ${adapter.getDisplayName()}: ${mcpConfigPath} ${pc.red("(missing)")}`);
      }
    }
    if (mcpLines.length > 0) {
      p.log.info("MCP configs:");
      p.log.message(mcpLines.join("\n"));
    }
  }

  p.outro(`${files.length} managed files: ${parts.join(", ")}.`);
}
