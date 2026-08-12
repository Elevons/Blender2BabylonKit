#!/usr/bin/env node
/**
 * Launch the bundled bjs-mcp server (same entry as mcp/dist/index.js).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(packageRoot, "mcp", "dist", "index.js");

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  cwd: process.cwd(),
});

child.on("exit", (code) =>
{
  process.exit(code ?? 1);
});
