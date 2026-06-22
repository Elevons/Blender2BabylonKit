import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LAUNCHER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_ROOT = path.resolve(LAUNCHER_DIR, "../..");
export const APPS_DIR = path.join(REPO_ROOT, "apps");
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

export const EDITOR_ASSET_FOLDER: Record<string, AssetFolder> = {
  gui: "gui",
  npe: "particles",
  nme: "materials",
  nge: "geometry",
  sfe: "filters",
  nrge: "render-graphs",
};

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
}

export function ReadProjectManifest(appDir: string): BabylonProjectManifest | null
{
  const manifestPath = path.join(appDir, "babylon-project.json");
  if (!fs.existsSync(manifestPath))
  {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as BabylonProjectManifest;
}

export function WorkspaceAssetRoot(appName: string, level?: string): string
{
  const appDir = path.join(APPS_DIR, appName);
  if (level && level !== "_workspace")
  {
    return path.join(appDir, "public", "levels", level);
  }
  return path.join(appDir, "public", "workspace");
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
