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
vi.mock("../../src/files.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    installFile: vi.fn(actual.installFile),
    installToDestinations: vi.fn(actual.installToDestinations),
    isSafePath: actual.isSafePath,
  };
});
vi.mock("../../src/adapters.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    regenerateToolConfigs: vi.fn(actual.regenerateToolConfigs),
  };
});

import * as p from "@clack/prompts";
import { fetchTemplates } from "../../src/templates.js";
import { readManifest, hashContent, writeManifest } from "../../src/manifest.js";
import { installFile } from "../../src/files.js";
import { regenerateToolConfigs } from "../../src/adapters.js";
import { components } from "../../src/commands/components.js";

let tmpDir;

function makeManifest(files, selectedComponents = { skills: [], reviewers: [] }) {
  return {
    version: "1.0.0",
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    selectedComponents,
    files: Object.fromEntries(
      Object.entries(files).map(([path, content]) => [
        path,
        { hash: hashContent(content) },
      ])
    ),
  };
}

const CORE_FILE = "praxis/conventions.md";
const BROWSER_SKILL = "praxis/skills/agent-browser/SKILL.md";
const FIGMA_SKILL = "praxis/skills/figma-to-code/SKILL.md";
const SECURITY_REVIEWER = "praxis/agents/reviewers/security.md";

const defaultTemplates = new Map([
  [CORE_FILE, "# Core"],
  [BROWSER_SKILL, '---\ndescription: "Browser automation"\n---'],
  [FIGMA_SKILL, '---\ndescription: "Figma to code"\n---'],
  [SECURITY_REVIEWER, '---\ndescription: "Security review"\n---'],
]);

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "praxis-components-test-"));
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
  p.groupMultiselect = vi.fn().mockResolvedValue([]);
  p.confirm = vi.fn().mockResolvedValue(true);
  p.select = vi.fn().mockResolvedValue("skip");

  fetchTemplates.mockResolvedValue(defaultTemplates);

  // Set up a project root with core file
  await mkdir(join(tmpDir, "praxis"), { recursive: true });
  await writeFile(join(tmpDir, CORE_FILE), "# Core");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("components", () => {
  it("errors if not initialized", async () => {
    readManifest.mockResolvedValue(null);

    await expect(components()).rejects.toThrow("process.exit(1)");
    expect(p.log.error).toHaveBeenCalledWith(
      expect.stringContaining("not initialized")
    );
  });

  it("installs newly added component files and reports file count", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    // User adds agent-browser
    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    await components();

    expect(existsSync(join(tmpDir, BROWSER_SKILL))).toBe(true);
    expect(await readFile(join(tmpDir, BROWSER_SKILL), "utf-8")).toBe(
      '---\ndescription: "Browser automation"\n---'
    );

    // Manifest updated
    const raw = await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.selectedComponents).toEqual({ skills: ["agent-browser"], reviewers: [] });
    expect(manifest.files[BROWSER_SKILL]).toBeTruthy();

    // Summary reports file count, not component count
    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining("file(s) added"));
  });

  it("removes deselected component files and reports file count", async () => {
    // Start with agent-browser selected and installed
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), '---\ndescription: "Browser automation"\n---');

    readManifest.mockResolvedValue(
      makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      )
    );

    // User deselects agent-browser (selects nothing)
    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    await components();

    expect(existsSync(join(tmpDir, BROWSER_SKILL))).toBe(false);

    const raw = await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.selectedComponents).toEqual({ skills: [], reviewers: [] });
    expect(manifest.files[BROWSER_SKILL]).toBeUndefined();

    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining("file(s) removed"));
  });

  it("warns before removing locally modified file", async () => {
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), "locally modified content");

    readManifest.mockResolvedValue(
      makeManifest(
        {
          [CORE_FILE]: "# Core",
          // Hash in manifest does NOT match disk — simulates local modification
          [BROWSER_SKILL]: "original content",
        },
        { skills: ["agent-browser"], reviewers: [] }
      )
    );

    p.groupMultiselect = vi.fn().mockResolvedValue([]);
    p.confirm = vi.fn().mockResolvedValue(true); // user confirms removal

    await components();

    expect(p.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("local modifications") })
    );
    expect(existsSync(join(tmpDir, BROWSER_SKILL))).toBe(false);
  });

  it("keeps locally modified file if user declines removal", async () => {
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), "locally modified content");

    readManifest.mockResolvedValue(
      makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: "original content",
        },
        { skills: ["agent-browser"], reviewers: [] }
      )
    );

    p.groupMultiselect = vi.fn().mockResolvedValue([]);
    p.confirm = vi.fn().mockResolvedValue(false); // user declines removal

    await components();

    expect(existsSync(join(tmpDir, BROWSER_SKILL))).toBe(true);
    expect(await readFile(join(tmpDir, BROWSER_SKILL), "utf-8")).toBe(
      "locally modified content"
    );
  });

  it("cancels on groupMultiselect cancel", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    const cancelSymbol = Symbol("cancel");
    p.groupMultiselect = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(components()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("reports no changes when selection is unchanged", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: ["agent-browser"], reviewers: [] })
    );

    // Same selection as current
    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    await components();

    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("No changes")
    );
  });

  it("does not count file as added when content already matches", async () => {
    // Pre-create BROWSER_SKILL with the exact same content as the template
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), '---\ndescription: "Browser automation"\n---');

    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    await components();

    // status === "matched" — filesAdded stays 0, no "file(s) added" in summary
    expect(p.outro).toHaveBeenCalledWith(expect.not.stringContaining("file(s) added"));

    const raw = await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.files[BROWSER_SKILL]).toBeTruthy();
    expect(manifest.selectedComponents).toEqual({ skills: ["agent-browser"], reviewers: [] });
  });

  it("installs reviewer component and records in manifest", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    // User adds the security reviewer
    p.groupMultiselect = vi.fn().mockResolvedValue(["reviewer:security"]);

    await components();

    expect(existsSync(join(tmpDir, SECURITY_REVIEWER))).toBe(true);

    const raw = await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.selectedComponents).toEqual({ skills: [], reviewers: ["security"] });
    expect(manifest.files[SECURITY_REVIEWER]).toBeTruthy();
  });

  it("shows error and exits on fetchTemplates failure", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    fetchTemplates.mockRejectedValueOnce(new Error("Network error"));

    await expect(components()).rejects.toThrow("process.exit(1)");
    expect(p.log.error).toHaveBeenCalledWith("Network error");
  });

  it("blocks path traversal in additions loop", async () => {
    // 4 levels of ".." are needed to escape tmpDir from inside praxis/skills/agent-browser/
    const traversalPath = "praxis/skills/agent-browser/../../../../evil";
    fetchTemplates.mockResolvedValue(
      new Map([
        [CORE_FILE, "# Core"],
        [BROWSER_SKILL, '---\ndescription: "Browser automation"\n---'],
        [traversalPath, "malicious"],
      ])
    );

    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    await components();

    // Traversal path was blocked; the legitimate file was installed
    expect(existsSync(join(tmpDir, BROWSER_SKILL))).toBe(true);
  });

  it("blocks path traversal in removals loop", async () => {
    const traversalPath = "praxis/skills/agent-browser/../../../../evil";
    fetchTemplates.mockResolvedValue(
      new Map([
        [CORE_FILE, "# Core"],
        [BROWSER_SKILL, '---\ndescription: "Browser automation"\n---'],
        [traversalPath, "malicious"],
      ])
    );

    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), '---\ndescription: "Browser automation"\n---');

    readManifest.mockResolvedValue(
      makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      )
    );

    // Deselect agent-browser — triggers removals loop
    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    await components();

    // Traversal guard prevented touching the evil path; legitimate file was removed
    expect(existsSync(join(tmpDir, BROWSER_SKILL))).toBe(false);
  });

  it("removes manifest entry when component file is already gone from disk", async () => {
    readManifest.mockResolvedValue(
      makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      )
    );

    // BROWSER_SKILL is in manifest but NOT on disk — should silently clean manifest
    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    await components();

    const raw = await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.files[BROWSER_SKILL]).toBeUndefined();
    expect(manifest.selectedComponents).toEqual({ skills: [], reviewers: [] });
  });

  it("executes reviewer map callback when reviewer is in current selection", async () => {
    // Start with a reviewer selected so currentValues includes reviewer:security
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: ["security"] })
    );

    // No change — same selection returned
    p.groupMultiselect = vi.fn().mockResolvedValue(["reviewer:security"]);

    await components();

    expect(p.log.info).toHaveBeenCalledWith(expect.stringContaining("No changes"));
  });

  it("cancels when installFile returns cancelled during additions", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);
    installFile.mockResolvedValueOnce({ status: "cancelled" });

    await expect(components()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
    // Partial state should be saved before exit so already-written files are tracked
    expect(writeManifest).toHaveBeenCalled();
  });

  it("logs warning when writeManifest fails in error catch block", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    // installFile throws — triggers catch block
    installFile.mockRejectedValueOnce(new Error("disk full"));
    // writeManifest in catch block also throws — warning is logged
    writeManifest.mockRejectedValueOnce(new Error("cannot write"));

    // Original error is re-thrown regardless of writeManifest failure
    await expect(components()).rejects.toThrow("disk full");
    expect(writeManifest).toHaveBeenCalled();
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining("Could not save partial state"));
  });

  it("cancels on confirm cancel when removing locally modified file", async () => {
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), "locally modified content");

    readManifest.mockResolvedValue(
      makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: "original content",
        },
        { skills: ["agent-browser"], reviewers: [] }
      )
    );

    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    const cancelSymbol = Symbol("cancel");
    p.confirm = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(components()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
    // Partial state should be saved before exit
    expect(writeManifest).toHaveBeenCalled();
  });

  it("swallows writeManifest failure on additions cancel", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);
    installFile.mockResolvedValueOnce({ status: "cancelled" });
    writeManifest.mockRejectedValueOnce(new Error("write failed"));

    // writeManifest rejection is swallowed; process.exit(0) is still thrown
    await expect(components()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("swallows writeManifest failure on removals cancel", async () => {
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), "locally modified content");

    readManifest.mockResolvedValue(
      makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: "original content",
        },
        { skills: ["agent-browser"], reviewers: [] }
      )
    );

    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    const cancelSymbol = Symbol("cancel");
    p.confirm = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");
    writeManifest.mockRejectedValueOnce(new Error("write failed"));

    // writeManifest rejection is swallowed; process.exit(0) is still thrown
    await expect(components()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("sorts and removes empty directories after removing multi-file component", async () => {
    const BROWSER_HELPER = "praxis/skills/agent-browser/helpers/utils.md";
    fetchTemplates.mockResolvedValue(
      new Map([
        [CORE_FILE, "# Core"],
        [BROWSER_SKILL, '---\ndescription: "Browser automation"\n---'],
        [BROWSER_HELPER, "# Utils"],
        [FIGMA_SKILL, '---\ndescription: "Figma to code"\n---'],
        [SECURITY_REVIEWER, '---\ndescription: "Security review"\n---'],
      ])
    );

    await mkdir(join(tmpDir, "praxis/skills/agent-browser/helpers"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), '---\ndescription: "Browser automation"\n---');
    await writeFile(join(tmpDir, BROWSER_HELPER), "# Utils");

    readManifest.mockResolvedValue(
      makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
          [BROWSER_HELPER]: "# Utils",
        },
        { skills: ["agent-browser"], reviewers: [] }
      )
    );

    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    await components();

    expect(existsSync(join(tmpDir, BROWSER_SKILL))).toBe(false);
    expect(existsSync(join(tmpDir, BROWSER_HELPER))).toBe(false);
    // Nested helper dir removed first, then parent dir
    expect(existsSync(join(tmpDir, "praxis/skills/agent-browser/helpers"))).toBe(false);
    expect(existsSync(join(tmpDir, "praxis/skills/agent-browser"))).toBe(false);
  });

  it("writes partial manifest state on unexpected error during additions", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    // Make installFile throw to trigger the catch block
    installFile.mockRejectedValueOnce(new Error("disk full"));

    await expect(components()).rejects.toThrow("disk full");

    // Partial manifest should have been written with the user's intended selection
    // so the manifest reflects what was being applied, not the old stale state
    const raw = await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.selectedComponents).toEqual({ skills: ["agent-browser"], reviewers: [] });
  });

  it("outro when no optional components available", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        [CORE_FILE, "# Core"],
        ["praxis/skills/px-brainstorm/SKILL.md", "# Core skill"],
      ])
    );

    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    await components();

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("No optional components available")
    );
    expect(p.groupMultiselect).not.toHaveBeenCalled();
  });

  it("regenerates tool configs when adding a skill with mcp.json and tools are enabled", async () => {
    const FIGMA_MCP = "praxis/skills/figma-to-code/mcp.json";
    const figmaMcp = JSON.stringify({
      figma: {
        command: "npx",
        args: ["-y", "figma-mcp"],
        env: { KEY: "${MY_KEY}" },
      },
    });

    fetchTemplates.mockResolvedValue(
      new Map([
        [CORE_FILE, "# Core"],
        [FIGMA_SKILL, '---\ndescription: "Figma to code"\n---'],
        [FIGMA_MCP, figmaMcp],
        [BROWSER_SKILL, '---\ndescription: "Browser automation"\n---'],
        [SECURITY_REVIEWER, '---\ndescription: "Security review"\n---'],
      ])
    );

    // Set up figma mcp.json on disk (it gets installed by the component add)
    await mkdir(join(tmpDir, "praxis/skills/figma-to-code"), { recursive: true });
    await writeFile(join(tmpDir, "praxis/skills/figma-to-code/mcp.json"), figmaMcp);

    // cursor is already enabled
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );
    // Override to add enabledTools
    readManifest.mockResolvedValue({
      ...makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] }),
      enabledTools: ["cursor"],
    });

    // User adds figma-to-code
    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:figma-to-code"]);

    await components();

    // .cursor/mcp.json should have been regenerated
    expect(existsSync(join(tmpDir, ".cursor/mcp.json"))).toBe(true);
    const cursorConfig = JSON.parse(
      await readFile(join(tmpDir, ".cursor/mcp.json"), "utf-8")
    );
    expect(cursorConfig.mcpServers.figma).toBeTruthy();
    expect(cursorConfig.mcpServers.figma.env.KEY).toBe("${env:MY_KEY}");

    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("Updated MCP config for cursor")
    );
  });

  it("does not regenerate tool configs when no tools are enabled", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    await components();

    // No MCP config message
    const infoCalls = p.log.info.mock.calls.map((c) => c[0]);
    expect(infoCalls.every((msg) => !msg.includes("Updated MCP config"))).toBe(true);
  });

  it("warns but continues when regenerateToolConfigs throws", async () => {
    readManifest.mockResolvedValue({
      ...makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] }),
      enabledTools: ["cursor"],
    });

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);
    regenerateToolConfigs.mockRejectedValueOnce(new Error("disk full"));

    await components();

    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not regenerate tool configs")
    );
    // Outro should still be shown
    expect(p.outro).toHaveBeenCalled();
  });

  it("installs component files to tool destinations when tools are enabled", async () => {
    readManifest.mockResolvedValue({
      ...makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] }),
      enabledTools: ["amp-code"],
    });

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    await components();

    // File should be installed at amp-code destination
    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"))).toBe(true);

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.files[BROWSER_SKILL].destinations["amp-code"]).toBe(
      ".agents/skills/agent-browser/SKILL.md"
    );
  });

  it("removes component files from tool destinations when tools are enabled", async () => {
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
    await writeFile(
      join(tmpDir, ".agents/skills/agent-browser/SKILL.md"),
      '---\ndescription: "Browser automation"\n---'
    );

    readManifest.mockResolvedValue({
      ...makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      ),
      enabledTools: ["amp-code"],
      files: {
        [CORE_FILE]: { hash: hashContent("# Core") },
        [BROWSER_SKILL]: {
          hash: hashContent('---\ndescription: "Browser automation"\n---'),
          destinations: {
            "amp-code": ".agents/skills/agent-browser/SKILL.md",
          },
        },
      },
    });

    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    await components();

    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"))).toBe(false);
    // Empty dirs should be cleaned up
    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser"))).toBe(false);
  });

  it("removes component from manifest when tool destination file is already gone", async () => {
    // No file on disk at .agents/skills/agent-browser/SKILL.md

    readManifest.mockResolvedValue({
      ...makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      ),
      enabledTools: ["amp-code"],
      files: {
        [CORE_FILE]: { hash: hashContent("# Core") },
        [BROWSER_SKILL]: {
          hash: hashContent('---\ndescription: "Browser automation"\n---'),
          destinations: {
            "amp-code": ".agents/skills/agent-browser/SKILL.md",
          },
        },
      },
    });

    // Also put the source file on disk so the source-file removal path works
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), '---\ndescription: "Browser automation"\n---');

    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    await components();

    const raw = await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.files[BROWSER_SKILL]).toBeUndefined();
  });

  it("prompts and removes locally modified tool destination file when user confirms", async () => {
    // Create destination file with different content than the hash
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"), "locally modified dest");

    // Source file on disk
    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), '---\ndescription: "Browser automation"\n---');

    readManifest.mockResolvedValue({
      ...makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      ),
      enabledTools: ["amp-code"],
      files: {
        [CORE_FILE]: { hash: hashContent("# Core") },
        [BROWSER_SKILL]: {
          hash: hashContent('---\ndescription: "Browser automation"\n---'),
          destinations: {
            "amp-code": ".agents/skills/agent-browser/SKILL.md",
          },
        },
      },
    });

    p.groupMultiselect = vi.fn().mockResolvedValue([]);
    p.confirm = vi.fn().mockResolvedValue(true);

    await components();

    expect(p.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("local modifications") })
    );
    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"))).toBe(false);
  });

  it("keeps locally modified tool destination file when user declines", async () => {
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"), "locally modified dest");

    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), '---\ndescription: "Browser automation"\n---');

    readManifest.mockResolvedValue({
      ...makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      ),
      enabledTools: ["amp-code"],
      files: {
        [CORE_FILE]: { hash: hashContent("# Core") },
        [BROWSER_SKILL]: {
          hash: hashContent('---\ndescription: "Browser automation"\n---'),
          destinations: {
            "amp-code": ".agents/skills/agent-browser/SKILL.md",
          },
        },
      },
    });

    p.groupMultiselect = vi.fn().mockResolvedValue([]);
    p.confirm = vi.fn().mockResolvedValue(false);

    await components();

    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"))).toBe(true);
    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("kept")
    );
  });

  it("swallows writeManifest failure on tool destination removal cancel", async () => {
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
    await writeFile(
      join(tmpDir, ".agents/skills/agent-browser/SKILL.md"),
      "locally modified"
    );

    readManifest.mockResolvedValue({
      ...makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      ),
      enabledTools: ["amp-code"],
      files: {
        [CORE_FILE]: { hash: hashContent("# Core") },
        [BROWSER_SKILL]: {
          hash: hashContent('---\ndescription: "Browser automation"\n---'),
          destinations: {
            "amp-code": ".agents/skills/agent-browser/SKILL.md",
          },
        },
      },
    });

    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    const cancelSymbol = Symbol("cancel");
    p.confirm = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");
    writeManifest.mockRejectedValueOnce(new Error("write failed"));

    await expect(components()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("cancels when user cancels confirm for locally modified tool destination removal", async () => {
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"), "locally modified dest");

    await mkdir(join(tmpDir, "praxis/skills/agent-browser"), { recursive: true });
    await writeFile(join(tmpDir, BROWSER_SKILL), '---\ndescription: "Browser automation"\n---');

    readManifest.mockResolvedValue({
      ...makeManifest(
        {
          [CORE_FILE]: "# Core",
          [BROWSER_SKILL]: '---\ndescription: "Browser automation"\n---',
        },
        { skills: ["agent-browser"], reviewers: [] }
      ),
      enabledTools: ["amp-code"],
      files: {
        [CORE_FILE]: { hash: hashContent("# Core") },
        [BROWSER_SKILL]: {
          hash: hashContent('---\ndescription: "Browser automation"\n---'),
          destinations: {
            "amp-code": ".agents/skills/agent-browser/SKILL.md",
          },
        },
      },
    });

    p.groupMultiselect = vi.fn().mockResolvedValue([]);

    const cancelSymbol = Symbol("cancel");
    p.confirm = vi.fn().mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(components()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalledWith("Cancelled.");
    expect(writeManifest).toHaveBeenCalled();
  });
});
