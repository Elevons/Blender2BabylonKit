#!/usr/bin/env node
/**
 * Desktop publish via Tauri: web build + prune + tauri build → release/.
 *
 *   npm run publish:desktop -- --app my-game
 *
 * Note: Tauri web assets use base "./" so custom-protocol / file packaging
 * resolves relative asset URLs correctly.
 *
 * Bundle formats come from publish.desktop.targets in babylon-project.json.
 * A format for another OS only succeeds when you build on that OS (or CI).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  ParseAppArg,
  ReadLevelsConfig,
  ReadPublishConfig,
  ResolveAppDir,
  ResolveBundleTargets,
  ResolveOutputDir,
} from "./config.mjs";
import { ApplyPublishIcon } from "./icon.mjs";
import { BuildWeb, PruneLevels, TypecheckApp } from "./web.mjs";

const BUNDLE_DIRS = ["deb", "rpm", "appimage", "msi", "nsis", "dmg", "macos"];

/**
 * Sync publish block identity + desktop targets into src-tauri/tauri.conf.json.
 */
function SyncTauriConf(appDir, config)
{
  const confPath = path.join(appDir, "src-tauri", "tauri.conf.json");
  const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
  conf.productName = config.productName;
  conf.identifier = config.identifier;
  conf.version = config.version;
  if (conf.app?.windows?.[0])
  {
    conf.app.windows[0].title = config.productName;
  }

  const bundle = ResolveBundleTargets(config.desktop.targets);
  conf.bundle = conf.bundle ?? {};
  conf.bundle.active = bundle.active;
  conf.bundle.targets = bundle.targets;

  fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
  console.log(
    `[publish:desktop] ${config.productName} ${config.version} (${config.identifier})`,
  );
  console.log(
    `[publish:desktop] bundle.targets = ${JSON.stringify(bundle.targets)} ` +
    `(active: ${bundle.active})`,
  );
}

/**
 * Copy Tauri bundle artifacts into the configured output directory.
 */
function CopyBundleArtifacts(appDir, config)
{
  const releaseDir = ResolveOutputDir(appDir, config.outputDir);
  fs.mkdirSync(releaseDir, { recursive: true });
  const bundleRoot = path.join(appDir, "src-tauri", "target", "release", "bundle");
  const copied = [];

  if (!fs.existsSync(bundleRoot))
  {
    console.warn("[publish:desktop] no bundle/ directory — tauri build may have failed");
    return copied;
  }

  for (const folder of BUNDLE_DIRS)
  {
    const folderPath = path.join(bundleRoot, folder);
    if (!fs.existsSync(folderPath))
    {
      continue;
    }
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true }))
    {
      if (!entry.isFile())
      {
        continue;
      }
      const sourcePath = path.join(folderPath, entry.name);
      const destinationPath = path.join(releaseDir, entry.name);
      fs.copyFileSync(sourcePath, destinationPath);
      copied.push(destinationPath);
      console.log(`[publish:desktop] artifact → ${destinationPath}`);
    }
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

  const config = ReadPublishConfig(appDir);
  const levelsConfig = ReadLevelsConfig(appDir);
  const bundle = ResolveBundleTargets(config.desktop.targets);

  if (!bundle.active)
  {
    console.error(
      '[publish:desktop] publish.desktop.targets is "none" — nothing to build. ' +
      "Pick a platform preset in the hub or babylon-project.json.",
    );
    process.exit(1);
  }

  if (!levelsConfig.include.includes(levelsConfig.start))
  {
    console.error(
      `[publish:desktop] start level "${levelsConfig.start}" is not in levels.include`,
    );
    process.exit(1);
  }

  if (config.icon && config.icon.trim() !== "")
  {
    ApplyPublishIcon(appDir, config.icon);
  }

  SyncTauriConf(appDir, config);
  TypecheckApp(appDir);
  // Relative base so packaged tauri:// / asset protocol resolves correctly.
  BuildWeb(appDir, "./");
  PruneLevels(appDir, levelsConfig.include);

  console.log("[publish:desktop] tauri build");
  const result = spawnSync("npx", ["tauri", "build"], {
    cwd: appDir,
    stdio: "inherit",
  });
  if (result.status !== 0)
  {
    console.error(
      "[publish:desktop] tauri build failed — on Linux Mint/Ubuntu install:\n" +
      "  sudo apt install libwebkit2gtk-4.1-dev libdbus-1-dev pkg-config \\\n" +
      "    libayatana-appindicator3-dev librsvg2-dev\n" +
      "  (Your error was missing dbus-1.pc → libdbus-1-dev)\n" +
      "  https://v2.tauri.app/start/prerequisites/",
    );
    process.exit(result.status ?? 1);
  }

  const copied = CopyBundleArtifacts(appDir, config);
  console.log(
    `[publish:desktop] done — ${copied.length} artifact(s) in ${ResolveOutputDir(appDir, config.outputDir)}`,
  );
  console.log(
    "[publish:desktop] note: formats for other OSes only appear when you build on that OS " +
    "(or a CI runner for that OS).",
  );
}

Main();
