import {
  Scene,
  AbstractMesh,
  Mesh,
  TransformNode,
  Vector3,
  Quaternion,
  Matrix,
  PhysicsAggregate,
  PhysicsBody,
  PhysicsShapeType,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeSphere,
  PhysicsShapeCapsule,
  PhysicsShapeCylinder,
  PhysicsShapeConvexHull,
  PhysicsShapeMesh,
  type PhysicsShape,
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
 * Auto-fit a primitive shape to a node's whole hierarchy, in the node's local
 * space. Used when the entity node is a TransformNode wrapping child meshes
 * (e.g. a multi-material Blender mesh, which imports as one child per material),
 * since PhysicsAggregate can't size a shape from a non-mesh node.
 */
function fitColliderShape(
  node: TransformNode,
  collider: ColliderComponent | undefined,
  scene: Scene
) {
  node.computeWorldMatrix(true);
  for (const m of node.getChildMeshes(false)) m.computeWorldMatrix(true);
  const { min, max } = node.getHierarchyBoundingVectors(true); // world space
  const inv = Matrix.Invert(node.getWorldMatrix());
  let lo = new Vector3(Infinity, Infinity, Infinity);
  let hi = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const x of [min.x, max.x]) {
    for (const y of [min.y, max.y]) {
      for (const z of [min.z, max.z]) {
        const l = Vector3.TransformCoordinates(new Vector3(x, y, z), inv);
        lo = Vector3.Minimize(lo, l);
        hi = Vector3.Maximize(hi, l);
      }
    }
  }
  const center = lo.add(hi).scale(0.5);
  const size = hi.subtract(lo);
  switch (collider?.shape) {
    case "SPHERE":
      return new PhysicsShapeSphere(center, Math.max(size.x, size.y, size.z) / 2, scene);
    case "CAPSULE": {
      const radius = Math.max(size.x, size.z) / 2;
      const half = Math.max(size.y / 2 - radius, 0);
      return new PhysicsShapeCapsule(
        center.add(new Vector3(0, half, 0)),
        center.add(new Vector3(0, -half, 0)),
        radius, scene
      );
    }
    case "CYLINDER": {
      const radius = Math.max(size.x, size.z) / 2;
      const half = size.y / 2;
      return new PhysicsShapeCylinder(
        center.add(new Vector3(0, half, 0)),
        center.add(new Vector3(0, -half, 0)),
        radius, scene
      );
    }
    default: // BOX (also the fallback for convex/mesh auto-fit on a wrapper)
      return new PhysicsShapeBox(center, Quaternion.Identity(), size, scene);
  }
}

/**
 * Build a real CONVEX_HULL or MESH shape from a node's geometry. For a single
 * mesh the shape reads the mesh directly. For a TransformNode wrapping per-
 * material child meshes (a multi-material Blender object), the children are
 * cloned, baked into the node's local frame, and merged into one temporary mesh
 * so the hull/triangle-soup spans the whole object. The shape is placed by the
 * node's transform (correct now that the glTF __root__ mirror is neutralized).
 * Returns undefined if there's no usable geometry.
 */
function buildHullOrMeshShape(
  node: TransformNode,
  isMesh: boolean,
  kind: "CONVEX" | "MESH",
  scene: Scene,
  worldSpace: boolean
): PhysicsShape | undefined {
  const make = (m: Mesh) =>
    kind === "CONVEX" ? new PhysicsShapeConvexHull(m, scene) : new PhysicsShapeMesh(m, scene);

  // Node-local single mesh: its own geometry, placed by the node transform.
  if (isMesh && !worldSpace) return make(node as Mesh);

  const sources: Mesh[] = isMesh
    ? [node as Mesh]
    : (node.getChildMeshes(false).filter(
        (m) => m instanceof Mesh && m.getTotalVertices() > 0
      ) as Mesh[]);
  if (sources.length === 0) return undefined;

  // worldSpace: bake each mesh's full world matrix -> verts in world coords (for
  // an identity-anchored body). Otherwise bake relative to the node's frame.
  const invWorld = worldSpace ? null : Matrix.Invert(node.computeWorldMatrix(true));
  const clones: Mesh[] = [];
  for (const m of sources) {
    const c = m.clone(`${m.name}__cphys`, null);
    if (!c) continue;
    c.parent = null;
    c.position = Vector3.Zero();
    c.rotationQuaternion = Quaternion.Identity();
    c.scaling = Vector3.One();
    const wm = m.computeWorldMatrix(true);
    c.bakeTransformIntoVertices(invWorld ? wm.multiply(invWorld) : wm);
    clones.push(c);
  }
  if (clones.length === 0) return undefined;

  const merged =
    clones.length === 1
      ? clones[0]
      : Mesh.MergeMeshes(clones, true, true, undefined, false, false);
  if (!merged) {
    clones.forEach((c) => c.dispose());
    return undefined;
  }
  merged.setEnabled(false);
  const shape = make(merged);
  merged.dispose(); // shape has copied the geometry into Havok
  return shape;
}

/** World-space, axis-aligned primitive fitted to a node's hierarchy bounds. */
function worldAabbShape(
  node: TransformNode,
  kind: ColliderComponent["shape"],
  scene: Scene
): PhysicsShape | undefined {
  node.computeWorldMatrix(true);
  for (const m of node.getChildMeshes(false)) m.computeWorldMatrix(true);
  const { min, max } = node.getHierarchyBoundingVectors(true);
  if (!isFinite(min.x)) return undefined;
  const center = min.add(max).scale(0.5);
  const size = max.subtract(min);
  switch (kind) {
    case "SPHERE":
      return new PhysicsShapeSphere(center, Math.max(size.x, size.y, size.z) / 2, scene);
    case "CAPSULE": {
      const r = Math.max(size.x, size.z) / 2;
      const half = Math.max(size.y / 2 - r, 0);
      return new PhysicsShapeCapsule(center.add(new Vector3(0, half, 0)), center.add(new Vector3(0, -half, 0)), r, scene);
    }
    case "CYLINDER": {
      const r = Math.max(size.x, size.z) / 2;
      const half = size.y / 2;
      return new PhysicsShapeCylinder(center.add(new Vector3(0, half, 0)), center.add(new Vector3(0, -half, 0)), r, scene);
    }
    default:
      return new PhysicsShapeBox(center, Quaternion.Identity(), size, scene);
  }
}

/** World-space hand-authored shape: the authored center is transformed exactly
 *  through the node's world matrix; box/sphere/capsule/cylinder are symmetric
 *  under the import mirror so an approximate world rotation is harmless. */
function worldManualShape(
  node: TransformNode,
  collider: ColliderComponent,
  scene: Scene
): PhysicsShape {
  const wm = node.computeWorldMatrix(true);
  const center = Vector3.TransformCoordinates(new Vector3(...collider.center), wm);
  const wq = new Quaternion();
  wm.decompose(undefined, wq, undefined);
  const localRot = collider.rotation ? Quaternion.FromArray(collider.rotation) : Quaternion.Identity();
  const rot = wq.multiply(localRot);
  const rm = new Matrix();
  Matrix.FromQuaternionToRef(rot, rm);
  const axisUp = (len: number) => Vector3.TransformNormal(new Vector3(0, len, 0), rm);
  switch (collider.shape) {
    case "SPHERE":
      return new PhysicsShapeSphere(center, collider.radius, scene);
    case "CAPSULE": {
      const up = axisUp(Math.max(collider.height / 2 - collider.radius, 0));
      return new PhysicsShapeCapsule(center.add(up), center.subtract(up), collider.radius, scene);
    }
    case "CYLINDER": {
      const up = axisUp(collider.height / 2);
      return new PhysicsShapeCylinder(center.add(up), center.subtract(up), collider.radius, scene);
    }
    default:
      return new PhysicsShapeBox(center, rot, new Vector3(...collider.size), scene);
  }
}

/**
 * Build a STATIC body whose shape is expressed entirely in world space and
 * attached to a fresh identity TransformNode. Because the body's node has no
 * transform, Havok never has to decompose the glTF import's mirror, so the
 * collider matches the rendered mesh in both position AND orientation.
 */
function buildStaticWorldBody(
  node: TransformNode,
  collider: ColliderComponent | undefined,
  scene: Scene,
  friction: number,
  restitution: number
): PhysicsBody | undefined {
  const kind = collider?.shape ?? "BOX";
  const isMesh = node instanceof AbstractMesh && (node as AbstractMesh).getTotalVertices() > 0;

  let shape: PhysicsShape | undefined;
  if (kind === "CONVEX" || kind === "MESH") {
    try {
      shape = buildHullOrMeshShape(node, isMesh, kind, scene, true);
    } catch (e) {
      console.warn(`[bjs] ${kind} shape failed for "${node.name}"; using a box.`, e);
    }
  } else if (collider && !collider.autoFit) {
    shape = worldManualShape(node, collider, scene);
  } else {
    shape = worldAabbShape(node, kind, scene);
  }
  if (!shape) shape = worldAabbShape(node, "BOX", scene);
  if (!shape) {
    console.warn(`[bjs] "${node.name}" has no geometry to build a collider.`);
    return undefined;
  }
  shape.material = { friction, restitution };
  if (collider?.isTrigger) shape.isTrigger = true;

  const anchor = new TransformNode(`${node.name}__col`, scene); // identity, scene root
  const pbody = new PhysicsBody(anchor, PhysicsMotionType.STATIC, false, scene);
  pbody.shape = shape;
  pbody.setMassProperties({ mass: 0 });
  return pbody;
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

  const motion = motionTypeFor(body);
  const mass = body && body.bodyType === "DYNAMIC" ? body.mass : 0;
  const friction = body?.friction ?? 0.5;
  const restitution = body?.restitution ?? 0.2;

  // STATIC colliders: build the shape in world space on an identity anchor so
  // the glTF import mirror can't flip or offset it. (The common case.)
  if (motion === PhysicsMotionType.STATIC) {
    const sbody = buildStaticWorldBody(node, collider, scene, friction, restitution);
    if (sbody) sbody.setMotionType(PhysicsMotionType.STATIC);
    return sbody;
  }

  // DYNAMIC / KINEMATIC: the body must drive the node, so attach to it directly.
  const shapeKind = collider?.shape ?? "BOX";
  const shapeType = mapShapeType(shapeKind);
  const isMesh = node instanceof AbstractMesh && (node as AbstractMesh).getTotalVertices() > 0;
  const childMeshes = node.getChildMeshes(false);
  const hasGeom = isMesh || childMeshes.some((m) => m.getTotalVertices() > 0);

  let pbody: PhysicsBody;

  if (shapeKind === "CONVEX" || shapeKind === "MESH") {
    // Geometry-derived shapes: manual size/center don't apply, so build from
    // the mesh(es) regardless of the auto-fit flag. Fall back to a fitted box
    // if the hull/mesh can't be built (e.g. degenerate geometry).
    if (!hasGeom) {
      console.warn(`[bjs] "${node.name}" has no mesh geometry for a ${shapeKind} collider.`);
      return undefined;
    }
    let shape: PhysicsShape | undefined;
    try {
      shape = buildHullOrMeshShape(node, isMesh, shapeKind, scene, false);
    } catch (e) {
      console.warn(`[bjs] ${shapeKind} shape failed for "${node.name}"; using a box.`, e);
    }
    if (!shape) shape = fitColliderShape(node, { ...(collider as ColliderComponent), shape: "BOX" }, scene);
    shape.material = { friction, restitution };
    if (collider?.isTrigger) shape.isTrigger = true;
    pbody = new PhysicsBody(node, motion, false, scene);
    pbody.shape = shape;
    pbody.setMassProperties({ mass });
  } else if (!collider || collider.autoFit) {
    if (!hasGeom) {
      console.warn(`[bjs] "${node.name}" has no mesh geometry to fit a collider.`);
      return undefined;
    }
    if (isMesh) {
      // Real mesh: let Havok fit the primitive shape from its bounds.
      const agg = new PhysicsAggregate(
        node, shapeType, { mass, friction, restitution }, scene
      );
      pbody = agg.body;
      if (collider?.isTrigger && agg.shape) agg.shape.isTrigger = true;
    } else {
      // Multi-material meshes import as a TransformNode wrapping per-material
      // child meshes; PhysicsAggregate can't size a primitive from a non-mesh
      // node, so fit a box/sphere/capsule/cylinder to the hierarchy bounds.
      const shape = fitColliderShape(node, collider, scene);
      shape.material = { friction, restitution };
      if (collider?.isTrigger) shape.isTrigger = true;
      pbody = new PhysicsBody(node, motion, false, scene);
      pbody.shape = shape;
      pbody.setMassProperties({ mass });
    }
  } else {
    // Explicit, hand-authored shape (Babylon-space, Y-up).
    const center = new Vector3(...collider.center);
    const rot = collider.rotation
      ? Quaternion.FromArray(collider.rotation)   // [x, y, z, w]
      : Quaternion.Identity();
    const rm = new Matrix();
    Matrix.FromQuaternionToRef(rot, rm);
    const axisUp = (len: number) => Vector3.TransformNormal(new Vector3(0, len, 0), rm);
    let shape;
    switch (collider.shape) {
      case "SPHERE":
        shape = new PhysicsShapeSphere(center, collider.radius, scene); // rotation N/A
        break;
      case "CAPSULE": {
        const up = axisUp(Math.max(collider.height / 2 - collider.radius, 0));
        shape = new PhysicsShapeCapsule(center.add(up), center.subtract(up), collider.radius, scene);
        break;
      }
      case "CYLINDER": {
        const up = axisUp(collider.height / 2);
        shape = new PhysicsShapeCylinder(center.add(up), center.subtract(up), collider.radius, scene);
        break;
      }
      default: // BOX
        shape = new PhysicsShapeBox(center, rot, new Vector3(...collider.size), scene);
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
