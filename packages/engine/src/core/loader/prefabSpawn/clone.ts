import { AbstractMesh, FreeCamera, TransformNode, Vector3 } from "@babylonjs/core";
import type { Node, Scene } from "@babylonjs/core";
import { Entity } from "../../Entity";
import { ID_KEY, type Component, type EntityData } from "../../types";
import type { Level } from "../../Level";
import type { SpawnOptions } from "../../spawnTypes";
import { RemapEntityData } from "../../guidFields";
import { HideEntityNode } from "../nodeResolution";
import { ApplyNodeSubtreeVisibility } from "../../entityActive";
import { AssignNodeEntity } from "../../bjsMetadata";

/** Components a spawned instance cannot host in v1 — stripped with a warning. */
export const UNSUPPORTED_SPAWN_COMPONENTS: ReadonlySet<Component["type"]> = new Set([
  "REFLECTION_PROBE",
]);

/** Result of cloning the template node hierarchy for one spawn batch. */
export interface SpawnCloneResult
{
  clonedRoot: TransformNode;
  nodePairs: Map<Node, Node>;
  spawnIndex: number;
}

/** GUID remap table for one spawn batch. */
export interface SpawnGuidRemap
{
  guidMap: Map<string, string>;
  remapGuid: (guid: string) => string;
}

/** Registered spawned entities and their remapped manifest rows. */
export interface SpawnRegistrationResult
{
  spawnedEntities: Entity[];
  spawnedRows: EntityData[];
}

let spawnCounter = 0;

/** A fresh runtime GUID for one spawned entity. */
export function GenerateRuntimeGuid(): string
{
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
  {
    return crypto.randomUUID();
  }
  return `spawn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The template root plus every descendant entity registered in the level. */
export function CollectTemplateEntities(template: Entity, level: Level): Entity[]
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
export function BuildNodePairs(
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
export function StampCloneMetadata(
  clonedNode: TransformNode,
  templateNode: TransformNode,
  newGuid: string
): void
{
  const templateMetadata = (templateNode.metadata ?? {}) as Record<string, unknown>;
  const { bjsEntity: _templateEntity, ...templateMetadataRest } = templateMetadata;
  const templateGltf = (templateMetadataRest.gltf ?? {}) as Record<string, unknown>;
  const templateExtras = (templateGltf.extras ?? {}) as Record<string, unknown>;

  clonedNode.metadata = {
    ...templateMetadataRest,
    gltf: {
      ...templateGltf,
      extras: { ...templateExtras, [ID_KEY]: newGuid },
    },
  };
}

/** Re-enable and un-hide the cloned subtree (templates usually live hidden). */
export function RevealClonedHierarchy(scene: Scene, clonedRoot: TransformNode): void
{
  ApplyNodeSubtreeVisibility(scene, clonedRoot, true);
}

/** Strip components Spawn cannot replicate yet, warning once per type. */
export function FilterSupportedComponents(entityData: EntityData, templateName: string): void
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

/** Clone the template hierarchy under the parent chosen by `SpawnOptions.parent`. */
export function CloneSpawnHierarchy(
  template: Entity,
  options: SpawnOptions
): SpawnCloneResult
{
  const spawnIndex = spawnCounter++;
  const parentNode = options.parent === undefined
    ? (template.node.parent as TransformNode | null)
    : (options.parent !== null ? options.parent.node : null);
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

  return { clonedRoot, nodePairs, spawnIndex };
}

/** Assign a fresh GUID to every entity in the template subtree. */
export function BuildSpawnGuidRemap(templateEntities: Entity[]): SpawnGuidRemap
{
  const guidMap = new Map<string, string>();
  for (const templateEntity of templateEntities)
  {
    guidMap.set(templateEntity.id, GenerateRuntimeGuid());
  }

  return {
    guidMap,
    remapGuid: (guid: string): string => guidMap.get(guid) ?? guid,
  };
}

/** Apply spawn transform on the hidden clone, then reveal before physics reads world matrices. */
export function ApplySpawnTransform(
  scene: Scene,
  clonedRoot: TransformNode,
  options: SpawnOptions
): void
{
  // position / rotationQuaternion are world space when parent: null, parent-local
  // when parent is an Entity, or relative to the template's parent when omitted.
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
  RevealClonedHierarchy(scene, clonedRoot);
}

/**
 * Build remapped manifest rows and register spawned entities so every entity
 * exists before components (constraints, script refs) need one.
 */
export function RegisterSpawnedEntities(
  level: Level,
  scene: Scene,
  template: Entity,
  templateEntities: Entity[],
  nodePairs: Map<Node, Node>,
  remapGuid: (guid: string) => string,
  options: SpawnOptions
): SpawnRegistrationResult
{
  const spawnedEntities: Entity[] = [];
  const spawnedRows: EntityData[] = [];

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
      delete spawnedRow.visible;
      spawnedRow.parent = options.parent === undefined
        ? spawnedRow.parent
        : (options.parent !== null ? options.parent.id : null);
    }

    const newGuid = spawnedRow.id;
    StampCloneMetadata(clonedNode, templateEntity.node, newGuid);

    const spawnedEntity = new Entity(newGuid, spawnedRow.name, clonedNode);
    level.entities.set(newGuid, spawnedEntity);
    level.entityData.set(newGuid, spawnedRow);
    AssignNodeEntity(clonedNode, spawnedEntity);

    if (!isRoot && spawnedRow.visible === false)
    {
      HideEntityNode(scene, clonedNode);
    }

    spawnedEntities.push(spawnedEntity);
    spawnedRows.push(spawnedRow);
  }

  if (spawnedEntities.length === 0)
  {
    throw new Error(`[bjs] Spawn: template "${template.name}" produced no entities`);
  }

  return { spawnedEntities, spawnedRows };
}
