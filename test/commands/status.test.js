import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@clack/prompts");
vi.mock("../../src/manifest.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readManifest: vi.fn(),
  };
});

import * as p from "@clack/prompts";
import { readManifest, hashContent } from "../../src/manifest.js";
import { status } from "../../src/commands/status.js";

let tmpDir;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-status-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);

  p.intro = vi.fn();
  p.outro = vi.fn();
  p.log = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  };
  p.spinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
  p.cancel = vi.fn();
  p.isCancel = vi.fn().mockReturnValue(false);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("status", () => {
  it("shows not installed when no manifest", async () => {
    readManifest.mockResolvedValue(null);

    await status();

    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("not installed")
    );
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("praxis init")
    );
  });

  it("shows all files unchanged", async () => {
    const content = "# Test file";
    const hash = hashContent(content);

    await mkdir(join(tmpDir, ".agents"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/test.md"), content);

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      files: {
        ".agents/test.md": { hash },
      },
    });

    await status();

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 unchanged")
    );
  });

  it("detects modified file", async () => {
    await mkdir(join(tmpDir, ".agents"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/test.md"), "modified content");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      files: {
        ".agents/test.md": { hash: hashContent("original content") },
      },
    });

    await status();

    expect(p.log.message).toHaveBeenCalledWith(
      expect.stringContaining("modified")
    );
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 modified")
    );
  });

  it("detects missing file", async () => {
    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      files: {
        ".agents/gone.md": { hash: "abc123" },
      },
    });

    await status();

    expect(p.log.message).toHaveBeenCalledWith(
      expect.stringContaining("missing")
    );
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 missing")
    );
  });

  it("shows mixed: unchanged, modified, and missing", async () => {
    const goodContent = "good";
    const goodHash = hashContent(goodContent);

    await mkdir(join(tmpDir, ".agents"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/good.md"), goodContent);
    await writeFile(join(tmpDir, ".agents/changed.md"), "new content");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      files: {
        ".agents/good.md": { hash: goodHash },
        ".agents/changed.md": { hash: hashContent("old content") },
        ".agents/missing.md": { hash: "deadbeef" },
      },
    });

    await status();

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 unchanged")
    );
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 modified")
    );
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 missing")
    );
  });
});
