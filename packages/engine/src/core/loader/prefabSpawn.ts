import { AbstractMesh, FreeCamera, Light, TransformNode, Vector3 } from "@babylonjs/core";
import type { Camera, Scene, Node } from "@babylonjs/core";
import { Entity } from "../Entity";
import { ID_KEY, type CameraComponent, type Component, type EntityData } from "../types";
import type { Level } from "../Level";
import type { SpawnOptions, SpawnHandle } from "../spawnTypes";
import { RemapEntityData } from "../guidFields";
import { ApplyEntityComponents } from "./componentRegistry";
import { ResolveObjectReferences } from "./entityBuilder";
import { HideEntityNode } from "./nodeResolution";
import type { LoadContext } from "./context";
import {
  ApplyBlenderCamera,
  BuildTypedCamera,
  CreateCameraTargetSets,
  FindCameraForNode,
  QueueCameraTargets,
} from "../../subsystems/cameras";
import { FinalizeSpawn } from "./finalizeSpawn";

/**
 * The runtime prefab-spawn pipeline: duplicate a loaded entity subtree (the
 * template) with fresh GUIDs and replay the load pipeline on the clone —
 * node hierarchy, Entity registration, components (physics, scripts, audio…),
 * reference resolution, and a finalize pass (constraints, layers, collision
 * events, OnStart). This is engine work because a template is *many* entities
 * cross-referencing each other by GUID; `node.clone()` alone produces dead
 * scenery.
 */

/** Components a spawned instance cannot host in v1 — stripped with a warning. */
const UNSUPPORTED_SPAWN_COMPONENTS: ReadonlySet<Component["type"]> = new Set([
  "REFLECTION_PROBE",
]);

let spawnCounter = 0;

/** A fresh runtime GUID for one spawned entity. */
function GenerateRuntimeGuid(): string
{
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
  {
    return crypto.randomUUID();
  }
  return `spawn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The template root plus every descendant entity registered in the level. */
function CollectTemplateEntities(template: Entity, level: Level): Entity[]
{
  const entities: Entity[] = [template];

  for (const descendant of template.node.getDescendants(false))
  {
    const metadata = (descendant as TransformNode).metadata as
      { bjsEntity?: Entity } | undefined;
    const entity = metadata?.bjsEntity;
    if (entity instanceof Entity && entity !== template && level.ById(entity.id) === entity)
    {
      entities.push(entity);
    }
  }

  return entities;
}

/**
 * Direct children Babylon's deep clone will have duplicated — everything with
 * a `clone` method (transform nodes, meshes, instances, lights, cameras), in
 * the same order clone creation appends them.
 */
function CloneableChildren(node: Node): Node[]
{
  return node
    .getDescendants(true)
    .filter((child) => typeof (child as { clone?: unknown }).clone === "function");
}

/**
 * Pair each template node with its clone by walking both hierarchies in
 * lockstep. Babylon's deep clone recreates children in source order, so the
 * index-parallel walk is stable; a count mismatch is warned because unpaired
 * entity nodes would keep the template's metadata (and resolve to the wrong
 * Entity in collision callbacks).
 */
function BuildNodePairs(
  templateNode: Node,
  cloneNode: Node,
  pairs: Map<Node, Node>
): void
{
  pairs.set(templateNode, cloneNode);

  const templateChildren = CloneableChildren(templateNode);
  const cloneChildren = cloneNode.getDescendants(true);

  if (templateChildren.length !== cloneChildren.length)
  {
    console.warn(
      `[bjs] Spawn: clone of "${templateNode.name}" has ${cloneChildren.length} ` +
      `children but the template has ${templateChildren.length} cloneable ones — ` +
      `some spawned nodes may not be tracked`
    );
  }

  const pairCount = Math.min(templateChildren.length, cloneChildren.length);
  for (let index = 0; index < pairCount; index++)
  {
    BuildNodePairs(templateChildren[index], cloneChildren[index], pairs);
  }
}

/**
 * Give one cloned entity node its own metadata carrying the fresh GUID.
 * Babylon clones share `metadata` by reference, so without this the clone
 * would still advertise the template's GUID (and later its Entity).
 */
function StampCloneMetadata(clonedNode: TransformNode, templateNode: TransformNode, newGuid: string): void
{
  const templateMetadata = (templateNode.metadata ?? {}) as Record<string, unknown>;
  const templateGltf = (templateMetadata.gltf ?? {}) as Record<string, unknown>;
  const templateExtras = (templateGltf.extras ?? {}) as Record<string, unknown>;

  clonedNode.metadata = {
    ...templateMetadata,
    bjsEntity: undefined,
    gltf: {
      ...templateGltf,
      extras: { ...templateExtras, [ID_KEY]: newGuid },
    },
  };
}

/** Re-enable and un-hide the cloned subtree (templates usually live hidden). */
function RevealClonedHierarchy(clonedRoot: TransformNode): void
{
  clonedRoot.setEnabled(true);

  if (clonedRoot instanceof AbstractMesh)
  {
    clonedRoot.isVisible = true;
  }

  for (const descendant of clonedRoot.getDescendants(false))
  {
    if (descendant instanceof AbstractMesh)
    {
      descendant.isVisible = true;
    }
    else if (descendant instanceof Light)
    {
      descendant.setEnabled(true);
    }
  }
}

/** Strip components Spawn cannot replicate yet, warning once per type. */
function FilterSupportedComponents(entityData: EntityData, templateName: string): void
{
  const removed = new Set<Component["type"]>();

  entityData.components = entityData.components.filter((component) =>
  {
    if (UNSUPPORTED_SPAWN_COMPONENTS.has(component.type))
    {
      removed.add(component.type);
      return false;
    }
    return true;
  });

  for (const componentType of removed)
  {
    console.warn(
      `[bjs] Spawn "${templateName}": ${componentType} components are not ` +
      `supported on spawned instances — skipped`
    );
  }
}

/**
 * Recreate the faithful glb FreeCamera on a cloned camera entity. Needed when
 * the template carried a typed CAMERA override: BuildTypedCamera disposed the
 * template's faithful camera at load, so the clone has no camera leaf. The
 * orientation-correction TransformNode chain the camera hung from DID clone,
 * so a fresh camera at the end of that chain reproduces the exact placement.
 */
function RebuildFaithfulCamera(scene: Scene, clonedNode: TransformNode): void
{
  // Walk down while there is exactly one non-entity, non-mesh transform child —
  // that is the glTF orientation-correction chain (pure rotation nodes).
  let chainEnd: TransformNode = clonedNode;
  for (;;)
  {
    const chainCandidates = chainEnd
      .getChildren(undefined, true)
      .filter((child) =>
        child instanceof TransformNode &&
        !(child instanceof AbstractMesh) &&
        (child.metadata as { bjsEntity?: Entity } | undefined)?.bjsEntity === undefined
      ) as TransformNode[];

    if (chainCandidates.length !== 1)
    {
      break;
    }
    chainEnd = chainCandidates[0];
  }

  const rebuiltCamera = new FreeCamera(`${clonedNode.name}_camera`, Vector3.Zero(), scene, false);
  rebuiltCamera.parent = chainEnd;
  // glTF cameras look towards local -Z — the same correction the glTF loader
  // applies to every imported camera.
  rebuiltCamera.setTarget(new Vector3(0, 0, -1));
}

/**
 * Apply camera data to spawned camera entities: configure the cloned faithful
 * FreeCamera (rebuilding it when the template's was consumed by a typed
 * override at load), then build the typed CAMERA override and queue its
 * target bindings (target GUIDs were already remapped onto this instance).
 * Spawned cameras are never made active — callers pick from SpawnHandle.cameras.
 */
function ProcessSpawnedCameras(
  scene: Scene,
  spawnedEntities: Entity[],
  spawnedRows: EntityData[],
  spawnContext: LoadContext
): Camera[]
{
  const builtCameras: Camera[] = [];

  for (let index = 0; index < spawnedEntities.length; index++)
  {
    const spawnedRow = spawnedRows[index];
    if (spawnedRow.camera === undefined)
    {
      continue;
    }

    const spawnedEntity = spawnedEntities[index];
    const clonedNode = spawnedEntity.node;

    if (FindCameraForNode(scene, clonedNode) === null)
    {
      RebuildFaithfulCamera(scene, clonedNode);
    }

    let camera = ApplyBlenderCamera(scene, clonedNode, spawnedRow.camera);

    const cameraComponent = spawnedRow.components.find(
      (component) => component.type === "CAMERA"
    ) as CameraComponent | undefined;

    if (camera !== null && cameraComponent !== undefined)
    {
      const built = BuildTypedCamera(scene, camera, cameraComponent);
      camera = built.camera;
      QueueCameraTargets(built, cameraComponent, spawnContext.cameraTargets, spawnedEntity.id);
    }

    if (camera !== null)
    {
      builtCameras.push(camera);
    }
  }

  return builtCameras;
}

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
  const spawnIndex = spawnCounter++;
  const templateEntities = CollectTemplateEntities(template, level);

  // 1. Clone the node hierarchy under the requested (or original) parent.
  const parentNode = options.parent !== undefined
    ? options.parent.node
    : (template.node.parent as TransformNode | null);
  const clonedRoot = template.node.clone(
    `${template.name}_spawn${spawnIndex}`,
    parentNode
  ) as TransformNode | null;

  if (clonedRoot === null)
  {
    throw new Error(`[bjs] Spawn: could not clone template node "${template.name}"`);
  }

  const nodePairs = new Map<Node, Node>();
  BuildNodePairs(template.node, clonedRoot, nodePairs);

  // 2. Fresh GUID per template entity; refs leaving the subtree keep theirs.
  const guidMap = new Map<string, string>();
  for (const templateEntity of templateEntities)
  {
    guidMap.set(templateEntity.id, GenerateRuntimeGuid());
  }
  const remapGuid = (guid: string): string => guidMap.get(guid) ?? guid;

  // 3. Apply the spawn transform before physics reads world matrices.
  RevealClonedHierarchy(clonedRoot);
  if (options.position !== undefined)
  {
    clonedRoot.position.copyFrom(options.position);
  }
  if (options.rotationQuaternion !== undefined)
  {
    clonedRoot.rotationQuaternion = options.rotationQuaternion.clone();
  }
  if (options.scaling !== undefined)
  {
    clonedRoot.scaling.copyFrom(options.scaling);
  }
  clonedRoot.computeWorldMatrix(true);

  // 4. Build remapped manifest rows and register the spawned entities, so every
  //    entity exists before any component (constraints, script refs) needs one.
  const spawnedEntities: Entity[] = [];
  const spawnedRows: EntityData[] = [];
  const spawnedNodes: TransformNode[] = [];

  for (const templateEntity of templateEntities)
  {
    const clonedNode = nodePairs.get(templateEntity.node) as TransformNode | undefined;
    if (clonedNode === undefined)
    {
      console.warn(
        `[bjs] Spawn "${template.name}": no cloned node for entity ` +
        `"${templateEntity.name}" — skipping it`
      );
      continue;
    }

    const templateRow: EntityData = level.entityData.get(templateEntity.id) ?? {
      id: templateEntity.id,
      name: templateEntity.name,
      parent: null,
      components: [],
    };

    const spawnedRow = RemapEntityData(templateRow, remapGuid);
    spawnedRow.name = clonedNode.name;
    FilterSupportedComponents(spawnedRow, template.name);

    const isRoot = templateEntity === template;
    if (isRoot)
    {
      // The instance must be live even when the template row was hidden, and
      // its manifest parent is wherever the caller placed it.
      delete spawnedRow.visible;
      spawnedRow.parent = options.parent !== undefined ? options.parent.id : spawnedRow.parent;
    }

    const newGuid = spawnedRow.id;
    StampCloneMetadata(clonedNode, templateEntity.node, newGuid);

    const spawnedEntity = new Entity(newGuid, spawnedRow.name, clonedNode);
    level.entities.set(newGuid, spawnedEntity);
    level.entityData.set(newGuid, spawnedRow);
    clonedNode.metadata = { ...(clonedNode.metadata ?? {}), bjsEntity: spawnedEntity };

    if (!isRoot && spawnedRow.visible === false)
    {
      HideEntityNode(scene, clonedNode);
    }

    spawnedEntities.push(spawnedEntity);
    spawnedRows.push(spawnedRow);
    spawnedNodes.push(clonedNode);
  }

  if (spawnedEntities.length === 0)
  {
    throw new Error(`[bjs] Spawn: template "${template.name}" produced no entities`);
  }

  // 5. Apply every component through the same registry the loader uses.
  const spawnContext = CreateSpawnContext(level, scene);

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

  // 6. Cameras: configure/rebuild the cloned faithful camera per camera entity,
  //    build typed overrides, and queue target bindings for the finalize pass.
  const builtCameras = ProcessSpawnedCameras(scene, spawnedEntities, spawnedRows, spawnContext);

  // 7. Remapped internal refs resolve to this instance; external refs to the level.
  ResolveObjectReferences(spawnContext.pendingReferences, level);

  await FinalizeSpawn(scene, level, spawnContext, spawnedEntities, spawnedRows);

  return {
    rootEntity: spawnedEntities[0],
    entities: spawnedEntities,
    guidMap,
    cameras: builtCameras,
  };
}
