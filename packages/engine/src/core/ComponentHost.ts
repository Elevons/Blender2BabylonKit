import type { PhysicsShape, Scene } from "@babylonjs/core";
import { GUI3DManager, type Container3D, type Control3D } from "@babylonjs/gui";
import type { Level } from "./Level";
import type { Entity } from "./Entity";
import type { Component, ColliderComponent, ConstraintComponent, Gui3DComponent } from "./types";
import {
  FindAttachmentIndices,
  RegisterAttachment,
  RemoveAttachmentAt,
  RemoveAttachmentsOfType,
  UnregisterAttachment,
  type ComponentType,
  type EntityAttachment,
} from "./attachments";
import type { BehaviorRegistry } from "../scripting/BehaviorRegistry";
import {
  GetRuntimePolicy,
  IsGui3DComponentType,
} from "./loader/componentRegistry";
import {
  InstantiateScripts,
  ResolveScriptReferences,
  TeardownScript,
} from "./loader/scripts";
import { ApplyAudio } from "../subsystems/audio";
import { ApplyGui } from "../ui/gui2d";
import { ApplyParticles } from "../subsystems/particles";
import { ApplyMsdfText } from "../ui/msdfText";
import { RebuildEntityPhysics } from "../subsystems/physics/rebuildPhysics";
import { BuildSingleConstraint } from "../subsystems/constraints";
import {
  GroupEventMessagesByPhase,
  type EventMessageRegistration,
} from "../subsystems/collisions";
import {
  ApplyGui3DRegistration,
  TeardownGui3DAttachment,
  type Gui3DRegistration,
} from "../ui/gui3d/builder";
import { HideEntityNode } from "./loader/nodeResolution";
import { FlushGlobalRefresh, type GlobalRefreshFlag } from "./componentGlobalRefresh";

/** Options for {@link ComponentHost.AddComponent}. */
export interface AddComponentOptions
{
  /** GUI3D controls: parent entity GUID when nesting under a panel. */
  parentEntityId?: string;
}

/**
 * Runtime add/remove for entity components after load. App code calls this via
 * `level.componentHost` — behaviors do not receive a Level handle.
 */
export class ComponentHost
{
  private begun = false;
  private readonly pendingGlobalRefresh = new Set<GlobalRefreshFlag>();
  readonly physicsShapesByEntity = new Map<string, PhysicsShape[]>();
  readonly eventMessageRegistrations: EventMessageRegistration[] = [];
  readonly panelsByEntity = new Map<string, Container3D>();

  constructor(
    readonly level: Level,
    readonly scene: Scene,
    readonly behaviorRegistry: BehaviorRegistry,
    readonly baseUrl: string,
    readonly defaultInputMap: string
  ) {}

  /** Called by Level.Begin after every load-time OnStart has run. */
  MarkBegun(): void
  {
    this.begun = true;
  }

  /**
   * Apply one manifest-shaped component onto an existing entity. Mutations are
   * ephemeral — they are not written back to the scene manifest.
   */
  async AddComponent(
    entity: Entity,
    component: Component,
    options: AddComponentOptions = {}
  ): Promise<void>
  {
    const policy = GetRuntimePolicy(component.type);
    if (!policy.allowRuntimeAdd)
    {
      console.warn(
        `[bjs] ComponentHost: "${component.type}" cannot be added at runtime on "${entity.name}"`
      );
      return;
    }

    if (!policy.allowMultiple && entity.attachments.some((row) => row.type === component.type))
    {
      if (component.type === "TAG")
      {
        RemoveAttachmentsOfType(entity, "TAG");
      }
      else if (component.type === "RIGIDBODY")
      {
        RemoveAttachmentsOfType(entity, "RIGIDBODY", 0);
      }
      else
      {
        console.warn(
          `[bjs] ComponentHost: "${entity.name}" already has "${component.type}" ` +
          `(only one allowed)`
        );
        return;
      }
    }

    switch (component.type)
    {
      case "TAG":
        this.RegisterTag(entity, component);
        break;

      case "SCRIPT":
        await this.AddScript(entity, component);
        break;

      case "AUDIO":
        await ApplyAudio(entity, component, this.baseUrl);
        break;

      case "GUI":
        await ApplyGui(entity, component, this.baseUrl);
        break;

      case "PARTICLE":
        await ApplyParticles(entity, component, this.baseUrl);
        this.pendingGlobalRefresh.add("particleEmitters");
        break;

      case "MSDF_TEXT":
        await ApplyMsdfText(entity, component, this.baseUrl);
        this.pendingGlobalRefresh.add("msdfRendering");
        break;

      case "COLLIDER":
        await this.AddCollider(entity, component);
        break;

      case "RIGIDBODY":
        this.AddRigidBody(entity, component);
        break;

      case "CONSTRAINT":
        this.AddConstraint(entity, component);
        break;

      default:
        if (IsGui3DComponentType(component.type))
        {
          this.AddGui3D(entity, component as Gui3DComponent, options.parentEntityId ?? null);
        }
        break;
    }

    this.FlushGlobalRefresh();
  }

  /**
   * Remove one attachment of the given type. Index selects which row when several
   * exist (0 = first of that type).
   */
  async RemoveComponent(
    entity: Entity,
    type: ComponentType,
    index = 0
  ): Promise<void>
  {
    const policy = GetRuntimePolicy(type);
    if (!policy.allowRuntimeRemove)
    {
      console.warn(
        `[bjs] ComponentHost: "${type}" cannot be removed at runtime on "${entity.name}"`
      );
      return;
    }

    const typeIndices = FindAttachmentIndices(entity, type);
    if (typeIndices.length === 0)
    {
      return;
    }

    const attachmentIndex = typeIndices[index];
    if (attachmentIndex === undefined)
    {
      return;
    }

    const attachment = entity.attachments[attachmentIndex];

    switch (type)
    {
      case "TAG":
        RemoveAttachmentsOfType(entity, "TAG");
        break;

      case "SCRIPT":
        if (attachment.type === "SCRIPT")
        {
          TeardownScript(attachment.behavior);
          UnregisterAttachment(entity, attachment);
        }
        break;

      case "AUDIO":
        if (attachment.type === "AUDIO")
        {
          attachment.sound.dispose();
          UnregisterAttachment(entity, attachment);
        }
        break;

      case "GUI":
        if (attachment.type === "GUI")
        {
          attachment.texture.dispose();
          UnregisterAttachment(entity, attachment);
        }
        break;

      case "PARTICLE":
        if (attachment.type === "PARTICLE")
        {
          attachment.system.dispose();
          UnregisterAttachment(entity, attachment);
          this.pendingGlobalRefresh.add("particleEmitters");
        }
        break;

      case "MSDF_TEXT":
        if (attachment.type === "MSDF_TEXT")
        {
          attachment.renderer.dispose();
          UnregisterAttachment(entity, attachment);
          this.pendingGlobalRefresh.add("msdfRendering");
        }
        break;

      case "COLLIDER":
        RemoveAttachmentAt(entity, attachmentIndex);
        RebuildEntityPhysics(entity, this.scene, this.physicsShapesByEntity);
        this.SyncEntityEventMessages(entity);
        this.pendingGlobalRefresh.add("collisionCallbacks");
        break;

      case "RIGIDBODY":
        RemoveAttachmentAt(entity, attachmentIndex);
        RebuildEntityPhysics(entity, this.scene, this.physicsShapesByEntity);
        this.pendingGlobalRefresh.add("collisionCallbacks");
        break;

      case "CONSTRAINT":
        if (attachment.type === "CONSTRAINT")
        {
          attachment.constraint.dispose();
          const levelIndex = this.level.constraints.indexOf(attachment.constraint);
          if (levelIndex !== -1)
          {
            this.level.constraints.splice(levelIndex, 1);
          }
          UnregisterAttachment(entity, attachment);
        }
        break;

      default:
        if (type.startsWith("GUI3D_") && "control" in attachment)
        {
          const manager = this.EnsureGui3DManager();
          TeardownGui3DAttachment(
            entity,
            attachment as Extract<EntityAttachment, { control: Control3D }>,
            manager,
            this.panelsByEntity
          );
        }
        break;
    }

    this.FlushGlobalRefresh();
  }

  /** Run any deferred global subsystem refresh from recent mutations. */
  FlushGlobalRefresh(): void
  {
    if (this.pendingGlobalRefresh.size === 0)
    {
      return;
    }

    FlushGlobalRefresh(
      this.scene,
      this.level,
      this.pendingGlobalRefresh,
      this.eventMessageRegistrations
    );
    this.pendingGlobalRefresh.clear();
  }

  private RegisterTag(entity: Entity, component: Extract<Component, { type: "TAG" }>): void
  {
    RegisterAttachment(entity, { type: "TAG", data: component });
  }

  private async AddScript(
    entity: Entity,
    component: Extract<Component, { type: "SCRIPT" }>
  ): Promise<void>
  {
    const pendingReferences = InstantiateScripts(
      entity,
      [component],
      this.scene,
      this.behaviorRegistry,
      this.defaultInputMap
    );

    const scriptAttachment = entity.attachments[entity.attachments.length - 1];
    if (scriptAttachment === undefined || scriptAttachment.type !== "SCRIPT")
    {
      return;
    }

    ResolveScriptReferences(
      scriptAttachment.behavior,
      pendingReferences,
      (guid) => this.level.ById(guid) ?? null
    );

    if (this.begun)
    {
      try
      {
        scriptAttachment.behavior.OnStart();
      }
      catch (error)
      {
        console.error(`[bjs] OnStart "${entity.name}"`, error);
      }
    }
  }

  private async AddCollider(entity: Entity, component: ColliderComponent): Promise<void>
  {
    if (component.makeInvisible === true)
    {
      HideEntityNode(this.scene, entity.node);
    }

    RebuildEntityPhysics(
      entity,
      this.scene,
      this.physicsShapesByEntity,
      [component]
    );
    this.SyncEntityEventMessages(entity);
    this.pendingGlobalRefresh.add("collisionCallbacks");
  }

  private AddRigidBody(
    entity: Entity,
    component: Extract<Component, { type: "RIGIDBODY" }>
  ): void
  {
    RemoveAttachmentsOfType(entity, "RIGIDBODY");
    RebuildEntityPhysics(
      entity,
      this.scene,
      this.physicsShapesByEntity,
      [],
      component
    );
    this.pendingGlobalRefresh.add("collisionCallbacks");
  }

  private AddConstraint(entity: Entity, component: ConstraintComponent): void
  {
    const constraint = BuildSingleConstraint(this.scene, this.level, entity, component);
    if (constraint !== undefined)
    {
      this.level.constraints.push(constraint);
    }
  }

  private AddGui3D(
    entity: Entity,
    component: Gui3DComponent,
    parentEntityId: string | null
  ): void
  {
    const manager = this.EnsureGui3DManager();
    const registration: Gui3DRegistration = { entity, component, parentId: parentEntityId };
    ApplyGui3DRegistration(
      registration,
      manager,
      this.panelsByEntity,
      this.level,
      this.baseUrl
    );
  }

  private EnsureGui3DManager(): GUI3DManager
  {
    if (this.level.gui3DManager === undefined)
    {
      this.level.gui3DManager = new GUI3DManager(this.scene);
    }
    return this.level.gui3DManager;
  }

  private SyncEntityEventMessages(entity: Entity): void
  {
    for (let index = this.eventMessageRegistrations.length - 1; index >= 0; index--)
    {
      if (this.eventMessageRegistrations[index].sourceEntity === entity)
      {
        this.eventMessageRegistrations.splice(index, 1);
      }
    }

    const eventMessages = entity.attachments
      .filter((row): row is Extract<EntityAttachment, { type: "COLLIDER" }> => row.type === "COLLIDER")
      .flatMap((row) =>
        row.data.eventMessages !== undefined && row.data.eventMessages.length > 0
          ? row.data.eventMessages
          : []
      );

    if (eventMessages.length > 0)
    {
      this.eventMessageRegistrations.push({
        sourceEntity: entity,
        messagesByPhase: GroupEventMessagesByPhase(eventMessages),
      });
    }
  }
}
