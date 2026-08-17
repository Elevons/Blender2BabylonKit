import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONTROL_PANEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directory that contains this panel's package.json (tools/… or b2bkit/control-panel). */
export { CONTROL_PANEL_DIR };

/**
 * Kit monorepo root when developing inside Blender2BabylonKit.
 * Two levels up from tools/project-control-panel.
 */
export const KIT_REPO_ROOT = path.resolve(CONTROL_PANEL_DIR, "../..");

export const PROJECT_MANIFEST_FILENAME = "b2bkit-project.json";
export const CONTROL_PANEL_PORT = Number(process.env.CONTROL_PANEL_PORT ?? 3200);

export const ASSET_FOLDERS = [
  "gui",
  "particles",
  "materials",
  "geometry",
  "filters",
  "render-graphs",
] as const;

export type AssetFolder = (typeof ASSET_FOLDERS)[number];

export const DEFAULT_PROJECT_MANIFEST = {
  assetFolders: [...ASSET_FOLDERS],
  dev: { port: 5173 },
};

/**
 * Publish-tab form values persisted in b2bkit-project.json so they survive
 * reloads and control-panel restarts. Entry level stays on `entryLevel`.
 */
export interface ProjectPublishSettings
{
  platform: "web" | "tauri";
  title: string;
  version: string;
  destination: string;
  levels: string[];
  encryptAssets: boolean;
  includeServer: boolean;
}

export interface B2BKitProjectManifest
{
  name: string;
  title: string;
  entryLevel?: string;
  defaultLevel?: string;
  assetFolders: string[];
  dev: { port: number };
  blenderExportPath?: string;
  publish?: ProjectPublishSettings;
}

/**
 * User project root: folder that contains `game/`.
 * Prefer cwd when it looks like an outsider project; otherwise the kit monorepo.
 */
export function ResolveProjectRoot(): string
{
  const fromEnv = process.env.B2BKIT_PROJECT_ROOT;
  if (fromEnv !== undefined && fromEnv.length > 0)
  {
    return path.resolve(fromEnv);
  }

  const cwdGame = path.join(process.cwd(), "game");
  if (fs.existsSync(path.join(cwdGame, "package.json")))
  {
    return process.cwd();
  }

  const monorepoGame = path.join(KIT_REPO_ROOT, "game");
  if (fs.existsSync(path.join(monorepoGame, "package.json")))
  {
    return KIT_REPO_ROOT;
  }

  return process.cwd();
}

/** @deprecated Prefer ResolveProjectRoot — kept for existing imports. */
export const REPO_ROOT = KIT_REPO_ROOT;

let cachedKitRepoRoot: string | null | undefined = undefined;

/**
 * Locate the Blender2BabylonKit checkout this panel is running from, or null
 * when the panel came from an installed kit package. Kit-only tooling (bjs-mcp,
 * the docs build) exists only in the checkout.
 */
export function ResolveKitRepoRoot(): string | null
{
  if (cachedKitRepoRoot !== undefined)
  {
    return cachedKitRepoRoot;
  }

  cachedKitRepoRoot = null;
  let directory = CONTROL_PANEL_DIR;

  while (true)
  {
    const packageJsonPath = path.join(directory, "package.json");
    if (fs.existsSync(packageJsonPath))
    {
      try
      {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string };
        if (packageJson.name === "bjs-level-kit")
        {
          cachedKitRepoRoot = directory;
          break;
        }
      }
      catch
      {
        // Unreadable package.json — keep walking up.
      }
    }

    const parent = path.dirname(directory);
    if (parent === directory)
    {
      break;
    }
    directory = parent;
  }

  return cachedKitRepoRoot;
}

export function GameDir(): string
{
  return path.join(ResolveProjectRoot(), "game");
}

/** @deprecated Prefer GameDir() — fixed path for monorepo-only callers. */
export const GAME_DIR = path.join(KIT_REPO_ROOT, "game");

/**
 * Resolve the single playable project's directory.
 */
export function ProjectDir(appName?: string): string
{
  void appName;
  return GameDir();
}

/**
 * Read the B2BKit project manifest when one exists.
 */
export function ReadProjectManifest(appDir: string): B2BKitProjectManifest | null
{
  const manifestPath = path.join(appDir, PROJECT_MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath))
  {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as B2BKitProjectManifest;
}

/**
 * Resolve an asset directory within the single game workspace.
 */
export function WorkspaceAssetRoot(appName: string, level?: string): string
{
  const appDir = ProjectDir(appName);
  if (level && level !== "_workspace")
  {
    return path.join(appDir, "public", "levels", level);
  }
  return path.join(appDir, "workspace");
}

export function SanitizeSegment(segment: string): string
{
  return segment.replace(/[^a-zA-Z0-9._\- ]+/g, "_");
}

export function IsPathInside(child: string, parent: string): boolean
{
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}
