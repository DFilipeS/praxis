#!/usr/bin/env node

import { createRequire } from "node:module";
import { program } from "commander";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

program
  .name("praxis")
  .description(
    "Install, update, and manage Praxis agent skills in your project"
  )
  .version(version);

program
  .command("init")
  .description("Initialize Praxis in the current project")
  .option("--ref <ref>", "Git ref (branch/tag/sha) to fetch templates from", "main")
  .action(async (opts) => {
    const { init } = await import("../src/commands/init.js");
    await init({ ref: opts.ref });
  });

program
  .command("update")
  .description("Update Praxis files to the latest version")
  .option("--ref <ref>", "Git ref (branch/tag/sha) to fetch templates from", "main")
  .action(async (opts) => {
    const { update } = await import("../src/commands/update.js");
    await update({ ref: opts.ref });
  });

program
  .command("components")
  .description("Change which optional components are installed")
  .action(async () => {
    const { components } = await import("../src/commands/components.js");
    await components();
  });

program
  .command("status")
  .description("Show the status of managed Praxis files")
  .action(async () => {
    const { status } = await import("../src/commands/status.js");
    await status();
  });

const tool = program
  .command("tool")
  .description("Manage tool-specific configuration (Claude Code, Cursor, Opencode)");

tool
  .command("add")
  .description("Enable tool adapter(s) and generate their config files")
  .argument("[names...]", "tool names (e.g., claude-code cursor)")
  .action(async (names) => {
    const { toolAdd } = await import("../src/commands/tool.js");
    await toolAdd(names);
  });

tool
  .command("remove")
  .description("Remove tool adapter(s) and their config files")
  .argument("<names...>", "tool names to remove")
  .action(async (names) => {
    const { toolRemove } = await import("../src/commands/tool.js");
    await toolRemove(names);
  });

tool
  .command("list")
  .description("List all available tool adapters and their status")
  .action(async () => {
    const { toolList } = await import("../src/commands/tool.js");
    await toolList();
  });

program.parseAsync().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
