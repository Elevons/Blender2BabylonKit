import type { Scene, TransformNode } from "@babylonjs/core";
import { Entity } from "../core/types";

/**
 * Base class for scriptable behaviors. Subclass it, override the lifecycle
 * hooks, and mark editable fields with `@exposed` (see exposed.ts). The runtime
 * auto-registers each class from src/behaviors by filename.
 */
export abstract class Behavior
{
  // Injected by the loader before OnStart() runs.
  entity!: Entity;
  scene!: Scene;

  /** The Babylon node this behavior drives (the entity's node). */
  get node(): TransformNode
  {
    return this.entity.node;
  }

  /** Run once, after the whole level has loaded and every entity exists. */
  OnStart(): void {}

  /** Run every frame; deltaSeconds is the time since the previous frame. */
  OnUpdate(deltaSeconds: number): void {}

  /** Run when the level is disposed. */
  OnDestroy(): void {}
}
