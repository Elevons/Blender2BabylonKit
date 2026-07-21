import { Material, MultiMaterial, Texture, type Scene } from "@babylonjs/core";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import type { DetailMapConfiguration } from "@babylonjs/core/Materials/material.detailMapConfiguration";
import type { DetailMapOverrideInfo } from "../../core/types";
import { ResolveManifestAssetUrl } from "../../core/loader/manifest";

const NORMAL_BLEND_METHODS: Record<NonNullable<DetailMapOverrideInfo["normalBlendMethod"]>, number> =
{
  WHITEOUT: 0,
  RNM: 1,
};

interface MaterialWithDetailMap extends Material
{
  detailMap: DetailMapConfiguration;
}

/** True when a material exposes Babylon's DetailMapConfiguration plugin. */
function MaterialSupportsDetailMap(material: Material | null): material is MaterialWithDetailMap
{
  if (material === null)
  {
    return false;
  }

  if (material instanceof NodeMaterial)
  {
    return false;
  }

  return "detailMap" in material;
}

/** Walk a material, including MultiMaterial sub-slots. */
function ForEachApplicableMaterial(
  material: Material | null,
  callback: (subMaterial: MaterialWithDetailMap) => void
): void
{
  if (MaterialSupportsDetailMap(material))
  {
    callback(material);
    return;
  }

  if (material instanceof MultiMaterial)
  {
    for (const subMaterial of material.subMaterials)
    {
      if (MaterialSupportsDetailMap(subMaterial))
      {
        callback(subMaterial);
      }
    }
  }
}

/** Wire one manifest detail-map entry onto a glTF PBR (or Standard) material. */
function ApplyDetailMapToMaterial(
  material: MaterialWithDetailMap,
  info: DetailMapOverrideInfo,
  scene: Scene,
  baseUrl: string
): void
{
  const detailMap = material.detailMap;
  const textureUrl = ResolveManifestAssetUrl(baseUrl, info.file);

  const detailTexture = new Texture(textureUrl, scene);
  detailTexture.coordinatesIndex = info.coordinatesIndex ?? 0;

  const uvScale = info.uvScale ?? 1.0;
  detailTexture.uScale = uvScale;
  detailTexture.vScale = uvScale;

  detailMap.texture = detailTexture;
  detailMap.isEnabled = true;

  if (info.diffuseBlendLevel !== undefined)
  {
    detailMap.diffuseBlendLevel = info.diffuseBlendLevel;
  }

  if (info.roughnessBlendLevel !== undefined)
  {
    detailMap.roughnessBlendLevel = info.roughnessBlendLevel;
  }

  if (info.bumpLevel !== undefined)
  {
    detailMap.bumpLevel = info.bumpLevel;
  }

  if (info.normalBlendMethod !== undefined)
  {
    detailMap.normalBlendMethod = NORMAL_BLEND_METHODS[info.normalBlendMethod];
  }

  material.markDirty(Material.TextureDirtyFlag);
}

/**
 * Apply manifest detail-map overrides to loaded glTF PBR materials. Matches by
 * Blender / glTF material name. Skips materials already using Node Materials.
 */
export function ApplyDetailMaps(
  scene: Scene,
  detailMaps: DetailMapOverrideInfo[] | undefined,
  baseUrl: string
): void
{
  if (detailMaps === undefined || detailMaps.length === 0)
  {
    return;
  }

  const overridesByName = new Map(detailMaps.map((entry) => [entry.name, entry]));

  for (const material of scene.materials)
  {
    const override = overridesByName.get(material.name);
    if (override === undefined)
    {
      continue;
    }

    ForEachApplicableMaterial(material, (subMaterial) =>
    {
      ApplyDetailMapToMaterial(subMaterial, override, scene, baseUrl);
    });
  }
}
