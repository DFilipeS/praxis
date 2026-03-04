/**
 * Maps a source file (praxis/...) to its destination under .claude/.
 * Skills → .claude/skills/, agents → .claude/agents/, shared files → .claude/
 */
export function getDestinationPath(sourceFile) {
  if (!sourceFile.startsWith("praxis/")) return null;
  const relative = sourceFile.slice("praxis/".length);

  if (relative.startsWith("skills/")) {
    return ".claude/" + relative;
  }
  if (relative.startsWith("agents/")) {
    return ".claude/" + relative;
  }
  // Shared files (conventions.md, reviewer-output-format.md, etc.)
  return ".claude/" + relative;
}

export function getToolName() {
  return "claude-code";
}

export function getDisplayName() {
  return "Claude Code";
}

/**
 * Generates .mcp.json at project root with { mcpServers: { ... } } format.
 * Returns { path, content } or null if no MCP config needed.
 */
export function generateMcpConfig(mcpConfig) {
  return {
    path: ".mcp.json",
    content: JSON.stringify({ mcpServers: mcpConfig }, null, 2) + "\n",
  };
}

export function getMcpConfigPath() {
  return ".mcp.json";
}

export function getManagedFiles(sourceFiles) {
  const managed = [];
  for (const sourceFile of sourceFiles) {
    const dest = getDestinationPath(sourceFile);
    if (dest) managed.push(dest);
  }
  return managed;
}
