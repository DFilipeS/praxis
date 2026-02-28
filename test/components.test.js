import { describe, it, expect } from "vitest";
import {
  getComponentForFile,
  getComponentFiles,
  getCoreFiles,
  discoverOptionalComponents,
  getComponentDescription,
  getSelectedComponents,
  encodeComponentValue,
  decodeComponentValue,
  buildGroupOptions,
} from "../src/components.js";

// A minimal mock templates map for testing
function makeTemplates(entries) {
  return new Map(entries);
}

describe("getComponentForFile", () => {
  it("returns null for core skill files", () => {
    expect(getComponentForFile(".agents/skills/brainstorming/SKILL.md")).toBeNull();
    expect(getComponentForFile(".agents/skills/planning/SKILL.md")).toBeNull();
    expect(getComponentForFile(".agents/skills/implementing/SKILL.md")).toBeNull();
    expect(getComponentForFile(".agents/skills/reviewing/SKILL.md")).toBeNull();
    expect(getComponentForFile(".agents/skills/retrospective/SKILL.md")).toBeNull();
  });

  it("returns skill component for optional skill files", () => {
    expect(getComponentForFile(".agents/skills/agent-browser/SKILL.md")).toEqual({
      name: "agent-browser",
      type: "skill",
    });
    expect(getComponentForFile(".agents/skills/figma-to-code/SKILL.md")).toEqual({
      name: "figma-to-code",
      type: "skill",
    });
  });

  it("returns skill component for nested optional skill files", () => {
    expect(
      getComponentForFile(".agents/skills/agent-browser/references/commands.md")
    ).toEqual({ name: "agent-browser", type: "skill" });
  });

  it("returns reviewer component for reviewer files", () => {
    expect(getComponentForFile(".agents/agents/reviewers/security.md")).toEqual({
      name: "security",
      type: "reviewer",
    });
    expect(getComponentForFile(".agents/agents/reviewers/code-quality.md")).toEqual({
      name: "code-quality",
      type: "reviewer",
    });
  });

  it("returns null for root-level .agents files", () => {
    expect(getComponentForFile(".agents/conventions.md")).toBeNull();
    expect(getComponentForFile(".agents/reviewer-output-format.md")).toBeNull();
  });

  it("returns null for .agents/agents non-reviewer files", () => {
    expect(getComponentForFile(".agents/agents/codebase-explorer.md")).toBeNull();
    expect(getComponentForFile(".agents/agents/external-researcher.md")).toBeNull();
  });

  it("does not match partial skill name (path traversal guard)", () => {
    // A path that tries to escape by embedding ".." should not match a component name
    const result = getComponentForFile(".agents/skills/../skills/agent-browser/SKILL.md");
    // This is a raw string match — it will try to match ".." as the skill name
    if (result) {
      expect(result.name).not.toBe("agent-browser");
    }
  });
});

describe("getCoreFiles", () => {
  it("returns only files not belonging to any optional component", () => {
    const templates = makeTemplates([
      [".agents/conventions.md", "conventions"],
      [".agents/reviewer-output-format.md", "format"],
      [".agents/agents/codebase-explorer.md", "explorer"],
      [".agents/skills/brainstorming/SKILL.md", "brainstorm"],
      [".agents/skills/agent-browser/SKILL.md", "browser"],
      [".agents/agents/reviewers/security.md", "security"],
    ]);

    const core = getCoreFiles(templates);

    expect(core.has(".agents/conventions.md")).toBe(true);
    expect(core.has(".agents/reviewer-output-format.md")).toBe(true);
    expect(core.has(".agents/agents/codebase-explorer.md")).toBe(true);
    expect(core.has(".agents/skills/brainstorming/SKILL.md")).toBe(true);
    expect(core.has(".agents/skills/agent-browser/SKILL.md")).toBe(false);
    expect(core.has(".agents/agents/reviewers/security.md")).toBe(false);
  });

  it("returns all templates when none are optional", () => {
    const templates = makeTemplates([
      [".agents/conventions.md", "conventions"],
      [".agents/skills/brainstorming/SKILL.md", "brainstorm"],
    ]);
    expect(getCoreFiles(templates).size).toBe(2);
  });
});

describe("getComponentFiles", () => {
  const templates = makeTemplates([
    [".agents/skills/agent-browser/SKILL.md", "browser skill"],
    [".agents/skills/agent-browser/references/commands.md", "commands"],
    [".agents/skills/figma-to-code/SKILL.md", "figma skill"],
    [".agents/agents/reviewers/security.md", "security reviewer"],
    [".agents/conventions.md", "core"],
  ]);

  it("returns only files for the specified skill", () => {
    const files = getComponentFiles(templates, "agent-browser", "skill");
    expect(files.size).toBe(2);
    expect(files.has(".agents/skills/agent-browser/SKILL.md")).toBe(true);
    expect(files.has(".agents/skills/agent-browser/references/commands.md")).toBe(true);
  });

  it("returns only the reviewer file for a reviewer component", () => {
    const files = getComponentFiles(templates, "security", "reviewer");
    expect(files.size).toBe(1);
    expect(files.has(".agents/agents/reviewers/security.md")).toBe(true);
  });

  it("returns empty map for unknown component", () => {
    expect(getComponentFiles(templates, "nonexistent", "skill").size).toBe(0);
  });

  it("does not match a reviewer when searching for a skill of the same name", () => {
    const templatesWithConflict = makeTemplates([
      [".agents/skills/security/SKILL.md", "skill content"],
      [".agents/agents/reviewers/security.md", "reviewer content"],
    ]);
    const skillFiles = getComponentFiles(templatesWithConflict, "security", "skill");
    const reviewerFiles = getComponentFiles(templatesWithConflict, "security", "reviewer");
    expect(skillFiles.size).toBe(1);
    expect(skillFiles.has(".agents/skills/security/SKILL.md")).toBe(true);
    expect(reviewerFiles.size).toBe(1);
    expect(reviewerFiles.has(".agents/agents/reviewers/security.md")).toBe(true);
  });
});

describe("discoverOptionalComponents", () => {
  it("finds all optional components from a templates map", () => {
    const templates = makeTemplates([
      [".agents/conventions.md", "core"],
      [".agents/skills/brainstorming/SKILL.md", "---\ndescription: Brainstorm\n---"],
      [".agents/skills/agent-browser/SKILL.md", '---\ndescription: "Browser automation"\n---'],
      [".agents/skills/agent-browser/references/commands.md", "commands"],
      [".agents/skills/figma-to-code/SKILL.md", "---\ndescription: Figma\n---"],
      [".agents/agents/reviewers/security.md", "---\ndescription: Security review\n---"],
      [".agents/agents/reviewers/code-quality.md", "---\ndescription: Code quality\n---"],
    ]);

    const components = discoverOptionalComponents(templates);

    // Only optional: agent-browser, figma-to-code (skills), security, code-quality (reviewers)
    // brainstorming is a core skill, should not appear
    const names = components.map((c) => c.name);
    expect(names).not.toContain("brainstorming");
    expect(names).toContain("agent-browser");
    expect(names).toContain("figma-to-code");
    expect(names).toContain("security");
    expect(names).toContain("code-quality");
    expect(components.length).toBe(4);
  });

  it("lists skills before reviewers", () => {
    const templates = makeTemplates([
      [".agents/agents/reviewers/security.md", "---\ndescription: Security\n---"],
      [".agents/skills/agent-browser/SKILL.md", "---\ndescription: Browser\n---"],
    ]);

    const components = discoverOptionalComponents(templates);
    expect(components[0].type).toBe("skill");
    expect(components[1].type).toBe("reviewer");
  });

  it("returns each component only once even with multiple files", () => {
    const templates = makeTemplates([
      [".agents/skills/agent-browser/SKILL.md", "---\ndescription: Browser\n---"],
      [".agents/skills/agent-browser/references/commands.md", "commands"],
      [".agents/skills/agent-browser/references/auth.md", "auth"],
    ]);

    const components = discoverOptionalComponents(templates);
    expect(components.filter((c) => c.name === "agent-browser").length).toBe(1);
  });

  it("returns empty array when no optional components exist", () => {
    const templates = makeTemplates([
      [".agents/conventions.md", "core"],
      [".agents/skills/brainstorming/SKILL.md", "core skill"],
    ]);
    expect(discoverOptionalComponents(templates)).toEqual([]);
  });
});

describe("getComponentDescription", () => {
  it("extracts description from skill frontmatter", () => {
    const templates = makeTemplates([
      [".agents/skills/agent-browser/SKILL.md", '---\nname: agent-browser\ndescription: "Browser automation CLI for AI agents"\n---\n\n# Content'],
    ]);
    expect(getComponentDescription(templates, "agent-browser", "skill")).toBe(
      "Browser automation CLI for AI agents"
    );
  });

  it("extracts description without quotes from frontmatter", () => {
    const templates = makeTemplates([
      [".agents/skills/figma-to-code/SKILL.md", "---\ndescription: Figma to React\n---"],
    ]);
    expect(getComponentDescription(templates, "figma-to-code", "skill")).toBe(
      "Figma to React"
    );
  });

  it("extracts description from reviewer frontmatter", () => {
    const templates = makeTemplates([
      [".agents/agents/reviewers/security.md", "---\ndescription: Security review\n---"],
    ]);
    expect(getComponentDescription(templates, "security", "reviewer")).toBe(
      "Security review"
    );
  });

  it("falls back to component name when primary file is missing", () => {
    const templates = makeTemplates([]);
    expect(getComponentDescription(templates, "my-skill", "skill")).toBe("my-skill");
  });

  it("falls back to component name when description is absent", () => {
    const templates = makeTemplates([
      [".agents/skills/my-skill/SKILL.md", "---\nname: my-skill\n---\n# Content"],
    ]);
    expect(getComponentDescription(templates, "my-skill", "skill")).toBe("my-skill");
  });
});

describe("getSelectedComponents", () => {
  it("returns selectedComponents from manifest when present", () => {
    const manifest = {
      selectedComponents: { skills: ["agent-browser"], reviewers: ["security"] },
    };
    const templates = makeTemplates([]);
    expect(getSelectedComponents(manifest, templates)).toEqual({
      skills: ["agent-browser"],
      reviewers: ["security"],
    });
  });

  it("falls back to all optional components when selectedComponents is absent", () => {
    const manifest = { files: {} };
    const templates = makeTemplates([
      [".agents/skills/agent-browser/SKILL.md", "---\ndescription: Browser\n---"],
      [".agents/agents/reviewers/security.md", "---\ndescription: Security\n---"],
      [".agents/skills/brainstorming/SKILL.md", "core"],
      [".agents/conventions.md", "core"],
    ]);

    const result = getSelectedComponents(manifest, templates);
    expect(result.skills).toContain("agent-browser");
    expect(result.skills).not.toContain("brainstorming");
    expect(result.reviewers).toContain("security");
  });
});

describe("encodeComponentValue / decodeComponentValue", () => {
  it("encodes and decodes a simple value", () => {
    const encoded = encodeComponentValue("skill", "agent-browser");
    expect(encoded).toBe("skill:agent-browser");
    expect(decodeComponentValue(encoded)).toEqual({ type: "skill", name: "agent-browser" });
  });

  it("correctly handles a component name containing a colon", () => {
    const encoded = encodeComponentValue("reviewer", "foo:bar");
    expect(encoded).toBe("reviewer:foo:bar");
    const decoded = decodeComponentValue(encoded);
    expect(decoded.type).toBe("reviewer");
    expect(decoded.name).toBe("foo:bar");
  });

  it("round-trips for reviewer type", () => {
    const encoded = encodeComponentValue("reviewer", "security");
    expect(decodeComponentValue(encoded)).toEqual({ type: "reviewer", name: "security" });
  });
});

describe("buildGroupOptions", () => {
  it("groups skills and reviewers correctly", () => {
    const components = [
      { name: "agent-browser", type: "skill", description: "Browser automation" },
      { name: "figma-to-code", type: "skill", description: "Figma to code" },
      { name: "security", type: "reviewer", description: "Security review" },
    ];

    const { groupOptions, allValues } = buildGroupOptions(components);

    expect(groupOptions["Skills"]).toHaveLength(2);
    expect(groupOptions["Reviewers"]).toHaveLength(1);
    expect(groupOptions["Skills"][0]).toEqual({ value: "skill:agent-browser", label: "agent-browser", hint: "Browser automation" });
    expect(groupOptions["Reviewers"][0]).toEqual({ value: "reviewer:security", label: "security", hint: "Security review" });
    expect(allValues).toEqual(["skill:agent-browser", "skill:figma-to-code", "reviewer:security"]);
  });

  it("returns empty structures for empty input", () => {
    const { groupOptions, allValues } = buildGroupOptions([]);
    expect(groupOptions).toEqual({});
    expect(allValues).toEqual([]);
  });
});
