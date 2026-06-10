import type { TransformNode, PhysicsBody, AnimationGroup, StaticSound } from "@babylonjs/core";
// Type-only import: Entity references Behavior, Behavior references Entity.
// `import type` erases at compile time, so the cycle is harmless at runtime.
import type { Behavior } from "../scripting/Behavior";

export class Entity
{
  readonly id: string;
  readonly name: string;
  readonly node: TransformNode;
  tag = "Untagged";
  behaviors: Behavior[] = [];
  body?: PhysicsBody;
  /** AnimationGroups from the glb that target this entity's node (or children). */
  animations: AnimationGroup[] = [];
  /** Sounds created from AUDIO components (audio engine v2 StaticSounds). */
  sounds: StaticSound[] = [];

  constructor(id: string, name: string, node: TransformNode)
  {
    this.id = id;
    this.name = name;
    this.node = node;
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
