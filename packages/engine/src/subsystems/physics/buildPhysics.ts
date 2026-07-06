import { TransformNode, type PhysicsBody, type PhysicsShape, type Scene } from "@babylonjs/core";
import type { ColliderComponent, RigidBodyComponent } from "../../core/types";
import {
  ApplyBodyDynamics,
  ApplyMassProperties,
  BuildCompoundBody,
  BuildSingleColliderBody,
} from "./bodyBuild";
import { BuildBodyInput } from "./bodyBuild";

/**
 * Combine one or more COLLIDER components and/or a RIGIDBODY into a single Havok
 * physics body on the given node. Either may be absent:
 *   collider only  -> static (or trigger) body
 *   rigidbody only -> dynamic body, auto-fit box collider
 *   both           -> shape from collider(s), dynamics from rigidbody
 *   multiple colliders -> PhysicsShapeContainer compound body
 *
 * The body is attached directly to the entity node. This relies on the level
 * being imported right-handed (LevelLoader sets scene.useRightHandedSystem), so
 * the node's world matrix has no handedness mirror and Havok can decompose it
 * cleanly for both placement and orientation.
 */
export function BuildPhysics(
  node: TransformNode,
  colliders: ColliderComponent[],
  body: RigidBodyComponent | undefined,
  scene: Scene,
  entityId?: string,
  shapesRegistry?: Map<string, PhysicsShape[]>
): PhysicsBody | undefined
{
  // getPhysicsEngine() is a Babylon "Nullable" that can be undefined at runtime,
  // so test truthiness rather than `=== null`.
  if (!scene.getPhysicsEngine())
  {
    console.warn(
      `[bjs] physics not enabled; skipping body for "${node.name}". ` +
      `Call EnableHavokPhysics(scene) before loading.`
    );
    return undefined;
  }

  const input = BuildBodyInput(node, colliders, body, scene, entityId, shapesRegistry);

  const physicsBody = colliders.length > 1
    ? BuildCompoundBody(input)
    : BuildSingleColliderBody(input);

  if (physicsBody === undefined)
  {
    return undefined;
  }

  ApplyMassProperties(physicsBody, node, body);
  ApplyBodyDynamics(physicsBody, input.motion, body);
  return physicsBody;
}
