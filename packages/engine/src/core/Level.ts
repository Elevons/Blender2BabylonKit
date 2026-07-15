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
import { Entity } from "./Entity";
import { InputManager } from "../input";
import { TeardownScript } from "./loader/scripts";
import type { PostProcessingHandles } from "../subsystems/postprocess";
import type { AtmosphereHandle } from "../subsystems/atmosphere";
import { DisposeReflectionProbes } from "../subsystems/reflectionProbes";
import type { ClusteredLightContainer } from "@babylonjs/core/Lights/Clustered";
import type { PunctualLightingMode } from "../subsystems/clusteredLights";
import { DisposeDirectionalShadowMaintenance } from "../subsystems/shadows";
import type { ComponentHost } from "./ComponentHost";

/**
 * Runtime container for a loaded level: the entity map, the active camera,
 * shadow generators, post-processing handles, and the per-frame update loop.
 * Built and populated by LevelLoader; you interact with this at runtime.
 */
export class Level
{
  readonly entities = new Map<string, Entity>();
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
