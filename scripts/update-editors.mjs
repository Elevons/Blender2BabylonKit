#!/usr/bin/env node
/**
 * Bump Babylon editor packages in tools/babylon-launcher and report compatibility.
 *
 *   npm run launcher:update-editors
 *   npm run launcher:update-editors -- --target 9.0.0
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..");
const LAUNCHER_PKG = path.join(REPO_ROOT, "tools", "babylon-launcher", "package.json");
const ENGINE_PKG = path.join(REPO_ROOT, "packages", "engine", "package.json");

const EDITOR_PACKAGES = [
  "@babylonjs/gui-editor",
  "@babylonjs/node-editor",
  "@babylonjs/node-geometry-editor",
  "@babylonjs/node-particle-editor",
  "@babylonjs/node-render-graph-editor",
  "@babylonjs/smart-filters",
  "@babylonjs/smart-filters-blocks",
  "@babylonjs/core",
  "@babylonjs/gui",
  "@babylonjs/loaders",
];

function ParseTarget(argv)
{
  for (let i = 0; i < argv.length; i++)
  {
    if (argv[i] === "--target")
    {
      return argv[++i];
    }
  }
  return "latest";
}

function ReadEngineCoreRange()
{
  const engine = JSON.parse(fs.readFileSync(ENGINE_PKG, "utf8"));
  return engine.peerDependencies?.["@babylonjs/core"] ?? "^9.0.0";
}

async function RunNpmInstall(target)
{
  const args = [
    "install",
    ...EDITOR_PACKAGES.map((pkg) => `${pkg}@${target}`),
    "--workspace",
    "@bjs/babylon-launcher",
  ];
  return new Promise((resolve, reject) =>
  {
    const child = spawn("npm", args, {
      cwd: REPO_ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) =>
    {
      if (code === 0) { resolve(); }
      else { reject(new Error(`npm install failed (${code})`)); }
    });
  });
}

function ReportVersions()
{
  const launcher = JSON.parse(fs.readFileSync(LAUNCHER_PKG, "utf8"));
  const engineRange = ReadEngineCoreRange();
  console.log(`Engine peer range: @babylonjs/core ${engineRange}`);
  for (const pkg of EDITOR_PACKAGES)
  {
    const version = launcher.dependencies?.[pkg] ?? "missing";
    console.log(`  ${pkg}: ${version}`);
  }
}

const target = ParseTarget(process.argv.slice(2));
console.log(`Updating Babylon editor packages to ${target}...`);
console.log(`(Engine expects ${ReadEngineCoreRange()})`);

RunNpmInstall(target)
  .then(() =>
  {
    console.log("\nInstalled versions:");
    ReportVersions();
    console.log("\nRun smoke test: npm run launcher:dev");
  })
  .catch((error) =>
  {
    console.error(error.message);
    process.exit(1);
  });
