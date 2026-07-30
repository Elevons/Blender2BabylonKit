import type {
  PhysicsBody,
  StaticSound,
  IParticleSystem,
  PhysicsConstraint,
  Vector3,
} from "@babylonjs/core";
import type { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import type { AdvancedDynamicTexture, Control3D } from "@babylonjs/gui";
import type { TextRenderer } from "@babylonjs/addons/msdfText";
import type { Behavior } from "../scripting/Behavior";
import type { Entity } from "./Entity";
import type {
  TagComponent,
  RenderingGroupComponent,
  LayerMaskComponent,
  CollisionLayerComponent,
  ColliderComponent,
  RigidBodyComponent,
  ScriptComponent,
  AudioComponent,
  GuiComponent,
  ParticleComponent,
  MsdfTextComponent,
  ReflectionProbeComponent,
  ConstraintComponent,
  LodComponent,
  AnimatorComponent,
  Gui3DComponent,
} from "./types";
import type { AnimatorController } from "../subsystems/animatorController";

/** Runtime rows materialized from manifest components during load. */
export type EntityAttachment =
  | { type: "TAG"; data: TagComponent }
  | { type: "RENDERING_GROUP"; data: RenderingGroupComponent }
  | { type: "LAYER_MASK"; data: LayerMaskComponent }
  | { type: "COLLISION_LAYER"; data: CollisionLayerComponent }
  | { type: "COLLIDER"; data: ColliderComponent; body: PhysicsBody }
  | { type: "RIGIDBODY"; data: RigidBodyComponent; body: PhysicsBody }
  | { type: "SCRIPT"; data: ScriptComponent; behavior: Behavior }
  | { type: "ANIMATOR"; data: AnimatorComponent; behavior: AnimatorController }
  | { type: "AUDIO"; data: AudioComponent; sound: StaticSound }
  | { type: "GUI"; data: GuiComponent; texture: AdvancedDynamicTexture }
  | { type: "PARTICLE"; data: ParticleComponent; system: IParticleSystem; emptyEmitter?: Vector3 }
  | { type: "MSDF_TEXT"; data: MsdfTextComponent; renderer: TextRenderer }
  | { type: "REFLECTION_PROBE"; data: ReflectionProbeComponent; probe: ReflectionProbe }
  | { type: "CONSTRAINT"; data: ConstraintComponent; constraint: PhysicsConstraint }
  | { type: "LOD"; data: LodComponent }
  | { type: Gui3DComponent["type"]; data: Gui3DComponent; control: Control3D };

/** Discriminant of {@link EntityAttachment}. */
export type ComponentType = EntityAttachment["type"];

/** The attachment row whose `type` matches `T`. */
export type AttachmentOfType<T extends ComponentType> = Extract<EntityAttachment, { type: T }>;

/**
 * Rebuild convenience fields from the current attachment rows. Called after
 * register and unregister so mirrored arrays never drift.
 */
export function SyncConvenienceFields(entity: Entity): void
{
  const tagRow = [...entity.attachments].reverse().find((row) => row.type === "TAG");
  entity.tag = tagRow !== undefined && tagRow.type === "TAG" ? tagRow.data.tag : "Untagged";

  const physicsRow = entity.attachments.find(
    (row) => row.type === "COLLIDER" || row.type === "RIGIDBODY"
  );
  entity.body = physicsRow !== undefined && "body" in physicsRow ? physicsRow.body : undefined;

  entity.behaviors = entity.attachments
    .filter(
      (row): row is
        | Extract<EntityAttachment, { type: "SCRIPT" }>
        | Extract<EntityAttachment, { type: "ANIMATOR" }> =>
        row.type === "SCRIPT" || row.type === "ANIMATOR"
    )
    .map((row) => row.behavior);

  entity.sounds = entity.attachments
    .filter((row): row is Extract<EntityAttachment, { type: "AUDIO" }> => row.type === "AUDIO")
    .map((row) => row.sound);

  entity.guiTextures = entity.attachments
    .filter((row): row is Extract<EntityAttachment, { type: "GUI" }> => row.type === "GUI")
    .map((row) => row.texture);

  entity.particleSystems = entity.attachments
    .filter((row): row is Extract<EntityAttachment, { type: "PARTICLE" }> => row.type === "PARTICLE")
    .map((row) => row.system);

  entity.textRenderers = entity.attachments
    .filter((row): row is Extract<EntityAttachment, { type: "MSDF_TEXT" }> => row.type === "MSDF_TEXT")
    .map((row) => row.renderer);

  entity.reflectionProbes = entity.attachments
    .filter(
      (row): row is Extract<EntityAttachment, { type: "REFLECTION_PROBE" }> =>
        row.type === "REFLECTION_PROBE"
    )
    .map((row) => row.probe);

  entity.controls3D = entity.attachments
    .filter((row): row is Extract<EntityAttachment, { control: Control3D }> => "control" in row)
    .filter((row) => row.type.startsWith("GUI3D_"))
    .map((row) => row.control);
}

/**
 * Record one successfully applied component on an entity. This is the single
 * write path: the attachment row is appended and the matching convenience
 * field/array (`entity.tag`, `entity.body`, `entity.behaviors`, …) is mirrored
 * here — call sites must not push to those arrays themselves.
 */
export function RegisterAttachment(entity: Entity, attachment: EntityAttachment): void
{
  entity.attachments.push(attachment);
  SyncConvenienceFields(entity);
}

/**
 * Remove one attachment row and resync convenience fields. Does not dispose
 * runtime objects — callers tear those down before unregistering.
 */
export function UnregisterAttachment(entity: Entity, attachment: EntityAttachment): void
{
  const index = entity.attachments.indexOf(attachment);
  if (index === -1)
  {
    return;
  }

  entity.attachments.splice(index, 1);
  SyncConvenienceFields(entity);
}

/** Remove the attachment at a given index; returns the removed row if any. */
export function RemoveAttachmentAt(entity: Entity, index: number): EntityAttachment | undefined
{
  if (index < 0 || index >= entity.attachments.length)
  {
    return undefined;
  }

  const removed = entity.attachments.splice(index, 1)[0];
  SyncConvenienceFields(entity);
  return removed;
}

/**
 * Remove attachments of a type. When index is set, only that occurrence among
 * rows of the type is removed (0 = first of type).
 */
export function RemoveAttachmentsOfType(
  entity: Entity,
  type: ComponentType,
  index?: number
): EntityAttachment[]
{
  const matches = entity.attachments
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter((entry) => entry.row.type === type);

  if (matches.length === 0)
  {
    return [];
  }

  let toRemove: typeof matches;
  if (index === undefined)
  {
    toRemove = matches;
  }
  else if (matches[index] !== undefined)
  {
    toRemove = [matches[index]];
  }
  else
  {
    toRemove = [];
  }

  const removed: EntityAttachment[] = [];
  for (const entry of [...toRemove].sort((left, right) => right.rowIndex - left.rowIndex))
  {
    const row = RemoveAttachmentAt(entity, entry.rowIndex);
    if (row !== undefined)
    {
      removed.push(row);
    }
  }

  return removed;
}

/** Indices of every attachment row matching a component type. */
export function FindAttachmentIndices(entity: Entity, type: ComponentType): number[]
{
  const indices: number[] = [];
  for (let index = 0; index < entity.attachments.length; index++)
  {
    if (entity.attachments[index].type === type)
    {
      indices.push(index);
    }
  }
  return indices;
}
