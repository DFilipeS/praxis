import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import * as ampCode from "./amp-code.js";
import * as claudeCode from "./claude-code.js";
import * as cursor from "./cursor.js";
import * as opencode from "./opencode.js";

export { transformEnvVars } from "./shared.js";

/**
 * Registry of all tool adapters. Adding a new tool = adding a new module
 * and registering it here — no other changes needed.
 */
const adapters = {
  "amp-code": ampCode,
  "claude-code": claudeCode,
  cursor: cursor,
  opencode: opencode,
};

export function getAdapter(name) {
  return adapters[name] || null;
}

export function listAdapters() {
  return Object.entries(adapters).map(([name, adapter]) => ({
    name,
    displayName: adapter.getDisplayName(),
  }));
}

/**
 * Reads all per-skill mcp.json files for currently selected components and
 * merges them into a single object keyed by server name.
 */
export async function collectMcpConfig(projectRoot, manifest) {
  const selected = manifest.selectedComponents;
  if (!selected?.skills) return {};

  const merged = Object.create(null);

  // Determine the skills directory based on enabled tools.
  // If amp-code is enabled, skills are in .agents/skills/; otherwise check
  // the first enabled tool's path. We iterate enabled adapters to find where
  // the skill mcp.json actually lives on disk.
  const enabledTools = manifest.enabledTools || [];
  const searchPrefixes = [];
  for (const toolName of enabledTools) {
    const adapter = adapters[toolName];
    if (!adapter) continue;
    const testPath = adapter.getDestinationPath("praxis/skills/test/mcp.json");
    if (testPath) {
      // Extract the prefix before "skills/"
      const idx = testPath.indexOf("skills/");
      if (idx >= 0) {
        searchPrefixes.push(testPath.slice(0, idx + "skills/".length));
      }
    }
  }

  // Always also check the source praxis/ directory (for local dev)
  searchPrefixes.push("praxis/skills/");

  for (const skillName of selected.skills) {
    // Guard against path traversal via crafted skill names
    if (skillName.includes("..") || skillName.includes("/")) continue;

    let servers = null;
    for (const prefix of searchPrefixes) {
      const mcpPath = resolve(projectRoot, prefix, skillName, "mcp.json");
      const expectedPrefix = resolve(projectRoot, prefix) + sep;
      if (!mcpPath.startsWith(expectedPrefix)) continue;

      try {
        const raw = await readFile(mcpPath, "utf-8");
        servers = JSON.parse(raw);
        break;
      } catch (err) {
        if (err.code !== "ENOENT") {
          console.warn(
            `Warning: skipping invalid mcp.json for skill "${skillName}": ${err.message}`
          );
        }
      }
    }

    if (servers) {
      Object.assign(merged, servers);
    }
  }

  return merged;
}

/**
 * Writes an MCP config file to disk.
 * Handles merge-key logic for files like opencode.json.
 */
export async function writeMcpConfigFile(fullPath, entry) {
  await mkdir(dirname(fullPath), { recursive: true });

  if (entry.mergeKey && existsSync(fullPath)) {
    try {
      const existing = JSON.parse(await readFile(fullPath, "utf-8"));
      const newContent = JSON.parse(entry.content);
      existing[entry.mergeKey] = newContent[entry.mergeKey];
      await writeFile(fullPath, JSON.stringify(existing, null, 2) + "\n");
    } catch {
      await writeFile(fullPath, entry.content);
    }
  } else {
    await writeFile(fullPath, entry.content);
  }
}

/**
 * Regenerates MCP config files for all enabled tools.
 * Returns the list of tool names that were regenerated.
 */
export async function regenerateToolConfigs(projectRoot, manifest) {
  const enabledTools = manifest.enabledTools;
  if (!enabledTools || enabledTools.length === 0) return [];

  const mcpConfig = await collectMcpConfig(projectRoot, manifest);
  const regenerated = [];

  for (const toolName of enabledTools) {
    const adapter = adapters[toolName];
    if (!adapter) continue;

    const result = adapter.generateMcpConfig(mcpConfig);
    if (!result) {
      regenerated.push(toolName);
      continue;
    }

    const fullPath = resolve(projectRoot, result.path);
    await writeMcpConfigFile(fullPath, result);
    regenerated.push(toolName);
  }

  return regenerated;
}
