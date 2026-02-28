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
  .action(async () => {
    const { init } = await import("../src/commands/init.js");
    await init();
  });

program
  .command("update")
  .description("Update Praxis files to the latest version")
  .action(async () => {
    const { update } = await import("../src/commands/update.js");
    await update();
  });

program
  .command("select")
  .description("Change which optional components are installed")
  .action(async () => {
    const { select } = await import("../src/commands/select.js");
    await select();
  });

program
  .command("status")
  .description("Show the status of managed Praxis files")
  .action(async () => {
    const { status } = await import("../src/commands/status.js");
    await status();
  });

program.parseAsync().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
