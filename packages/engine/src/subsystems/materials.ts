import {
  Texture,
  type Scene,
} from "@babylonjs/core";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import type { NodeMaterialBlock } from "@babylonjs/core/Materials/Node/nodeMaterialBlock";
import type { NodeMaterialOverrideInfo } from "../core/types";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

function IsAbsoluteAssetUrl(url: string): boolean
{
  return /^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("/");
}

function MaterialRootUrl(baseUrl: string, manifestPath: string): string
{
  const lastSlash = manifestPath.lastIndexOf("/");
  return lastSlash >= 0
    ? ResolveManifestAssetUrl(baseUrl, manifestPath.slice(0, lastSlash + 1))
    : baseUrl;
}

async function LoadNodeMaterial(
  info: NodeMaterialOverrideInfo,
  scene: Scene,
  baseUrl: string,
  cache: Map<string, NodeMaterial>
): Promise<NodeMaterial>
{
  const cached = cache.get(info.file);
  if (cached !== undefined)
  {
    return cached;
  }

  const fileUrl = ResolveManifestAssetUrl(baseUrl, info.file);
  const rootUrl = MaterialRootUrl(baseUrl, info.file);
  const urlRewriter = (url: string): string =>
  {
    if (IsAbsoluteAssetUrl(url))
    {
      return url;
    }
    return ResolveManifestAssetUrl(rootUrl, url.replace(/^\.\//, ""));
  };

  let nodeMaterial: NodeMaterial;
  try
  {
    nodeMaterial = await NodeMaterial.ParseFromFileAsync(
      info.name,
      fileUrl,
      scene,
      rootUrl,
      false,
      undefined,
      urlRewriter
    );
  }
  catch (error)
  {
    throw new Error(
      `node material "${info.file}": ${(error as Error).message}`
    );
  }

  await BindManifestTextures(nodeMaterial, info.textures, baseUrl, scene);

  cache.set(info.file, nodeMaterial);
  return nodeMaterial;
}

function FindTextureBlock(
  nodeMaterial: NodeMaterial,
  blockId: number,
  blockName?: string
): (NodeMaterialBlock & { texture?: Texture | null }) | undefined
{
  if (blockName !== undefined && blockName.length > 0)
  {
    const byName = nodeMaterial.getBlockByName(blockName);
    if (byName !== null && byName !== undefined && "texture" in byName)
    {
      return byName as NodeMaterialBlock & { texture?: Texture | null };
    }
  }

  if (blockId > 0)
  {
    const byId = nodeMaterial.attachedBlocks.find((block) => block.uniqueId === blockId);
    if (byId !== undefined && "texture" in byId)
    {
      return byId as NodeMaterialBlock & { texture?: Texture | null };
    }
  }

  return undefined;
}

async function BindManifestTextures(
  nodeMaterial: NodeMaterial,
  textures: NodeMaterialOverrideInfo["textures"],
  baseUrl: string,
  scene: Scene
): Promise<void>
{
  if (textures === undefined || textures.length === 0)
  {
    return;
  }

  let patched = false;
  for (const binding of textures)
  {
    const block = FindTextureBlock(nodeMaterial, binding.blockId, binding.blockName);
    if (block === undefined)
    {
      continue;
    }

    if (block.texture !== undefined && block.texture !== null)
    {
      continue;
    }

    block.texture = new Texture(ResolveManifestAssetUrl(baseUrl, binding.file), scene);
    patched = true;
  }

  if (patched)
  {
    nodeMaterial.build();
    await nodeMaterial.whenTexturesReadyAsync();
  }
}

/**
 * Replace glTF PBR materials with Node Material Editor shaders declared in the
 * manifest. Matches by Blender / glTF material name. Parsed materials are
 * cached per JSON file path.
 */
export async function ApplyNodeMaterials(
  scene: Scene,
  materials: NodeMaterialOverrideInfo[] | undefined,
  baseUrl: string
): Promise<void>
{
  if (materials === undefined || materials.length === 0)
  {
    return;
  }

  const overridesByName = new Map(materials.map((entry) => [entry.name, entry]));
  const cache = new Map<string, NodeMaterial>();

  for (const mesh of scene.meshes)
  {
    const gltfMaterial = mesh.material;
    if (gltfMaterial === null || gltfMaterial.name.length === 0)
    {
      continue;
    }

    const override = overridesByName.get(gltfMaterial.name);
    if (override === undefined)
    {
      continue;
    }

    try
    {
      mesh.material = await LoadNodeMaterial(override, scene, baseUrl, cache);
    }
    catch (error)
    {
      console.warn(
        `[bjs] failed to apply node material "${gltfMaterial.name}" on "${mesh.name}":`,
        error
      );
    }
  }
}
