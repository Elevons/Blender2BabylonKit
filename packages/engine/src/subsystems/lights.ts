import { Scene, Light, SpotLight, Color3 } from "@babylonjs/core";
import type { Node } from "@babylonjs/core";
import type { LightInfo } from "../core/types";

/**
 * Blender energy -> Babylon intensity. Real-time lighting can't match
 * Cycles/EEVEE exactly, so these are pragmatic starting points. If a scene
 * reads too bright or dim, tune these two numbers in one place.
 */
const SUN_SCALE = 1.0;        // Blender sun strength (W/m^2) ~ directional intensity
const PUNCTUAL_SCALE = 0.001; // Blender point/spot watts -> intensity (1000 W -> 1.0)

/** Convert a Blender lamp's energy to a Babylon intensity by light type. */
function MapIntensity(lightInfo: LightInfo): number
{
  if (lightInfo.type === "SUN")
  {
    return lightInfo.energy * SUN_SCALE;
  }

  return lightInfo.energy * PUNCTUAL_SCALE;
}

/**
 * The glb already created a Babylon light with the correct, coordinate-converted
 * transform. Blender inserts an orientation-correction node between the object
 * node and the light when exporting +Y-up, so the GUID'd node is an *ancestor*
 * (often grandparent) of the light — walk the whole parent chain rather than
 * assuming a fixed depth.
 */
export function FindLightForNode(scene: Scene, entityNode: Node): Light | null
{
  for (const light of scene.lights)
  {
    let parent: Node | null = light.parent;
    while (parent !== null)
    {
      if (parent === entityNode)
      {
        return light;
      }
      parent = parent.parent;
    }
  }

  return scene.getLightByName(entityNode.name) ?? null;
}

/**
 * Copy the Blender lamp's properties onto the existing Babylon light. Position
 * and direction are left untouched (they come from the glb node), so the Blender
 * lamp acts as a live stand-in: move/aim it in Blender, re-export, and Babylon
 * follows.
 */
export function ApplyBlenderLight(
  scene: Scene,
  entityNode: Node,
  lightInfo: LightInfo
): Light | null
{
  const light = FindLightForNode(scene, entityNode);
  if (light === null)
  {
    console.warn(
      `[bjs] no Babylon light for "${entityNode.name}" (${lightInfo.type}). ` +
        `Area lights aren't exported by glTF — use Point/Sun/Spot.`
    );
    return null;
  }

  const lightColor = new Color3(lightInfo.color[0], lightInfo.color[1], lightInfo.color[2]);
  light.diffuse = lightColor;
  light.specular = lightColor;
  light.intensity = MapIntensity(lightInfo);

  console.log(
    `[bjs] light "${light.name}" <- color`, lightInfo.color,
    `intensity ${light.intensity.toFixed(3)}`
  );

  if (typeof lightInfo.range === "number" && lightInfo.range > 0 && "range" in light)
  {
    (light as Light & { range: number }).range = lightInfo.range;
  }

  if (light instanceof SpotLight && typeof lightInfo.spotSize === "number")
  {
    // Babylon's `angle` is the full cone angle in radians (matches spot_size).
    light.angle = lightInfo.spotSize;
    const edgeBlend = lightInfo.spotBlend ?? 0;
    light.innerAngle = lightInfo.spotSize * (1 - edgeBlend); // hotspot for soft edges
  }

  return light;
}
