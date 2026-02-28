import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@clack/prompts");
vi.mock("../../src/templates.js");
vi.mock("../../src/manifest.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readManifest: vi.fn(),
  };
});

import * as p from "@clack/prompts";
import { fetchTemplates } from "../../src/templates.js";
import {
  readManifest,
  hashContent,
  writeManifest,
  isLocallyModified,
} from "../../src/manifest.js";
import { update } from "../../src/commands/update.js";

let tmpDir;

function makeManifest(files) {
  return {
    version: "1.0.0",
    installedAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    files,
  };
}

async function writeTestFile(relativePath, content) {
  const fullPath = join(tmpDir, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
}

describe("update command", () => {
  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "praxis-update-test-"));
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
    p.select = vi.fn();
    p.confirm = vi.fn();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("errors and exits when no manifest exists", async () => {
    readManifest.mockResolvedValue(null);

    await expect(update()).rejects.toThrow("process.exit(1)");
    expect(p.log.error).toHaveBeenCalledWith(
      expect.stringContaining("init")
    );
  });

  it("errors and exits on fetch error", async () => {
    readManifest.mockResolvedValue(makeManifest({}));
    fetchTemplates.mockRejectedValue(new Error("Network down"));

    await expect(update()).rejects.toThrow("process.exit(1)");
    expect(p.log.error).toHaveBeenCalledWith("Network down");
  });

  it("reports everything up to date when nothing changed", async () => {
    const content = "content A";
    await writeTestFile(".agents/a.md", content);

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent(content) } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", content]]));

    await update();

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringContaining("up to date")
    );
  });

  it("adds new files", async () => {
    const oldContent = "old content";
    await writeTestFile(".agents/old.md", oldContent);

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/old.md": { hash: hashContent(oldContent) } })
    );
    fetchTemplates.mockResolvedValue(
      new Map([
        [".agents/old.md", oldContent],
        [".agents/new.md", "new content"],
      ])
    );

    await update();

    const written = await readFile(join(tmpDir, ".agents/new.md"), "utf-8");
    expect(written).toBe("new content");
    expect(p.log.success).toHaveBeenCalledWith(
      expect.stringContaining("added")
    );
  });

  it("skips new file when it already exists on disk and user chooses skip", async () => {
    // File exists locally but is not yet tracked in the manifest
    await writeTestFile(".agents/new.md", "local version");

    readManifest.mockResolvedValue(makeManifest({}));
    fetchTemplates.mockResolvedValue(
      new Map([[".agents/new.md", "upstream content"]])
    );
    p.select.mockResolvedValue("skip");

    await update();

    const content = await readFile(join(tmpDir, ".agents/new.md"), "utf-8");
    expect(content).toBe("local version");
    expect(p.log.warn).toHaveBeenCalledWith(expect.stringContaining("skipped"));
  });

  it("cancels when user cancels conflict prompt for a new file", async () => {
    await writeTestFile(".agents/new.md", "local version");

    readManifest.mockResolvedValue(makeManifest({}));
    fetchTemplates.mockResolvedValue(
      new Map([[".agents/new.md", "upstream content"]])
    );
    const cancelSymbol = Symbol("cancel");
    p.select.mockResolvedValue(cancelSymbol);
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(update()).rejects.toThrow("process.exit(0)");
    expect(p.cancel).toHaveBeenCalled();
  });

  it("does not update changed file when it belongs to a deselected skill component", async () => {
    await writeTestFile(".agents/skills/agent-browser/SKILL.md", "old");

    readManifest.mockResolvedValue({
      ...makeManifest({
        ".agents/skills/agent-browser/SKILL.md": { hash: hashContent("old") },
      }),
      selectedComponents: { skills: [], reviewers: [] },
    });
    fetchTemplates.mockResolvedValue(
      new Map([[".agents/skills/agent-browser/SKILL.md", "updated"]])
    );

    await update();

    const content = await readFile(
      join(tmpDir, ".agents/skills/agent-browser/SKILL.md"),
      "utf-8"
    );
    expect(content).toBe("old");
    expect(p.log.success).not.toHaveBeenCalledWith(expect.stringContaining("updated"));
  });

  it("does not update changed file when it belongs to a deselected reviewer component", async () => {
    await writeTestFile(".agents/agents/reviewers/security.md", "old review");

    readManifest.mockResolvedValue({
      ...makeManifest({
        ".agents/agents/reviewers/security.md": { hash: hashContent("old review") },
      }),
      selectedComponents: { skills: [], reviewers: [] },
    });
    fetchTemplates.mockResolvedValue(
      new Map([[".agents/agents/reviewers/security.md", "updated review"]])
    );

    await update();

    const content = await readFile(
      join(tmpDir, ".agents/agents/reviewers/security.md"),
      "utf-8"
    );
    expect(content).toBe("old review");
    expect(p.log.success).not.toHaveBeenCalledWith(expect.stringContaining("updated"));
  });

  it("silently tracks a new file when it already exists on disk with matching content", async () => {
    const content = "upstream content";
    await writeTestFile(".agents/new.md", content);

    readManifest.mockResolvedValue(makeManifest({}));
    fetchTemplates.mockResolvedValue(new Map([[".agents/new.md", content]]));

    await update();

    // installFile returns "matched" — no added/skipped logged, but manifest is updated
    expect(p.log.success).not.toHaveBeenCalledWith(expect.stringContaining("added"));
    expect(p.log.warn).not.toHaveBeenCalled();
    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.files[".agents/new.md"]).toBeTruthy();
  });

  it("updates changed files that are not locally modified", async () => {
    await writeTestFile(".agents/a.md", "v1");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));

    await update();

    const written = await readFile(join(tmpDir, ".agents/a.md"), "utf-8");
    expect(written).toBe("v2");
    expect(p.log.success).toHaveBeenCalledWith(
      expect.stringContaining("updated")
    );
  });

  it("updates changed files when file does not exist on disk", async () => {
    await mkdir(join(tmpDir, ".agents"), { recursive: true });

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));

    await update();

    const written = await readFile(join(tmpDir, ".agents/a.md"), "utf-8");
    expect(written).toBe("v2");
  });

  it("overwrites locally modified file when user chooses overwrite", async () => {
    await writeTestFile(".agents/a.md", "local changes");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));
    p.select.mockResolvedValue("overwrite");

    await update();

    const written = await readFile(join(tmpDir, ".agents/a.md"), "utf-8");
    expect(written).toBe("v2");
  });

  it("skips locally modified file when user chooses skip", async () => {
    await writeTestFile(".agents/a.md", "local changes");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));
    p.select.mockResolvedValue("skip");

    await update();

    const written = await readFile(join(tmpDir, ".agents/a.md"), "utf-8");
    expect(written).toBe("local changes");
    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("skipped")
    );
  });

  it("shows diff then overwrites when user chooses diff then overwrite", async () => {
    await writeTestFile(".agents/a.md", "local changes");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));
    p.select
      .mockResolvedValueOnce("diff")
      .mockResolvedValueOnce("overwrite");

    await update();

    expect(p.log.info).toHaveBeenCalledWith(expect.stringContaining("---"));
    const written = await readFile(join(tmpDir, ".agents/a.md"), "utf-8");
    expect(written).toBe("v2");
  });

  it("shows diff then skips when user chooses diff then skip", async () => {
    await writeTestFile(".agents/a.md", "local changes");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));
    p.select.mockResolvedValueOnce("diff").mockResolvedValueOnce("skip");

    await update();

    const written = await readFile(join(tmpDir, ".agents/a.md"), "utf-8");
    expect(written).toBe("local changes");
  });

  it("exits on cancel at first select for changed files", async () => {
    await writeTestFile(".agents/a.md", "local changes");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));
    p.select.mockResolvedValue(Symbol("cancel"));
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(update()).rejects.toThrow("process.exit(0)");
  });

  it("exits on cancel at second select after diff", async () => {
    await writeTestFile(".agents/a.md", "local changes");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));
    p.select
      .mockResolvedValueOnce("diff")
      .mockResolvedValueOnce(Symbol("cancel"));
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(update()).rejects.toThrow("process.exit(0)");
  });

  it("removes manifest entry when removed file does not exist on disk", async () => {
    readManifest.mockResolvedValue(
      makeManifest({
        ".agents/gone.md": { hash: hashContent("gone content") },
      })
    );
    fetchTemplates.mockResolvedValue(new Map());

    await update();

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.files).not.toHaveProperty(".agents/gone.md");
  });

  it("deletes removed file when user confirms", async () => {
    const content = "old content";
    await writeTestFile(".agents/old.md", content);

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/old.md": { hash: hashContent(content) } })
    );
    fetchTemplates.mockResolvedValue(new Map());
    p.confirm.mockResolvedValue(true);

    await update();

    expect(existsSync(join(tmpDir, ".agents/old.md"))).toBe(false);
    expect(p.log.success).toHaveBeenCalledWith(
      expect.stringContaining("removed")
    );
  });

  it("keeps removed file when user declines", async () => {
    const content = "old content";
    await writeTestFile(".agents/old.md", content);

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/old.md": { hash: hashContent(content) } })
    );
    fetchTemplates.mockResolvedValue(new Map());
    p.confirm.mockResolvedValue(false);

    await update();

    expect(existsSync(join(tmpDir, ".agents/old.md"))).toBe(true);
    expect(p.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("skipped")
    );
  });

  it("shows locally modified warning for removed files", async () => {
    await writeTestFile(".agents/old.md", "modified content");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/old.md": { hash: hashContent("original") } })
    );
    fetchTemplates.mockResolvedValue(new Map());
    p.confirm.mockResolvedValue(true);

    await update();

    expect(p.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("(locally modified)"),
      })
    );
  });

  it("exits on cancel at confirm for removed files", async () => {
    const content = "old content";
    await writeTestFile(".agents/old.md", content);

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/old.md": { hash: hashContent(content) } })
    );
    fetchTemplates.mockResolvedValue(new Map());
    p.confirm.mockResolvedValue(Symbol("cancel"));
    p.isCancel = vi.fn((v) => typeof v === "symbol");

    await expect(update()).rejects.toThrow("process.exit(0)");
  });

  it("blocks path traversal for new files", async () => {
    readManifest.mockResolvedValue(makeManifest({}));
    fetchTemplates.mockResolvedValue(
      new Map([["../../../etc/evil", "bad"]])
    );

    await update();

    expect(existsSync(join(tmpDir, "../../../etc/evil"))).toBe(false);
  });

  it("blocks path traversal for changed files", async () => {
    const evilPath = "../../../etc/evil";
    readManifest.mockResolvedValue(
      makeManifest({ [evilPath]: { hash: hashContent("old bad") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[evilPath, "new bad"]]));

    await update();

    expect(existsSync(join(tmpDir, evilPath))).toBe(false);
  });

  it("blocks path traversal for removed files", async () => {
    const evilPath = "../../../etc/evil";
    readManifest.mockResolvedValue(
      makeManifest({ [evilPath]: { hash: hashContent("evil") } })
    );
    fetchTemplates.mockResolvedValue(new Map());

    await update();

    expect(p.confirm).not.toHaveBeenCalled();
  });

  it("summary includes all categories", async () => {
    const oldContent = "old content";
    await writeTestFile(".agents/existing.md", oldContent);
    const removableContent = "removable";
    await writeTestFile(".agents/removable.md", removableContent);

    readManifest.mockResolvedValue(
      makeManifest({
        ".agents/existing.md": { hash: hashContent(oldContent) },
        ".agents/removable.md": { hash: hashContent(removableContent) },
      })
    );
    fetchTemplates.mockResolvedValue(
      new Map([
        [".agents/existing.md", "updated content"],
        [".agents/brand-new.md", "brand new"],
      ])
    );
    p.confirm.mockResolvedValue(true);

    await update();

    expect(p.outro).toHaveBeenCalledWith(
      expect.stringMatching(/added.*updated.*removed|added.*removed.*updated/)
    );
  });

  it("writes updated manifest after changes", async () => {
    await writeTestFile(".agents/a.md", "v1");

    readManifest.mockResolvedValue(
      makeManifest({ ".agents/a.md": { hash: hashContent("v1") } })
    );
    fetchTemplates.mockResolvedValue(new Map([[".agents/a.md", "v2"]]));

    await update();

    const manifest = JSON.parse(
      await readFile(join(tmpDir, ".praxis-manifest.json"), "utf-8")
    );
    expect(manifest.files[".agents/a.md"].hash).toBe(hashContent("v2"));
    expect(manifest.updatedAt).not.toBe("2026-01-01T00:00:00Z");
  });

  it("does not install new optional component files that are not selected", async () => {
    readManifest.mockResolvedValue({
      ...makeManifest({ ".agents/conventions.md": { hash: hashContent("core") } }),
      selectedComponents: { skills: [], reviewers: [] },
    });
    await writeTestFile(".agents/conventions.md", "core");

    // Upstream now has a new optional skill that user hasn't selected
    fetchTemplates.mockResolvedValue(
      new Map([
        [".agents/conventions.md", "core"],
        [".agents/skills/agent-browser/SKILL.md", '---\ndescription: "Browser"\n---'],
      ])
    );

    await update();

    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"))).toBe(false);
  });

  it("logs a nudge when new optional components are available but not selected", async () => {
    readManifest.mockResolvedValue({
      ...makeManifest({ ".agents/conventions.md": { hash: hashContent("core") } }),
      selectedComponents: { skills: [], reviewers: [] },
    });
    await writeTestFile(".agents/conventions.md", "core");

    fetchTemplates.mockResolvedValue(
      new Map([
        [".agents/conventions.md", "core"],
        [".agents/skills/agent-browser/SKILL.md", '---\ndescription: "Browser"\n---'],
        [".agents/agents/reviewers/security.md", '---\ndescription: "Security"\n---'],
      ])
    );

    await update();

    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("new optional component(s) available")
    );
    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("praxis components")
    );
  });

  it("installs new optional component files when they are selected", async () => {
    readManifest.mockResolvedValue({
      ...makeManifest({ ".agents/conventions.md": { hash: hashContent("core") } }),
      selectedComponents: { skills: ["agent-browser"], reviewers: [] },
    });
    await writeTestFile(".agents/conventions.md", "core");

    fetchTemplates.mockResolvedValue(
      new Map([
        [".agents/conventions.md", "core"],
        [".agents/skills/agent-browser/SKILL.md", '---\ndescription: "Browser"\n---'],
      ])
    );

    await update();

    expect(existsSync(join(tmpDir, ".agents/skills/agent-browser/SKILL.md"))).toBe(true);
  });

  it("logs a nudge after update when there are changes and new unselected components", async () => {
    // Has a file that needs updating AND a new unselected optional component
    await writeTestFile(".agents/conventions.md", "v1");

    readManifest.mockResolvedValue({
      ...makeManifest({ ".agents/conventions.md": { hash: hashContent("v1") } }),
      selectedComponents: { skills: [], reviewers: [] },
    });

    fetchTemplates.mockResolvedValue(
      new Map([
        [".agents/conventions.md", "v2"],
        [".agents/skills/agent-browser/SKILL.md", '---\ndescription: "Browser"\n---'],
      ])
    );

    await update();

    expect(p.log.info).toHaveBeenCalledWith(
      expect.stringContaining("new optional component(s) available")
    );
    expect(p.outro).toHaveBeenCalledWith(expect.stringContaining("updated"));
  });

  it("updates changed file when it belongs to a selected optional component", async () => {
    await writeTestFile(".agents/skills/agent-browser/SKILL.md", "v1");

    readManifest.mockResolvedValue({
      ...makeManifest({
        ".agents/skills/agent-browser/SKILL.md": { hash: hashContent("v1") },
      }),
      selectedComponents: { skills: ["agent-browser"], reviewers: [] },
    });
    fetchTemplates.mockResolvedValue(
      new Map([[".agents/skills/agent-browser/SKILL.md", "v2"]])
    );

    await update();

    const content = await readFile(
      join(tmpDir, ".agents/skills/agent-browser/SKILL.md"),
      "utf-8"
    );
    expect(content).toBe("v2");
    expect(p.log.success).toHaveBeenCalledWith(expect.stringContaining("updated"));
  });

  it("does not nudge when there are no new unselected optional components", async () => {
    readManifest.mockResolvedValue({
      ...makeManifest({ ".agents/conventions.md": { hash: hashContent("core") } }),
      selectedComponents: { skills: ["agent-browser"], reviewers: [] },
    });
    await writeTestFile(".agents/conventions.md", "core");

    fetchTemplates.mockResolvedValue(
      new Map([
        [".agents/conventions.md", "core"],
        [".agents/skills/agent-browser/SKILL.md", '---\ndescription: "Browser"\n---'],
      ])
    );

    await update();

    const nudgeCalls = p.log.info.mock.calls.filter((args) =>
      args[0]?.includes?.("new optional component(s)")
    );
    expect(nudgeCalls).toHaveLength(0);
  });
});
