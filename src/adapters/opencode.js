import { transformEnvVars } from "./shared.js";

/**
 * Maps a source file (praxis/...) to its destination under .opencode/.
 * Skills → .opencode/skills/, agents → .opencode/agents/, shared files → .opencode/
 */
export function getDestinationPath(sourceFile) {
  if (!sourceFile.startsWith("praxis/")) return null;
  const relative = sourceFile.slice("praxis/".length);

  if (relative.startsWith("skills/")) {
    return ".opencode/" + relative;
  }
  if (relative.startsWith("agents/")) {
    return ".opencode/" + relative;
  }
  return ".opencode/" + relative;
}

export function getToolName() {
  return "opencode";
}

export function getDisplayName() {
  return "OpenCode";
}

/**
 * Generates opencode.json with mcp key, {env:VAR} syntax, type: "local".
 */
export function generateMcpConfig(mcpConfig) {
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

  return {
    path: "opencode.json",
    content: JSON.stringify({ mcp: servers }, null, 2) + "\n",
    mergeKey: "mcp",
  };
}

export function getMcpConfigPath() {
  return "opencode.json";
}

export function getManagedFiles(sourceFiles) {
  const managed = [];
  for (const sourceFile of sourceFiles) {
    const dest = getDestinationPath(sourceFile);
    if (dest) managed.push(dest);
  }
  return managed;
}
