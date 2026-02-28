import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@clack/prompts");

import * as p from "@clack/prompts";
import { hashContent } from "../src/manifest.js";
import { installFile } from "../src/files.js";

let tmpDir;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-files-test-"));
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });

  p.cancel = vi.fn();
  p.isCancel = vi.fn().mockReturnValue(false);
  p.select = vi.fn();
  p.log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  };
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("installFile", () => {
  it("writes a new file and returns status written", async () => {
    const fullPath = join(tmpDir, "new.md");
    const result = await installFile(fullPath, "new.md", "# Content");

    expect(result.status).toBe("written");
    expect(result.hash).toBe(hashContent("# Content"));
    expect(await readFile(fullPath, "utf-8")).toBe("# Content");
  });

  it("returns matched when file exists with same content", async () => {
    const fullPath = join(tmpDir, "existing.md");
    await writeFile(fullPath, "# Content");

    const result = await installFile(fullPath, "existing.md", "# Content");

    expect(result.status).toBe("matched");
    expect(result.hash).toBe(hashContent("# Content"));
    expect(p.select).not.toHaveBeenCalled();
  });

  it("overwrites and returns written when user chooses overwrite", async () => {
    const fullPath = join(tmpDir, "conflict.md");
    await writeFile(fullPath, "old content");

    p.select = vi.fn().mockResolvedValue("overwrite");

    const result = await installFile(fullPath, "conflict.md", "new content");

    expect(result.status).toBe("written");
    expect(result.hash).toBe(hashContent("new content"));
    expect(await readFile(fullPath, "utf-8")).toBe("new content");
  });

  it("returns skipped with old hash when user chooses skip", async () => {
    const fullPath = join(tmpDir, "conflict.md");
    await writeFile(fullPath, "old content");

    p.select = vi.fn().mockResolvedValue("skip");

    const result = await installFile(fullPath, "conflict.md", "new content");

    expect(result.status).toBe("skipped");
    expect(result.hash).toBe(hashContent("old content"));
    expect(await readFile(fullPath, "utf-8")).toBe("old content");
  });

  it("shows diff then overwrites when user chooses diff then overwrite", async () => {
    const fullPath = join(tmpDir, "conflict.md");
    await writeFile(fullPath, "old content");

    p.select = vi.fn()
      .mockResolvedValueOnce("diff")
      .mockResolvedValueOnce("overwrite");

    const result = await installFile(fullPath, "conflict.md", "new content");

    expect(p.log.info).toHaveBeenCalledWith(expect.stringContaining("---"));
    expect(result.status).toBe("written");
    expect(await readFile(fullPath, "utf-8")).toBe("new content");
  });

  it("shows diff then skips when user chooses diff then skip", async () => {
    const fullPath = join(tmpDir, "conflict.md");
    await writeFile(fullPath, "old content");

    p.select = vi.fn()
      .mockResolvedValueOnce("diff")
      .mockResolvedValueOnce("skip");

    const result = await installFile(fullPath, "conflict.md", "new content");

    expect(result.status).toBe("skipped");
    expect(await readFile(fullPath, "utf-8")).toBe("old content");
  });

  it("cancels on first select cancel", async () => {
    const fullPath = join(tmpDir, "conflict.md");
    await writeFile(fullPath, "old content");

    const cancelSymbol = Symbol("cancel");
    p.select = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(installFile(fullPath, "conflict.md", "new content")).rejects.toThrow(
      "process.exit(0)"
    );
    expect(p.cancel).toHaveBeenCalled();
  });

  it("cancels on second select (after diff) cancel", async () => {
    const fullPath = join(tmpDir, "conflict.md");
    await writeFile(fullPath, "old content");

    const cancelSymbol = Symbol("cancel");
    p.select = vi.fn()
      .mockResolvedValueOnce("diff")
      .mockResolvedValueOnce(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(installFile(fullPath, "conflict.md", "new content")).rejects.toThrow(
      "process.exit(0)"
    );
    expect(p.cancel).toHaveBeenCalled();
  });
});
