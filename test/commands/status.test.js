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

    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), content);

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      files: {
        "praxis/test.md": { hash },
      },
    });

    await status();

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 unchanged")
    );
  });

  it("detects modified file", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), "modified content");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      files: {
        "praxis/test.md": { hash: hashContent("original content") },
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
        "praxis/gone.md": { hash: "abc123" },
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

    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/good.md"), goodContent);
    await writeFile(join(tmpDir, "praxis/changed.md"), "new content");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      files: {
        "praxis/good.md": { hash: goodHash },
        "praxis/changed.md": { hash: hashContent("old content") },
        "praxis/missing.md": { hash: "deadbeef" },
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

  it("shows component count when selectedComponents is in manifest", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/conventions.md"), "core");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      selectedComponents: {
        skills: ["agent-browser", "figma-to-code"],
        reviewers: ["security"],
      },
      files: {
        "praxis/conventions.md": { hash: hashContent("core") },
      },
    });

    await status();

    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("3 optional component(s) selected")
    );
  });

  it("does not show component count when selectedComponents is absent", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/conventions.md"), "core");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      files: {
        "praxis/conventions.md": { hash: hashContent("core") },
      },
    });

    await status();

    const componentInfoCalls = p.log.info.mock.calls.filter((args) =>
      args[0]?.includes?.("component")
    );
    expect(componentInfoCalls).toHaveLength(0);
  });

  it("shows per-tool destination status when tools are enabled", async () => {
    const content = "# Core";
    const hash = hashContent(content);

    await mkdir(join(tmpDir, ".agents"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/conventions.md"), content);
    await mkdir(join(tmpDir, ".cursor"), { recursive: true });
    await writeFile(join(tmpDir, ".cursor/conventions.md"), "modified");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      enabledTools: ["amp-code", "cursor"],
      files: {
        "praxis/conventions.md": {
          hash,
          destinations: {
            "amp-code": ".agents/conventions.md",
            cursor: ".cursor/conventions.md",
          },
        },
      },
    });

    await status();

    // Should show destination paths, not source paths
    expect(p.log.message).toHaveBeenCalledWith(
      expect.stringContaining(".agents/conventions.md")
    );
    expect(p.log.message).toHaveBeenCalledWith(
      expect.stringContaining(".cursor/conventions.md")
    );
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 unchanged")
    );
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("1 modified")
    );
  });

  it("shows enabled tools list", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/conventions.md"), "core");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      enabledTools: ["amp-code", "cursor"],
      files: {
        "praxis/conventions.md": { hash: hashContent("core") },
      },
    });

    await status();

    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("Amp Code")
    );
    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("Cursor")
    );
  });

  it("shows MCP config status per tool", async () => {
    await mkdir(join(tmpDir, ".cursor"), { recursive: true });
    await writeFile(join(tmpDir, ".cursor/mcp.json"), "{}");

    readManifest.mockResolvedValue({
      installedAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      enabledTools: ["amp-code", "cursor", "claude-code"],
      files: {},
    });

    await status();

    expect(p.log.info).toHaveBeenCalledWith("MCP configs:");
    // amp-code reads mcp.json directly
    expect(p.log.message).toHaveBeenCalledWith(
      expect.stringContaining("Amp Code")
    );
    // cursor has config present
    expect(p.log.message).toHaveBeenCalledWith(
      expect.stringContaining(".cursor/mcp.json")
    );
    // claude-code config missing
    expect(p.log.message).toHaveBeenCalledWith(
      expect.stringContaining(".mcp.json")
    );
  });
});
