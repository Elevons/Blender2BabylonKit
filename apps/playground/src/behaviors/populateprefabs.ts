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
 * Spawns full prefab instances across a target mesh, placing them at random
 * points on triangles whose vertex-color map is painted bright enough. Each
 * spawn picks a random template from the Prefabs list. Instances go through
 * the engine's Spawn pipeline, so colliders, rigid bodies, scripts,
 * constraints, and internal references all work per instance.
 *
 * Attach this behavior to any node in the scene. In Blender, fill the Prefabs
 * list (linked collection roots or in-scene hierarchies) and pick the target
 * mesh to paint instances on. Enable "Hide original prefabs" to hide each used
 * template and tear down its live components after spawning.
 *
 * Blender/glTF note: when "Export all vertex colors" is on and the paint
 * attribute is not wired into the material, Blender invents an all-white
 * COLOR_0 and puts the real paint in COLOR_1. This behavior prefers the
 * color set with the most variation (skipping a uniform-white COLOR_0).
 */
export default class PopulatePrefabs extends Behavior
{
  @exposed({ type: "list", of: "entity", label: "Prefabs" })
  prefabs: (Entity | null)[] = [];

  @exposed({ type: "entity", label: "Target mesh (painted surface)" })
  target: Entity | null = null;

  /**
   * Optional glTF color kind to force (e.g. "COLOR_0", "COLOR_1").
   * Leave empty to auto-pick the most varied color set.
   */
  @exposed({ label: "Vertex color kind (blank = auto)" })
  colorMapName = "";

  /** Minimum RGB luminance (0–1) to count as painted. Soft brush strokes often sit around 0.4–0.8. */
  @exposed({ min: 0, max: 1, step: 0.05, label: "Paint luminance threshold" })
  paintThreshold = 0.5;

  /** Maximum number of instances to create. */
  @exposed({ min: 1, step: 1, label: "Instance count" })
  instanceCount = 100;

  /** Optional random rotation range (degrees) around the surface normal. */
  @exposed({ min: 0, max: 360, label: "Random yaw range (deg)" })
  randomYawRange = 0;

  /** Optional uniform scale jitter applied per instance (0 = no jitter). */
  @exposed({ min: 0, max: 1, label: "Scale jitter" })
  scaleJitter = 0;

  /** When true, instances are parented to the target node. */
  @exposed({ label: "Parent to target" })
  parentToTarget = true;

  /**
   * When true, hide each used prefab template and tear down its live components
   * after spawning so only the clones remain active in the scene.
   */
  @exposed({ label: "Hide original prefabs" })
  hideOriginalPrefabs = false;

  /** Area-weighted sampler for random points inside painted mesh triangles. */
  private paintedSurfaceSampler: PaintedSurfaceSampler | null = null;

  /** Build the painted surface sampler once the level is fully loaded. */
  OnStart(): void
  {
    this.paintedSurfaceSampler = null;

    if (this.target === null)
    {
      console.warn("[PopulatePrefabs] target not assigned");
      return;
    }

    if (this.CollectLivePrefabs().length === 0)
    {
      console.warn("[PopulatePrefabs] no prefabs assigned");
      return;
    }

    const targetNode = this.target.node;
    const meshes = CollectMeshes(targetNode);
    if (meshes.length === 0)
    {
      console.warn("[PopulatePrefabs] target has no meshes");
      return;
    }

    this.paintedSurfaceSampler = BuildPaintedSurfaceSampler(
      meshes,
      this.colorMapName,
      this.paintThreshold
    );

    if (this.paintedSurfaceSampler === null)
    {
      console.warn(
        `[PopulatePrefabs] no painted surface found on target "${this.target.name}" ` +
        `(kind "${this.colorMapName || "auto"}", luminance >= ${this.paintThreshold})`
      );
      return;
    }

    // Spawn is async (asset-backed components settle per instance); errors
    // land in the console rather than rejecting into the void.
    void this.SpawnInstances().catch((error) =>
    {
      console.error("[PopulatePrefabs] spawn failed", error);
    });
  }

  /** Non-null entries from the Prefabs list. */
  private CollectLivePrefabs(): Entity[]
  {
    return this.prefabs.filter((prefab): prefab is Entity => prefab !== null);
  }

  /** Spawn full prefab instances at random points on the painted surface. */
  private async SpawnInstances(): Promise<void>
  {
    if (this.target === null || this.paintedSurfaceSampler === null)
    {
      return;
    }

    const livePrefabs = this.CollectLivePrefabs();
    if (livePrefabs.length === 0)
    {
      return;
    }

    const targetEntity = this.target;
    const usedTemplates = new Set<Entity>();

    for (let instanceIndex = 0; instanceIndex < this.instanceCount; instanceIndex++)
    {
      const sample = this.paintedSurfaceSampler.Sample();
      const worldPosition = sample.position;
      const normal = sample.normal;
      const prefabEntity = livePrefabs[Math.floor(Math.random() * livePrefabs.length)];
      usedTemplates.add(prefabEntity);

      // Spawn positions are parent-space; convert when parenting to the target.
      const position = this.parentToTarget
        ? Vector3.TransformCoordinates(
            worldPosition,
            Matrix.Invert(targetEntity.node.getWorldMatrix())
          )
        : worldPosition.clone();

      const rotationQuaternion = this.ComputeInstanceRotation(normal);

      const scaling = this.scaleJitter > 0
        ? prefabEntity.node.scaling.scale(1 + (Math.random() * 2 - 1) * this.scaleJitter)
        : undefined;

      await this.spawner.Spawn(prefabEntity, {
        position,
        rotationQuaternion,
        scaling,
        parent: this.parentToTarget ? targetEntity : undefined,
      });
    }

    if (this.hideOriginalPrefabs)
    {
      for (const template of usedTemplates)
      {
        await this.spawner.HideTemplate(template);
      }
    }
  }

  /** Align local up (Y) with the surface normal, plus optional random yaw. */
  private ComputeInstanceRotation(normal: Vector3): Quaternion
  {
    const up = Vector3.Up();
    let rotationQuaternion = Quaternion.Identity();

    if (Math.abs(Vector3.Dot(up, normal)) < 0.999)
    {
      const rotationAxis = Vector3.Cross(up, normal).normalize();
      const rotationAngle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(up, normal))));
      rotationQuaternion = Quaternion.RotationAxis(rotationAxis, rotationAngle);
    }

    if (this.randomYawRange > 0)
    {
      const yawRadians = ((Math.random() * 2 - 1) * this.randomYawRange * Math.PI) / 180;
      rotationQuaternion = Quaternion.RotationAxis(normal, yawRadians)
        .multiply(rotationQuaternion);
    }

    return rotationQuaternion;
  }
}

/** One point on a painted mesh surface in world space. */
interface SurfaceSample
{
  position: Vector3;
  normal: Vector3;
}

/** Precomputed painted triangles for area-weighted random surface sampling. */
interface PaintedSurfaceSampler
{
  Sample(): SurfaceSample;
}

interface PaintedSurfaceTriangle
{
  cumulativeArea: number;
  cornerA: Vector3;
  cornerB: Vector3;
  cornerC: Vector3;
  normalA: Vector3;
  normalB: Vector3;
  normalC: Vector3;
}

/**
 * Build an area-weighted sampler from triangles whose average vertex-color
 * luminance meets the paint threshold.
 */
function BuildPaintedSurfaceSampler(
  meshes: AbstractMesh[],
  colorMapName: string,
  paintThreshold: number
): PaintedSurfaceSampler | null
{
  const triangles: PaintedSurfaceTriangle[] = [];
  let totalArea = 0;

  for (const mesh of meshes)
  {
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
    if (positions === null)
    {
      continue;
    }

    const colorResolution = ResolvePaintColorData(mesh, colorMapName);
    if (colorResolution === null)
    {
      continue;
    }

    const { colorData, kind } = colorResolution;
    if (IsUniformNearWhite(colorData))
    {
      console.warn(
        `[PopulatePrefabs] mesh "${mesh.name}" color kind "${kind}" is uniform white ` +
        `(Blender fake COLOR_0?). Paint is likely in COLOR_1 — re-export or leave kind blank for auto.`
      );
      continue;
    }

    const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
    const indices = mesh.getIndices();
    const worldMatrix = mesh.getWorldMatrix();
    const stride = colorData.length % 4 === 0 ? 4 : 3;

    const addTriangle = (indexA: number, indexB: number, indexC: number): void =>
    {
      const averageLuminance =
        (
          ReadVertexLuminance(colorData, stride, indexA)
          + ReadVertexLuminance(colorData, stride, indexB)
          + ReadVertexLuminance(colorData, stride, indexC)
        ) / 3;

      if (averageLuminance < paintThreshold)
      {
        return;
      }

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

      return SampleTriangle(triangles[lowIndex]);
    },
  };
}

/** Pick a uniform random point inside a triangle using barycentric coordinates. */
function SampleTriangle(triangle: PaintedSurfaceTriangle): SurfaceSample
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
function ReadWorldVertex(
  positions: Float32Array | number[],
  vertexIndex: number,
  worldMatrix: Matrix
): Vector3
{
  const localPosition = new Vector3(
    positions[vertexIndex * 3],
    positions[vertexIndex * 3 + 1],
    positions[vertexIndex * 3 + 2]
  );
  return Vector3.TransformCoordinates(localPosition, worldMatrix);
}

/** Read a mesh vertex normal transformed into world space. */
function ReadWorldNormal(
  normals: Float32Array | number[],
  vertexIndex: number,
  worldMatrix: Matrix
): Vector3
{
  const localNormal = new Vector3(
    normals[vertexIndex * 3],
    normals[vertexIndex * 3 + 1],
    normals[vertexIndex * 3 + 2]
  );
  return Vector3.TransformNormal(localNormal, worldMatrix).normalize();
}

/** RGB luminance for one vertex-color sample. */
function ReadVertexLuminance(
  colorData: Float32Array | number[],
  stride: number,
  vertexIndex: number
): number
{
  const colorOffset = vertexIndex * stride;
  const red = colorData[colorOffset];
  const green = colorData[colorOffset + 1];
  const blue = colorData[colorOffset + 2];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Chosen vertex-color buffer for paint sampling. */
interface PaintColorResolution
{
  colorData: Float32Array | number[];
  kind: string;
}

/**
 * Pick a vertex-color buffer for paint masking.
 * Prefer an explicit kind when set; otherwise take the most varied COLOR_n /
 * ColorKind set (skips Blender's uniform-white fake COLOR_0 when COLOR_1 exists).
 */
function ResolvePaintColorData(
  mesh: AbstractMesh,
  preferredKind: string
): PaintColorResolution | null
{
  const trimmedKind = preferredKind.trim();
  if (trimmedKind.length > 0)
  {
    const kind = NormalizeColorKind(trimmedKind);
    const colorData = mesh.getVerticesData(kind);
    if (colorData !== null)
    {
      return { colorData, kind };
    }

    // Blender attribute names ("Color.001") are not glTF kind names — fall back.
    console.warn(
      `[PopulatePrefabs] mesh "${mesh.name}" has no kind "${kind}"; auto-picking color set`
    );
  }

  let best: PaintColorResolution | null = null;
  let bestVariance = -1;

  for (const kind of CollectAvailableColorKinds(mesh))
  {
    const colorData = mesh.getVerticesData(kind);
    if (colorData === null)
    {
      continue;
    }

    const variance = ColorVariance(colorData);
    if (variance > bestVariance)
    {
      bestVariance = variance;
      best = { colorData, kind };
    }
  }

  return best;
}

/** Map author-facing names onto Babylon vertex-buffer kinds. */
function NormalizeColorKind(kind: string): string
{
  if (kind === "Col" || kind === "Color" || kind === "COLOR_0" || kind === "color")
  {
    return VertexBuffer.ColorKind;
  }

  return kind;
}

/** COLOR_0 / ColorKind plus any COLOR_1+ kinds present on the mesh. */
function CollectAvailableColorKinds(mesh: AbstractMesh): string[]
{
  const kinds: string[] = [];

  if (mesh.getVerticesData(VertexBuffer.ColorKind) !== null)
  {
    kinds.push(VertexBuffer.ColorKind);
  }

  for (let colorIndex = 1; colorIndex < 8; colorIndex++)
  {
    const kind = `COLOR_${colorIndex}`;
    if (mesh.getVerticesData(kind) !== null)
    {
      kinds.push(kind);
    }
  }

  return kinds;
}

/** True when every RGB sample is ~white (Blender's placeholder COLOR_0). */
function IsUniformNearWhite(colorData: Float32Array | number[]): boolean
{
  const stride = colorData.length % 4 === 0 ? 4 : 3;
  const vertexCount = colorData.length / stride;
  if (vertexCount === 0)
  {
    return false;
  }

  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++)
  {
    const offset = vertexIndex * stride;
    if (
      colorData[offset] < 0.99
      || colorData[offset + 1] < 0.99
      || colorData[offset + 2] < 0.99
    )
    {
      return false;
    }
  }

  return true;
}

/** Mean squared deviation of RGB from white — higher means real paint variation. */
function ColorVariance(colorData: Float32Array | number[]): number
{
  const stride = colorData.length % 4 === 0 ? 4 : 3;
  const vertexCount = colorData.length / stride;
  if (vertexCount === 0)
  {
    return 0;
  }

  let sumSquares = 0;
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++)
  {
    const offset = vertexIndex * stride;
    const redDelta = 1 - colorData[offset];
    const greenDelta = 1 - colorData[offset + 1];
    const blueDelta = 1 - colorData[offset + 2];
    sumSquares += redDelta * redDelta + greenDelta * greenDelta + blueDelta * blueDelta;
  }

  return sumSquares / vertexCount;
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
