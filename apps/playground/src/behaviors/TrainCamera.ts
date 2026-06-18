import { Behavior, exposed } from "@bjs/engine";
import type { Entity } from "@bjs/engine";
import { Vector3, UniversalCamera, Tools } from "@babylonjs/core";

/**
 * Creates a UniversalCamera that orbits around a target entity.
 * The orbit center updates each frame so the camera follows a moving target.
 */
export default class TrainCamera extends Behavior
{
  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  @exposed({ min: 0, max: 360, label: "Orbit Speed (deg/s)" })
  orbitSpeed = 45;

  @exposed({ min: 0.1, max: 100, label: "Radius" })
  radius = 10;

  @exposed({ min: -10, max: 10, label: "Height Offset" })
  heightOffset = 2;

  private camera: UniversalCamera | null = null;
  private angle = 0;
  private orbitSpeedRad = 0;

  /** Create the UniversalCamera and make it active. */
  OnStart(): void
  {
    this.orbitSpeedRad = Tools.ToRadians(this.orbitSpeed);

    // Create the camera at this entity's starting position
    const pos = this.node.getAbsolutePosition();
    this.camera = new UniversalCamera(
      this.node.name,
      pos,
      this.scene
    );
    this.scene.activeCamera = this.camera;
  }

  /** Update camera position and target each frame to orbit the moving target. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.target === null || this.camera === null)
    {
      return;
    }

    // Advance the orbit angle
    this.angle += this.orbitSpeedRad * deltaSeconds;

    // Get the target's current position
    const targetPosition = this.target.node.getAbsolutePosition();

    // Compute orbit offset in the XZ plane
    const offsetX = Math.cos(this.angle) * this.radius;
    const offsetZ = Math.sin(this.angle) * this.radius;

    // Camera position orbits around the target
    this.camera.position = new Vector3(
      targetPosition.x + offsetX,
      targetPosition.y + this.heightOffset,
      targetPosition.z + offsetZ
    );

    // Keep the camera looking at the target
    this.camera.setTarget(targetPosition);
  }
}
