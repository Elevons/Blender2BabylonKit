import { Scene, Light, SpotLight, DirectionalLight, Color3 } from "@babylonjs/core";
import type { Node } from "@babylonjs/core";
import type { LightInfo } from "../core/types";

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
 * glTF parents a SUN lamp's DirectionalLight under the lamp's transform node
 * (local −Z aim). Bake that parenting into world-space direction once at load
 * and detach the light so Atmosphere and mesh lighting both read the same aim.
 */
function BakeSunLightWorldTransform(sunLight: DirectionalLight): void
{
  if (!sunLight.computeTransformedInformation())
  {
    return;
  }

  sunLight.direction.copyFrom(sunLight.transformedDirection);
  sunLight.parent = null;
  // Directional lighting is infinite — only direction matters for shading. Shadow
  // maps still need a view origin; keep it near the scene (SetupShadows re-anchors
  // on caster bounds) instead of the Blender sun empty, which is often placed far
  // from gameplay geometry and washes out shadow precision away from center.
  sunLight.position.copyFrom(sunLight.direction).scaleInPlace(-1);
}

/**
 * Copy the Blender lamp's properties onto the existing Babylon light. Spot/point
 * position and direction come from the glb as-is. SUN lamps bake world aim once
 * at load (see BakeSunLightWorldTransform) so Atmosphere reads the aimed direction.
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
  light.intensity = lightInfo.energy;

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

  if (lightInfo.type === "SUN" && light instanceof DirectionalLight)
  {
    BakeSunLightWorldTransform(light);
  }

  return light;
}
