import { Behavior, exposed, Input } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/**
 * TEST/demo for the Input action map. Moves the node on the ground plane with
 * MoveX/MoveY (WASD, arrows, or a gamepad's left stick — no key codes here),
 * sprints while Sprint is held, and hops on Jump. Attach to any object.
 */
export default class InputMover extends Behavior
{
  @exposed({ min: 0.1, max: 30, label: "Speed (u/s)" })
  speed = 5;

  @exposed({ min: 1, max: 5, label: "Sprint multiplier" })
  sprintMultiplier = 2;

  @exposed({ min: 0, max: 10, label: "Hop height" })
  hopHeight = 1;

  private restY = 0;
  private hopVelocity = 0;

  /** Remember the rest height for the toy hop arc. */
  OnStart(): void
  {
    this.restY = this.node.position.y;
  }

  /** Read named actions/axes — bindings live in Input, not here. */
  OnUpdate(deltaSeconds: number): void
  {
    const moveX = Input.Axis("MoveX");
    const moveY = Input.Axis("MoveY");
    const currentSpeed = Input.IsDown("Sprint") ? this.speed * this.sprintMultiplier : this.speed;

    if (moveX !== 0 || moveY !== 0)
    {
      const step = new Vector3(moveX, 0, moveY).normalize().scale(currentSpeed * deltaSeconds);
      this.node.position.addInPlace(step);
    }

    // A toy ballistic hop, just to demonstrate the WasPressed edge.
    if (Input.WasPressed("Jump") && this.node.position.y <= this.restY)
    {
      this.hopVelocity = Math.sqrt(2 * 9.81 * this.hopHeight);
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
