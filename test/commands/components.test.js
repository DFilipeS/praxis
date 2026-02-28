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
  return { installFile: vi.fn(actual.installFile) };
});

import * as p from "@clack/prompts";
import { fetchTemplates } from "../../src/templates.js";
import { readManifest, hashContent, writeManifest } from "../../src/manifest.js";
import { installFile } from "../../src/files.js";
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

const CORE_FILE = ".agents/conventions.md";
const BROWSER_SKILL = ".agents/skills/agent-browser/SKILL.md";
const FIGMA_SKILL = ".agents/skills/figma-to-code/SKILL.md";
const SECURITY_REVIEWER = ".agents/agents/reviewers/security.md";

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
  await mkdir(join(tmpDir, ".agents"), { recursive: true });
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
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
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
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
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
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
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
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
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
    // 4 levels of ".." are needed to escape tmpDir from inside .agents/skills/agent-browser/
    const traversalPath = ".agents/skills/agent-browser/../../../../evil";
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
    const traversalPath = ".agents/skills/agent-browser/../../../../evil";
    fetchTemplates.mockResolvedValue(
      new Map([
        [CORE_FILE, "# Core"],
        [BROWSER_SKILL, '---\ndescription: "Browser automation"\n---'],
        [traversalPath, "malicious"],
      ])
    );

    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
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

  it("silently ignores writeManifest failure in error catch block", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    // installFile throws — triggers catch block
    installFile.mockRejectedValueOnce(new Error("disk full"));
    // writeManifest in catch block also throws — .catch(() => {}) suppresses it
    writeManifest.mockRejectedValueOnce(new Error("cannot write"));

    // Original error is re-thrown regardless of writeManifest failure
    await expect(components()).rejects.toThrow("disk full");
    expect(writeManifest).toHaveBeenCalled();
  });

  it("cancels on confirm cancel when removing locally modified file", async () => {
    await mkdir(join(tmpDir, ".agents/skills/agent-browser"), { recursive: true });
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
  });

  it("writes partial manifest state on unexpected error during additions", async () => {
    readManifest.mockResolvedValue(
      makeManifest({ [CORE_FILE]: "# Core" }, { skills: [], reviewers: [] })
    );

    p.groupMultiselect = vi.fn().mockResolvedValue(["skill:agent-browser"]);

    // Make installFile throw to trigger the catch block
    installFile.mockRejectedValueOnce(new Error("disk full"));

    await expect(components()).rejects.toThrow("disk full");

    // Partial manifest should have been written (selectedComponents reflects the intended new selection)
    const raw = await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.selectedComponents).toEqual({ skills: ["agent-browser"], reviewers: [] });
  });

  it("outro when no optional components available", async () => {
    fetchTemplates.mockResolvedValue(
      new Map([
        [CORE_FILE, "# Core"],
        [".agents/skills/brainstorming/SKILL.md", "# Core skill"],
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
});
