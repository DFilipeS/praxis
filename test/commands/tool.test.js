import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@clack/prompts");
vi.mock("../../src/manifest.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readManifest: vi.fn(),
    writeManifest: vi.fn(actual.writeManifest),
  };
});
vi.mock("../../src/adapters.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAdapter: vi.fn(actual.getAdapter),
  };
});

import * as p from "@clack/prompts";
import { readManifest, writeManifest, hashContent } from "../../src/manifest.js";
import { getAdapter } from "../../src/adapters.js";
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

  it("generates .mcp.json and CLAUDE.md symlink for claude-code", async () => {
    // Set up a skill with mcp.json
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

    // CLAUDE.md should be a symlink to AGENTS.md
    const linkTarget = await readlink(join(tmpDir, "CLAUDE.md"));
    expect(linkTarget).toBe("AGENTS.md");

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

  it("warns and skips CLAUDE.md when it exists as a regular file", async () => {
    await writeFile(join(tmpDir, "CLAUDE.md"), "# My custom Claude instructions");

    readManifest.mockResolvedValue(makeManifest());

    await toolAdd(["claude-code"]);

    // Should still be a regular file, not overwritten
    const content = await readFile(join(tmpDir, "CLAUDE.md"), "utf-8");
    expect(content).toBe("# My custom Claude instructions");
    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("already exists and is not a symlink")
    );
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

  it("overwrites existing CLAUDE.md symlink", async () => {
    const { symlink } = await import("node:fs/promises");
    await symlink("OLD_TARGET.md", join(tmpDir, "CLAUDE.md"));

    readManifest.mockResolvedValue(makeManifest());

    await toolAdd(["claude-code"]);

    const linkTarget = await readlink(join(tmpDir, "CLAUDE.md"));
    expect(linkTarget).toBe("AGENTS.md");
  });

  it("overwrites existing opencode.json with invalid JSON via writeAdapterFiles", async () => {
    await writeFile(join(tmpDir, "opencode.json"), "not json {");

    readManifest.mockResolvedValue(makeManifest());

    await toolAdd(["opencode"]);

    const content = JSON.parse(
      await readFile(join(tmpDir, "opencode.json"), "utf-8")
    );
    expect(content.mcp).toBeTruthy();
  });

  it("merges mcp into existing opencode.json via writeAdapterFiles", async () => {
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

  it("removes CLAUDE.md symlink and .mcp.json", async () => {
    await writeFile(join(tmpDir, ".mcp.json"), "{}");
    // Create a symlink
    const { symlink } = await import("node:fs/promises");
    await symlink("AGENTS.md", join(tmpDir, "CLAUDE.md"));

    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["claude-code"] })
    );

    await toolRemove(["claude-code"]);

    expect(existsSync(join(tmpDir, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(tmpDir, ".mcp.json"))).toBe(false);
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

    // Should have called p.log.message for each adapter
    expect(p.log.message).toHaveBeenCalledTimes(3);
    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("3 tool adapter(s)")
    );
  });
});

describe("security guards", () => {
  it("skips entries with path traversal in writeAdapterFiles", async () => {
    readManifest.mockResolvedValue(makeManifest());

    // Return an adapter whose transform produces a traversal path
    getAdapter.mockReturnValueOnce({
      displayName: "Evil",
      files: ["../../evil.json"],
      transform: () => [
        { path: "../../evil.json", type: "file", content: "{}\n" },
      ],
    });

    await toolAdd(["cursor"]);

    // The traversal path should not have been written
    expect(existsSync(join(tmpDir, "../../evil.json"))).toBe(false);
  });

  it("skips entries with path traversal in removeAdapterFiles", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["cursor"] })
    );

    getAdapter.mockReturnValueOnce({
      displayName: "Evil",
      files: ["../../evil.json"],
      transform: () => [
        { path: "../../evil.json", type: "file", content: "{}\n" },
      ],
    });

    await toolRemove(["cursor"]);

    // Should complete without error
    expect(p.outro).toHaveBeenCalled();
  });

  it("returns 0 when adapter is null in removeAdapterFiles", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ enabledTools: ["cursor"] })
    );

    // Simulate a stale/unknown adapter name in manifest
    getAdapter.mockReturnValueOnce(null);

    await toolRemove(["cursor"]);

    // Should complete without crashing
    expect(p.outro).toHaveBeenCalled();
  });
});
