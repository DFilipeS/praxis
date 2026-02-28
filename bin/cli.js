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

program.parseAsync().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
