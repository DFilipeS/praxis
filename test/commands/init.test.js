import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@clack/prompts");
vi.mock("../../src/templates.js");
vi.mock("../../src/commands/update.js", () => ({ update: vi.fn() }));
vi.mock("../../src/adapters.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    regenerateToolConfigs: vi.fn(actual.regenerateToolConfigs),
  };
});

import * as p from "@clack/prompts";
import { fetchTemplates } from "../../src/templates.js";
import { update } from "../../src/commands/update.js";
import { hashContent } from "../../src/manifest.js";
import { regenerateToolConfigs } from "../../src/adapters.js";
import { init } from "../../src/commands/init.js";

let tmpDir;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-init-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit(${code})`);
  });

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
  p.multiselect = vi.fn().mockResolvedValue([]);
  p.groupMultiselect = vi.fn().mockResolvedValue([]);

  fetchTemplates.mockResolvedValue(
    new Map([
      ["praxis/test.md", "# Test"],
      ["praxis/sub/nested.md", "# Nested"],
    ])
  );
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("init", () => {
  it("creates files, directories, and manifest on fresh init", async () => {
    await init();

    expect(await readFile(join(tmpDir, "praxis/test.md"), "utf-8")).toBe(
      "# Test"
    );
    expect(
      await readFile(join(tmpDir, "praxis/sub/nested.md"), "utf-8")
    ).toBe("# Nested");

    expect(existsSync(join(tmpDir, ".ai-workflow/ideas"))).toBe(true);
    expect(existsSync(join(tmpDir, ".ai-workflow/plans"))).toBe(true);
    expect(existsSync(join(tmpDir, ".ai-workflow/learnings"))).toBe(true);

    expect(await readFile(join(tmpDir, ".ai-workflow/tags"), "utf-8")).toBe("");

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.installedAt).toBeTruthy();
    expect(manifest.updatedAt).toBe(manifest.installedAt);
    expect(manifest.files["praxis/test.md"].hash).toBe(
      hashContent("# Test")
    );
    expect(manifest.files["praxis/sub/nested.md"].hash).toBe(
      hashContent("# Nested")
    );

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("2 files installed")
    );
  });

  it("falls back to update when already initialized", async () => {
    await writeFile(
      join(tmpDir, ".praxis-manifest.json"),
      JSON.stringify({ version: "1.0.0", files: {} })
    );

    await init();

    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("already initialized")
    );
    expect(update).toHaveBeenCalled();
  });

  it("shows error and exits on fetch failure", async () => {
    fetchTemplates.mockRejectedValue(new Error("Network error"));

    await expect(init()).rejects.toThrow("process.exit(1)");

    expect(p.log.error).toHaveBeenCalledWith("Network error");
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("counts existing file with same content as installed", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), "# Test");

    await init();

    expect(await readFile(join(tmpDir, "praxis/test.md"), "utf-8")).toBe(
      "# Test"
    );

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.files["praxis/test.md"]).toBeTruthy();

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("2 files installed")
    );
  });

  it("overwrites existing file when user chooses overwrite", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), "local content");

    p.select = vi.fn().mockResolvedValue("overwrite");

    await init();

    expect(await readFile(join(tmpDir, "praxis/test.md"), "utf-8")).toBe(
      "# Test"
    );
  });

  it("keeps existing file when user chooses skip", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), "local content");

    p.select = vi.fn().mockResolvedValue("skip");

    await init();

    expect(await readFile(join(tmpDir, "praxis/test.md"), "utf-8")).toBe(
      "local content"
    );

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.files["praxis/test.md"].hash).toBe(
      hashContent("local content")
    );

    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining("skipped"));
  });

  it("shows diff then overwrites when user chooses diff then overwrite", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), "old content");

    p.select = vi
      .fn()
      .mockResolvedValueOnce("diff")
      .mockResolvedValueOnce("overwrite");

    await init();

    expect(p.log.info).toHaveBeenCalledWith(expect.stringContaining("---"));
    expect(await readFile(join(tmpDir, "praxis/test.md"), "utf-8")).toBe(
      "# Test"
    );
  });

  it("shows diff then skips when user chooses diff then skip", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), "old content");

    p.select = vi
      .fn()
      .mockResolvedValueOnce("diff")
      .mockResolvedValueOnce("skip");

    await init();

    expect(await readFile(join(tmpDir, "praxis/test.md"), "utf-8")).toBe(
      "old content"
    );
  });

  it("cancels on first select", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), "local content");

    const cancelSymbol = Symbol("cancel");
    p.select = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(init()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("cancels on second select after diff", async () => {
    await mkdir(join(tmpDir, "praxis"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/test.md"), "local content");

    const cancelSymbol = Symbol("cancel");
    p.select = vi
      .fn()
      .mockResolvedValueOnce("diff")
      .mockResolvedValueOnce(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(init()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("blocks path traversal", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        ["../../../tmp/praxis-traversal-test", "malicious"],
        ["praxis/test.md", "# Test"],
      ])
    );

    await init();

    expect(existsSync(join(tmpDir, "../../../tmp/praxis-traversal-test"))).toBe(
      false
    );

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(
      manifest.files["../../../tmp/praxis-traversal-test"]
    ).toBeUndefined();
    expect(manifest.files["praxis/test.md"]).toBeTruthy();
  });

  it("does not overwrite existing tags file", async () => {
    await mkdir(join(tmpDir, ".ai-workflow"), { recursive: true });
    await writeFile(join(tmpDir, ".ai-workflow/tags"), "existing-tag");

    await init();

    expect(await readFile(join(tmpDir, ".ai-workflow/tags"), "utf-8")).toBe(
      "existing-tag"
    );
  });

  it("presents groupMultiselect and installs only selected optional components", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        ["praxis/conventions.md", "# Core"],
        ["praxis/skills/px-brainstorm/SKILL.md", "# Core skill"],
        ["praxis/skills/agent-browser/SKILL.md", '---\ndescription: "Browser"\n---'],
        ["praxis/skills/figma-to-code/SKILL.md", '---\ndescription: "Figma"\n---'],
        ["praxis/agents/reviewers/security.md", '---\ndescription: "Security"\n---'],
      ])
    );

    // User selects only agent-browser and security
    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser", "reviewer:security"]);

    await init();

    // Core files always installed
    expect(existsSync(join(tmpDir, "praxis/conventions.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "praxis/skills/px-brainstorm/SKILL.md"))).toBe(true);

    // Selected optional components installed
    expect(existsSync(join(tmpDir, "praxis/skills/agent-browser/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "praxis/agents/reviewers/security.md"))).toBe(true);

    // Unselected optional component not installed
    expect(existsSync(join(tmpDir, "praxis/skills/figma-to-code/SKILL.md"))).toBe(false);

    // Manifest includes selectedComponents
    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.selectedComponents).toEqual({
      skills: ["agent-browser"],
      reviewers: ["security"],
    });
  });

  it("installs all components when all selected", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        ["praxis/conventions.md", "# Core"],
        ["praxis/skills/agent-browser/SKILL.md", '---\ndescription: "Browser"\n---'],
        ["praxis/agents/reviewers/security.md", '---\ndescription: "Security"\n---'],
      ])
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser", "reviewer:security"]);

    await init();

    expect(existsSync(join(tmpDir, "praxis/skills/agent-browser/SKILL.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "praxis/agents/reviewers/security.md"))).toBe(true);
  });

  it("cancels on groupMultiselect cancel", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        ["praxis/skills/agent-browser/SKILL.md", '---\ndescription: "Browser"\n---'],
      ])
    );

    const cancelSymbol = Symbol("cancel");
    p.groupMultiselect = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(init()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("installs files to tool destinations when tools are selected", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        ["praxis/conventions.md", "# Core"],
      ])
    );

    p.multiselect = vi.fn().mockResolvedValue(["amp-code", "cursor"]);

    await init();

    // Files installed to tool destinations, not source paths
    expect(existsSync(join(tmpDir, ".agents/conventions.md"))).toBe(true);
    expect(existsSync(join(tmpDir, ".cursor/conventions.md"))).toBe(true);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).toEqual(["amp-code", "cursor"]);
    expect(manifest.files["praxis/conventions.md"].destinations).toEqual({
      "amp-code": ".agents/conventions.md",
      cursor: ".cursor/conventions.md",
    });
  });

  it("generates MCP configs for enabled tools during init", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        ["praxis/conventions.md", "# Core"],
        ["praxis/skills/figma-to-code/SKILL.md", '---\ndescription: "Figma"\n---'],
        ["praxis/skills/figma-to-code/mcp.json", JSON.stringify({
          figma: { command: "npx", args: ["-y", "figma-mcp"], env: { KEY: "${K}" } },
        })],
      ])
    );

    p.multiselect = vi.fn().mockResolvedValue(["cursor"]);
    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:figma-to-code"]);

    await init();

    // MCP config generated
    expect(existsSync(join(tmpDir, ".cursor/mcp.json"))).toBe(true);
    const mcpConfig = JSON.parse(
      await readFile(join(tmpDir, ".cursor/mcp.json"), "utf-8")
    );
    expect(mcpConfig.mcpServers.figma).toBeTruthy();

    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("Generated MCP config")
    );
  });

  it("cancels on multiselect cancel for tool selection", async () => {
    const cancelSymbol = Symbol("cancel");
    p.multiselect = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(init()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("does not log MCP config message when regenerateToolConfigs returns empty", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([["praxis/conventions.md", "# Core"]])
    );

    p.multiselect = vi.fn().mockResolvedValue(["cursor"]);
    regenerateToolConfigs.mockResolvedValueOnce([]);

    await init();

    const infoCalls = p.log.info.mock.calls.map((c) => c[0]);
    expect(infoCalls.every((msg) => !msg.includes("Generated MCP config"))).toBe(true);
    expect(p.outro).toHaveBeenCalled();
  });

  it("warns when MCP config generation fails during init", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([["praxis/conventions.md", "# Core"]])
    );

    p.multiselect = vi.fn().mockResolvedValue(["cursor"]);
    regenerateToolConfigs.mockRejectedValueOnce(new Error("disk full"));

    await init();

    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not generate tool configs")
    );
    expect(p.outro).toHaveBeenCalled();
  });

  it("skips groupMultiselect when no optional components exist", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        ["praxis/conventions.md", "# Core"],
        ["praxis/skills/px-brainstorm/SKILL.md", "# Core skill"],
      ])
    );

    p.groupMultiselect = vi.fn();

    await init();

    expect(p.groupMultiselect).not.toHaveBeenCalled();

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.selectedComponents).toEqual({ skills: [], reviewers: [] });
  });
});
