import { Behavior, exposed, type AnimatorController } from "b2bkit";

/**
 * Demo driver for an ANIMATOR component on the same entity (the armature).
 * Reads Move from the scene default Input Actions map and sets the animator
 * Speed float so Idle ↔ Walk transitions can fire.
 *
 * Authoring: armature with NLA Idle/Walk strips + ANIMATOR graph
 * (Parameter Speed, Idle→Walk when Speed > 0.1, Walk→Idle when Speed <= 0.1).
 */
export default class DriveAnimator extends Behavior
{
  @exposed({ min: 0, label: "Speed scale" })
  speedScale = 1;

  private animator: AnimatorController | undefined;

  OnStart(): void
  {
    const attachment = this.entity.GetAttachment("ANIMATOR");
    if (attachment === undefined || attachment.type !== "ANIMATOR")
    {
      console.warn(
        `[DriveAnimator] no ANIMATOR on "${this.entity.name}" — attach Animator in Blender`
      );
      return;
    }

    this.animator = attachment.behavior;
  }

  OnUpdate(_deltaSeconds: number): void
  {
    if (this.animator === undefined)
    {
      return;
    }

    const move = this.input?.FindAction("Move");
    const magnitude = move !== undefined ? move.ReadValue() : 0;
    this.animator.SetFloat("Speed", magnitude * this.speedScale);

    const jump = this.input?.actions.find((action) => action.name === "Jump");
    if (jump?.WasPressedThisFrame())
    {
      this.animator.SetTrigger("Jump");
    }
  }
}
