import {
  Scene,
  CubeTexture,
  HDRCubeTexture,
  EquiRectangularCubeTexture,
  type BaseTexture,
} from "@babylonjs/core";
import type { EnvironmentInfo } from "./types";

/**
 * Set up image-based lighting (and an optional skybox) from a Blender world
 * environment texture. `baseUrl` is the manifest's folder so the relative
 * `file` resolves correctly.
 *
 * Format handling: `.env` (Babylon's prefiltered cube — recommended) loads as a
 * CubeTexture; `.hdr` as an HDRCubeTexture; anything else is treated as an
 * equirectangular image. `.exr` is not loadable in-browser — export `.env`.
 */
export function applyEnvironment(
  scene: Scene,
  info: EnvironmentInfo,
  baseUrl: string
): BaseTexture {
  const url = baseUrl + info.file;
  const lower = info.file.toLowerCase();

  let tex: BaseTexture;
  if (lower.endsWith(".env")) {
    tex = new CubeTexture(url, scene);
  } else if (lower.endsWith(".hdr")) {
    tex = new HDRCubeTexture(url, scene, 256);
  } else {
    tex = new EquiRectangularCubeTexture(url, scene, 512);
  }

  tex.level = info.intensity;
  // rotationY exists on CubeTexture/HDRCubeTexture; guard for the equirect case.
  if ("rotationY" in tex) {
    (tex as CubeTexture).rotationY = info.rotationY;
  }
  scene.environmentTexture = tex;

  if (info.createSkybox) {
    scene.createDefaultSkybox(tex, true, 1000, 0);
  }
  return tex;
}
