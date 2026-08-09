import {
  Scene,
  PhysicsViewer,
  type Camera,
  type ShadowGenerator,
  type PhysicsConstraint,
} from "@babylonjs/core";
import type { CollisionEventHandles } from "../subsystems/collisions";
import { DisposeCollisionEvents } from "../subsystems/collisions";
import type { GUI3DManager } from "@babylonjs/gui";
import type { MsdfTextManager } from "../ui/msdfText";
import { ClearFontCacheForScene } from "../ui/msdfText";
import { GameClock } from "./GameClock";
import { PhysicsBodyInterpolation } from "../subsystems/physics/interpolation";
import type { ParticleEmitterManager } from "../subsystems/particles";
import type { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import type { TransformNode } from "@babylonjs/core";
import type { AbstractMesh } from "@babylonjs/core";
import { Entity } from "./Entity";
import type { CollisionLayersInfo, EntityData } from "./types";
import type { SpawnHandle, SpawnOptions } from "./spawnTypes";
import { SpawnFromTemplate } from "./loader/prefabSpawn";
import { HideEntityNode } from "./loader/nodeResolution";
import { IsEntityActive } from "./entityActive";
import { InputManager } from "../input";
import type { Behavior } from "../scripting/Behavior";
import { TeardownScript } from "./loader/scripts";
import type { PostProcessingHandles } from "../subsystems/postprocess";
import type { AtmosphereHandle } from "../subsystems/atmosphere";
import { DisposeReflectionProbes } from "../subsystems/reflectionProbes";
import type { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered";
import type { PunctualLightingMode } from "../subsystems/clusteredLights";
import { DisposeDirectionalShadowMaintenance, RegisterSpawnedShadowMeshes } from "../subsystems/shadows";
import type { ComponentHost } from "./ComponentHost";
import type { ComponentType } from "./attachments";
import { GetRuntimePolicy } from "./loader/componentRegistry";
import {
  CreateStubLevelSession,
  type LevelSession,
} from "./levelSession";

/**
 * Removable attachments are torn down in this order when hiding a template:
 * joints before bodies, then scripts/assets, then physics last.
 * Types blocked from runtime remove (CAMERA, LOD, …) stay; visual hide covers those.
 */
const TEMPLATE_TEARDOWN_ORDER: readonly ComponentType[] = [
  "CONSTRAINT",
  "SCRIPT",
  "ANIMATOR",
  "AUDIO",
  "GUI",
  "PARTICLE",
  "MSDF_TEXT",
  "GUI3D_BUTTON",
  "GUI3D_HOLO",
  "GUI3D_TOUCH_HOLO",
  "GUI3D_MESH",
  "GUI3D_STACK",
  "GUI3D_SPHERE",
  "GUI3D_CYLINDER",
  "GUI3D_PLANE",
  "GUI3D_SCATTER",
  "COLLIDER",
  "RIGIDBODY",
  "TAG",
];

/**
 * Runtime container for a loaded level: the entity map, the active camera,
 * shadow generators, post-processing handles, and the per-frame update loop.
 * Built and populated by LevelLoader; you interact with this at runtime.
 */
export class Level
{
  readonly entities = new Map<string, Entity>();
  /** Manifest row per entity GUID, retained so Spawn can rebuild component stacks. */
  readonly entityData = new Map<string, EntityData>();
  /** Scene collision layer table, retained for spawned-instance filter masks. */
  collisionLayers?: CollisionLayersInfo;
  /** The Blender scene's active camera, if one was exported. */
  activeCamera?: Camera;
  /** Shadow generators created for shadow-casting lights (one per light). */
  shadowGenerators: ShadowGenerator[] = [];
  /** Clustered punctual lights, when the scene exceeded the forward-light budget. */
  clusteredLights?: ClusteredLightContainer;
  /** How punctual lights were set up at load (forward, clustered, or UBO fallback). */
  punctualLightingMode: PunctualLightingMode = "forward";
  /** Post-processing pipelines, if the manifest enabled them. */
  post?: PostProcessingHandles;
  /** True after {@link NotifyPostReady} has run (late rendering + post attach). */
  postReady = false;
  /** Physically based atmosphere, if the manifest enabled it. */
  atmosphere?: AtmosphereHandle;
  /** From the manifest's "Debug Build" export flag; gates debug keys/tools. */
  debugEnabled = true;
  /** Havok collision/trigger observers, when hooks or Event Messages are wired. */
  collisionEventHandles: CollisionEventHandles | null = null;
  /** Joints built from CONSTRAINT components (disposed with the level). */
  constraints: PhysicsConstraint[] = [];
  /** Shared 3D GUI manager, present when any GUI3D_* component was authored. */
  gui3DManager?: GUI3DManager;
  /** MSDF text draw hook, present when any MSDF_TEXT component was authored. */
  msdfTextManager?: MsdfTextManager;
  /** Empty-node particle emitter sync, present when any such emitter was authored. */
  particleEmitterManager?: ParticleEmitterManager;
  /** Reflection probes built from REFLECTION_PROBE components. */
  reflectionProbes: ReflectionProbe[] = [];
  /** Runtime component add/remove; set by LevelLoader during load. */
  componentHost!: ComponentHost;

  /**
   * Load/restart/unload surface injected onto behaviors as `this.session`.
   * Set by LevelLoader from {@link LevelLoaderOptions.session} (LevelDirector
   * wires this automatically).
   */
  session: LevelSession = CreateStubLevelSession(
    "pass LevelLoaderOptions.session (use LevelDirector)"
  );

  /**
   * Unified game clock (Unity's `Time`): `timeScale`, scaled/unscaled frame
   * deltas, and elapsed time. Ticked once per frame before behaviors run;
   * syncs scene animations and the Havok step. Behaviors reach it as
   * `this.time`.
   */
  readonly time: GameClock;

  private disposed = false;
  private observer?: ReturnType<Scene["onBeforeRenderObservable"]["add"]>;
  private physicsStepObserver?: ReturnType<Scene["onBeforePhysicsObservable"]["add"]>;
  private bodyInterpolation?: PhysicsBodyInterpolation;
  private updaters: ((deltaSeconds: number) => void)[] = [];
  private physicsViewer?: PhysicsViewer;
  /** Meshes queued by spawns that passed `deferShadowRefresh`. */
  private pendingSpawnShadowMeshes: AbstractMesh[] = [];
  /** Templates already hidden — HideTemplate and post-spawn hide are idempotent. */
  private hiddenTemplateIds = new Set<string>();

  constructor(private scene: Scene)
  {
    this.time = new GameClock(scene);
  }

  /**
   * Toggle wireframe debug rendering of every collider/body in the level
   * (Babylon's PhysicsViewer). Call with no argument to flip, or pass an
   * explicit boolean. The viewer keeps the wireframes in sync each frame.
   */
  ShowColliders(show?: boolean): void
  {
    const shouldShow = show ?? this.physicsViewer === undefined;

    if (shouldShow)
    {
      if (this.physicsViewer === undefined)
      {
        this.physicsViewer = new PhysicsViewer(this.scene);
      }

      for (const entity of this.entities.values())
      {
        if (entity.body !== undefined)
        {
          this.physicsViewer.showBody(entity.body);
        }
      }
    }
    else if (this.physicsViewer !== undefined)
    {
      for (const entity of this.entities.values())
      {
        if (entity.body !== undefined)
        {
          this.physicsViewer.hideBody(entity.body);
        }
      }

      this.physicsViewer.dispose();
      this.physicsViewer = undefined;
    }
  }

  /** Register a per-frame callback (used e.g. by offset-follow cameras). */
  AddUpdater(updater: (deltaSeconds: number) => void): void
  {
    this.updaters.push(updater);
  }

  /**
   * Force every shadow map to re-render once on the next frame. Only meaningful
   * when shadows were frozen (static-world optimization): call this after you've
   * moved a shadow caster at runtime so its baked shadow updates. No-op cost on
   * live (unfrozen) generators.
   */
  RefreshShadows(): void
  {
    for (const generator of this.shadowGenerators)
    {
      generator.getShadowMap()?.resetRefreshCounter();
    }
  }

  /**
   * Queue spawned meshes for batched registration on shadow generators. Used
   * when `Spawn` is called with `deferShadowRefresh: true`.
   */
  QueueSpawnShadowMeshes(meshes: readonly AbstractMesh[]): void
  {
    if (meshes.length === 0)
    {
      return;
    }

    this.pendingSpawnShadowMeshes.push(...meshes);
  }

  /**
   * Register every queued spawn mesh on the shadow generators, then re-render
   * frozen maps once. Safe to call when the queue is empty.
   */
  FlushSpawnShadowRefresh(): void
  {
    if (this.pendingSpawnShadowMeshes.length === 0)
    {
      return;
    }

    const meshes = this.pendingSpawnShadowMeshes;
    this.pendingSpawnShadowMeshes = [];

    if (this.shadowGenerators.length === 0)
    {
      return;
    }

    const addedCasters = RegisterSpawnedShadowMeshes(this.shadowGenerators, meshes);
    if (addedCasters > 0)
    {
      this.RefreshShadows();
    }
  }

  /** Return every entity carrying the given tag. */
  ByTag(tag: string): Entity[]
  {
    return [...this.entities.values()].filter((entity) => entity.tag === tag);
  }

  /** Look up an entity by its Blender GUID. */
  ById(id: string): Entity | undefined
  {
    return this.entities.get(id);
  }

  /**
   * Duplicate a loaded template subtree at runtime — full components, fresh
   * GUIDs, physics, scripts, and constraints per instance. Hides the template
   * when the call starts unless `options.keepTemplate === true`.
   */
  async Spawn(template: Entity | string, options: SpawnOptions = {}): Promise<SpawnHandle>
  {
    const templateEntity = typeof template === "string" ? this.ById(template) : template;
    if (templateEntity === undefined)
    {
      throw new Error(`[bjs] Spawn: template entity "${String(template)}" not found`);
    }

    return SpawnFromTemplate(this, this.scene, templateEntity, options);
  }

  /**
   * Hide an in-scene template and tear down its live components so only
   * spawned clones remain active. Hides the render subtree (meshes, child
   * lights/cameras), then removes every runtime-removable attachment on the
   * template root and its descendant entities — physics, scripts, audio,
   * constraints, GUI, particles, etc. Spawn still works afterward: it rebuilds
   * from retained EntityData, not from the template's live attachments. Call
   * before or after Spawn (clones are unaffected — Spawn re-reveals them).
   *
   * Types blocked from runtime remove (CAMERA, LOD, REFLECTION_PROBE, layer
   * masks) stay attached; the visual hide covers cameras, and LOD on a hidden
   * mesh is inert.
   */
  async HideTemplate(template: Entity | string): Promise<void>
  {
    const templateEntity = typeof template === "string" ? this.ById(template) : template;
    if (templateEntity === undefined)
    {
      throw new Error(`[bjs] HideTemplate: template entity "${String(template)}" not found`);
    }

    if (this.hiddenTemplateIds.has(templateEntity.id))
    {
      return;
    }

    HideEntityNode(this.scene, templateEntity.node);
    await this.DisableTemplateComponents(templateEntity);
    this.hiddenTemplateIds.add(templateEntity.id);
  }

  /** Template root plus every descendant entity registered in this level. */
  private CollectTemplateSubtree(template: Entity): Entity[]
  {
    const entities: Entity[] = [template];

    for (const descendant of template.node.getDescendants(false))
    {
      const metadata = (descendant as TransformNode).metadata as
        { bjsEntity?: Entity } | undefined;
      const entity = metadata?.bjsEntity;
      if (entity instanceof Entity && entity !== template && this.ById(entity.id) === entity)
      {
        entities.push(entity);
      }
    }

    return entities;
  }

  /**
   * Tear down live components on a template subtree via ComponentHost.
   * EntityData rows are left intact so a later Spawn can rebuild instances.
   */
  private async DisableTemplateComponents(template: Entity): Promise<void>
  {
    const host = this.componentHost;
    if (host === undefined)
    {
      return;
    }

    const entities = this.CollectTemplateSubtree(template);

    for (const componentType of TEMPLATE_TEARDOWN_ORDER)
    {
      if (!GetRuntimePolicy(componentType).allowRuntimeRemove)
      {
        continue;
      }

      for (const entity of entities)
      {
        while (entity.HasAttachment(componentType))
        {
          await host.RemoveComponent(entity, componentType, 0);
        }
      }
    }
  }

  /**
   * Start the per-frame update loop after entities/behaviors are built. Runs
   * every behavior's OnStart once, then drives OnUpdate + registered updaters
   * each frame. Called by the loader; not part of the public API.
   */
  Begin(): void
  {
    InputManager.Attach(this.scene);

    for (const entity of this.entities.values())
    {
      for (const behavior of entity.behaviors)
      {
        try
        {
          behavior.OnStart();
        }
        catch (error)
        {
          console.error(`[bjs] OnStart "${entity.name}"`, error);
        }
      }
    }

    if (this.componentHost !== undefined)
    {
      this.componentHost.MarkBegun();
    }

    this.bodyInterpolation = new PhysicsBodyInterpolation(this.scene);

    this.observer = this.scene.onBeforeRenderObservable.add(() =>
    {
      // The clock clamps hitch deltas, applies timeScale, and syncs scene
      // animations + the Havok step.
      const rawDeltaSeconds = this.scene.getEngine().getDeltaTime() / 1000;
      const scaledDeltaSeconds = this.time.Tick(rawDeltaSeconds);

      // Before behaviors, so camera followers and gameplay reads see the
      // smooth pose (no-op under variable stepping).
      this.bodyInterpolation!.ApplyVisuals(this.time.physicsBlendAlpha);

      this.RunFrame(scaledDeltaSeconds);
    });

    // Fires once per physics step — per render frame with variable stepping,
    // 0..N times per frame with fixed stepping (GameClock.fixedDeltaSeconds).
    this.physicsStepObserver = this.scene.onBeforePhysicsObservable.add(() =>
    {
      this.RunFixedFrame(this.time.physicsStepSeconds);
    });
  }

  /**
   * Run every behavior's OnPostReady once after NME compile and post-processing
   * attach. Called by the loader after Begin(); spawned or runtime-added scripts
   * receive OnPostReady via {@link RunPostReadyForEntity} when this flag is set.
   */
  NotifyPostReady(): void
  {
    if (this.postReady)
    {
      return;
    }

    this.postReady = true;

    for (const entity of this.entities.values())
    {
      this.RunPostReadyForEntity(entity);
    }
  }

  /** Run OnPostReady on one entity's behaviors when post-ready has already fired. */
  RunPostReadyForEntity(entity: Entity): void
  {
    if (!this.postReady)
    {
      return;
    }

    for (const behavior of entity.behaviors)
    {
      this.RunPostReady(behavior, entity.name);
    }
  }

  /** Invoke OnPostReady on a single behavior instance. */
  RunPostReady(behavior: Behavior, entityName: string): void
  {
    if (!this.postReady)
    {
      return;
    }

    try
    {
      behavior.OnPostReady();
    }
    catch (error)
    {
      console.error(`[bjs] OnPostReady "${entityName}"`, error);
    }
  }

  /** One frame: every behavior's OnUpdate, then the registered updaters. */
  private RunFrame(deltaSeconds: number): void
  {
    // Before behaviors, so action callbacks fire and WasPressedThisFrame edges
    // are visible to every OnUpdate this frame.
    InputManager.Process();

    for (const entity of this.entities.values())
    {
      if (!IsEntityActive(entity))
      {
        continue;
      }

      for (const behavior of entity.behaviors)
      {
        try
        {
          behavior.OnUpdate(deltaSeconds);
        }
        catch (error)
        {
          console.error(`[bjs] OnUpdate "${entity.name}"`, error);
        }
      }
    }

    for (const updater of this.updaters)
    {
      try
      {
        updater(deltaSeconds);
      }
      catch (error)
      {
        console.error("[bjs] camera updater", error);
      }
    }

    // After behaviors, so per-frame device edges last exactly one full frame.
    InputManager.EndFrame();
  }

  /**
   * Run every behavior's OnFixedUpdate once per physics step, immediately
   * before Havok integrates it (scene.onBeforePhysicsObservable).
   */
  private RunFixedFrame(stepSeconds: number): void
  {
    for (const entity of this.entities.values())
    {
      if (!IsEntityActive(entity))
      {
        continue;
      }

      for (const behavior of entity.behaviors)
      {
        try
        {
          behavior.OnFixedUpdate(stepSeconds);
        }
        catch (error)
        {
          console.error(`[bjs] OnFixedUpdate "${entity.name}"`, error);
        }
      }
    }
  }

  /** Stop the update loop and run every behavior's OnDestroy. */
  Dispose(): void
  {
    if (this.disposed)
    {
      return;
    }
    this.disposed = true;

    this.DisposeInputAndObservers();
    this.DisposeLevelSubsystems();
    this.DisposeEntities();
  }

  /** Detach input, physics debug view, and the frame observer. */
  private DisposeInputAndObservers(): void
  {
    InputManager.Detach(this.scene);

    if (this.physicsViewer !== undefined)
    {
      this.physicsViewer.dispose();
      this.physicsViewer = undefined;
    }

    if (this.observer !== undefined)
    {
      this.scene.onBeforeRenderObservable.remove(this.observer);
    }

    if (this.physicsStepObserver !== undefined)
    {
      this.scene.onBeforePhysicsObservable.remove(this.physicsStepObserver);
    }

    if (this.bodyInterpolation !== undefined)
    {
      this.bodyInterpolation.Dispose();
    }
  }

  /** Tear down level-owned subsystems (constraints, GUI, atmosphere, shadows, …). */
  private DisposeLevelSubsystems(): void
  {
    if (this.collisionEventHandles !== null)
    {
      DisposeCollisionEvents(this.collisionEventHandles);
      this.collisionEventHandles = null;
    }

    for (const constraint of this.constraints)
    {
      constraint.dispose();
    }
    this.constraints.length = 0;

    if (this.gui3DManager !== undefined)
    {
      this.gui3DManager.dispose();
      this.gui3DManager = undefined;
    }

    if (this.msdfTextManager !== undefined)
    {
      this.msdfTextManager.dispose();
      this.msdfTextManager = undefined;
    }
    ClearFontCacheForScene(this.scene);

    if (this.particleEmitterManager !== undefined)
    {
      this.particleEmitterManager.dispose();
      this.particleEmitterManager = undefined;
    }

    DisposeReflectionProbes(this.reflectionProbes);
    this.reflectionProbes.length = 0;

    if (this.atmosphere !== undefined)
    {
      this.atmosphere.dispose();
      this.atmosphere = undefined;
    }

    if (this.clusteredLights !== undefined)
    {
      this.clusteredLights.dispose();
      this.clusteredLights = undefined;
    }

    DisposeDirectionalShadowMaintenance(this.scene);
  }

  /** Dispose every entity's behaviors, assets, physics body, and attachment rows. */
  private DisposeEntities(): void
  {
    for (const entity of this.entities.values())
    {
      for (const behavior of entity.behaviors)
      {
        TeardownScript(behavior);
      }

      for (const sound of entity.sounds)
      {
        sound.dispose();
      }
      entity.sounds.length = 0;

      for (const texture of entity.guiTextures)
      {
        texture.dispose();
      }
      entity.guiTextures.length = 0;

      for (const system of entity.particleSystems)
      {
        system.dispose();
      }
      entity.particleSystems.length = 0;

      for (const renderer of entity.textRenderers)
      {
        renderer.dispose();
      }
      entity.textRenderers.length = 0;

      if (entity.body !== undefined)
      {
        entity.body.dispose();
        entity.body = undefined;
      }

      entity.reflectionProbes.length = 0;
      entity.controls3D.length = 0;
      entity.attachments.length = 0;
    }
  }
}
