#!/usr/bin/env node
/**
 * Print the path to the Blender add-on zip bundled with this package.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const zipPath = path.join(packageRoot, "blender-addon", "babylon_level_kit.zip");

if (!fs.existsSync(zipPath))
{
  console.error(
    "[b2bkit-addon-path] No blender-addon/babylon_level_kit.zip found.\n" +
    "In the kit monorepo run: node scripts/pack-blender-addon.mjs"
  );
  process.exit(1);
}

console.log(zipPath);
