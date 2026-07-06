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
  Gui3DComponent,
} from "./types";

/** Runtime rows materialized from manifest components during load. */
export type EntityAttachment =
  | { type: "TAG"; data: TagComponent }
  | { type: "RENDERING_GROUP"; data: RenderingGroupComponent }
  | { type: "LAYER_MASK"; data: LayerMaskComponent }
  | { type: "COLLISION_LAYER"; data: CollisionLayerComponent }
  | { type: "COLLIDER"; data: ColliderComponent; body: PhysicsBody }
  | { type: "RIGIDBODY"; data: RigidBodyComponent; body: PhysicsBody }
  | { type: "SCRIPT"; data: ScriptComponent; behavior: Behavior }
  | { type: "AUDIO"; data: AudioComponent; sound: StaticSound }
  | { type: "GUI"; data: GuiComponent; texture: AdvancedDynamicTexture }
  | { type: "PARTICLE"; data: ParticleComponent; system: IParticleSystem; emptyEmitter?: Vector3 }
  | { type: "MSDF_TEXT"; data: MsdfTextComponent; renderer: TextRenderer }
  | { type: "REFLECTION_PROBE"; data: ReflectionProbeComponent; probe: ReflectionProbe }
  | { type: "CONSTRAINT"; data: ConstraintComponent; constraint: PhysicsConstraint }
  | { type: Gui3DComponent["type"]; data: Gui3DComponent; control: Control3D };

/** Discriminant of {@link EntityAttachment}. */
export type ComponentType = EntityAttachment["type"];

/** The attachment row whose `type` matches `T`. */
export type AttachmentOfType<T extends ComponentType> = Extract<EntityAttachment, { type: T }>;

/**
 * Record one successfully applied component on an entity. This is the single
 * write path: the attachment row is appended and the matching convenience
 * field/array (`entity.tag`, `entity.body`, `entity.behaviors`, …) is mirrored
 * here — call sites must not push to those arrays themselves.
 */
export function RegisterAttachment(entity: Entity, attachment: EntityAttachment): void
{
  entity.attachments.push(attachment);

  switch (attachment.type)
  {
    case "TAG":
      entity.tag = attachment.data.tag;
      break;

    case "COLLIDER":
    case "RIGIDBODY":
      entity.body = attachment.body;
      break;

    case "SCRIPT":
      entity.behaviors.push(attachment.behavior);
      break;

    case "AUDIO":
      entity.sounds.push(attachment.sound);
      break;

    case "GUI":
      entity.guiTextures.push(attachment.texture);
      break;

    case "PARTICLE":
      entity.particleSystems.push(attachment.system);
      break;

    case "MSDF_TEXT":
      entity.textRenderers.push(attachment.renderer);
      break;

    case "REFLECTION_PROBE":
      entity.reflectionProbes.push(attachment.probe);
      break;

    case "CONSTRAINT":
      // Constraints live on Level.constraints; no per-entity convenience array.
      break;

    case "RENDERING_GROUP":
    case "LAYER_MASK":
    case "COLLISION_LAYER":
      // Data-only attachments; mesh/layer values are applied in FinalizeLevel.
      break;

    default:
      // Remaining rows are the GUI3D_* union — all carry a Control3D.
      entity.controls3D.push(attachment.control);
      break;
  }
}
