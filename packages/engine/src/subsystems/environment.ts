import {
  Scene,
  CubeTexture,
  HDRCubeTexture,
  EquiRectangularCubeTexture,
  type BaseTexture,
} from "@babylonjs/core";
import type { EnvironmentInfo } from "../core/types";

/**
 * Set up image-based lighting (and an optional skybox) from a Blender world
 * environment texture. `baseUrl` is the manifest's folder so the relative
 * `file` resolves correctly.
 *
 * Format handling: `.env` (Babylon's prefiltered cube — recommended) loads as a
 * CubeTexture; `.hdr` as an HDRCubeTexture; anything else is treated as an
 * equirectangular image. `.exr` is not loadable in-browser — export `.env`.
 */
export function ApplyEnvironment(
  scene: Scene,
  environmentInfo: EnvironmentInfo,
  baseUrl: string
): BaseTexture
{
  const textureUrl = baseUrl + environmentInfo.file;
  const lowerCaseFile = environmentInfo.file.toLowerCase();

  let environmentTexture: BaseTexture;
  if (lowerCaseFile.endsWith(".env"))
  {
    environmentTexture = new CubeTexture(textureUrl, scene);
  }
  else if (lowerCaseFile.endsWith(".hdr"))
  {
    environmentTexture = new HDRCubeTexture(textureUrl, scene, 256);
  }
  else
  {
    environmentTexture = new EquiRectangularCubeTexture(textureUrl, scene, 512);
  }

  environmentTexture.level = environmentInfo.intensity;

  // rotationY exists on CubeTexture / HDRCubeTexture; guard for the equirect case.
  if ("rotationY" in environmentTexture)
  {
    (environmentTexture as CubeTexture).rotationY = environmentInfo.rotationY;
  }

  scene.environmentTexture = environmentTexture;

  if (environmentInfo.createSkybox)
  {
    scene.createDefaultSkybox(environmentTexture, true, 1000, 0);
  }

  return environmentTexture;
}
