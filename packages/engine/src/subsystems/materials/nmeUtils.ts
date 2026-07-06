import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import type { NodeMaterialOverrideInfo } from "../../core/types";
import { ResolveManifestAssetUrl } from "../../core/loader/manifest";

/** Whether a URL should pass through untouched (http(s), data URI, or root-relative). */
export function IsAbsoluteAssetUrl(url: string): boolean
{
  return /^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("/");
}

/** The directory the NME JSON lives in — relative texture paths resolve beside it. */
export function MaterialRootUrl(baseUrl: string, manifestPath: string): string
{
  const lastSlash = manifestPath.lastIndexOf("/");
  return lastSlash >= 0
    ? ResolveManifestAssetUrl(baseUrl, manifestPath.slice(0, lastSlash + 1))
    : baseUrl;
}

/** Cache key for one parsed NodeMaterial (JSON file + Blender material name). */
export function MaterialCacheKey(info: NodeMaterialOverrideInfo): string
{
  // One Blender material name per cache entry — several materials may share the
  // same JSON file but carry different manifest texture/input overrides.
  return `${info.file}\0${info.name}`;
}

export interface NmeEditorData
{
  map?: Record<string, number>;
}

export interface NmeJson
{
  blocks?: unknown[];
}

const NME_TEXTURE_BLOCK_TYPES = new Set([
  "BABYLON.ImageSourceBlock",
  "BABYLON.TextureBlock",
]);

/**
 * NME often stores embedded image bytes on `texture.name` as a data URI while
 * leaving `texture.url` empty. Babylon's texture deserializer runs `urlRewriter`
 * on `url` and then overwrites `name` with the result — which wipes the embed
 * unless we copy `name` → `url` first.
 */
export function NormalizeNmeEmbeddedTextures(materialJson: NmeJson): void
{
  const blocks = materialJson.blocks;
  if (!Array.isArray(blocks))
  {
    return;
  }

  for (const block of blocks)
  {
    if (typeof block !== "object" || block === null)
    {
      continue;
    }

    const blockRecord = block as Record<string, unknown>;
    const customType = blockRecord.customType;
    if (typeof customType !== "string" || !NME_TEXTURE_BLOCK_TYPES.has(customType))
    {
      continue;
    }

    const texture = blockRecord.texture;
    if (typeof texture !== "object" || texture === null)
    {
      continue;
    }

    const textureRecord = texture as Record<string, unknown>;
    const url = typeof textureRecord.url === "string" ? textureRecord.url.trim() : "";
    if (url.length > 0)
    {
      continue;
    }

    const name = typeof textureRecord.name === "string" ? textureRecord.name.trim() : "";
    if (name.startsWith("data:"))
    {
      textureRecord.url = name;
    }
  }
}

/** Map a block id from the NME JSON to the runtime block uniqueId. */
export function ResolveNmeBlockUniqueId(nodeMaterial: NodeMaterial, blockId: number): number
{
  if (blockId <= 0)
  {
    return blockId;
  }

  const editorData = nodeMaterial.editorData as NmeEditorData | undefined;
  const mapped = editorData?.map?.[String(blockId)];
  if (mapped !== undefined)
  {
    return mapped;
  }

  return blockId;
}
