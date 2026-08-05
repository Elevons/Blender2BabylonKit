#!/usr/bin/env node
/**
 * Web publish: typecheck, vite build, prune levels, copy site to outputDir/web/, zip.
 *
 *   node scripts/publish/web.mjs --app my-game [--base /path/]
 *   npm run publish:web -- --app my-game --base /demo/
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ParseAppArg,
  ReadLevelsConfig,
  ReadPublishConfig,
  ResolveAppDir,
  ResolveOutputDir,
} from "./config.mjs";

/**
 * Run tsc --noEmit in the app directory; exit on failure.
 */
export function TypecheckApp(appDir)
{
  console.log(`[publish] typecheck ${path.basename(appDir)}`);
  const result = spawnSync("npx", ["tsc", "--noEmit"], {
    cwd: appDir,
    stdio: "inherit",
  });
  if (result.status !== 0)
  {
    process.exit(result.status ?? 1);
  }
}

/**
 * Run vite build with the given base path.
 */
export function BuildWeb(appDir, base)
{
  console.log(`[publish] vite build --base ${base}`);
  const result = spawnSync("npx", ["vite", "build", "--base", base], {
    cwd: appDir,
    stdio: "inherit",
  });
  if (result.status !== 0)
  {
    process.exit(result.status ?? 1);
  }
}

/**
 * Directory size in bytes (recursive).
 */
function DirectorySizeBytes(directoryPath)
{
  if (!fs.existsSync(directoryPath))
  {
    return 0;
  }

  let total = 0;
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true }))
  {
    const fullPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory())
    {
      total += DirectorySizeBytes(fullPath);
    }
    else
    {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

/**
 * Format bytes as a short human-readable size.
 */
function FormatBytes(byteCount)
{
  if (byteCount < 1024)
  {
    return `${byteCount} B`;
  }
  if (byteCount < 1024 * 1024)
  {
    return `${(byteCount / 1024).toFixed(1)} KB`;
  }
  return `${(byteCount / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Delete every directory under dist/levels/ that is not in the include list.
 */
export function PruneLevels(appDir, includeList)
{
  const distLevels = path.join(appDir, "dist", "levels");
  if (!fs.existsSync(distLevels))
  {
    console.log("[publish] no dist/levels/ to prune");
    return;
  }

  const includeSet = new Set(includeList);
  for (const entry of fs.readdirSync(distLevels, { withFileTypes: true }))
  {
    if (!entry.isDirectory())
    {
      continue;
    }

    const folderPath = path.join(distLevels, entry.name);
    if (includeSet.has(entry.name))
    {
      console.log(`[publish] ship level ${entry.name} (${FormatBytes(DirectorySizeBytes(folderPath))})`);
      continue;
    }

    const sizeBytes = DirectorySizeBytes(folderPath);
    fs.rmSync(folderPath, { recursive: true, force: true });
    console.log(`[publish] pruned level ${entry.name} (${FormatBytes(sizeBytes)})`);
  }
}

/**
 * Recursively copy a directory, replacing the destination if it exists.
 */
function CopyDirectory(sourceDir, destinationDir)
{
  fs.mkdirSync(path.dirname(destinationDir), { recursive: true });
  fs.rmSync(destinationDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, destinationDir, { recursive: true });
}

/**
 * Copy the pruned dist/ into <outputDir>/web/ and zip it as <name>-<version>-web.zip.
 * Returns { webDir, zipPath } — zipPath is null when zip is unavailable or fails.
 */
export function WriteWebArtifacts(appDir, config)
{
  const distDir = path.join(appDir, "dist");
  const releaseDir = ResolveOutputDir(appDir, config.outputDir);
  const webDir = path.join(releaseDir, "web");
  fs.mkdirSync(releaseDir, { recursive: true });

  console.log(`[publish] copy site → ${webDir}`);
  CopyDirectory(distDir, webDir);

  const name = path.basename(appDir);
  const zipName = `${name}-${config.version}-web.zip`;
  const zipPath = path.join(releaseDir, zipName);

  if (fs.existsSync(zipPath))
  {
    fs.unlinkSync(zipPath);
  }

  const zipCheck = spawnSync("which", ["zip"], { encoding: "utf8" });
  if (zipCheck.status !== 0)
  {
    console.warn("[publish] warning: `zip` binary not found — skipping zip; web/ is the artifact");
    return { webDir, zipPath: null };
  }

  const result = spawnSync("zip", ["-r", zipPath, "."], {
    cwd: webDir,
    stdio: "inherit",
  });
  if (result.status !== 0)
  {
    console.warn("[publish] warning: zip failed — web/ is still the artifact");
    return { webDir, zipPath: null };
  }

  return { webDir, zipPath };
}

/**
 * Parse optional --base override from argv.
 */
function ParseBaseArg(argv)
{
  for (let index = 0; index < argv.length; index++)
  {
    const flag = argv[index];
    if (flag === "--base")
    {
      return argv[index + 1];
    }
    if (flag.startsWith("--base="))
    {
      return flag.slice("--base=".length);
    }
  }
  return undefined;
}

/**
 * Validate that the start level is included in the build.
 */
function AssertStartIncluded(levelsConfig)
{
  if (levelsConfig.start === undefined || levelsConfig.start === "")
  {
    console.error("[publish] no start level configured (levels.start / defaultLevel)");
    process.exit(1);
  }
  if (!levelsConfig.include.includes(levelsConfig.start))
  {
    console.error(
      `[publish] start level "${levelsConfig.start}" is not in levels.include — ` +
      `add it or change levels.start`,
    );
    process.exit(1);
  }
}

function Main()
{
  const argv = process.argv.slice(2);
  const appName = ParseAppArg(argv);
  const appDir = ResolveAppDir(appName);
  const config = ReadPublishConfig(appDir);
  const levelsConfig = ReadLevelsConfig(appDir);
  const base = ParseBaseArg(argv) ?? config.web.base;

  AssertStartIncluded(levelsConfig);

  TypecheckApp(appDir);
  BuildWeb(appDir, base);
  PruneLevels(appDir, levelsConfig.include);
  const { webDir, zipPath } = WriteWebArtifacts(appDir, config);

  console.log(`[publish] done → ${webDir} (${FormatBytes(DirectorySizeBytes(webDir))})`);
  console.log(`[publish] serve with: npx serve "${webDir}"`);
  if (zipPath !== null)
  {
    console.log(`[publish] zip → ${zipPath} (${FormatBytes(fs.statSync(zipPath).size)})`);
  }
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] !== undefined ? path.resolve(process.argv[1]) : "";
if (invokedFile === thisFile)
{
  Main();
}
