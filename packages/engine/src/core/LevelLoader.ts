import { appendSceneAsync, SceneLoader } from "@babylonjs/core";
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
import { ResolveCameraTargets } from "../subsystems/cameras";
import { WireTriggerEvents } from "../subsystems/triggers";
import { BuildConstraints } from "../subsystems/constraints";
import { BuildGui3DControls } from "../ui/gui3d/builder";
import { FetchAndValidateManifest, GetDirectory } from "./loader/manifest";
import { NeutralizeGltfRoot } from "./loader/nodeResolution";
import { CreateLoadContext, type LoadContext } from "./loader/context";
import { ProcessEntity, ResolveObjectReferences } from "./loader/entityBuilder";
import { ApplySceneSettings, ApplyAutoPlayAnimations } from "./loader/sceneSettings";
import { ApplyPostProcessing } from "../subsystems/postprocess";

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

  /** Load a `.scene.json` manifest (the glb path is resolved relative to it). */
  async Load(manifestUrl: string): Promise<Level>
  {
    const manifest = await FetchAndValidateManifest(manifestUrl);
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
    await appendSceneAsync(baseUrl + manifest.glb, this.scene);
    NeutralizeGltfRoot(this.scene);

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

    await this.FinalizeLevel(manifest, context);

    return context.level;
  }

  /**
   * Everything after the entity passes: shadows, scene-wide render settings,
   * animations, sound settling, trigger wiring, and starting the update loop.
   */
  private async FinalizeLevel(manifest: LevelManifest, context: LoadContext): Promise<void>
  {
    if (this.options.shadows !== false && context.shadowLights.length > 0)
    {
      // Loader option wins; otherwise the Blender scene's "Freeze Shadows" flag.
      const freeze = this.options.freezeShadows ?? manifest.scene?.freezeShadows ?? false;
      context.level.shadowGenerators = SetupShadows(this.scene, context.shadowLights, {
        mapSize: this.options.shadowMapSize,
        freeze,
      });
    }

    if (manifest.scene !== undefined)
    {
      await ApplySceneSettings(this.scene, manifest.scene, context.baseUrl, context.level);
    }

    ApplyAutoPlayAnimations(this.scene, context.animatedEntities);

    // Asset-backed components (audio, GUI, particles) load in parallel during
    // the entity loop; settle them now so a bad file logs here rather than as
    // an unhandled rejection later.
    await SettleTasks(context.audioTasks, "sound");
    await SettleTasks(context.guiTasks, "GUI");
    await SettleTasks(context.particleTasks, "particle system");

    context.level.triggerObserver =
      WireTriggerEvents(this.scene, context.level, context.triggerRegistrations);

    context.level.constraints =
      BuildConstraints(this.scene, context.level, context.constraintRegistrations);

    context.level.gui3DManager = BuildGui3DControls(
      this.scene, context.level, context.gui3dRegistrations, context.baseUrl
    );

    context.level.Begin();

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
