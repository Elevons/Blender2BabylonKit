import {
  Scene,
  ShadowGenerator,
  DirectionalLight,
  SpotLight,
  PointLight,
} from "@babylonjs/core";
import type { Light, IShadowLight, AbstractMesh } from "@babylonjs/core";
import type { ShadowSettings } from "../core/types";

export interface ShadowOptions {
  mapSize?: number; // default resolution when a light doesn't override it
}

/** A shadow-casting light paired with its per-light Blender settings. */
export interface ShadowCaster {
  light: Light;
  settings?: ShadowSettings;
}

/** Only Directional / Spot / Point lights can cast shadows. */
function IsShadowLight(light: Light): light is IShadowLight
{
  return (
    light instanceof DirectionalLight ||
    light instanceof SpotLight ||
    light instanceof PointLight
  );
}

/** Apply a Blender shadow filter choice to a generator. */
function ApplyShadowFilter(shadowGenerator: ShadowGenerator, filter?: ShadowSettings["filter"]): void
{
  switch (filter)
  {
    case "PCSS":
      shadowGenerator.useContactHardeningShadow = true;
      shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      break;

    case "POISSON":
      shadowGenerator.usePoissonSampling = true;
      break;

    case "BLUR_ESM":
      shadowGenerator.useBlurExponentialShadowMap = true;
      break;

    case "NONE":
      // Hard shadows — leave all filtering off.
      break;

    case "PCF":
    default:
      shadowGenerator.usePercentageCloserFiltering = true;
      shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      break;
  }
}

/**
 * Build a ShadowGenerator for each shadow-casting light, apply that light's
 * Blender shadow settings (bias, filter, frustum clip, etc.), and register every
 * mesh as caster + receiver. Returns the generators for further tuning/disposal.
 */
export function SetupShadows(
  scene: Scene,
  casters: ShadowCaster[],
  options: ShadowOptions = {}
): ShadowGenerator[]
{
  const defaultMapSize = options.mapSize ?? 1024;
  const renderableMeshes: AbstractMesh[] = scene.meshes.filter((mesh) => mesh.getTotalVertices() > 0);

  for (const mesh of renderableMeshes)
  {
    mesh.receiveShadows = true;
  }

  const generators: ShadowGenerator[] = [];

  for (const caster of casters)
  {
    const light = caster.light;
    if (!IsShadowLight(light))
    {
      console.warn(`[bjs] light "${light.name}" can't cast shadows; skipping`);
      continue;
    }

    const settings = caster.settings ?? {};

    // Frustum clip planes live on the light (0 = leave Babylon's auto-fit).
    if (settings.minZ)
    {
      light.shadowMinZ = settings.minZ;
    }
    if (settings.maxZ)
    {
      light.shadowMaxZ = settings.maxZ;
    }

    const mapSize = settings.mapSize && settings.mapSize > 0 ? settings.mapSize : defaultMapSize;
    const shadowGenerator = new ShadowGenerator(mapSize, light);

    ApplyShadowFilter(shadowGenerator, settings.filter);
    if (typeof settings.bias === "number")
    {
      shadowGenerator.bias = settings.bias;
    }
    if (typeof settings.normalBias === "number")
    {
      shadowGenerator.normalBias = settings.normalBias;
    }
    if (typeof settings.darkness === "number")
    {
      shadowGenerator.setDarkness(settings.darkness);
    }

    for (const mesh of renderableMeshes)
    {
      shadowGenerator.addShadowCaster(mesh);
    }

    generators.push(shadowGenerator);
  }

  return generators;
}
