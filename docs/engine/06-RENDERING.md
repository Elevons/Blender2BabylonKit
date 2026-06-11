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
hold the exported world offset). Targets resolve with entity references in the
loader's second pass ([pipeline step 5](03-LOAD-PIPELINE.md)).

## Shadows (`subsystems/shadows.ts`)

Driven by each lamp's Cast Shadows toggle; one `ShadowGenerator` per casting
light, all geometry registered as caster + receiver. Per-light settings:
filter (PCF / PCSS / Poisson / Blur ESM / hard), bias, normalBias, darkness,
mapSize, frustum minZ/maxZ (set on the *light*; 0 = auto). Loader options:
`{ shadows?, shadowMapSize? }`. Exposed as `level.shadowGenerators`.

## Scene look (`environment.ts`, `fog.ts`, `postprocess.ts`)

From the manifest's `scene` block, applied in `FinalizeLevel`: clear/ambient
color; environment texture → IBL (+ optional skybox; `.env` preferred, `.hdr`
supported, `.exr` impossible in-browser); fog (LINEAR/EXP/EXP2);
post-processing — `BuildDefaultPipeline` (FXAA, bloom, tone mapping / exposure
/ contrast) plus a separate SSAO2 pipeline, attached to the active camera,
handles on `level.post`.

Continue: [Audio & Animation →](07-AUDIO-ANIMATION.md)
