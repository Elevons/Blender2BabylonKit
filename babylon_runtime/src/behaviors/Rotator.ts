import { Behavior, exposed } from "../engine";
import { Vector3 } from "@babylonjs/core";

/** Spins a node around an axis. */
export default class Rotator extends Behavior {
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" })
  speed = 45;

  @exposed({ label: "Axis" })
  axis: [number, number, number] = [0, 1, 0];

  private _axis = new Vector3(0, 1, 0);
  private _rad = 0;

  onStart() {
    this._axis = Vector3.FromArray(this.axis);
    this._rad = (this.speed * Math.PI) / 180;
  }

  onUpdate(dt: number) {
    this.node.rotate(this._axis, this._rad * dt);
  }
}
