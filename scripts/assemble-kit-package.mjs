#!/usr/bin/env node
/**
 * Assemble every versioned runtime asset included in the published kit.
 *
 * Always rebuilds the documentation site and the MCP doc-embedding index
 * (via docs:build → mcp:index) before copying them into the package. Also
 * builds the engine, Project Control Panel, and bjs-mcp binary, packs the
 * Blender add-on zip, and copies prose sources for MCP chapter lookup.
 *
 * Invoked by:
 *   - packages/engine prepack (npm pack / npm publish)
 *   - scripts/release.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_ROOT = path.join(ROOT, "packages", "engine");

/**
 * Run one build command and stop assembly when it fails.
 */
function Run(command, commandArguments)
{
  console.log(`\n> ${command} ${commandArguments.join(" ")}`);
  const result = spawnSync(command, commandArguments, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0)
  {
    process.exit(result.status ?? 1);
  }
}

/**
 * Replace a generated package directory with the current source directory.
 */
function ReplaceDirectory(sourceDirectory, destinationDirectory)
{
  fs.rmSync(destinationDirectory, { recursive: true, force: true });
  fs.cpSync(sourceDirectory, destinationDirectory, { recursive: true });
}

// Rebuild HTML docs + MCP vector index first so a stale docs/ or
// doc-embeddings.json cannot ship. docs:build ends with mcp:index.
Run("npm", ["run", "docs:build"]);

Run("npm", ["run", "build", "--workspace", "b2bkit"]);
Run("npm", ["run", "build", "--workspace", "@bjs/project-control-panel"]);
Run("npm", ["run", "build", "--workspace", "@bjs/mcp"]);
Run("node", ["scripts/pack-blender-addon.mjs", "--out", "packages/engine/blender-addon"]);

ReplaceDirectory(
  path.join(ROOT, "tools", "project-control-panel", "dist"),
  path.join(PACKAGE_ROOT, "control-panel"),
);
ReplaceDirectory(
  path.join(ROOT, "docs"),
  path.join(PACKAGE_ROOT, "docs"),
);
ReplaceDirectory(
  path.join(ROOT, "tools", "bjs-mcp", "dist"),
  path.join(PACKAGE_ROOT, "mcp", "dist"),
);
ReplaceDirectory(
  path.join(ROOT, "tools", "bjs-mcp", "data"),
  path.join(PACKAGE_ROOT, "mcp", "data"),
);
ReplaceDirectory(
  path.join(ROOT, "scripts", "docs", "prose", "content"),
  path.join(PACKAGE_ROOT, "mcp", "prose"),
);

console.log("\n[assemble-kit-package] Package assets are ready.");
