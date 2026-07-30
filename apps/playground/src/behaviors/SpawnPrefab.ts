import { Behavior, exposed, type Entity } from "@bjs/engine";
import {
  AbstractMesh,
  Matrix,
  Quaternion,
  TransformNode,
  Vector3,
  VertexBuffer,
} from "@babylonjs/core";

/**
 * Spawns full prefab instances at random points on a target mesh surface.
 * Each instance goes through this.spawner.Spawn — colliders, scripts,
 * constraints, and internal GUID refs all work per instance.
 */
export default class SpawnPrefab extends Behavior
{
  @exposed({ type: "entity", label: "Prefab", spawnTemplate: true })
  prefab: Entity | null = null;

  @exposed({ type: "entity", label: "Target mesh" })
  target: Entity | null = null;

  @exposed({ min: 1, step: 1, label: "Instance count" })
  instanceCount = 10;

  /** Optional random rotation range (degrees) around the surface normal. */
  @exposed({ min: 0, max: 360, label: "Random yaw range (deg)" })
  randomYawRange = 360;

  /** Optional uniform scale jitter applied per instance (0 = no jitter). */
  @exposed({ min: 0, max: 1, label: "Scale jitter" })
  scaleJitter = 0;

  /** When true, spawned instances are parented under the target entity. */
  @exposed({ label: "Parent to target" })
  parentToTarget = true;

  /** Area-weighted sampler built from the target mesh triangles. */
  private surfaceSampler: MeshSurfaceSampler | null = null;

  /** Build the surface sampler and kick off async spawn. */
  OnStart(): void
  {
    if (this.prefab === null || this.target === null)
    {
      console.warn("[SpawnPrefab] prefab or target not assigned");
      return;
    }

    const meshes = CollectMeshes(this.target.node);
    if (meshes.length === 0)
    {
      console.warn("[SpawnPrefab] target has no meshes");
      return;
    }

    this.surfaceSampler = BuildMeshSurfaceSampler(meshes);
    if (this.surfaceSampler === null)
    {
      console.warn(`[SpawnPrefab] target "${this.target.name}" has no triangles`);
      return;
    }

    void this.SpawnInstances().catch((error) =>
    {
      console.error("[SpawnPrefab] spawn failed", error);
    });
  }

  /** Duplicate the template at random surface points on the target mesh. */
  private async SpawnInstances(): Promise<void>
  {
    if (this.prefab === null || this.target === null || this.surfaceSampler === null)
    {
      return;
    }

    const prefabEntity = this.prefab;
    const targetEntity = this.target;
    const targetWorldMatrixInverse = Matrix.Invert(targetEntity.node.getWorldMatrix());

    for (let instanceIndex = 0; instanceIndex < this.instanceCount; instanceIndex++)
    {
      const sample = this.surfaceSampler.Sample();

      let position: Vector3;
      if (this.parentToTarget)
      {
        position = Vector3.TransformCoordinates(sample.position, targetWorldMatrixInverse);
      }
      else
      {
        position = sample.position.clone();
      }

      const rotationQuaternion = ComputeSurfaceRotation(
        sample.normal,
        this.randomYawRange
      );

      let scaling: Vector3 | undefined;
      if (this.scaleJitter > 0)
      {
        const scaleFactor = 1 + (Math.random() * 2 - 1) * this.scaleJitter;
        scaling = prefabEntity.node.scaling.clone().scale(scaleFactor);
      }

      let parent: Entity | undefined;
      if (this.parentToTarget)
      {
        parent = targetEntity;
      }

      await this.spawner.Spawn(prefabEntity, {
        position,
        rotationQuaternion,
        scaling,
        parent,
      });
    }
  }
}

/** One point on a mesh surface in world space. */
interface SurfaceSample
{
  position: Vector3;
  normal: Vector3;
}

/** Precomputed triangle list for area-weighted random surface sampling. */
interface MeshSurfaceSampler
{
  Sample(): SurfaceSample;
}

/** Build an area-weighted sampler from every triangle in the given meshes. */
function BuildMeshSurfaceSampler(meshes: AbstractMesh[]): MeshSurfaceSampler | null
{
  const triangles: SurfaceTriangle[] = [];
  let totalArea = 0;

  for (const mesh of meshes)
  {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (positions === null)
    {
      continue;
    }

    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const indices = mesh.getIndices();
    const worldMatrix = mesh.getWorldMatrix();

    const addTriangle = (indexA: number, indexB: number, indexC: number): void =>
    {
      const cornerA = ReadWorldVertex(positions, indexA, worldMatrix);
      const cornerB = ReadWorldVertex(positions, indexB, worldMatrix);
      const cornerC = ReadWorldVertex(positions, indexC, worldMatrix);

      const edgeAB = cornerB.clone().subtract(cornerA);
      const edgeAC = cornerC.clone().subtract(cornerA);
      const area = Vector3.Cross(edgeAB, edgeAC).length() * 0.5;

      if (area <= 0)
      {
        return;
      }

      totalArea += area;

      let normalA = Vector3.Up();
      let normalB = Vector3.Up();
      let normalC = Vector3.Up();
      if (normals !== null)
      {
        normalA = ReadWorldNormal(normals, indexA, worldMatrix);
        normalB = ReadWorldNormal(normals, indexB, worldMatrix);
        normalC = ReadWorldNormal(normals, indexC, worldMatrix);
      }
      else
      {
        const faceNormal = Vector3.Cross(edgeAB, edgeAC).normalize();
        normalA = faceNormal;
        normalB = faceNormal;
        normalC = faceNormal;
      }

      triangles.push({
        cumulativeArea: totalArea,
        cornerA,
        cornerB,
        cornerC,
        normalA,
        normalB,
        normalC,
      });
    };

    if (indices !== null)
    {
      for (let index = 0; index < indices.length; index += 3)
      {
        addTriangle(indices[index], indices[index + 1], indices[index + 2]);
      }
    }
    else
    {
      for (let index = 0; index < positions.length / 3; index += 3)
      {
        addTriangle(index, index + 1, index + 2);
      }
    }
  }

  if (triangles.length === 0 || totalArea <= 0)
  {
    return null;
  }

  return {
    Sample(): SurfaceSample
    {
      const targetArea = Math.random() * totalArea;

      let lowIndex = 0;
      let highIndex = triangles.length - 1;
      while (lowIndex < highIndex)
      {
        const midIndex = Math.floor((lowIndex + highIndex) / 2);
        if (triangles[midIndex].cumulativeArea < targetArea)
        {
          lowIndex = midIndex + 1;
        }
        else
        {
          highIndex = midIndex;
        }
      }

      const triangle = triangles[lowIndex];
      return SampleTriangle(triangle);
    },
  };
}

interface SurfaceTriangle
{
  cumulativeArea: number;
  cornerA: Vector3;
  cornerB: Vector3;
  cornerC: Vector3;
  normalA: Vector3;
  normalB: Vector3;
  normalC: Vector3;
}

/** Pick a uniform random point inside a triangle using barycentric coordinates. */
function SampleTriangle(triangle: SurfaceTriangle): SurfaceSample
{
  let weightB = Math.random();
  let weightC = Math.random();
  if (weightB + weightC > 1)
  {
    weightB = 1 - weightB;
    weightC = 1 - weightC;
  }
  const weightA = 1 - weightB - weightC;

  const position = triangle.cornerA.clone().scale(weightA)
    .addInPlace(triangle.cornerB.clone().scale(weightB))
    .addInPlace(triangle.cornerC.clone().scale(weightC));

  const normal = triangle.normalA.clone().scale(weightA)
    .addInPlace(triangle.normalB.clone().scale(weightB))
    .addInPlace(triangle.normalC.clone().scale(weightC))
    .normalize();

  return { position, normal };
}

/** Read a mesh vertex position transformed into world space. */
function ReadWorldVertex(positions: Float32Array | number[], vertexIndex: number, worldMatrix: Matrix): Vector3
{
  const localPosition = new Vector3(
    positions[vertexIndex * 3],
    positions[vertexIndex * 3 + 1],
    positions[vertexIndex * 3 + 2]
  );
  return Vector3.TransformCoordinates(localPosition, worldMatrix);
}

/** Read a mesh vertex normal transformed into world space. */
function ReadWorldNormal(normals: Float32Array | number[], vertexIndex: number, worldMatrix: Matrix): Vector3
{
  const localNormal = new Vector3(
    normals[vertexIndex * 3],
    normals[vertexIndex * 3 + 1],
    normals[vertexIndex * 3 + 2]
  );
  return Vector3.TransformNormal(localNormal, worldMatrix).normalize();
}

/** Align local up (Y) with the surface normal, plus optional random yaw. */
function ComputeSurfaceRotation(normal: Vector3, randomYawRangeDegrees: number): Quaternion
{
  const up = Vector3.Up();
  let rotationQuaternion = Quaternion.Identity();

  if (Math.abs(Vector3.Dot(up, normal)) < 0.999)
  {
    const rotationAxis = Vector3.Cross(up, normal).normalize();
    const rotationAngle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(up, normal))));
    rotationQuaternion = Quaternion.RotationAxis(rotationAxis, rotationAngle);
  }

  if (randomYawRangeDegrees > 0)
  {
    const yawRadians = ((Math.random() * 2 - 1) * randomYawRangeDegrees * Math.PI) / 180;
    rotationQuaternion = Quaternion.RotationAxis(normal, yawRadians)
      .multiply(rotationQuaternion);
  }

  return rotationQuaternion;
}

/** Recursively collect all AbstractMesh descendants of a node (inclusive). */
function CollectMeshes(node: TransformNode): AbstractMesh[]
{
  const meshes: AbstractMesh[] = [];
  if (node instanceof AbstractMesh)
  {
    meshes.push(node);
  }

  for (const child of node.getChildren())
  {
    if (child instanceof AbstractMesh)
    {
      meshes.push(child);
    }
    else
    {
      meshes.push(...CollectMeshes(child as TransformNode));
    }
  }

  return meshes;
}
