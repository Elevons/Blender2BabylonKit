import { ArcRotateCamera, Vector3, type Scene } from "@babylonjs/core";
import type { CameraComponent } from "../../../core/types";
import { ApplyCameraKeys } from "../keys";
import { ApplyArcRotateControlSpeeds } from "../speeds";
import type { CameraTargetBinding, TypedCameraResult } from "./shared";

/** ARC: orbit camera pivoting ahead of the exported pose (or a target, later). */
export function BuildArcCamera(
  scene: Scene,
  cameraName: string,
  eyePosition: Vector3,
  forwardDirection: Vector3,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  const orbitRadius = cameraComponent.radius > 0 ? cameraComponent.radius : 10;

  // Default pivot is a point ahead of the camera; if a target object is
  // referenced, the loader re-pivots onto it in the second pass.
  const pivot = eyePosition.add(forwardDirection.scale(orbitRadius));
  const arcCamera = new ArcRotateCamera(cameraName, 0, Math.PI / 3, orbitRadius, pivot, scene);
  arcCamera.setPosition(eyePosition); // recompute alpha/beta/radius at the glb camera

  if (cameraComponent.lowerRadius > 0)
  {
    arcCamera.lowerRadiusLimit = cameraComponent.lowerRadius;
  }
  if (cameraComponent.upperRadius > 0)
  {
    arcCamera.upperRadiusLimit = cameraComponent.upperRadius;
  }

  ApplyCameraKeys(arcCamera, cameraComponent.keys);
  ApplyArcRotateControlSpeeds(
    arcCamera,
    cameraComponent.orbitSpeed,
    cameraComponent.panSpeed,
    cameraComponent.zoomSpeed
  );
  if (cameraComponent.attachControl)
  {
    arcCamera.attachControl(true);
  }

  const arcTarget: CameraTargetBinding | undefined = cameraComponent.target !== null
    ? { guid: cameraComponent.target, eye: eyePosition }
    : undefined;

  return { camera: arcCamera, arcTarget };
}
