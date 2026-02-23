import { mkdtemp, rm, readdir, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { extract } from "tar";

const TARBALL_URL =
  "https://api.github.com/repos/DFilipeS/praxis/tarball/main";

const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

export async function fetchTemplates() {
  const res = await fetch(TARBALL_URL, {
    headers: { "User-Agent": "praxis-cli" },
    redirect: "follow",
  });

  if (!res.ok) {
    const hint = res.status === 403 ? " You may be rate-limited." : "";
    throw new Error(`GitHub API returned status ${res.status}.${hint}`);
  }

  const contentLength = Number(res.headers.get("content-length"));
  if (contentLength > MAX_DOWNLOAD_SIZE) {
    throw new Error(
      `Response too large (${contentLength} bytes). Maximum is ${MAX_DOWNLOAD_SIZE} bytes.`
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  if (buffer.length > MAX_DOWNLOAD_SIZE) {
    throw new Error(
      `Downloaded content too large (${buffer.length} bytes). Maximum is ${MAX_DOWNLOAD_SIZE} bytes.`
    );
  }

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
      stream.on("error", reject);
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
