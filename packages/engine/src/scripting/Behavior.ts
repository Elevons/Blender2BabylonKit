import type { Scene, TransformNode } from "@babylonjs/core";
import { Entity } from "../core/Entity";
import type { CollisionContact } from "../core/types";
import type { PrefabSpawner } from "../core/spawnTypes";
import type { InputActionMap } from "../input/InputActionMap";

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

  /**
   * Runtime prefab spawning: duplicate any in-level entity subtree with full
   * components and fresh GUIDs (`await this.spawner.Spawn(templateEntity,
   * { position })`). The narrow PrefabSpawner surface — behaviors never
   * receive the full Level.
   */
  spawner!: PrefabSpawner;

  /**
   * Find every entity in the level that carries the given tag
   * (`this.byTag("Enemy")`). Tags are authored as TAG components in Blender.
   */
  byTag!: (tag: string) => Entity[];

  /**
   * The scene's default Action Map, injected when the script has no @inputMap
   * fields. Set in Blender's Input Actions panel ("Scene Default").
   */
  input?: InputActionMap;

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

  /**
   * Run when another entity (or an Event Message authored in Blender) sends this
   * entity a message via Entity.SendMessage(message, source).
   */
  OnMessage(message: string, source: Entity): void {}

  /** Run when a solid collider on this entity first contacts another entity. */
  OnCollisionEnter(other: Entity, contact: CollisionContact): void {}

  /** Run while a solid collider on this entity remains in contact (Havok CONTINUED). */
  OnCollisionStay(other: Entity, contact: CollisionContact): void {}

  /** Run when a solid collider on this entity stops contacting another entity. */
  OnCollisionExit(other: Entity): void {}

  /** Run when a trigger collider on this entity is first overlapped by another entity. */
  OnTriggerEnter(other: Entity): void {}

  /** Run when a trigger collider on this entity stops overlapping another entity. */
  OnTriggerExit(other: Entity): void {}
}
