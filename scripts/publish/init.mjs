#!/usr/bin/env node
/**
 * Stamp src-tauri/ into an app from the shared Tauri template.
 *
 *   npm run publish:init -- --app my-game
 *   npm run publish:init -- --app my-game --force
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ParseAppArg,
  ReadProjectManifest,
  ReadPublishConfig,
  ResolveAppDir,
  ResolveBundleTargets,
} from "./config.mjs";
import { ApplyPublishIcon } from "./icon.mjs";

const TEMPLATE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "templates",
  "tauri",
);

const SKIP = new Set(["target", "gen", "Cargo.lock"]);

/**
 * Recursively copy the template directory.
 */
function CopyTemplate(sourceDir, destinationDir)
{
  fs.mkdirSync(destinationDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true }))
  {
    if (SKIP.has(entry.name))
    {
      continue;
    }
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory())
    {
      CopyTemplate(sourcePath, destinationPath);
    }
    else
    {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

/**
 * Replace __PLACEHOLDER__ tokens in a text file.
 */
function ReplaceInFile(filePath, replacements)
{
  let content = fs.readFileSync(filePath, "utf8");
  for (const [token, value] of Object.entries(replacements))
  {
    content = content.split(token).join(value);
  }
  fs.writeFileSync(filePath, content);
}

/**
 * Kebab-case package name safe for Cargo.
 */
function ToPackageName(productName)
{
  return productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "app";
}

function ParseForce(argv)
{
  return argv.includes("--force");
}

function Main()
{
  const argv = process.argv.slice(2);
  const appName = ParseAppArg(argv);
  const force = ParseForce(argv);
  const appDir = ResolveAppDir(appName);
  const destination = path.join(appDir, "src-tauri");

  if (fs.existsSync(destination) && !force)
  {
    console.error(`apps/${appName}/src-tauri already exists (use --force to overwrite)`);
    process.exit(1);
  }

  if (fs.existsSync(destination) && force)
  {
    fs.rmSync(destination, { recursive: true, force: true });
  }

  const publish = ReadPublishConfig(appDir);
  const manifest = ReadProjectManifest(appDir);
  const devPort = String(manifest.dev?.port ?? 5173);
  const packageName = ToPackageName(publish.productName);
  const bundle = ResolveBundleTargets(publish.desktop.targets);

  CopyTemplate(TEMPLATE_DIR, destination);

  const replacements = {
    __PRODUCT_NAME__: publish.productName,
    __IDENTIFIER__: publish.identifier,
    __VERSION__: publish.version,
    __DEV_PORT__: devPort,
    __PACKAGE_NAME__: packageName,
    // JSON string value for targets — keep quotes in the template around this token
    // when targets is a string; rewrite properly below after placeholder pass.
    __TARGETS__: "all",
  };

  ReplaceInFile(path.join(destination, "tauri.conf.json"), replacements);
  ReplaceInFile(path.join(destination, "Cargo.toml"), replacements);

  // Apply bundle targets correctly (string | array | empty).
  const confPath = path.join(destination, "tauri.conf.json");
  const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
  conf.bundle = conf.bundle ?? {};
  conf.bundle.active = bundle.active;
  conf.bundle.targets = bundle.targets;
  fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");

  if (publish.icon && publish.icon.trim() !== "")
  {
    const ok = ApplyPublishIcon(appDir, publish.icon);
    if (!ok)
    {
      console.warn("[publish:init] continuing with template default icons");
    }
  }
  else
  {
    console.log(
      "[publish:init] no publish.icon set — using template defaults. " +
      "Add a 1024×1024 square PNG and run: npm run publish:icon -- --app " + appName,
    );
  }

  console.log(`Created apps/${appName}/src-tauri`);
  console.log(`  Desktop targets: ${publish.desktop.targets}`);
  console.log(`  Next: npm run publish:desktop -- --app ${appName}`);
  console.log(
    `  Desktop build requires: libwebkit2gtk-4.1-dev libdbus-1-dev pkg-config ` +
    `(see https://v2.tauri.app/start/prerequisites/)`,
  );
}

Main();
