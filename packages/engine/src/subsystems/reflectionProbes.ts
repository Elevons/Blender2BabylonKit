import {
  AbstractMesh,
  Matrix,
  MultiMaterial,
  Vector3,
  type BaseTexture,
  type Material,
  type Scene,
  type TransformNode,
} from "@babylonjs/core";
import { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import type { Entity } from "../core/Entity";
import type { Level } from "../core/Level";
import { RegisterAttachment } from "../core/attachments";
import type { ReflectionProbeComponent } from "../core/types";
import { ID_KEY } from "../core/types";
import { CollectOwnedMeshes } from "../core/meshOwnership";
import { IsSkyboxMesh } from "./environment";

/** One authored probe, registered while the entity loop runs. */
export interface ReflectionProbeRegistration {
  entity: Entity;
  component: ReflectionProbeComponent;
}

/** Runtime probe plus the entity/component that created it. */
export interface BuiltReflectionProbe {
  entity: Entity;
  component: ReflectionProbeComponent;
  probe: ReflectionProbe;
}

const FILTER_QUALITY_TO_BABYLON: Record<ReflectionProbeComponent["realTimeFilteringQuality"], number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

/** Nearest ancestor entity GUID for a mesh, if any. */
function FindEntityIdForNode(node: TransformNode): string | undefined
{
  let current: TransformNode | null = node;
  while (current !== null)
  {
    const guid = current.metadata?.gltf?.extras?.[ID_KEY];
    if (typeof guid === "string" && guid.length > 0)
    {
      return guid;
    }
    current = current.parent as TransformNode | null;
  }
  return undefined;
}

function ResolveMeshesForEntity(entity: Entity): AbstractMesh[]
{
  return CollectOwnedMeshes(entity.node);
}

function ResolveRenderList(
  scene: Scene,
  level: Level,
  registration: ReflectionProbeRegistration
): AbstractMesh[]
{
  const { entity, component } = registration;
  const excludeIds = new Set(component.renderExcludes);
  const hostMeshes = new Set(CollectOwnedMeshes(entity.node));

  if (component.renderAll)
  {
    const meshes: AbstractMesh[] = [];
    for (const mesh of scene.meshes)
    {
      if (mesh.getTotalVertices() === 0)
      {
        continue;
      }

      if (hostMeshes.has(mesh))
      {
        continue;
      }

      const entityId = FindEntityIdForNode(mesh);
      if (entityId !== undefined && excludeIds.has(entityId))
      {
        continue;
      }

      meshes.push(mesh);
    }
    return meshes;
  }

  const meshes: AbstractMesh[] = [];
  const seen = new Set<AbstractMesh>();

  for (const entityId of component.renderList)
  {
    const targetEntity = level.entities.get(entityId);
    if (targetEntity === undefined)
    {
      console.warn(`[bjs] Reflection probe "${entity.name}": render list entity not found: ${entityId}`);
      continue;
    }

    for (const mesh of ResolveMeshesForEntity(targetEntity))
    {
      if (!seen.has(mesh))
      {
        seen.add(mesh);
        meshes.push(mesh);
      }
    }
  }

  return meshes;
}

function ProbeWorldCenter(built: BuiltReflectionProbe): Vector3
{
  const { entity, component } = built;
  entity.node.computeWorldMatrix(true);
  const offset = new Vector3(
    component.influenceOffset[0],
    component.influenceOffset[1],
    component.influenceOffset[2],
  );
  return Vector3.TransformCoordinates(offset, entity.node.getWorldMatrix());
}

function ProbeContainsPoint(built: BuiltReflectionProbe, worldPoint: Vector3): boolean
{
  const { entity, component } = built;
  entity.node.computeWorldMatrix(true);
  const inverse = Matrix.Invert(entity.node.getWorldMatrix());
  const offset = new Vector3(
    component.influenceOffset[0],
    component.influenceOffset[1],
    component.influenceOffset[2],
  );
  const localPoint = Vector3.TransformCoordinates(worldPoint, inverse).subtract(offset);

  if (component.influenceShape === "SPHERE")
  {
    const radius = component.influenceSize[0] / 2;
    return localPoint.length() <= radius;
  }

  const halfX = component.influenceSize[0] / 2;
  const halfY = component.influenceSize[1] / 2;
  const halfZ = component.influenceSize[2] / 2;
  return Math.abs(localPoint.x) <= halfX
    && Math.abs(localPoint.y) <= halfY
    && Math.abs(localPoint.z) <= halfZ;
}

function ApplyProbeToMaterial(
  material: Material,
  built: BuiltReflectionProbe
): void
{
  if (!("reflectionTexture" in material))
  {
    return;
  }

  const target = material as Material & {
    reflectionTexture: BaseTexture | null;
    realTimeFiltering?: boolean;
    realTimeFilteringQuality?: number;
  };

  target.reflectionTexture = built.probe.cubeTexture;

  if (built.component.realTimeFiltering && "realTimeFiltering" in target)
  {
    target.realTimeFiltering = true;
    if ("realTimeFilteringQuality" in target)
    {
      target.realTimeFilteringQuality =
        FILTER_QUALITY_TO_BABYLON[built.component.realTimeFilteringQuality];
    }
  }
}

function ApplyProbeToMeshMaterials(mesh: AbstractMesh, built: BuiltReflectionProbe): void
{
  const material = mesh.material;
  if (material === null)
  {
    return;
  }

  if (material instanceof MultiMaterial)
  {
    for (const subMaterial of material.subMaterials)
    {
      if (subMaterial !== null)
      {
        ApplyProbeToMaterial(subMaterial, built);
      }
    }
    return;
  }

  ApplyProbeToMaterial(material, built);
}

/**
 * Create reflection probes from manifest registrations and populate each
 * probe's render list. Call after all entities and materials exist.
 */
export function BuildReflectionProbes(
  scene: Scene,
  level: Level,
  registrations: ReflectionProbeRegistration[]
): BuiltReflectionProbe[]
{
  const builtProbes: BuiltReflectionProbe[] = [];

  for (const registration of registrations)
  {
    const { entity, component } = registration;
    const probeName = `${entity.id}_probe`;
    const probe = new ReflectionProbe(
      probeName,
      component.cubeSize,
      scene,
      component.generateMipMaps,
    );
    probe.refreshRate = component.refreshRate;

    if (entity.node instanceof AbstractMesh)
    {
      probe.attachToMesh(entity.node);
    }
    else
    {
      probe.position = entity.node.getAbsolutePosition().clone();
    }

    const renderList = ResolveRenderList(scene, level, registration);
    probe.renderList = renderList;

    RegisterAttachment(entity, {
      type: "REFLECTION_PROBE",
      data: component,
      probe,
    });
    builtProbes.push({ entity, component, probe });
  }

  return builtProbes;
}

/**
 * Assign each mesh's PBR reflection texture from the highest-priority probe
 * whose influence volume contains the mesh bounds center.
 */
export function AssignProbeMaterials(scene: Scene, builtProbes: BuiltReflectionProbe[]): void
{
  if (builtProbes.length === 0)
  {
    return;
  }

  for (const mesh of scene.meshes)
  {
    if (mesh.getTotalVertices() === 0 || mesh.material === null || IsSkyboxMesh(mesh))
    {
      continue;
    }

    mesh.computeWorldMatrix(true);
    const boundsCenter = mesh.getBoundingInfo().boundingBox.centerWorld;

    let winner: BuiltReflectionProbe | undefined;
    let winnerDistance = Infinity;

    for (const built of builtProbes)
    {
      if (!ProbeContainsPoint(built, boundsCenter))
      {
        continue;
      }

      const distance = Vector3.Distance(boundsCenter, ProbeWorldCenter(built));
      if (winner === undefined
        || built.component.priority > winner.component.priority
        || (built.component.priority === winner.component.priority && distance < winnerDistance))
      {
        winner = built;
        winnerDistance = distance;
      }
    }

    if (winner !== undefined)
    {
      ApplyProbeToMeshMaterials(mesh, winner);
    }
  }
}

/** Dispose every reflection probe created during level load. */
export function DisposeReflectionProbes(probes: ReflectionProbe[]): void
{
  for (const probe of probes)
  {
    probe.dispose();
  }
}
