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
import {
  AddContainerToSceneWithLightClustering,
  BuildClusterableLightNames,
  ShouldClusterBeforeGlbLoad,
} from "../subsystems/clusteredLights";
import type { ClusteredLightsResult } from "../subsystems/clusteredLights";
import { ResolveCameraTargets } from "../subsystems/cameras";
import { FetchAndValidateManifest, GetDirectory, ValidateManifest } from "./loader/manifest";
import { ApplyNodeVisibility, NeutralizeGltfRoot } from "./loader/nodeResolution";
import { CreateLoadContext } from "./loader/context";
import { ProcessEntity, ResolveObjectReferences } from "./loader/entityBuilder";
import { ApplyNodeMaterials, ApplyDetailMaps } from "../subsystems/materials/index";
import { FinalizeLevel } from "./loader/finalizeLevel";
import { RegisterExtraVertexColorsExtension } from "./loader/gltfExtraVertexColors";
import type { LevelSession } from "./levelSession";

// Preserve glTF COLOR_1+ (Blender paint maps) — stock Babylon only loads COLOR_0.
RegisterExtraVertexColorsExtension();

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
  /**
   * Load/restart/unload surface injected onto behaviors as `this.session`.
   * Prefer {@link LevelDirector}, which sets this automatically.
   */
  session?: LevelSession;
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
    const manifest = prefetchedManifest !== undefined
      ? ValidateManifest(prefetchedManifest)
      : await FetchAndValidateManifest(manifestUrl);
    const baseUrl = GetDirectory(manifestUrl);

    const inputActions = manifest.scene?.inputActions ?? DEFAULT_INPUT_ASSET;
    const defaultInputMap = manifest.scene?.defaultInputMap ?? "Player";
    InputManager.LoadAsset(inputActions, defaultInputMap);

    if (this.options.cleanBoneMatrixWeights)
    {
      SceneLoader.CleanBoneMatrixWeights = true;
    }

    this.scene.useRightHandedSystem = true;

    const clusterPunctualLights =
      this.options.clusterPunctualLights ?? manifest.scene?.clusterPunctualLights;
    const lightBudget = this.options.lightBudget ?? manifest.scene?.lightBudget;
    const clusterOptions = {
      enabled: clusterPunctualLights,
      threshold: lightBudget,
      clusterableLightNames: BuildClusterableLightNames(manifest),
    };

    let earlyPunctualLighting: ClusteredLightsResult | null = null;
    const glbUrl = baseUrl + manifest.glb;

    if (ShouldClusterBeforeGlbLoad(manifest, clusterOptions))
    {
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
    ApplyDetailMaps(this.scene, manifest.detailMaps, baseUrl);

    const context = CreateLoadContext(
      this.scene,
      baseUrl,
      this.registry,
      defaultInputMap,
      this.options.session
    );

    context.level.debugEnabled = manifest.debug !== false;
    context.level.collisionLayers = manifest.scene?.collisionLayers;

    for (const entityData of manifest.entities)
    {
      ProcessEntity(entityData, this.scene, this.registry, context);
    }

    ResolveObjectReferences(context.pendingReferences, context.level);
    ResolveCameraTargets(context.level, context.cameraTargets);

    await FinalizeLevel(
      this.scene,
      manifest,
      context,
      this.options,
      earlyPunctualLighting
    );

    return context.level;
  }
}
