import {
  Scene,
  CubeTexture,
  HDRCubeTexture,
  EquiRectangularCubeTexture,
  type AbstractMesh,
  type BaseTexture,
  type Observable,
} from "@babylonjs/core";
// Augments Scene with createDefaultEnvironment / createDefaultSkybox.
import "@babylonjs/core/Helpers/sceneHelpers";
import type { EnvironmentHelper } from "@babylonjs/core/Helpers/environmentHelper";
import type { EnvironmentInfo } from "../core/types";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

/** Match createDefaultSkybox — EnvironmentHelper defaults are far too small for game levels. */
const SKYBOX_SIZE = 1000;

function IsTextureReady(texture: BaseTexture): boolean
{
  const internal = texture.getInternalTexture();
  return internal !== null && internal.isReady;
}

/** Environment textures created by ApplyEnvironment always expose onLoadObservable. */
type EnvironmentTexture = BaseTexture & {
  onLoadObservable: Observable<BaseTexture>;
};

function WhenTextureReady(texture: BaseTexture, label: string): Promise<void>
{
  if (IsTextureReady(texture))
  {
    return Promise.resolve();
  }

  const loadable = texture as EnvironmentTexture;
  return new Promise((resolve) =>
  {
    const timeout = setTimeout(() =>
    {
      loadable.onLoadObservable.remove(observer);
      console.warn(`[bjs] ${label} did not finish loading — continuing without it`);
      resolve();
    }, 30_000);

    const observer = loadable.onLoadObservable.add(() =>
    {
      clearTimeout(timeout);
      loadable.onLoadObservable.remove(observer);
      resolve();
    });
  });
}

function ConfigureSkyboxFog(skybox: AbstractMesh | null | undefined, ignoreFog: boolean): void
{
  if (skybox && ignoreFog)
  {
    skybox.applyFog = false;
  }
}

/** EnvironmentHelper skyboxes omit infiniteDistance — pin them like createDefaultSkybox. */
function ConfigureHelperSkybox(helper: EnvironmentHelper | null, ignoreFog: boolean): void
{
  const skybox = helper?.skybox;
  if (!skybox)
  {
    return;
  }
  skybox.infiniteDistance = true;
  skybox.ignoreCameraMaxZ = true;
  ConfigureSkyboxFog(skybox, ignoreFog);
}

/**
 * Babylon's built-in studio IBL (+ optional DDS skybox). Used when the manifest
 * sets `useDefault` instead of exporting a World texture file.
 */
async function ApplyBuiltinEnvironment(
  scene: Scene,
  environmentInfo: EnvironmentInfo
): Promise<BaseTexture>
{
  const helper = scene.createDefaultEnvironment({
    createGround: false,
    createSkybox: environmentInfo.createSkybox,
    setupImageProcessing: true,
    backgroundYRotation: environmentInfo.rotationY,
    skyboxSize: SKYBOX_SIZE,
    sizeAuto: false,
  });

  const environmentTexture = scene.environmentTexture;
  if (!environmentTexture)
  {
    throw new Error("[bjs] built-in environment failed to start loading (check network / CDN access).");
  }

  await WhenTextureReady(environmentTexture, "built-in environment");

  if (environmentInfo.createSkybox)
  {
    ConfigureHelperSkybox(helper, environmentInfo.skyboxIgnoreFog === true);
    if (helper?.skyboxTexture)
    {
      await WhenTextureReady(helper.skyboxTexture, "built-in skybox");
    }
  }

  environmentTexture.level = environmentInfo.intensity;
  return environmentTexture;
}

/**
 * Visible skybox for a `.env` IBL map. Prefiltered env files are lighting data
 * only — Babylon's helper uses a separate DDS for the background sphere.
 */
async function ApplyEnvMapSkybox(scene: Scene, ignoreFog: boolean): Promise<void>
{
  const helper = scene.createDefaultEnvironment({
    createGround: false,
    createSkybox: true,
    setupImageProcessing: false,
    skyboxSize: SKYBOX_SIZE,
    sizeAuto: false,
  });
  ConfigureHelperSkybox(helper, ignoreFog);
  if (helper?.skyboxTexture)
  {
    await WhenTextureReady(helper.skyboxTexture, "environment skybox");
  }
}

/**
 * Set up image-based lighting (and an optional skybox) from a Blender world
 * environment texture or the built-in Babylon studio default. `baseUrl` is the
 * manifest's folder so the relative `file` resolves correctly.
 *
 * Skybox creation waits for the environment texture to finish loading so
 * `createDefaultSkybox` does not clone an empty cube map (a common cause of
 * missing backgrounds on the first Live Link reload).
 *
 * Format handling: `.env` (Babylon's prefiltered cube — recommended) loads as a
 * CubeTexture; `.hdr` as an HDRCubeTexture; anything else is treated as an
 * equirectangular image. `.exr` is not loadable in-browser — export `.env`.
 */
export async function ApplyEnvironment(
  scene: Scene,
  environmentInfo: EnvironmentInfo,
  baseUrl: string
): Promise<BaseTexture>
{
  if (environmentInfo.useDefault)
  {
    return ApplyBuiltinEnvironment(scene, environmentInfo);
  }

  if (!environmentInfo.file)
  {
    throw new Error("[bjs] environment block needs file or useDefault.");
  }

  const textureUrl = ResolveManifestAssetUrl(baseUrl, environmentInfo.file);
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
    await WhenTextureReady(environmentTexture, "world environment");
    const ignoreFog = environmentInfo.skyboxIgnoreFog === true;
    if (lowerCaseFile.endsWith(".env"))
    {
      await ApplyEnvMapSkybox(scene, ignoreFog);
    }
    else
    {
      const skybox = scene.createDefaultSkybox(environmentTexture, true, SKYBOX_SIZE, 0);
      ConfigureSkyboxFog(skybox, ignoreFog);
    }
  }

  return environmentTexture;
}
