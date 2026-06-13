import type { Scene, TransformNode } from "@babylonjs/core";
import { Entity } from "../Entity";
import type {
  EntityData,
  Component,
  ColliderComponent,
  RigidBodyComponent,
  ScriptComponent,
  CameraComponent,
  AudioComponent,
  ConstraintComponent,
  GuiComponent,
  ParticleComponent,
  Gui3DComponent,
  LightInfo,
  CameraInfo,
} from "../types";
import type { Level } from "../Level";
import type { BehaviorRegistry } from "../../scripting/BehaviorRegistry";
import { ApplyExposedVars, type PendingRef } from "../../scripting/exposed";
import { InputManager, GetInputMapFields } from "../../input";
import type { InputActionMap } from "../../input/InputActionMap";
import type { Behavior } from "../../scripting/Behavior";
import { BuildPhysics } from "../../subsystems/physics";
import { ApplyBlenderLight } from "../../subsystems/lights";
import { ApplyBlenderCamera, BuildTypedCamera, QueueCameraTargets } from "../../subsystems/cameras";
import { ApplyAudio } from "../../subsystems/audio";
import { ApplyGui } from "../../ui/gui2d";
import { ApplyParticles } from "../../subsystems/particles";
import { FindNodeByName } from "./nodeResolution";
import type { LoadContext } from "./context";

/**
 * The per-entity build pass: resolve each manifest entity to its glTF node,
 * create the Entity, interpret its components (physics, audio, triggers,
 * joints, scripts), and apply auto-derived lights/cameras. Anything that needs
 * every entity to exist first is queued on the LoadContext for a post-pass.
 */

/** An entity's components, sorted by kind for the apply steps. */
function ClassifyComponents(entity: Entity, components: Component[]): {
  collider: ColliderComponent | undefined;
  body: RigidBodyComponent | undefined;
  scripts: ScriptComponent[];
  audioComponents: AudioComponent[];
  constraintComponents: ConstraintComponent[];
  guiComponents: GuiComponent[];
  particleComponents: ParticleComponent[];
  gui3dComponents: Gui3DComponent[];
}
{
  let collider: ColliderComponent | undefined;
  let body: RigidBodyComponent | undefined;
  const scripts: ScriptComponent[] = [];
  const audioComponents: AudioComponent[] = [];
  const constraintComponents: ConstraintComponent[] = [];
  const guiComponents: GuiComponent[] = [];
  const particleComponents: ParticleComponent[] = [];
  const gui3dComponents: Gui3DComponent[] = [];

  for (const component of components)
  {
    switch (component.type)
    {
      case "TAG":
        entity.tag = component.tag; // tags are one field; applied right here
        break;
      case "COLLIDER":
        collider = component;
        break;
      case "RIGIDBODY":
        body = component;
        break;
      case "SCRIPT":
        scripts.push(component);
        break;
      case "AUDIO":
        audioComponents.push(component);
        break;
      case "CONSTRAINT":
        constraintComponents.push(component);
        break;
      case "GUI":
        guiComponents.push(component);
        break;
      case "PARTICLE":
        particleComponents.push(component);
        break;
      case "GUI3D_BUTTON":
      case "GUI3D_HOLO":
      case "GUI3D_TOUCH_HOLO":
      case "GUI3D_MESH":
      case "GUI3D_STACK":
      case "GUI3D_SPHERE":
      case "GUI3D_CYLINDER":
      case "GUI3D_PLANE":
      case "GUI3D_SCATTER":
        gui3dComponents.push(component);
        break;
    }
  }

  return {
    collider, body, scripts, audioComponents, constraintComponents,
    guiComponents, particleComponents, gui3dComponents,
  };
}

/** Resolve a map name; blank uses the scene default, then the asset's first map. */
function ResolveInputMap(mapName: string, sceneDefaultMap: string): InputActionMap | undefined
{
  const resolvedName = mapName.length > 0 ? mapName : sceneDefaultMap;
  return InputManager.GetMap(resolvedName) ?? InputManager.GetDefaultMap();
}

/**
 * Fill @inputMap fields with Action Map handles. Scripts with no @inputMap
 * fields receive the scene default map on `behavior.input`.
 */
function InjectInputMaps(behavior: object, scriptName: string, sceneDefaultMap: string): void
{
  const fields = GetInputMapFields(behavior);

  if (fields.length === 0)
  {
    const map = ResolveInputMap("", sceneDefaultMap);
    if (map === undefined)
    {
      console.warn(
        `[bjs] script "${scriptName}": no @inputMap and scene default map ` +
        `"${sceneDefaultMap}" not found — define it in Blender's Input Actions panel`
      );
      return;
    }
    (behavior as Behavior).input = map;
    return;
  }

  for (const entry of fields)
  {
    const map = ResolveInputMap(entry.map, sceneDefaultMap);
    if (map === undefined)
    {
      const label = entry.map.length > 0 ? entry.map : sceneDefaultMap;
      console.warn(
        `[bjs] script "${scriptName}": @inputMap("${entry.map}") has no matching ` +
        `action map "${label}" — create it in Blender's Input Actions panel`
      );
      continue;
    }
    (behavior as Record<string, unknown>)[entry.field] = map;
  }
}

/** Instantiate SCRIPT behaviors, inject entity/scene, apply @exposed values. */
function InstantiateScripts(
  entity: Entity,
  scripts: ScriptComponent[],
  scene: Scene,
  registry: BehaviorRegistry,
  sceneDefaultMap: string
): PendingRef[]
{
  const pendingReferences: PendingRef[] = [];

  for (const scriptComponent of scripts)
  {
    const behavior = registry.Create(scriptComponent.script);
    if (behavior === undefined)
    {
      continue;
    }

    behavior.entity = entity;
    behavior.scene = scene;
    pendingReferences.push(...ApplyExposedVars(behavior, scriptComponent.vars));
    InjectInputMaps(behavior, scriptComponent.script, sceneDefaultMap);
    entity.behaviors.push(behavior);
  }

  return pendingReferences;
}

/**
 * Interpret an entity's components: build one physics body from any COLLIDER /
 * RIGIDBODY, register authored trigger reactions, queue sound creation, set the
 * tag, and instantiate SCRIPT behaviors (deferring their entity references).
 * Returns the deferred references for the second pass.
 */
function ApplyComponents(
  entity: Entity,
  entityData: EntityData,
  scene: Scene,
  registry: BehaviorRegistry,
  context: LoadContext
): PendingRef[]
{
  const {
    collider, body, scripts, audioComponents, constraintComponents,
    guiComponents, particleComponents, gui3dComponents,
  } = ClassifyComponents(entity, entityData.components);

  if (collider !== undefined || body !== undefined)
  {
    entity.body = BuildPhysics(entity.node, collider, body, scene);
  }

  // Authored trigger reactions need the plugin observable; wired in a post-pass.
  if (collider !== undefined && collider.isTrigger
      && collider.events !== undefined && collider.events.length > 0)
  {
    context.triggerRegistrations.push({ sourceEntity: entity, events: collider.events });
  }

  // Sound creation is async (fetch + decode); collected and awaited after the loop.
  for (const audioComponent of audioComponents)
  {
    context.audioTasks.push(ApplyAudio(entity, audioComponent, context.baseUrl));
  }

  // Joints need BOTH bodies to exist; built in a post-pass (FinalizeLevel).
  for (const constraintComponent of constraintComponents)
  {
    context.constraintRegistrations.push({ ownerEntity: entity, component: constraintComponent });
  }

  // GUI layouts and particle systems are fetched/parsed from JSON; collect the
  // promises and settle them after the entity loop (like audio).
  for (const guiComponent of guiComponents)
  {
    context.guiTasks.push(ApplyGui(entity, guiComponent, context.baseUrl));
  }

  for (const particleComponent of particleComponents)
  {
    context.particleTasks.push(ApplyParticles(entity, particleComponent, context.baseUrl));
  }

  // 3D GUI needs panels before child controls and resolvable click targets,
  // so everything is queued and built in a post-pass (FinalizeLevel). The
  // parent GUID is how a control finds the panel it belongs to.
  for (const gui3dComponent of gui3dComponents)
  {
    context.gui3dRegistrations.push({
      entity,
      component: gui3dComponent,
      parentId: entityData.parent,
    });
  }

  return InstantiateScripts(entity, scripts, scene, registry, context.defaultInputMap);
}

/** Apply a Blender lamp's settings and remember it if it casts shadows. */
function ProcessLightForEntity(
  node: TransformNode,
  lightInfo: LightInfo,
  scene: Scene,
  context: LoadContext
): void
{
  const light = ApplyBlenderLight(scene, node, lightInfo);
  if (light !== null && lightInfo.castShadows)
  {
    context.shadowLights.push({ light, settings: lightInfo.shadow });
  }
}

/** Apply a Blender camera, optionally override its type, and track its target. */
function ProcessCameraForEntity(
  node: TransformNode,
  entityData: EntityData,
  scene: Scene,
  context: LoadContext
): void
{
  const cameraInfo = entityData.camera as CameraInfo;
  let camera = ApplyBlenderCamera(scene, node, cameraInfo);

  const cameraComponent = entityData.components.find(
    (component) => component.type === "CAMERA"
  ) as CameraComponent | undefined;

  if (camera !== null && cameraComponent !== undefined)
  {
    const built = BuildTypedCamera(scene, camera, cameraComponent);
    camera = built.camera;
    QueueCameraTargets(built, cameraComponent, context.cameraTargets);
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

  context.pendingReferences.push(
    ...ApplyComponents(entity, entityData, scene, registry, context)
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
    ProcessCameraForEntity(resolvedNode, entityData, scene, context);
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
