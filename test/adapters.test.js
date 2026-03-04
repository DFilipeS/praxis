import { existsSync } from "node:fs";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  collectMcpConfig,
  getAdapter,
  listAdapters,
  regenerateToolConfigs,
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
    await mkdir(join(tmpDir, "praxis/skills/figma-to-code"), {
      recursive: true,
    });
    await mkdir(join(tmpDir, "praxis/skills/mobile-mcp"), {
      recursive: true,
    });

    await writeFile(
      join(tmpDir, "praxis/skills/figma-to-code/mcp.json"),
      JSON.stringify({
        figma: {
          command: "npx",
          args: ["-y", "figma-developer-mcp", "--stdio"],
          env: { FIGMA_API_KEY: "${FIGMA_API_KEY}" },
        },
      })
    );

    await writeFile(
      join(tmpDir, "praxis/skills/mobile-mcp/mcp.json"),
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
    await mkdir(join(tmpDir, "praxis/skills/bad-skill"), { recursive: true });
    await writeFile(
      join(tmpDir, "praxis/skills/bad-skill/mcp.json"),
      "not valid json {"
    );

    const manifest = {
      selectedComponents: { skills: ["bad-skill"], reviewers: [] },
    };

    const result = await collectMcpConfig(tmpDir, manifest);
    expect(result).toEqual({});
  });

  it("skips skills with path traversal in name", async () => {
    const manifest = {
      selectedComponents: { skills: ["../../etc"], reviewers: [] },
    };

    const result = await collectMcpConfig(tmpDir, manifest);
    expect(result).toEqual({});
  });

  it("returns empty when selectedComponents has no skills property", async () => {
    const manifest = { selectedComponents: {} };
    const result = await collectMcpConfig(tmpDir, manifest);
    expect(result).toEqual({});
  });

  it("skips skills without mcp.json", async () => {
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), {
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
    expect(getAdapter("amp-code")).not.toBeNull();
    expect(getAdapter("claude-code")).not.toBeNull();
    expect(getAdapter("cursor")).not.toBeNull();
    expect(getAdapter("opencode")).not.toBeNull();
  });

  it("returns null for unknown name", () => {
    expect(getAdapter("unknown")).toBeNull();
  });
});

describe("listAdapters", () => {
  it("returns all four adapters with name and displayName", () => {
    const adapters = listAdapters();
    expect(adapters).toHaveLength(4);

    const names = adapters.map((a) => a.name);
    expect(names).toContain("amp-code");
    expect(names).toContain("claude-code");
    expect(names).toContain("cursor");
    expect(names).toContain("opencode");

    for (const adapter of adapters) {
      expect(adapter.displayName).toBeTruthy();
    }
  });
});

describe("amp-code adapter", () => {
  const adapter = getAdapter("amp-code");

  it("maps praxis/ files to .agents/", () => {
    expect(adapter.getDestinationPath("praxis/conventions.md")).toBe(
      ".agents/conventions.md"
    );
    expect(adapter.getDestinationPath("praxis/skills/px-brainstorm/SKILL.md")).toBe(
      ".agents/skills/px-brainstorm/SKILL.md"
    );
    expect(adapter.getDestinationPath("praxis/agents/reviewers/security.md")).toBe(
      ".agents/agents/reviewers/security.md"
    );
  });

  it("returns null for non-praxis files", () => {
    expect(adapter.getDestinationPath("README.md")).toBeNull();
  });

  it("returns null for generateMcpConfig (reads per-skill mcp.json directly)", () => {
    expect(adapter.generateMcpConfig({})).toBeNull();
  });

  it("returns null for getMcpConfigPath", () => {
    expect(adapter.getMcpConfigPath()).toBeNull();
  });

  it("returns managed files from source files", () => {
    const managed = adapter.getManagedFiles([
      "praxis/conventions.md",
      "praxis/skills/px-brainstorm/SKILL.md",
    ]);
    expect(managed).toEqual([
      ".agents/conventions.md",
      ".agents/skills/px-brainstorm/SKILL.md",
    ]);
  });
});

describe("claude-code adapter", () => {
  const adapter = getAdapter("claude-code");

  it("maps praxis/ files to .claude/", () => {
    expect(adapter.getDestinationPath("praxis/conventions.md")).toBe(
      ".claude/conventions.md"
    );
    expect(adapter.getDestinationPath("praxis/skills/px-brainstorm/SKILL.md")).toBe(
      ".claude/skills/px-brainstorm/SKILL.md"
    );
    expect(adapter.getDestinationPath("praxis/agents/reviewers/security.md")).toBe(
      ".claude/agents/reviewers/security.md"
    );
  });

  it("generates .mcp.json with mcpServers", () => {
    const mcpConfig = {
      figma: {
        command: "npx",
        args: ["-y", "figma-developer-mcp"],
        env: { FIGMA_API_KEY: "${FIGMA_API_KEY}" },
      },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    expect(result.path).toBe(".mcp.json");
    const parsed = JSON.parse(result.content);
    expect(parsed).toEqual({ mcpServers: mcpConfig });
  });

  it("preserves ${VAR} env var syntax", () => {
    const mcpConfig = {
      test: { command: "cmd", args: [], env: { KEY: "${MY_VAR}" } },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);
    expect(parsed.mcpServers.test.env.KEY).toBe("${MY_VAR}");
  });
});

describe("cursor adapter", () => {
  const adapter = getAdapter("cursor");

  it("maps praxis/ files to .cursor/", () => {
    expect(adapter.getDestinationPath("praxis/conventions.md")).toBe(
      ".cursor/conventions.md"
    );
    expect(adapter.getDestinationPath("praxis/skills/figma-to-code/SKILL.md")).toBe(
      ".cursor/skills/figma-to-code/SKILL.md"
    );
  });

  it("generates .cursor/mcp.json with mcpServers", () => {
    const mcpConfig = {
      figma: { command: "npx", args: [], env: {} },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    expect(result.path).toBe(".cursor/mcp.json");
    const parsed = JSON.parse(result.content);
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

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);
    expect(parsed.mcpServers.test.env.KEY).toBe("${env:MY_VAR}");
    expect(parsed.mcpServers.test.env.OTHER).toBe("${env:ANOTHER}");
  });
});

describe("opencode adapter", () => {
  const adapter = getAdapter("opencode");

  it("maps praxis/ files to .opencode/", () => {
    expect(adapter.getDestinationPath("praxis/conventions.md")).toBe(
      ".opencode/conventions.md"
    );
    expect(adapter.getDestinationPath("praxis/skills/mobile-mcp/SKILL.md")).toBe(
      ".opencode/skills/mobile-mcp/SKILL.md"
    );
    expect(adapter.getDestinationPath("praxis/agents/reviewers/security.md")).toBe(
      ".opencode/agents/reviewers/security.md"
    );
  });

  it("generates opencode.json with mcp key", () => {
    const mcpConfig = {
      figma: { command: "npx", args: ["-y", "figma-mcp"], env: {} },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    expect(result.path).toBe("opencode.json");
    const parsed = JSON.parse(result.content);
    expect(parsed.mcp).toBeTruthy();
  });

  it("merges command and args into a single command array", () => {
    const mcpConfig = {
      figma: { command: "npx", args: ["-y", "figma-mcp"], env: {} },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);
    expect(parsed.mcp.figma.command).toEqual(["npx", "-y", "figma-mcp"]);
  });

  it("adds type: local to each server entry", () => {
    const mcpConfig = {
      figma: { command: "npx", args: [], env: {} },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);
    expect(parsed.mcp.figma.type).toBe("local");
  });

  it("renames env to environment", () => {
    const mcpConfig = {
      test: { command: "cmd", args: [], env: { KEY: "val" } },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);
    expect(parsed.mcp.test.environment).toBeTruthy();
    expect(parsed.mcp.test.env).toBeUndefined();
  });

  it("transforms env var syntax from ${VAR} to {env:VAR}", () => {
    const mcpConfig = {
      test: { command: "cmd", args: [], env: { KEY: "${MY_VAR}" } },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);
    expect(parsed.mcp.test.environment.KEY).toBe("{env:MY_VAR}");
  });

  it("sets mergeKey to mcp for opencode.json merge logic", () => {
    const result = adapter.generateMcpConfig({});
    expect(result.mergeKey).toBe("mcp");
  });

  it("handles entries without args", () => {
    const mcpConfig = {
      test: { command: "cmd", env: {} },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);
    expect(parsed.mcp.test.command).toEqual(["cmd"]);
  });

  it("handles entries without env", () => {
    const mcpConfig = {
      test: { command: "cmd", args: ["-y"] },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);
    expect(parsed.mcp.test.environment).toEqual({});
    expect(parsed.mcp.test.command).toEqual(["cmd", "-y"]);
  });
});

describe("env var transform edge cases", () => {
  it("passes through non-string, non-array, non-object values unchanged", () => {
    const adapter = getAdapter("cursor");
    const mcpConfig = {
      test: {
        command: "cmd",
        args: [],
        env: { KEY: "${VAR}" },
        includeTools: ["tool1", "tool2"],
        timeout: 30,
        enabled: true,
      },
    };

    const result = adapter.generateMcpConfig(mcpConfig);
    const parsed = JSON.parse(result.content);

    // Numbers and booleans pass through unchanged
    expect(parsed.mcpServers.test.timeout).toBe(30);
    expect(parsed.mcpServers.test.enabled).toBe(true);
    // Arrays of strings are transformed
    expect(parsed.mcpServers.test.includeTools).toEqual(["tool1", "tool2"]);
  });
});

describe("regenerateToolConfigs", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "adapters-regen-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no tools are enabled", async () => {
    const manifest = { enabledTools: [], selectedComponents: { skills: [], reviewers: [] } };
    const result = await regenerateToolConfigs(tmpDir, manifest);
    expect(result).toEqual([]);
  });

  it("returns empty array when enabledTools is absent", async () => {
    const manifest = { selectedComponents: { skills: [], reviewers: [] } };
    const result = await regenerateToolConfigs(tmpDir, manifest);
    expect(result).toEqual([]);
  });

  it("writes MCP config files for cursor", async () => {
    await mkdir(join(tmpDir, "praxis/skills/figma-to-code"), { recursive: true });
    await writeFile(
      join(tmpDir, "praxis/skills/figma-to-code/mcp.json"),
      JSON.stringify({ figma: { command: "npx", args: ["-y", "figma"], env: { K: "${V}" } } })
    );

    const manifest = {
      enabledTools: ["cursor"],
      selectedComponents: { skills: ["figma-to-code"], reviewers: [] },
    };

    await regenerateToolConfigs(tmpDir, manifest);

    const content = JSON.parse(await readFile(join(tmpDir, ".cursor/mcp.json"), "utf-8"));
    expect(content.mcpServers.figma.env.K).toBe("${env:V}");
  });

  it("merges mcp key into existing opencode.json", async () => {
    await writeFile(
      join(tmpDir, "opencode.json"),
      JSON.stringify({ provider: { default: "anthropic" } }, null, 2) + "\n"
    );

    const manifest = {
      enabledTools: ["opencode"],
      selectedComponents: { skills: [], reviewers: [] },
    };

    await regenerateToolConfigs(tmpDir, manifest);

    const content = JSON.parse(await readFile(join(tmpDir, "opencode.json"), "utf-8"));
    expect(content.provider).toEqual({ default: "anthropic" });
    expect(content.mcp).toBeTruthy();
  });

  it("overwrites opencode.json when existing file has invalid JSON", async () => {
    await writeFile(join(tmpDir, "opencode.json"), "not json {");

    const manifest = {
      enabledTools: ["opencode"],
      selectedComponents: { skills: [], reviewers: [] },
    };

    await regenerateToolConfigs(tmpDir, manifest);

    const content = JSON.parse(await readFile(join(tmpDir, "opencode.json"), "utf-8"));
    expect(content.mcp).toBeTruthy();
  });

  it("skips unknown adapter names", async () => {
    const manifest = {
      enabledTools: ["nonexistent"],
      selectedComponents: { skills: [], reviewers: [] },
    };

    const result = await regenerateToolConfigs(tmpDir, manifest);
    expect(result).toEqual([]);
  });

  it("returns list of regenerated tool names", async () => {
    const manifest = {
      enabledTools: ["cursor", "opencode"],
      selectedComponents: { skills: [], reviewers: [] },
    };

    const result = await regenerateToolConfigs(tmpDir, manifest);
    expect(result).toEqual(["cursor", "opencode"]);
  });

  it("includes amp-code in regenerated list even though it has no MCP config", async () => {
    const manifest = {
      enabledTools: ["amp-code"],
      selectedComponents: { skills: [], reviewers: [] },
    };

    const result = await regenerateToolConfigs(tmpDir, manifest);
    expect(result).toEqual(["amp-code"]);
  });
});
