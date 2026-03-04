import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MANIFEST_FILE = ".praxis-manifest.json";

export function hashContent(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function hashFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  return hashContent(content);
}

export async function readManifest(projectRoot) {
  try {
    const raw = await readFile(join(projectRoot, MANIFEST_FILE), "utf-8");
    const manifest = JSON.parse(raw);
    if (!manifest.enabledTools) {
      manifest.enabledTools = [];
    }
    return manifest;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeManifest(projectRoot, manifest) {
  const filePath = join(projectRoot, MANIFEST_FILE);
  const tmpPath = filePath + ".tmp." + randomUUID();
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2) + "\n");
  await rename(tmpPath, filePath);
}

/**
 * Checks if a file at relativePath has been modified compared to the manifest.
 * Supports both old format { hash } and new format { hash, destinations }.
 */
export async function isLocallyModified(projectRoot, relativePath, manifest) {
  const entry = manifest.files[relativePath];
  if (!entry) return false;

  try {
    const currentHash = await hashFile(join(projectRoot, relativePath));
    return currentHash !== entry.hash;
  } catch {
    return true;
  }
}

/**
 * Checks if a file at a specific destination path has been modified
 * compared to the stored hash for that source file.
 */
export async function isDestinationModified(projectRoot, destinationPath, sourceHash) {
  try {
    const currentHash = await hashFile(join(projectRoot, destinationPath));
    return currentHash !== sourceHash;
  } catch {
    return true;
  }
}
