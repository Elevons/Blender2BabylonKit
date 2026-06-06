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
import type { CameraInfo, CameraComponent, CameraKeys } from "./types";

const ARROWS = { up: [38], down: [40], left: [37], right: [39] };
const WASD = { up: [87], down: [83], left: [65], right: [68] };

/** Resolve a key scheme to the keycode arrays Babylon's camera inputs expect. */
function resolveKeys(keys: CameraKeys): { up: number[]; down: number[]; left: number[]; right: number[] } {
  switch (keys.scheme) {
    case "WASD":
      return WASD;
    case "BOTH":
      return {
        up: [...ARROWS.up, ...WASD.up],
        down: [...ARROWS.down, ...WASD.down],
        left: [...ARROWS.left, ...WASD.left],
        right: [...ARROWS.right, ...WASD.right],
      };
    case "CUSTOM": {
      const code = (s: string) => (s && s.length ? [s.toUpperCase().charCodeAt(0)] : []);
      return { up: code(keys.up), down: code(keys.down), left: code(keys.left), right: code(keys.right) };
    }
    case "ARROWS":
    default:
      return ARROWS;
  }
}

/** Apply key bindings to a keyboard-driven camera (FreeCamera/UniversalCamera/ArcRotate). */
export function applyCameraKeys(cam: FreeCamera | ArcRotateCamera, keys: CameraKeys): void {
  const k = resolveKeys(keys);
  cam.keysUp = k.up;
  cam.keysDown = k.down;
  cam.keysLeft = k.left;
  cam.keysRight = k.right;
}

/**
 * Place a FollowCamera so it starts where the Blender camera was, relative to
 * the target: derive radius (horizontal distance), heightOffset (vertical), and
 * rotationOffset (angle around the target, accounting for the target's yaw).
 */
export function deriveFollowFromPosition(
  cam: FollowCamera,
  targetNode: TransformNode,
  eye: Vector3
): void {
  targetNode.computeWorldMatrix(true);
  const tp = targetNode.getAbsolutePosition();
  const delta = eye.subtract(tp);
  cam.heightOffset = delta.y;
  cam.radius = Math.hypot(delta.x, delta.z);
  // FollowCamera position uses: angle = toRadians(rotationOffset) + targetYaw.
  const rot = new Matrix();
  targetNode.absoluteRotationQuaternion.toRotationMatrix(rot);
  const yaw = Math.atan2(rot.m[8], rot.m[10]);
  cam.rotationOffset = Tools.ToDegrees(Math.atan2(delta.x, delta.z) - yaw);
}

/**
 * The glb (exported with cameras on) already created a Babylon FreeCamera with
 * the correct, coordinate-converted transform. Its position/rotation live on
 * the parent node chain (Blender injects an orientation-correction node), so we
 * walk up from each camera to find the one under the GUID'd node.
 */
export function findCameraForNode(scene: Scene, node: Node): Camera | null {
  for (const cam of scene.cameras) {
    let p: Node | null = cam.parent;
    while (p) {
      if (p === node) return cam;
      p = p.parent;
    }
  }
  return scene.getCameraByName(node.name) ?? null;
}

/**
 * Copy the Blender camera's settings onto the existing Babylon camera. Transform
 * is left untouched (it comes from the glb node), so the Blender camera acts as a
 * faithful stand-in. Returns the camera so the loader can make it active.
 */
export function applyBlenderCamera(
  scene: Scene,
  node: Node,
  info: CameraInfo
): Camera | null {
  const cam = findCameraForNode(scene, node);
  if (!cam) {
    console.warn(`[bjs] no Babylon camera for "${node.name}" (${info.type})`);
    return null;
  }

  cam.minZ = info.clipStart;
  cam.maxZ = info.clipEnd;

  if (info.type === "ORTHO") {
    cam.mode = Camera.ORTHOGRAPHIC_CAMERA;
    // Ortho bounds (orthoLeft/Right/Top/Bottom) come through the glb's xmag/ymag.
  } else {
    cam.mode = Camera.PERSPECTIVE_CAMERA;
    if (typeof info.fov === "number") {
      cam.fov = info.fov; // vertical FOV, radians
      cam.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
    }
  }
  return cam;
}

function copyLens(from: Camera, to: Camera): void {
  to.minZ = from.minZ;
  to.maxZ = from.maxZ;
  to.mode = from.mode;
  if (from.mode === Camera.PERSPECTIVE_CAMERA) {
    to.fov = from.fov;
    to.fovMode = from.fovMode;
  }
}

function configureFree(cam: FreeCamera, comp: CameraComponent): void {
  if (typeof comp.speed === "number") cam.speed = comp.speed;
  if (typeof comp.inertia === "number") cam.inertia = comp.inertia;
  applyCameraKeys(cam, comp.keys);
  if (comp.attachControl) cam.attachControl(true);
}

/**
 * Opt-in camera-type override (the CAMERA component). The faithful glb FreeCamera
 * is the default; this builds the requested type FROM that camera's world
 * transform, so it starts exactly where Blender framed it.
 *
 * - FREE: keep the (parented) glb FreeCamera, just configure it.
 * - UNIVERSAL/ARC/FOLLOW: build a fresh camera at the faithful camera's world
 *   position/forward, copy its lens, and dispose the original.
 *
 * FOLLOW needs a target entity that may not exist yet, so its `lockedTarget` is
 * left for the loader to resolve in the second pass (returns the target GUID).
 */
export function buildTypedCamera(
  scene: Scene,
  base: Camera,
  comp: CameraComponent
): {
  camera: Camera;
  followTarget?: { guid: string; eye: Vector3 };
  offsetFollow?: { guid: string; eye: Vector3 };
  arcTarget?: { guid: string; eye: Vector3 };
} {
  if (comp.cameraType === "FREE") {
    configureFree(base as FreeCamera, comp);
    return { camera: base };
  }

  // Derive world position + forward from the faithful camera, then replace it.
  base.computeWorldMatrix(true);
  const ray = base.getForwardRay(1);
  const pos = ray.origin.clone();
  const forward = ray.direction.normalize();
  const name = base.name + "_" + comp.cameraType.toLowerCase();
  const reference = base; // keep for lens copy until after build
  let camera: Camera;
  let followTarget: { guid: string; eye: Vector3 } | undefined;
  let offsetFollow: { guid: string; eye: Vector3 } | undefined;
  let arcTarget: { guid: string; eye: Vector3 } | undefined;

  if (comp.cameraType === "UNIVERSAL") {
    const uni = new UniversalCamera(name, pos, scene);
    uni.setTarget(pos.add(forward.scale(10)));
    configureFree(uni, comp);
    camera = uni;
  } else if (comp.cameraType === "ARC") {
    const radius = comp.radius > 0 ? comp.radius : 10;
    // Default pivot is a point ahead of the camera; if a target object is
    // referenced, the loader re-pivots onto it in the second pass.
    const target = pos.add(forward.scale(radius));
    const arc = new ArcRotateCamera(name, 0, Math.PI / 3, radius, target, scene);
    arc.setPosition(pos); // recompute alpha/beta/radius so it sits at the glb camera
    if (comp.lowerRadius > 0) arc.lowerRadiusLimit = comp.lowerRadius;
    if (comp.upperRadius > 0) arc.upperRadiusLimit = comp.upperRadius;
    applyCameraKeys(arc, comp.keys);
    if (comp.attachControl) arc.attachControl(true);
    camera = arc;
    if (comp.target) arcTarget = { guid: comp.target, eye: pos };
  } else {
    // FOLLOW
    if (comp.followMode === "OFFSET") {
      // Fixed world-offset chase cam: the loader drives it each frame to keep a
      // constant world offset from the target (set up in the second pass).
      const uni = new UniversalCamera(name, pos, scene);
      camera = uni;
      if (comp.target) offsetFollow = { guid: comp.target, eye: pos };
    } else {
      // ORBIT: Babylon FollowCamera (offset rotates with the target's yaw).
      const follow = new FollowCamera(name, pos, scene);
      follow.radius = comp.distance > 0 ? comp.distance : 10;
      follow.heightOffset = comp.height;
      follow.rotationOffset = comp.rotationOffset;
      // The pointer input logs a (harmless) multi-axis warning by default.
      const pointers = (follow.inputs.attached as Record<string, unknown>).pointers as
        | { warningEnable?: boolean }
        | undefined;
      if (pointers) pointers.warningEnable = false;
      if (comp.attachControl) follow.attachControl(true);
      camera = follow;
      if (comp.target) followTarget = { guid: comp.target, eye: pos };
    }
  }

  copyLens(reference, camera);
  reference.dispose(); // remove the now-unused faithful FreeCamera
  return { camera, followTarget, offsetFollow, arcTarget };
}
