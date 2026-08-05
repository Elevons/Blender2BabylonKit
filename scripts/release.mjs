#!/usr/bin/env node
/**
 * Lockstep kit release helper.
 *
 *   node scripts/release.mjs --version 0.33.0           # bump + build + pack (no publish)
 *   node scripts/release.mjs --version 0.33.0 --publish # also npm publish (requires login)
 *
 * Syncs version across:
 *   - root package.json
 *   - packages/engine/package.json
 *   - tools/project-control-panel/package.json
 *   - game/package.json
 *   - blender_addon/blender_manifest.toml
 *
 * Then: typecheck + component parity, build engine + control panel, pack add-on
 * zip into packages/engine/blender-addon/, copy panel dist into
 * packages/engine/control-panel/.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function ParseArgs(argv)
{
  const args = { publish: false };
  for (let index = 0; index < argv.length; index++)
  {
    const flag = argv[index];
    if (flag === "--version")
    {
      args.version = argv[++index];
    }
    else if (flag === "--publish")
    {
      args.publish = true;
    }
    else
    {
      console.error(`Unknown argument: ${flag}`);
      process.exit(1);
    }
  }
  return args;
}

function Run(command, commandArgs, options = {})
{
  console.log(`\n> ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (result.status !== 0)
  {
    process.exit(result.status ?? 1);
  }
}

function WriteJson(filePath, value)
{
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function BumpPackageJson(relativePath, version)
{
  const filePath = path.join(ROOT, relativePath);
  const packageJson = JSON.parse(fs.readFileSync(filePath, "utf8"));
  packageJson.version = version;
  WriteJson(filePath, packageJson);
  console.log(`[release] ${relativePath} → ${version}`);
}

function BumpBlenderManifest(version)
{
  const filePath = path.join(ROOT, "blender_addon/blender_manifest.toml");
  let text = fs.readFileSync(filePath, "utf8");
  text = text.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`);
  fs.writeFileSync(filePath, text);
  console.log(`[release] blender_addon/blender_manifest.toml → ${version}`);
}

function CopyDirectory(sourceDir, destinationDir)
{
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true }))
  {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory())
    {
      CopyDirectory(sourcePath, destinationPath);
    }
    else
    {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

const args = ParseArgs(process.argv.slice(2));
if (!args.version || !/^\d+\.\d+\.\d+/.test(args.version))
{
  console.error("Usage: node scripts/release.mjs --version X.Y.Z [--publish]");
  process.exit(1);
}

const version = args.version;

BumpPackageJson("package.json", version);
BumpPackageJson("packages/engine/package.json", version);
BumpPackageJson("tools/project-control-panel/package.json", version);
BumpPackageJson("game/package.json", version);
BumpBlenderManifest(version);

Run("npm", ["run", "typecheck"]);
Run("npm", ["run", "build", "--workspace", "@bjs/engine"]);
Run("npm", ["run", "build", "--workspace", "@bjs/project-control-panel"]);
Run("node", ["scripts/pack-blender-addon.mjs", "--out", "packages/engine/blender-addon"]);

const panelDist = path.join(ROOT, "tools/project-control-panel/dist");
const embeddedPanel = path.join(ROOT, "packages/engine/control-panel");
fs.rmSync(embeddedPanel, { recursive: true, force: true });
CopyDirectory(panelDist, embeddedPanel);
console.log(`[release] copied control panel dist → packages/engine/control-panel/`);

if (args.publish)
{
  // Publishing requires removing private:true temporarily or a dedicated public package.
  console.log("\n[release] --publish: publishing @bjs/engine from packages/engine");
  console.log("[release] Ensure the package is not private and you are logged in to npm.");
  Run("npm", ["publish", "--access", "public"], { cwd: path.join(ROOT, "packages/engine") });
}
else
{
  console.log("\n[release] Dry run complete (no npm publish). Re-run with --publish when ready.");
  console.log(`[release] Kit version ${version} built. Add-on zip + control-panel embedded under packages/engine/.`);
}
