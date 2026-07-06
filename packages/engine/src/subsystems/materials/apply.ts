import { MultiMaterial, type Material, type Scene } from "@babylonjs/core";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import type { NodeMaterialOverrideInfo } from "../../core/types";
import { MaterialCacheKey } from "./nmeUtils";
import { LoadNodeMaterial } from "./nmeLoad";

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
