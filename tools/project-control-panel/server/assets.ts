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
  workspaceFolder: string | null;
  workspaceFile: string | null;
  sourceAvailable: boolean;
  deployedAvailable: boolean;
}

/**
 * Normalize a manifest-relative asset path for comparison.
 */
function NormalizeAssetReference(reference: string): string
{
  return reference.replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Match Blender export filename sanitization so workspace files can differ in spacing.
 */
function SanitizeAssetBasename(filename: string): string
{
  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  let safeStem = stem.replace(/[^\w.\-]+/g, "_");
  safeStem = safeStem.replace(/^[._]+|[._]+$/g, "") || "asset";
  return safeStem + extension.toLowerCase();
}

/**
 * True when a manifest string looks like a level-relative sidecar file path.
 */
function IsManifestAssetReference(reference: string): boolean
{
  const normalized = NormalizeAssetReference(reference);
  if (normalized.startsWith("//") || normalized.includes(".."))
  {
    return false;
  }
  if (/^https?:\/\//i.test(normalized))
  {
    return false;
  }

  const pathParts = normalized.split("/");
  if (pathParts.length < 2)
  {
    return false;
  }

  const fileName = pathParts[pathParts.length - 1];
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 && dotIndex < fileName.length - 1;
}

/**
 * Add manifest-relative asset paths found in a JSON value to the reference set.
 */
function CollectAssetReferences(value: unknown, references: Set<string>): void
{
  if (typeof value === "string")
  {
    const normalized = NormalizeAssetReference(value);
    if (IsManifestAssetReference(normalized))
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
 * Resolve a validated manifest-relative path below a level or workspace root.
 */
function ResolveDeployedAssetPath(root: string, reference: string): string
{
  const normalized = NormalizeAssetReference(reference);
  if (!IsManifestAssetReference(normalized))
  {
    throw new Error(`Invalid asset reference: ${reference}`);
  }

  const pathParts = normalized.split("/");
  const resolved = path.join(root, ...pathParts);
  if (!IsPathInside(resolved, root))
  {
    throw new Error(`Invalid asset reference: ${reference}`);
  }
  return resolved;
}

interface WorkspaceAssetMatch
{
  absolutePath: string;
  folder: string;
  file: string;
}

/**
 * Split a workspace-relative path into a top-level folder and the file path beneath it.
 */
function ParseWorkspaceRelativePath(relativePath: string): { folder: string; file: string }
{
  const pathParts = relativePath.split("/");
  if (pathParts.length === 1)
  {
    return { folder: "", file: pathParts[0] };
  }

  return {
    folder: pathParts[0],
    file: pathParts.slice(1).join("/"),
  };
}

/**
 * Build a referenced-asset row from a manifest path and on-disk copies.
 */
function BuildReferencedAsset(
  reference: string,
  workspaceRoot: string,
  levelRoot: string,
): ReferencedAsset
{
  const workspaceMatch = FindWorkspaceAssetSource(workspaceRoot, reference);
  const deployedPath = ResolveDeployedAssetPath(levelRoot, reference);

  return {
    reference,
    workspaceFolder: workspaceMatch?.folder ?? null,
    workspaceFile: workspaceMatch?.file ?? null,
    sourceAvailable: workspaceMatch !== null,
    deployedAvailable: fs.existsSync(deployedPath) && fs.statSync(deployedPath).isFile(),
  };
}

/**
 * Find a workspace source for a manifest reference, searching every workspace folder.
 */
function FindWorkspaceAssetSource(workspaceRoot: string, reference: string): WorkspaceAssetMatch | null
{
  const normalized = NormalizeAssetReference(reference);
  const pathParts = normalized.split("/");
  const exactPath = path.join(workspaceRoot, ...pathParts);
  if (fs.existsSync(exactPath) && fs.statSync(exactPath).isFile())
  {
    const relativePath = path.relative(workspaceRoot, exactPath).replace(/\\/g, "/");
    const location = ParseWorkspaceRelativePath(relativePath);
    return { absolutePath: exactPath, ...location };
  }

  const targetBasename = pathParts[pathParts.length - 1];
  const targetSanitized = SanitizeAssetBasename(targetBasename);
  const manifestFolder = pathParts[0];
  let folderBasenameMatch: WorkspaceAssetMatch | null = null;
  let basenameMatch: WorkspaceAssetMatch | null = null;
  let sanitizedMatch: WorkspaceAssetMatch | null = null;

  function ToMatch(entryPath: string): WorkspaceAssetMatch
  {
    const relativePath = path.relative(workspaceRoot, entryPath).replace(/\\/g, "/");
    const location = ParseWorkspaceRelativePath(relativePath);
    return { absolutePath: entryPath, ...location };
  }

  function WalkDirectory(directory: string): void
  {
    if (!fs.existsSync(directory))
    {
      return;
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true }))
    {
      const entryPath = path.join(directory, entry.name);
      if (!IsPathInside(entryPath, workspaceRoot))
      {
        continue;
      }

      if (entry.isDirectory())
      {
        WalkDirectory(entryPath);
        continue;
      }

      if (!entry.isFile())
      {
        continue;
      }

      const relative = path.relative(workspaceRoot, entryPath).replace(/\\/g, "/");
      const relativeParts = relative.split("/");
      if (relativeParts[0] === manifestFolder && entry.name === targetBasename)
      {
        folderBasenameMatch ??= ToMatch(entryPath);
      }

      if (entry.name === targetBasename)
      {
        basenameMatch ??= ToMatch(entryPath);
      }

      if (SanitizeAssetBasename(entry.name) === targetSanitized)
      {
        sanitizedMatch ??= ToMatch(entryPath);
      }
    }
  }

  WalkDirectory(workspaceRoot);
  return folderBasenameMatch ?? basenameMatch ?? sanitizedMatch;
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
    .map((reference) => BuildReferencedAsset(reference, workspaceRoot, levelRoot));
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
  const workspaceMatch = FindWorkspaceAssetSource(workspaceRoot, normalized);
  const deployedPath = ResolveDeployedAssetPath(levelRoot, normalized);
  if (workspaceMatch === null)
  {
    throw new Error(`Workspace source not found for manifest reference: ${normalized}`);
  }

  fs.mkdirSync(path.dirname(deployedPath), { recursive: true });
  fs.copyFileSync(workspaceMatch.absolutePath, deployedPath);

  return BuildReferencedAsset(normalized, workspaceRoot, levelRoot);
}
