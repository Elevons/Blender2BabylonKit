import fs from "node:fs";
import path from "node:path";

import {
  ASSET_FOLDERS,
  IsPathInside,
  SanitizeSegment,
  WorkspaceAssetRoot,
  type AssetFolder,
} from "./paths.js";

function AssetDirectory(appName: string, level: string, folder: AssetFolder): string
{
  const safeFolder = SanitizeSegment(folder);
  if (!ASSET_FOLDERS.includes(safeFolder as AssetFolder))
  {
    throw new Error(`Unknown asset folder: ${folder}`);
  }
  return path.join(WorkspaceAssetRoot(appName, level), safeFolder);
}

function EnsureAssetDirectory(appName: string, level: string, folder: AssetFolder): string
{
  const dir = AssetDirectory(appName, level, folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ListAssets(appName: string, level: string, folder: AssetFolder): string[]
{
  const dir = AssetDirectory(appName, level, folder);
  if (!fs.existsSync(dir))
  {
    return [];
  }
  return fs.readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .sort((a, b) => a.localeCompare(b));
}

export function ReadAsset(
  appName: string,
  level: string,
  folder: AssetFolder,
  filename: string,
): string
{
  const safeName = SanitizeSegment(filename);
  const filePath = path.join(AssetDirectory(appName, level, folder), safeName);
  const root = WorkspaceAssetRoot(appName, level);
  if (!IsPathInside(filePath, root) || !fs.existsSync(filePath))
  {
    throw new Error(`Asset not found: ${folder}/${safeName}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

export function WriteAsset(
  appName: string,
  level: string,
  folder: AssetFolder,
  filename: string,
  content: string,
): { path: string; relative: string }
{
  const safeName = SanitizeSegment(filename);
  if (!safeName.endsWith(".json"))
  {
    throw new Error("Only .json assets are supported");
  }
  const dir = EnsureAssetDirectory(appName, level, folder);
  const filePath = path.join(dir, safeName);
  const root = WorkspaceAssetRoot(appName, level);
  if (!IsPathInside(filePath, root))
  {
    throw new Error("Invalid asset path");
  }
  fs.writeFileSync(filePath, content, "utf8");
  const relativePrefix = level === "_workspace" ? "workspace" : path.join("levels", level);
  return {
    path: filePath,
    relative: path.join("public", relativePrefix, folder, safeName).replace(/\\/g, "/"),
  };
}

export function ListAllAssets(appName: string, level: string): Record<AssetFolder, string[]>
{
  const result = {} as Record<AssetFolder, string[]>;
  for (const folder of ASSET_FOLDERS)
  {
    result[folder] = ListAssets(appName, level, folder);
  }
  return result;
}
