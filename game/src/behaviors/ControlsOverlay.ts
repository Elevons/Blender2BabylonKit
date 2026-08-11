import { Button } from "@babylonjs/gui";
import type { Vector2WithInfo } from "@babylonjs/gui";
import type { Observer } from "@babylonjs/core";
import { Behavior, SetEntityActive } from "@bjs/engine";

/**
 * Start-screen controls overlay: wires the GOT IT button so the player can
 * dismiss this entity's fullscreen GUI after reading the bindings.
 */
export default class ControlsOverlay extends Behavior
{
  private dismissButton: Button | null = null;
  private dismissClickObserver: Observer<Vector2WithInfo> | null = null;

  /** Resolve the authored GOT IT button and hide this entity when it is pressed. */
  OnStart(): void
  {
    const texture = this.entity.GetGui("controls");
    if (texture === undefined)
    {
      console.warn(`[ControlsOverlay] "${this.entity.name}" has no GUI named "controls".`);
      return;
    }

    this.dismissButton = this.ResolveButton(texture, "dismissControlsBtn");
    if (this.dismissButton === null)
    {
      return;
    }

    this.dismissClickObserver = this.dismissButton.onPointerClickObservable.add(() => {
      this.Dismiss();
    });
  }

  /** Remove the click observer so a level reload does not keep a stale handler. */
  OnDestroy(): void
  {
    if (this.dismissButton !== null && this.dismissClickObserver !== null)
    {
      this.dismissButton.onPointerClickObservable.remove(this.dismissClickObserver);
    }

    this.dismissClickObserver = null;
    this.dismissButton = null;
  }

  /** Hide the StartGame entity (GUI + this behavior) for the rest of the session. */
  private Dismiss(): void
  {
    SetEntityActive(this.entity, false);
  }

  /** Look up a Button by exact control name; warn and return null on mismatch. */
  private ResolveButton(
    texture: { getControlByName(name: string): unknown },
    name: string
  ): Button | null
  {
    const control = texture.getControlByName(name);
    if (control instanceof Button)
    {
      return control;
    }

    console.warn(`[ControlsOverlay] GUI button "${name}" was not found or has an unexpected type.`);
    return null;
  }
}
