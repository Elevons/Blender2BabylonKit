import type { Scene } from "@babylonjs/core";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import type { NodeMaterialOverrideInfo } from "../../core/types";
import { ResolveManifestAssetUrl } from "../../core/loader/manifest";
import {
  BindManifestGradients,
  BindManifestInputs,
  BindManifestTextures,
} from "./bindings";
import {
  IsAbsoluteAssetUrl,
  MaterialCacheKey,
  MaterialRootUrl,
  NormalizeNmeEmbeddedTextures,
  type NmeJson,
} from "./nmeUtils";

/**
 * Fetch and parse one NME JSON into a NodeMaterial (no shader compile), apply
 * manifest texture/input overrides, and cache the result per manifest entry.
 */
export async function LoadNodeMaterial(
  info: NodeMaterialOverrideInfo,
  scene: Scene,
  baseUrl: string,
  cache: Map<string, NodeMaterial>
): Promise<NodeMaterial>
{
  const cacheKey = MaterialCacheKey(info);
  const cached = cache.get(cacheKey);
  if (cached !== undefined)
  {
    return cached;
  }

  const fileUrl = ResolveManifestAssetUrl(baseUrl, info.file);
  const rootUrl = MaterialRootUrl(baseUrl, info.file);
  const urlRewriter = (url: string): string =>
  {
    const trimmed = url.trim();
    if (trimmed.length === 0)
    {
      return url;
    }
    if (IsAbsoluteAssetUrl(trimmed))
    {
      return trimmed;
    }
    return ResolveManifestAssetUrl(rootUrl, trimmed.replace(/^\.\//, ""));
  };

  let nodeMaterial: NodeMaterial;
  try
  {
    const response = await fetch(fileUrl);
    if (!response.ok)
    {
      throw new Error(`HTTP ${response.status}`);
    }

    const materialJson = JSON.parse(await response.text()) as NmeJson;
    NormalizeNmeEmbeddedTextures(materialJson);

    nodeMaterial = new NodeMaterial(info.name, scene);
    nodeMaterial.parseSerializedObject(materialJson, rootUrl, false, urlRewriter);
  }
  catch (error)
  {
    throw new Error(
      `node material "${info.file}": ${(error as Error).message}`
    );
  }

  await BindManifestTextures(nodeMaterial, info.textures, baseUrl, scene);
  BindManifestInputs(nodeMaterial, info.inputs);
  BindManifestGradients(nodeMaterial, info.gradients);

  cache.set(cacheKey, nodeMaterial);
  return nodeMaterial;
}
