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
  PhysicsShapeContainer,
  type PhysicsShape,
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { ID_KEY } from "../core/types";
import type { ColliderComponent, RigidBodyComponent } from "../core/types";
import { LocalScaleAxes, ApplyObjectScaleEnabled } from "../core/nodeScale";

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
    case "ANIMATED": return PhysicsMotionType.ANIMATED;
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

/** Scale a local AABB by the node's local scale (for applyObjectScale auto-fit). */
function ScaleLocalBounds(bounds: LocalBounds, node: TransformNode): LocalBounds
{
  const { sx, sy, sz } = LocalScaleAxes(node);

  return {
    center: new Vector3(bounds.center.x * sx, bounds.center.y * sy, bounds.center.z * sz),
    size: new Vector3(bounds.size.x * sx, bounds.size.y * sy, bounds.size.z * sz),
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
  let { center, size } = ComputeLocalBounds(node);
  if (ApplyObjectScaleEnabled(collider?.applyObjectScale))
  {
    ({ center, size } = ScaleLocalBounds({ center, size }, node));
  }

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
 * When applyObjectScale is on, local scale is baked into vertices (same rule as
 * manual primitives). Returns undefined if there is no usable geometry.
 */
function BakeColliderScaleIntoMesh(
  mesh: Mesh,
  node: TransformNode,
  collider: ColliderComponent | undefined
): { mesh: Mesh; disposeSource: boolean }
{
  if (!ApplyObjectScaleEnabled(collider?.applyObjectScale))
  {
    return { mesh, disposeSource: false };
  }

  const { sx, sy, sz } = LocalScaleAxes(node);
  const scaled = mesh.clone(`${mesh.name}__colliderScale`, null);
  if (scaled === null)
  {
    return { mesh, disposeSource: false };
  }

  scaled.bakeTransformIntoVertices(Matrix.Scaling(sx, sy, sz));
  return { mesh: scaled, disposeSource: true };
}

function BuildHullOrMeshShape(
  node: TransformNode,
  isMesh: boolean,
  kind: "CONVEX" | "MESH",
  scene: Scene,
  collider?: ColliderComponent
): PhysicsShape | undefined
{
  const makeShape = (sourceMesh: Mesh): PhysicsShape =>
    kind === "CONVEX"
      ? new PhysicsShapeConvexHull(sourceMesh, scene)
      : new PhysicsShapeMesh(sourceMesh, scene);

  if (isMesh)
  {
    const { mesh: sourceMesh, disposeSource } = BakeColliderScaleIntoMesh(
      node as Mesh, node, collider
    );
    const shape = makeShape(sourceMesh);
    if (disposeSource)
    {
      sourceMesh.dispose();
    }
    return shape;
  }

  const mergedMesh = MergeChildrenIntoLocalMesh(node);
  if (mergedMesh === undefined)
  {
    return undefined;
  }

  mergedMesh.setEnabled(false);
  const { mesh: sourceMesh, disposeSource } = BakeColliderScaleIntoMesh(mergedMesh, node, collider);
  if (disposeSource)
  {
    mergedMesh.dispose();
  }

  const shape = makeShape(sourceMesh);
  sourceMesh.dispose();
  return shape;
}

/** Multiply manual collider dimensions by the entity node's scale when authored. */
function ApplyObjectScaleToCollider(
  collider: ColliderComponent,
  node: TransformNode
): ColliderComponent
{
  if (!ApplyObjectScaleEnabled(collider.applyObjectScale))
  {
    return collider;
  }

  const { sx, sy, sz } = LocalScaleAxes(node);

  const scaled: ColliderComponent = {
    ...collider,
    size: [collider.size[0] * sx, collider.size[1] * sy, collider.size[2] * sz],
    center: [collider.center[0] * sx, collider.center[1] * sy, collider.center[2] * sz],
    radius: collider.radius,
    height: collider.height,
  };

  switch (collider.shape)
  {
    case "SPHERE":
      scaled.radius = collider.radius * Math.max(sx, sy, sz);
      break;
    case "CAPSULE":
    case "CYLINDER":
      scaled.radius = collider.radius * Math.max(sx, sz);
      scaled.height = collider.height * sy;
      break;
    default:
      break;
  }

  return scaled;
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
  colliders: ColliderComponent[];
  scene: Scene;
  motion: PhysicsMotionType;
  mass: number;
  friction: number;
  restitution: number;
  isMesh: boolean;
  hasGeometry: boolean;
  startAsleep: boolean;
}

/** Apply material and trigger flag to one collider shape (required on container children). */
function ConfigureColliderShape(
  shape: PhysicsShape,
  collider: ColliderComponent,
  friction: number,
  restitution: number
): void
{
  shape.material = { friction, restitution };
  if (collider.isTrigger)
  {
    shape.isTrigger = true;
  }
}

/** Apply shared material/trigger settings to a freshly built shape. */
function ConfigureShape(shape: PhysicsShape, input: BodyBuildInput): void
{
  const collider = input.colliders[0];
  if (collider !== undefined)
  {
    ConfigureColliderShape(shape, collider, input.friction, input.restitution);
  }
  else
  {
    shape.material = { friction: input.friction, restitution: input.restitution };
  }
}

/** Attach a configured shape to the node as a new PhysicsBody. */
function AttachShape(shape: PhysicsShape, input: BodyBuildInput): PhysicsBody
{
  ConfigureShape(shape, input);

  const physicsBody = new PhysicsBody(input.node, input.motion, input.startAsleep, input.scene);
  physicsBody.shape = shape;
  return physicsBody;
}

/** Resolve center of mass for a dynamic rigidbody, or undefined to let Havok derive it from the shape. */
function ResolveCenterOfMass(
  node: TransformNode,
  body: RigidBodyComponent | undefined
): Vector3 | undefined
{
  if (body === undefined || body.bodyType !== "DYNAMIC")
  {
    return undefined;
  }

  if (body.centerOfMassAutoFit === true)
  {
    return ComputeLocalBounds(node).center;
  }

  if (body.centerOfMassAutoFit === false && body.centerOfMass !== undefined)
  {
    return new Vector3(...body.centerOfMass);
  }

  return undefined;
}

/** Apply mass and optional center-of-mass override after the collision shape is attached. */
function ApplyMassProperties(
  physicsBody: PhysicsBody,
  node: TransformNode,
  body: RigidBodyComponent | undefined
): void
{
  const mass = body !== undefined && body.bodyType === "DYNAMIC" ? body.mass : 0;
  const centerOfMass = ResolveCenterOfMass(node, body);

  if (centerOfMass !== undefined)
  {
    physicsBody.setMassProperties({ mass, centerOfMass });
  }
  else
  {
    physicsBody.setMassProperties({ mass });
  }
}

/** Gather the shared per-body inputs (dynamics, material, geometry facts) once. */
function BuildBodyInput(
  node: TransformNode,
  colliders: ColliderComponent[],
  body: RigidBodyComponent | undefined,
  scene: Scene
): BodyBuildInput
{
  const isMesh = node instanceof AbstractMesh && (node as AbstractMesh).getTotalVertices() > 0;

  return {
    node,
    colliders,
    scene,
    motion: MotionTypeFor(body),
    mass: body !== undefined && body.bodyType === "DYNAMIC" ? body.mass : 0,
    friction: body?.friction ?? 0.5,
    restitution: body?.restitution ?? 0.2,
    isMesh,
    hasGeometry: isMesh || OwnedColliderMeshes(node).length > 0,
    startAsleep: body?.startAsleep === true,
  };
}

/**
 * CONVEX / MESH case: geometry-derived (manual size/center don't apply), with a
 * fitted-box fallback if the hull/mesh can't be built.
 */
function BuildGeometryColliderShape(
  node: TransformNode,
  collider: ColliderComponent,
  isMesh: boolean,
  hasGeometry: boolean,
  scene: Scene
): PhysicsShape | undefined
{
  if (!hasGeometry)
  {
    console.warn(`[bjs] "${node.name}" has no mesh geometry for a ${collider.shape} collider.`);
    return undefined;
  }

  let shape: PhysicsShape | undefined;
  try
  {
    shape = BuildHullOrMeshShape(
      node, isMesh, collider.shape as "CONVEX" | "MESH", scene, collider
    );
  }
  catch (error)
  {
    console.warn(`[bjs] ${collider.shape} shape failed for "${node.name}"; using a box.`, error);
  }

  if (shape === undefined)
  {
    shape = FitColliderShape(node, { ...collider, shape: "BOX" }, scene);
  }

  return shape;
}

function BuildGeometryShapeBody(input: BodyBuildInput, kind: "CONVEX" | "MESH"): PhysicsBody | undefined
{
  const collider = input.colliders[0];
  if (collider === undefined)
  {
    return undefined;
  }

  const shape = BuildGeometryColliderShape(
    input.node, collider, input.isMesh, input.hasGeometry, input.scene
  );
  if (shape === undefined)
  {
    return undefined;
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

  const collider = input.colliders[0];

  if (input.isMesh && !ApplyObjectScaleEnabled(collider?.applyObjectScale))
  {
    const aggregate = new PhysicsAggregate(
      input.node,
      MapShapeType(shapeKind),
      {
        mass: input.mass,
        friction: input.friction,
        restitution: input.restitution,
        startAsleep: input.startAsleep,
      },
      input.scene
    );

    if (collider?.isTrigger === true && aggregate.shape)
    {
      aggregate.shape.isTrigger = true;
    }

    return aggregate.body;
  }

  return AttachShape(FitColliderShape(input.node, input.colliders[0], input.scene), input);
}

/** Build one authored collider as a standalone PhysicsShape (for compound bodies). */
function BuildColliderShape(
  node: TransformNode,
  collider: ColliderComponent,
  input: BodyBuildInput
): PhysicsShape | undefined
{
  const { shape } = collider;
  if (shape === "CONVEX" || shape === "MESH")
  {
    return BuildGeometryColliderShape(node, collider, input.isMesh, input.hasGeometry, input.scene);
  }

  if (collider.autoFit)
  {
    if (!input.hasGeometry)
    {
      console.warn(`[bjs] "${node.name}" has no mesh geometry to fit a collider.`);
      return undefined;
    }

    return FitColliderShape(node, collider, input.scene);
  }

  return BuildManualShape(ApplyObjectScaleToCollider(collider, node), input.scene);
}

/** Combine multiple COLLIDER components into one body via PhysicsShapeContainer. */
function BuildCompoundBody(input: BodyBuildInput): PhysicsBody | undefined
{
  const container = new PhysicsShapeContainer(input.scene);

  for (const collider of input.colliders)
  {
    const shape = BuildColliderShape(input.node, collider, input);
    if (shape === undefined)
    {
      continue;
    }

    ConfigureColliderShape(shape, collider, input.friction, input.restitution);
    container.addChild(shape);
  }

  if (container.getNumChildren() === 0)
  {
    console.warn(`[bjs] "${input.node.name}" has ${input.colliders.length} colliders but none could be built.`);
    return undefined;
  }

  const physicsBody = new PhysicsBody(input.node, input.motion, input.startAsleep, input.scene);
  physicsBody.shape = container;
  return physicsBody;
}

/** Build one physics body from a single collider (or rigidbody-only auto-fit). */
function BuildSingleColliderBody(input: BodyBuildInput): PhysicsBody | undefined
{
  const collider = input.colliders[0];
  const shapeKind = collider?.shape ?? "BOX";

  if (shapeKind === "CONVEX" || shapeKind === "MESH")
  {
    return BuildGeometryShapeBody(input, shapeKind);
  }

  if (collider === undefined || collider.autoFit)
  {
    return BuildAutoFitBody(input, shapeKind);
  }

  return AttachShape(
    BuildManualShape(ApplyObjectScaleToCollider(collider, input.node), input.scene),
    input
  );
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

  const input = BuildBodyInput(node, colliders, body, scene);

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
