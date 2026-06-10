import {
  Scene,
  PhysicsViewer,
  type Camera,
  type ShadowGenerator,
  type Observer,
  type IBasePhysicsCollisionEvent,
  type PhysicsConstraint,
} from "@babylonjs/core";
import { Entity } from "./Entity";
import { Input } from "../scripting/Input";
import type { PostProcessingHandles } from "../subsystems/postprocess";

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
  /** Post-processing pipelines, if the manifest enabled them. */
  post?: PostProcessingHandles;
  /** From the manifest's "Debug Build" export flag; gates debug keys/tools. */
  debugEnabled = true;
  /** The Havok trigger-event observer, when any trigger events were authored. */
  triggerObserver: Observer<IBasePhysicsCollisionEvent> | null = null;
  /** Joints built from CONSTRAINT components (disposed with the level). */
  constraints: PhysicsConstraint[] = [];

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
    Input.Attach(this.scene);

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

    this.observer = this.scene.onBeforeRenderObservable.add(() =>
    {
      this.RunFrame(this.scene.getEngine().getDeltaTime() / 1000);
    });
  }

  /** One frame: every behavior's OnUpdate, then the registered updaters. */
  private RunFrame(deltaSeconds: number): void
  {
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

    // After behaviors, so WasPressed edges last exactly one full frame.
    Input.Update();
  }

  /** Stop the update loop and run every behavior's OnDestroy. */
  Dispose(): void
  {
    if (this.disposed)
    {
      return;
    }
    this.disposed = true;

    Input.Detach(this.scene);

    if (this.physicsViewer !== undefined)
    {
      this.physicsViewer.dispose();
      this.physicsViewer = undefined;
    }

    if (this.observer !== undefined)
    {
      this.scene.onBeforeRenderObservable.remove(this.observer);
    }

    if (this.triggerObserver !== null)
    {
      this.triggerObserver.remove();
      this.triggerObserver = null;
    }

    for (const constraint of this.constraints)
    {
      constraint.dispose();
    }
    this.constraints.length = 0;

    for (const entity of this.entities.values())
    {
      for (const behavior of entity.behaviors)
      {
        try
        {
          behavior.OnDestroy();
        }
        catch
        {
          // Ignore errors thrown during teardown.
        }
      }

      for (const sound of entity.sounds)
      {
        sound.dispose();
      }
      entity.sounds.length = 0;
    }
  }
}
