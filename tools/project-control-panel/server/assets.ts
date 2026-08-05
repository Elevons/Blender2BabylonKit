import fs from "node:fs";
import path from "node:path";

import {
  ASSET_FOLDERS,
  IsPathInside,
  SanitizeSegment,
  WorkspaceAssetRoot,
  type AssetFolder,
} from "./paths.js";

export interface ReferencedAsset
{
  reference: string;
  folder: AssetFolder;
  file: string;
  sourceAvailable: boolean;
  deployedAvailable: boolean;
}

/**
 * Add manifest-relative asset paths found in a JSON value to the reference set.
 */
function CollectAssetReferences(value: unknown, references: Set<string>): void
{
  if (typeof value === "string")
  {
    const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
    const pathParts = normalized.split("/");
    const folder = pathParts[0] as AssetFolder;
    if (ASSET_FOLDERS.includes(folder) && pathParts.length > 1)
    {
      references.add(normalized);
    }
    return;
  }

  if (Array.isArray(value))
  {
    for (const item of value)
    {
      CollectAssetReferences(item, references);
    }
    return;
  }

  if (value !== null && typeof value === "object")
  {
    for (const propertyValue of Object.values(value as Record<string, unknown>))
    {
      CollectAssetReferences(propertyValue, references);
    }
  }
}

/**
 * Read every scene manifest for a level and return its deployed asset references.
 */
function ReadManifestReferences(appName: string, level: string): Set<string>
{
  const levelRoot = WorkspaceAssetRoot(appName, level);
  const references = new Set<string>();
  if (!fs.existsSync(levelRoot))
  {
    return references;
  }

  const manifestFiles = fs.readdirSync(levelRoot)
    .filter((fileName) => fileName.endsWith(".scene.json"))
    .sort((left, right) => left.localeCompare(right));

  for (const manifestFile of manifestFiles)
  {
    const manifestPath = path.join(levelRoot, manifestFile);
    if (!fs.statSync(manifestPath).isFile())
    {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
    CollectAssetReferences(manifest, references);
  }

  return references;
}

/**
 * Resolve a validated manifest-relative path below an asset root.
 */
function ResolveReferencedAssetPath(root: string, reference: string): string
{
  const normalized = reference.replace(/\\/g, "/").replace(/^\.\//, "");
  const pathParts = normalized.split("/");
  const folder = pathParts[0] as AssetFolder;
  if (!ASSET_FOLDERS.includes(folder) || pathParts.length < 2 || pathParts.includes(".."))
  {
    throw new Error(`Invalid asset reference: ${reference}`);
  }

  const resolved = path.join(root, ...pathParts);
  if (!IsPathInside(resolved, root))
  {
    throw new Error(`Invalid asset reference: ${reference}`);
  }
  return resolved;
}

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
  const relative = level === "_workspace"
    ? path.join("workspace", folder, safeName)
    : path.join("public", "levels", level, folder, safeName);
  return {
    path: filePath,
    relative: relative.replace(/\\/g, "/"),
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

/**
 * List assets referenced by the level manifests and report whether each copy exists.
 */
export function ListReferencedAssets(appName: string, level: string): ReferencedAsset[]
{
  const workspaceRoot = WorkspaceAssetRoot(appName, "_workspace");
  const levelRoot = WorkspaceAssetRoot(appName, level);

  return [...ReadManifestReferences(appName, level)]
    .sort((left, right) => left.localeCompare(right))
    .map((reference) =>
    {
      const [folder, ...fileParts] = reference.split("/");
      const sourcePath = ResolveReferencedAssetPath(workspaceRoot, reference);
      const deployedPath = ResolveReferencedAssetPath(levelRoot, reference);
      return {
        reference,
        folder: folder as AssetFolder,
        file: fileParts.join("/"),
        sourceAvailable: fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile(),
        deployedAvailable: fs.existsSync(deployedPath) && fs.statSync(deployedPath).isFile(),
      };
    });
}

/**
 * Copy a manifest-referenced workspace asset over its deployed level copy.
 */
export function ReloadReferencedAsset(
  appName: string,
  level: string,
  reference: string,
): ReferencedAsset
{
  const references = ReadManifestReferences(appName, level);
  const normalized = reference.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!references.has(normalized))
  {
    throw new Error(`Asset is not referenced by a scene manifest: ${reference}`);
  }

  const workspaceRoot = WorkspaceAssetRoot(appName, "_workspace");
  const levelRoot = WorkspaceAssetRoot(appName, level);
  const sourcePath = ResolveReferencedAssetPath(workspaceRoot, normalized);
  const deployedPath = ResolveReferencedAssetPath(levelRoot, normalized);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile())
  {
    throw new Error(`Workspace source not found: workspace/${normalized}`);
  }

  fs.mkdirSync(path.dirname(deployedPath), { recursive: true });
  fs.copyFileSync(sourcePath, deployedPath);

  const [folder, ...fileParts] = normalized.split("/");
  return {
    reference: normalized,
    folder: folder as AssetFolder,
    file: fileParts.join("/"),
    sourceAvailable: true,
    deployedAvailable: true,
  };
}
