import {
  Scene,
  ShadowGenerator,
  DirectionalLight,
  SpotLight,
  PointLight,
} from "@babylonjs/core";
import type { Light, IShadowLight } from "@babylonjs/core";
import type { ShadowSettings } from "./types";

export interface ShadowOptions {
  mapSize?: number; // default resolution when a light doesn't override it
}

/** A shadow-casting light paired with its per-light Blender settings. */
export interface ShadowCaster {
  light: Light;
  settings?: ShadowSettings;
}

/** Hemispheric lights can't cast shadows; only these light types can. */
function isShadowLight(light: Light): light is IShadowLight {
  return (
    light instanceof DirectionalLight ||
    light instanceof SpotLight ||
    light instanceof PointLight
  );
}

function applyFilter(sg: ShadowGenerator, filter?: ShadowSettings["filter"]) {
  switch (filter) {
    case "PCSS":
      sg.useContactHardeningShadow = true;
      sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      break;
    case "POISSON":
      sg.usePoissonSampling = true;
      break;
    case "BLUR_ESM":
      sg.useBlurExponentialShadowMap = true;
      break;
    case "NONE":
      // hard shadows — leave all filtering off
      break;
    case "PCF":
    default:
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      break;
  }
}

/**
 * Build a ShadowGenerator for each shadow-casting light, applying that light's
 * Blender shadow settings (bias, filter, frustum clip, etc.), and register every
 * mesh as caster + receiver. Returns the generators for further tuning/disposal.
 */
export function setupShadows(
  scene: Scene,
  casters: ShadowCaster[],
  options: ShadowOptions = {}
): ShadowGenerator[] {
  const defaultSize = options.mapSize ?? 1024;
  const meshes = scene.meshes.filter((m) => m.getTotalVertices() > 0);
  for (const m of meshes) m.receiveShadows = true;

  const generators: ShadowGenerator[] = [];
  for (const { light, settings } of casters) {
    if (!isShadowLight(light)) {
      console.warn(`[bjs] light "${light.name}" can't cast shadows; skipping`);
      continue;
    }
    const s = settings ?? {};

    // Frustum clip planes live on the light (0 = leave Babylon's auto-fit).
    if (s.minZ) light.shadowMinZ = s.minZ;
    if (s.maxZ) light.shadowMaxZ = s.maxZ;

    const mapSize = s.mapSize && s.mapSize > 0 ? s.mapSize : defaultSize;
    const sg = new ShadowGenerator(mapSize, light);

    applyFilter(sg, s.filter);
    if (typeof s.bias === "number") sg.bias = s.bias;
    if (typeof s.normalBias === "number") sg.normalBias = s.normalBias;
    if (typeof s.darkness === "number") sg.setDarkness(s.darkness);

    for (const m of meshes) sg.addShadowCaster(m);
    generators.push(sg);
  }
  return generators;
}
