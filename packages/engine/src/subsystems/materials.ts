import {
  Color3,
  Color4,
  MultiMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  type Material,
  type Scene,
} from "@babylonjs/core";
import { InputBlock } from "@babylonjs/core/Materials/Node/Blocks/Input/inputBlock";
import {
  GradientBlock,
  GradientBlockColorStep,
} from "@babylonjs/core/Materials/Node/Blocks/gradientBlock";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import type { NodeMaterialBlock } from "@babylonjs/core/Materials/Node/nodeMaterialBlock";
import type {
  NodeMaterialGradientInfo,
  NodeMaterialInputInfo,
  NodeMaterialOverrideInfo,
} from "../core/types";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

/** Whether a URL should pass through untouched (http(s), data URI, or root-relative). */
function IsAbsoluteAssetUrl(url: string): boolean
{
  return /^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("/");
}

/** The directory the NME JSON lives in — relative texture paths resolve beside it. */
function MaterialRootUrl(baseUrl: string, manifestPath: string): string
{
  const lastSlash = manifestPath.lastIndexOf("/");
  return lastSlash >= 0
    ? ResolveManifestAssetUrl(baseUrl, manifestPath.slice(0, lastSlash + 1))
    : baseUrl;
}

/** Cache key for a parsed NodeMaterial. */
/** Cache key for one parsed NodeMaterial (JSON file + Blender material name). */
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

interface NmeJson
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
function NormalizeNmeEmbeddedTextures(materialJson: NmeJson): void
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

/**
 * Fetch and parse one NME JSON (cached), normalize embedded textures, and bind
 * the manifest's texture/input overrides. No shader compile happens here —
 * BuildNodeMaterials does that once, later in FinalizeLevel.
 */
/**
 * Fetch and parse one NME JSON into a NodeMaterial (no shader compile), apply
 * manifest texture/input overrides, and cache the result per manifest entry.
 */
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

/** Locate a texture-bearing block by manifest blockName first, then mapped block id. */
/** Locate a texture-bearing block by name first, then by mapped NME block id. */
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

/** Apply the manifest's authored texture files over the JSON's embedded ones. */
/** Replace texture blocks with manifest-authored images (authoring wins over embedded JSON). */
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
  }
}

/** Locate an InputBlock by name first, then by mapped NME block id. */
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

/** Write a manifest input value into an InputBlock with the matching Babylon type. */
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

/** Apply every manifest inspector-parameter override to the parsed material. */
function BindManifestInputs(
  nodeMaterial: NodeMaterial,
  inputs: NodeMaterialOverrideInfo["inputs"]
): void
{
  if (inputs === undefined || inputs.length === 0)
  {
    return;
  }

  for (const binding of inputs)
  {
    const block = FindInputBlock(nodeMaterial, binding.blockId, binding.blockName);
    if (block === undefined)
    {
      continue;
    }

    ApplyInputValue(block, binding.type, binding.value);
  }
}

/** Locate a GradientBlock by name first, then by mapped NME block id. */
function FindGradientBlock(
  nodeMaterial: NodeMaterial,
  blockId: number,
  blockName?: string
): GradientBlock | undefined
{
  if (blockName !== undefined && blockName.length > 0)
  {
    const byName = nodeMaterial.getBlockByName(blockName);
    if (byName instanceof GradientBlock)
    {
      return byName;
    }
  }

  if (blockId > 0)
  {
    const runtimeId = ResolveNmeBlockUniqueId(nodeMaterial, blockId);
    const byId = nodeMaterial.attachedBlocks.find((block) => block.uniqueId === runtimeId);
    if (byId instanceof GradientBlock)
    {
      return byId;
    }
  }

  return undefined;
}

/** Write manifest gradient color steps into a GradientBlock (sorted ascending). */
function ApplyGradientValue(
  block: GradientBlock,
  colorSteps: NodeMaterialGradientInfo["colorSteps"]
): void
{
  const sorted = [...colorSteps].sort(
    (left, right) => left.step - right.step
  );

  block.colorSteps.length = 0;
  for (const step of sorted)
  {
    block.colorSteps.push(
      new GradientBlockColorStep(
        step.step,
        new Color3(step.color.r, step.color.g, step.color.b)
      )
    );
  }

  block.colorStepsUpdated();
}

/** Apply every manifest inspector-gradient override to the parsed material. */
function BindManifestGradients(
  nodeMaterial: NodeMaterial,
  gradients: NodeMaterialOverrideInfo["gradients"]
): void
{
  if (gradients === undefined || gradients.length === 0)
  {
    return;
  }

  for (const binding of gradients)
  {
    const block = FindGradientBlock(nodeMaterial, binding.blockId, binding.blockName);
    if (block === undefined)
    {
      continue;
    }

    ApplyGradientValue(block, binding.colorSteps);
  }
}

/** Gather NodeMaterials from a mesh material, descending into MultiMaterials. */
function CollectNodeMaterials(material: Material | null, seen: Set<NodeMaterial>): void
{
  if (material === null)
  {
    return;
  }

  if (material instanceof NodeMaterial)
  {
    seen.add(material);
    return;
  }

  if (material instanceof MultiMaterial)
  {
    for (const subMaterial of material.subMaterials)
    {
      CollectNodeMaterials(subMaterial, seen);
    }
  }
}

/**
 * Compile every scene NodeMaterial once — after scene IBL and manifest overrides
 * are in place. NME ReflectionBlocks read scene.environmentTexture at build time.
 */
export async function BuildNodeMaterials(scene: Scene): Promise<void>
{
  const nodeMaterials = new Set<NodeMaterial>();
  for (const mesh of scene.meshes)
  {
    CollectNodeMaterials(mesh.material, nodeMaterials);
  }

  for (const nodeMaterial of nodeMaterials)
  {
    await nodeMaterial.whenTexturesReadyAsync();
    nodeMaterial.build();
  }
}

/**
 * Replace glTF PBR materials with Node Material Editor shaders declared in the
 * manifest. Matches by Blender / glTF material name. Parsed materials are
 * cached per manifest material entry (JSON path + Blender material name).
 *
 * Loads run in two phases: every *unique* override fetches and parses in
 * parallel, then meshes are assigned synchronously from the cache — so load
 * time scales with unique materials, not mesh count.
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

  // Phase 1: which overrides does this scene actually use?
  const neededOverrides = new Map<string, NodeMaterialOverrideInfo>();
  for (const mesh of scene.meshes)
  {
    const materialName = mesh.material?.name;
    if (materialName === undefined || materialName.length === 0)
    {
      continue;
    }

    const override = overridesByName.get(materialName);
    if (override !== undefined)
    {
      neededOverrides.set(MaterialCacheKey(override), override);
    }
  }

  // Phase 2: fetch + parse every unique material in parallel. Failures warn
  // once per material; its meshes keep their glTF PBR material.
  await Promise.all(
    [...neededOverrides.values()].map(async (override) =>
    {
      try
      {
        await LoadNodeMaterial(override, scene, baseUrl, cache);
      }
      catch (error)
      {
        console.warn(`[bjs] failed to load node material "${override.name}":`, error);
      }
    })
  );

  // Phase 3: synchronous assignment from the cache.
  for (const mesh of scene.meshes)
  {
    const materialName = mesh.material?.name;
    if (materialName === undefined || materialName.length === 0)
    {
      continue;
    }

    const override = overridesByName.get(materialName);
    if (override === undefined)
    {
      continue;
    }

    const nodeMaterial = cache.get(MaterialCacheKey(override));
    if (nodeMaterial !== undefined)
    {
      mesh.material = nodeMaterial;
    }
  }
}
