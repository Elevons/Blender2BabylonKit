import {
  Scene,
  ShadowGenerator,
  DirectionalLight,
  SpotLight,
  PointLight,
  RenderTargetTexture,
} from "@babylonjs/core";
import type { Light, IShadowLight, AbstractMesh } from "@babylonjs/core";
import type { ShadowSettings } from "../core/types";

export interface ShadowOptions {
  mapSize?: number; // default resolution when a light doesn't override it
  /**
   * Render each shadow map once and freeze it (REFRESHRATE_RENDER_ONCE) for a
   * fully static world — a big perf win that lets you raise the map resolution.
   * Casters that move afterwards won't update; call Level.RefreshShadows() to
   * force a one-shot re-render. Default false.
   */
  freeze?: boolean;
}

/**
 * Shadow acne (the "stripes"/speckle from a surface shadowing itself) is fought
 * with a small offset along the surface normal. Blender ships normalBias = 0 by
 * default for every lamp, which leaves suns striped and point/spot lights with
 * acne around shadow edges. Apply this floor whenever a light doesn't set its
 * own value. Directional suns also need a tight depth frustum (see below); for
 * point/spot a bit more normal bias compensates for their lower-precision
 * perspective/cube depth maps.
 */
const DEFAULT_NORMAL_BIAS = 0.02;
const PUNCTUAL_NORMAL_BIAS = 0.03;

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

    // A directional sun's auto frustum keeps a huge depth range (the light is
    // placed far from the geometry), which wrecks shadow-map depth precision and
    // produces acne stripes. When the user hasn't pinned the clip planes, let
    // Babylon recompute a tight depth range from the actual casters each frame.
    if (light instanceof DirectionalLight && !settings.minZ && !settings.maxZ)
    {
      light.autoCalcShadowZBounds = true;
    }

    // Point/spot lights default their shadow depth range to the *camera's*
    // minZ/maxZ (often 0.1..100). That stretched depth buffer is a common source
    // of acne around shadow edges. The light contributes nothing past its range,
    // so cap the far plane there when the user hasn't pinned it (autoCalc is
    // directional-only, so this is the equivalent tightening for punctual lights).
    if (
      (light instanceof PointLight || light instanceof SpotLight) &&
      !settings.maxZ &&
      light.range > 0 &&
      light.range < Number.MAX_VALUE
    )
    {
      light.shadowMaxZ = light.range;
    }

    const mapSize = settings.mapSize && settings.mapSize > 0 ? settings.mapSize : defaultMapSize;
    const shadowGenerator = new ShadowGenerator(mapSize, light);

    ApplyShadowFilter(shadowGenerator, settings.filter);
    if (typeof settings.bias === "number")
    {
      shadowGenerator.bias = settings.bias;
    }
    // Apply normal bias, falling back to a sensible floor for every light type:
    // lamps export normalBias = 0, which leaves suns striped and point/spot
    // lights with acne around their shadow edges.
    if (typeof settings.normalBias === "number" && settings.normalBias > 0)
    {
      shadowGenerator.normalBias = settings.normalBias;
    }
    else
    {
      shadowGenerator.normalBias =
        light instanceof DirectionalLight ? DEFAULT_NORMAL_BIAS : PUNCTUAL_NORMAL_BIAS;
    }
    if (typeof settings.darkness === "number")
    {
      shadowGenerator.setDarkness(settings.darkness);
    }

    // Fade shadows out toward the edge of the frustum instead of clipping them
    // hard. Directional/spot only (Babylon ignores it for point lights).
    if (
      typeof settings.frustumEdgeFalloff === "number" &&
      (light instanceof DirectionalLight || light instanceof SpotLight)
    )
    {
      shadowGenerator.frustumEdgeFalloff = settings.frustumEdgeFalloff;
    }

    // Render only back faces into the shadow map. Strongly reduces self-shadowing
    // acne (the casting surface no longer shadows itself), but can leak light
    // ("peter-panning") on thin or open/single-sided geometry — hence opt-in.
    if (settings.forceBackFaces)
    {
      shadowGenerator.forceBackFacesOnly = true;
    }

    for (const mesh of renderableMeshes)
    {
      shadowGenerator.addShadowCaster(mesh);
    }

    // Static-world freeze: render the depth map on the next frame, then stop.
    // Left until after extents/casters are set so the single render is correct.
    if (options.freeze)
    {
      const shadowMap = shadowGenerator.getShadowMap();
      if (shadowMap !== null)
      {
        shadowMap.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
      }
    }

    generators.push(shadowGenerator);
  }

  return generators;
}
