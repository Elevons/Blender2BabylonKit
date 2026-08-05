import fs from "node:fs";
import path from "node:path";

import {
  ASSET_FOLDERS,
  IsPathInside,
  LevelAssetRoot,
  SanitizeSegment,
  type AssetFolder,
} from "./paths.js";

function AssetDirectory(level: string, folder: AssetFolder): string
{
  const safeFolder = SanitizeSegment(folder);
  if (!ASSET_FOLDERS.includes(safeFolder as AssetFolder))
  {
    throw new Error(`Unknown asset folder: ${folder}`);
  }
  return path.join(LevelAssetRoot(level), safeFolder);
}

function EnsureAssetDirectory(level: string, folder: AssetFolder): string
{
  const dir = AssetDirectory(level, folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ListAssets(level: string, folder: AssetFolder): string[]
{
  const dir = AssetDirectory(level, folder);
  if (!fs.existsSync(dir))
  {
    return [];
  }
  return fs.readdirSync(dir)
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .sort((left, right) => left.localeCompare(right));
}

export function ReadAsset(
  level: string,
  folder: AssetFolder,
  filename: string,
): string
{
  const safeName = SanitizeSegment(filename);
  const filePath = path.join(AssetDirectory(level, folder), safeName);
  const root = LevelAssetRoot(level);
  if (!IsPathInside(filePath, root) || !fs.existsSync(filePath))
  {
    throw new Error(`Asset not found: ${folder}/${safeName}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

export function WriteAsset(
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
  const dir = EnsureAssetDirectory(level, folder);
  const filePath = path.join(dir, safeName);
  const root = LevelAssetRoot(level);
  if (!IsPathInside(filePath, root))
  {
    throw new Error("Invalid asset path");
  }
  fs.writeFileSync(filePath, content, "utf8");
  return {
    path: filePath,
    relative: path.join("public", "levels", SanitizeSegment(level), folder, safeName).replace(/\\/g, "/"),
  };
}

export function ListAllAssets(level: string): Record<AssetFolder, string[]>
{
  const result = {} as Record<AssetFolder, string[]>;
  for (const folder of ASSET_FOLDERS)
  {
    result[folder] = ListAssets(level, folder);
  }
  return result;
}
