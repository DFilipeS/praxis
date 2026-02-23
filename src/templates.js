import { get } from "node:https";
import { mkdtemp, rm, readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { extract } from "tar";

const TARBALL_URL =
  "https://api.github.com/repos/DFilipeS/praxis/tarball/main";

function followRedirect(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { "User-Agent": "praxis-cli" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        resolve(res.headers.location);
      } else if (res.statusCode === 200) {
        resolve(url);
      } else {
        reject(
          new Error(
            `GitHub API returned status ${res.statusCode}. ${res.statusCode === 403 ? "You may be rate-limited." : ""}`
          )
        );
      }
    }).on("error", reject);
  });
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    get(url, { headers: { "User-Agent": "praxis-cli" } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed with status ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

export async function fetchTemplates() {
  const redirectUrl = await followRedirect(TARBALL_URL);
  const buffer = await downloadBuffer(redirectUrl);

  const tmpDir = await mkdtemp(join(tmpdir(), "praxis-"));

  try {
    const stream = Readable.from(buffer);
    const extractor = extract({
      cwd: tmpDir,
      strip: 1,
      filter: (path) => {
        const parts = path.split("/").slice(1);
        const relative = parts.join("/");
        return relative.startsWith(".agents/") || relative === ".agents";
      },
    });

    await new Promise((resolve, reject) => {
      stream.pipe(extractor);
      extractor.on("end", resolve);
      extractor.on("error", reject);
    });

    const files = new Map();
    await collectFiles(join(tmpDir, ".agents"), ".agents", files);
    return files;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function collectFiles(dir, prefix, files) {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = `${prefix}/${entry}`;
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      await collectFiles(fullPath, relativePath, files);
    } else {
      const content = await readFile(fullPath, "utf-8");
      files.set(relativePath, content);
    }
  }
}
