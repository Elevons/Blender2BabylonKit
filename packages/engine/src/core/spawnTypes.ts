import type { Camera, Vector3, Quaternion } from "@babylonjs/core";
import type { Entity } from "./Entity";

/**
 * Runtime prefab-spawn contracts. A "template" is any loaded entity subtree in
 * the level (a linked/appended collection flattened at export, or an in-scene
 * object hierarchy) — Spawn duplicates it with fresh GUIDs and the full
 * component pipeline. See core/loader/prefabSpawn.ts for the pipeline itself.
 */

/** Transform and parenting applied to the spawned instance's root node. */
export interface SpawnOptions {
  /** Root position in the parent's space (world space when no parent). */
  position?: Vector3;
  /** Root orientation in the parent's space. */
  rotationQuaternion?: Quaternion;
  /** Root scaling (replaces the template root's scaling when set). */
  scaling?: Vector3;
  /** Entity to parent the instance under; defaults to the template root's parent. */
  parent?: Entity;
}

/** The result of one Spawn call: the created entities and the GUID remap used. */
export interface SpawnHandle {
  /** The entity duplicating the template root. */
  rootEntity: Entity;
  /** Every entity created for this instance (root first, then descendants). */
  entities: readonly Entity[];
  /** templateGuid → runtimeGuid for every entity in the spawned subtree. */
  guidMap: ReadonlyMap<string, string>;
  /**
   * Cameras built for the instance's camera entities (typed CAMERA overrides
   * applied). Spawn never activates them — set `scene.activeCamera` yourself.
   */
  cameras: readonly Camera[];
}

/**
 * The narrow spawn interface injected onto behaviors (`behavior.spawner`).
 * Behaviors never receive the full Level; this is the only surface they get.
 * `template` accepts an Entity or an entity GUID — later prefab-asset ids will
 * flow through the same signature without breaking callers.
 */
export interface PrefabSpawner {
  Spawn(template: Entity | string, options?: SpawnOptions): Promise<SpawnHandle>;
  /**
   * Hide an in-scene template and tear down its live components (physics,
   * scripts, audio, constraints, …) so only spawned clones remain active.
   * Spawn still works afterward — it rebuilds from retained EntityData, not
   * from the template's live attachments.
   */
  HideTemplate(template: Entity | string): Promise<void>;
}
