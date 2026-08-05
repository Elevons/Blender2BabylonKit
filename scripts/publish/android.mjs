#!/usr/bin/env node
/**
 * Android publish via Tauri: web build + prune + tauri android build → release/.
 *
 *   npm run publish:android -- --app my-game
 *
 * V1 ships debug-signed APKs (fine for sideloading). For Play Store release signing:
 *   1. keytool -genkey -v -keystore release.keystore -alias bjs -keyalg RSA -keysize 2048 -validity 10000
 *   2. Wire signingConfigs in src-tauri/gen/android per
 *      https://v2.tauri.app/distribute/sign-android/
 *   3. Keep the keystore out of git.
 * Do not automate store upload.
 *
 * iOS: run `npx tauri ios init` / `npx tauri ios build` on a Mac with Xcode —
 * same publish block drives identity; not automated on Linux.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  ParseAppArg,
  ReadLevelsConfig,
  ReadPublishConfig,
  ResolveAppDir,
  ResolveOutputDir,
} from "./config.mjs";
import { BuildWeb, PruneLevels, TypecheckApp } from "./web.mjs";

const PREREQS_URL = "https://v2.tauri.app/start/prerequisites/#configure-for-mobile-targets";

/**
 * Fail fast with actionable messages when Android tooling is missing.
 */
function AssertAndroidEnvironment()
{
  if (!process.env.ANDROID_HOME)
  {
    console.error(
      "[publish:android] ANDROID_HOME is not set.\n" +
      `  See ${PREREQS_URL}`,
    );
    process.exit(1);
  }

  const ndkHome = process.env.NDK_HOME
    ?? FindNdkUnderAndroidHome(process.env.ANDROID_HOME);
  if (!ndkHome)
  {
    console.error(
      "[publish:android] NDK not found. Set NDK_HOME or install an NDK under $ANDROID_HOME/ndk/.\n" +
      `  See ${PREREQS_URL}`,
    );
    process.exit(1);
  }

  const javaResult = spawnSync("java", ["-version"], { encoding: "utf8" });
  const javaOutput = `${javaResult.stderr ?? ""}${javaResult.stdout ?? ""}`;
  const versionMatch = javaOutput.match(/version "(\d+)/);
  const major = versionMatch ? Number(versionMatch[1]) : 0;
  if (javaResult.status !== 0 || major < 17)
  {
    console.error(
      "[publish:android] Java 17+ is required (java -version).\n" +
      `  See ${PREREQS_URL}`,
    );
    process.exit(1);
  }
}

function FindNdkUnderAndroidHome(androidHome)
{
  const ndkRoot = path.join(androidHome, "ndk");
  if (!fs.existsSync(ndkRoot))
  {
    return null;
  }
  const versions = fs.readdirSync(ndkRoot).filter((entry) =>
  {
    return fs.statSync(path.join(ndkRoot, entry)).isDirectory();
  });
  if (versions.length === 0)
  {
    return null;
  }
  versions.sort();
  return path.join(ndkRoot, versions[versions.length - 1]);
}

/**
 * Recursively collect files matching an extension under a directory.
 */
function CollectFiles(rootDir, extensions, out)
{
  if (!fs.existsSync(rootDir))
  {
    return;
  }
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true }))
  {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory())
    {
      CollectFiles(fullPath, extensions, out);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (extensions.some((extension) => lower.endsWith(extension)))
    {
      out.push(fullPath);
    }
  }
}

function CopyAndroidArtifacts(appDir, config)
{
  const releaseDir = ResolveOutputDir(appDir, config.outputDir);
  fs.mkdirSync(releaseDir, { recursive: true });
  const outputsRoot = path.join(appDir, "src-tauri", "gen", "android", "app", "build", "outputs");
  const found = [];
  CollectFiles(outputsRoot, [".apk", ".aab"], found);

  const copied = [];
  for (const sourcePath of found)
  {
    const destinationPath = path.join(releaseDir, path.basename(sourcePath));
    fs.copyFileSync(sourcePath, destinationPath);
    copied.push(destinationPath);
    console.log(`[publish:android] artifact → ${destinationPath}`);
  }
  return copied;
}

function Main()
{
  const appName = ParseAppArg(process.argv.slice(2));
  const appDir = ResolveAppDir(appName);
  const tauriDir = path.join(appDir, "src-tauri");

  if (!fs.existsSync(tauriDir))
  {
    console.error(`No src-tauri/ — run: npm run publish:init -- --app ${appName}`);
    process.exit(1);
  }

  AssertAndroidEnvironment();

  const androidGen = path.join(tauriDir, "gen", "android");
  if (!fs.existsSync(androidGen))
  {
    console.log("[publish:android] tauri android init");
    const initResult = spawnSync("npx", ["tauri", "android", "init"], {
      cwd: appDir,
      stdio: "inherit",
    });
    if (initResult.status !== 0)
    {
      process.exit(initResult.status ?? 1);
    }
  }

  const config = ReadPublishConfig(appDir);
  const levelsConfig = ReadLevelsConfig(appDir);
  if (!levelsConfig.include.includes(levelsConfig.start))
  {
    console.error(
      `[publish:android] start level "${levelsConfig.start}" is not in levels.include`,
    );
    process.exit(1);
  }

  // Keep identity in sync (same as desktop).
  const confPath = path.join(tauriDir, "tauri.conf.json");
  const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
  conf.productName = config.productName;
  conf.identifier = config.identifier;
  conf.version = config.version;
  fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

  TypecheckApp(appDir);
  BuildWeb(appDir, "./");
  PruneLevels(appDir, levelsConfig.include);

  console.log("[publish:android] tauri android build --apk");
  const result = spawnSync("npx", ["tauri", "android", "build", "--apk"], {
    cwd: appDir,
    stdio: "inherit",
  });
  if (result.status !== 0)
  {
    process.exit(result.status ?? 1);
  }

  const copied = CopyAndroidArtifacts(appDir, config);
  console.log(
    `[publish:android] done — ${copied.length} artifact(s) in ${ResolveOutputDir(appDir, config.outputDir)}`,
  );
  console.log(
    "[publish:android] APKs are debug-signed. For release signing see the script header comments.",
  );
}

Main();
