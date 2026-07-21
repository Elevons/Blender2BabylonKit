import { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered";
import { Light, PointLight, SpotLight } from "@babylonjs/core";
import type { AssetContainer, Engine, Material, Scene } from "@babylonjs/core";
import type { LevelManifest } from "../core/types";

/**
 * WebGL caps vertex-shader uniform buffer blocks (often 12–16). Babylon allocates
 * one block per scene light plus scene/material/mesh data, so large light rigs
 * fail shader compilation long before the GPU runs out of fill rate.
 */
const DEFAULT_REGULAR_LIGHT_BUDGET = 8;

/** How the loader handled punctual lights for this scene. */
export type PunctualLightingMode =
  | "forward"
  | "clustered"
  | "forward-expanded";

export interface ClusteredLightsOptions
{
  /**
   * When false, never cluster — use the UBO fallback if the scene exceeds
   * {@link threshold}. When true (default), cluster when over budget.
   */
  enabled?: boolean;
  /** Cluster punctual lights when enabled scene lights exceed this count. */
  threshold?: number;
  /**
   * Entity names of point/spot lights eligible for clustering. When omitted,
   * every supported punctual light is clustered. An empty set clusters none.
   */
  clusterableLightNames?: ReadonlySet<string>;
}

export interface ClusteredLightsResult
{
  mode: PunctualLightingMode;
  container: ClusteredLightContainer | null;
  /** Punctual lights moved into the cluster (0 when not clustered). */
  clusteredCount: number;
  /** Enabled lights still in scene.lights after any clustering step. */
  regularLightCount: number;
}

/** Count lamp entities in the manifest (approximates glTF punctual lights). */
export function CountManifestLights(manifest: LevelManifest): number
{
  let count = 0;
  for (const entityData of manifest.entities)
  {
    if (entityData.light !== undefined)
    {
      count++;
    }
  }
  return count;
}

/** Point/spot entity names that should enter the cluster when over budget. */
export function BuildClusterableLightNames(manifest: LevelManifest): Set<string>
{
  const names = new Set<string>();

  for (const entityData of manifest.entities)
  {
    const lightInfo = entityData.light;
    if (lightInfo === undefined)
    {
      continue;
    }

    if (lightInfo.type !== "POINT" && lightInfo.type !== "SPOT")
    {
      continue;
    }

    if (lightInfo.cluster === false)
    {
      continue;
    }

    names.add(entityData.name);
  }

  return names;
}

/**
 * Clustering must run before the first PBR compile when the manifest exceeds the
 * forward-light budget — {@link appendSceneAsync} waits for materials while all
 * glTF lights are still in the forward path.
 */
export function ShouldClusterBeforeGlbLoad(
  manifest: LevelManifest,
  options: ClusteredLightsOptions = {}
): boolean
{
  const threshold = options.threshold ?? DEFAULT_REGULAR_LIGHT_BUDGET;
  const clusteringEnabled = options.enabled !== false;
  return clusteringEnabled && CountManifestLights(manifest) > threshold;
}

/**
 * Import lights from an asset container, cluster when over budget, then add
 * meshes and materials so the first shader compile sees the reduced light count.
 */
export function AddContainerToSceneWithLightClustering(
  scene: Scene,
  container: AssetContainer,
  options: ClusteredLightsOptions = {}
): ClusteredLightsResult
{
  for (const light of container.lights)
  {
    scene.addLight(light);
  }

  const result = ClusterPunctualLightsIfNeeded(scene, options);

  container.addToScene((sceneObject) => !(sceneObject instanceof Light));

  AddContainerSceneComponents(scene, container);

  return result;
}

/**
 * `container.addToScene` skips scene *components* (animation groups on
 * components, layer/glow effects, …) that `addAllToScene` would register —
 * Babylon only wires those through `scene._serializableComponents`, which is
 * private API (verified against the pinned @babylonjs/core in package.json).
 * Isolate the access here and feature-detect it so a Babylon upgrade that
 * removes the field degrades to a warning instead of a broken load.
 */
function AddContainerSceneComponents(scene: Scene, container: AssetContainer): void
{
  const serializableComponents = (scene as unknown as Record<string, unknown>)
    ._serializableComponents;

  if (!Array.isArray(serializableComponents))
  {
    console.warn(
      "[bjs] scene._serializableComponents missing (Babylon private API changed?). " +
        "Scene components from the glb container were not re-registered — " +
        "check clusteredLights.ts against the current Babylon version."
    );
    return;
  }

  for (const component of serializableComponents as Scene["_serializableComponents"])
  {
    component.addFromContainer(container);
  }
}

function CountEnabledLights(scene: Scene): number
{
  let count = 0;
  for (const light of scene.lights)
  {
    if (light.isEnabled())
    {
      count++;
    }
  }
  return count;
}

/**
 * glTF punctual lights use {@link Light.FALLOFF_GLTF}, but clustered lighting
 * only accepts {@link Light.FALLOFF_DEFAULT}. The cluster writes its own
 * inverse-square attenuation into the light-data texture.
 */
function PreparePunctualLightForClustering(light: PointLight | SpotLight): void
{
  if (light.falloffType !== Light.FALLOFF_DEFAULT)
  {
    light.falloffType = Light.FALLOFF_DEFAULT;
  }
}

function CollectClusterablePunctualLights(
  scene: Scene,
  clusterableLightNames?: ReadonlySet<string>
): Array<PointLight | SpotLight>
{
  const punctualLights: Array<PointLight | SpotLight> = [];

  for (const light of scene.lights)
  {
    if (!light.isEnabled())
    {
      continue;
    }

    if (!(light instanceof PointLight || light instanceof SpotLight))
    {
      continue;
    }

    if (clusterableLightNames !== undefined && !clusterableLightNames.has(light.name))
    {
      continue;
    }

    PreparePunctualLightForClustering(light);

    if (!ClusteredLightContainer.IsLightSupported(light))
    {
      continue;
    }

    punctualLights.push(light);
  }

  return punctualLights;
}

function MaterialHasLightCap(material: Material): material is Material & { maxSimultaneousLights: number }
{
  return "maxSimultaneousLights" in material;
}

/**
 * Disable per-light uniform buffers so forward shaders can exceed the WebGL UBO
 * block limit. Slightly slower than clustering but preserves glTF falloff.
 */
export function ApplyLightBudgetFallback(scene: Scene, maxLights: number): void
{
  const engine = scene.getEngine() as Engine;
  if (!engine.disableUniformBuffers)
  {
    engine.disableUniformBuffers = true;
  }

  for (const material of scene.materials)
  {
    if (MaterialHasLightCap(material) && material.maxSimultaneousLights > maxLights)
    {
      material.maxSimultaneousLights = maxLights;
    }
  }
}

function LogPunctualLightingSummary(result: ClusteredLightsResult, threshold: number): void
{
  if (result.mode === "forward")
  {
    return;
  }

  if (result.mode === "clustered")
  {
    console.log(
      `[bjs] punctual lighting: clustered ${result.clusteredCount} point/spot lights ` +
        `(${result.regularLightCount} regular scene lights remain; budget ${threshold})`
    );
    return;
  }

  console.warn(
    `[bjs] punctual lighting: forward-expanded (uniform buffers disabled; ` +
      `${result.regularLightCount} enabled lights, budget ${threshold})`
  );
}

/**
 * Move point and spot lights into a {@link ClusteredLightContainer} when the
 * scene exceeds the regular forward-light shader budget. Directional lights
 * (suns) stay as individual scene lights so shadow maps keep working.
 */
export function ClusterPunctualLightsIfNeeded(
  scene: Scene,
  options: ClusteredLightsOptions = {}
): ClusteredLightsResult
{
  const threshold = options.threshold ?? DEFAULT_REGULAR_LIGHT_BUDGET;
  const clusteringEnabled = options.enabled !== false;
  const clusterableLightNames = options.clusterableLightNames;
  const enabledLightCount = CountEnabledLights(scene);

  if (enabledLightCount <= threshold)
  {
    return {
      mode: "forward",
      container: null,
      clusteredCount: 0,
      regularLightCount: enabledLightCount,
    };
  }

  if (!clusteringEnabled)
  {
    ApplyLightBudgetFallback(scene, threshold);
    const result: ClusteredLightsResult = {
      mode: "forward-expanded",
      container: null,
      clusteredCount: 0,
      regularLightCount: enabledLightCount,
    };
    LogPunctualLightingSummary(result, threshold);
    return result;
  }

  const punctualLights = CollectClusterablePunctualLights(scene, clusterableLightNames);
  if (punctualLights.length === 0)
  {
    ApplyLightBudgetFallback(scene, threshold);
    const result: ClusteredLightsResult = {
      mode: "forward-expanded",
      container: null,
      clusteredCount: 0,
      regularLightCount: enabledLightCount,
    };
    LogPunctualLightingSummary(result, threshold);
    return result;
  }

  const container = new ClusteredLightContainer("bjs_clustered_lights", [], scene);

  if (!container.isSupported)
  {
    container.dispose();
    ApplyLightBudgetFallback(scene, threshold);
    const result: ClusteredLightsResult = {
      mode: "forward-expanded",
      container: null,
      clusteredCount: 0,
      regularLightCount: enabledLightCount,
    };
    LogPunctualLightingSummary(result, threshold);
    return result;
  }

  for (const light of punctualLights)
  {
    container.addLight(light);
  }

  if (container.lights.length === 0)
  {
    container.dispose();
    ApplyLightBudgetFallback(scene, threshold);
    const result: ClusteredLightsResult = {
      mode: "forward-expanded",
      container: null,
      clusteredCount: 0,
      regularLightCount: enabledLightCount,
    };
    LogPunctualLightingSummary(result, threshold);
    return result;
  }

  const result: ClusteredLightsResult = {
    mode: "clustered",
    container,
    clusteredCount: container.lights.length,
    regularLightCount: CountEnabledLights(scene),
  };
  LogPunctualLightingSummary(result, threshold);
  return result;
}
