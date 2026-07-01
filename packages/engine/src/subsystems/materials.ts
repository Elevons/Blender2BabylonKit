import {
  Color3,
  Color4,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  type Scene,
} from "@babylonjs/core";
import { InputBlock } from "@babylonjs/core/Materials/Node/Blocks/Input/inputBlock";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import type { NodeMaterialBlock } from "@babylonjs/core/Materials/Node/nodeMaterialBlock";
import type { NodeMaterialInputInfo, NodeMaterialOverrideInfo } from "../core/types";
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

function MaterialCacheKey(info: NodeMaterialOverrideInfo): string
{
  // One Blender material name per cache entry — several materials may share the
  // same JSON file but carry different manifest texture/input overrides.
  return `${info.file}\0${info.name}`;
}

interface NmeEditorData
{
  map?: Record<string, number>;
}

/** Map a block id from the NME JSON to the runtime block uniqueId. */
function ResolveNmeBlockUniqueId(nodeMaterial: NodeMaterial, blockId: number): number
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

async function LoadNodeMaterial(
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
  BindManifestInputs(nodeMaterial, info.inputs);
  await nodeMaterial.whenTexturesReadyAsync();

  cache.set(cacheKey, nodeMaterial);
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
    const runtimeId = ResolveNmeBlockUniqueId(nodeMaterial, blockId);
    const byId = nodeMaterial.attachedBlocks.find((block) => block.uniqueId === runtimeId);
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
      console.warn(
        `[bjs] node material texture block not found (id ${binding.blockId}` +
        `${binding.blockName !== undefined ? `, name "${binding.blockName}"` : ""})`
      );
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

function FindInputBlock(
  nodeMaterial: NodeMaterial,
  blockId: number,
  blockName?: string
): InputBlock | undefined
{
  if (blockName !== undefined && blockName.length > 0)
  {
    const byName = nodeMaterial.getBlockByName(blockName);
    if (byName instanceof InputBlock)
    {
      return byName;
    }
  }

  if (blockId > 0)
  {
    const runtimeId = ResolveNmeBlockUniqueId(nodeMaterial, blockId);
    const byId = nodeMaterial.attachedBlocks.find((block) => block.uniqueId === runtimeId);
    if (byId instanceof InputBlock)
    {
      return byId;
    }
  }

  return undefined;
}

function ApplyInputValue(
  block: InputBlock,
  valueType: NodeMaterialInputInfo["type"],
  value: NodeMaterialInputInfo["value"]
): void
{
  if (valueType === "FLOAT" || valueType === "INT")
  {
    block.value = value as number;
    return;
  }

  if (valueType === "BOOL")
  {
    block.value = value as boolean;
    return;
  }

  const numbers = value as number[];
  if (valueType === "VECTOR2")
  {
    block.value = new Vector2(numbers[0] ?? 0, numbers[1] ?? 0);
    return;
  }

  if (valueType === "VECTOR3")
  {
    block.value = new Vector3(numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0);
    return;
  }

  if (valueType === "VECTOR4")
  {
    block.value = new Vector4(
      numbers[0] ?? 0,
      numbers[1] ?? 0,
      numbers[2] ?? 0,
      numbers[3] ?? 0
    );
    return;
  }

  if (valueType === "COLOR3")
  {
    block.value = new Color3(numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0);
    return;
  }

  block.value = new Color4(
    numbers[0] ?? 0,
    numbers[1] ?? 0,
    numbers[2] ?? 0,
    numbers[3] ?? 1
  );
}

function BindManifestInputs(
  nodeMaterial: NodeMaterial,
  inputs: NodeMaterialOverrideInfo["inputs"]
): void
{
  if (inputs === undefined || inputs.length === 0)
  {
    return;
  }

  let patched = false;
  for (const binding of inputs)
  {
    const block = FindInputBlock(nodeMaterial, binding.blockId, binding.blockName);
    if (block === undefined)
    {
      continue;
    }

    ApplyInputValue(block, binding.type, binding.value);
    patched = true;
  }

  if (patched)
  {
    nodeMaterial.build(false);
  }
}

/**
 * Replace glTF PBR materials with Node Material Editor shaders declared in the
 * manifest. Matches by Blender / glTF material name. Parsed materials are
 * cached per manifest material entry (JSON path + Blender material name).
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
