import type { Node, Scene } from "@babylonjs/core";
import { Entity } from "../../Entity";
import type { EntityData } from "../../types";
import type { Level } from "../../Level";
import type { SpawnHandle, SpawnOptions } from "../../spawnTypes";
import { ApplyEntityComponents } from "../componentRegistry";
import { ResolveObjectReferences } from "../entityBuilder";
import type { LoadContext } from "../context";
import { CreateCameraTargetSets } from "../../../subsystems/cameras";
import { FinalizeSpawn } from "../finalizeSpawn";
import {
  CloneAnimationGroupsForSpawn,
  IsolateSharedSpawnSkeletons,
  ResetCloneSkeletonsToRest,
} from "../../../subsystems/animation";
import {
  ApplySpawnTransform,
  BuildSpawnGuidRemap,
  CloneSpawnHierarchy,
  CollectTemplateEntities,
  RegisterSpawnedEntities,
} from "./clone";
import { ProcessSpawnedCameras } from "./cameras";

/**
 * The runtime prefab-spawn pipeline: duplicate a loaded entity subtree (the
 * template) with fresh GUIDs and replay the load pipeline on the clone —
 * node hierarchy, Entity registration, components (physics, scripts, audio…),
 * reference resolution, and a finalize pass (constraints, layers, collision
 * events, OnStart). This is engine work because a template is *many* entities
 * cross-referencing each other by GUID; `node.clone()` alone produces dead
 * scenery.
 *
 * Parenting (`SpawnOptions.parent`):
 * - omitted → clone under the template root's current parent (usual prefab case);
 * - `Entity` → clone under that entity; spawn transform is parent-local;
 * - `null` → clone at scene root; spawn transform is world space (e.g. scatter
 *   spawns that must not follow a moving template parent).
 */

/** A minimal LoadContext for one spawn batch, sharing the level's live state. */
function CreateSpawnContext(level: Level, scene: Scene): LoadContext
{
  const componentHost = level.componentHost;

  return {
    level,
    componentHost,
    baseUrl: componentHost.baseUrl,
    idIndex: new Map(),
    pendingReferences: [],
    shadowLights: [],
    animatedEntities: [],
    cameraTargets: CreateCameraTargetSets(),
    audioTasks: [],
    guiTasks: [],
    particleTasks: [],
    msdfTextTasks: [],
    eventMessageRegistrations: componentHost.eventMessageRegistrations,
    constraintRegistrations: [],
    reflectionProbeRegistrations: [],
    lodRegistrations: [],
    gui3dRegistrations: [],
    physicsShapesByEntity: componentHost.physicsShapesByEntity,
    defaultInputMap: componentHost.defaultInputMap,
  };
}

/** Isolate shared glTF skeletons and reset clone bind poses before components run. */
function PrepareSpawnSkeletons(nodePairs: Map<Node, Node>, spawnIndex: number): void
{
  IsolateSharedSpawnSkeletons(nodePairs, spawnIndex);
  ResetCloneSkeletonsToRest(nodePairs);
}

/** Apply every component through the same registry the loader uses. */
function ApplySpawnComponents(
  level: Level,
  scene: Scene,
  spawnContext: LoadContext,
  spawnedEntities: Entity[],
  spawnedRows: EntityData[]
): void
{
  for (let index = 0; index < spawnedEntities.length; index++)
  {
    spawnContext.pendingReferences.push(
      ...ApplyEntityComponents({
        entity: spawnedEntities[index],
        entityData: spawnedRows[index],
        scene,
        behaviorRegistry: level.componentHost.behaviorRegistry,
        context: spawnContext,
      })
    );
  }
}

/**
 * Duplicate one loaded template subtree: clone nodes, remap GUIDs, register
 * entities, apply components through the registry, resolve references, and
 * finalize (constraints, layers, collision events, OnStart). Called by
 * Level.Spawn — not part of the public API surface.
 */
export async function SpawnFromTemplate(
  level: Level,
  scene: Scene,
  template: Entity,
  options: SpawnOptions
): Promise<SpawnHandle>
{
  if (options.keepTemplate !== true)
  {
    await level.HideTemplate(template);
  }

  const templateEntities = CollectTemplateEntities(template, level);

  const { clonedRoot, nodePairs, spawnIndex } = CloneSpawnHierarchy(template, options);
  PrepareSpawnSkeletons(nodePairs, spawnIndex);

  const { guidMap, remapGuid } = BuildSpawnGuidRemap(templateEntities);
  ApplySpawnTransform(scene, clonedRoot, options);

  const { spawnedEntities, spawnedRows } = RegisterSpawnedEntities(
    level,
    scene,
    template,
    templateEntities,
    nodePairs,
    remapGuid,
    options
  );

  const spawnContext = CreateSpawnContext(level, scene);
  ApplySpawnComponents(level, scene, spawnContext, spawnedEntities, spawnedRows);

  const builtCameras = ProcessSpawnedCameras(scene, spawnedEntities, spawnedRows, spawnContext);

  ResolveObjectReferences(spawnContext.pendingReferences, level);

  CloneAnimationGroupsForSpawn(scene, template.node, nodePairs, spawnIndex);

  await FinalizeSpawn(scene, level, spawnContext, spawnedEntities, spawnedRows, {
    deferShadowRefresh: options.deferShadowRefresh === true,
  });

  return {
    rootEntity: spawnedEntities[0],
    entities: spawnedEntities,
    guidMap,
    cameras: builtCameras,
  };
}
