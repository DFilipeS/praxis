#!/usr/bin/env node

import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, symlinkSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { execSync } from "node:child_process";
import { createWriteStream, mkdir } from "node:fs";
import { get as httpsGet } from "node:https";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

const TOOLS = {
  "claude-code": { dir: ".claude/skills", label: "Claude Code" },
  cursor: { dir: ".cursor/skills", label: "Cursor" },
};

const DEFAULT_SOURCE = "DFilipeS/praxis";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    showHelp();
    process.exit(0);
  }

  if (command === "init") {
    await init(args.slice(1));
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Run "praxis help" for usage.');
    process.exit(1);
  }
}

function showHelp() {
  console.log(`praxis — AI-assisted development workflow setup

Usage:
  praxis init [options]

Options:
  --source <path>   Source directory or owner/repo (default: ${DEFAULT_SOURCE})
  --tools <list>    Comma-separated tool names (skip interactive prompt)
  --all-tools       Install symlinks for all supported tools
  --no-tools        Only install to .agents/skills, no symlinks
  --yes, -y         Skip confirmation prompts

Supported tools: ${Object.keys(TOOLS).join(", ")}`);
}

async function init(args) {
  let source = DEFAULT_SOURCE;
  let selectedTools = null;
  let skipConfirm = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--source" && args[i + 1]) { source = args[++i]; }
    else if (args[i] === "--tools" && args[i + 1]) { selectedTools = args[++i].split(","); }
    else if (args[i] === "--all-tools") { selectedTools = Object.keys(TOOLS); }
    else if (args[i] === "--no-tools") { selectedTools = []; }
    else if (args[i] === "--yes" || args[i] === "-y") { skipConfirm = true; }
  }

  const cwd = process.cwd();
  let sourceDir;

  if (isLocalPath(source)) {
    sourceDir = resolve(source);
    if (!existsSync(sourceDir)) {
      console.error(`Source directory not found: ${sourceDir}`);
      process.exit(1);
    }
  } else {
    console.log(`Fetching files from ${source}...`);
    sourceDir = await fetchFromGitHub(source);
  }

  const skillsDir = join(sourceDir, "skills");
  const reviewersDir = join(sourceDir, "reviewers");
  const conventionsFile = join(sourceDir, "conventions.md");
  const outputFormatFile = join(sourceDir, "reviewer-output-format.md");

  if (!existsSync(skillsDir)) {
    console.error(`No skills/ directory found in source.`);
    process.exit(1);
  }

  const targetSkillsDir = join(cwd, ".agents", "skills");

  console.log("\n--- Installing skills ---");
  copySkills(skillsDir, targetSkillsDir);
  console.log("Skills installed to .agents/skills/");

  if (selectedTools === null) {
    selectedTools = await promptForTools();
  }

  if (selectedTools.length > 0) {
    console.log("\n--- Creating symlinks ---");
    for (const toolName of selectedTools) {
      const tool = TOOLS[toolName];
      if (!tool) {
        console.warn(`Unknown tool: ${toolName}, skipping.`);
        continue;
      }
      if (tool.dir === ".agents/skills") {
        console.log(`  ${tool.label}: already uses .agents/skills/, skipping.`);
        continue;
      }
      const linkDir = join(cwd, tool.dir);
      symlinkSkills(targetSkillsDir, linkDir, tool.label);
    }
  }

  console.log("\n--- Setting up .praxis ---");
  const praxisDir = join(cwd, ".praxis");
  mkdirSync(praxisDir, { recursive: true });

  if (existsSync(conventionsFile)) {
    cpSync(conventionsFile, join(praxisDir, "conventions.md"));
    console.log("Copied conventions.md");
  }
  if (existsSync(outputFormatFile)) {
    cpSync(outputFormatFile, join(praxisDir, "reviewer-output-format.md"));
    console.log("Copied reviewer-output-format.md");
  }

  if (existsSync(reviewersDir)) {
    const targetReviewersDir = join(praxisDir, "reviewers");
    mkdirSync(targetReviewersDir, { recursive: true });
    for (const file of readdirSync(reviewersDir)) {
      if (!file.endsWith(".md")) continue;
      const target = join(targetReviewersDir, file);
      if (!existsSync(target)) {
        cpSync(join(reviewersDir, file), target);
        console.log(`Added reviewer: ${file}`);
      } else {
        console.log(`Reviewer already exists, skipping: ${file}`);
      }
    }
  }

  console.log("\n--- Setting up .ai-workflow ---");
  for (const dir of ["ideas", "plans", "learnings"]) {
    mkdirSync(join(cwd, ".ai-workflow", dir), { recursive: true });
  }
  console.log("Created .ai-workflow/ directories");

  if (existsSync(join(cwd, ".ai-workflow", "tags")) === false && existsSync(join(sourceDir, ".ai-workflow", "tags"))) {
    cpSync(join(sourceDir, ".ai-workflow", "tags"), join(cwd, ".ai-workflow", "tags"));
  }

  console.log("\nPraxis installed successfully.");
}

function isLocalPath(s) {
  return s.startsWith("./") || s.startsWith("../") || s.startsWith("/") || existsSync(s);
}

async function fetchFromGitHub(repo) {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    console.error(`Invalid GitHub repo: ${repo}. Use owner/repo format.`);
    process.exit(1);
  }

  const url = `https://github.com/${owner}/${repoName}/archive/refs/heads/main.tar.gz`;
  const tmpDir = join(tmpdir(), `praxis-${randomUUID()}`);

  try {
    const tarPath = join(tmpDir, "source.tar.gz");
    mkdirSync(tmpDir, { recursive: true });

    await download(url, tarPath);

    execSync(`tar -xzf "${tarPath}" -C "${tmpDir}"`, { stdio: "pipe" });

    const extractedDir = join(tmpDir, `${repoName}-main`);
    if (!existsSync(extractedDir)) {
      throw new Error("Extraction failed: directory not found");
    }

    return extractedDir;
  } catch (err) {
    console.error(`Failed to fetch from GitHub: ${err.message}`);
    process.exit(1);
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    httpsGet(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", reject);
  });
}

function copySkills(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dest = join(target, entry.name);
    cpSync(join(source, entry.name), dest, { recursive: true, dereference: true });
  }
}

function symlinkSkills(targetSkillsDir, linkDir, label) {
  mkdirSync(linkDir, { recursive: true });

  for (const skillName of readdirSync(targetSkillsDir, { withFileTypes: true })) {
    if (!skillName.isDirectory()) continue;
    const linkPath = join(linkDir, skillName.name);
    const targetPath = join(targetSkillsDir, skillName.name);

    try {
      if (lstatSync(linkPath).isSymbolicLink()) {
        rmSync(linkPath);
      }
    } catch {}

    try {
      symlinkSync(targetPath, linkPath);
      console.log(`  ${label}: linked ${skillName.name}`);
    } catch (err) {
      if (err.code === "EPERM" || err.code === "EEXIST") {
        try {
          rmSync(linkPath, { recursive: true, force: true });
          symlinkSync(targetPath, linkPath);
          console.log(`  ${label}: linked ${skillName.name}`);
        } catch {
          console.warn(`  ${label}: failed to link ${skillName.name} (${err.message})`);
        }
      } else {
        console.warn(`  ${label}: failed to link ${skillName.name} (${err.message})`);
      }
    }
  }
}

async function promptForTools() {
  const { multiselect, isCancel } = await import("@clack/prompts");

  const options = Object.entries(TOOLS)
    .filter(([, t]) => t.dir !== ".agents/skills")
    .map(([key, t]) => ({ value: key, label: t.label }));

  const selected = await multiselect({
    message: "Which additional coding agents should receive symlinks?",
    options,
    required: false,
  });

  if (isCancel(selected)) return [];
  return selected;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
