import { Behavior, exposed, inputMap } from "b2bkit";
import type { InputActionMap } from "b2bkit";
import { Vector3 } from "@babylonjs/core";
import { PlayerActions } from "../InputActions";

/**
 * TEST/demo for the Input Actions system. The @inputMap decorator injects the
 * "Player" Action Map; movement polls the Move action (WASD, arrows, or the
 * left stick — no key codes here), Sprint is polled as a button, and the hop
 * subscribes to Jump's `performed` callback. Attach to any object.
 */
export default class InputMover extends Behavior
{
  @exposed({ min: 0.1, max: 30, label: "Speed (u/s)" })
  speed = 5;

  @exposed({ min: 1, max: 5, label: "Sprint multiplier" })
  sprintMultiplier = 2;

  @exposed({ min: 0, max: 10, label: "Hop height" })
  hopHeight = 1;

  /** Injected by the loader before OnStart — bindings live in the map, not here. */
  @inputMap("Player") player!: InputActionMap;

  private restY = 0;
  private hopVelocity = 0;

  /** Remember the rest height and subscribe to Jump (callback-style input). */
  OnStart(): void
  {
    this.restY = this.node.position.y;

    this.player.FindAction(PlayerActions.Jump)?.performed.add(() =>
    {
      // A toy ballistic hop, just to demonstrate the performed callback.
      if (this.node.position.y <= this.restY)
      {
        this.hopVelocity = Math.sqrt(2 * 9.81 * this.hopHeight);
      }
    });
  }

  /** Poll named actions — Move is a Vector2, Sprint a button. */
  OnUpdate(deltaSeconds: number): void
  {
    const move = this.player.FindAction(PlayerActions.Move)?.ReadVector2() ?? { x: 0, y: 0 };
    const sprinting = this.player.FindAction(PlayerActions.Sprint)?.IsPressed() === true;
    const currentSpeed = sprinting ? this.speed * this.sprintMultiplier : this.speed;

    if (move.x !== 0 || move.y !== 0)
    {
      const step = new Vector3(move.x, 0, move.y).normalize().scale(currentSpeed * deltaSeconds);
      this.node.position.addInPlace(step);
    }

    if (this.hopVelocity !== 0 || this.node.position.y > this.restY)
    {
      this.hopVelocity -= 9.81 * deltaSeconds;
      this.node.position.y = Math.max(this.restY, this.node.position.y + this.hopVelocity * deltaSeconds);

      if (this.node.position.y === this.restY)
      {
        this.hopVelocity = 0;
      }
    }
  }
}
