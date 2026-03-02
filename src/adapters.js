import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

    const servers = JSON.parse(raw);
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
