import { appendSceneAsync, LoadAssetContainerAsync, SceneLoader } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";
// Registers the glTF loader so .glb files can be loaded. (In Babylon 9 the old
// SceneLoader.AppendAsync statics are deprecated in favour of appendSceneAsync.)
import "@babylonjs/loaders/glTF";
// Copies each glTF node's `extras` to node.metadata.gltf.extras. REQUIRED for
// GUID matching: the Blender exporter writes obj["bjs_id"] into node extras, and
// without this extension Babylon leaves node.metadata empty.
import "@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata";

import type { LevelManifest } from "./types";
import { Level } from "./Level";
import type { BehaviorRegistry } from "../scripting/BehaviorRegistry";
import { InputManager, DEFAULT_INPUT_ASSET } from "../input";
import { SetupShadows } from "../subsystems/shadows";
import {
  AddContainerToSceneWithLightClustering,
  ClusterPunctualLightsIfNeeded,
  ShouldClusterBeforeGlbLoad,
} from "../subsystems/clusteredLights";
import type { ClusteredLightsResult } from "../subsystems/clusteredLights";
import { ResolveCameraTargets } from "../subsystems/cameras";
import { WireCollisionEvents } from "../subsystems/collisions";
import { BuildConstraints } from "../subsystems/constraints";
import { BuildGui3DControls } from "../ui/gui3d/builder";
import { CollectTextRenderers, WireMsdfTextRendering } from "../ui/msdfText";
import {
  CollectEmptyParticleEmitters,
  WireParticleEmitterTracking,
} from "../subsystems/particles";
import { FetchAndValidateManifest, GetDirectory, ValidateManifest } from "./loader/manifest";
import { ApplyNodeVisibility, NeutralizeGltfRoot } from "./loader/nodeResolution";
import { CreateLoadContext, type LoadContext } from "./loader/context";
import { ProcessEntity, ResolveObjectReferences } from "./loader/entityBuilder";
import { ApplySceneSettings, ApplyAutoPlayAnimations } from "./loader/sceneSettings";
import { ApplyPostProcessing } from "../subsystems/postprocess";
import { ApplyAtmosphere } from "../subsystems/atmosphere";
import { ApplyNodeMaterials, BuildNodeMaterials } from "../subsystems/materials/index";
import {
  AssignProbeMaterials,
  BuildReflectionProbes,
} from "../subsystems/reflectionProbes";
import { ApplyRenderLayers } from "../subsystems/renderLayers";
import { ApplyCollisionLayers } from "../subsystems/collisionLayers";

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

export interface LevelLoaderOptions {
  /** Create shadow generators for lights flagged to cast shadows. Default true. */
  shadows?: boolean;
  /** Shadow map resolution per light. Default 1024. */
  shadowMapSize?: number;
  /**
   * Render shadow maps once and freeze them (static-world optimization). When
   * unset, the manifest's scene block decides (Blender "Freeze Shadows").
   */
  freezeShadows?: boolean;
  /**
   * Clean up imprecise skeleton bone weights on load, which can otherwise cause
   * negative/garbled shadows on skinned meshes. Default false.
   */
  cleanBoneMatrixWeights?: boolean;
  /** Show collider wireframes on load (Babylon PhysicsViewer). Default false. */
  debugColliders?: boolean;
  /**
   * When false, never cluster punctual lights (UBO fallback if over budget).
   * Overrides the manifest scene block when set.
   */
  clusterPunctualLights?: boolean;
  /** Max forward scene lights before clustering / UBO fallback. Default 8. */
  lightBudget?: number;
}

/**
 * The load pipeline orchestrator: fetch manifest -> import glb -> per-entity
 * build pass -> reference/camera post-passes -> finalize (shadows, scene
 * settings, animations, triggers, joints) -> Level.Begin. The individual
 * stages live in ./loader/ — this class only sequences them.
 */
export class LevelLoader
{
  constructor(
    private scene: Scene,
    private registry: BehaviorRegistry,
    private options: LevelLoaderOptions = {}
  ) {}

  /**
   * Load a `.scene.json` manifest (the glb path is resolved relative to it).
   * Pass `prefetchedManifest` when the app already fetched the manifest for
   * engine bootstrap (large-world rendering must be decided before `new Scene`).
   */
  async Load(manifestUrl: string, prefetchedManifest?: LevelManifest): Promise<Level>
  {
    // Prefetched manifests (engine bootstrap) validate here too — the app may
    // have fetched the JSON without going through FetchAndValidateManifest.
    const manifest = prefetchedManifest !== undefined
      ? ValidateManifest(prefetchedManifest)
      : await FetchAndValidateManifest(manifestUrl);
    const baseUrl = GetDirectory(manifestUrl);

    // The scene's Input Actions asset must exist BEFORE behaviors are built,
    // so @inputMap fields (and the scene-default fallback) can be injected.
    const inputActions = manifest.scene?.inputActions ?? DEFAULT_INPUT_ASSET;
    const defaultInputMap = manifest.scene?.defaultInputMap ?? "Player";
    InputManager.LoadAsset(inputActions, defaultInputMap);

    // Optionally scrub bad skeleton weights before parsing (fixes weird shadows
    // on skinned meshes). It's a global static, so only touch it when asked.
    if (this.options.cleanBoneMatrixWeights)
    {
      SceneLoader.CleanBoneMatrixWeights = true;
    }

    // Import the glb right-handed so the loader skips the "__root__" handedness
    // mirror; that mirror would otherwise corrupt Havok collider placement.
    // See physics.ts for the full explanation.
    this.scene.useRightHandedSystem = true;

    const clusterPunctualLights =
      this.options.clusterPunctualLights ?? manifest.scene?.clusterPunctualLights;
    const lightBudget = this.options.lightBudget ?? manifest.scene?.lightBudget;
    const clusterOptions = {
      enabled: clusterPunctualLights,
      threshold: lightBudget,
    };

    let earlyPunctualLighting: ClusteredLightsResult | null = null;
    const glbUrl = baseUrl + manifest.glb;

    if (ShouldClusterBeforeGlbLoad(manifest, clusterOptions))
    {
      // appendSceneAsync compiles PBR while every glTF light is still forward;
      // large rigs hit WebGL UBO limits before FinalizeLevel can cluster them.
      const container = await LoadAssetContainerAsync(glbUrl, this.scene);
      earlyPunctualLighting = AddContainerToSceneWithLightClustering(
        this.scene,
        container,
        clusterOptions
      );
    }
    else
    {
      await appendSceneAsync(glbUrl, this.scene);
    }

    NeutralizeGltfRoot(this.scene);
    ApplyNodeVisibility(this.scene);
    await ApplyNodeMaterials(this.scene, manifest.materials, baseUrl);

    const context = CreateLoadContext(this.scene, baseUrl, defaultInputMap);

    // "Debug Build" export flag: a missing field (older manifests) means enabled.
    context.level.debugEnabled = manifest.debug !== false;

    // First pass: build every entity and apply its components, lights, cameras.
    for (const entityData of manifest.entities)
    {
      ProcessEntity(entityData, this.scene, this.registry, context);
    }

    // Second pass: resolve cross-entity references now that all entities exist.
    ResolveObjectReferences(context.pendingReferences, context.level);
    ResolveCameraTargets(context.level, context.cameraTargets);

    await this.FinalizeLevel(manifest, context, earlyPunctualLighting);

    return context.level;
  }

  /**
   * Everything after the entity passes: shadows, scene-wide render settings,
   * animations, sound settling, trigger wiring, and starting the update loop.
   */
  private async FinalizeLevel(
    manifest: LevelManifest,
    context: LoadContext,
    earlyPunctualLighting: ClusteredLightsResult | null = null
  ): Promise<void>
  {
    // Large rigs may already be clustered during glb import; otherwise cluster
    // here before shadows (still before gameplay, but after appendSceneAsync).
    const sceneInfo = manifest.scene;
    const clusterPunctualLights =
      this.options.clusterPunctualLights ?? sceneInfo?.clusterPunctualLights;
    const lightBudget = this.options.lightBudget ?? sceneInfo?.lightBudget;

    const punctualLighting = earlyPunctualLighting ?? ClusterPunctualLightsIfNeeded(this.scene, {
      enabled: clusterPunctualLights,
      threshold: lightBudget,
    });
    context.level.punctualLightingMode = punctualLighting.mode;
    if (punctualLighting.container !== null)
    {
      context.level.clusteredLights = punctualLighting.container;
    }

    if (this.options.shadows !== false && context.shadowLights.length > 0)
    {
      // Loader option wins; otherwise the Blender scene's "Freeze Shadows" flag.
      const freeze = this.options.freezeShadows ?? manifest.scene?.freezeShadows ?? false;
      context.level.shadowGenerators = SetupShadows(this.scene, context.shadowLights, {
        mapSize: this.options.shadowMapSize,
        freeze,
        debug: context.level.debugEnabled,
      });
    }

    if (context.level.debugEnabled)
    {
      console.log(
        `[bjs] lights: ${this.scene.lights.length} in scene, ` +
          `${context.shadowLights.length} shadow-casting`
      );
    }

    if (manifest.scene !== undefined)
    {
      await ApplySceneSettings(this.scene, manifest.scene, context.baseUrl, context.level);

      const atmosphereInfo = manifest.scene.atmosphere;
      if (atmosphereInfo !== undefined && atmosphereInfo !== null)
      {
        const hasHdrPipeline = manifest.scene.postProcessing?.defaultPipeline === true;
        const atmosphere = ApplyAtmosphere(
          this.scene,
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
    }

    ApplyAutoPlayAnimations(this.scene, context.animatedEntities);

    // Asset-backed components (audio, GUI, particles) load in parallel during
    // the entity loop; settle them now so a bad file logs here rather than as
    // an unhandled rejection later.
    await SettleTasks(context.audioTasks, "sound");
    await SettleTasks(context.guiTasks, "GUI");
    await SettleTasks(context.particleTasks, "particle system");
    await SettleTasks(context.msdfTextTasks, "MSDF text");

    context.level.particleEmitterManager = WireParticleEmitterTracking(
      this.scene,
      CollectEmptyParticleEmitters(context.level.entities.values())
    );

    context.level.msdfTextManager = WireMsdfTextRendering(
      this.scene,
      CollectTextRenderers(context.level.entities.values())
    );

    context.level.collisionEventHandles =
      WireCollisionEvents(this.scene, context.level, context.eventMessageRegistrations);

    context.level.constraints =
      BuildConstraints(this.scene, context.level, context.constraintRegistrations);

    context.level.gui3DManager = BuildGui3DControls(
      this.scene, context.level, context.gui3dRegistrations, context.baseUrl
    );

    const builtProbes = BuildReflectionProbes(
      this.scene,
      context.level,
      context.reflectionProbeRegistrations
    );
    AssignProbeMaterials(this.scene, builtProbes);
    context.level.reflectionProbes = builtProbes.map((built) => built.probe);

    ApplyRenderLayers(manifest, context.level);
    ApplyCollisionLayers(manifest, context.level, context.physicsShapesByEntity);

    context.level.Begin();

    // NME compile after Begin() so runtime fog (e.g. FogChanger OnStart) is active
    // before FogBlock decides whether to emit the FOG shader define.
    await BuildNodeMaterials(this.scene);

    // Post-processing attaches to cameras; apply after Begin() so behaviors that
    // create a runtime camera in OnStart (e.g. TrainCamera) receive the stack.
    const postProcessing = manifest.scene?.postProcessing;
    if (postProcessing !== undefined && postProcessing !== null)
    {
      context.level.post = ApplyPostProcessing(
        this.scene,
        this.scene.activeCamera,
        postProcessing,
        context.baseUrl
      );
    }

    // debugColliders is a dev convenience; a non-debug ("release") export wins.
    if (this.options.debugColliders && context.level.debugEnabled)
    {
      context.level.ShowColliders(true);
    }
  }
}
