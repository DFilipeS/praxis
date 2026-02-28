import { createHash } from "node:crypto";
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
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeManifest(projectRoot, manifest) {
  const filePath = join(projectRoot, MANIFEST_FILE);
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2) + "\n");
  await rename(tmpPath, filePath);
}

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
