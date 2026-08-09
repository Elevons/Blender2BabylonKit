import type { Scene, TransformNode } from "@babylonjs/core";
import { Entity } from "../core/Entity";
import type { CollisionContact } from "../core/types";
import type { GameClock } from "../core/GameClock";
import type { LevelSession } from "../core/levelSession";
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
   * { position, keepTemplate?, deferShadowRefresh? })`;
   * `FlushSpawnShadowRefresh()` after batched loops). Spawn hides the template
   * when the call starts unless `keepTemplate: true`; mark `@exposed`
   * entity fields with `spawnTemplate: true` to hide at level load (deferred
   * spawners). Narrow {@link PrefabSpawner} surface — not the full Level.
   */
  spawner!: PrefabSpawner;

  /**
   * Load / restart / unload the current level (`await this.session.Restart()`,
   * `await this.session.Load(url)`). Narrow {@link LevelSession} surface —
   * apps wire a LevelDirector (or another LevelSession) via LevelLoaderOptions.
   */
  session!: LevelSession;

  /**
   * Unified game clock (Unity's `Time`). `this.time.timeScale = 0` freezes
   * gameplay (behavior deltas, scene animations, physics); `deltaSeconds` /
   * `elapsedSeconds` are scaled, `unscaledDeltaSeconds` /
   * `unscaledElapsedSeconds` follow the wall clock (hitch-clamped) — use the
   * unscaled variants for menus and slow-motion ramps.
   */
  time!: GameClock;

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

  /**
   * Run once after NME materials compile and post-processing attach (when authored).
   * Fires after {@link OnStart} and the loader's late rendering pass —
   * use for `level.post` / DefaultRenderingPipeline work (zone LUT swaps, etc.).
   * Spawned or runtime-added scripts receive this immediately after {@link OnStart}
   * when the level is already post-ready.
   */
  OnPostReady(): void {}

  /** Run when the entity becomes effectively active in the hierarchy. */
  OnEnable(): void {}

  /** Run when the entity becomes effectively inactive in the hierarchy. */
  OnDisable(): void {}

  /** Run every frame; deltaSeconds is the time since the previous frame. */
  OnUpdate(deltaSeconds: number): void {}

  /**
   * Run once per physics step, immediately before Havok integrates it —
   * apply forces and repeated impulses here for frame-rate-independent
   * physics. With variable stepping (default) this is once per frame; with
   * fixed stepping (`this.time.fixedDeltaSeconds > 0`) it runs 0..N times
   * per frame with a constant step. `fixedDeltaSeconds` is the scaled game
   * time the step advances (0 while frozen). Never fires in levels without
   * physics. Do not read input edges here — `WasPressedThisFrame` is
   * frame-scoped and a fixed step can run 0 or 2 times in the edge's frame.
   */
  OnFixedUpdate(fixedDeltaSeconds: number): void {}

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
