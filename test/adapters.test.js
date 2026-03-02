import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  collectMcpConfig,
  getAdapter,
  listAdapters,
} from "../src/adapters.js";

describe("collectMcpConfig", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "adapters-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty object when no skills are selected", async () => {
    const manifest = { selectedComponents: { skills: [], reviewers: [] } };
    const result = await collectMcpConfig(tmpDir, manifest);
    expect(result).toEqual({});
  });

  it("returns empty object when selectedComponents is absent", async () => {
    const manifest = {};
    const result = await collectMcpConfig(tmpDir, manifest);
    expect(result).toEqual({});
  });

  it("reads and merges mcp.json from selected skills", async () => {
    await mkdir(join(tmpDir, ".agents/skills/figma-to-code"), {
      recursive: true,
    });
    await mkdir(join(tmpDir, ".agents/skills/mobile-mcp"), {
      recursive: true,
    });

    await writeFile(
      join(tmpDir, ".agents/skills/figma-to-code/mcp.json"),
      JSON.stringify({
        figma: {
          command: "npx",
          args: ["-y", "figma-developer-mcp", "--stdio"],
          env: { FIGMA_API_KEY: "${FIGMA_API_KEY}" },
        },
      })
    );

    await writeFile(
      join(tmpDir, ".agents/skills/mobile-mcp/mcp.json"),
      JSON.stringify({
        "mobile-mcp": {
          command: "npx",
          args: ["-y", "@mobilenext/mobile-mcp@latest"],
        },
      })
    );

    const manifest = {
      selectedComponents: {
        skills: ["figma-to-code", "mobile-mcp"],
        reviewers: [],
      },
    };

    const result = await collectMcpConfig(tmpDir, manifest);

    expect(result).toEqual({
      figma: {
        command: "npx",
        args: ["-y", "figma-developer-mcp", "--stdio"],
        env: { FIGMA_API_KEY: "${FIGMA_API_KEY}" },
      },
      "mobile-mcp": {
        command: "npx",
        args: ["-y", "@mobilenext/mobile-mcp@latest"],
      },
    });
  });

  it("skips skills with malformed mcp.json", async () => {
    await mkdir(join(tmpDir, ".agents/skills/bad-skill"), { recursive: true });
    await writeFile(
      join(tmpDir, ".agents/skills/bad-skill/mcp.json"),
      "not valid json {"
    );

    const manifest = {
      selectedComponents: { skills: ["bad-skill"], reviewers: [] },
    };

    const result = await collectMcpConfig(tmpDir, manifest);
    expect(result).toEqual({});
  });

  it("skips skills without mcp.json", async () => {
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), {
      recursive: true,
    });

    const manifest = {
      selectedComponents: { skills: ["agent-browser"], reviewers: [] },
    };

    const result = await collectMcpConfig(tmpDir, manifest);
    expect(result).toEqual({});
  });
});

describe("getAdapter", () => {
  it("returns adapter for known names", () => {
    expect(getAdapter("claude-code")).not.toBeNull();
    expect(getAdapter("cursor")).not.toBeNull();
    expect(getAdapter("opencode")).not.toBeNull();
  });

  it("returns null for unknown name", () => {
    expect(getAdapter("unknown")).toBeNull();
  });
});

describe("listAdapters", () => {
  it("returns all three adapters with name, displayName, and files", () => {
    const adapters = listAdapters();
    expect(adapters).toHaveLength(3);

    const names = adapters.map((a) => a.name);
    expect(names).toContain("claude-code");
    expect(names).toContain("cursor");
    expect(names).toContain("opencode");

    for (const adapter of adapters) {
      expect(adapter.displayName).toBeTruthy();
      expect(adapter.files.length).toBeGreaterThan(0);
    }
  });
});

describe("claude-code adapter transform", () => {
  const adapter = getAdapter("claude-code");

  it("produces a symlink entry for CLAUDE.md", () => {
    const results = adapter.transform({});
    const symlink = results.find((r) => r.path === "CLAUDE.md");
    expect(symlink).toEqual({
      path: "CLAUDE.md",
      type: "symlink",
      target: "AGENTS.md",
    });
  });

  it("produces .mcp.json wrapped in mcpServers", () => {
    const mcpConfig = {
      figma: {
        command: "npx",
        args: ["-y", "figma-developer-mcp"],
        env: { FIGMA_API_KEY: "${FIGMA_API_KEY}" },
      },
    };

    const results = adapter.transform(mcpConfig);
    const mcpFile = results.find((r) => r.path === ".mcp.json");

    expect(mcpFile.type).toBe("file");
    const parsed = JSON.parse(mcpFile.content);
    expect(parsed).toEqual({ mcpServers: mcpConfig });
  });

  it("preserves ${VAR} env var syntax (same as Amp)", () => {
    const mcpConfig = {
      test: { command: "cmd", args: [], env: { KEY: "${MY_VAR}" } },
    };

    const results = adapter.transform(mcpConfig);
    const mcpFile = results.find((r) => r.path === ".mcp.json");
    const parsed = JSON.parse(mcpFile.content);

    expect(parsed.mcpServers.test.env.KEY).toBe("${MY_VAR}");
  });
});

describe("cursor adapter transform", () => {
  const adapter = getAdapter("cursor");

  it("produces .cursor/mcp.json wrapped in mcpServers", () => {
    const mcpConfig = {
      figma: { command: "npx", args: [], env: {} },
    };

    const results = adapter.transform(mcpConfig);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe(".cursor/mcp.json");

    const parsed = JSON.parse(results[0].content);
    expect(parsed.mcpServers).toBeTruthy();
  });

  it("transforms env var syntax from ${VAR} to ${env:VAR}", () => {
    const mcpConfig = {
      test: {
        command: "cmd",
        args: [],
        env: { KEY: "${MY_VAR}", OTHER: "${ANOTHER}" },
      },
    };

    const results = adapter.transform(mcpConfig);
    const parsed = JSON.parse(results[0].content);

    expect(parsed.mcpServers.test.env.KEY).toBe("${env:MY_VAR}");
    expect(parsed.mcpServers.test.env.OTHER).toBe("${env:ANOTHER}");
  });
});

describe("opencode adapter transform", () => {
  const adapter = getAdapter("opencode");

  it("produces opencode.json wrapped in mcp key", () => {
    const mcpConfig = {
      figma: { command: "npx", args: ["-y", "figma-mcp"], env: {} },
    };

    const results = adapter.transform(mcpConfig);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("opencode.json");

    const parsed = JSON.parse(results[0].content);
    expect(parsed.mcp).toBeTruthy();
  });

  it("merges command and args into a single command array", () => {
    const mcpConfig = {
      figma: { command: "npx", args: ["-y", "figma-mcp"], env: {} },
    };

    const results = adapter.transform(mcpConfig);
    const parsed = JSON.parse(results[0].content);

    expect(parsed.mcp.figma.command).toEqual(["npx", "-y", "figma-mcp"]);
  });

  it("adds type: local to each server entry", () => {
    const mcpConfig = {
      figma: { command: "npx", args: [], env: {} },
    };

    const results = adapter.transform(mcpConfig);
    const parsed = JSON.parse(results[0].content);

    expect(parsed.mcp.figma.type).toBe("local");
  });

  it("renames env to environment", () => {
    const mcpConfig = {
      test: { command: "cmd", args: [], env: { KEY: "val" } },
    };

    const results = adapter.transform(mcpConfig);
    const parsed = JSON.parse(results[0].content);

    expect(parsed.mcp.test.environment).toBeTruthy();
    expect(parsed.mcp.test.env).toBeUndefined();
  });

  it("transforms env var syntax from ${VAR} to {env:VAR}", () => {
    const mcpConfig = {
      test: { command: "cmd", args: [], env: { KEY: "${MY_VAR}" } },
    };

    const results = adapter.transform(mcpConfig);
    const parsed = JSON.parse(results[0].content);

    expect(parsed.mcp.test.environment.KEY).toBe("{env:MY_VAR}");
  });

  it("sets mergeKey to mcp for opencode.json merge logic", () => {
    const results = adapter.transform({});
    expect(results[0].mergeKey).toBe("mcp");
  });

  it("handles entries without args", () => {
    const mcpConfig = {
      test: { command: "cmd", env: {} },
    };

    const results = adapter.transform(mcpConfig);
    const parsed = JSON.parse(results[0].content);

    expect(parsed.mcp.test.command).toEqual(["cmd"]);
  });
});
