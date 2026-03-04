import { existsSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/**
 * Reads all per-skill mcp.json files for currently selected components and
 * merges them into a single object keyed by server name.
 */
export async function collectMcpConfig(projectRoot, manifest) {
  const selected = manifest.selectedComponents;
  if (!selected?.skills) return {};

  const merged = Object.create(null);
  const expectedPrefix = resolve(projectRoot, "praxis", "skills") + sep;

  for (const skillName of selected.skills) {
    const mcpPath = resolve(
      projectRoot,
      "praxis",
      "skills",
      skillName,
      "mcp.json"
    );

    // Guard against path traversal via crafted skill names
    if (!mcpPath.startsWith(expectedPrefix)) continue;

    try {
      const raw = await readFile(mcpPath, "utf-8");
      const servers = JSON.parse(raw);
      Object.assign(merged, servers);
    } catch (err) {
      if (err.code !== "ENOENT") {
        console.warn(
          `Warning: skipping invalid mcp.json for skill "${skillName}": ${err.message}`
        );
      }
    }
  }

  return merged;
}

/**
 * Transforms env var references from ${VAR} to a target format.
 * @param {unknown} value - The value to transform (string, array, object, or primitive).
 * @param {(match: string, varName: string) => string} replacerFn - Regex replacer receiving the full match and the captured variable name.
 */
function transformEnvVars(value, replacerFn) {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, replacerFn);
  }
  if (Array.isArray(value)) {
    return value.map((v) => transformEnvVars(v, replacerFn));
  }
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = transformEnvVars(v, replacerFn);
    }
    return result;
  }
  return value;
}

/**
 * Adapter definitions. Each adapter's transform() produces entries used for
 * both writing (tool add) and removing (tool remove) config files.
 */
const adapters = {
  "claude-code": {
    displayName: "Claude Code",
    files: ["CLAUDE.md", ".mcp.json"],
    transform(mcpConfig) {
      const results = [];

      results.push({
        path: "CLAUDE.md",
        type: "symlink",
        target: "AGENTS.md",
      });

      results.push({
        path: ".mcp.json",
        type: "file",
        content:
          JSON.stringify({ mcpServers: mcpConfig }, null, 2) + "\n",
      });

      return results;
    },
  },

  cursor: {
    displayName: "Cursor",
    files: [".cursor/mcp.json"],
    transform(mcpConfig) {
      const transformed = transformEnvVars(
        mcpConfig,
        (_, name) => `\${env:${name}}`
      );

      return [
        {
          path: ".cursor/mcp.json",
          type: "file",
          content:
            JSON.stringify({ mcpServers: transformed }, null, 2) + "\n",
        },
      ];
    },
  },

  opencode: {
    displayName: "Opencode",
    files: ["opencode.json"],
    transform(mcpConfig) {
      const servers = {};

      for (const [name, entry] of Object.entries(mcpConfig)) {
        const command = [entry.command, ...(entry.args || [])];

        const env = entry.env || {};
        const environment = transformEnvVars(
          env,
          (_, varName) => `{env:${varName}}`
        );

        servers[name] = {
          type: "local",
          command,
          environment,
        };
      }

      return [
        {
          path: "opencode.json",
          type: "file",
          content: JSON.stringify({ mcp: servers }, null, 2) + "\n",
          mergeKey: "mcp",
        },
      ];
    },
  },
};

export function getAdapter(name) {
  return adapters[name] || null;
}

export function listAdapters() {
  return Object.entries(adapters).map(([name, adapter]) => ({
    name,
    displayName: adapter.displayName,
    files: adapter.files,
  }));
}

/**
 * Writes a regular (non-symlink) adapter entry to disk.
 * Handles merge-key logic for files like opencode.json.
 */
export async function writeEntryFile(fullPath, entry) {
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
 * Regenerates tool config files for all enabled tools.
 * Used as a post-change hook after component or update changes.
 * Returns the list of tool names that were regenerated.
 */
export async function regenerateToolConfigs(projectRoot, manifest) {
  const enabledTools = manifest.enabledTools;
  if (!enabledTools || enabledTools.length === 0) return [];

  const mcpConfig = await collectMcpConfig(projectRoot, manifest);
  const regenerated = [];

  for (const toolName of enabledTools) {
    const adapter = getAdapter(toolName);
    if (!adapter) continue;

    const entries = adapter.transform(mcpConfig);

    for (const entry of entries) {
      const fullPath = resolve(projectRoot, entry.path);

      if (entry.type === "symlink") {
        if (!existsSync(fullPath)) {
          try {
            await symlink(entry.target, fullPath);
          } catch {
            // Skip if can't create
          }
        }
        continue;
      }

      await writeEntryFile(fullPath, entry);
    }

    regenerated.push(toolName);
  }

  return regenerated;
}
