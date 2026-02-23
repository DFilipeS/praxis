import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const exec = promisify(execFile);
const cliPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "bin",
  "cli.js"
);

describe("CLI entry point", () => {
  it("shows help with --help", async () => {
    const { stdout } = await exec("node", [cliPath, "--help"]);
    expect(stdout).toContain("praxis");
    expect(stdout).toContain("init");
    expect(stdout).toContain("update");
    expect(stdout).toContain("status");
  });

  it("shows version with --version", async () => {
    const { stdout } = await exec("node", [cliPath, "--version"]);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
