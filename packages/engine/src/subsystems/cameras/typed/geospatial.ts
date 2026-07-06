import { Vector2, Vector3, type Scene } from "@babylonjs/core";
import {
  GeospatialCamera,
  ComputeYawPitchFromLookAtToRef,
} from "@babylonjs/core/Cameras/geospatialCamera";
import type { CameraComponent } from "../../../core/types";
import { ApplyGeospatialControlSpeeds } from "../speeds";
import type { TypedCameraResult } from "./shared";

/** Find where the exported view ray meets the planet sphere (centered at world origin). */
function IntersectRaySphere(
  rayOrigin: Vector3,
  rayDirection: Vector3,
  sphereRadius: number
): Vector3 | null
{
  const originAlongRay = Vector3.Dot(rayOrigin, rayDirection);
  const originLengthSquared = rayOrigin.lengthSquared();
  const discriminant =
    originAlongRay * originAlongRay - (originLengthSquared - sphereRadius * sphereRadius);

  if (discriminant < 0)
  {
    return null;
  }

  let distanceAlongRay = -originAlongRay - Math.sqrt(discriminant);
  if (distanceAlongRay < 0)
  {
    distanceAlongRay = -originAlongRay + Math.sqrt(discriminant);
    if (distanceAlongRay < 0)
    {
      return null;
    }
  }

  return rayOrigin.add(rayDirection.scale(distanceAlongRay));
}

/** Derive geospatial center/yaw/pitch/radius from an exported camera pose. */
function DeriveGeospatialPose(
  eyePosition: Vector3,
  forwardDirection: Vector3,
  planetRadius: number,
  useRightHandedSystem: boolean
): { center: Vector3; yaw: number; pitch: number; radius: number }
{
  const center =
    IntersectRaySphere(eyePosition, forwardDirection, planetRadius) ??
    eyePosition.clone().normalize().scale(planetRadius);

  const orbitRadius = Vector3.Distance(eyePosition, center);
  const lookAtDirection = center.subtractToRef(eyePosition, new Vector3()).normalize();
  const yawPitch = new Vector2();
  ComputeYawPitchFromLookAtToRef(
    lookAtDirection,
    center,
    useRightHandedSystem,
    0,
    yawPitch
  );

  return {
    center,
    yaw: yawPitch.x,
    pitch: yawPitch.y,
    radius: orbitRadius,
  };
}

/** GEOSPATIAL: orbit a spherical planet at world origin from the exported pose. */
export function BuildGeospatialCamera(
  scene: Scene,
  cameraName: string,
  eyePosition: Vector3,
  forwardDirection: Vector3,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  const planetRadius =
    cameraComponent.planetRadius !== undefined ? cameraComponent.planetRadius : 1;
  const geospatialCamera = new GeospatialCamera(cameraName, scene, { planetRadius });

  if (cameraComponent.lowerRadius > 0)
  {
    geospatialCamera.limits.radiusMin = cameraComponent.lowerRadius;
  }
  if (cameraComponent.upperRadius > 0)
  {
    geospatialCamera.limits.radiusMax = cameraComponent.upperRadius;
  }

  if (cameraComponent.checkCollisions === true)
  {
    geospatialCamera.checkCollisions = true;
  }

  const pose = DeriveGeospatialPose(
    eyePosition,
    forwardDirection,
    planetRadius,
    scene.useRightHandedSystem
  );
  geospatialCamera.center = pose.center;
  geospatialCamera.yaw = pose.yaw;
  geospatialCamera.pitch = pose.pitch;
  geospatialCamera.radius = pose.radius;

  ApplyGeospatialControlSpeeds(
    geospatialCamera,
    cameraComponent.orbitSpeed,
    cameraComponent.panSpeed,
    cameraComponent.zoomSpeed
  );

  if (cameraComponent.attachControl)
  {
    geospatialCamera.attachControl(true);
  }

  return { camera: geospatialCamera };
}
