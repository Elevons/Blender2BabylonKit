import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAUNCHER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(LAUNCHER_DIR, "../..");
export const LAUNCHER_PORT = Number(process.env.LAUNCHER_PORT ?? 3200);

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

export interface BabylonProjectManifest
{
  name: string;
  title: string;
  defaultLevel?: string;
  assetFolders: string[];
  dev: { port: number };
  blenderExportPath?: string;
  levels?: {
    include?: string[];
    start?: string;
    startManifest?: string;
  };
  publish?: {
    productName?: string;
    identifier?: string;
    version?: string;
    icon?: string;
    outputDir?: string;
    web?: { base?: string };
    desktop?: {
      targetsPreset?: string;
      targets?: string | string[];
    };
  };
}

/**
 * Resolve the single project this launcher instance serves.
 * Priority: --app <name>, BJS_PROJECT_DIR, walk up from cwd for babylon-project.json.
 */
export function ResolveProjectDir(): string
{
  const argv = process.argv;
  for (let index = 0; index < argv.length; index++)
  {
    if (argv[index] === "--app" && argv[index + 1])
    {
      const appName = argv[index + 1];
      const appDir = path.join(REPO_ROOT, "apps", appName);
      if (!fs.existsSync(path.join(appDir, "babylon-project.json")))
      {
        console.error(`apps/${appName} has no babylon-project.json — not a kit project`);
        process.exit(1);
      }
      return appDir;
    }
  }

  if (process.env.BJS_PROJECT_DIR)
  {
    const envDir = path.resolve(process.env.BJS_PROJECT_DIR);
    if (!fs.existsSync(path.join(envDir, "babylon-project.json")))
    {
      console.error(`BJS_PROJECT_DIR=${envDir} has no babylon-project.json`);
      process.exit(1);
    }
    return envDir;
  }

  let current = path.resolve(process.cwd());
  for (;;)
  {
    if (fs.existsSync(path.join(current, "babylon-project.json")))
    {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current)
    {
      break;
    }
    current = parent;
  }

  console.error(
    "No project found. Run with --app <name> from the monorepo, " +
    "or from inside a folder containing babylon-project.json.",
  );
  process.exit(1);
}

export const PROJECT_DIR = ResolveProjectDir();

export function ReadProjectManifest(appDir: string = PROJECT_DIR): BabylonProjectManifest | null
{
  const manifestPath = path.join(appDir, "babylon-project.json");
  if (!fs.existsSync(manifestPath))
  {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BabylonProjectManifest;
}

/**
 * Asset root for a specific exported level under public/levels/.
 */
export function LevelAssetRoot(level: string): string
{
  return path.join(PROJECT_DIR, "public", "levels", SanitizeSegment(level));
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
