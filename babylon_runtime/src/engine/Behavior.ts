import type { Scene, TransformNode } from "@babylonjs/core";
import { Entity } from "./types";

/**
 * Base class for scriptable behaviors. Subclass it, override the lifecycle
 * hooks, and mark editable fields with `@exposed` (see exposed.ts). Register
 * the class with the runtime (auto-registered from src/behaviors by filename).
 */
export abstract class Behavior {
  // Injected by the loader before onStart() runs.
  entity!: Entity;
  scene!: Scene;

  get node(): TransformNode {
    return this.entity.node;
  }

  /** Called once, after the whole level has loaded and all entities exist. */
  onStart(): void {}

  /** Called every frame. dt is seconds since the last frame. */
  onUpdate(_dt: number): void {}

  /** Called when the level is disposed. */
  onDestroy(): void {}
}
