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
import type { ParticleEmitterManager } from "../subsystems/particles";
import type { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import type { TransformNode } from "@babylonjs/core";
import { Entity } from "./Entity";
import type { CollisionLayersInfo, EntityData } from "./types";
import type { SpawnHandle, SpawnOptions } from "./spawnTypes";
import { SpawnFromTemplate } from "./loader/prefabSpawn";
import { HideEntityNode } from "./loader/nodeResolution";
import { InputManager } from "../input";
import { TeardownScript } from "./loader/scripts";
import type { PostProcessingHandles } from "../subsystems/postprocess";
import type { AtmosphereHandle } from "../subsystems/atmosphere";
import { DisposeReflectionProbes } from "../subsystems/reflectionProbes";
import type { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered";
import type { PunctualLightingMode } from "../subsystems/clusteredLights";
import { DisposeDirectionalShadowMaintenance } from "../subsystems/shadows";
import type { ComponentHost } from "./ComponentHost";
import type { ComponentType } from "./attachments";
import { GetRuntimePolicy } from "./loader/componentRegistry";

/**
 * Removable attachments are torn down in this order when hiding a template:
 * joints before bodies, then scripts/assets, then physics last.
 * Types blocked from runtime remove (CAMERA, LOD, …) stay; visual hide covers those.
 */
const TEMPLATE_TEARDOWN_ORDER: readonly ComponentType[] = [
  "CONSTRAINT",
  "SCRIPT",
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

  private disposed = false;
  private observer?: ReturnType<Scene["onBeforeRenderObservable"]["add"]>;
  private updaters: ((deltaSeconds: number) => void)[] = [];
  private physicsViewer?: PhysicsViewer;

  constructor(private scene: Scene) {}

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
   * GUIDs, physics, scripts, and constraints per instance. The template is any
   * in-level entity (linked/appended collections flatten into the level at
   * export, so they qualify too); pass the Entity or its GUID. Behaviors reach
   * this through the injected `spawner` field (the PrefabSpawner interface).
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

    HideEntityNode(this.scene, templateEntity.node);
    await this.DisableTemplateComponents(templateEntity);
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

    this.observer = this.scene.onBeforeRenderObservable.add(() =>
    {
      this.RunFrame(this.scene.getEngine().getDeltaTime() / 1000);
    });
  }

  /** One frame: every behavior's OnUpdate, then the registered updaters. */
  private RunFrame(deltaSeconds: number): void
  {
    // Before behaviors, so action callbacks fire and WasPressedThisFrame edges
    // are visible to every OnUpdate this frame.
    InputManager.Process();

    for (const entity of this.entities.values())
    {
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

  /** Stop the update loop and run every behavior's OnDestroy. */
  Dispose(): void
  {
    if (this.disposed)
    {
      return;
    }
    this.disposed = true;

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

    // Disposing the manager disposes every 3D control it owns.
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

      // The controls themselves were disposed with the manager above.
      entity.controls3D.length = 0;
      entity.attachments.length = 0;
    }
  }
}
