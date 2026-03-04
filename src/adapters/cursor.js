import { transformEnvVars } from "./shared.js";

/**
 * Maps a source file (praxis/...) to its destination under .cursor/.
 * Skills → .cursor/skills/, agents → .cursor/, shared files → .cursor/
 */
export function getDestinationPath(sourceFile) {
  if (!sourceFile.startsWith("praxis/")) return null;
  const relative = sourceFile.slice("praxis/".length);

  if (relative.startsWith("skills/")) {
    return ".cursor/" + relative;
  }
  // Agents and shared files go under .cursor/
  return ".cursor/" + relative;
}

export function getToolName() {
  return "cursor";
}

export function getDisplayName() {
  return "Cursor";
}

/**
 * Generates .cursor/mcp.json with ${env:VAR} syntax.
 */
export function generateMcpConfig(mcpConfig) {
  const transformed = transformEnvVars(
    mcpConfig,
    (_, name) => `\${env:${name}}`
  );

  return {
    path: ".cursor/mcp.json",
    content: JSON.stringify({ mcpServers: transformed }, null, 2) + "\n",
  };
}

export function getMcpConfigPath() {
  return ".cursor/mcp.json";
}

export function getManagedFiles(sourceFiles) {
  const managed = [];
  for (const sourceFile of sourceFiles) {
    const dest = getDestinationPath(sourceFile);
    if (dest) managed.push(dest);
  }
  return managed;
}
