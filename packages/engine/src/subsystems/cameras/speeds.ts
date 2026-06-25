import type { ArcRotateCamera, GeospatialCamera } from "@babylonjs/core";

/** Babylon defaults — higher author speed = lower sensibility / higher movement speed. */
const ARC_ORBIT_SENSIBILITY = 1000;
const ARC_PAN_SENSIBILITY = 1000;
const ARC_WHEEL_PRECISION = 3;

/** Map author speed multipliers onto ArcRotateCamera pointer/wheel inputs. */
export function ApplyArcRotateControlSpeeds(
  camera: ArcRotateCamera,
  orbitSpeed: number,
  panSpeed: number,
  zoomSpeed: number
): void
{
  camera.angularSensibilityX = ARC_ORBIT_SENSIBILITY / orbitSpeed;
  camera.angularSensibilityY = ARC_ORBIT_SENSIBILITY / orbitSpeed;
  camera.panningSensibility = ARC_PAN_SENSIBILITY / panSpeed;
  camera.wheelPrecision = ARC_WHEEL_PRECISION / zoomSpeed;
}

/** Scale GeospatialCamera movement speeds from author multipliers (1 = Babylon default). */
export function ApplyGeospatialControlSpeeds(
  camera: GeospatialCamera,
  orbitSpeed: number,
  panSpeed: number,
  zoomSpeed: number
): void
{
  const movement = camera.movement;
  movement.rotationXSpeed *= orbitSpeed;
  movement.rotationYSpeed *= orbitSpeed;
  movement.panSpeed *= panSpeed;
  movement.zoomSpeed *= zoomSpeed;
}
