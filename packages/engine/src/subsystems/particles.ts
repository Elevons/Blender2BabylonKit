import {
  ParticleHelper,
  GPUParticleSystem,
  AbstractMesh,
  type IParticleSystem,
} from "@babylonjs/core";
import type { Entity } from "../core/Entity";
import type { ParticleComponent } from "../core/types";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

/**
 * Particle subsystem: instantiate a Babylon particle system from the JSON saved
 * by the online Particle Editor and attach it to an entity. Parsing is async
 * (the file is fetched), so callers queue the returned promise and await it in
 * FinalizeLevel. Textures referenced by name in the JSON resolve relative to
 * the JSON's own folder (rootUrl), so dropping them next to the file works.
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

  const useGpu = particleComponent.gpu && GPUParticleSystem.IsSupported;
  const capacity = particleComponent.capacity > 0 ? particleComponent.capacity : undefined;

  const system = await ParticleHelper.ParseFromFileAsync(
    systemName,
    url,
    entity.node.getScene(),
    useGpu,
    rootUrl,
    capacity
  );

  if (particleComponent.attachToEntity)
  {
    // A mesh emitter tracks the node every frame; a plain TransformNode (e.g. a
    // Blender empty) isn't a valid emitter, so pin to a snapshot of its world
    // position (clone so we don't hand out the node's internal vector).
    system.emitter = entity.node instanceof AbstractMesh
      ? entity.node
      : entity.node.getAbsolutePosition().clone();
  }

  entity.particleSystems.push(system);

  if (particleComponent.autoStart)
  {
    system.start();
  }

  return system;
}
