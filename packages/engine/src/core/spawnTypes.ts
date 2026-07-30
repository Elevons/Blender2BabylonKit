import type { Camera, Vector3, Quaternion } from "@babylonjs/core";
import type { Entity } from "./Entity";

/**
 * Runtime prefab-spawn contracts. A "template" is any loaded entity subtree in
 * the level (a linked/appended collection flattened at export, or an in-scene
 * object hierarchy) — Spawn duplicates it with fresh GUIDs and the full
 * component pipeline. See core/loader/prefabSpawn/ for the pipeline itself.
 */

/** Transform and parenting applied to the spawned instance's root node. */
export interface SpawnOptions
{
  /**
   * Root position. Parent-local when `parent` is an `Entity`, or when `parent`
   * is omitted (relative to the template root's parent). World space when
   * `parent` is `null`.
   */
  position?: Vector3;
  /**
   * Root orientation (quaternion). Same space rule as `position` — parent-local
   * when `parent` is omitted or an `Entity`; world when `parent` is `null`.
   */
  rotationQuaternion?: Quaternion;
  /** Root scaling (replaces the template root's scaling when set). Applied before the clone is revealed — pass the final scale up front (e.g. zero for grow-in spawns). */
  scaling?: Vector3;
  /**
   * Where to parent the spawned instance root.
   * - **`undefined`** (default) — same parent as the template's root node.
   * - **`Entity`** — parent under that entity's node (`position` / rotation are
   *   in that parent's local space).
   * - **`null`** — scene root (no parent); `position` / rotation are world space.
   */
  parent?: Entity | null;
  /**
   * Register spawned meshes on shadow generators but defer
   * `FlushSpawnShadowRefresh()` until the caller finishes a multi-spawn batch.
   */
  deferShadowRefresh?: boolean;
  /**
   * When true, leave the template visible and its live components running.
   * Default: Spawn hides the template immediately when the call starts (before
   * the clone is built). Fields marked `@exposed({ spawnTemplate: true })` hide
   * at level load instead — before any OnStart.
   */
  keepTemplate?: boolean;
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
   * Re-render frozen shadow maps once after one or more spawns that used
   * `deferShadowRefresh`. Safe to call when nothing is pending.
   */
  FlushSpawnShadowRefresh(): void;
  /**
   * Hide an in-scene template and tear down its live components (physics,
   * scripts, audio, constraints, …) so only spawned clones remain active.
   * Spawn still works afterward — it rebuilds from retained EntityData, not
   * from the template's live attachments.
   */
  HideTemplate(template: Entity | string): Promise<void>;
}
