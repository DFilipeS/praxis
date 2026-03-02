import { existsSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Reads all per-skill mcp.json files for currently selected components and
 * merges them into a single object keyed by server name.
 */
export async function collectMcpConfig(projectRoot, manifest) {
  const selected = manifest.selectedComponents;
  if (!selected) return {};

  const merged = {};

  for (const skillName of selected.skills) {
    const mcpPath = join(
      projectRoot,
      ".agents",
      "skills",
      skillName,
      "mcp.json"
    );

    let raw;
    try {
      raw = await readFile(mcpPath, "utf-8");
    } catch {
      continue;
    }

    let servers;
    try {
      servers = JSON.parse(raw);
    } catch {
      continue;
    }
    Object.assign(merged, servers);
  }

  return merged;
}

/**
 * Transforms env var references in a string from ${VAR} to the target format.
 */
function transformEnvVars(value, replacer) {
  if (typeof value === "string") {
    return value.replace(/\$\{([^}]+)\}/g, replacer);
  }
  if (Array.isArray(value)) {
    return value.map((v) => transformEnvVars(v, replacer));
  }
  if (value !== null && typeof value === "object") {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = transformEnvVars(v, replacer);
    }
    return result;
  }
  return value;
}

const adapters = {
  "claude-code": {
    displayName: "Claude Code",
    files: ["CLAUDE.md", ".mcp.json"],
    transform(mcpConfig) {
      const results = [];

      // Symlink entry — handled specially by the caller
      results.push({
        path: "CLAUDE.md",
        type: "symlink",
        target: "AGENTS.md",
      });

      // MCP config — env var syntax matches Amp's, no transformation needed
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

        // Build the env/environment object with transformed var syntax
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
 * Regenerates tool config files for all enabled tools.
 * Used as a post-change hook after component or update changes.
 * Returns the list of tool names that were regenerated.
 */
export async function regenerateToolConfigs(projectRoot, manifest) {
  const enabledTools = manifest.enabledTools || [];
  if (enabledTools.length === 0) return [];

  const mcpConfig = await collectMcpConfig(projectRoot, manifest);
  const regenerated = [];

  for (const toolName of enabledTools) {
    const adapter = getAdapter(toolName);
    if (!adapter) continue;

    const entries = adapter.transform(mcpConfig);

    for (const entry of entries) {
      const fullPath = resolve(projectRoot, entry.path);

      if (entry.type === "symlink") {
        // Only create if missing — don't touch existing symlinks on regenerate
        if (!existsSync(fullPath)) {
          try {
            await symlink(entry.target, fullPath);
          } catch {
            // Skip if can't create
          }
        }
        continue;
      }

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

    regenerated.push(toolName);
  }

  return regenerated;
}
