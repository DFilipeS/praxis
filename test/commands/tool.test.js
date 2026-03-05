import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@clack/prompts");
vi.mock("../../src/templates.js");
vi.mock("../../src/manifest.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readManifest: vi.fn(),
    writeManifest: vi.fn(actual.writeManifest),
  };
});

import * as p from "@clack/prompts";
import { fetchTemplates } from "../../src/templates.js";
import { readManifest, writeManifest, hashContent } from "../../src/manifest.js";
import { toolAdd, toolRemove, toolList } from "../../src/commands/tool.js";

let tmpDir;

function makeManifest(opts = {}) {
  return {
    version: "1.0.0",
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    selectedComponents: { skills: [], reviewers: [] },
    enabledTools: [],
    files: {},
    ...opts,
  };
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-tool-test-"));
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
  p.confirm = vi.fn().mockResolvedValue(true);

  fetchTemplates.mockResolvedValue(new Map());
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("toolAdd", () => {
  it("errors if not initialized", async () => {
    readManifest.mockResolvedValue(null);

    await expect(toolAdd([])).rejects.toThrow("process.exit(1)");
    expect(p.log.error).toHaveBeenCalledWith(
      expect.stringContaining("not initialized")
    );
  });

  it("errors on unknown tool name", async () => {
    readManifest.mockResolvedValue(makeManifest());

    await expect(toolAdd(["unknown-tool"])).rejects.toThrow("process.exit(1)");
    expect(p.log.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown tool "unknown-tool"')
    );
  });

  it("generates .mcp.json for claude-code", async () => {
    await mkdir(join(tmpDir, "praxis/skills/figma-to-code"), { recursive: true });
    await writeFile(
      join(tmpDir, "praxis/skills/figma-to-code/mcp.json"),
      JSON.stringify({
        figma: {
          command: "npx",
          args: ["-y", "figma-developer-mcp"],
          env: { FIGMA_API_KEY: "${FIGMA_API_KEY}" },
        },
      })
    );

    readManifest.mockResolvedValue(
      makeManifest({
        selectedComponents: { skills: ["figma-to-code"], reviewers: [] },
      })
    );

    await toolAdd(["claude-code"]);

    // .mcp.json should contain mcpServers
    const mcpContent = JSON.parse(
      await readFile(join(tmpDir, ".mcp.json"), "utf-8")
    );
    expect(mcpContent.mcpServers.figma).toBeTruthy();
    expect(mcpContent.mcpServers.figma.env.FIGMA_API_KEY).toBe("${FIGMA_API_KEY}");

    // Manifest should be updated
    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).toContain("claude-code");
  });

  it("generates .cursor/mcp.json with ${env:VAR} syntax", async () => {
    await mkdir(join(tmpDir, "praxis/skills/figma-to-code"), { recursive: true });
    await writeFile(
      join(tmpDir, "praxis/skills/figma-to-code/mcp.json"),
      JSON.stringify({
        figma: {
          command: "npx",
          args: ["-y", "figma-mcp"],
          env: { KEY: "${MY_KEY}" },
        },
      })
    );

    readManifest.mockResolvedValue(
      makeManifest({
        selectedComponents: { skills: ["figma-to-code"], reviewers: [] },
      })
    );

    await toolAdd(["cursor"]);

    const mcpContent = JSON.parse(
      await readFile(join(tmpDir, ".cursor/mcp.json"), "utf-8")
    );
    expect(mcpContent.mcpServers.figma.env.KEY).toBe("${env:MY_KEY}");
  });

  it("generates opencode.json with correct format", async () => {
    await mkdir(join(tmpDir, "praxis/skills/figma-to-code"), { recursive: true });
    await writeFile(
      join(tmpDir, "praxis/skills/figma-to-code/mcp.json"),
      JSON.stringify({
        figma: {
          command: "npx",
          args: ["-y", "figma-mcp"],
          env: { KEY: "${MY_KEY}" },
        },
      })
    );

    readManifest.mockResolvedValue(
      makeManifest({
        selectedComponents: { skills: ["figma-to-code"], reviewers: [] },
      })
    );

    await toolAdd(["opencode"]);

    const content = JSON.parse(
      await readFile(join(tmpDir, "opencode.json"), "utf-8")
    );
    expect(content.mcp.figma.type).toBe("local");
    expect(content.mcp.figma.command).toEqual(["npx", "-y", "figma-mcp"]);
    expect(content.mcp.figma.environment.KEY).toBe("{env:MY_KEY}");
    expect(content.mcp.figma.env).toBeUndefined();
  });

  it("merges mcp key into existing opencode.json preserving other settings", async () => {
    await writeFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({ provider: { default: "anthropic" } }, null, 2) + "\n"
    );

    readManifest.mockResolvedValue(makeManifest());

    await toolAdd(["opencode"]);

    const content = JSON.parse(
      await readFile(join(tmpDir, "opencode.json"), "utf-8")
    );
    expect(content.provider).toEqual({ default: "anthropic" });
    expect(content.mcp).toBeTruthy();
  });

  it("does not write MCP config for amp-code (no-op)", async () => {
    readManifest.mockResolvedValue(makeManifest());

    await toolAdd(["amp-code"]);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).toContain("amp-code");

    // No MCP config file written
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("0 file(s) written")
    );
  });

  it("shows interactive multi-select when no names given", async () => {
    readManifest.mockResolvedValue(makeManifest());
    p.multiselect = vi.fn().mockResolvedValue(["cursor"]);

    await toolAdd([]);

    expect(p.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Select tools"),
      })
    );
  });

  it("cancels on multi-select cancel", async () => {
    readManifest.mockResolvedValue(makeManifest());

    const cancelSymbol = Symbol("cancel");
    p.multiselect = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(toolAdd([])).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("adds multiple tools at once", async () => {
    readManifest.mockResolvedValue(makeManifest());

    await toolAdd(["cursor", "opencode"]);

    expect(existsSync(join(tmpDir, ".cursor/mcp.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "opencode.json"))).toBe(true);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).toContain("cursor");
    expect(manifest.enabledTools).toContain("opencode");
  });

  it("reports no tools selected when interactive returns empty", async () => {
    readManifest.mockResolvedValue(makeManifest());
    p.multiselect = vi.fn().mockResolvedValue([]);

    await toolAdd([]);

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("No tools selected")
    );
  });

  it("overwrites existing opencode.json with invalid JSON", async () => {
    await writeFile(join(tmpDir, "opencode.json"), "not json {");

    readManifest.mockResolvedValue(makeManifest());

    await toolAdd(["opencode"]);

    const content = JSON.parse(
      await readFile(join(tmpDir, "opencode.json"), "utf-8")
    );
    expect(content.mcp).toBeTruthy();
  });

  it("shows multi-select with already enabled tools as initial values", async () => {
    readManifest.mockResolvedValue(makeManifest({ enabledTools: ["cursor"] }));
    p.multiselect = vi.fn().mockResolvedValue(["cursor"]);

    await toolAdd([]);

    expect(p.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: ["cursor"],
      })
    );
  });

  it("merges mcp into existing opencode.json via writeMcpConfigFile", async () => {
    await writeFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({ provider: { default: "anthropic" } }, null, 2) + "\n"
    );

    await mkdir(join(tmpDir, "praxis/skills/figma-to-code"), { recursive: true });
    await writeFile(
      join(tmpDir, "praxis/skills/figma-to-code/mcp.json"),
      JSON.stringify({ figma: { command: "npx", args: [], env: {} } })
    );

    readManifest.mockResolvedValue(
      makeManifest({
        selectedComponents: { skills: ["figma-to-code"], reviewers: [] },
      })
    );

    await toolAdd(["opencode"]);

    const content = JSON.parse(
      await readFile(join(tmpDir, "opencode.json"), "utf-8")
    );
    expect(content.provider).toEqual({ default: "anthropic" });
    expect(content.mcp.figma).toBeTruthy();
  });
});

describe("toolRemove", () => {
  it("errors if not initialized", async () => {
    readManifest.mockResolvedValue(null);

    await expect(toolRemove(["cursor"])).rejects.toThrow("process.exit(1)");
  });

  it("errors when no names provided", async () => {
    readManifest.mockResolvedValue(makeManifest());

    await expect(toolRemove([])).rejects.toThrow("process.exit(1)");
    expect(p.log.error).toHaveBeenCalledWith(
      expect.stringContaining("specify one or more")
    );
  });

  it("errors on unknown tool name", async () => {
    readManifest.mockResolvedValue(makeManifest());

    await expect(toolRemove(["unknown"])).rejects.toThrow("process.exit(1)");
  });

  it("deletes generated files and updates manifest", async () => {
    // Set up cursor config files
    await mkdir(join(tmpDir, ".cursor"), { recursive: true });
    await writeFile(
      join(tmpDir, ".cursor/mcp.json"),
      JSON.stringify({ mcpServers: {} })
    );

    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["cursor"] })
    );

    await toolRemove(["cursor"]);

    expect(existsSync(join(tmpDir, ".cursor/mcp.json"))).toBe(false);
    // Empty .cursor dir should be cleaned up
    expect(existsSync(join(tmpDir, ".cursor"))).toBe(false);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).not.toContain("cursor");
  });

  it("removes only mcp key from opencode.json when other settings exist", async () => {
    await writeFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({ provider: { default: "anthropic" }, mcp: { figma: {} } }, null, 2) + "\n"
    );

    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["opencode"] })
    );

    await toolRemove(["opencode"]);

    const content = JSON.parse(
      await readFile(join(tmpDir, "opencode.json"), "utf-8")
    );
    expect(content.provider).toEqual({ default: "anthropic" });
    expect(content.mcp).toBeUndefined();
  });

  it("deletes opencode.json entirely when only mcp key exists", async () => {
    await writeFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({ mcp: { figma: {} } }, null, 2) + "\n"
    );

    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["opencode"] })
    );

    await toolRemove(["opencode"]);

    expect(existsSync(join(tmpDir, "opencode.json"))).toBe(false);
  });

  it("removes opencode.json when it contains invalid JSON", async () => {
    await writeFile(join(tmpDir, "opencode.json"), "not json {");

    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["opencode"] })
    );

    await toolRemove(["opencode"]);

    expect(existsSync(join(tmpDir, "opencode.json"))).toBe(false);
  });

  it("handles removal when files are already gone", async () => {
    // No files on disk, but tool is in enabledTools
    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["cursor"] })
    );

    await toolRemove(["cursor"]);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).not.toContain("cursor");
  });

  it("removes .mcp.json for claude-code", async () => {
    await writeFile(join(tmpDir, ".mcp.json"), "{}");

    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["claude-code"] })
    );

    await toolRemove(["claude-code"]);

    expect(existsSync(join(tmpDir, ".mcp.json"))).toBe(false);
  });

  it("handles amp-code removal gracefully (no MCP config to remove)", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["amp-code"] })
    );

    await toolRemove(["amp-code"]);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).not.toContain("amp-code");
  });

  it("removes Praxis-managed files from tool directories", async () => {
    await mkdir(join(tmpDir, ".agents"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/conventions.md"), "core content");

    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code"],
        files: {
          "praxis/conventions.md": {
            hash: hashContent("core content"),
            destinations: { "amp-code": ".agents/conventions.md" },
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    expect(existsSync(join(tmpDir, ".agents/conventions.md"))).toBe(false);
    // Empty dir should be cleaned up
    expect(existsSync(join(tmpDir, ".agents"))).toBe(false);
    expect(p.log.success).toHaveBeenCalledWith(
      expect.stringContaining("removed")
    );
  });

  it("skips locally modified files with warning during tool remove", async () => {
    await mkdir(join(tmpDir, ".agents"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/conventions.md"), "locally modified");

    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code"],
        files: {
          "praxis/conventions.md": {
            hash: hashContent("original content"),
            destinations: { "amp-code": ".agents/conventions.md" },
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    // File should be preserved
    expect(existsSync(join(tmpDir, ".agents/conventions.md"))).toBe(true);
    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("locally modified")
    );
  });

  it("updates manifest destinations when removing a tool", async () => {
    await mkdir(join(tmpDir, ".agents"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/conventions.md"), "core");
    await mkdir(join(tmpDir, ".cursor"), { recursive: true });
    await writeFile(join(tmpDir, ".cursor/conventions.md"), "core");

    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code", "cursor"],
        files: {
          "praxis/conventions.md": {
            hash: hashContent("core"),
            destinations: {
              "amp-code": ".agents/conventions.md",
              cursor: ".cursor/conventions.md",
            },
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    // Only amp-code files removed
    expect(existsSync(join(tmpDir, ".agents/conventions.md"))).toBe(false);
    expect(existsSync(join(tmpDir, ".cursor/conventions.md"))).toBe(true);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    // amp-code destination should be gone, cursor should remain
    expect(manifest.files["praxis/conventions.md"].destinations["amp-code"]).toBeUndefined();
    expect(manifest.files["praxis/conventions.md"].destinations.cursor).toBe(
      ".cursor/conventions.md"
    );
  });

  it("handles removal when managed files are already gone", async () => {
    // No files on disk, but manifest tracks them
    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code"],
        files: {
          "praxis/conventions.md": {
            hash: hashContent("core"),
            destinations: { "amp-code": ".agents/conventions.md" },
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).not.toContain("amp-code");
    expect(manifest.files["praxis/conventions.md"].destinations["amp-code"]).toBeUndefined();
  });

  it("blocks path traversal for tool destination paths", async () => {
    // Create a file outside the project that should NOT be touched
    const evilContent = "should not be deleted";
    await mkdir(join(tmpDir, "outside"), { recursive: true });
    await writeFile(join(tmpDir, "outside/evil.md"), evilContent);

    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code"],
        files: {
          "praxis/conventions.md": {
            hash: hashContent(evilContent),
            destinations: { "amp-code": "../outside/evil.md" },
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    // File outside project root must not be deleted
    expect(existsSync(join(tmpDir, "outside/evil.md"))).toBe(true);
  });

  it("cleans up multiple empty directories after removing tool destinations", async () => {
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"), "browser");
    await mkdir(join(tmpDir, ".agents/agents/reviewers"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/agents/reviewers/security.md"), "security");

    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code"],
        files: {
          "praxis/skills/agent-browser/SKILL.md": {
            hash: hashContent("browser"),
            destinations: { "amp-code": ".agents/skills/agent-browser/SKILL.md" },
          },
          "praxis/agents/reviewers/security.md": {
            hash: hashContent("security"),
            destinations: { "amp-code": ".agents/agents/reviewers/security.md" },
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"))).toBe(false);
    expect(existsSync(join(tmpDir, ".agents/agents/reviewers/security.md"))).toBe(false);
    // Empty directories should be cleaned up
    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser"))).toBe(false);
    expect(existsSync(join(tmpDir, ".agents/agents/reviewers"))).toBe(false);
  });

  it("skips manifest entries without destinations during tool remove", async () => {
    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code"],
        files: {
          "praxis/conventions.md": {
            hash: hashContent("core"),
            // No destinations property — legacy entry
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.enabledTools).not.toContain("amp-code");
  });

  it("skips manifest entries where the tool has no destination", async () => {
    await mkdir(join(tmpDir, ".cursor"), { recursive: true });
    await writeFile(join(tmpDir, ".cursor/conventions.md"), "core");

    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code", "cursor"],
        files: {
          "praxis/conventions.md": {
            hash: hashContent("core"),
            destinations: { cursor: ".cursor/conventions.md" },
            // No amp-code destination
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    // cursor destination should be untouched
    expect(existsSync(join(tmpDir, ".cursor/conventions.md"))).toBe(true);
  });

  it("shows summary with both removed and skipped counts", async () => {
    await mkdir(join(tmpDir, ".agents"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/clean.md"), "original");
    await writeFile(join(tmpDir, ".agents/modified.md"), "locally changed");

    readManifest.mockResolvedValue(
      makeManifest({
        enabledTools: ["amp-code"],
        files: {
          "praxis/clean.md": {
            hash: hashContent("original"),
            destinations: { "amp-code": ".agents/clean.md" },
          },
          "praxis/modified.md": {
            hash: hashContent("original content"),
            destinations: { "amp-code": ".agents/modified.md" },
          },
        },
      })
    );

    await toolRemove(["amp-code"]);

    // clean.md removed, modified.md skipped
    expect(existsSync(join(tmpDir, ".agents/clean.md"))).toBe(false);
    expect(existsSync(join(tmpDir, ".agents/modified.md"))).toBe(true);

    const outroCall = p.outro.mock.calls[0][0];
    expect(outroCall).toContain("removed");
    expect(outroCall).toContain("skipped");
  });
});

describe("toolList", () => {
  it("errors if not initialized", async () => {
    readManifest.mockResolvedValue(null);

    await expect(toolList()).rejects.toThrow("process.exit(1)");
  });

  it("lists all adapters with enabled/disabled status", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["cursor"] })
    );

    await toolList();

    // Should have called p.log.message for each adapter (4 now)
    expect(p.log.message).toHaveBeenCalledTimes(4);
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("4 tool adapter(s)")
    );
  });
});
