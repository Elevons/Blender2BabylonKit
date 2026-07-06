import { Scene, Vector3, HavokPlugin } from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";

/** Options for {@link EnableHavokPhysics}. */
export interface HavokPhysicsOptions
{
  gravity?: Vector3;
  /** Havok multi-region radius when the scene uses floating origin. Default 100000. */
  floatingOriginWorldRadius?: number;
}

/** Enable Havok physics V2 on a scene. Call once before loading levels. */
export async function EnableHavokPhysics(
  scene: Scene,
  gravityOrOptions: Vector3 | HavokPhysicsOptions = new Vector3(0, -9.81, 0)
): Promise<void>
{
  const options: HavokPhysicsOptions =
    gravityOrOptions instanceof Vector3
      ? { gravity: gravityOrOptions }
      : gravityOrOptions;

  const gravity = options.gravity ?? new Vector3(0, -9.81, 0);
  const havokInstance = await HavokPhysics();
  scene.enablePhysics(
    gravity,
    new HavokPlugin(true, havokInstance, {
      floatingOriginWorldRadius: options.floatingOriginWorldRadius ?? 100_000,
    })
  );
}
