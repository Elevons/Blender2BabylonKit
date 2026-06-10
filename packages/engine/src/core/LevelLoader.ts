import {
  Scene,
  TransformNode,
  appendSceneAsync,
  Color3,
  Color4,
} from "@babylonjs/core";
// Registers the glTF loader so .glb files can be loaded. (In Babylon 9 the old
// SceneLoader.AppendAsync statics are deprecated in favour of appendSceneAsync.)
import "@babylonjs/loaders/glTF";
// Copies each glTF node's `extras` to node.metadata.gltf.extras. REQUIRED for
// GUID matching: the Blender exporter writes obj["bjs_id"] into node extras, and
// without this extension Babylon leaves node.metadata empty.
import "@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata";

import { Entity } from "./Entity";
import { ID_KEY } from "./types";
import type {
  LevelManifest,
  EntityData,
  Component,
  ColliderComponent,
  RigidBodyComponent,
  ScriptComponent,
  CameraComponent,
  AudioComponent,
  ConstraintComponent,
  SceneInfo,
  LightInfo,
  CameraInfo,
  AnimationInfo,
} from "./types";
import type {
  FollowCamera,
  ArcRotateCamera,
  UniversalCamera,
} from "@babylonjs/core";
import { Level } from "./Level";
import { BehaviorRegistry } from "../scripting/BehaviorRegistry";
import { BuildPhysics } from "../subsystems/physics";
import { ApplyBlenderLight } from "../subsystems/lights";
import { ApplyBlenderCamera, BuildTypedCamera, ResolveCameraTargets, type CameraTargetSets } from "../subsystems/cameras";
import { SetupShadows, type ShadowCaster } from "../subsystems/shadows";
import { ApplyEnvironment } from "../subsystems/environment";
import { ApplyFog } from "../subsystems/fog";
import { ApplyPostProcessing } from "../subsystems/postprocess";
import { ApplyAnimation } from "../subsystems/animation";
import { ApplyAudio } from "../subsystems/audio";
import { WireTriggerEvents, type TriggerRegistration } from "../subsystems/triggers";
import { BuildConstraints, type ConstraintRegistration } from "../subsystems/constraints";
import { ApplyExposedVars, type PendingRef } from "../scripting/exposed";

export interface LevelLoaderOptions {
  /** Create shadow generators for lights flagged to cast shadows. Default true. */
  shadows?: boolean;
  /** Shadow map resolution per light. Default 1024. */
  shadowMapSize?: number;
  /** Show collider wireframes on load (Babylon PhysicsViewer). Default false. */
  debugColliders?: boolean;
}

/** Mutable state threaded through the per-entity build pass. */
interface LoadContext {
  level: Level;
  baseUrl: string;
  idIndex: Map<string, TransformNode>;
  pendingReferences: PendingRef[];
  shadowLights: ShadowCaster[];
  animatedEntities: { entity: Entity; info: AnimationInfo }[];
  cameraTargets: CameraTargetSets;
  audioTasks: Promise<unknown>[];
  triggerRegistrations: TriggerRegistration[];
  constraintRegistrations: ConstraintRegistration[];
}

/** Return the directory portion of a URL (everything up to the last slash). */
function GetDirectory(url: string): string
{
  const lastSlash = url.lastIndexOf("/");
  return lastSlash >= 0 ? url.slice(0, lastSlash + 1) : "";
}

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
    const manifest = await this.FetchAndValidateManifest(manifestUrl);
    const baseUrl = GetDirectory(manifestUrl);

    // Import the glb right-handed so the loader skips the "__root__" handedness
    // mirror; that mirror would otherwise corrupt Havok collider placement.
    // See physics.ts for the full explanation.
    this.scene.useRightHandedSystem = true;
    await appendSceneAsync(baseUrl + manifest.glb, this.scene);
    this.NeutralizeGltfRoot();

    const context: LoadContext =
    {
      level: new Level(this.scene),
      baseUrl,
      idIndex: this.BuildIdIndex(),
      pendingReferences: [],
      shadowLights: [],
      animatedEntities: [],
      cameraTargets: { followCams: [], arcCams: [], offsetCams: [] },
      audioTasks: [],
      triggerRegistrations: [],
      constraintRegistrations: [],
    };

    // "Debug Build" export flag: a missing field (older manifests) means enabled.
    context.level.debugEnabled = manifest.debug !== false;

    // First pass: build every entity and apply its components, lights, cameras.
    for (const entityData of manifest.entities)
    {
      this.ProcessEntity(entityData, context);
    }

    // Second pass: resolve cross-entity references now that all entities exist.
    this.ResolveObjectReferences(context.pendingReferences, context.level);
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
      context.level.shadowGenerators = SetupShadows(this.scene, context.shadowLights, {
        mapSize: this.options.shadowMapSize,
      });
    }

    if (manifest.scene !== undefined)
    {
      this.ApplyScene(manifest.scene, context.baseUrl, context.level);
    }

    this.ApplyAutoPlayAnimations(context.animatedEntities);

    // Sounds were created in parallel during the entity loop; settle them now so
    // a bad file logs here rather than as an unhandled rejection later.
    const audioResults = await Promise.allSettled(context.audioTasks);
    for (const result of audioResults)
    {
      if (result.status === "rejected")
      {
        console.warn("[bjs] sound failed to load:", result.reason);
      }
    }

    context.level.triggerObserver =
      WireTriggerEvents(this.scene, context.level, context.triggerRegistrations);

    context.level.constraints =
      BuildConstraints(this.scene, context.level, context.constraintRegistrations);

    context.level.Begin();

    // debugColliders is a dev convenience; a non-debug ("release") export wins.
    if (this.options.debugColliders && context.level.debugEnabled)
    {
      context.level.ShowColliders(true);
    }
  }

  /** Fetch the manifest JSON, with clear errors for the two common failures. */
  private async FetchAndValidateManifest(manifestUrl: string): Promise<LevelManifest>
  {
    const response = await fetch(manifestUrl);
    if (!response.ok)
    {
      throw new Error(
        `[bjs] could not fetch manifest "${manifestUrl}" (HTTP ${response.status}). ` +
        `Check the file exists and the path/filename match exactly.`
      );
    }

    const text = await response.text();
    if (text.trimStart().startsWith("<"))
    {
      throw new Error(
        `[bjs] "${manifestUrl}" returned HTML, not JSON. The dev server likely ` +
        `served index.html because the file was not found at that path.`
      );
    }

    return JSON.parse(text) as LevelManifest;
  }

  /** Build one entity from its manifest record and apply everything attached. */
  private ProcessEntity(entityData: EntityData, context: LoadContext): void
  {
    const resolvedNode =
      (entityData.id.length > 0 ? context.idIndex.get(entityData.id) : undefined) ??
      this.FindNode(entityData.name);

    if (resolvedNode === null || resolvedNode === undefined)
    {
      console.warn(
        `[bjs] could not resolve entity "${entityData.name}" ` +
        `(id=${entityData.id.length > 0 ? entityData.id : "none"}) to a glTF node - skipping`
      );
      return;
    }

    const entityKey = entityData.id.length > 0 ? entityData.id : entityData.name;
    const entity = new Entity(entityData.id, entityData.name, resolvedNode);
    context.level.entities.set(entityKey, entity);
    resolvedNode.metadata = { ...(resolvedNode.metadata ?? {}), bjsEntity: entity };

    context.pendingReferences.push(...this.ApplyComponents(entity, entityData.components, context));

    if (entityData.animation !== undefined)
    {
      context.animatedEntities.push({ entity, info: entityData.animation });
    }

    if (entityData.light !== undefined)
    {
      this.ProcessLightForEntity(resolvedNode, entityData.light, context);
    }

    if (entityData.camera !== undefined)
    {
      this.ProcessCameraForEntity(resolvedNode, entityData, context);
    }
  }

  /** Apply a Blender lamp's settings and remember it if it casts shadows. */
  private ProcessLightForEntity(node: TransformNode, lightInfo: LightInfo, context: LoadContext): void
  {
    const light = ApplyBlenderLight(this.scene, node, lightInfo);
    if (light !== null && lightInfo.castShadows)
    {
      context.shadowLights.push({ light, settings: lightInfo.shadow });
    }
  }

  /** Apply a Blender camera, optionally override its type, and track its target. */
  private ProcessCameraForEntity(node: TransformNode, entityData: EntityData, context: LoadContext): void
  {
    const cameraInfo = entityData.camera as CameraInfo;
    let camera = ApplyBlenderCamera(this.scene, node, cameraInfo);

    const cameraComponent = entityData.components.find(
      (component) => component.type === "CAMERA"
    ) as CameraComponent | undefined;

    if (camera !== null && cameraComponent !== undefined)
    {
      const built = BuildTypedCamera(this.scene, camera, cameraComponent);
      camera = built.camera;
      this.RegisterCameraTargets(built, cameraComponent, context);
    }

    if (camera !== null && cameraInfo.active)
    {
      this.scene.activeCamera = camera;
      context.level.activeCamera = camera;
    }
  }

  /**
   * Queue a typed camera's deferred target bindings (FOLLOW lockedTarget, ARC
   * orbit pivot, OFFSET chase offset) for the post-pass, once entities exist.
   */
  private RegisterCameraTargets(
    built: ReturnType<typeof BuildTypedCamera>,
    cameraComponent: CameraComponent,
    context: LoadContext
  ): void
  {
    if (built.followTarget !== undefined)
    {
      context.cameraTargets.followCams.push({
        cam: built.camera as FollowCamera,
        guid: built.followTarget.guid,
        eye: built.followTarget.eye,
        derive: cameraComponent.useBlenderTransform,
      });
    }

    if (built.arcTarget !== undefined)
    {
      context.cameraTargets.arcCams.push({
        cam: built.camera as ArcRotateCamera,
        guid: built.arcTarget.guid,
        eye: built.arcTarget.eye,
      });
    }

    if (built.offsetFollow !== undefined)
    {
      context.cameraTargets.offsetCams.push({
        cam: built.camera as UniversalCamera,
        guid: built.offsetFollow.guid,
        eye: built.offsetFollow.eye,
      });
    }
  }

  /**
   * Resolve deferred entity references (entity-typed @exposed fields stored as
   * GUIDs) now that every entity exists. Scalar fields are assigned directly;
   * entity-list fields are assigned into their array slot by index.
   */
  private ResolveObjectReferences(pendingReferences: PendingRef[], level: Level): void
  {
    for (const reference of pendingReferences)
    {
      const target = level.ById(reference.guid) ?? null;
      if (target === null)
      {
        console.warn(`[bjs] object reference "${reference.field}" -> ${reference.guid} not found`);
      }

      const instance = reference.instance as Record<string, unknown>;
      if (reference.index === undefined)
      {
        instance[reference.field] = target;
      }
      else
      {
        const slot = instance[reference.field];
        if (Array.isArray(slot))
        {
          slot[reference.index] = target;
        }
      }
    }
  }

  /**
   * Neutralize auto-started AnimationGroups (the glTF loader plays the first one
   * by default), then auto-play each entity's chosen clip if requested.
   */
  private ApplyAutoPlayAnimations(animatedEntities: { entity: Entity; info: AnimationInfo }[]): void
  {
    if (this.scene.animationGroups.length === 0)
    {
      return;
    }

    for (const group of this.scene.animationGroups)
    {
      group.stop();
    }

    for (const animated of animatedEntities)
    {
      ApplyAnimation(this.scene, animated.entity, animated.info);
    }
  }

  /** Apply the optional scene-wide render block from the manifest. */
  private ApplyScene(sceneInfo: SceneInfo, baseUrl: string, level: Level): void
  {
    if (sceneInfo.clearColor !== undefined)
    {
      this.scene.clearColor = Color4.FromArray(sceneInfo.clearColor);
    }
    if (sceneInfo.ambientColor !== undefined)
    {
      this.scene.ambientColor = Color3.FromArray(sceneInfo.ambientColor);
    }
    if (sceneInfo.environment !== undefined && sceneInfo.environment !== null)
    {
      ApplyEnvironment(this.scene, sceneInfo.environment, baseUrl);
    }
    if (sceneInfo.fog !== undefined && sceneInfo.fog !== null)
    {
      ApplyFog(this.scene, sceneInfo.fog);
    }
    if (sceneInfo.postProcessing !== undefined && sceneInfo.postProcessing !== null)
    {
      level.post = ApplyPostProcessing(this.scene, this.scene.activeCamera, sceneInfo.postProcessing);
    }
  }

  /**
   * With right-handed import the glTF "__root__" is identity (no handedness
   * mirror), so Havok can decompose node world matrices cleanly. This stays as a
   * guard: if a mirrored root ever reappears (negative determinant), physics
   * orientation is broken again and we want a loud, specific warning.
   */
  private NeutralizeGltfRoot(): void
  {
    const rootNode = this.scene.getNodeByName("__root__") as TransformNode | null;
    if (rootNode === null)
    {
      return;
    }

    rootNode.computeWorldMatrix(true);
    if (rootNode.getWorldMatrix().determinant() < 0)
    {
      console.warn(
        '[bjs] "__root__" has a negative-determinant (mirrored) transform; ' +
        "collider/body orientation will be wrong. Ensure scene.useRightHandedSystem " +
        "is set to true BEFORE the glb is appended."
      );
    }
  }

  /** Map every loaded node's GUID (node.metadata.gltf.extras.bjs_id) to the node. */
  private BuildIdIndex(): Map<string, TransformNode>
  {
    const idIndex = new Map<string, TransformNode>();

    const consider = (candidateNode: TransformNode): void =>
    {
      const guid = candidateNode.metadata?.gltf?.extras?.[ID_KEY];
      if (typeof guid === "string" && guid.length > 0 && !idIndex.has(guid))
      {
        idIndex.set(guid, candidateNode);
      }
    };

    for (const transformNode of this.scene.transformNodes)
    {
      consider(transformNode);
    }
    for (const mesh of this.scene.meshes)
    {
      consider(mesh as unknown as TransformNode);
    }

    return idIndex;
  }

  /** Find a node by name, trying meshes, transform nodes, then any node. */
  private FindNode(name: string): TransformNode | null
  {
    return (
      this.scene.getMeshByName(name) ??
      this.scene.getTransformNodeByName(name) ??
      (this.scene.getNodeByName(name) as TransformNode | null) ??
      null
    );
  }

  /** An entity's components, sorted by kind for the apply steps. */
  private ClassifyComponents(entity: Entity, components: Component[]): {
    collider: ColliderComponent | undefined;
    body: RigidBodyComponent | undefined;
    scripts: ScriptComponent[];
    audioComponents: AudioComponent[];
    constraintComponents: ConstraintComponent[];
  }
  {
    let collider: ColliderComponent | undefined;
    let body: RigidBodyComponent | undefined;
    const scripts: ScriptComponent[] = [];
    const audioComponents: AudioComponent[] = [];
    const constraintComponents: ConstraintComponent[] = [];

    for (const component of components)
    {
      switch (component.type)
      {
        case "TAG":
          entity.tag = component.tag; // tags are one field; applied right here
          break;
        case "COLLIDER":
          collider = component;
          break;
        case "RIGIDBODY":
          body = component;
          break;
        case "SCRIPT":
          scripts.push(component);
          break;
        case "AUDIO":
          audioComponents.push(component);
          break;
        case "CONSTRAINT":
          constraintComponents.push(component);
          break;
      }
    }

    return { collider, body, scripts, audioComponents, constraintComponents };
  }

  /** Instantiate SCRIPT behaviors, inject entity/scene, apply @exposed values. */
  private InstantiateScripts(entity: Entity, scripts: ScriptComponent[]): PendingRef[]
  {
    const pendingReferences: PendingRef[] = [];

    for (const scriptComponent of scripts)
    {
      const behavior = this.registry.Create(scriptComponent.script);
      if (behavior === undefined)
      {
        continue;
      }

      behavior.entity = entity;
      behavior.scene = this.scene;
      pendingReferences.push(...ApplyExposedVars(behavior, scriptComponent.vars));
      entity.behaviors.push(behavior);
    }

    return pendingReferences;
  }

  /**
   * Interpret an entity's components: build one physics body from any COLLIDER /
   * RIGIDBODY, register authored trigger reactions, queue sound creation, set the
   * tag, and instantiate SCRIPT behaviors (deferring their entity references).
   * Returns the deferred references for the second pass.
   */
  private ApplyComponents(entity: Entity, components: Component[], context: LoadContext): PendingRef[]
  {
    const { collider, body, scripts, audioComponents, constraintComponents } =
      this.ClassifyComponents(entity, components);

    if (collider !== undefined || body !== undefined)
    {
      entity.body = BuildPhysics(entity.node, collider, body, this.scene);
    }

    // Authored trigger reactions need the plugin observable; wired in a post-pass.
    if (collider !== undefined && collider.isTrigger
        && collider.events !== undefined && collider.events.length > 0)
    {
      context.triggerRegistrations.push({ sourceEntity: entity, events: collider.events });
    }

    // Sound creation is async (fetch + decode); collected and awaited after the loop.
    for (const audioComponent of audioComponents)
    {
      context.audioTasks.push(ApplyAudio(entity, audioComponent, context.baseUrl));
    }

    // Joints need BOTH bodies to exist; built in a post-pass (FinalizeLevel).
    for (const constraintComponent of constraintComponents)
    {
      context.constraintRegistrations.push({ ownerEntity: entity, component: constraintComponent });
    }

    return this.InstantiateScripts(entity, scripts);
  }
}
