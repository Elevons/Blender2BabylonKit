import type {
  TransformNode,
  PhysicsBody,
  AnimationGroup,
  StaticSound,
  IParticleSystem,
} from "@babylonjs/core";
import type { AdvancedDynamicTexture, Control3D } from "@babylonjs/gui";
import type { TextRenderer } from "@babylonjs/addons/msdfText";
// Type-only import: Entity references Behavior, Behavior references Entity.
// `import type` erases at compile time, so the cycle is harmless at runtime.
import type { Behavior } from "../scripting/Behavior";
import type {
  AttachmentOfType,
  ComponentType,
  EntityAttachment,
} from "./attachments";

export class Entity
{
  readonly id: string;
  readonly name: string;
  readonly node: TransformNode;
  /** Live registry of successfully applied components (populated during load). */
  attachments: EntityAttachment[] = [];
  tag = "Untagged";
  behaviors: Behavior[] = [];
  body?: PhysicsBody;
  /** AnimationGroups from the glb that target this entity's node (or children). */
  animations: AnimationGroup[] = [];
  /** Sounds created from AUDIO components (audio engine v2 StaticSounds). */
  sounds: StaticSound[] = [];
  /** GUI textures created from GUI components (fullscreen HUDs or mesh UIs). */
  guiTextures: AdvancedDynamicTexture[] = [];
  /** 3D GUI controls/panels created from GUI3D_* components. */
  controls3D: Control3D[] = [];
  /** Particle systems created from PARTICLE components. */
  particleSystems: IParticleSystem[] = [];
  /** MSDF text renderers created from MSDF_TEXT components. */
  textRenderers: TextRenderer[] = [];

  constructor(id: string, name: string, node: TransformNode)
  {
    this.id = id;
    this.name = name;
    this.node = node;
  }

  /** Every attachment row on this entity (read-only view). */
  GetAttachments(): readonly EntityAttachment[]
  {
    return this.attachments;
  }

  /** The first attachment of the given component type, if any. */
  GetAttachment<T extends ComponentType>(type: T): AttachmentOfType<T> | undefined
  {
    return this.attachments.find((attachment) => attachment.type === type) as
      AttachmentOfType<T> | undefined;
  }

  /** Every attachment of the given component type. */
  GetAttachmentsOfType<T extends ComponentType>(type: T): AttachmentOfType<T>[]
  {
    return this.attachments.filter((attachment) => attachment.type === type) as
      AttachmentOfType<T>[];
  }

  /** Whether this entity has at least one attachment of the given type. */
  HasAttachment(type: ComponentType): boolean
  {
    return this.attachments.some((attachment) => attachment.type === type);
  }

  /** Return the first attached behavior of the given class, if present. */
  GetBehavior<T extends Behavior>(behaviorConstructor: new () => T): T | undefined
  {
    return this.behaviors.find((behavior) => behavior instanceof behaviorConstructor) as T | undefined;
  }

  /** Find one of this entity's animation clips by name (exact match, then contains). */
  GetAnimation(clipName: string): AnimationGroup | undefined
  {
    const wanted = clipName.toLowerCase();

    const exactMatch = this.animations.find((group) => group.name.toLowerCase() === wanted);
    if (exactMatch !== undefined)
    {
      return exactMatch;
    }

    return this.animations.find((group) => group.name.toLowerCase().includes(wanted));
  }

  /** Find one of this entity's sounds by name (exact match, then contains). */
  GetSound(soundName: string): StaticSound | undefined
  {
    const wanted = soundName.toLowerCase();

    const exactMatch = this.sounds.find((sound) => sound.name.toLowerCase() === wanted);
    if (exactMatch !== undefined)
    {
      return exactMatch;
    }

    return this.sounds.find((sound) => sound.name.toLowerCase().includes(wanted));
  }

  /** Find one of this entity's GUI textures by name (exact match, then contains). */
  GetGui(guiName: string): AdvancedDynamicTexture | undefined
  {
    const wanted = guiName.toLowerCase();

    const exactMatch = this.guiTextures.find(
      (texture) => texture.name.toLowerCase() === wanted
    );
    if (exactMatch !== undefined)
    {
      return exactMatch;
    }

    return this.guiTextures.find((texture) => texture.name.toLowerCase().includes(wanted));
  }

  /** Find one of this entity's 3D GUI controls by name (exact match, then contains). */
  GetControl3D(controlName: string): Control3D | undefined
  {
    const wanted = controlName.toLowerCase();

    const exactMatch = this.controls3D.find(
      (control) => (control.name ?? "").toLowerCase() === wanted
    );
    if (exactMatch !== undefined)
    {
      return exactMatch;
    }

    return this.controls3D.find(
      (control) => (control.name ?? "").toLowerCase().includes(wanted)
    );
  }

  /** Find one of this entity's particle systems by name (exact match, then contains). */
  GetParticles(systemName: string): IParticleSystem | undefined
  {
    const wanted = systemName.toLowerCase();

    const exactMatch = this.particleSystems.find(
      (system) => system.name.toLowerCase() === wanted
    );
    if (exactMatch !== undefined)
    {
      return exactMatch;
    }

    return this.particleSystems.find((system) => system.name.toLowerCase().includes(wanted));
  }

  /** Find one of this entity's MSDF text renderers by font file stem (exact, then contains). */
  GetTextRenderer(fontName: string): TextRenderer | undefined
  {
    const wanted = fontName.toLowerCase();
    const attachments = this.GetAttachmentsOfType("MSDF_TEXT");

    const exactMatch = attachments.find(
      (attachment) => FontJsonStem(attachment.data.fontJson).toLowerCase() === wanted
    );
    if (exactMatch !== undefined)
    {
      return exactMatch.renderer;
    }

    return attachments.find(
      (attachment) => FontJsonStem(attachment.data.fontJson).toLowerCase().includes(wanted)
    )?.renderer;
  }

  /** Deliver a message to every behavior on this entity (their OnMessage hook). */
  SendMessage(message: string, source: Entity): void
  {
    for (const behavior of this.behaviors)
    {
      try
      {
        behavior.OnMessage(message, source);
      }
      catch (error)
      {
        console.error(`[bjs] OnMessage "${this.name}"`, error);
      }
    }
  }
}

/** Manifest font JSON path → file stem for GetTextRenderer lookup. */
function FontJsonStem(fontJson: string | null | undefined): string
{
  return fontJson?.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
}
