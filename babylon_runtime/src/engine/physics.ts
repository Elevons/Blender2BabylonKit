import {
  Scene,
  AbstractMesh,
  TransformNode,
  Vector3,
  Quaternion,
  PhysicsAggregate,
  PhysicsBody,
  PhysicsShapeType,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsShapeCapsule,
} from "@babylonjs/core";
import type { ColliderComponent, RigidBodyComponent } from "./types";

function mapShapeType(shape: ColliderComponent["shape"]): PhysicsShapeType {
  switch (shape) {
    case "SPHERE": return PhysicsShapeType.SPHERE;
    case "CAPSULE": return PhysicsShapeType.CAPSULE;
    case "CYLINDER": return PhysicsShapeType.CYLINDER;
    case "CONVEX": return PhysicsShapeType.CONVEX_HULL;
    case "MESH": return PhysicsShapeType.MESH;
    default: return PhysicsShapeType.BOX;
  }
}

function motionTypeFor(body?: RigidBodyComponent): PhysicsMotionType {
  if (!body) return PhysicsMotionType.STATIC;
  switch (body.bodyType) {
    case "DYNAMIC": return PhysicsMotionType.DYNAMIC;
    case "KINEMATIC": return PhysicsMotionType.ANIMATED;
    default: return PhysicsMotionType.STATIC;
  }
}

/**
 * Combine a COLLIDER and/or RIGIDBODY component into a single Havok physics
 * body on the given node. Either may be absent:
 *   collider only            -> static (or trigger) body
 *   rigidbody only           -> dynamic body, auto-fit box collider
 *   both                     -> shape from collider, dynamics from rigidbody
 */
export function buildPhysics(
  node: TransformNode,
  collider: ColliderComponent | undefined,
  body: RigidBodyComponent | undefined,
  scene: Scene
): PhysicsBody | undefined {
  if (!scene.getPhysicsEngine()) {
    console.warn(`[bjs] physics not enabled; skipping body for "${node.name}". `
      + `Call enableHavokPhysics(scene) before loading.`);
    return undefined;
  }
  if (!(node instanceof AbstractMesh)) {
    console.warn(`[bjs] "${node.name}" is not a mesh; cannot attach a collider.`);
    return undefined;
  }

  const motion = motionTypeFor(body);
  const mass = body && body.bodyType === "DYNAMIC" ? body.mass : 0;
  const friction = body?.friction ?? 0.5;
  const restitution = body?.restitution ?? 0.2;
  const shapeType = mapShapeType(collider?.shape ?? "BOX");

  let pbody: PhysicsBody;

  if (!collider || collider.autoFit) {
    // PhysicsAggregate sizes the shape from the mesh bounding box automatically.
    const agg = new PhysicsAggregate(
      node, shapeType, { mass, friction, restitution }, scene
    );
    pbody = agg.body;
    if (collider?.isTrigger && agg.shape) agg.shape.isTrigger = true;
  } else {
    // Explicit, hand-authored shape (Babylon-space, Y-up).
    const center = new Vector3(...collider.center);
    let shape;
    switch (collider.shape) {
      case "SPHERE":
        shape = new PhysicsShapeSphere(center, collider.radius, scene);
        break;
      case "CAPSULE": {
        const half = Math.max(collider.height / 2 - collider.radius, 0);
        shape = new PhysicsShapeCapsule(
          center.add(new Vector3(0, half, 0)),
          center.add(new Vector3(0, -half, 0)),
          collider.radius, scene
        );
        break;
      }
      default: // BOX (and a reasonable fallback for CONVEX/MESH/CYLINDER manual)
        shape = new PhysicsShapeBox(
          center, Quaternion.Identity(), new Vector3(...collider.size), scene
        );
        break;
    }
    shape.material = { friction, restitution };
    if (collider.isTrigger) shape.isTrigger = true;

    pbody = new PhysicsBody(node, motion, false, scene);
    pbody.shape = shape;
    pbody.setMassProperties({ mass });
  }

  pbody.setMotionType(motion);
  if (body) {
    pbody.setLinearDamping(body.linearDamping);
    pbody.setAngularDamping(body.angularDamping);
  }
  return pbody;
}
