import type { Scene } from "@babylonjs/core";
import type { LevelManifest } from "../types";
import type { Level } from "../Level";
import type { LevelLoaderOptions } from "../LevelLoader";
import { SetupShadows } from "../../subsystems/shadows";
import { ApplyMeshShadows } from "../../subsystems/shadows/meshShadows";
import {
  BuildClusterableLightNames,
  ClusterPunctualLightsIfNeeded,
} from "../../subsystems/clusteredLights";
import type { ClusteredLightsResult } from "../../subsystems/clusteredLights";
import { WireCollisionEvents } from "../../subsystems/collisions";
import { BuildConstraints } from "../../subsystems/constraints";
import { BuildGui3DControls } from "../../ui/gui3d/builder";
import { WireMsdfTextRendering } from "../../ui/msdfText";
import {
  CollectEmptyParticleEmitters,
  WireParticleEmitterTracking,
} from "../../subsystems/particles";
import { ApplySceneSettings, ApplyAutoPlayAnimations } from "./sceneSettings";
import { ApplyPostProcessing } from "../../subsystems/postprocess";
import { ApplyAtmosphere } from "../../subsystems/atmosphere";
import { BuildNodeMaterials } from "../../subsystems/materials/index";
import {
  AssignProbeMaterials,
  BuildReflectionProbes,
} from "../../subsystems/reflectionProbes";
import { ApplyRenderLayers } from "../../subsystems/renderLayers";
import { ApplyCollisionLayers } from "../../subsystems/collisions";
import { BuildLodLevels } from "../../subsystems/lod";
import type { LoadContext } from "./context";
import { HideMarkedSpawnTemplates } from "./spawnTemplates";

/** Await a batch of asset-load promises, logging any that rejected. */
async function SettleTasks(tasks: Promise<unknown>[], label: string): Promise<void>
{
  const results = await Promise.allSettled(tasks);
  for (const result of results)
  {
    if (result.status === "rejected")
    {
      console.warn(`[bjs] ${label} failed to load:`, result.reason);
    }
  }
}

/** Configure punctual-light clustering from manifest + loader options. */
function ApplyPunctualLighting(
  scene: Scene,
  manifest: LevelManifest,
  level: Level,
  loaderOptions: LevelLoaderOptions,
  earlyPunctualLighting: ClusteredLightsResult | null
): void
{
  const sceneInfo = manifest.scene;
  const clusterPunctualLights =
    loaderOptions.clusterPunctualLights ?? sceneInfo?.clusterPunctualLights;
  const lightBudget = loaderOptions.lightBudget ?? sceneInfo?.lightBudget;

  const punctualLighting = earlyPunctualLighting ?? ClusterPunctualLightsIfNeeded(scene, {
    enabled: clusterPunctualLights,
    threshold: lightBudget,
    clusterableLightNames: BuildClusterableLightNames(manifest),
  });

  level.punctualLightingMode = punctualLighting.mode;
  if (punctualLighting.container !== null)
  {
    level.clusteredLights = punctualLighting.container;
  }
}

/** Build shadow generators when the loader option and manifest lights allow it. */
function ApplyShadows(
  scene: Scene,
  manifest: LevelManifest,
  context: LoadContext,
  loaderOptions: LevelLoaderOptions
): void
{
  if (loaderOptions.shadows === false || context.shadowLights.length === 0)
  {
    return;
  }

  const freeze = loaderOptions.freezeShadows ?? manifest.scene?.freezeShadows ?? false;
  context.level.shadowGenerators = SetupShadows(scene, context.shadowLights, {
    mapSize: loaderOptions.shadowMapSize,
    freeze,
    debug: context.level.debugEnabled,
  });
  ApplyMeshShadows(manifest, context.level, context.level.shadowGenerators);
}

/** Log shadow-casting light counts when debug export is enabled. */
function LogShadowDebug(scene: Scene, context: LoadContext): void
{
  if (!context.level.debugEnabled)
  {
    return;
  }

  console.log(
    `[bjs] lights: ${scene.lights.length} in scene, ` +
      `${context.shadowLights.length} shadow-casting`
  );
}

/** Apply manifest scene settings and optional atmosphere. */
async function ApplySceneAndAtmosphere(
  scene: Scene,
  manifest: LevelManifest,
  context: LoadContext
): Promise<void>
{
  if (manifest.scene === undefined)
  {
    return;
  }

  await ApplySceneSettings(scene, manifest.scene, context.baseUrl, context.level);

  const atmosphereInfo = manifest.scene.atmosphere;
  if (atmosphereInfo === undefined || atmosphereInfo === null)
  {
    return;
  }

  const hasHdrPipeline = manifest.scene.postProcessing?.defaultPipeline === true;
  const atmosphere = ApplyAtmosphere(
    scene,
    atmosphereInfo,
    manifest.entities,
    context.idIndex,
    hasHdrPipeline
  );
  if (atmosphere !== null)
  {
    context.level.atmosphere = atmosphere;
  }
}

/** Settle parallel asset loads queued during the entity build pass. */
async function SettleComponentAssets(context: LoadContext): Promise<void>
{
  await SettleTasks(context.audioTasks, "sound");
  await SettleTasks(context.guiTasks, "GUI");
  await SettleTasks(context.particleTasks, "particle system");
  await SettleTasks(context.msdfTextTasks, "MSDF text");
}

/** Wire collision events, constraints, GUI3D, probes, LOD, and render/collision layers. */
function ApplySubsystems(
  scene: Scene,
  manifest: LevelManifest,
  context: LoadContext
): void
{
  context.level.particleEmitterManager = WireParticleEmitterTracking(
    scene,
    CollectEmptyParticleEmitters(context.level.entities.values())
  );

  context.level.msdfTextManager = WireMsdfTextRendering(
    scene,
    context.level
  );

  context.level.collisionEventHandles =
    WireCollisionEvents(scene, context.level, context.eventMessageRegistrations);

  context.level.constraints =
    BuildConstraints(scene, context.level, context.constraintRegistrations);

  context.level.gui3DManager = BuildGui3DControls(
    scene,
    context.level,
    context.gui3dRegistrations,
    context.baseUrl,
    context.componentHost.panelsByEntity
  );

  const builtProbes = BuildReflectionProbes(
    scene,
    context.level,
    context.reflectionProbeRegistrations
  );
  AssignProbeMaterials(scene, builtProbes);
  context.level.reflectionProbes = builtProbes.map((built) => built.probe);

  BuildLodLevels(context.lodRegistrations, (guid) => context.level.ById(guid));

  ApplyRenderLayers(manifest, context.level);
  ApplyCollisionLayers(manifest, context.level, context.physicsShapesByEntity);
}

/** Compile NME materials and attach post-processing after Begin(). */
async function ApplyLateRendering(
  scene: Scene,
  manifest: LevelManifest,
  context: LoadContext
): Promise<void>
{
  await BuildNodeMaterials(scene);

  const postProcessing = manifest.scene?.postProcessing;
  if (postProcessing !== undefined && postProcessing !== null)
  {
    context.level.post = ApplyPostProcessing(
      scene,
      scene.activeCamera,
      postProcessing,
      context.baseUrl
    );
  }
}

/**
 * Everything after the entity passes: shadows, scene-wide render settings,
 * animations, sound settling, trigger wiring, and starting the update loop.
 */
export async function FinalizeLevel(
  scene: Scene,
  manifest: LevelManifest,
  context: LoadContext,
  loaderOptions: LevelLoaderOptions,
  earlyPunctualLighting: ClusteredLightsResult | null = null
): Promise<void>
{
  ApplyPunctualLighting(scene, manifest, context.level, loaderOptions, earlyPunctualLighting);
  ApplyShadows(scene, manifest, context, loaderOptions);
  LogShadowDebug(scene, context);

  await ApplySceneAndAtmosphere(scene, manifest, context);

  ApplyAutoPlayAnimations(scene, context.animatedEntities);
  await SettleComponentAssets(context);

  ApplySubsystems(scene, manifest, context);

  await HideMarkedSpawnTemplates(context.level);

  context.level.Begin();
  await ApplyLateRendering(scene, manifest, context);
  context.level.NotifyPostReady();

  if (loaderOptions.debugColliders && context.level.debugEnabled)
  {
    context.level.ShowColliders(true);
  }
}
