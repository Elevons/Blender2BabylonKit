#!/usr/bin/env node
/**
 * Start the Project Control Panel against the current project (cwd must
 * contain game/, or you must be in the kit monorepo).
 *
 * When published, this package embeds a built copy of the control panel under
 * control-panel/. In the monorepo it falls back to tools/project-control-panel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const embeddedEntry = path.join(packageRoot, "control-panel", "server", "index.js");
const monorepoEntry = path.resolve(packageRoot, "../../tools/project-control-panel/dist/server/index.js");

let entry = null;
if (fs.existsSync(embeddedEntry))
{
  entry = embeddedEntry;
}
else if (fs.existsSync(monorepoEntry))
{
  entry = monorepoEntry;
}

if (entry === null)
{
  console.error(
    "[b2bkit-control-panel] Control panel build not found.\n" +
    "In the kit monorepo: npm run control-panel:build\n" +
    "Or install a published kit package that includes control-panel/."
  );
  process.exit(1);
}

const child = spawn(process.execPath, [entry], {
  stdio: "inherit",
  env: process.env,
  cwd: process.cwd(),
});

child.on("exit", (code) =>
{
  process.exit(code ?? 1);
});
