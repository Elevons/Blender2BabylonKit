import {
  Scene,
  AbstractMesh,
  Mesh,
  TransformNode,
  Vector3,
  Quaternion,
  Matrix,
  HavokPlugin,
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
import HavokPhysics from "@babylonjs/havok";
import type { ColliderComponent, RigidBodyComponent } from "../core/types";

/** Enable Havok physics V2 on a scene. Call once before loading levels. */
export async function EnableHavokPhysics(
  scene: Scene,
  gravity = new Vector3(0, -9.81, 0)
): Promise<void>
{
  const havokInstance = await HavokPhysics();
  scene.enablePhysics(gravity, new HavokPlugin(true, havokInstance));
}

/** Map our collider shape enum to Havok's primitive shape-type enum. */
function MapShapeType(shape: ColliderComponent["shape"]): PhysicsShapeType
{
  switch (shape)
  {
    case "SPHERE": return PhysicsShapeType.SPHERE;
    case "CAPSULE": return PhysicsShapeType.CAPSULE;
    case "CYLINDER": return PhysicsShapeType.CYLINDER;
    case "CONVEX": return PhysicsShapeType.CONVEX_HULL;
    case "MESH": return PhysicsShapeType.MESH;
    default: return PhysicsShapeType.BOX;
  }
}

/** Map a RIGIDBODY's body type to Havok's motion type (no body = static). */
function MotionTypeFor(body?: RigidBodyComponent): PhysicsMotionType
{
  if (body === undefined)
  {
    return PhysicsMotionType.STATIC;
  }

  switch (body.bodyType)
  {
    case "DYNAMIC": return PhysicsMotionType.DYNAMIC;
    case "KINEMATIC": return PhysicsMotionType.ANIMATED;
    default: return PhysicsMotionType.STATIC;
  }
}

/**
 * Auto-fit a primitive shape to a node's whole hierarchy, in the node's local
 * space. Used when the entity node is a TransformNode wrapping child meshes
 * (a multi-material Blender mesh, which imports as one child per material),
 * since PhysicsAggregate can't size a shape from a non-mesh node.
 */
function FitColliderShape(
  node: TransformNode,
  collider: ColliderComponent | undefined,
  scene: Scene
): PhysicsShape
{
  node.computeWorldMatrix(true);
  for (const childMesh of node.getChildMeshes(false))
  {
    childMesh.computeWorldMatrix(true);
  }

  // Transform the world-space hierarchy bounds back into the node's local frame.
  const worldBounds = node.getHierarchyBoundingVectors(true);
  const inverseWorld = Matrix.Invert(node.getWorldMatrix());
  let localMin = new Vector3(Infinity, Infinity, Infinity);
  let localMax = new Vector3(-Infinity, -Infinity, -Infinity);

  for (const cornerX of [worldBounds.min.x, worldBounds.max.x])
  {
    for (const cornerY of [worldBounds.min.y, worldBounds.max.y])
    {
      for (const cornerZ of [worldBounds.min.z, worldBounds.max.z])
      {
        const localCorner = Vector3.TransformCoordinates(new Vector3(cornerX, cornerY, cornerZ), inverseWorld);
        localMin = Vector3.Minimize(localMin, localCorner);
        localMax = Vector3.Maximize(localMax, localCorner);
      }
    }
  }

  const center = localMin.add(localMax).scale(0.5);
  const size = localMax.subtract(localMin);

  switch (collider?.shape)
  {
    case "SPHERE":
      return new PhysicsShapeSphere(center, Math.max(size.x, size.y, size.z) / 2, scene);

    case "CAPSULE":
    {
      const radius = Math.max(size.x, size.z) / 2;
      const halfHeight = Math.max(size.y / 2 - radius, 0);
      return new PhysicsShapeCapsule(
        center.add(new Vector3(0, halfHeight, 0)),
        center.add(new Vector3(0, -halfHeight, 0)),
        radius, scene
      );
    }

    case "CYLINDER":
    {
      const radius = Math.max(size.x, size.z) / 2;
      const halfHeight = size.y / 2;
      return new PhysicsShapeCylinder(
        center.add(new Vector3(0, halfHeight, 0)),
        center.add(new Vector3(0, -halfHeight, 0)),
        radius, scene
      );
    }

    default: // BOX (also the fallback for a convex/mesh shape that fails to build)
      return new PhysicsShapeBox(center, Quaternion.Identity(), size, scene);
  }
}

/**
 * Build a real CONVEX_HULL or MESH shape from a node's geometry. A single mesh
 * feeds its own geometry directly. A TransformNode wrapping per-material child
 * meshes has its children cloned, baked into the node's local frame, and merged
 * into one temporary mesh so the hull / triangle-soup spans the whole object.
 * Returns undefined if there is no usable geometry.
 */
function BuildHullOrMeshShape(
  node: TransformNode,
  isMesh: boolean,
  kind: "CONVEX" | "MESH",
  scene: Scene
): PhysicsShape | undefined
{
  const makeShape = (sourceMesh: Mesh): PhysicsShape =>
    kind === "CONVEX"
      ? new PhysicsShapeConvexHull(sourceMesh, scene)
      : new PhysicsShapeMesh(sourceMesh, scene);

  if (isMesh)
  {
    return makeShape(node as Mesh);
  }

  const inverseWorld = Matrix.Invert(node.computeWorldMatrix(true));
  const clones: Mesh[] = [];

  for (const childMesh of node.getChildMeshes(false))
  {
    if (!(childMesh instanceof Mesh) || childMesh.getTotalVertices() === 0)
    {
      continue;
    }

    const clone = childMesh.clone(`${childMesh.name}__cphys`, null);
    if (clone === null)
    {
      continue;
    }

    clone.parent = null;
    clone.position = Vector3.Zero();
    clone.rotationQuaternion = Quaternion.Identity();
    clone.scaling = Vector3.One();
    // Express the child's geometry in the wrapper node's local frame.
    clone.bakeTransformIntoVertices(childMesh.computeWorldMatrix(true).multiply(inverseWorld));
    clones.push(clone);
  }

  if (clones.length === 0)
  {
    return undefined;
  }

  const mergedMesh = clones.length === 1
    ? clones[0]
    : Mesh.MergeMeshes(clones, true, true, undefined, false, false);

  if (mergedMesh === null)
  {
    for (const clone of clones)
    {
      clone.dispose();
    }
    return undefined;
  }

  mergedMesh.setEnabled(false);
  const shape = makeShape(mergedMesh);
  mergedMesh.dispose(); // the shape has copied the geometry into Havok
  return shape;
}

/** Build a hand-authored primitive shape from Babylon-space (Y-up) dimensions. */
function BuildManualShape(collider: ColliderComponent, scene: Scene): PhysicsShape
{
  const center = new Vector3(...collider.center);
  const rotation = collider.rotation !== undefined
    ? Quaternion.FromArray(collider.rotation) // [x, y, z, w]
    : Quaternion.Identity();

  const rotationMatrix = new Matrix();
  Matrix.FromQuaternionToRef(rotation, rotationMatrix);
  const halfAxis = (length: number): Vector3 =>
    Vector3.TransformNormal(new Vector3(0, length, 0), rotationMatrix);

  switch (collider.shape)
  {
    case "SPHERE":
      return new PhysicsShapeSphere(center, collider.radius, scene); // rotation N/A

    case "CAPSULE":
    {
      const offset = halfAxis(Math.max(collider.height / 2 - collider.radius, 0));
      return new PhysicsShapeCapsule(center.add(offset), center.subtract(offset), collider.radius, scene);
    }

    case "CYLINDER":
    {
      const offset = halfAxis(collider.height / 2);
      return new PhysicsShapeCylinder(center.add(offset), center.subtract(offset), collider.radius, scene);
    }

    default: // BOX
      return new PhysicsShapeBox(center, rotation, new Vector3(...collider.size), scene);
  }
}

/**
 * Combine a COLLIDER and/or RIGIDBODY component into a single Havok physics body
 * on the given node. Either may be absent:
 *   collider only  -> static (or trigger) body
 *   rigidbody only -> dynamic body, auto-fit box collider
 *   both           -> shape from collider, dynamics from rigidbody
 *
 * The body is attached directly to the entity node. This relies on the level
 * being imported right-handed (LevelLoader sets scene.useRightHandedSystem), so
 * the node's world matrix has no handedness mirror and Havok can decompose it
 * cleanly for both placement and orientation.
 */
export function BuildPhysics(
  node: TransformNode,
  collider: ColliderComponent | undefined,
  body: RigidBodyComponent | undefined,
  scene: Scene
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

  const motion = MotionTypeFor(body);
  const mass = body !== undefined && body.bodyType === "DYNAMIC" ? body.mass : 0;
  const friction = body?.friction ?? 0.5;
  const restitution = body?.restitution ?? 0.2;
  const shapeKind = collider?.shape ?? "BOX";
  const isTrigger = collider !== undefined && collider.isTrigger;
  const isMesh = node instanceof AbstractMesh && (node as AbstractMesh).getTotalVertices() > 0;
  const hasGeometry = isMesh || node.getChildMeshes(false).some((mesh) => mesh.getTotalVertices() > 0);

  let physicsBody: PhysicsBody;

  // CONVEX / MESH: geometry-derived (manual size/center don't apply), with a
  // fitted-box fallback if the hull/mesh can't be built.
  if (shapeKind === "CONVEX" || shapeKind === "MESH")
  {
    if (!hasGeometry)
    {
      console.warn(`[bjs] "${node.name}" has no mesh geometry for a ${shapeKind} collider.`);
      return undefined;
    }

    let shape: PhysicsShape | undefined;
    try
    {
      shape = BuildHullOrMeshShape(node, isMesh, shapeKind, scene);
    }
    catch (error)
    {
      console.warn(`[bjs] ${shapeKind} shape failed for "${node.name}"; using a box.`, error);
    }

    if (shape === undefined)
    {
      shape = FitColliderShape(node, { ...(collider as ColliderComponent), shape: "BOX" }, scene);
    }

    shape.material = { friction, restitution };
    if (isTrigger)
    {
      shape.isTrigger = true;
    }

    physicsBody = new PhysicsBody(node, motion, false, scene);
    physicsBody.shape = shape;
    physicsBody.setMassProperties({ mass });
  }

  // Auto-fit primitive: aggregate for real meshes, hierarchy-fit for wrappers.
  else if (collider === undefined || collider.autoFit)
  {
    if (!hasGeometry)
    {
      console.warn(`[bjs] "${node.name}" has no mesh geometry to fit a collider.`);
      return undefined;
    }

    if (isMesh)
    {
      const aggregate = new PhysicsAggregate(
        node, MapShapeType(shapeKind), { mass, friction, restitution }, scene
      );
      physicsBody = aggregate.body;
      if (isTrigger && aggregate.shape)
      {
        aggregate.shape.isTrigger = true;
      }
    }
    else
    {
      const shape = FitColliderShape(node, collider, scene);
      shape.material = { friction, restitution };
      if (isTrigger)
      {
        shape.isTrigger = true;
      }

      physicsBody = new PhysicsBody(node, motion, false, scene);
      physicsBody.shape = shape;
      physicsBody.setMassProperties({ mass });
    }
  }

  // Explicit, hand-authored primitive shape.
  else
  {
    const shape = BuildManualShape(collider, scene);
    shape.material = { friction, restitution };
    if (isTrigger)
    {
      shape.isTrigger = true;
    }

    physicsBody = new PhysicsBody(node, motion, false, scene);
    physicsBody.shape = shape;
    physicsBody.setMassProperties({ mass });
  }

  physicsBody.setMotionType(motion);

  if (body !== undefined)
  {
    physicsBody.setLinearDamping(body.linearDamping);
    physicsBody.setAngularDamping(body.angularDamping);
  }

  return physicsBody;
}
