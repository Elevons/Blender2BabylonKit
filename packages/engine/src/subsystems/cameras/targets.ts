import { Vector3, Matrix, Tools, Quaternion } from "@babylonjs/core";
import type { Camera, FollowCamera, ArcRotateCamera, UniversalCamera, TransformNode } from "@babylonjs/core";
import type { CameraComponent } from "../../core/types";
import type { Level } from "../../core/Level";
import type { Entity } from "../../core/Entity";
import type { TypedCameraResult } from "./typed";

/**
 * Deferred camera targets: FOLLOW lockedTarget, ARC orbit pivot, and OFFSET
 * chase offset all reference entities by GUID, which may not exist while
 * cameras are being built. The loader queues bindings during the entity loop
 * (QueueCameraTargets) and resolves them in a post-pass (ResolveCameraTargets).
 */

/**
 * Collected camera-target bindings produced by BuildTypedCamera during the load
 * loop, resolved in a second pass once every entity exists.
 */
export interface CameraTargetSets {
  followCams: { followCamera: FollowCamera; guid: string; eye: Vector3; derive: boolean }[];
  arcCams: { arcCamera: ArcRotateCamera; guid: string; eye: Vector3; track: boolean }[];
  offsetCams: { offsetCamera: UniversalCamera; guid: string; eye: Vector3 }[];
  /** Typed cameras that replaced the glb camera — source entity node is synced each frame. */
  entityNodeSync: { camera: Camera; sourceEntityId: string }[];
}

/** A fresh, empty target collection for one level load pass. */
export function CreateCameraTargetSets(): CameraTargetSets
{
  return { followCams: [], arcCams: [], offsetCams: [], entityNodeSync: [] };
}

/**
 * Queue a typed camera's deferred target bindings (FOLLOW lockedTarget, ARC
 * orbit pivot, OFFSET chase offset) for the post-pass, once entities exist.
 */
export function QueueCameraTargets(
  built: TypedCameraResult,
  cameraComponent: CameraComponent,
  sets: CameraTargetSets,
  sourceEntityId: string
): void
{
  if (cameraComponent.cameraType !== "FREE")
  {
    sets.entityNodeSync.push({ camera: built.camera, sourceEntityId });
  }

  if (built.followTarget !== undefined)
  {
    sets.followCams.push({
      followCamera: built.camera as FollowCamera,
      guid: built.followTarget.guid,
      eye: built.followTarget.eye,
      derive: cameraComponent.useBlenderTransform,
    });
  }

  if (built.arcTarget !== undefined)
  {
    sets.arcCams.push({
      arcCamera: built.camera as ArcRotateCamera,
      guid: built.arcTarget.guid,
      eye: built.arcTarget.eye,
      track: cameraComponent.trackTarget,
    });
  }

  if (built.offsetFollow !== undefined)
  {
    sets.offsetCams.push({
      offsetCamera: built.camera as UniversalCamera,
      guid: built.offsetFollow.guid,
      eye: built.offsetFollow.eye,
    });
  }
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

    followBinding.followCamera.lockedTarget = targetEntity.node as never;

    // Start where Blender framed it (relative to the target) unless overridden.
    if (followBinding.derive)
    {
      DeriveFollowFromPosition(followBinding.followCamera, targetEntity.node, followBinding.eye);
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

    const targetNode = targetEntity.node;
    targetNode.computeWorldMatrix(true);
    arcBinding.arcCamera.setTarget(targetNode.getAbsolutePosition().clone());
    arcBinding.arcCamera.setPosition(arcBinding.eye); // keep the Blender framing, new pivot

    if (arcBinding.track)
    {
      level.AddUpdater(() =>
      {
        arcBinding.arcCamera.setTarget(targetNode.getAbsolutePosition());
      });
    }
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
      offsetBinding.offsetCamera.position.copyFrom(targetPosition).addInPlace(worldOffset);
      offsetBinding.offsetCamera.setTarget(targetPosition);
    });
  }
}

/** Copy a typed camera's world pose onto its source entity node (child probes follow). */
function SyncTypedCameraToEntityNode(camera: Camera, entity: Entity): void
{
  camera.computeWorldMatrix();
  const worldMatrix = camera.getWorldMatrix();
  const position = worldMatrix.getTranslation();
  const rotationQuaternion = Quaternion.FromRotationMatrix(worldMatrix);

  entity.node.setAbsolutePosition(position);
  if (entity.node.rotationQuaternion === null)
  {
    entity.node.rotationQuaternion = rotationQuaternion;
  }
  else
  {
    entity.node.rotationQuaternion.copyFrom(rotationQuaternion);
  }
}

/** Whether the entity's node subtree carries any physics body (worth syncing). */
function EntitySubtreeHasPhysics(entity: Entity): boolean
{
  if (entity.body !== undefined)
  {
    return true;
  }

  return entity.node
    .getDescendants(false)
    .some((descendant) => (descendant as TransformNode).physicsBody != null);
}

/**
 * Drive each typed camera's source entity node so physics children track the
 * view. Only wired when the subtree actually has a physics body — pure-visual
 * camera entities skip the per-frame matrix copy.
 */
function WireCameraEntityNodeSync(level: Level, syncEntries: CameraTargetSets["entityNodeSync"]): void
{
  for (const syncEntry of syncEntries)
  {
    const sourceEntity = level.ById(syncEntry.sourceEntityId);
    if (sourceEntity === undefined)
    {
      console.warn(`[bjs] camera entity sync: ${syncEntry.sourceEntityId} not found`);
      continue;
    }

    if (!EntitySubtreeHasPhysics(sourceEntity))
    {
      continue;
    }

    level.AddUpdater(() =>
    {
      SyncTypedCameraToEntityNode(syncEntry.camera, sourceEntity);
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
  WireCameraEntityNodeSync(level, sets.entityNodeSync);
}
