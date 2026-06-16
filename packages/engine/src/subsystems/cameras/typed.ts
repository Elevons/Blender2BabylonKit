import {
  Camera,
  FreeCamera,
  UniversalCamera,
  ArcRotateCamera,
  FollowCamera,
  Vector3,
} from "@babylonjs/core";
import type { Scene } from "@babylonjs/core";
import type { CameraComponent } from "../../core/types";
import { ApplyCameraKeys } from "./keys";

/**
 * Typed camera overrides (the CAMERA component): replace the glb's faithful
 * FreeCamera with the requested camera type, built at the exported pose.
 * Target resolution happens later, in targets.ts, once every entity exists.
 */

/** A camera-to-target binding deferred until every entity exists. */
export interface CameraTargetBinding {
  guid: string;
  eye: Vector3;
}

/** What BuildTypedCamera (and its per-type helpers) hand back to the loader. */
export interface TypedCameraResult {
  camera: Camera;
  followTarget?: CameraTargetBinding;
  offsetFollow?: CameraTargetBinding;
  arcTarget?: CameraTargetBinding;
}

/** Copy lens settings (clip planes, projection mode, FOV) between cameras. */
function CopyLens(source: Camera, destination: Camera): void
{
  destination.minZ = source.minZ;
  destination.maxZ = source.maxZ;
  destination.mode = source.mode;

  if (source.mode === Camera.PERSPECTIVE_CAMERA)
  {
    destination.fov = source.fov;
    destination.fovMode = source.fovMode;
  }
}

/**
 * Keep a free-look camera level with the horizon. A free camera only stays
 * upright when it rotates in WORLD space: Babylon builds an upright local view
 * but then re-multiplies it by the parent's world matrix, so the glb camera's
 * orientation-correction parent tilts every yaw/pitch. We bake the current
 * world pose, detach from that parent, and pin look-at to world up; a per-frame
 * guard drops any residual roll (e.g. from gamepad/touch input).
 */
function LockCameraRoll(camera: FreeCamera): void
{
  if (camera.parent !== null)
  {
    const worldPosition = camera.getWorldMatrix().getTranslation();
    const worldForward = camera.getForwardRay().direction.normalize();
    camera.parent = null;
    camera.position.copyFrom(worldPosition);
    camera.rotationQuaternion = null;
    camera.setTarget(worldPosition.add(worldForward));
  }
  else if (camera.rotationQuaternion !== null && camera.rotationQuaternion !== undefined)
  {
    camera.rotationQuaternion.toEulerAnglesToRef(camera.rotation);
    camera.rotationQuaternion = null;
  }

  camera.upVector.set(0, 1, 0);
  camera.onAfterCheckInputsObservable.add(() =>
  {
    camera.rotation.z = 0;
  });
}

/** Apply speed/inertia/keys/attach to a free-fly camera from the component. */
function ConfigureFreeCamera(camera: FreeCamera, cameraComponent: CameraComponent): void
{
  if (typeof cameraComponent.speed === "number")
  {
    camera.speed = cameraComponent.speed;
  }
  if (typeof cameraComponent.inertia === "number")
  {
    camera.inertia = cameraComponent.inertia;
  }

  ApplyCameraKeys(camera, cameraComponent.keys);

  if (cameraComponent.lockRoll)
  {
    LockCameraRoll(camera);
  }

  if (cameraComponent.attachControl)
  {
    camera.attachControl(true);
  }
}

/** UNIVERSAL: a free-fly camera at the exported pose, with controls applied. */
function BuildUniversalCamera(
  scene: Scene,
  cameraName: string,
  eyePosition: Vector3,
  forwardDirection: Vector3,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  const universalCamera = new UniversalCamera(cameraName, eyePosition, scene);
  universalCamera.setTarget(eyePosition.add(forwardDirection.scale(10)));
  ConfigureFreeCamera(universalCamera, cameraComponent);
  return { camera: universalCamera };
}

/** ARC: orbit camera pivoting ahead of the exported pose (or a target, later). */
function BuildArcCamera(
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
  if (cameraComponent.attachControl)
  {
    arcCamera.attachControl(true);
  }

  const arcTarget = cameraComponent.target !== null
    ? { guid: cameraComponent.target, eye: eyePosition }
    : undefined;

  return { camera: arcCamera, arcTarget };
}

/** FOLLOW (OFFSET mode): a UniversalCamera the loader drives to keep a fixed world offset. */
function BuildOffsetFollowCamera(
  scene: Scene,
  cameraName: string,
  eyePosition: Vector3,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  const universalCamera = new UniversalCamera(cameraName, eyePosition, scene);

  const offsetFollow = cameraComponent.target !== null
    ? { guid: cameraComponent.target, eye: eyePosition }
    : undefined;

  return { camera: universalCamera, offsetFollow };
}

/** FOLLOW (ORBIT mode): Babylon FollowCamera (offset rotates with the target's yaw). */
function BuildFollowCamera(
  scene: Scene,
  cameraName: string,
  eyePosition: Vector3,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  const followCamera = new FollowCamera(cameraName, eyePosition, scene);
  followCamera.radius = cameraComponent.distance > 0 ? cameraComponent.distance : 10;
  followCamera.heightOffset = cameraComponent.height;
  followCamera.rotationOffset = cameraComponent.rotationOffset;

  // The pointer input logs a (harmless) multi-axis warning by default.
  const pointerInput = (followCamera.inputs.attached as Record<string, unknown>).pointers as
    | { warningEnable?: boolean }
    | undefined;
  if (pointerInput !== undefined)
  {
    pointerInput.warningEnable = false;
  }

  if (cameraComponent.attachControl)
  {
    followCamera.attachControl(true);
  }

  const followTarget = cameraComponent.target !== null
    ? { guid: cameraComponent.target, eye: eyePosition }
    : undefined;

  return { camera: followCamera, followTarget };
}

/**
 * Opt-in camera-type override (the CAMERA component). The faithful glb FreeCamera
 * is the default; this builds the requested type FROM that camera's world
 * transform, so it starts exactly where Blender framed it.
 *
 * - FREE: keep the (parented) glb FreeCamera, just configure it.
 * - UNIVERSAL / ARC / FOLLOW: build a fresh camera at the faithful camera's world
 *   position/forward, copy its lens, and dispose the original.
 *
 * FOLLOW/ARC need a target entity that may not exist yet, so the target GUID is
 * returned for the loader to resolve in the second pass.
 */
export function BuildTypedCamera(
  scene: Scene,
  sourceCamera: Camera,
  cameraComponent: CameraComponent
): TypedCameraResult
{
  if (cameraComponent.cameraType === "FREE")
  {
    ConfigureFreeCamera(sourceCamera as FreeCamera, cameraComponent);
    return { camera: sourceCamera };
  }

  // Derive world position + forward from the faithful camera, then replace it.
  // Blender parents the glb camera under an orientation-correction node, so its
  // transform lives on the parent chain and camera.position is the (≈origin)
  // LOCAL offset. getForwardRay's origin is that local position, so we take the
  // eye from the world matrix translation instead; only the ray's (world-space)
  // direction is reliable.
  const worldMatrix = sourceCamera.computeWorldMatrix();
  const eyePosition = worldMatrix.getTranslation();
  const forwardDirection = sourceCamera.getForwardRay().direction.normalize();
  const cameraName = sourceCamera.name + "_" + cameraComponent.cameraType.toLowerCase();

  let result: TypedCameraResult;
  if (cameraComponent.cameraType === "UNIVERSAL")
  {
    result = BuildUniversalCamera(scene, cameraName, eyePosition, forwardDirection, cameraComponent);
  }
  else if (cameraComponent.cameraType === "ARC")
  {
    result = BuildArcCamera(scene, cameraName, eyePosition, forwardDirection, cameraComponent);
  }
  else if (cameraComponent.followMode === "OFFSET")
  {
    result = BuildOffsetFollowCamera(scene, cameraName, eyePosition, cameraComponent);
  }
  else
  {
    result = BuildFollowCamera(scene, cameraName, eyePosition, cameraComponent);
  }

  CopyLens(sourceCamera, result.camera);
  sourceCamera.dispose(); // remove the now-unused faithful FreeCamera

  return result;
}
