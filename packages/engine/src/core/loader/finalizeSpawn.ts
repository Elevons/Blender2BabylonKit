import { AbstractMesh } from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";
import { GUI3DManager } from "@babylonjs/gui";
import type { Entity } from "../Entity";
import type { EntityData } from "../types";
import type { Level } from "../Level";
import type { LoadContext } from "./context";
import { ResolveCameraTargets } from "../../subsystems/cameras";
import { BuildConstraints } from "../../subsystems/constraints";
import { BuildLodLevels } from "../../subsystems/lod";
import { RegisterSpawnedShadowMeshes } from "../../subsystems/shadows";
import { ApplyMeshShadows } from "../../subsystems/shadows/meshShadows";
import { ApplyRenderLayers } from "../../subsystems/renderLayers";
import { ApplyCollisionLayers } from "../../subsystems/collisions";
import { ApplyGui3DRegistration } from "../../ui/gui3d/builder";
import {
  FlushGlobalRefresh,
  type GlobalRefreshFlag,
} from "../componentGlobalRefresh";
import { ApplySpawnAnimations } from "../../subsystems/animation";

/**
 * Everything after a spawn batch's entity/component pass — the spawn-scoped
 * mirror of LevelLoader.FinalizeLevel: settle async assets, build constraints
 * (both bodies now exist), wire 3D GUI, apply render/collision layers, refresh
 * collision callbacks, and run OnStart on the new behaviors (the level has
 * already begun by the time any Spawn resolves).
 */

/** Await a batch of asset-load promises, logging any that rejected. */
async function SettleSpawnTasks(tasks: Promise<unknown>[], label: string): Promise<void>
{
  const results = await Promise.allSettled(tasks);
  for (const result of results)
  {
    if (result.status === "rejected")
    {
      console.warn(`[bjs] spawned ${label} failed to load:`, result.reason);
    }
  }
}

/** Which global managers must re-wire after this batch's attachments landed. */
function CollectRefreshFlags(
  spawnedEntities: Entity[],
  spawnedRows: EntityData[]
): Set<GlobalRefreshFlag>
{
  const flags = new Set<GlobalRefreshFlag>();

  for (const entity of spawnedEntities)
  {
    if (entity.body !== undefined)
    {
      flags.add("collisionCallbacks");
      break;
    }
  }

  for (const row of spawnedRows)
  {
    for (const component of row.components)
    {
      if (component.type === "PARTICLE")
      {
        flags.add("particleEmitters");
      }
      else if (component.type === "MSDF_TEXT")
      {
        flags.add("msdfRendering");
      }
    }
  }

  return flags;
}

/** Every mesh in the spawned subtree, including the root when it carries geometry. */
function CollectSpawnedMeshes(rootEntity: Entity): AbstractMesh[]
{
  const rootNode = rootEntity.node;
  const meshes = rootNode.getChildMeshes(false);

  if (rootNode instanceof AbstractMesh)
  {
    meshes.unshift(rootNode);
  }

  return meshes;
}

/** Options that tune finalize behavior for one spawn call. */
export interface SpawnFinalizeOptions
{
  /** When true, register casters but leave `FlushSpawnShadowRefresh` to the caller. */
  deferShadowRefresh?: boolean;
}

/** Finalize one spawn batch. See the module doc for the pass order. */
export async function FinalizeSpawn(
  scene: Scene,
  level: Level,
  spawnContext: LoadContext,
  spawnedEntities: Entity[],
  spawnedRows: EntityData[],
  finalizeOptions: SpawnFinalizeOptions = {}
): Promise<void>
{
  // Asset-backed components load in parallel during the entity loop; settle
  // them before OnStart so behaviors can rely on sounds/GUI/particles existing.
  await SettleSpawnTasks(spawnContext.audioTasks, "sound");
  await SettleSpawnTasks(spawnContext.guiTasks, "GUI");
  await SettleSpawnTasks(spawnContext.particleTasks, "particle system");
  await SettleSpawnTasks(spawnContext.msdfTextTasks, "MSDF text");

  // Constraints only after every batch entity (and its body) is registered.
  const builtConstraints = BuildConstraints(
    scene,
    level,
    spawnContext.constraintRegistrations
  );
  level.constraints.push(...builtConstraints);

  // LOD after every batch entity exists: internal target GUIDs were remapped
  // by guidFields, so they resolve to this instance's cloned mesh entities.
  // Targets outside the subtree keep their original GUIDs — Babylon warns if
  // that shared mesh is already an LOD level of the template, so authors
  // should keep LOD target meshes inside the template hierarchy.
  BuildLodLevels(spawnContext.lodRegistrations, (guid) => level.ById(guid));

  // Camera targets (FOLLOW lockedTarget, ARC pivot, OFFSET chase) — remapped
  // GUIDs resolve to this instance's entities, so each spawned camera follows
  // its own instance, not the template.
  ResolveCameraTargets(level, spawnContext.cameraTargets);

  if (spawnContext.gui3dRegistrations.length > 0)
  {
    if (level.gui3DManager === undefined)
    {
      level.gui3DManager = new GUI3DManager(scene);
    }
    for (const registration of spawnContext.gui3dRegistrations)
    {
      ApplyGui3DRegistration(
        registration,
        level.gui3DManager,
        level.componentHost.panelsByEntity,
        level,
        spawnContext.baseUrl
      );
    }
  }

  // Shadows: SetupShadows registered casters/receivers once at load, so cloned
  // meshes must be added to the existing generators here. Ray-visibility Shadow
  // (bjs_cast_shadows extras) survives the clone and is respected; frozen maps
  // re-render once so the new casters appear (immediately or via batch flush).
  if (level.shadowGenerators.length > 0)
  {
    const spawnedMeshes = CollectSpawnedMeshes(spawnedEntities[0]);

    if (finalizeOptions.deferShadowRefresh === true)
    {
      level.QueueSpawnShadowMeshes(spawnedMeshes);
    }
    else
    {
      const addedCasters = RegisterSpawnedShadowMeshes(
        level.shadowGenerators,
        spawnedMeshes
      );
      if (addedCasters > 0)
      {
        level.RefreshShadows();
      }
    }
  }

  // Layer walks over just this batch's manifest rows.
  ApplyRenderLayers({ entities: spawnedRows }, level);
  ApplyMeshShadows({ entities: spawnedRows }, level, level.shadowGenerators);
  if (level.collisionLayers !== undefined)
  {
    ApplyCollisionLayers(
      { scene: { collisionLayers: level.collisionLayers }, entities: spawnedRows },
      level,
      spawnContext.physicsShapesByEntity
    );
  }

  const refreshFlags = CollectRefreshFlags(spawnedEntities, spawnedRows);
  if (spawnContext.eventMessageRegistrations.some((registration) =>
    spawnedEntities.includes(registration.sourceEntity)))
  {
    refreshFlags.add("collisionCallbacks");
  }
  if (refreshFlags.size > 0)
  {
    FlushGlobalRefresh(
      scene,
      level,
      refreshFlags,
      spawnContext.eventMessageRegistrations
    );
  }

  ApplySpawnAnimations(scene, spawnedEntities, spawnedRows);

  // The level has begun by now — Spawn always resolves after Level.Begin —
  // so new behaviors get their OnStart here.
  for (const entity of spawnedEntities)
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

  if (level.postReady)
  {
    for (const entity of spawnedEntities)
    {
      level.RunPostReadyForEntity(entity);
    }
  }
}
