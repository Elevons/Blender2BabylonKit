import type { Scene, TransformNode } from "@babylonjs/core";
import { Entity } from "../Entity";
import type {
  EntityData,
  CameraComponent,
  LightInfo,
  CameraInfo,
} from "../types";
import type { Level } from "../Level";
import type { BehaviorRegistry } from "../../scripting/BehaviorRegistry";
import type { PendingRef } from "../../scripting/exposed";
import { ApplyBlenderLight } from "../../subsystems/lights";
import { ApplyBlenderCamera, BuildTypedCamera, QueueCameraTargets } from "../../subsystems/cameras";
import { FindNodeByName, HideEntityNode } from "./nodeResolution";
import { ApplyEntityComponents } from "./componentRegistry";
import type { LoadContext } from "./context";

/**
 * The per-entity build pass: resolve each manifest entity to its glTF node,
 * create the Entity, apply its components through the component registry
 * (componentRegistry.ts), and apply auto-derived lights/cameras. Anything that
 * needs every entity to exist first is queued on the LoadContext for a post-pass.
 */

/** Apply a Blender lamp's settings and remember it if it casts shadows. */
function ProcessLightForEntity(
  node: TransformNode,
  lightInfo: LightInfo,
  scene: Scene,
  context: LoadContext
): void
{
  const light = ApplyBlenderLight(scene, node, lightInfo);
  if (light !== null && lightInfo.castShadows && light.isEnabled())
  {
    context.shadowLights.push({
      light,
      settings: lightInfo.shadow,
      sunAngle: lightInfo.type === "SUN" ? lightInfo.sunAngle : undefined,
    });
  }
}

/** Apply a Blender camera, optionally override its type, and track its target. */
function ProcessCameraForEntity(
  entity: Entity,
  entityData: EntityData,
  scene: Scene,
  context: LoadContext
): void
{
  const node = entity.node;
  const cameraInfo = entityData.camera as CameraInfo;
  let camera = ApplyBlenderCamera(scene, node, cameraInfo);

  const cameraComponent = entityData.components.find(
    (component) => component.type === "CAMERA"
  ) as CameraComponent | undefined;

  if (camera !== null && cameraComponent !== undefined)
  {
    const built = BuildTypedCamera(scene, camera, cameraComponent);
    camera = built.camera;
    QueueCameraTargets(built, cameraComponent, context.cameraTargets, entity.id);
  }

  if (camera !== null && cameraInfo.active)
  {
    scene.activeCamera = camera;
    context.level.activeCamera = camera;
  }
}

/** Build one entity from its manifest record and apply everything attached. */
export function ProcessEntity(
  entityData: EntityData,
  scene: Scene,
  registry: BehaviorRegistry,
  context: LoadContext
): void
{
  const resolvedNode =
    (entityData.id.length > 0 ? context.idIndex.get(entityData.id) : undefined) ??
    FindNodeByName(scene, entityData.name);

  if (resolvedNode === null || resolvedNode === undefined)
  {
    console.warn(
      `[bjs] could not resolve entity "${entityData.name}" ` +
      `(id=${entityData.id.length > 0 ? entityData.id : "none"}) to a glTF node - skipping`
    );
    return;
  }

  const entityKey = entityData.id.length > 0 ? entityData.id : entityData.name;
  const entity = new Entity(entityData.id, entityData.name, resolvedNode);
  context.level.entities.set(entityKey, entity);
  resolvedNode.metadata = { ...(resolvedNode.metadata ?? {}), bjsEntity: entity };

  if (entityData.visible === false)
  {
    HideEntityNode(scene, resolvedNode);
  }

  context.pendingReferences.push(
    ...ApplyEntityComponents({ entity, entityData, scene, behaviorRegistry: registry, context })
  );

  if (entityData.animation !== undefined)
  {
    context.animatedEntities.push({ entity, info: entityData.animation });
  }

  if (entityData.light !== undefined)
  {
    ProcessLightForEntity(resolvedNode, entityData.light, scene, context);
  }

  if (entityData.camera !== undefined)
  {
    ProcessCameraForEntity(entity, entityData, scene, context);
  }
}

/**
 * Resolve deferred entity references (entity-typed @exposed fields stored as
 * GUIDs) now that every entity exists. Scalar fields are assigned directly;
 * entity-list fields are assigned into their array slot by index.
 */
export function ResolveObjectReferences(pendingReferences: PendingRef[], level: Level): void
{
  for (const reference of pendingReferences)
  {
    const target = level.ById(reference.guid) ?? null;
    if (target === null)
    {
      console.warn(`[bjs] object reference "${reference.field}" -> ${reference.guid} not found`);
    }

    const instance = reference.instance as Record<string, unknown>;
    if (reference.index === undefined)
    {
      instance[reference.field] = target;
    }
    else
    {
      const slot = instance[reference.field];
      if (Array.isArray(slot))
      {
        slot[reference.index] = target;
      }
    }
  }
}
