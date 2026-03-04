import { resolve, sep } from "node:path";
import { readFile } from "node:fs/promises";

const TOOL_NAME = "amp-code";
const DISPLAY_NAME = "Amp Code";

/**
 * Maps a source file (praxis/...) to its destination under .agents/.
 * Amp Code uses .agents/ as its native directory.
 */
export function getDestinationPath(sourceFile) {
  if (!sourceFile.startsWith("praxis/")) return null;
  return ".agents/" + sourceFile.slice("praxis/".length);
}

export function getToolName() {
  return TOOL_NAME;
}

export function getDisplayName() {
  return DISPLAY_NAME;
}

/**
 * Amp Code reads per-skill mcp.json files directly — no generation needed.
 */
export function generateMcpConfig() {
  return null;
}

export function getMcpConfigPath() {
  return null;
}

/**
 * Returns the list of destination paths this adapter manages for the given
 * source files.
 */
export function getManagedFiles(sourceFiles) {
  const managed = [];
  for (const sourceFile of sourceFiles) {
    const dest = getDestinationPath(sourceFile);
    if (dest) managed.push(dest);
  }
  return managed;
}
