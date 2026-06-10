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
import { ID_KEY } from "../core/types";
import type { ColliderComponent, RigidBodyComponent } from "../core/types";

/**
 * Physics subsystem: turns COLLIDER / RIGIDBODY components into Havok V2 bodies.
 * One node-attached path for everything — sound because levels import
 * right-handed (no glTF handedness mirror in the world matrices), so Havok can
 * decompose node transforms cleanly. See BuildPhysics for the case breakdown.
 */

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

/** Local-frame bounding box of a node's whole hierarchy. */
interface LocalBounds {
  center: Vector3;
  size: Vector3;
}

/**
 * The meshes whose geometry this node's collider should use: the node's own
 * mesh and its multi-material submeshes, but NOT meshes belonging to child
 * *entities* parented under it in Blender.
 *
 * The two cases look identical in the scene graph (both are descendant meshes),
 * so we discriminate by GUID: the glTF loader gives every authored object a
 * `bjs_id` in node.metadata.gltf.extras, while material-split submeshes
 * (`<name>_primitive0`, ...) inherit none. A descendant is "owned" only if no
 * node on its path up to `node` carries a bjs_id — i.e. it isn't, and isn't
 * under, a separate entity.
 */
function OwnedColliderMeshes(node: TransformNode): Mesh[]
{
  const owned: Mesh[] = [];

  for (const descendant of node.getChildMeshes(false))
  {
    if (!(descendant instanceof Mesh) || descendant.getTotalVertices() === 0)
    {
      continue;
    }

    // Walk up to `node`; if any intermediate node is its own entity, this mesh
    // belongs to that child entity, not to us.
    let belongsToChildEntity = false;
    let ancestor: TransformNode | null = descendant;
    while (ancestor !== null && ancestor !== node)
    {
      if (ancestor.metadata?.gltf?.extras?.[ID_KEY] !== undefined)
      {
        belongsToChildEntity = true;
        break;
      }
      ancestor = ancestor.parent as TransformNode | null;
    }

    if (!belongsToChildEntity)
    {
      owned.push(descendant);
    }
  }

  return owned;
}

/**
 * Compute a node's bounding box in its own local frame, over only the meshes
 * this collider owns (its own + multi-material submeshes, excluding child
 * entities). Corner-by-corner so the AABB transforms correctly into local space.
 */
function ComputeLocalBounds(node: TransformNode): LocalBounds
{
  node.computeWorldMatrix(true);

  const ownedMeshes = OwnedColliderMeshes(node);
  const inverseWorld = Matrix.Invert(node.getWorldMatrix());
  let localMin = new Vector3(Infinity, Infinity, Infinity);
  let localMax = new Vector3(-Infinity, -Infinity, -Infinity);

  // If the node itself is a mesh with geometry, include it alongside any owned
  // submeshes (a single-material mesh has no submesh children).
  const sources: Mesh[] = ownedMeshes.slice();
  if (node instanceof Mesh && node.getTotalVertices() > 0 && !sources.includes(node))
  {
    sources.push(node);
  }

  for (const mesh of sources)
  {
    mesh.computeWorldMatrix(true);
    const meshBounds = mesh.getBoundingInfo().boundingBox;

    // The 8 world-space corners of this mesh, pulled into the node's local frame.
    for (const worldCorner of meshBounds.vectorsWorld)
    {
      const localCorner = Vector3.TransformCoordinates(worldCorner, inverseWorld);
      localMin = Vector3.Minimize(localMin, localCorner);
      localMax = Vector3.Maximize(localMax, localCorner);
    }
  }

  return {
    center: localMin.add(localMax).scale(0.5),
    size: localMax.subtract(localMin),
  };
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
  const { center, size } = ComputeLocalBounds(node);

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

/** Clone one child mesh and bake its geometry into the wrapper's local frame. */
function CloneChildIntoLocalFrame(childMesh: Mesh, inverseWorld: Matrix): Mesh | null
{
  const clone = childMesh.clone(`${childMesh.name}__cphys`, null);
  if (clone === null)
  {
    return null;
  }

  clone.parent = null;
  clone.position = Vector3.Zero();
  clone.rotationQuaternion = Quaternion.Identity();
  clone.scaling = Vector3.One();
  clone.bakeTransformIntoVertices(childMesh.computeWorldMatrix(true).multiply(inverseWorld));
  return clone;
}

/**
 * Clone a wrapper node's per-material child meshes, bake each into the wrapper's
 * local frame, and merge them into one disposable mesh — geometry input for a
 * hull/mesh shape that must span the whole multi-material object. Returns
 * undefined when there is no usable geometry.
 */
function MergeChildrenIntoLocalMesh(node: TransformNode): Mesh | undefined
{
  const inverseWorld = Matrix.Invert(node.computeWorldMatrix(true));
  const clones: Mesh[] = [];

  // Only this node's own submeshes — not meshes belonging to child entities.
  for (const childMesh of OwnedColliderMeshes(node))
  {
    const clone = CloneChildIntoLocalFrame(childMesh, inverseWorld);
    if (clone !== null)
    {
      clones.push(clone);
    }
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

  return mergedMesh;
}

/**
 * Build a real CONVEX_HULL or MESH shape from a node's geometry. A single mesh
 * feeds its own geometry directly; a multi-material wrapper is merged first.
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

  const mergedMesh = MergeChildrenIntoLocalMesh(node);
  if (mergedMesh === undefined)
  {
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

/** Everything the per-case body builders share, computed once in BuildPhysics. */
interface BodyBuildInput {
  node: TransformNode;
  collider: ColliderComponent | undefined;
  scene: Scene;
  motion: PhysicsMotionType;
  mass: number;
  friction: number;
  restitution: number;
  isTrigger: boolean;
  isMesh: boolean;
  hasGeometry: boolean;
}

/** Apply shared material/trigger settings to a freshly built shape. */
function ConfigureShape(shape: PhysicsShape, input: BodyBuildInput): void
{
  shape.material = { friction: input.friction, restitution: input.restitution };
  if (input.isTrigger)
  {
    shape.isTrigger = true;
  }
}

/** Attach a configured shape to the node as a new PhysicsBody. */
function AttachShape(shape: PhysicsShape, input: BodyBuildInput): PhysicsBody
{
  ConfigureShape(shape, input);

  const physicsBody = new PhysicsBody(input.node, input.motion, false, input.scene);
  physicsBody.shape = shape;
  physicsBody.setMassProperties({ mass: input.mass });
  return physicsBody;
}

/** Gather the shared per-body inputs (dynamics, material, geometry facts) once. */
function BuildBodyInput(
  node: TransformNode,
  collider: ColliderComponent | undefined,
  body: RigidBodyComponent | undefined,
  scene: Scene
): BodyBuildInput
{
  const isMesh = node instanceof AbstractMesh && (node as AbstractMesh).getTotalVertices() > 0;

  return {
    node,
    collider,
    scene,
    motion: MotionTypeFor(body),
    mass: body !== undefined && body.bodyType === "DYNAMIC" ? body.mass : 0,
    friction: body?.friction ?? 0.5,
    restitution: body?.restitution ?? 0.2,
    isTrigger: collider !== undefined && collider.isTrigger,
    isMesh,
    hasGeometry: isMesh || OwnedColliderMeshes(node).length > 0,
  };
}

/**
 * CONVEX / MESH case: geometry-derived (manual size/center don't apply), with a
 * fitted-box fallback if the hull/mesh can't be built.
 */
function BuildGeometryShapeBody(input: BodyBuildInput, kind: "CONVEX" | "MESH"): PhysicsBody | undefined
{
  if (!input.hasGeometry)
  {
    console.warn(`[bjs] "${input.node.name}" has no mesh geometry for a ${kind} collider.`);
    return undefined;
  }

  let shape: PhysicsShape | undefined;
  try
  {
    shape = BuildHullOrMeshShape(input.node, input.isMesh, kind, input.scene);
  }
  catch (error)
  {
    console.warn(`[bjs] ${kind} shape failed for "${input.node.name}"; using a box.`, error);
  }

  if (shape === undefined)
  {
    shape = FitColliderShape(input.node, { ...(input.collider as ColliderComponent), shape: "BOX" }, input.scene);
  }

  return AttachShape(shape, input);
}

/**
 * Auto-fit primitive case: a PhysicsAggregate sizes the shape for real meshes;
 * multi-material wrapper nodes get a hierarchy-fitted shape instead (an
 * aggregate would call getTotalVertices on the non-mesh node and crash).
 */
function BuildAutoFitBody(input: BodyBuildInput, shapeKind: ColliderComponent["shape"]): PhysicsBody | undefined
{
  if (!input.hasGeometry)
  {
    console.warn(`[bjs] "${input.node.name}" has no mesh geometry to fit a collider.`);
    return undefined;
  }

  if (input.isMesh)
  {
    const aggregate = new PhysicsAggregate(
      input.node,
      MapShapeType(shapeKind),
      { mass: input.mass, friction: input.friction, restitution: input.restitution },
      input.scene
    );

    if (input.isTrigger && aggregate.shape)
    {
      aggregate.shape.isTrigger = true;
    }

    return aggregate.body;
  }

  return AttachShape(FitColliderShape(input.node, input.collider, input.scene), input);
}

/** Apply motion type and damping (the RIGIDBODY's dynamics) to a built body. */
function ApplyBodyDynamics(
  physicsBody: PhysicsBody,
  motion: PhysicsMotionType,
  body: RigidBodyComponent | undefined
): void
{
  physicsBody.setMotionType(motion);

  if (body !== undefined)
  {
    physicsBody.setLinearDamping(body.linearDamping);
    physicsBody.setAngularDamping(body.angularDamping);
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

  const shapeKind = collider?.shape ?? "BOX";
  const input = BuildBodyInput(node, collider, body, scene);

  let physicsBody: PhysicsBody | undefined;
  if (shapeKind === "CONVEX" || shapeKind === "MESH")
  {
    physicsBody = BuildGeometryShapeBody(input, shapeKind);
  }
  else if (collider === undefined || collider.autoFit)
  {
    physicsBody = BuildAutoFitBody(input, shapeKind);
  }
  else
  {
    physicsBody = AttachShape(BuildManualShape(collider, scene), input);
  }

  if (physicsBody === undefined)
  {
    return undefined;
  }

  ApplyBodyDynamics(physicsBody, input.motion, body);
  return physicsBody;
}
