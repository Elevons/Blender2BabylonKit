import {
  Scene,
  CubeTexture,
  HDRCubeTexture,
  EquiRectangularCubeTexture,
  Color3,
  Vector3,
  Matrix,
  type AbstractMesh,
  type BaseTexture,
  type Material,
  type Mesh,
} from "@babylonjs/core";
import type { EnvironmentHelper, IEnvironmentHelperOptions } from "@babylonjs/core/Helpers/environmentHelper";
// Augments Scene with createDefaultEnvironment / createDefaultSkybox.
import "@babylonjs/core/Helpers/sceneHelpers";
import type { EnvironmentInfo } from "../core/types";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

/** Floor for empty / tiny scenes — EnvironmentHelper defaults (20) are far too small for game levels. */
const SKYBOX_SIZE_MIN = 1000;

/** Matches EnvironmentHelper `sizeAuto` (diagonal × 2, then × 1.5 for the skybox). */
const SKYBOX_SCENE_SCALE = 3;

/**
 * Blender world environments are authored Z-up; Babylon's panorama → cubemap path
 * (EquiRectangularCubeTexture / HDRCubeTexture) samples in Y-up. At Mapping yaw 0
 * the horizons are π/2 apart — add this before manifest rotationY.
 */
const PANORAMA_BLENDER_YAW_OFFSET = Math.PI / 2;

const SKYBOX_MESH_NAMES = new Set([
  "hdrSkyBox",
  "BackgroundSkybox",
  "BackgroundHelper",
  "BackgroundPlane",
]);

function IsSkyboxMesh(mesh: AbstractMesh): boolean
{
  return SKYBOX_MESH_NAMES.has(mesh.name);
}

/**
 * Size the skybox from loaded level geometry so planet-scale terrains are not stuck
 * inside a 1000-unit cube at the origin. Called from FinalizeLevel after entities exist.
 */
function ComputeSkyboxSize(scene: Scene): number
{
  const worldExtends = scene.getWorldExtends((mesh) =>
  {
    return mesh.isVisible && mesh.isEnabled() && !IsSkyboxMesh(mesh);
  });
  const worldSize = worldExtends.max.subtract(worldExtends.min);
  const diagonal = worldSize.length();
  if (!Number.isFinite(diagonal) || diagonal <= 0)
  {
    return SKYBOX_SIZE_MIN;
  }
  return Math.max(SKYBOX_SIZE_MIN, diagonal * SKYBOX_SCENE_SCALE);
}

function WhenTextureReady(texture: BaseTexture, label: string): Promise<void>
{
  if (texture.isReady())
  {
    return Promise.resolve();
  }

  return new Promise((resolve) =>
  {
    let settled = false;
    const finish = (): void =>
    {
      if (settled)
      {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      resolve();
    };

    const timeoutHandle = setTimeout(() =>
    {
      console.warn(`[bjs] ${label} did not finish loading — continuing without it`);
      finish();
    }, 30_000);

    const onLoadObservable = (texture as BaseTexture & {
      onLoadObservable?: { addOnce: (callback: () => void) => void };
    }).onLoadObservable;
    if (onLoadObservable)
    {
      onLoadObservable.addOnce(finish);
      return;
    }

    const attachInternalLoad = (): boolean =>
    {
      const onLoadedObservable = texture.getInternalTexture()?.onLoadedObservable;
      if (onLoadedObservable)
      {
        onLoadedObservable.addOnce(finish);
        return true;
      }
      return false;
    };

    if (attachInternalLoad())
    {
      return;
    }

    const poll = (): void =>
    {
      if (settled)
      {
        return;
      }
      if (texture.isReady())
      {
        finish();
        return;
      }
      if (attachInternalLoad())
      {
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

/**
 * Match EnvironmentHelper's skyboxColor prep: sRGB → linear, then ×3 on primaryColor.
 */
function ResolveSkyboxColor(scene: Scene, srgb: [number, number, number]): Color3
{
  return new Color3(srgb[0], srgb[1], srgb[2])
    .toLinearSpace(scene.getEngine().useExactSrgbConversions)
    .scale(3);
}

function BuildEnvironmentHelperOptions(
  scene: Scene,
  environmentInfo: EnvironmentInfo,
  overrides: Partial<IEnvironmentHelperOptions>
): Partial<IEnvironmentHelperOptions>
{
  const options: Partial<IEnvironmentHelperOptions> = { ...overrides };

  if (environmentInfo.skyboxColor !== undefined)
  {
    options.skyboxColor = ResolveSkyboxColor(scene, environmentInfo.skyboxColor);
  }

  return options;
}

/** Manifest rotationY plus any format-specific Z-up → Y-up correction. */
function ResolveEnvironmentRotation(fileName: string, manifestRotationY: number): number
{
  const lowerCaseFile = fileName.toLowerCase();
  if (lowerCaseFile.endsWith(".env"))
  {
    return manifestRotationY;
  }

  // .hdr and equirectangular images both go through Babylon's panorama converter.
  return manifestRotationY + PANORAMA_BLENDER_YAW_OFFSET;
}

/** Rotate environment sampling for IBL and skybox materials from one manifest value. */
function ApplyEnvironmentRotation(
  scene: Scene,
  texture: BaseTexture,
  rotationY: number
): void
{
  if (rotationY === 0)
  {
    return;
  }

  if ("rotationY" in texture)
  {
    (texture as CubeTexture).rotationY = rotationY;
    return;
  }

  // EquiRectangularCubeTexture has no rotationY — patch the reflection matrix instead.
  const rotationMatrix = Matrix.RotationY(rotationY);
  texture.getReflectionTextureMatrix = (): Matrix => rotationMatrix;
  texture.getRefractionTextureMatrix = (): Matrix => rotationMatrix;
  scene.markAllMaterialsAsDirty(1);
}

function GetMaterialReflectionTexture(material: Material | null): BaseTexture | null
{
  if (material === null || !("reflectionTexture" in material))
  {
    return null;
  }

  return (material as Material & { reflectionTexture: BaseTexture | null }).reflectionTexture;
}

function ConfigureSkyboxFog(skybox: AbstractMesh | null | undefined, ignoreFog: boolean): void
{
  if (skybox && ignoreFog)
  {
    skybox.applyFog = false;
  }
}

function ConfigureSkyboxMesh(skybox: AbstractMesh | null | undefined, ignoreFog: boolean): void
{
  if (!skybox)
  {
    return;
  }
  const skyMesh = skybox as Mesh;
  skyMesh.infiniteDistance = true;
  skyMesh.ignoreCameraMaxZ = true;
  ConfigureSkyboxFog(skybox, ignoreFog);
}

/**
 * EnvironmentHelper parents its skybox under a root node, which disables Babylon's
 * infiniteDistance camera-follow. Unparent while preserving the helper's Y rotation
 * (already applied on rootMesh via backgroundYRotation).
 */
function ConfigureHelperSkybox(helper: EnvironmentHelper | null, ignoreFog: boolean): void
{
  const skybox = helper?.skybox;
  if (!skybox)
  {
    return;
  }

  const rootMesh = helper.rootMesh;
  if (rootMesh !== null && skybox.parent === rootMesh)
  {
    skybox.setParent(null);
    skybox.position = Vector3.Zero();
  }

  ConfigureSkyboxMesh(skybox, ignoreFog);
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
  const skyboxSize = ComputeSkyboxSize(scene);
  const helper = scene.createDefaultEnvironment(
    BuildEnvironmentHelperOptions(scene, environmentInfo, {
      createGround: false,
      createSkybox: environmentInfo.createSkybox,
      setupImageProcessing: true,
      backgroundYRotation: environmentInfo.rotationY,
      skyboxSize,
      sizeAuto: false,
    })
  );

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
  scene.environmentTexture = environmentTexture;
  const rotationY = ResolveEnvironmentRotation(
    environmentInfo.file,
    environmentInfo.rotationY
  );
  ApplyEnvironmentRotation(scene, environmentTexture, rotationY);

  if (environmentInfo.createSkybox)
  {
    await WhenTextureReady(environmentTexture, "world environment");
    const ignoreFog = environmentInfo.skyboxIgnoreFog === true;
    const skyboxSize = ComputeSkyboxSize(scene);
    const skybox = scene.createDefaultSkybox(environmentTexture, true, skyboxSize, 0);
    const skyboxTexture = GetMaterialReflectionTexture(skybox?.material ?? null);
    if (skyboxTexture !== null)
    {
      ApplyEnvironmentRotation(scene, skyboxTexture, rotationY);
    }
    ConfigureSkyboxMesh(skybox, ignoreFog);
  }

  return environmentTexture;
}
