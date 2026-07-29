import {
  Scene,
  ShadowGenerator,
  DirectionalLight,
  SpotLight,
  PointLight,
  RenderTargetTexture,
  Vector3,
  Matrix,
  VertexBuffer,
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
  /**
   * Log a caster/receiver summary plus any oversize meshes skipped as casters.
   * Wired to the manifest's Debug Build flag (level.debugEnabled). Default false.
   */
  debug?: boolean;
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
function SelectShadowCasters(meshes: AbstractMesh[], debug: boolean): AbstractMesh[]
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

  // Debug Build exports get one summary line (plus the rare oversize skips,
  // which are actionable per mesh); release exports stay silent.
  if (debug)
  {
    const receiveOnlyCount = meshes.length - castEnabled.length;
    console.log(
      `[bjs] shadows: ${casters.length} casters, ${receiveOnlyCount} receive-only ` +
        `(ray-visibility Shadow off), ${skippedOutliers.length} oversize skipped`
    );

    for (const entry of skippedOutliers)
    {
      console.log(
        `[bjs] "${entry.mesh.name}" extent ${entry.extent.toFixed(0)} — receive-only ` +
          `(exceeds shadow caster threshold ${outlierThreshold.toFixed(0)})`
      );
    }
  }

  return casters;
}

/** Merged world-space AABB center of every shadow caster mesh. */
function ShadowCasterBoundsCenter(casters: AbstractMesh[]): Vector3 | null
{
  if (casters.length === 0)
  {
    return null;
  }

  const boundsMin = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
  const boundsMax = new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

  for (const mesh of casters)
  {
    mesh.computeWorldMatrix(true);
    const worldMin = mesh.getBoundingInfo().boundingBox.minimumWorld;
    const worldMax = mesh.getBoundingInfo().boundingBox.maximumWorld;
    boundsMin.x = Math.min(boundsMin.x, worldMin.x);
    boundsMin.y = Math.min(boundsMin.y, worldMin.y);
    boundsMin.z = Math.min(boundsMin.z, worldMin.z);
    boundsMax.x = Math.max(boundsMax.x, worldMax.x);
    boundsMax.y = Math.max(boundsMax.y, worldMax.y);
    boundsMax.z = Math.max(boundsMax.z, worldMax.z);
  }

  return boundsMin.add(boundsMax).scaleInPlace(0.5);
}

/**
 * Directional shadows use an orthographic frustum anchored at light.position.
 * Re-center on caster geometry so a Blender sun empty placed far from the level
 * does not stretch depth precision or push content to the frustum edge.
 */
function AnchorDirectionalShadowOrigin(light: DirectionalLight, casters: AbstractMesh[]): void
{
  const center = ShadowCasterBoundsCenter(casters);
  if (center === null)
  {
    light.position.copyFrom(light.direction).scaleInPlace(-1);
    return;
  }

  light.position.copyFrom(center.subtract(light.direction));
  light.forceProjectionMatrixCompute();
}

/** Light-space axis-aligned bounds of a mesh set, or null when the set is empty. */
interface LightSpaceBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Project every caster corner into the light view and return its light-space AABB. */
function CasterLightSpaceBounds(viewMatrix: Matrix, casters: AbstractMesh[]): LightSpaceBounds | null
{
  if (casters.length === 0)
  {
    return null;
  }

  const bounds: LightSpaceBounds = {
    minX: Number.MAX_VALUE,
    maxX: -Number.MAX_VALUE,
    minY: Number.MAX_VALUE,
    maxY: -Number.MAX_VALUE,
    minZ: Number.MAX_VALUE,
    maxZ: -Number.MAX_VALUE,
  };
  const projected = Vector3.Zero();

  for (const mesh of casters)
  {
    for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
    {
      Vector3.TransformCoordinatesToRef(corner, viewMatrix, projected);
      bounds.minX = Math.min(bounds.minX, projected.x);
      bounds.maxX = Math.max(bounds.maxX, projected.x);
      bounds.minY = Math.min(bounds.minY, projected.y);
      bounds.maxY = Math.max(bounds.maxY, projected.y);
      bounds.minZ = Math.min(bounds.minZ, projected.z);
      bounds.maxZ = Math.max(bounds.maxZ, projected.z);
    }
  }

  return bounds;
}

/**
 * Fit the directional shadow depth range (shadowMinZ/shadowMaxZ) so it covers
 * the casters *and* the ground beneath them.
 *
 * Babylon's autoCalcShadowZBounds fits the near/far planes to the caster
 * renderList alone. When the casters float above the ground (a rover over a
 * seafloor, a character over terrain), any receiver below the lowest caster
 * falls outside that depth window and its shadow is clipped — the classic
 * "shadows cut off" symptom. It worsens as the sun lowers toward the horizon:
 * the light-space depth spread of the ground grows while the caster-fit window
 * stays tight, so more of the ground drops out of range.
 *
 * We keep the tight caster fit but extend the far plane to reach receiver
 * geometry that sits within the casters' X/Y footprint (the only ground that can
 * actually catch a shadow). Fitting to the *whole* receiver AABB instead would
 * stretch the range across a multi-kilometre terrain and destroy depth
 * precision; restricting to the footprint keeps the range tight, so a low or
 * far-aimed sun shadows everything without acne.
 */
function FitDirectionalDepthToReceivers(
  light: DirectionalLight,
  casters: AbstractMesh[],
  receivers: AbstractMesh[]
): void
{
  const lightDirection = Vector3.Normalize(light.direction);
  const viewMatrix = Matrix.LookAtLH(
    light.position,
    light.position.add(lightDirection),
    Vector3.Up()
  );

  const casterBounds = CasterLightSpaceBounds(viewMatrix, casters);
  if (casterBounds === null)
  {
    return;
  }

  // autoUpdateExtends pads the X/Y rect by shadowOrthoScale (10% default) each
  // frame; match that so a receiver just outside the raw caster rect still
  // counts toward the far plane.
  const padX = (casterBounds.maxX - casterBounds.minX) * light.shadowOrthoScale;
  const padY = (casterBounds.maxY - casterBounds.minY) * light.shadowOrthoScale;
  const rectMinX = casterBounds.minX - padX;
  const rectMaxX = casterBounds.maxX + padX;
  const rectMinY = casterBounds.minY - padY;
  const rectMaxY = casterBounds.maxY + padY;

  const depthRange = { min: casterBounds.minZ, max: casterBounds.maxZ };

  for (const mesh of receivers)
  {
    if (!ReceiverOverlapsRect(mesh, viewMatrix, rectMinX, rectMaxX, rectMinY, rectMaxY))
    {
      continue;
    }
    ExtendDepthFromReceiverBBoxCorners(
      mesh, viewMatrix, rectMinX, rectMaxX, rectMinY, rectMaxY, depthRange
    );
    ExtendDepthFromReceiverVertices(
      mesh, viewMatrix, rectMinX, rectMaxX, rectMinY, rectMaxY, depthRange
    );
  }

  // A small margin keeps surfaces sitting exactly on a plane from being clipped.
  const margin = (depthRange.max - depthRange.min) * 0.01 + 1;
  light.shadowMinZ = depthRange.min - margin;
  light.shadowMaxZ = depthRange.max + margin;
  light.forceProjectionMatrixCompute();
}

/**
 * Keep a directional sun behaving like an infinite light each frame: re-anchor
 * the shadow view origin on caster geometry (so Blender sun-empty distance and
 * accidental light.position edits cannot clip the frustum) and refit depth when
 * aim or anchor moves.
 */
function InstallDirectionalShadowMaintenance(
  scene: Scene,
  light: DirectionalLight,
  casters: AbstractMesh[],
  receivers: AbstractMesh[],
  autoDepth: boolean
): () => void
{
  const lastAnchor = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
  const lastDirection = light.direction.clone();

  const observer = scene.onBeforeRenderObservable.add(() =>
  {
    AnchorDirectionalShadowOrigin(light, casters);

    const anchorMoved = !light.position.equalsWithEpsilon(lastAnchor, 0.001);
    const directionMoved = !light.direction.equalsWithEpsilon(lastDirection, 1e-4);
    if (anchorMoved)
    {
      lastAnchor.copyFrom(light.position);
    }
    if (directionMoved)
    {
      lastDirection.copyFrom(light.direction);
    }

    if (autoDepth && (anchorMoved || directionMoved))
    {
      FitDirectionalDepthToReceivers(light, casters, receivers);
    }
  });

  return () =>
  {
    scene.onBeforeRenderObservable.remove(observer);
  };
}

function RegisterDirectionalShadowMaintenance(scene: Scene, disposer: () => void): void
{
  const metadata = scene.metadata ?? {};
  const existing = metadata[DIRECTIONAL_SHADOW_MAINTENANCE_KEY];
  const disposers: (() => void)[] = Array.isArray(existing) ? existing : [];
  disposers.push(disposer);
  scene.metadata = { ...metadata, [DIRECTIONAL_SHADOW_MAINTENANCE_KEY]: disposers };
}

/** Tear down per-frame directional shadow maintenance registered by {@link SetupShadows}. */
export function DisposeDirectionalShadowMaintenance(scene: Scene): void
{
  const disposers = scene.metadata?.[DIRECTIONAL_SHADOW_MAINTENANCE_KEY];
  if (!Array.isArray(disposers))
  {
    return;
  }

  for (const disposer of disposers)
  {
    disposer();
  }

  delete scene.metadata[DIRECTIONAL_SHADOW_MAINTENANCE_KEY];
}

/** Broad phase: does the mesh's light-space AABB overlap the caster X/Y rect? */
function ReceiverOverlapsRect(
  mesh: AbstractMesh,
  viewMatrix: Matrix,
  rectMinX: number,
  rectMaxX: number,
  rectMinY: number,
  rectMaxY: number
): boolean
{
  let minX = Number.MAX_VALUE;
  let maxX = -Number.MAX_VALUE;
  let minY = Number.MAX_VALUE;
  let maxY = -Number.MAX_VALUE;
  const projected = Vector3.Zero();

  for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
  {
    Vector3.TransformCoordinatesToRef(corner, viewMatrix, projected);
    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  }

  return maxX >= rectMinX && minX <= rectMaxX && maxY >= rectMinY && minY <= rectMaxY;
}

/** Cap the per-mesh vertex scan; a large heightmap terrain needs only a sample. */
const MAX_RECEIVER_DEPTH_SAMPLES = 40000;

/** Scene metadata key for directional shadow maintenance teardown callbacks. */
export const DIRECTIONAL_SHADOW_MAINTENANCE_KEY = "bjsDirectionalShadowMaintenance";

/** Broad-phase overlap already passed — widen depth using the receiver AABB corners. */
function ExtendDepthFromReceiverBBoxCorners(
  mesh: AbstractMesh,
  viewMatrix: Matrix,
  rectMinX: number,
  rectMaxX: number,
  rectMinY: number,
  rectMaxY: number,
  depthRange: { min: number; max: number }
): void
{
  const projected = Vector3.Zero();

  for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld)
  {
    Vector3.TransformCoordinatesToRef(corner, viewMatrix, projected);
    if (
      projected.x >= rectMinX && projected.x <= rectMaxX &&
      projected.y >= rectMinY && projected.y <= rectMaxY
    )
    {
      depthRange.min = Math.min(depthRange.min, projected.z);
      depthRange.max = Math.max(depthRange.max, projected.z);
    }
  }
}

/**
 * Narrow phase: walk a receiver's actual vertices (a big terrain's AABB corners
 * sit at its far edges, so they never sample the ground *under* mid-scene
 * casters) and widen the depth range for any vertex inside the caster X/Y rect.
 * Strided so a dense mesh stays cheap — this runs once at load.
 */
function ExtendDepthFromReceiverVertices(
  mesh: AbstractMesh,
  viewMatrix: Matrix,
  rectMinX: number,
  rectMaxX: number,
  rectMinY: number,
  rectMaxY: number,
  depthRange: { min: number; max: number }
): void
{
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (positions === null)
  {
    return;
  }

  const worldMatrix = mesh.computeWorldMatrix(true);
  const vertexCount = positions.length / 3;
  const stride = Math.max(1, Math.ceil(vertexCount / MAX_RECEIVER_DEPTH_SAMPLES));
  const local = Vector3.Zero();
  const projected = Vector3.Zero();

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += stride)
  {
    const offset = vertexIndex * 3;
    local.copyFromFloats(positions[offset], positions[offset + 1], positions[offset + 2]);
    Vector3.TransformCoordinatesToRef(local, worldMatrix, projected);
    Vector3.TransformCoordinatesToRef(projected, viewMatrix, projected);
    if (
      projected.x >= rectMinX && projected.x <= rectMaxX &&
      projected.y >= rectMinY && projected.y <= rectMaxY
    )
    {
      depthRange.min = Math.min(depthRange.min, projected.z);
      depthRange.max = Math.max(depthRange.max, projected.z);
    }
  }
}

/**
 * Register late-created meshes (runtime prefab spawns) on existing generators —
 * the spawn-time mirror of the load pass in SetupShadows: every mesh becomes a
 * receiver, and meshes whose Blender ray-visibility Shadow is on become casters.
 * Frozen shadow maps need a Level.RefreshShadows() afterwards to pick them up.
 * Returns how many casters were added.
 */
export function RegisterSpawnedShadowMeshes(
  generators: ShadowGenerator[],
  meshes: AbstractMesh[]
): number
{
  let addedCasterCount = 0;

  for (const mesh of meshes)
  {
    if (mesh.getTotalVertices() === 0)
    {
      continue;
    }

    mesh.receiveShadows = true;

    if (!MeshCastsShadows(mesh))
    {
      continue;
    }

    for (const generator of generators)
    {
      generator.addShadowCaster(mesh, false);
    }
    addedCasterCount++;
  }

  return addedCasterCount;
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
  const shadowCasters = SelectShadowCasters(renderableMeshes, options.debug === true);

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

    // A directional sun's auto frustum keeps a huge depth range when the shadow
    // view origin sits far from the geometry, which wrecks depth precision and
    // produces washed-out or striped shadows. Anchor on caster bounds so the
    // frustum origin stays near the level. autoUpdateExtends (Babylon default)
    // then keeps the ortho X/Y tight around the casters each frame; the depth
    // range is fit to the receivers so nothing gets depth-clipped (see below).
    if (light instanceof DirectionalLight)
    {
      AnchorDirectionalShadowOrigin(light, shadowCasters);
      const autoDepth = !settings.minZ && !settings.maxZ;
      if (autoDepth)
      {
        FitDirectionalDepthToReceivers(light, shadowCasters, renderableMeshes);
      }
      RegisterDirectionalShadowMaintenance(
        scene,
        InstallDirectionalShadowMaintenance(
          scene,
          light,
          shadowCasters,
          renderableMeshes,
          autoDepth
        )
      );
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
