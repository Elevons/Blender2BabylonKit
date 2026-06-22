# 06 — Rendering: lights, cameras, shadows, scene look

[← Index](00-INDEX.md) · Prev: [Physics](05-PHYSICS.md) · Next: [Audio & Animation →](07-AUDIO-ANIMATION.md)

## Lights (`subsystems/lights.ts`)

Automatic — no component. The glb creates and places the light;
`ApplyBlenderLight` copies the lamp's properties onto it. Blender inserts an
orientation-correction node when exporting +Y-up, so the GUID node is an
*ancestor* of the light — `FindLightForNode` walks the whole parent chain.
POINT→Point, SUN→Directional, SPOT→Spot (AREA unsupported by glTF — validator
warns). Color exact; intensity approximate (watts don't map cleanly):
`SUN_SCALE` / `PUNCTUAL_SCALE` at the top of the file are the single tuning
point. No fallback light — a dark scene means add a lamp in Blender.

## Cameras (`subsystems/cameras/`)

Mirrors the lights design: the glb creates a faithful `FreeCamera`
(`FindCameraForNode` walks parents the same way); `ApplyBlenderCamera` copies
clip range and FOV/ortho mode; the exporter flags the scene's active camera →
`scene.activeCamera` + `level.activeCamera`. Faithful playback by default — no
controls attached; `main.ts` adds a fallback ArcRotate only when no camera
shipped.

An opt-in **CAMERA component** overrides the type via `BuildTypedCamera`,
which derives the new camera from the faithful one's world transform (so it
starts exactly where Blender framed it), copies the lens, then disposes the
original. Per-type builders: UNIVERSAL (free-fly + key scheme), ARC (orbit;
optional target re-pivots in the second pass; `setPosition(eye)` keeps the
Blender framing), FOLLOW-ORBIT (Babylon FollowCamera; `useBlenderTransform`
derives radius/height/rotationOffset via `DeriveFollowFromPosition`),
FOLLOW-OFFSET (a UniversalCamera driven each frame by a `Level.AddUpdater` to
hold the exported world offset), GEOSPATIAL (Babylon `GeospatialCamera` for
map-like globe navigation — pan, zoom-to-cursor, tilt; the planet mesh must sit
at world origin and **Planet Radius** must match its radius in scene units;
`DeriveGeospatialPose` raycasts the exported eye/forward against that sphere to
seed `center` / `yaw` / `pitch` / `radius`; optional min/max zoom and collision
checking). Free-fly cameras (FREE/UNIVERSAL) also honor an
optional **Keep Upright** toggle (`lockRoll`): `LockCameraRoll` bakes the world
pose and detaches the glb camera from its orientation-correction parent (so
yaw/pitch happen in world space), pins look-at to world up, and drops any
residual view-axis roll each frame — keeping the camera level with the horizon.
Targets resolve with entity references in the loader's second pass
([pipeline step 5](03-LOAD-PIPELINE.md)). GEOSPATIAL has no deferred target —
controls (pointer, wheel, keyboard) attach when **Attach Controls** is on.

#### CAMERA component example (Geospatial)

Globe mesh centered at world origin; camera starts at the exported Blender pose:

```json
{
  "type": "CAMERA",
  "cameraType": "GEOSPATIAL",
  "attachControl": true,
  "planetRadius": 1.0,
  "lowerRadius": 0.01,
  "upperRadius": 0,
  "checkCollisions": false
}
```

`planetRadius` must match the globe mesh radius. `lowerRadius` / `upperRadius` map
to Babylon's `limits.radiusMin` / `limits.radiusMax` (`0` = no limit). Movement
tuning (`zoomSpeed`, `flyToAsync`, clipping behavior, etc.) is available on the
runtime camera via the Babylon API after load.

## Shadows (`subsystems/shadows.ts`)

Driven by each lamp's Cast Shadows toggle; one `ShadowGenerator` per casting
light, all geometry registered as caster + receiver. Per-light settings:
filter (PCF / PCSS / Poisson / Blur ESM / hard), bias, normalBias, darkness,
mapSize, frustum minZ/maxZ (set on the *light*; 0 = auto), `frustumEdgeFalloff`
(directional/spot edge fade), and `forceBackFaces` (render only back faces into
the shadow map — strong acne fix, opt-in because it can leak on thin/open
meshes). Loader options: `{ shadows?, shadowMapSize?, freezeShadows?,
cleanBoneMatrixWeights? }`. Exposed as `level.shadowGenerators`.

**Static-world freeze.** The scene's **Freeze Shadows** flag (or the
`freezeShadows` loader option) renders each shadow map once then freezes it
(`REFRESHRATE_RENDER_ONCE`) — a big perf win that lets you raise the map
resolution, valid only when no caster moves. After moving a caster at runtime,
call `level.RefreshShadows()` for a one-shot re-render. `cleanBoneMatrixWeights`
scrubs bad skeleton weights on load (fixes garbled shadows on skinned meshes).

**Acne defaults.** Blender lamps export `normalBias = 0`, which leaves suns
striped and point/spot edges speckled, so the loader applies a normal-bias floor
when a light doesn't set its own (0.02 directional, 0.03 point/spot). It also
tightens the shadow depth range automatically, since a stretched depth buffer is
the usual cause of acne: directional suns get `autoCalcShadowZBounds` (Babylon
re-fits minZ/maxZ to the casters each frame) when clip planes are left at auto;
point/spot lights cap `shadowMaxZ` to the lamp's range (set a **Custom Range** in
Blender for this to kick in). Explicit clip start/end or normal bias always win
over these defaults.

## Scene look (`environment.ts`, `fog.ts`, `atmosphere.ts`, `postprocess.ts`)

From the manifest's `scene` block: clear/ambient color, environment texture →
IBL, fog (LINEAR/EXP/EXP2), physically based atmosphere, and post-processing are
applied in `await ApplySceneSettings` during `FinalizeLevel` (environment loads
asynchronously — the skybox is created only after the env texture is ready).
`ApplyAtmosphere` runs immediately after scene settings when the manifest
includes an `atmosphere` block. Post-processing is applied **after**
`level.Begin()` so behaviors that create a runtime camera in `OnStart` (e.g. a
script-built `UniversalCamera`) receive the stack on the camera that is actually
active.

### Environment / IBL (`subsystems/environment.ts`)

Image-based lighting comes from `scene.environmentTexture`. Without an
`environment` block in the manifest, PBR materials get no cubemap — only direct
lamps and the optional `ambientColor` fill.

**Authoring (Properties › Scene › Babylon › Rendering › Environment):**

| Blender setting | Manifest | Runtime |
|---|---|---|
| World environment texture | `environment.file` | Copied to `env/` when wired to **World Output → Surface** (Background → env/image texture); orphaned textures in the node editor are ignored |
| **Default Environment** | `environment.useDefault: true` | Loads Babylon's built-in studio HDR from the CDN at runtime (no file exported) |
| **Show Skybox** | `environment.createSkybox` | When `true`, shows the background; when `false`, IBL only. `.env` / `useDefault` use Babylon's DDS skybox via `EnvironmentHelper` (large size + `infiniteDistance`); HDR/equirect use `createDefaultSkybox` |
| **Skybox Ignores Fog** | `environment.skyboxIgnoreFog` | When `true` (and skybox is on), sets `mesh.applyFog = false` so scene fog does not wash out the background |

A World texture always wins over **Default Environment**. Export copies World
textures through `copy_asset` / `save_image_asset` with
`sanitize_asset_filename()` (spaces and unsafe characters → URL-safe names under
`env/`). The same source file always maps to the same export path; Live Link
re-exports **overwrite** that file rather than suffixing `_2`, `_3`, … World
texture discovery is shared by export and the scene UI in
`scene/environment.py` (`find_world_env_node` traces **World Output → Surface →
Background → env/image** only — orphan nodes in the node editor are ignored).

`useDefault` loads Babylon's built-in studio `.env` from the CDN at runtime — the
player needs network access. Format handling at load: `.env` (Babylon prefiltered
cube — recommended) → `CubeTexture`; `.hdr` → `HDRCubeTexture`; anything else →
equirectangular. `.exr` is not loadable in-browser.

`ApplyEnvironment` is async: it awaits `WhenTextureReady` (30s timeout) before
creating a skybox so `createDefaultSkybox` does not clone an empty cube map on
the first Live Link reload.

#### Manifest example

```json
"environment": {
  "useDefault": true,
  "intensity": 1,
  "rotationY": 0,
  "createSkybox": false
}
```

With skybox and fog (exports `skyboxIgnoreFog` when **Show Skybox** is on):

```json
"environment": {
  "useDefault": true,
  "intensity": 1,
  "rotationY": 0,
  "createSkybox": true,
  "skyboxIgnoreFog": true
}
```

Or with an authored World texture:

```json
"environment": {
  "file": "env/sky.env",
  "intensity": 1,
  "rotationY": 0,
  "createSkybox": false
}
```

Omit `"environment"` (or set it to `null`) when neither a World texture nor
**Default Environment** is configured. `skyboxIgnoreFog` is only exported when
`createSkybox` is `true`; older manifests without it keep Babylon's default
(skybox is fogged).

### Atmosphere (`subsystems/atmosphere.ts`)

The Babylon **Atmosphere** addon (`@babylonjs/addons/atmosphere`) provides a
physically based sky and aerial perspective. It automatically integrates with
`PBRMaterial` for consistent lighting. Requires WebGL 2 or WebGPU — the runtime
calls `Atmosphere.IsSupported(engine)` and logs a warning if unsupported.

**Authoring (Properties › Scene › Babylon › Atmosphere):**

| Blender setting | Manifest | Runtime |
|---|---|---|
| **Atmosphere** (header) | `atmosphere` block (omit when off) | `new Atmosphere("atmosphere", scene, [sunLight], options)` |
| **Sun Light** | `atmosphere.sunLightId` | Entity GUID of a Blender SUN lamp; omit to use the first exported SUN |
| **PBR Sun Intensity** | `atmosphere.pbrSunIntensity` | When `true` (default), sets the sun's intensity to π for PBRMaterials |
| **Use LUTs** | `atmosphere.useLuts` | When `true` (default), LUT-based sky/aerial perspective; `false` = ray marching |
| **Multi Scattering** | `atmosphere.multiScatteringIntensity` | Overall multiple-scattering contribution |
| **Night Ambient** | `atmosphere.minimumMultiScatteringIntensity` | Floor when the sun is below the horizon |
| **Ground Albedo** | `atmosphere.groundAlbedo` | Average ground-reflected light color |
| **Peak Rayleigh** / **Mie** / **Ozone** | `atmosphere.physical.*` | Scattering and absorption tuning (Earth-like defaults) |
| **Origin Height (km)** | `atmosphere.physical.originHeight` | Scene origin height above the planet surface |

When atmosphere is enabled, export forces `environment.createSkybox: false` — the
atmosphere renders the sky. IBL from a World texture or **Default Environment**
still loads for material reflections. For best results, enable **Post-Processing
› Default Pipeline** (HDR) with tone mapping — the runtime sets
`isLinearSpaceComposition` from the manifest's `postProcessing.defaultPipeline`.

Time of day is driven by the SUN lamp's direction in Blender (re-export after
aiming the sun). The handle lives on `level.atmosphere` and is disposed with the
level.

#### Manifest example

```json
"atmosphere": {
  "pbrSunIntensity": true,
  "useLuts": true,
  "multiScatteringIntensity": 1,
  "minimumMultiScatteringIntensity": 0.1,
  "groundAlbedo": [1, 1, 1],
  "physical": {
    "peakRayleighScattering": [0.000005802, 0.000013558, 0.0000331],
    "mieScatteringScale": 1,
    "ozoneAbsorptionScale": 1,
    "originHeight": 0
  }
}
```

Omit `"atmosphere"` (or set it to `null`) when the panel header is off.

### Post-processing (`subsystems/postprocess.ts`)

Handles land on `level.post` (`PostProcessingHandles`: `pipeline?`,
`ssao?`, `volumetricLightScattering?`). Use `RetargetPostProcessing(handles, camera)`
if gameplay swaps the active camera later (default pipeline only today).

When `scene.postProcessing.defaultPipeline` is true, the runtime builds Babylon's
`DefaultRenderingPipeline` (HDR on). Supported effects:

| Effect | Manifest keys | Notes |
|---|---|---|
| MSAA | `msaaSamples` (1–8) | WebGL 2 only; 1 = off |
| FXAA | `fxaa` | Fast approximate AA on the pipeline texture |
| Bloom | `bloom.{enabled,threshold,intensity,kernel?,scale?}` | Tone mapping auto-enabled when bloom is on (HDR) |
| Sharpen | `sharpen.{enabled,edgeAmount?,colorAmount?}` | |
| Depth of field | `depthOfField.{enabled,blurLevel?,focusDistance?,focalLength?,fStop?}` | `blurLevel`: LOW / MEDIUM / HIGH |
| Chromatic aberration | `chromaticAberration.{enabled,aberrationAmount?,radialIntensity?,directionX?,directionY?}` | direction 0,0 → radial |
| Grain | `grain.{enabled,intensity?,animated?}` | |
| Glow layer | `glow.{enabled,blurKernelSize?,intensity?}` | Emissive-material glow |
| Tone mapping | `toneMapping`, `toneMappingType?` | STANDARD / ACES (default) / KHR_PBR_NEUTRAL |
| Exposure / contrast | `exposure`, `contrast` | Image-processing pass |
| Vignette | `vignette.{enabled,weight?,stretch?,centerX?,centerY?}` | |
| Color grading LUT | `colorGrading.{enabled,file}` | `.3dl` or `.png` under `post/` |
| Color curves | `colorCurves.{enabled,globalHue?,…}` | Global / highlights / midtones / shadows |
| SSAO | `ssao`, `ssaoSettings?` | Separate `SSAO2RenderingPipeline` (`radius`, `totalStrength`, `samples`, `maxZ`) |
| Volumetric light scattering | `volumetricLightScattering.{enabled,…}` | Separate `VolumetricLightScatteringPostProcess` on the active camera; does **not** require Default Pipeline |

**Volumetric light scattering** (`volumetricLightScattering`) uses Babylon's
`VolumetricLightScatteringPostProcess` — light shafts from a mesh light source
(typically a sun billboard). Enable it in **Properties › Scene › Babylon ›
Post-Processing › Volumetric Light Scattering**; it can run with or without
Default Pipeline. Omit `lightSource` (or leave the Blender picker empty) and the
runtime creates a default billboard. The light-source object is force-included
in the export GUID pass like other entity references.

| VLS key | Notes |
|---|---|
| `lightSource` | Entity GUID of the light-source mesh; omit for default billboard |
| `samples` | Ray-march quality (default 100) |
| `ratio` | Output scale (`1.0`) or `{ postProcessRatio, passRatio }` for split quality |
| `invert` | `true` = rays downward; `false` = upward |
| `useCustomMeshPosition` | Scatter from `customMeshPosition` instead of the mesh |
| `customMeshPosition` | Babylon Y-up world position |
| `exposure`, `decay`, `weight`, `density` | Scattering tuning (Babylon defaults: 0.3, 0.96815, 0.58767, 0.926) |

Set the light-source material's diffuse color/texture in Blender — Babylon 9
deprecated `useDiffuseColor` on the post-process itself.

**Not yet implemented** (separate Babylon pipelines, not part of the default
stack): SSR, TAA, motion blur, IBL shadows, frame-graph
`FrameGraphVolumetricLightingTask` (Babylon 9's directional-light volume path).

#### Manifest example

```json
"postProcessing": {
  "defaultPipeline": true,
  "fxaa": true,
  "msaaSamples": 4,
  "bloom": { "enabled": true, "threshold": 0.9, "intensity": 0.5, "kernel": 64, "scale": 0.5 },
  "ssao": true,
  "ssaoSettings": { "radius": 2, "totalStrength": 1, "samples": 8 },
  "toneMapping": true,
  "toneMappingType": "ACES",
  "exposure": 1,
  "contrast": 1,
  "sharpen": { "enabled": false, "edgeAmount": 0.3, "colorAmount": 1 },
  "depthOfField": { "enabled": false, "blurLevel": "LOW", "focusDistance": 2000, "focalLength": 50, "fStop": 1.4 },
  "chromaticAberration": { "enabled": false, "aberrationAmount": 30 },
  "grain": { "enabled": false, "intensity": 30, "animated": false },
  "glow": { "enabled": false, "blurKernelSize": 16, "intensity": 1 },
  "vignette": { "enabled": false, "weight": 1.5 },
  "colorGrading": { "enabled": false, "file": "post/LateSunset.3dl" },
  "colorCurves": { "enabled": false, "globalHue": 30 },
  "volumetricLightScattering": {
    "enabled": true,
    "lightSource": "<guid-of-sun-billboard>",
    "samples": 100,
    "ratio": { "postProcessRatio": 1.0, "passRatio": 0.5 },
    "invert": false,
    "exposure": 0.3,
    "decay": 0.96815,
    "weight": 0.58767,
    "density": 0.926
  }
}
```

VLS-only (no Default Pipeline):

```json
"postProcessing": {
  "defaultPipeline": false,
  "volumetricLightScattering": {
    "enabled": true,
    "samples": 75
  }
}
```

Omit optional effect blocks when disabled; older manifests with only
`fxaa` / `bloom` / `toneMapping` / `exposure` / `contrast` still load.

### Blender UI

**Properties › Scene › Babylon › Rendering › Environment** (`ui/scene_panels.py`).
**Default Environment** (IBL without a World texture), **Show Skybox**
(IBL-only background when off), and **Skybox Ignores Fog** (disabled when Show
Skybox is off). The panel previews the texture on the active World Output chain
via `scene/environment.py`.

**Properties › Scene › Babylon › Atmosphere** (`ui/scene_panels.py`).
Physically based sky settings on `scene.bjs_scene.atmosphere`
(`scene/atmosphere.py`). Export serialization is in `export/atmosphere.py`.

**Properties › Scene › Babylon › Post-Processing** (`ui/post_panels.py`).
Settings live on `scene.bjs_scene.post` (`scene/post_processing.py`). Export
serialization is in `export/post_processing.py` (LUT files copied via
`copy_asset` → `post/`; VLS light-source objects force-included via
`export/level.py`). Exposure/contrast export as `1.0` when tone mapping
is off so stale panel values do not crush the image.

Continue: [Audio & Animation →](07-AUDIO-ANIMATION.md)
