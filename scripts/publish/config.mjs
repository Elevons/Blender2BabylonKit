#!/usr/bin/env node
/**
 * Shared readers for babylon-project.json publish / levels blocks.
 * Used by scripts/publish/*.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Presets for Tauri bundle.targets (installer formats to attempt).
 * Building a format for another OS still requires that host (or cross-compile/CI).
 */
export const DESKTOP_TARGET_PRESETS = [
  { id: "all", label: "All platforms", targets: "all" },
  { id: "windows", label: "Windows only (msi)", targets: "msi" },
  { id: "macos", label: "macOS only (dmg)", targets: "dmg" },
  { id: "linux", label: "Linux only (deb + appimage)", targets: "deb,appimage" },
  { id: "windows-macos", label: "Windows + macOS", targets: "msi,dmg" },
  { id: "windows-linux", label: "Windows + Linux", targets: "msi,deb,appimage" },
  { id: "macos-linux", label: "macOS + Linux", targets: "dmg,deb,appimage" },
  { id: "none", label: "None (skip desktop bundles)", targets: "none" },
];

/**
 * Resolve apps/<name> and require a babylon-project.json there.
 */
export function ResolveAppDir(appName)
{
  const appDir = path.join(REPO_ROOT, "apps", appName);
  const manifestPath = path.join(appDir, "babylon-project.json");
  if (!fs.existsSync(manifestPath))
  {
    console.error(`apps/${appName} has no babylon-project.json — not a kit project`);
    process.exit(1);
  }
  return appDir;
}

/**
 * Parse babylon-project.json from an app directory.
 */
export function ReadProjectManifest(appDir)
{
  const manifestPath = path.join(appDir, "babylon-project.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

/**
 * Normalize a targets value from preset id, raw string, or array.
 */
export function NormalizeDesktopTargets(rawTargets)
{
  if (rawTargets === undefined || rawTargets === null || rawTargets === "")
  {
    return "all";
  }

  if (Array.isArray(rawTargets))
  {
    return rawTargets.length === 0 ? "none" : rawTargets.join(",");
  }

  const asString = String(rawTargets).trim();
  const preset = DESKTOP_TARGET_PRESETS.find((entry) => entry.id === asString);
  if (preset !== undefined)
  {
    return preset.targets;
  }

  return asString;
}

/**
 * Value suitable for tauri.conf.json bundle.targets / bundle.active.
 */
export function ResolveBundleTargets(rawTargets)
{
  const normalized = NormalizeDesktopTargets(rawTargets);
  if (normalized === "none")
  {
    return { active: false, targets: [] };
  }
  if (normalized === "all")
  {
    return { active: true, targets: "all" };
  }
  const list = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  return { active: true, targets: list.length === 1 ? list[0] : list };
}

/**
 * Publish identity with defaults filled from name / title.
 */
export function ReadPublishConfig(appDir)
{
  const manifest = ReadProjectManifest(appDir);
  const name = manifest.name ?? path.basename(appDir);
  const title = manifest.title ?? name;
  const publish = manifest.publish ?? {};
  const desktop = publish.desktop ?? {};

  return {
    productName: publish.productName ?? title,
    identifier: publish.identifier ?? `com.bjs.${name}`,
    version: publish.version ?? "0.1.0",
    icon: publish.icon ?? "",
    outputDir: publish.outputDir ?? "release",
    web: {
      base: publish.web?.base ?? "/",
    },
    desktop: {
      targets: NormalizeDesktopTargets(desktop.targets ?? "all"),
      targetsPreset: desktop.targetsPreset
        ?? DESKTOP_TARGET_PRESETS.find((entry) => entry.targets === NormalizeDesktopTargets(desktop.targets))?.id
        ?? (desktop.targets ? "custom" : "all"),
    },
  };
}

/**
 * Resolve the artifact output directory (absolute). Relative paths are under the app dir.
 */
export function ResolveOutputDir(appDir, outputDir)
{
  const relative = (outputDir && String(outputDir).trim() !== "")
    ? String(outputDir).trim()
    : "release";
  const absolute = path.isAbsolute(relative)
    ? relative
    : path.resolve(appDir, relative);
  return absolute;
}

/**
 * List level folder names under public/levels/.
 */
export function ListExportedLevels(appDir)
{
  const levelsDir = path.join(appDir, "public", "levels");
  if (!fs.existsSync(levelsDir))
  {
    return [];
  }

  return fs.readdirSync(levelsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/**
 * Levels include / start with fallbacks to defaultLevel and all exported folders.
 */
export function ReadLevelsConfig(appDir)
{
  const manifest = ReadProjectManifest(appDir);
  const exported = ListExportedLevels(appDir);
  const levels = manifest.levels ?? {};

  const include = Array.isArray(levels.include) && levels.include.length > 0
    ? levels.include
    : exported;

  const start = levels.start ?? manifest.defaultLevel ?? include[0];

  return {
    include,
    start,
    startManifest: levels.startManifest,
  };
}

/**
 * Extract --app <name> from argv; exit with usage if missing.
 */
export function ParseAppArg(argv)
{
  let appName;
  for (let index = 0; index < argv.length; index++)
  {
    const flag = argv[index];
    if (flag === "--app")
    {
      appName = argv[++index];
    }
  }

  if (!appName)
  {
    console.error("Usage: --app <name> is required");
    process.exit(1);
  }

  return appName;
}
