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
hold the exported world offset). Free-fly cameras (FREE/UNIVERSAL) also honor an
optional **Keep Upright** toggle (`lockRoll`): `LockCameraRoll` bakes the world
pose and detaches the glb camera from its orientation-correction parent (so
yaw/pitch happen in world space), pins look-at to world up, and drops any
residual view-axis roll each frame — keeping the camera level with the horizon.
Targets resolve with entity references in the loader's second pass
([pipeline step 5](03-LOAD-PIPELINE.md)).

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

## Scene look (`environment.ts`, `fog.ts`, `postprocess.ts`)

From the manifest's `scene` block, applied in `FinalizeLevel`: clear/ambient
color; environment texture → IBL (+ optional skybox; `.env` preferred, `.hdr`
supported, `.exr` impossible in-browser); fog (LINEAR/EXP/EXP2);
post-processing — `BuildDefaultPipeline` (FXAA, bloom, tone mapping / exposure
/ contrast) plus a separate SSAO2 pipeline, attached to the active camera,
handles on `level.post`.

Continue: [Audio & Animation →](07-AUDIO-ANIMATION.md)
