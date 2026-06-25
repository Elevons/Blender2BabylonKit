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
import { CAST_SHADOWS_KEY } from "../core/types";

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
  /** Blender SUN lamp angular diameter (radians); drives PCSS penumbra size. */
  sunAngle?: number;
}

/** Blender sun Angle UI is 0–180°; we map 0–45° to PCSS ratio 0–1 (clamp above). */
const BLENDER_SUN_ANGLE_MAX = Math.PI / 4;

/** Linear map: 0° → 0, 45° → 1 on Babylon's PCSS contactHardeningLightSizeUVRatio. */
function MapSunAngleToPcssRatio(sunAngle: number): number
{
  return Math.min(Math.max(sunAngle / BLENDER_SUN_ANGLE_MAX, 0), 1);
}

/** False when Blender ray-visibility Shadow is disabled (bjs_cast_shadows in glTF extras). */
function MeshCastsShadows(mesh: AbstractMesh): boolean
{
  const marked = mesh.metadata?.gltf?.extras?.[CAST_SHADOWS_KEY];
  return marked !== false && marked !== 0;
}

/** Largest axis-aligned world extent of a mesh (after world matrix). */
function MeshWorldExtent(mesh: AbstractMesh): number
{
  mesh.computeWorldMatrix(true);
  const box = mesh.getBoundingInfo().boundingBox;
  const extent = box.maximumWorld.subtract(box.minimumWorld);
  return Math.max(extent.x, extent.y, extent.z);
}

/**
 * Meshes that dwarf everything else (a 3 km sea floor, etc.) blow up the
 * directional shadow ortho frustum when registered as casters — shadows vanish
 * or turn to mush. Keep them as receivers only; drop outliers vs the next tier.
 */
function SelectShadowCasters(meshes: AbstractMesh[]): AbstractMesh[]
{
  const castEnabled = meshes.filter((mesh) => MeshCastsShadows(mesh));
  const withExtents = castEnabled.map((mesh) => ({ mesh, extent: MeshWorldExtent(mesh) }));
  const sortedExtents = withExtents.map((entry) => entry.extent).sort((a, b) => b - a);
  const secondLargest = sortedExtents[1] ?? sortedExtents[0] ?? 0;
  const outlierThreshold = Math.max(secondLargest * 3, 500);

  const casters = withExtents
    .filter((entry) => entry.extent <= outlierThreshold)
    .map((entry) => entry.mesh);

  const skippedOutliers = withExtents.filter((entry) => entry.extent > outlierThreshold);
  for (const entry of skippedOutliers)
  {
    console.log(
      `[bjs] "${entry.mesh.name}" extent ${entry.extent.toFixed(0)} — receive-only ` +
        `(exceeds shadow caster threshold ${outlierThreshold.toFixed(0)})`
    );
  }

  for (const mesh of meshes)
  {
    if (!MeshCastsShadows(mesh))
    {
      console.log(`[bjs] "${mesh.name}" — receive-only (Blender ray-visibility Shadow off)`);
    }
  }

  return casters;
}

/** Clamp to a supported shadow-map resolution (power of two, max 8192). */
function ClampShadowMapSize(mapSize: number): number
{
  const clamped = Math.min(Math.max(Math.round(mapSize), 256), 8192);
  return 2 ** Math.round(Math.log2(clamped));
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
  const defaultMapSize = ClampShadowMapSize(options.mapSize ?? 1024);
  const renderableMeshes: AbstractMesh[] = scene.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  const shadowCasters = SelectShadowCasters(renderableMeshes);

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

    const mapSize = settings.mapSize && settings.mapSize > 0
      ? ClampShadowMapSize(settings.mapSize)
      : defaultMapSize;
    const shadowGenerator = new ShadowGenerator(mapSize, light);

    ApplyShadowFilter(shadowGenerator, settings.filter);

    // Blender SUN angle is an angular diameter — Babylon only approximates it via
    // PCSS contact hardening. Enable PCSS when a sun angle is authored.
    if (
      light instanceof DirectionalLight &&
      typeof caster.sunAngle === "number" &&
      caster.sunAngle > 0
    )
    {
      if (!shadowGenerator.useContactHardeningShadow)
      {
        ApplyShadowFilter(shadowGenerator, "PCSS");
      }
      shadowGenerator.contactHardeningLightSizeUVRatio = MapSunAngleToPcssRatio(caster.sunAngle);
    }

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

    for (const mesh of shadowCasters)
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
