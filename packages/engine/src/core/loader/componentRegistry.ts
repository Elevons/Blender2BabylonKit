import type { Scene } from "@babylonjs/core";
import type { Entity } from "../Entity";
import { RegisterAttachment } from "../attachments";
import type {
  Component,
  EntityData,
  ColliderComponent,
  RigidBodyComponent,
  ScriptComponent,
  Gui3DComponent,
  RenderingGroupComponent,
  LayerMaskComponent,
  CollisionLayerComponent,
} from "../types";
import type { BehaviorRegistry } from "../../scripting/BehaviorRegistry";
import type { PendingRef } from "../../scripting/exposed";
import { BuildPhysics } from "../../subsystems/physics/index";
import { ApplyAudio } from "../../subsystems/audio";
import { ApplyGui } from "../../ui/gui2d";
import { ApplyParticles } from "../../subsystems/particles";
import { ApplyMsdfText } from "../../ui/msdfText";
import { HideEntityNode } from "./nodeResolution";
import { InstantiateScripts } from "./scripts";
import { GroupEventMessagesByPhase } from "../../subsystems/collisions";
import type { LoadContext } from "./context";

/**
 * The runtime component registry: one handler per component kind, applied in
 * table order for each entity. This is the single place the loader dispatches
 * on component type — adding a component means adding one handler entry here
 * (mirrored by the Blender add-on's registries; scripts/check-component-types.mjs
 * keeps the three in sync).
 */

/** Everything a handler may need to apply components on one entity. */
export interface ComponentApplyArgs {
  entity: Entity;
  entityData: EntityData;
  scene: Scene;
  behaviorRegistry: BehaviorRegistry;
  context: LoadContext;
}

/**
 * One row of the registry. A handler receives *every* component of its claimed
 * types on the entity at once, so kinds that combine (COLLIDER + RIGIDBODY into
 * one physics body) stay a single build.
 */
export interface ComponentHandler {
  /** Component discriminants this handler consumes. */
  readonly types: readonly Component["type"][];
  /** Apply the matching components; return deferred entity references, if any. */
  Apply(components: Component[], args: ComponentApplyArgs): PendingRef[];
}

/** TAG: recorded as an attachment; RegisterAttachment mirrors entity.tag. */
const TagHandler: ComponentHandler = {
  types: ["TAG"],
  Apply(components, { entity }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "TAG")
      {
        RegisterAttachment(entity, { type: "TAG", data: component });
      }
    }
    return [];
  },
};

/** RENDERING_GROUP: attachment only; mesh values applied in FinalizeLevel. */
const RenderingGroupHandler: ComponentHandler = {
  types: ["RENDERING_GROUP"],
  Apply(components, { entity }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "RENDERING_GROUP")
      {
        RegisterAttachment(entity, {
          type: "RENDERING_GROUP",
          data: component as RenderingGroupComponent,
        });
      }
    }
    return [];
  },
};

/** LAYER_MASK: attachment only; mesh values applied in FinalizeLevel. */
const LayerMaskHandler: ComponentHandler = {
  types: ["LAYER_MASK"],
  Apply(components, { entity }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "LAYER_MASK")
      {
        RegisterAttachment(entity, {
          type: "LAYER_MASK",
          data: component as LayerMaskComponent,
        });
      }
    }
    return [];
  },
};

/** COLLISION_LAYER: attachment only; Havok filters applied in FinalizeLevel. */
const CollisionLayerHandler: ComponentHandler = {
  types: ["COLLISION_LAYER"],
  Apply(components, { entity }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "COLLISION_LAYER")
      {
        RegisterAttachment(entity, {
          type: "COLLISION_LAYER",
          data: component as CollisionLayerComponent,
        });
      }
    }
    return [];
  },
};

/**
 * COLLIDER + RIGIDBODY: build one Havok body from all colliders and the
 * (optional) rigid body, hide meshes marked invisible, and queue authored
 * Event Message registrations for the post-pass (they need the plugin observable).
 */
const PhysicsHandler: ComponentHandler = {
  types: ["COLLIDER", "RIGIDBODY"],
  Apply(components, { entity, scene, context }): PendingRef[]
  {
    const colliders = components.filter(
      (component): component is ColliderComponent => component.type === "COLLIDER"
    );
    const body = components.find(
      (component): component is RigidBodyComponent => component.type === "RIGIDBODY"
    );

    if (colliders.some((collider) => collider.makeInvisible === true))
    {
      HideEntityNode(scene, entity.node);
    }

    const physicsBody = BuildPhysics(
      entity.node,
      colliders,
      body,
      scene,
      entity.id,
      context.physicsShapesByEntity
    );
    if (physicsBody !== undefined)
    {
      for (const collider of colliders)
      {
        RegisterAttachment(entity, { type: "COLLIDER", data: collider, body: physicsBody });
      }
      if (body !== undefined)
      {
        RegisterAttachment(entity, { type: "RIGIDBODY", data: body, body: physicsBody });
      }
    }

    const eventMessages = colliders.flatMap((collider) =>
      collider.eventMessages !== undefined && collider.eventMessages.length > 0
        ? collider.eventMessages
        : []
    );
    if (eventMessages.length > 0)
    {
      context.eventMessageRegistrations.push({
        sourceEntity: entity,
        messagesByPhase: GroupEventMessagesByPhase(eventMessages),
      });
    }

    return [];
  },
};

/** SCRIPT: instantiate behaviors; deferred entity references flow back out. */
const ScriptHandler: ComponentHandler = {
  types: ["SCRIPT"],
  Apply(components, { entity, scene, behaviorRegistry, context }): PendingRef[]
  {
    const scripts = components.filter(
      (component): component is ScriptComponent => component.type === "SCRIPT"
    );
    return InstantiateScripts(entity, scripts, scene, behaviorRegistry, context.defaultInputMap);
  },
};

/** AUDIO: sound creation is async (fetch + decode); settled after the entity loop. */
const AudioHandler: ComponentHandler = {
  types: ["AUDIO"],
  Apply(components, { entity, context }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "AUDIO")
      {
        context.audioTasks.push(ApplyAudio(entity, component, context.baseUrl));
      }
    }
    return [];
  },
};

/** CONSTRAINT: joints need BOTH bodies to exist; built in FinalizeLevel. */
const ConstraintHandler: ComponentHandler = {
  types: ["CONSTRAINT"],
  Apply(components, { entity, context }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "CONSTRAINT")
      {
        context.constraintRegistrations.push({ ownerEntity: entity, component });
      }
    }
    return [];
  },
};

/** GUI: layouts are fetched/parsed from JSON; settled after the entity loop. */
const GuiHandler: ComponentHandler = {
  types: ["GUI"],
  Apply(components, { entity, context }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "GUI")
      {
        context.guiTasks.push(ApplyGui(entity, component, context.baseUrl));
      }
    }
    return [];
  },
};

/** PARTICLE: systems are fetched/parsed from JSON; settled after the entity loop. */
const ParticleHandler: ComponentHandler = {
  types: ["PARTICLE"],
  Apply(components, { entity, context }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "PARTICLE")
      {
        context.particleTasks.push(ApplyParticles(entity, component, context.baseUrl));
      }
    }
    return [];
  },
};

/** MSDF_TEXT: font assets load async; settled after the entity loop. */
const MsdfTextHandler: ComponentHandler = {
  types: ["MSDF_TEXT"],
  Apply(components, { entity, context }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "MSDF_TEXT")
      {
        context.msdfTextTasks.push(ApplyMsdfText(entity, component, context.baseUrl));
      }
    }
    return [];
  },
};

/** REFLECTION_PROBE: probes need every entity built first; built in FinalizeLevel. */
const ReflectionProbeHandler: ComponentHandler = {
  types: ["REFLECTION_PROBE"],
  Apply(components, { entity, context }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "REFLECTION_PROBE")
      {
        context.reflectionProbeRegistrations.push({ entity, component });
      }
    }
    return [];
  },
};

/** LOD: needs every entity built first to resolve target GUIDs; built in FinalizeLevel. */
const LodHandler: ComponentHandler = {
  types: ["LOD"],
  Apply(components, { entity, context }): PendingRef[]
  {
    for (const component of components)
    {
      if (component.type === "LOD")
      {
        context.lodRegistrations.push({ entity, component });
      }
    }
    return [];
  },
};

/**
 * GUI3D_*: panels must exist before their child controls and click targets
 * must resolve, so everything is queued and built in FinalizeLevel. The parent
 * GUID is how a control finds the panel it belongs to.
 */
const Gui3DHandler: ComponentHandler = {
  types: [
    "GUI3D_BUTTON",
    "GUI3D_HOLO",
    "GUI3D_TOUCH_HOLO",
    "GUI3D_MESH",
    "GUI3D_STACK",
    "GUI3D_SPHERE",
    "GUI3D_CYLINDER",
    "GUI3D_PLANE",
    "GUI3D_SCATTER",
  ],
  Apply(components, { entity, entityData, context }): PendingRef[]
  {
    for (const component of components)
    {
      context.gui3dRegistrations.push({
        entity,
        component: component as Gui3DComponent,
        parentId: entityData.parent,
      });
    }
    return [];
  },
};

/**
 * CAMERA is a Component in the manifest but is consumed by
 * ProcessCameraForEntity alongside the auto-derived CameraInfo — this row only
 * claims the type so it doesn't warn as unhandled.
 */
const CameraNoopHandler: ComponentHandler = {
  types: ["CAMERA"],
  Apply(): PendingRef[]
  {
    return [];
  },
};

/** Registry order is apply order (physics before triggers matters; the rest is stable). */
const COMPONENT_HANDLERS: readonly ComponentHandler[] = [
  TagHandler,
  RenderingGroupHandler,
  LayerMaskHandler,
  CollisionLayerHandler,
  PhysicsHandler,
  ScriptHandler,
  AudioHandler,
  ConstraintHandler,
  GuiHandler,
  ParticleHandler,
  MsdfTextHandler,
  ReflectionProbeHandler,
  LodHandler,
  Gui3DHandler,
  CameraNoopHandler,
];

/** Discriminant → handler, derived once from the registry table. */
const HANDLERS_BY_TYPE: ReadonlyMap<Component["type"], ComponentHandler> = new Map(
  COMPONENT_HANDLERS.flatMap((handler) => handler.types.map((type) => [type, handler]))
);

/**
 * Apply every component on one entity through the registry: group the entity's
 * components by handler, then run each claimed handler once (in table order)
 * with all of its components. Unknown types warn — that usually means the
 * Blender add-on is newer than the engine.
 */
export function ApplyEntityComponents(args: ComponentApplyArgs): PendingRef[]
{
  const componentsByHandler = new Map<ComponentHandler, Component[]>();

  for (const component of args.entityData.components)
  {
    const handler = HANDLERS_BY_TYPE.get(component.type);
    if (handler === undefined)
    {
      console.warn(
        `[bjs] entity "${args.entity.name}": no handler for component type ` +
          `"${component.type}" — is the engine older than the Blender add-on?`
      );
      continue;
    }

    const group = componentsByHandler.get(handler);
    if (group === undefined)
    {
      componentsByHandler.set(handler, [component]);
    }
    else
    {
      group.push(component);
    }
  }

  const pendingReferences: PendingRef[] = [];
  for (const handler of COMPONENT_HANDLERS)
  {
    const components = componentsByHandler.get(handler);
    if (components !== undefined)
    {
      pendingReferences.push(...handler.Apply(components, args));
    }
  }

  return pendingReferences;
}

/** Whether a component type may be added or removed after level load. */
export interface ComponentRuntimePolicy
{
  allowRuntimeAdd: boolean;
  allowRuntimeRemove: boolean;
  allowMultiple: boolean;
}

const RUNTIME_ALLOWED: ComponentRuntimePolicy = {
  allowRuntimeAdd: true,
  allowRuntimeRemove: true,
  allowMultiple: true,
};

const RUNTIME_TAG: ComponentRuntimePolicy = {
  allowRuntimeAdd: true,
  allowRuntimeRemove: true,
  allowMultiple: false,
};

const RUNTIME_RIGIDBODY: ComponentRuntimePolicy = {
  allowRuntimeAdd: true,
  allowRuntimeRemove: true,
  allowMultiple: false,
};

const RUNTIME_BLOCKED: ComponentRuntimePolicy = {
  allowRuntimeAdd: false,
  allowRuntimeRemove: false,
  allowMultiple: false,
};

const RUNTIME_POLICIES = new Map<Component["type"], ComponentRuntimePolicy>([
  ["TAG", RUNTIME_TAG],
  ["SCRIPT", RUNTIME_ALLOWED],
  ["AUDIO", RUNTIME_ALLOWED],
  ["GUI", RUNTIME_ALLOWED],
  ["PARTICLE", RUNTIME_ALLOWED],
  ["MSDF_TEXT", RUNTIME_ALLOWED],
  ["COLLIDER", RUNTIME_ALLOWED],
  ["RIGIDBODY", RUNTIME_RIGIDBODY],
  ["CONSTRAINT", RUNTIME_ALLOWED],
  ["GUI3D_BUTTON", RUNTIME_ALLOWED],
  ["GUI3D_HOLO", RUNTIME_ALLOWED],
  ["GUI3D_TOUCH_HOLO", RUNTIME_ALLOWED],
  ["GUI3D_MESH", RUNTIME_ALLOWED],
  ["GUI3D_STACK", RUNTIME_ALLOWED],
  ["GUI3D_SPHERE", RUNTIME_ALLOWED],
  ["GUI3D_CYLINDER", RUNTIME_ALLOWED],
  ["GUI3D_PLANE", RUNTIME_ALLOWED],
  ["GUI3D_SCATTER", RUNTIME_ALLOWED],
  ["RENDERING_GROUP", RUNTIME_BLOCKED],
  ["LAYER_MASK", RUNTIME_BLOCKED],
  ["COLLISION_LAYER", RUNTIME_BLOCKED],
  ["REFLECTION_PROBE", RUNTIME_BLOCKED],
  ["LOD", RUNTIME_BLOCKED],
  ["CAMERA", RUNTIME_BLOCKED],
]);

/** Return runtime mutation policy for a component discriminant. */
export function GetRuntimePolicy(type: Component["type"]): ComponentRuntimePolicy
{
  return RUNTIME_POLICIES.get(type) ?? RUNTIME_BLOCKED;
}

/** True when the type is one of the GUI3D panel/control discriminants. */
export function IsGui3DComponentType(type: Component["type"]): boolean
{
  return type.startsWith("GUI3D_");
}
