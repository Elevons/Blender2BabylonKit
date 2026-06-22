import {
  Scene,
  DirectionalLight,
  Color3,
  Vector3,
  type TransformNode,
} from "@babylonjs/core";
import { Atmosphere } from "@babylonjs/addons/atmosphere";
import type { IAtmosphereOptions } from "@babylonjs/addons/atmosphere/atmosphereOptions";
import type { AtmosphereInfo, AtmospherePhysicalInfo, EntityData } from "../core/types";
import { FindLightForNode } from "./lights";
import { FindNodeByName } from "../core/loader/nodeResolution";

export type AtmosphereHandle = Atmosphere;

/** Resolve the manifest sun lamp to the glTF node that owns its DirectionalLight. */
function ResolveSunNode(
  atmosphereInfo: AtmosphereInfo,
  entities: EntityData[],
  idIndex: Map<string, TransformNode>,
  scene: Scene
): TransformNode | null
{
  if (atmosphereInfo.sunLightId !== undefined && atmosphereInfo.sunLightId.length > 0)
  {
    const nodeById = idIndex.get(atmosphereInfo.sunLightId);
    if (nodeById !== undefined)
    {
      return nodeById;
    }
    console.warn(`[bjs] atmosphere sunLightId "${atmosphereInfo.sunLightId}" not found`);
  }

  for (const entity of entities)
  {
    if (entity.light?.type !== "SUN")
    {
      continue;
    }
    if (entity.id.length > 0)
    {
      const nodeById = idIndex.get(entity.id);
      if (nodeById !== undefined)
      {
        return nodeById;
      }
    }
    const nodeByName = FindNodeByName(scene, entity.name);
    if (nodeByName !== null)
    {
      return nodeByName;
    }
  }

  return null;
}

/** Find the DirectionalLight for a sun entity node, or the first directional in the scene. */
function ResolveSunLight(scene: Scene, sunNode: TransformNode | null): DirectionalLight | null
{
  if (sunNode !== null)
  {
    const light = FindLightForNode(scene, sunNode);
    if (light instanceof DirectionalLight)
    {
      return light;
    }
  }

  for (const light of scene.lights)
  {
    if (light instanceof DirectionalLight)
    {
      return light;
    }
  }

  return null;
}

function BuildAtmosphereOptions(
  atmosphereInfo: AtmosphereInfo,
  hasHdrPipeline: boolean
): IAtmosphereOptions
{
  const options: IAtmosphereOptions = {
    isLinearSpaceLight: atmosphereInfo.isLinearSpaceLight ?? true,
    isLinearSpaceComposition: atmosphereInfo.isLinearSpaceComposition ?? hasHdrPipeline,
    multiScatteringIntensity: atmosphereInfo.multiScatteringIntensity ?? 1,
    minimumMultiScatteringIntensity: atmosphereInfo.minimumMultiScatteringIntensity ?? 0.1,
  };

  if (atmosphereInfo.groundAlbedo !== undefined)
  {
    options.groundAlbedo = Color3.FromArray(atmosphereInfo.groundAlbedo);
  }

  if (atmosphereInfo.useLuts === false)
  {
    options.isSkyViewLutEnabled = false;
    options.isAerialPerspectiveLutEnabled = false;
  }

  const physical = atmosphereInfo.physical;
  if (physical !== undefined && physical.originHeight !== undefined)
  {
    options.originHeight = physical.originHeight;
  }

  return options;
}

/** Copy manifest physical tuning onto the runtime atmosphere instance. */
function ApplyPhysicalProperties(
  atmosphere: Atmosphere,
  physical: AtmospherePhysicalInfo
): void
{
  const physicalProperties = atmosphere.physicalProperties;

  if (physical.peakRayleighScattering !== undefined)
  {
    physicalProperties.peakRayleighScattering =
      Vector3.FromArray(physical.peakRayleighScattering);
  }
  if (physical.mieScatteringScale !== undefined)
  {
    physicalProperties.mieScatteringScale = physical.mieScatteringScale;
  }
  if (physical.ozoneAbsorptionScale !== undefined)
  {
    physicalProperties.ozoneAbsorptionScale = physical.ozoneAbsorptionScale;
  }
  if (physical.rayleighScatteringScale !== undefined)
  {
    physicalProperties.rayleighScatteringScale = physical.rayleighScatteringScale;
  }
  if (physical.mieAbsorptionScale !== undefined)
  {
    physicalProperties.mieAbsorptionScale = physical.mieAbsorptionScale;
  }
  if (physical.planetRadius !== undefined)
  {
    physicalProperties.planetRadius = physical.planetRadius;
  }
  if (physical.atmosphereThickness !== undefined)
  {
    physicalProperties.atmosphereThickness = physical.atmosphereThickness;
  }
}

/**
 * Create Babylon's physically based atmosphere (sky + aerial perspective).
 * Requires a DirectionalLight from a Blender SUN lamp. Call
 * `Atmosphere.IsSupported(engine)` before use — the loader does this internally.
 */
export function ApplyAtmosphere(
  scene: Scene,
  atmosphereInfo: AtmosphereInfo,
  entities: EntityData[],
  idIndex: Map<string, TransformNode>,
  hasHdrPipeline: boolean
): Atmosphere | null
{
  if (!Atmosphere.IsSupported(scene.getEngine()))
  {
    console.warn(
      "[bjs] Atmosphere is not supported on this engine (requires WebGL 2 or WebGPU)"
    );
    return null;
  }

  const sunNode = ResolveSunNode(atmosphereInfo, entities, idIndex, scene);
  const sunLight = ResolveSunLight(scene, sunNode);
  if (sunLight === null)
  {
    console.warn("[bjs] Atmosphere needs a DirectionalLight (add a Blender SUN lamp)");
    return null;
  }

  if (atmosphereInfo.pbrSunIntensity !== false)
  {
    sunLight.intensity = Math.PI;
  }

  const options = BuildAtmosphereOptions(atmosphereInfo, hasHdrPipeline);
  const atmosphere = new Atmosphere("atmosphere", scene, [sunLight], options);

  const physical = atmosphereInfo.physical;
  if (physical !== undefined)
  {
    ApplyPhysicalProperties(atmosphere, physical);
  }

  console.log(`[bjs] atmosphere enabled (sun: "${sunLight.name}")`);
  return atmosphere;
}
