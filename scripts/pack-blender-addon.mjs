#!/usr/bin/env node
/**
 * Pack blender_addon/ into babylon_level_kit-<version>.zip for Install from Disk.
 *
 *   node scripts/pack-blender-addon.mjs [--out packages/engine/blender-addon]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADDON_DIR = path.join(ROOT, "blender_addon");
const MANIFEST = path.join(ADDON_DIR, "blender_manifest.toml");

function ReadAddonVersion()
{
  const text = fs.readFileSync(MANIFEST, "utf8");
  const match = text.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match)
  {
    throw new Error(`Could not read version from ${MANIFEST}`);
  }
  return match[1];
}

function ParseOutDir(argv)
{
  const flagIndex = argv.indexOf("--out");
  if (flagIndex >= 0 && argv[flagIndex + 1])
  {
    return path.resolve(ROOT, argv[flagIndex + 1]);
  }
  return path.join(ROOT, "packages", "engine", "blender-addon");
}

const version = ReadAddonVersion();
const outDir = ParseOutDir(process.argv.slice(2));
fs.mkdirSync(outDir, { recursive: true });

const zipName = `babylon_level_kit-${version}.zip`;
const zipPath = path.join(outDir, zipName);

if (fs.existsSync(zipPath))
{
  fs.unlinkSync(zipPath);
}

// Blender expects a top-level folder inside the zip.
const result = spawnSync(
  "zip",
  ["-r", "-q", zipPath, "blender_addon", "-x", "*.pyc", "-x", "*__pycache__*", "-x", "*.zip"],
  { cwd: ROOT, stdio: "inherit" },
);

if (result.status !== 0)
{
  console.error("[pack-blender-addon] zip failed — is the `zip` CLI installed?");
  process.exit(result.status ?? 1);
}

const latestPath = path.join(outDir, "babylon_level_kit.zip");
fs.copyFileSync(zipPath, latestPath);

console.log(`[pack-blender-addon] wrote ${path.relative(ROOT, zipPath)}`);
console.log(`[pack-blender-addon] wrote ${path.relative(ROOT, latestPath)}`);
