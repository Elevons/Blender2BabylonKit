import { Behavior, exposed } from "b2bkit";
import { KeyboardEventTypes, Vector3 } from "@babylonjs/core";
import type { Observer, KeyboardInfo } from "@babylonjs/core";

/**
 * Rotates the attached object with the WASD keys.
 *   A / D -> yaw   (turn left / right, around Y)
 *   W / S -> pitch (tilt up / down, around X)
 *
 * `speed` is editable per-object in Blender (degrees per second).
 * Note: the canvas needs keyboard focus, so click the viewport once first.
 */
export default class KeyboardRotate extends Behavior
{
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" })
  speed = 90;

  @exposed({ label: "Invert Pitch" })
  invertPitch = false;

  private pressedKeys = new Set<string>();
  private keyboardObserver: Observer<KeyboardInfo> | null = null;

  /** Track WASD key state via the scene's keyboard observable. */
  OnStart(): void
  {
    this.keyboardObserver = this.scene.onKeyboardObservable.add((keyboardInfo) =>
    {
      const key = keyboardInfo.event.key.toLowerCase();
      if (key.length !== 1 || !"wasd".includes(key))
      {
        return;
      }

      if (keyboardInfo.type === KeyboardEventTypes.KEYDOWN)
      {
        this.pressedKeys.add(key);
      }
      else if (keyboardInfo.type === KeyboardEventTypes.KEYUP)
      {
        this.pressedKeys.delete(key);
      }
    });
  }

  /** Apply yaw/pitch for the currently pressed keys. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.pressedKeys.size === 0)
    {
      return;
    }

    const radiansThisFrame = ((this.speed * Math.PI) / 180) * deltaSeconds;

    let yaw = 0;
    let pitch = 0;
    if (this.pressedKeys.has("a"))
    {
      yaw -= 1;
    }
    if (this.pressedKeys.has("d"))
    {
      yaw += 1;
    }
    if (this.pressedKeys.has("w"))
    {
      pitch -= 1;
    }
    if (this.pressedKeys.has("s"))
    {
      pitch += 1;
    }
    if (this.invertPitch)
    {
      pitch = -pitch;
    }

    if (yaw !== 0)
    {
      this.node.rotate(Vector3.Up(), yaw * radiansThisFrame);
    }
    if (pitch !== 0)
    {
      this.node.rotate(Vector3.Right(), pitch * radiansThisFrame);
    }
  }

  /** Detach the keyboard observable and clear pressed-key state. */
  OnDestroy(): void
  {
    if (this.keyboardObserver !== null)
    {
      this.scene.onKeyboardObservable.remove(this.keyboardObserver);
      this.keyboardObserver = null;
    }
    this.pressedKeys.clear();
  }
}
