import { Scene, Light, SpotLight, Color3 } from "@babylonjs/core";
import type { Node } from "@babylonjs/core";
import type { LightInfo } from "./types";

/**
 * Blender energy -> Babylon intensity. Real-time lighting can't match
 * Cycles/EEVEE exactly, so these are pragmatic starting points. If a scene
 * reads too bright or dim, tune these two numbers in one place.
 */
const SUN_SCALE = 1.0;        // Blender sun strength (W/m^2)  ~ directional intensity
const PUNCTUAL_SCALE = 0.001; // Blender point/spot watts -> intensity (1000 W -> 1.0)

function mapIntensity(info: LightInfo): number {
  return info.type === "SUN"
    ? info.energy * SUN_SCALE
    : info.energy * PUNCTUAL_SCALE;
}

/**
 * The glb (exported with lights on) already created a Babylon light with the
 * correct, coordinate-converted transform. Blender inserts an orientation
 * "correction" node between the object node and the light when exporting +Y-up,
 * so the GUID'd node is an *ancestor* (often grandparent) of the light — walk
 * the whole parent chain rather than assuming a fixed depth.
 */
export function findLightForNode(scene: Scene, node: Node): Light | null {
  for (const light of scene.lights) {
    let p: Node | null = light.parent;
    while (p) {
      if (p === node) return light;
      p = p.parent;
    }
  }
  return scene.getLightByName(node.name) ?? null;
}

/**
 * Copy the Blender lamp's properties onto the existing Babylon light. Position
 * and direction are left untouched (they come from the glb node), so the
 * Blender lamp acts as a live stand-in: move/aim it in Blender, re-export, and
 * Babylon follows.
 */
export function applyBlenderLight(
  scene: Scene,
  node: Node,
  info: LightInfo
): Light | null {
  const light = findLightForNode(scene, node);
  if (!light) {
    console.warn(
      `[bjs] no Babylon light for "${node.name}" (${info.type}). ` +
        `Area lights aren't exported by glTF — use Point/Sun/Spot.`
    );
    return null;
  }

  const color = new Color3(info.color[0], info.color[1], info.color[2]);
  light.diffuse = color;
  light.specular = color;
  light.intensity = mapIntensity(info);
  console.log(
    `[bjs] light "${light.name}" <- color`, info.color,
    `intensity ${light.intensity.toFixed(3)}`
  );

  if (typeof info.range === "number" && info.range > 0 && "range" in light) {
    (light as Light & { range: number }).range = info.range;
  }

  if (light instanceof SpotLight && typeof info.spotSize === "number") {
    // Babylon's `angle` is the full cone angle in radians (matches spot_size).
    // If the cone looks too wide/narrow in your build, try info.spotSize / 2.
    light.angle = info.spotSize;
    const blend = info.spotBlend ?? 0;
    light.innerAngle = info.spotSize * (1 - blend); // hotspot for soft edges
  }

  return light;
}
