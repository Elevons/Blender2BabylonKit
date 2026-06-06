import { Behavior, exposed } from "../engine";
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
export default class KeyboardRotate extends Behavior {
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" })
  speed = 90;

  @exposed({ label: "Invert Pitch" })
  invertPitch = false;

  private keys = new Set<string>();
  private observer: Observer<KeyboardInfo> | null = null;

  onStart() {
    this.observer = this.scene.onKeyboardObservable.add((info) => {
      const key = info.event.key.toLowerCase();
      if (key.length !== 1 || !"wasd".includes(key)) return;
      if (info.type === KeyboardEventTypes.KEYDOWN) this.keys.add(key);
      else if (info.type === KeyboardEventTypes.KEYUP) this.keys.delete(key);
    });
  }

  onUpdate(dt: number) {
    if (this.keys.size === 0) return;
    const step = ((this.speed * Math.PI) / 180) * dt; // radians this frame

    let yaw = 0;
    let pitch = 0;
    if (this.keys.has("a")) yaw -= 1;
    if (this.keys.has("d")) yaw += 1;
    if (this.keys.has("w")) pitch -= 1;
    if (this.keys.has("s")) pitch += 1;
    if (this.invertPitch) pitch = -pitch;

    if (yaw) this.node.rotate(Vector3.Up(), yaw * step);
    if (pitch) this.node.rotate(Vector3.Right(), pitch * step);
  }

  onDestroy() {
    if (this.observer) {
      this.scene.onKeyboardObservable.remove(this.observer);
      this.observer = null;
    }
    this.keys.clear();
  }
}
