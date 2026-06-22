import {
  GPUParticleSystem,
  ParticleSystem,
  AbstractMesh,
  Vector3,
  type IParticleSystem,
  type Scene,
} from "@babylonjs/core";
import { NodeParticleSystemSet } from "@babylonjs/core/Particles/Node/nodeParticleSystemSet";
import type { Entity } from "../core/Entity";
import type { ParticleComponent } from "../core/types";
import { RegisterAttachment } from "../core/attachments";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

function IsLevelManifest(data: unknown): boolean
{
  const record = data as Record<string, unknown> | null;
  return record !== null
    && typeof record.version === "number"
    && typeof record.glb === "string"
    && record.scene !== undefined;
}

function IsNodeParticleSystemSet(data: unknown): boolean
{
  const record = data as Record<string, unknown> | null;
  return record?.customType === "BABYLON.NodeParticleSystemSet"
    || (Array.isArray(record?.blocks)
      && record.blocks.some((block) =>
        typeof block === "object"
        && block !== null
        && String((block as Record<string, unknown>).customType).startsWith("BABYLON.")));
}

function IsAbsoluteAssetUrl(url: string): boolean
{
  return /^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("/");
}

/** Node Particle Editor stores bare filenames; resolve them beside the JSON (rootUrl). */
function ResolveNodeParticleSetTextureUrls(data: unknown, rootUrl: string): void
{
  const blocks = (data as { blocks?: unknown[] } | null)?.blocks;
  if (!Array.isArray(blocks))
  {
    return;
  }

  for (const block of blocks)
  {
    if (typeof block !== "object" || block === null)
    {
      continue;
    }

    const record = block as Record<string, unknown>;
    if (record.customType !== "BABYLON.ParticleTextureSourceBlock")
    {
      continue;
    }

    const url = record.url;
    if (typeof url !== "string" || url.length === 0 || IsAbsoluteAssetUrl(url))
    {
      continue;
    }

    record.url = ResolveManifestAssetUrl(rootUrl, url.replace(/^\.\//, ""));
  }
}

type ResolvedEmitter =
  | { kind: "mesh"; emitter: AbstractMesh }
  | { kind: "empty"; emitter: Vector3 };

function ResolveEmitter(entity: Entity): ResolvedEmitter
{
  if (entity.node instanceof AbstractMesh)
  {
    return { kind: "mesh", emitter: entity.node };
  }

  // Babylon only accepts a mesh or Vector3 as an emitter. Empties use a owned
  // Vector3 that WireParticleEmitterTracking keeps in sync each frame.
  return { kind: "empty", emitter: entity.node.getAbsolutePosition().clone() };
}

export interface EmptyParticleEmitterTracker
{
  entity: Entity;
  position: Vector3;
}

/** Hooks empty-node particle emitters into the scene's before-render pass. */
export interface ParticleEmitterManager
{
  dispose(): void;
}

/** Gather every empty-backed particle emitter that needs per-frame sync. */
export function CollectEmptyParticleEmitters(
  entities: Iterable<Entity>
): EmptyParticleEmitterTracker[]
{
  const seen = new Set<Vector3>();
  const trackers: EmptyParticleEmitterTracker[] = [];

  for (const entity of entities)
  {
    for (const attachment of entity.attachments)
    {
      const emptyEmitter = attachment.type === "PARTICLE" ? attachment.emptyEmitter : undefined;
      if (emptyEmitter === undefined || seen.has(emptyEmitter))
      {
        continue;
      }

      seen.add(emptyEmitter);
      trackers.push({ entity, position: emptyEmitter });
    }
  }

  return trackers;
}

/** Keep empty-node particle emitters aligned with their entity's world position. */
export function WireParticleEmitterTracking(
  scene: Scene,
  trackers: readonly EmptyParticleEmitterTracker[]
): ParticleEmitterManager | undefined
{
  if (trackers.length === 0)
  {
    return undefined;
  }

  const observer = scene.onBeforeRenderObservable.add(() =>
  {
    for (const { entity, position } of trackers)
    {
      position.copyFrom(entity.node.getAbsolutePosition());
    }
  }, undefined, true);

  return {
    dispose(): void
    {
      scene.onBeforeRenderObservable.remove(observer);
    },
  };
}

async function LoadParticleSystems(
  url: string,
  scene: ReturnType<Entity["node"]["getScene"]>,
  systemName: string,
  rootUrl: string,
  useGpu: boolean,
  capacity: number | undefined,
): Promise<IParticleSystem[]>
{
  const response = await fetch(url);
  if (!response.ok)
  {
    throw new Error(`Unable to load particle system: ${url}`);
  }

  const data: unknown = await response.json();

  if (IsLevelManifest(data))
  {
    throw new Error(
      "Particle file looks like a level manifest (.scene.json), not a particle system export",
    );
  }

  if (IsNodeParticleSystemSet(data))
  {
    ResolveNodeParticleSetTextureUrls(data, rootUrl);
    const nodeSet = NodeParticleSystemSet.Parse(data);
    const built = await nodeSet.buildAsync(scene);
    return built.systems;
  }

  const system = useGpu
    ? GPUParticleSystem.Parse(data, scene, rootUrl, false, capacity)
    : ParticleSystem.Parse(data, scene, rootUrl, false, capacity);
  system.name = systemName;
  return [system];
}

/**
 * Particle subsystem: instantiate a Babylon particle system from JSON saved by
 * the Node Particle Editor or the legacy Particle Editor and attach it to an
 * entity. Parsing is async (the file is fetched), so callers queue the
 * returned promise and await it in FinalizeLevel. Texture paths resolve
 * relative to the JSON's own folder (rootUrl) — legacy JSON names and Node
 * Particle Editor `ParticleTextureSourceBlock.url` values alike.
 *
 * The system is named after its file stem, so `entity.GetParticles("fire")`
 * finds "particles/fire.json".
 */
export async function ApplyParticles(
  entity: Entity,
  particleComponent: ParticleComponent,
  baseUrl: string
): Promise<IParticleSystem | undefined>
{
  if (particleComponent.file === null || particleComponent.file.length === 0)
  {
    console.warn(`[bjs] "${entity.name}" has a Particles component with no JSON file`);
    return undefined;
  }

  const url = ResolveManifestAssetUrl(baseUrl, particleComponent.file);
  const fileName = particleComponent.file.split("/").pop() ?? particleComponent.file;
  const systemName = fileName.replace(/\.[^.]+$/, "");

  // rootUrl is the JSON's folder so textures named in the file load beside it.
  const lastSlash = particleComponent.file.lastIndexOf("/");
  const rootUrl = lastSlash >= 0
    ? ResolveManifestAssetUrl(baseUrl, particleComponent.file.slice(0, lastSlash + 1))
    : baseUrl;

  const scene = entity.node.getScene();
  const useGpu = particleComponent.gpu && GPUParticleSystem.IsSupported;
  const capacity = particleComponent.capacity > 0 ? particleComponent.capacity : undefined;

  let systems: IParticleSystem[];
  try
  {
    systems = await LoadParticleSystems(url, scene, systemName, rootUrl, useGpu, capacity);
  }
  catch (error)
  {
    console.warn(
      `[bjs] "${entity.name}" failed to load particle system "${particleComponent.file}": ${(error as Error).message}`,
    );
    return undefined;
  }

  if (systems.length === 0)
  {
    console.warn(`[bjs] "${entity.name}" particle file "${particleComponent.file}" produced no systems`);
    return undefined;
  }

  const resolvedEmitter = particleComponent.attachToEntity ? ResolveEmitter(entity) : undefined;
  let primary: IParticleSystem | undefined;

  for (const system of systems)
  {
    if (!primary)
    {
      system.name = systemName;
      primary = system;
    }

    if (resolvedEmitter !== undefined)
    {
      system.emitter = resolvedEmitter.emitter;
    }

    entity.particleSystems.push(system);
    RegisterAttachment(entity, {
      type: "PARTICLE",
      data: particleComponent,
      system,
      ...(resolvedEmitter?.kind === "empty" ? { emptyEmitter: resolvedEmitter.emitter } : {}),
    });

    if (particleComponent.autoStart)
    {
      system.start();
    }
  }

  return primary;
}
