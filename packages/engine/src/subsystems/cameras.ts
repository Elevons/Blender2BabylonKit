import {
  Scene,
  Camera,
  FreeCamera,
  UniversalCamera,
  ArcRotateCamera,
  FollowCamera,
  Vector3,
  Matrix,
  Tools,
} from "@babylonjs/core";
import type { Node, TransformNode } from "@babylonjs/core";
import type { CameraInfo, CameraComponent, CameraKeys } from "../core/types";
import type { Level } from "../core/Level";

interface KeyCodeSet {
  up: number[];
  down: number[];
  left: number[];
  right: number[];
}

const ARROW_KEYS: KeyCodeSet = { up: [38], down: [40], left: [37], right: [39] };
const WASD_KEYS: KeyCodeSet = { up: [87], down: [83], left: [65], right: [68] };

/** Resolve a key scheme to the keycode arrays Babylon's camera inputs expect. */
function ResolveKeys(keys: CameraKeys): KeyCodeSet
{
  switch (keys.scheme)
  {
    case "WASD":
      return WASD_KEYS;

    case "BOTH":
      return {
        up: [...ARROW_KEYS.up, ...WASD_KEYS.up],
        down: [...ARROW_KEYS.down, ...WASD_KEYS.down],
        left: [...ARROW_KEYS.left, ...WASD_KEYS.left],
        right: [...ARROW_KEYS.right, ...WASD_KEYS.right],
      };

    case "CUSTOM":
    {
      const toKeyCode = (character: string): number[] =>
        character.length > 0 ? [character.toUpperCase().charCodeAt(0)] : [];

      return {
        up: toKeyCode(keys.up),
        down: toKeyCode(keys.down),
        left: toKeyCode(keys.left),
        right: toKeyCode(keys.right),
      };
    }

    case "ARROWS":
    default:
      return ARROW_KEYS;
  }
}

/** Apply key bindings to a keyboard-driven camera (Free / Universal / ArcRotate). */
export function ApplyCameraKeys(camera: FreeCamera | ArcRotateCamera, keys: CameraKeys): void
{
  const keyCodes = ResolveKeys(keys);
  camera.keysUp = keyCodes.up;
  camera.keysDown = keyCodes.down;
  camera.keysLeft = keyCodes.left;
  camera.keysRight = keyCodes.right;
}

/**
 * Place a FollowCamera so it starts where the Blender camera was, relative to
 * the target: derive radius (horizontal distance), heightOffset (vertical), and
 * rotationOffset (angle around the target, accounting for the target's yaw).
 */
export function DeriveFollowFromPosition(
  camera: FollowCamera,
  targetNode: TransformNode,
  eyePosition: Vector3
): void
{
  targetNode.computeWorldMatrix(true);

  const targetPosition = targetNode.getAbsolutePosition();
  const delta = eyePosition.subtract(targetPosition);
  camera.heightOffset = delta.y;
  camera.radius = Math.hypot(delta.x, delta.z);

  // FollowCamera position uses: angle = toRadians(rotationOffset) + targetYaw.
  const rotationMatrix = new Matrix();
  targetNode.absoluteRotationQuaternion.toRotationMatrix(rotationMatrix);
  const targetYaw = Math.atan2(rotationMatrix.m[8], rotationMatrix.m[10]);
  camera.rotationOffset = Tools.ToDegrees(Math.atan2(delta.x, delta.z) - targetYaw);
}

/**
 * The glb already created a Babylon FreeCamera with the correct, coordinate-
 * converted transform. Its position/rotation live on the parent node chain
 * (Blender injects an orientation-correction node), so we walk up from each
 * camera to find the one under the GUID'd node.
 */
export function FindCameraForNode(scene: Scene, entityNode: Node): Camera | null
{
  for (const camera of scene.cameras)
  {
    let parent: Node | null = camera.parent;
    while (parent !== null)
    {
      if (parent === entityNode)
      {
        return camera;
      }
      parent = parent.parent;
    }
  }

  return scene.getCameraByName(entityNode.name) ?? null;
}

/**
 * Copy the Blender camera's settings onto the existing Babylon camera. Transform
 * is left untouched (it comes from the glb node), so the Blender camera acts as a
 * faithful stand-in. Returns the camera so the loader can make it active.
 */
export function ApplyBlenderCamera(
  scene: Scene,
  entityNode: Node,
  cameraInfo: CameraInfo
): Camera | null
{
  const camera = FindCameraForNode(scene, entityNode);
  if (camera === null)
  {
    console.warn(`[bjs] no Babylon camera for "${entityNode.name}" (${cameraInfo.type})`);
    return null;
  }

  camera.minZ = cameraInfo.clipStart;
  camera.maxZ = cameraInfo.clipEnd;

  if (cameraInfo.type === "ORTHO")
  {
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    // Ortho bounds (orthoLeft/Right/Top/Bottom) come through the glb's xmag/ymag.
  }
  else
  {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
    if (typeof cameraInfo.fov === "number")
    {
      camera.fov = cameraInfo.fov; // vertical FOV, radians
      camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
    }
  }

  return camera;
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

  if (cameraComponent.attachControl)
  {
    camera.attachControl(true);
  }
}

/** A camera-to-target binding deferred until every entity exists. */
interface CameraTargetBinding {
  guid: string;
  eye: Vector3;
}

/** What BuildTypedCamera (and its per-type helpers) hand back to the loader. */
interface TypedCameraResult {
  camera: Camera;
  followTarget?: CameraTargetBinding;
  offsetFollow?: CameraTargetBinding;
  arcTarget?: CameraTargetBinding;
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
  sourceCamera.computeWorldMatrix(true);
  const forwardRay = sourceCamera.getForwardRay(1);
  const eyePosition = forwardRay.origin.clone();
  const forwardDirection = forwardRay.direction.normalize();
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

/**
 * Collected camera-target bindings produced by BuildTypedCamera during the load
 * loop, resolved in a second pass once every entity exists.
 */
export interface CameraTargetSets {
  followCams: { cam: FollowCamera; guid: string; eye: Vector3; derive: boolean }[];
  arcCams: { cam: ArcRotateCamera; guid: string; eye: Vector3 }[];
  offsetCams: { cam: UniversalCamera; guid: string; eye: Vector3 }[];
}

/** Resolve FollowCamera lockedTarget bindings now that every entity exists. */
function ResolveFollowCameras(level: Level, followCams: CameraTargetSets["followCams"]): void
{
  for (const followBinding of followCams)
  {
    const targetEntity = level.ById(followBinding.guid);
    if (targetEntity === undefined)
    {
      console.warn(`[bjs] follow camera target ${followBinding.guid} not found`);
      continue;
    }

    followBinding.cam.lockedTarget = targetEntity.node as never;

    // Start where Blender framed it (relative to the target) unless overridden.
    if (followBinding.derive)
    {
      DeriveFollowFromPosition(followBinding.cam, targetEntity.node, followBinding.eye);
    }
  }
}

/** Re-pivot ArcRotate cameras onto their orbit-target object. */
function ResolveArcCameras(level: Level, arcCams: CameraTargetSets["arcCams"]): void
{
  for (const arcBinding of arcCams)
  {
    const targetEntity = level.ById(arcBinding.guid);
    if (targetEntity === undefined)
    {
      console.warn(`[bjs] arc camera target ${arcBinding.guid} not found`);
      continue;
    }

    targetEntity.node.computeWorldMatrix(true);
    arcBinding.cam.setTarget(targetEntity.node.getAbsolutePosition().clone());
    arcBinding.cam.setPosition(arcBinding.eye); // keep the Blender framing, new pivot
  }
}

/** Drive offset-follow cameras each frame to hold a constant world offset. */
function ResolveOffsetCameras(level: Level, offsetCams: CameraTargetSets["offsetCams"]): void
{
  for (const offsetBinding of offsetCams)
  {
    const targetEntity = level.ById(offsetBinding.guid);
    if (targetEntity === undefined)
    {
      console.warn(`[bjs] offset follow target ${offsetBinding.guid} not found`);
      continue;
    }

    const targetNode = targetEntity.node;
    targetNode.computeWorldMatrix(true);
    const worldOffset = offsetBinding.eye.subtract(targetNode.getAbsolutePosition());

    level.AddUpdater(() =>
    {
      const targetPosition = targetNode.getAbsolutePosition();
      offsetBinding.cam.position.copyFrom(targetPosition).addInPlace(worldOffset);
      offsetBinding.cam.setTarget(targetPosition);
    });
  }
}

/**
 * Resolve FollowCamera / ArcRotate orbit / offset-follow targets by GUID now
 * that all entities are built.
 */
export function ResolveCameraTargets(level: Level, sets: CameraTargetSets): void
{
  ResolveFollowCameras(level, sets.followCams);
  ResolveArcCameras(level, sets.arcCams);
  ResolveOffsetCameras(level, sets.offsetCams);
}
