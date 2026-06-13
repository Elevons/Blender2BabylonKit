import type { Control3D } from "@babylonjs/gui";
import type { Entity } from "../../core/Entity";
import type { Level } from "../../core/Level";
import type { Gui3DClickEvent } from "../../core/types";

/**
 * Click wiring for 3D GUI controls: each authored On Click row sends its
 * message to the target entity's behaviors (the same OnMessage hook trigger
 * colliders use), with the button's entity as the message source.
 */
export function WireClickEvents(
  control: Control3D,
  clickEvents: Gui3DClickEvent[],
  sourceEntity: Entity,
  level: Level
): void
{
  for (const clickEvent of clickEvents)
  {
    if (clickEvent.target === null)
    {
      console.warn(`[bjs] "${sourceEntity.name}": a 3D GUI click event has no target`);
      continue;
    }

    const targetEntity = level.ById(clickEvent.target);
    if (targetEntity === undefined)
    {
      console.warn(
        `[bjs] "${sourceEntity.name}": click target ${clickEvent.target} not found`
      );
      continue;
    }

    control.onPointerClickObservable.add(() =>
    {
      targetEntity.SendMessage(clickEvent.message, sourceEntity);
    });
  }
}
