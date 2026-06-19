import type {
  PhysicsBody,
  StaticSound,
  IParticleSystem,
  PhysicsConstraint,
} from "@babylonjs/core";
import type { AdvancedDynamicTexture, Control3D } from "@babylonjs/gui";
import type { Behavior } from "../scripting/Behavior";
import type { Entity } from "./Entity";
import type {
  TagComponent,
  ColliderComponent,
  RigidBodyComponent,
  ScriptComponent,
  AudioComponent,
  GuiComponent,
  ParticleComponent,
  ConstraintComponent,
  Gui3DComponent,
} from "./types";

/** Runtime rows materialized from manifest components during load. */
export type EntityAttachment =
  | { type: "TAG"; data: TagComponent }
  | { type: "COLLIDER"; data: ColliderComponent; body: PhysicsBody }
  | { type: "RIGIDBODY"; data: RigidBodyComponent; body: PhysicsBody }
  | { type: "SCRIPT"; data: ScriptComponent; behavior: Behavior }
  | { type: "AUDIO"; data: AudioComponent; sound: StaticSound }
  | { type: "GUI"; data: GuiComponent; texture: AdvancedDynamicTexture }
  | { type: "PARTICLE"; data: ParticleComponent; system: IParticleSystem }
  | { type: "CONSTRAINT"; data: ConstraintComponent; constraint: PhysicsConstraint }
  | { type: Gui3DComponent["type"]; data: Gui3DComponent; control: Control3D };

/** Discriminant of {@link EntityAttachment}. */
export type ComponentType = EntityAttachment["type"];

/** The attachment row whose `type` matches `T`. */
export type AttachmentOfType<T extends ComponentType> = Extract<EntityAttachment, { type: T }>;

/** Record one successfully applied component on an entity. */
export function RegisterAttachment(entity: Entity, attachment: EntityAttachment): void
{
  entity.attachments.push(attachment);
}
