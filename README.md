# Babylon Level Kit

A small **Unity-style component/level-editor layer for Blender** that exports
scenes to **Babylon.js**. You author your level in Blender, attach components
(colliders, rigid bodies, tags, scripts) to objects, hit Export, and a tiny
runtime reconstructs everything in Babylon — geometry, physics, and behaviors.

This is a **working foundation**, not a literal full Unity clone. It gives you
the architecture (an extensible ECS-ish component system on both sides) and a
handful of real components so you can grow it toward whatever your game needs.

> Targets **Blender 5.x** (also installs on 4.2+) and **Babylon.js 9.x**.
> On the Babylon side it uses the modern `appendSceneAsync` loader and the
> Physics V2 / Havok API. The Blender side ships as a proper **extension**
> (`blender_manifest.toml`).

## How it works

Two halves connected by a clean file boundary:

```
Blender addon  ──►  level.glb         (meshes, lights, cameras, transforms, hierarchy)
               └─►  level.scene.json  (your components + per-light/camera & scene settings)

Babylon runtime ──► loads the .glb, then reads the manifest and matches each
                    entity to its glTF node by GUID, attaching components.
```

glTF already carries everything it's good at (geometry/transforms/parenting),
so the manifest only stores what glTF can't express: your ECS components.
Matching is by a stable **GUID** stamped into each object (see "Entity identity"
below), so renaming objects in Blender doesn't break the link.

## Documentation

Build the docs from the repo root with `npm run docs:build`, then open
[`docs/index.html`](docs/index.html) (searchable landing with interactive diagrams
and prose chapters). **Contributors:** edit sources under `scripts/docs/` and
`scripts/docs/prose/content/` — see
[`docs/BUILDING-DOCS.html`](docs/BUILDING-DOCS.html) for the full map. Quick
checks: `npm run docs:validate` (registry) and `npm run docs:check-links`.

## Install the Blender add-on

Use `babylon_level_kit_extension.zip`. Blender → Edit → Preferences → Get
Extensions → drop-down (top-right) → **Install from Disk…** → pick the zip →
enable it. In the 3D viewport press **N** and open the **Babylon** tab.

Targets Blender 4.2+ (incl. 5.x). Uses only stable operator/panel/property
APIs.

## Authoring a level

- Select an object → **Babylon** tab → **Add Component**.
- Each component is a collapsible panel (like a modifier). Its header has an
  enable toggle and a **▾ menu** with *Duplicate*, *Copy/Cut/Paste*, *Move
  Up/Down* (reorder), and *Delete*. To move a component to another object: **Cut**
  it, select the other object, then **Paste** (Copy+Paste duplicates it across
  objects instead). The clipboard is session-scoped and works across objects.
- **Tag** – an entity tag/layer you can query at runtime (`level.ByTag("Enemy")`).
- **Collider** – box/sphere/capsule/cylinder/convex/mesh. *Auto-Fit* derives
  size from the mesh bounding box at runtime (recommended). Toggle *Is Trigger*
  for overlap-only volumes. *Make Invisible* hides the mesh in Babylon.js at
  runtime while keeping the physics collider active (useful for invisible
  triggers or collision-only blocking volumes). When the object is selected,
  *Show Preview* draws the collider as a cyan wireframe in the viewport. Manual *Size* / *Center Offset* / *Rotation*
  are authored in Blender axes (what the preview shows) and converted to Babylon
  Y-up on export; capsule/cylinder run along Blender's up (Z) axis. Convex/mesh
  use the mesh itself, so they have no separate wireframe. *Fit to Bounds*
  snapshots the mesh bounding box into the manual fields so you can start from an
  accurate shape and tweak it with the preview.
- **Rigid Body** – Dynamic / Static / Kinematic, plus mass, friction, bounce,
  damping. Combine with a Collider on the same object; the collider supplies the
  shape and the rigid body supplies the dynamics.
- **Constraint** – physics joint to another body: Fixed, Ball & Socket, Hinge,
  Slider, Spring, or **Custom (6DoF)** (per-axis free/locked/limited/spring on one
  joint). Pick a **Target**, set the **Pivot** (owner-local), and for hinge/slider/
  spring/custom pick the **Axis** (becomes constraint frame X). See
  [Constraints (physics joints)](#constraints-physics-joints) below.
- **Audio** – attach a sound file (copied next to the export); volume, loop,
  auto-play, 3D spatial, max distance, playback rate.
- **GUI** – attach a Babylon GUI layout (the `.json` saved by the online **GUI
  Editor**, copied next to the export) as a **Fullscreen** HUD overlay or
  projected **On Mesh** for in-world UI.
- **Particles** – attach a Babylon particle system (the `.json` saved by the
  online **Particle Editor**, copied next to the export); emits from this
  object, with optional GPU mode, auto-start, and a capacity override.
- **MSDF Text** – crisp scalable 3D labels using Babylon's MSDF TextRenderer
  (BMFont `.json` + glyph atlas `.png`, copied into `fonts/` next to the export);
  color, thickness, stroke, billboard, and alignment options.
- **3D GUI** – in-scene interactive UI, one component per Babylon 3D control:
  **3D Button** / **3D Holographic Button** / **3D Touch Holographic Button**
  (anchored to the object, with text/image and On Click events), **3D Mesh
  Button** (your own mesh becomes the clickable control), and the layout
  panels **3D Stack / Sphere / Cylinder / Plane / Scatter Panel** (children =
  Blender child objects carrying button components). Clicks send messages via
  the same `OnMessage` hook trigger volumes use.
- **Camera** – opt-in type override on a camera object (ArcRotate / Follow /
  Geospatial / …); **Track Target**, **Orbit/Zoom/Pan Speed** on orbit cameras;
  most cameras stay faithful FreeCameras with no component.
- **Script** – click **Open Script…** to pick the behavior's source file in a
  file browser. The picked filename (minus extension) becomes the *registry
  key* (e.g. `behaviors/Rotator.ts` → `Rotator`); the field stays editable. Add
  arbitrary key/value params below. The runtime resolves the key against its
  registered behaviors — see the behaviors-folder convention under "Run the
  Babylon runtime".

Empties work great as logic entities / spawn markers (they export as transform
nodes). Then **Export → Export Level**, choosing a `.glb` path; you get
`yourlevel.glb` + `yourlevel.scene.json` side by side.

Objects **disabled in renders** (the camera icon in the outliner) are skipped
entirely — no geometry in the glb and no manifest entry. Use it for blockout,
reference, or editor-only objects you don't want in the level. (Viewport-only
hiding does *not* exclude an object; only the render toggle does.)

## Run the Babylon runtime

The repo is an **npm workspaces monorepo**: the engine lives once in
`packages/engine` (the `@bjs/engine` package) and every app under `apps/`
depends on it via a workspace symlink — edit the engine and every app sees it
immediately, no publishing or copying. Engine + Blender add-on versions stay in
lockstep as before.

```bash
npm install        # once, at the repo root — links all workspaces
# put your exported files where the playground's main.ts expects them:
cp /path/to/level.glb /path/to/level.scene.json apps/playground/public/levels/
npm run dev        # the playground app (Vite)
npm run typecheck  # tsc over the engine package + the app
```

Open the dev URL. `apps/playground/src/main.ts` boots an engine, enables Havok
physics, registers the example behaviors, and loads `/levels/level.scene.json`.

> Physics uses Babylon's **V2 / Havok** API. The `@babylonjs/havok` package
> ships a `.wasm` that must be served — the included `vite.config.ts` handles
> this by excluding it from dep pre-bundling.

To **see the colliders** in the running scene, press **C** (toggles Babylon's
physics debug wireframes), or call `level.ShowColliders(true)` yourself. Press
**I** to toggle the Babylon **Inspector** (scene tree + property grids; dev-only,
lazy-loaded). Both keys are gated by the **Debug Build** checkbox in the Export
panel — untick it for a release export and the manifest carries `"debug": false`,
disabling the debug keys (and the `debugColliders` loader option). Older
manifests without the field behave as debug-enabled. You can
also have them on from the start: `loader.Load(url)` with the loader constructed
as `new LevelLoader(scene, registry, { debugColliders: true })`.

## Iteration workflow (Live Link)

The Export panel has a **Live Link** checkbox. Export once by hand to set the
path, tick the box, and from then on every **Ctrl+S** in Blender re-exports the
level automatically; the dev server's `ReloadOnLevelExport` plugin watches
**all files** under `public/levels/` (glb, `env/`, manifest, … — not only
`.scene.json`) and sends a debounced full reload, so replaced HDRs still refresh
even when the manifest bytes are unchanged. Save in Blender → see it in Babylon.
Warnings from the validator are printed to Blender's console on each live export.

The **Validate** button runs the same checks without exporting: missing script
files, references to render-disabled objects, MESH colliders on DYNAMIC bodies,
constraint ends without physics, invalid CUSTOM axis rows (min > max), area
lights, duplicate GUIDs, and a missing active camera. The Export Level operator
also runs them and lists warnings in its report.

## Prefabs (linked .blend files)

Reuse props and characters in separate **.blend library files**: link them into
your level scene (**File → Link…**), then apply Blender **library overrides** on
each instance you want to customize (transform, components, colliders,
`@exposed` values). Export always runs from the **level** file — the runtime sees
a flat level, not a prefab loader. Full workflow:
[docs/blender/PREFABS.html](docs/blender/PREFABS.html).

## Creating a new project

New games are apps inside the monorepo. From the repo root:

```bash
npm run create -- --name my-game --title "My Game" --level Arena
npm install                              # links @bjs/engine into the new app
npm run dev --workspace apps/my-game
```

This stamps `apps/my-game` from the playground template: its own `main.ts`,
`behaviors/`, `index.html`, and an empty `public/levels/`. The engine is **not
copied** — every app depends on `"@bjs/engine": "*"`, satisfied by a workspace
symlink to `packages/engine`, so engine fixes reach all apps instantly. Flags:
`--title <text>` (browser tab), `--level <name>` (point `main.ts` at
`/levels/<name>.scene.json`), `--force` (overwrite an existing app).

### Behaviors (scripts)

Put one behavior class per file in `src/behaviors/`, named after the class and
default-exported. Mark editable fields with `@exposed`:

```ts
// src/behaviors/Rotator.ts
import { Behavior, exposed } from "@bjs/engine";

export default class Rotator extends Behavior
{
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" }) speed = 45;
  @exposed() axis: [number, number, number] = [0, 1, 0];

  OnUpdate(deltaSeconds: number): void { /* uses this.speed, this.axis */ }
}
```

`OnUpdate` runs once per frame from the app's `engine.runRenderLoop(() => scene.render())`
hook chain — see [Runtime Basics](docs/engine/02-RUNTIME-BASICS.html) for delta time,
load vs run time, and where Havok steps relative to your script.

When you pick this file with **Open Script…** in Blender, the add-on parses the
`@exposed` fields and shows typed widgets (float/bool/string/vector/color) right
in the component. Edit the values per-object; on export they're written to the
manifest as typed JSON, and the runtime applies them onto the instance before
`OnStart()`. Hit the **Sync** (refresh) button after changing which fields a
script exposes.

Supported defaults: numbers, `true`/`false`, strings, and 3-number arrays
(`VECTOR3`, or `COLOR` with `@exposed({ type: "color" })`). For an **object
reference**, use `@exposed({ type: "entity" })` on a `Entity | null` field; in
Blender it shows an object picker, picking an object auto-assigns it a GUID, and
at runtime the field resolves to the referenced `Entity` (see `LookAt.ts`).

For a **dropdown**, use `@exposed({ type: "enum", options: ["idle", "walk",
"run"] }) state = "idle"` — Blender shows the choices as a menu, and the field is
just that string at runtime. For a **variable-length array**, use
`@exposed({ type: "list", of: "float" }) speeds = [1, 2, 3]` — Blender shows an
add/remove item list, and `of` may be `float`, `int`, `string`, `bool`,
`vector3`, `color`, or `entity`. `vector3`/`color` elements arrive as
`Vector3`/`Color3`; an `entity` list shows an object picker per item and resolves
to an array of `Entity` objects at runtime (nulls for empty slots). See
`Waypoints.ts` and `PatrolTargets.ts`. List defaults must be a single-line literal
(entity lists start empty — you pick the objects in Blender).

`min`/`max`/`label` hints are read from the decorator. The Blender side is a
conservative source parser — anything it can't read is simply not shown, and the
field keeps its code default at runtime. `main.ts` auto-registers everything in
`behaviors/` by filename stem via `AutoRegisterBehaviors`.

## Adding a new component (end-to-end)

1. **`properties.py`** – add it to `COMPONENT_TYPES` and add its fields to
   `BJSComponent`.
2. **`ui.py`** – draw the fields in `_draw_component`.
3. **`export.py`** – serialize the fields in `_serialize_components`.
4. **`types.ts`** – add the matching interface to the `Component` union.
5. **`core/loader/entityBuilder.ts`** – handle the new `type` in `ApplyComponents`.

Adding a new *behavior* (the common case) needs only the runtime: subclass
`Behavior`, register it (`registry.RegisterScripts({ MyThing })`), and reference
it from a Script component in Blender.

## Lights

Lights need **no component** — any Blender light object is picked up
automatically. The Blender lamp *is* the light: edit its color, energy, sun
angle, spot cone, and range in Blender (the Babylon tab also surfaces these for
convenience), and on export the plugin reads the native lamp datablock into the
manifest. The glb already places the light with the correct converted
transform, so at load the runtime copies the Blender properties onto that light
— spot/point position and aim included. **SUN lamps** bake world aim once
(`BakeSunLightWorldTransform`): direction comes from the glTF hierarchy, the
light is detached from its empty, and the empty's world position is **not** used
for shading or shadows (see Shadows). Move or recolor the lamp in Blender,
re-export, and Babylon follows.

Mapping: `POINT → PointLight`, `SUN → DirectionalLight`, `SPOT → SpotLight`.
Area lights aren't part of glTF and don't transfer (the panel warns you).
Intensity is approximate by nature — `SUN_SCALE` and `PUNCTUAL_SCALE` in
`packages/engine/src/subsystems/lights.ts` are the two knobs to tune if a scene reads too bright or dim.
Color transfers exactly.

**Sun angle** (Blender's **Angle** on SUN lamps — angular diameter in radians)
controls shadow penumbra softness. It is exported as `sunAngle` and, when the
lamp casts shadows, mapped linearly to Babylon's PCSS
`contactHardeningLightSizeUVRatio` (Blender 0°→0, 45°→1; clamped above 45°). PCSS is
enabled automatically when a sun angle is authored, since other shadow filters
cannot represent an angular sun.

**Shadows** follow the lamp's **Cast Shadows** toggle (Blender's `use_shadow`).
When it's on, the Babylon tab reveals a **Shadow** subsection with per-light
controls — filter (PCF / PCSS contact-hardening / Poisson / Blur ESM / hard),
map size, bias, normal bias, darkness, frustum clip start/end, **Edge Falloff**
(directional/spot edge fade), and **Back Faces Only**. These are Babylon shadow
concepts (they don't map onto Blender's
renderer-specific shadow settings), so they're authored here and serialized per
light. On load, each shadow-casting light gets a `ShadowGenerator` configured
from those values. Meshes **receive** shadows by default; **casting** is controlled
by Blender **Object Properties → Visibility → Ray Visibility → Shadow**
(`visible_shadow`). When Shadow is off, export stamps `bjs_cast_shadows: 0` in
glTF extras and the loader omits that mesh from shadow casters (receive-only).
Use this on huge ground planes so they don't expand the sun's shadow frustum.
PointLight, Sun (Directional) and Spot can cast; anything else is skipped with a warning.
Generators are exposed as `level.shadowGenerators`. A clip start/end of `0` means
"let Babylon auto-fit the frustum", and a map size of `0` falls back to the
loader default. To set the default resolution or disable the whole pass:
`new LevelLoader(scene, registry, { shadows: false })` or `{ shadowMapSize: 2048 }`.

**Large light rigs.** WebGL limits how many forward lights fit in one PBR shader
(typically ~8–10 before compile failures). When a scene has more enabled lamps than
`scene.lightBudget` (default `8`), the loader automatically clusters point/spot
lights into a `ClusteredLightContainer` or falls back to disabling light uniform
buffers. Sun lamps stay on the forward path so shadows keep working. No Blender
authoring step — see [Rendering — Punctual light budget](docs/engine/07-RENDERING.html)
for modes (`level.punctualLightingMode`), overrides (`clusterPunctualLights`,
`lightBudget`), and limits. Optional manifest fields:

```json
"scene": {
  "clusterPunctualLights": true,
  "lightBudget": 8
}
```

The loader fights **shadow acne** out of the box. Blender ships normal bias at
`0`, which stripes flat planes under a sun and speckles point/spot edges, so when
a light doesn't override it the loader applies a floor (0.02 for directional,
0.03 for point/spot). It also tightens the shadow depth range, the usual culprit:
directional suns get `autoCalcShadowZBounds` (the depth frustum re-fits to the
casters every frame) and `AnchorDirectionalShadowOrigin` (shadow view centered on
caster bounds, not the sun empty's world position), and point/spot lights cap
their far plane to the lamp's range — set a **Custom Range** on the lamp for
the tightest result. **Back Faces Only** (`forceBackFacesOnly`) is the
heavy-handed last resort for stubborn self-shadowing; it's off by default because
it can leak light on thin or single-sided meshes. Any value you set explicitly
always overrides these defaults.

For a fully static level, enable **Freeze Shadows** (scene settings, or the
`freezeShadows` loader option): each shadow map renders once and then freezes, a
big performance win that lets you push `shadowMapSize` higher. Moving casters
won't update afterward — call `level.RefreshShadows()` after relocating one to
force a single re-render. If a skinned mesh shows garbled shadows, load with
`{ cleanBoneMatrixWeights: true }` to scrub imprecise bone weights.

## Cameras

Cameras work like lights — **no component**, fully automatic. Your Blender
camera's transform, hierarchy, FOV (or ortho scale), and clip range come through
the glb, and the plugin marks whichever one is the scene's active camera. At load
the runtime finds that camera, copies the Blender settings onto it, and sets it
as `scene.activeCamera` — so you see exactly what Blender frames. It's exposed as
`level.activeCamera`. No fallback camera is created when the scene provides one;
if you want to fly it around for inspection, `level.activeCamera?.attachControl(
canvas, true)`.

To use a different camera type, add a **Camera component** to the camera object —
this is opt-in and leaves the faithful FreeCamera as the default for every other
camera. Pick a type: **Free**/**Universal** (configures the camera with
speed/inertia/controls), **ArcRotate** (orbits — around a target object you pick,
or, if none, a point ahead of where Blender framed the camera; optional **Track
Target** so the orbit pivot follows a moving target; **Orbit Speed**, **Zoom
Speed**, and **Pan Speed** when controls are attached; optional zoom limits),
**Follow** (tracks a target object you pick), or **Geospatial** (orbits a
spherical planet at world origin — map-like pan/zoom/tilt; set **Planet Radius**
to match your globe mesh, optional min/max zoom, collision checking, and the
same orbit/zoom/pan speed multipliers). All build
from the faithful camera's world transform, so they begin where Blender framed
them: Arc starts at the exported position (its offset from the orbit target
defines the starting angle/distance). Geospatial raycasts the exported pose
against the planet sphere to seed center/yaw/pitch/radius. Follow has two modes: **Fixed Offset** (default) keeps
the camera at a constant world-space offset from the target — exactly where it
sits in Blender — translating with the target and always looking at it; **Orbit**
uses Babylon's FollowCamera, whose offset rotates with the target's facing (with
**Use Blender Position** to derive distance/height/angle from the exported camera,
or set them by hand). When controls are attached, the keyboard-driven types
(Free/Universal/Arc) take a **key scheme** — Arrow keys, WASD, both, or a custom
up/down/left/right assignment.

## Scene settings (environment, fog, atmosphere, post-processing)

The **Properties → Scene → Babylon Scene** panel holds scene-wide render
settings, serialized into a top-level `scene` block in the manifest and applied
at load:

- **Clear / ambient color** — `scene.clearColor` / `ambientColor`.
- **Environment** — image-based lighting from the manifest `environment` block
  (omit it for lamps + ambient only). In the **Babylon Scene** N-panel →
  **Environment**:
  - **Default Environment** — IBL without a World texture; exports
    `useDefault: true` and loads Babylon's built-in studio `.env` from the CDN at
    runtime (player needs network access).
  - **Intensity** / **Rotation Y** — tune the default environment when no World
    texture is active (exports `environment.intensity` and `environment.rotationY`
    in radians). Hidden when a World texture wins.
  - **Show Skybox** — when on, draws the background; when off, IBL only.
    At load, `ComputeSkyboxSize()` sizes the skybox from level geometry
    (`max(1000, scene diagonal × 3)`) and pins it to the active camera
    (`infiniteDistance`). Works for default env, `.env`, `.hdr`, and equirect
    World textures.
  - **Skybox Ignores Fog** — when on (and Show Skybox is on), the skybox stays
    visible through scene fog (`mesh.applyFog = false` at runtime).
  - A World texture on the active **World Output → Surface → Background** chain
    wins over Default Environment; it's copied into `env/` with a URL-safe filename
    (`sanitize_asset_filename`). Orphan textures elsewhere in the node editor are
    ignored. `.env` (Babylon's prefiltered cube) is recommended; `.hdr` works;
    `.exr` can't load in-browser. For World textures, intensity and Y-rotation
    come from the World's Background/Mapping nodes (Mapping Z is negated on
    export for Z-up → Y-up). At load, `ResolveEnvironmentRotation` adds `+π/2`
    for panorama sources (`.hdr` and equirect PNG/JPG — not prefiltered `.env`)
    so Blender Mapping yaw `0` matches Babylon; `ApplyEnvironmentRotation` applies
    the same yaw to IBL and the skybox texture (not a separate mesh spin). All
    exported file types with **Show Skybox** on use `createDefaultSkybox` with
    the same texture as IBL. `ApplyEnvironment` waits for the texture before
    creating a skybox so the first Live Link reload doesn't show a blank
    background. On km-scale geometry, also raise the camera **Clip End** (Blender
    default `1000` is often too short).
- **Fog** — linear/exp/exp² with color and range/density.
- **Atmosphere** — physically based sky and aerial perspective via Babylon's
  `@babylonjs/addons/atmosphere` addon. Enable in **Properties → Scene → Babylon
  → Atmosphere**; pick a **Sun Light** (Blender SUN lamp) or leave empty to use
  the first exported sun. Replaces the environment skybox at runtime; IBL from a
  World texture still applies to materials. Tune Rayleigh/Mie/ozone scattering,
  multi-scattering, and night ambient. For best results, also enable
  **Post-Processing** with HDR tone mapping. Time of day follows the sun lamp's
  direction in Blender.
- **Post-processing** — Babylon's `DefaultRenderingPipeline` (FXAA, bloom, tone
  mapping/exposure/contrast). SSAO is wired as a *separate* `SSAO2RenderingPipeline`
  (it isn't part of the default pipeline). These attach to the active camera, so
  the scene needs one. Handles are exposed on `level.post`.

## Audio

Add an **Audio** component to any object: pick a sound file (.mp3/.wav/.ogg —
copied into `audio/` next to the export), set volume, loop, auto-play, playback
rate, and **3D Spatial** (positioned at the object and following it; off =
ambient). Built on Babylon's **audio engine v2**. Browsers block sound until the
first user gesture, so auto-play sounds start on the first click/keypress.
Scripts reach them via `entity.GetSound("name")?.play()` (named by file stem) or
`entity.sounds`.

## GUI

Add a **GUI** component to any object and pick the `.json` exported from the
[online GUI Editor](https://gui.babylonjs.com/) (copied into `gui/` next to the
export). Two modes:

- **Fullscreen** — a 2D overlay (a HUD), rendered with
  `AdvancedDynamicTexture.CreateFullscreenUI`. The **Foreground** toggle draws it
  in front of (or behind) the scene.
- **On Mesh** — projects the layout onto the object's own mesh for in-world UI
  (`CreateForMesh`), at the **Texture Width/Height** resolution. Needs a mesh
  object (the validator warns otherwise).

The layout JSON is fetched and parsed at load. Scripts reach the texture via
`entity.GetGui("name")?.getControlByName("PlayButton")` (named by file stem) or
`entity.guiTextures`. The runtime depends on `@babylonjs/gui` (already wired into
the playground and every scaffolded app).

## Particles

Add a **Particles** component and pick the `.json` exported from the
[online Particle Editor](https://particles.babylonjs.com/) (copied into
`particles/` next to the export). Options: **Use GPU** (creates a
`GPUParticleSystem` when supported, else CPU), **Auto Start** (emit on load),
**Attach to Object** (emit from this entity — meshes and empties follow it at
runtime), and **Max Particles** (override the JSON's capacity; 0 keeps it).
Use **Scan Textures** on the component to list texture slots from the
particle JSON, then pick image files for any slot that needs one. Export
copies them into `particles/` and patches the matching
`ParticleTextureSourceBlock` by block id (set **URL in JSON** when you need a
subpath, e.g. `fx/bubble.png`).
Any texture path in the JSON is loaded from beside the `.json` at runtime.
Scripts reach the system via `entity.GetParticles("name")` (named
by file stem) or `entity.particleSystems` to `.start()` / `.stop()` it.

## MSDF Text

Add an **MSDF Text** component to any object for resolution-independent 3D labels
using Babylon's [`TextRenderer`](https://doc.babylonjs.com/addons/msdfText/)
(`@babylonjs/addons`). Pick the paragraph **Text**, a **Font JSON** (BMFont format
from [msdf-bmfont](https://msdf-bmfont.donmccurdy.com/) or
[msdfgen](https://github.com/Chlumsky/msdfgen)), and the paired **Font Texture**
PNG atlas — both are copied into `fonts/` next to the export.

Options mirror the Babylon API: **Color**, **Thickness** (−0.5…0.5), **Billboard**
(always face the camera; only the parent's translation is used), **Screen
Projected** (constant on-screen size when billboarding), **Ignore Depth** (draw on
top), stroke color/inset/outset, **Align**, **Max Width** (wrap; 0 = no wrap),
**Line Height**, and **Letter Spacing**. The text is parented to the entity's glTF
node, so Blender position/rotation/scale place it in the world.

Font assets are shared when several entities use the same files. At load the
engine creates a `TextRenderer` per component (async shader compile) and draws
all of them after the main scene pass. Scripts reach a renderer via
`entity.GetTextRenderer("roboto-regular")` (named by the JSON file stem),
`entity.textRenderers`, or `entity.GetAttachment("MSDF_TEXT")`.

Generate glyph sets for the characters your game needs — a typical English set:

```
abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 `~!@#$%^&*()-_=+[{]}\|;:'",<.>/?
```

The runtime depends on `@babylonjs/addons` (already wired into the playground and
every scaffolded app).

## 3D GUI (in-scene interfaces)

Babylon's 3D GUI has no external editor — Blender *is* the editor here. Each
control is its own component; place objects where the UI should live and
attach:

| Component | Babylon class | Put it on |
|---|---|---|
| **3D Button** | `Button3D` | An empty (or any anchor) — text or image on a 3D plate |
| **3D Holographic Button** | `HolographicButton` | An anchor — MRTK-style, with text/image/tooltip |
| **3D Touch Holographic Button** | `TouchHolographicButton` | An anchor — adds XR near-touch |
| **3D Mesh Button** | `MeshButton3D` | A **mesh** — your own geometry becomes the control |
| **3D Stack / Sphere / Cylinder / Plane / Scatter Panel** | `StackPanel3D` … | An empty — lays out child buttons |

Every button has an **On Click Events** list (target object + message — the
same rows as trigger colliders): clicking delivers
`OnMessage(message, buttonEntity)` to the target's behaviors. Button images
are copied into `gui/` next to the export.

**Panels use Blender parenting**: parent button objects under the panel object
(Ctrl+P) and the panel arranges them at runtime — child transforms only express
membership, not position. Standalone buttons (no panel parent) are anchored to
their object with `linkToTransformNode`, so they follow it if it moves. A
**3D Mesh Button** keeps its mesh's own world placement.

At load, all 3D GUI builds in a post-pass on one shared `GUI3DManager`
(`level.gui3DManager`, disposed with the level). Scripts reach controls via
`entity.controls3D` or `entity.GetControl3D("name")` (named after the Blender
object) to change text, hide menus, or subscribe to hover events. The
holographic slate and the XR Near/Hand menus are not yet wrapped as components.

## Trigger events (messaging)

A trigger collider (**Is Trigger** on) gains an **On Enter Events** list: each
row is a target object, a message string, and an optional tag filter. When
something enters the volume, the message is delivered to the target's behaviors
via the `OnMessage(message, source)` hook — `source` is the entity that entered.
From code, `entity.SendMessage("open", sender)` does the same thing. See
`MessageLogger.ts` for a receiver that logs messages and can play a sound.
Note: MESH-shaped triggers never fire in Havok (the validator warns); use a
primitive or CONVEX shape for trigger volumes.

## Constraints (physics joints)

Add a **Constraint** component to a physics object and pick the **Target** body:

| Type | Use for |
|------|---------|
| **Fixed** | Weld two bodies (no relative motion) |
| **Ball & Socket** | Free rotation around a shared pivot |
| **Hinge** | One rotation axis (doors, levers, wheels) |
| **Slider** | One translation axis (drawers, pistons) |
| **Spring** | Sprung translation along one axis (wheel suspension) |
| **Custom (6DoF)** | Per-axis free / locked / limited / spring on **one** joint |

Pivot is authored in the object's local space (Blender axes). For hinge, slider,
spring, and custom types, **Axis** picks which local direction becomes constraint
frame X. Hinge/Slider take optional min/max limits (degrees / meters) and an
optional **Motor** (target speed + max force). Spring takes stiffness/damping
plus travel limits (meters). **Bodies Collide** controls whether the two jointed
bodies collide with each other.

**Custom (6DoF)** exposes six rows (Linear X/Y/Z, Angular X/Y/Z). Each axis can
be **Free**, **Locked**, **Limited** (min/max), or **Spring** (min/max +
stiffness/damping). Angular limits are in degrees; linear limits are in meters.
Use this when presets fight each other — e.g. a trailer hitch needs relative
pitch (Angular X free) plus optional vertical compliance (Linear Y spring) in a
**single** joint, not a Hinge stacked on a Spring. **Trailer hitch recipe:** on
the rear body, Custom → Target = front chassis, Axis = X (vehicle width), pivot
at the hitch; **Angular X** = Free (or Limited ±45°), **Linear Y** = Spring
(±0.15 m, stiffness ~80), all other rows Locked.

You can add **multiple Constraint components** on one object (e.g. one joint per
target), but don't put two constraints on the **same body pair** if they fight
over the same degrees of freedom. Prefer **Custom** for combined motion.
Constrained bodies should ideally be **siblings** in the hierarchy, not parented
to each other — both having `PhysicsBody` plus a parent-child link often jitters.

Joints are built after all entities exist, pinning the **as-placed** relative
pose — position the two objects in Blender exactly how they should rest, and
nothing snaps on load. Both ends need a Collider/Rigid Body (the validator
checks). Created joints are exposed as `level.constraints` and disposed with the
level. For fully hand-rolled joints in code, build a `Physics6DoFConstraint`
directly (same frame math as `subsystems/constraints.ts`).

## Input (Action Maps + the Input Actions panel)

The input system clones Unity's Input System: an **Input Actions asset** holds
**Action Maps** ("Player", "UI") that group **Actions** ("Jump", "Move"), each
with **Bindings** — single keys/pad buttons, analog axes/sticks, or composites
(1D Axis from a negative/positive key pair, 2D Vector from up/down/left/right,
WASD-style). Maps enable/disable as a unit.

The scene's asset and **Scene Default** map are defined in Blender's **Input
Actions** panel (Babylon tab): Action Maps list, actions, bindings (with key
capture), and a **Scene Default** picker at the top. Export writes
`scene.inputActions` + `scene.defaultInputMap` into the manifest. First export
also seeds the panel with the built-in "Player" map if it was empty.

**Three ways to get a map in a behavior** (all injected before `OnStart`):

```ts
import { Behavior, inputMap } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";

@inputMap("Player") player!: InputActionMap;  // explicit map
@inputMap() input!: InputActionMap;           // scene default
// — or omit @inputMap and use this.input (also the scene default)

const move = this.player.FindAction("Move")?.ReadVector2();
this.player.FindAction("Jump")?.performed.add(() => { /* ... */ });
```

`@inputMap` stays lowercase (Blender parses the literal token, like `@exposed`).
**Load Default Asset** / **Create Maps Used by Scripts** help bootstrap and sync
maps from your behavior sources. Key names are JS `KeyboardEvent.key` values
("e", "shift", "arrowup", "space"). Input attaches/processes/detaches
automatically; see `InputMover.ts`. Babylon camera key schemes stay separate.

The asset is also a **standalone file**: **Save Asset (.json)** / **Load Asset
(.json)** in the panel read/write `input.inputactions.json` — share one asset
across scenes and games, and let other tools read it. Run
`npm run input:gen -- --app <name>` to generate `src/InputActions.ts` from the
asset (`Maps.Player`, `PlayerActions.Jump` constants), so a typo in an action
name is a compile error instead of a silent runtime warning — keep the asset
at `apps/<name>/input.inputactions.json` and regenerate after editing.

## Animation (NLA clips)

> **Skinned/rigged characters:** put the GUID, Animation settings, and any
> Script components on the **armature object**, not the mesh. glTF skinning
> ignores the mesh node's own transform (joints define the final pose), and
> skeletal clips target the joint nodes under the armature — so components on
> the mesh silently do nothing. The validator warns about this.


Animations ride in the glb: each Blender **NLA strip** is exported as a named
glTF animation, which Babylon imports as an `AnimationGroup`. The manifest adds
a small per-object block (from the **Animation** box in the Babylon panel, shown
whenever the object has NLA strips): auto-play on/off, which clip to auto-play,
loop, and speed.

At load the runtime matches each AnimationGroup to its entity by node membership
(so global name collisions don't matter), exposes them as `entity.animations`,
and — because the glTF loader otherwise auto-starts the first clip — **stops all
groups and only plays what you marked auto-play**. So nothing animates unless you
ask it to. Scripts can drive playback directly: `this.entity.GetAnimation("Walk")
?.start(true)`, or iterate `this.entity.animations` (see `ClipSwitcher.ts`).

## Entity identity (GUIDs)

Each entity is matched between the manifest and the loaded glb by a **GUID**, not
by name. When you add a component (or click **Assign GUID**), the add-on stores a
stable id as a custom property `obj["bjs_id"]`. The exporter runs with
`export_extras=True`, so that id rides along inside the glb as glTF node `extras`.

On the runtime side, `import "@babylonjs/loaders/glTF/2.0/Extensions/ExtrasAsMetadata"`
makes Babylon copy those extras to `node.metadata.gltf.extras`, and the loader
indexes nodes by GUID. This means **renaming an object in Blender no longer
breaks the link**, and duplicate names don't collide. If an entity has no GUID
(e.g. an older v1 export), the loader falls back to name matching, so existing
levels keep working. Query at runtime with `level.ById("...")` or `level.ByTag(...)`.

Any object that has a GUID is exported as an entity — including a bare empty you
just clicked **Assign GUID** on (no component required). A GUID is the "make this
addressable" marker; objects without one stay as plain geometry inside the glb.

## Known limitations / next steps

- **Manual collider center offset** is applied only in explicit (non-auto-fit)
  mode.
- No in-Blender play mode — iteration is export → refresh browser. A natural
  extension is a watch script that re-exports on save.
- If `node.metadata` comes back empty, confirm the `ExtrasAsMetadata` import
  wasn't tree-shaken out and that the glb was exported with Custom Properties
  enabled — the loader will have silently used the name fallback.

## Layout

```
blender_addon/      # the Blender plugin (a Python package)
  __init__.py       # manifest-based registration
  properties.py     # component data model (PropertyGroups) + exposed-var storage
  input_properties.py input_ui.py input_ops.py input_defaults.py  # Input Actions
  operators.py      # add/remove components, script picker, export operator
  ui.py             # the Babylon N-panel (components + export)
  export.py         # glb + JSON manifest writer
  scene_export.py   # scene block (environment, fog, post, inputActions)
  script_parse.py   # reads @exposed and @inputMap from .ts files
packages/
  engine/             # "@bjs/engine" — the runtime engine, shared by every app
    src/
      index.ts          # barrel — apps import the engine via "@bjs/engine"
      core/             # schema + runtime container + load pipeline
        types.ts          #   manifest schema (mirrors the exporter) + ID_KEY
        attachments.ts    #   EntityAttachment rows + RegisterAttachment (load-time)
        Entity.ts         #   the runtime entity class
        Level.ts          #   runtime container: entities, update loop, debug view
        LevelLoader.ts    #   load-pipeline orchestrator (sequences the stages)
        loader/           #   the stages: manifest · nodeResolution · entityBuilder
                          #   · sceneSettings · context
      scripting/        # the behavior system
        Behavior.ts       #   scriptable behavior base class
        exposed.ts        #   @exposed decorator + value application
        BehaviorRegistry.ts  #  maps SCRIPT names -> Behavior classes
      input/            # Unity-style input system
        InputManager.ts   #   devices + the project-wide action asset
        InputAction.ts InputActionMap.ts InputActionAsset.ts
        InputBinding.ts Devices.ts DefaultAsset.ts
        inputMap.ts       #   @inputMap decorator (action-map injection)
      subsystems/       # one module per manifest concern the glb can't express
        physics.ts lights.ts clusteredLights.ts cameras/ shadows.ts constraints.ts
        audio.ts particles.ts triggers.ts environment.ts fog.ts
        postprocess.ts animation.ts
      ui/               # user interfaces (2D GUI Editor layouts + 3D GUI)
        gui2d.ts          #   GUI component: GUI Editor JSON -> AdvancedDynamicTexture
        gui3d/            #   GUI3D_* components: builder · panels · controls · events
apps/
  playground/         # the dev/test app (Vite). New games: npm run create
    index.html          # entry -> src/main.ts
    src/
      main.ts             # app bootstrap (engine + your scene wiring)
      behaviors/          # YOUR scripts, one behavior per file (Rotator, LookAt…)

Docs:
  docs/index.html               # searchable landing — open after npm run docs:build
  docs/BUILDING-DOCS.html       # contributor guide (edit scripts/docs/prose/content/meta/BUILDING-DOCS.html)
  docs/STYLE_GUIDE.md           # C#-style coding conventions for engine + behaviors
  docs/LLM_SCRIPTING_CONTEXT.md # short context for an LLM generating a behavior file
  docs/engine/00-INDEX.html     # full linked engine documentation + interactive diagrams
```


---

# Engine reference (runtime internals)

*This section is for working on the engine itself or understanding load-time behavior. To just write a behavior script, see `docs/LLM_SCRIPTING_CONTEXT.md`; for coding conventions, `docs/STYLE_GUIDE.md`.*

### The load pipeline


`LevelLoader.Load(manifestUrl)` is the orchestrator; stages live in
`core/loader/`. It runs these steps in order:

1. **Fetch + validate the manifest.** Clear errors if the file 404s or the dev
   server returned `index.html` (HTML instead of JSON) — the two most common
   "it doesn't load" mistakes.
2. **Load input** — `InputManager.LoadAsset` with `scene.inputActions` and
   `scene.defaultInputMap` so `@inputMap` fields and `behavior.input` can be
   injected before behaviors are built.
3. **Append the glb** with `appendSceneAsync(base + manifest.glb, scene)`. The glb
   path is resolved relative to the manifest. This creates all meshes, transform
   nodes, materials, lights, and cameras in the scene. (Babylon 9 note: the old
   `SceneLoader.AppendAsync` statics are deprecated — use `appendSceneAsync`.)
   **The scene is switched to `useRightHandedSystem = true` immediately before this**
   so the glb imports without the handedness-flipping `__root__` mirror — see *Subsystem: physics* below.
4. **Build the GUID index** (`loader/nodeResolution.ts` → `BuildIdIndex`): walk
   every transform node and mesh, read `node.metadata.gltf.extras.bjs_id`, and
   map GUID -> node. Requires the `ExtrasAsMetadata` glTF loader extension
   (imported at the top of `core/LevelLoader.ts`); without it `node.metadata`
   stays empty and GUID matching silently fails.
5. **Iterate the manifest entities** (`loader/entityBuilder.ts` → `ProcessEntity`
   per entity). For each one:
   - Resolve its glb node: **GUID first**, then a name-match fallback.
   - Create an `Entity(id, name, node)` and register it in `level.entities`.
   - Stash a back-reference: `node.metadata.bjsEntity = entity`.
   - **Apply components** (`ApplyComponents`, see section 5) — materializes each
     component into the world and records a row on `entity.attachments` via
     `RegisterAttachment` (TAG/COLLIDER/RIGIDBODY/SCRIPT during this pass; AUDIO,
     GUI, PARTICLE after async settle; CONSTRAINT and GUI3D_* in FinalizeLevel).
     May return deferred object references (`PendingRef[]`).
   - If the entity has `light`, call `ApplyBlenderLight` (`ProcessLightForEntity`);
     if it casts shadows, remember it for step 6.
   - If the entity has `camera`, call `ApplyBlenderCamera` (`ProcessCameraForEntity`);
     if it's the active one, set `scene.activeCamera` and `level.activeCamera`.
6. **Resolve object references (second pass)** via `ResolveObjectReferences`.
   Entity-typed `@exposed` fields were stored as GUIDs because the target may not
   have existed yet during step 4. Now that every entity exists, each `PendingRef`
   is resolved to its `Entity` (scalar fields assigned directly; entity-list fields
   assigned into their array slot by `index`). Camera targets (FOLLOW/ARC/offset)
   are resolved in this same post-pass via `ResolveCameraTargets` (in `subsystems/cameras/targets.ts`).
7. **Finalize** — shadows, scene look, animations, audio settle, triggers,
   constraints, then **`level.Begin()`** (`OnStart`, then `RunFrame` each frame:
   `InputManager.Process` → behaviors → `InputManager.EndFrame`).

`EnableHavokPhysics(scene)` **must be called before `Load`** (the example
`main.ts` does this), because colliders/bodies are built during step 5.

### Runtime API


#### Entity (`core/Entity.ts`)

```ts
class Entity
{
  readonly id: string;          // Blender GUID
  readonly name: string;        // Blender object name
  readonly node: TransformNode; // the Babylon node from the glb
  tag = "Untagged";             // from a TAG component
  attachments: EntityAttachment[]; // live registry of applied components
  behaviors: Behavior[];
  body?: PhysicsBody;           // present if it has a Collider/RigidBody
  sounds: StaticSound[];                  // from AUDIO components
  guiTextures: AdvancedDynamicTexture[];  // from GUI components
  particleSystems: IParticleSystem[];     // from PARTICLE components
  controls3D: Control3D[];                // from GUI3D_* components
  GetAttachments(): readonly EntityAttachment[];
  GetAttachment<T extends ComponentType>(type: T): AttachmentOfType<T> | undefined;
  GetAttachmentsOfType<T extends ComponentType>(type: T): AttachmentOfType<T>[];
  HasAttachment(type: ComponentType): boolean;
  GetBehavior<T extends Behavior>(behaviorConstructor: new () => T): T | undefined;
  GetAnimation(clipName: string): AnimationGroup | undefined;
  GetSound(soundName: string): StaticSound | undefined;
  GetGui(guiName: string): AdvancedDynamicTexture | undefined;
  GetParticles(systemName: string): IParticleSystem | undefined;
  GetControl3D(controlName: string): Control3D | undefined;
  SendMessage(message, source): void;
}
```

Each successfully applied component becomes one `EntityAttachment` row on
`entity.attachments` (types in `core/attachments.ts`). Query components with
`GetAttachment` / `GetAttachmentsOfType` / `HasAttachment` — each row pairs manifest
`data` with its runtime object (`behavior`, `body`, `sound`, …). There is no
`entity.manifest` or `GetComponent`; convenience fields (`behaviors`, `body`,
`sounds`, …) mirror attachments for now. Use `GetBehavior(MyClass)` when you know
the behavior class; use `GetAttachment("SCRIPT")` for the component row.

#### Level (`core/Level.ts`)

```ts
class Level
{
  entities: Map<string, Entity>;     // keyed by GUID (or name for un-GUID'd v1 data)
  activeCamera?: Camera;             // the Blender scene's active camera, if exported
  shadowGenerators: ShadowGenerator[];
  post?: PostProcessingHandles;      // pipelines, if the manifest enabled them
  ById(id: string): Entity | undefined;
  ByTag(tag: string): Entity[];
  ShowColliders(show?: boolean): void; // toggle Havok PhysicsViewer wireframes
  AddUpdater(updater: (deltaSeconds: number) => void): void; // per-frame callback
  Begin(): void;                     // loader-internal: starts the update loop
  Dispose(): void;                   // stops the update loop, calls OnDestroy()
}
```

> Note: fields/properties (`entities`, `activeCamera`, …) stay **camelCase** —
> they're treated as variables. Only methods are PascalCase. See docs/STYLE_GUIDE.md.

Three ways to reach another object from a behavior: an `@exposed({type:"entity"})`
reference (cleanest), `node.metadata.bjsEntity` if you have a node, or `level.ById`
/ `level.ByTag` if you hold the `Level`.

#### Behavior (`scripting/Behavior.ts`)

```ts
abstract class Behavior
{
  entity!: Entity;                      // injected before OnStart
  scene!: Scene;
  get node(): TransformNode;            // === entity.node (property, stays camelCase)
  OnStart(): void;                      // once, after the whole level + refs are ready
  OnUpdate(deltaSeconds: number): void; // every frame; deltaSeconds is SECONDS
  OnDestroy(): void;                    // on level dispose
}
```

### Subsystem: physics (`subsystems/physics.ts`)


`EnableHavokPhysics(scene)` lives here and **must be called before `Load`** (the
example `main.ts` does), because bodies are built during the entity loop.

`BuildPhysics(node, collider?, body?, scene)` merges a COLLIDER and/or RIGIDBODY
into one Havok V2 `PhysicsBody`:

- **collider only** -> static (or trigger) body
- **rigidbody only** -> dynamic body with an auto-fit box collider
- **both** -> shape from the collider, dynamics from the rigidbody

**Single, node-attached path.** The body is created directly on the entity node.
This is sound because the level is imported **right-handed** (see below), so the
node's world matrix has no handedness mirror and Havok decomposes it cleanly for
both position and orientation. Mass applies only to DYNAMIC bodies; KINEMATIC maps
to Havok's `ANIMATED` motion type. Reach it at `entity.body` — e.g.
`entity.body?.applyImpulse(...)`.

Shape construction by case:

- **Auto-fit primitive** (the default). If the node is a real mesh, a
  `PhysicsAggregate` sizes the shape from the mesh bounds. If the node is a
  multi-material **TransformNode wrapper** (one child mesh per material — see the
  note below), `PhysicsAggregate` can't size a primitive from a non-mesh node, so
  `FitColliderShape` fits a box/sphere/capsule/cylinder to the hierarchy bounding
  box in node-local space and attaches a `PhysicsBody`.
- **CONVEX / MESH** (always geometry-derived; manual size/center ignored).
  `BuildHullOrMeshShape` builds a real `PhysicsShapeConvexHull` / `PhysicsShapeMesh`:
  a single mesh feeds its own geometry; a wrapper has its per-material children
  cloned, baked into the node frame, and merged into one temporary mesh. Falls back
  to a fitted box if the hull/mesh can't be built. (MESH shapes can't be DYNAMIC —
  a Havok limitation; use CONVEX for moving bodies.)
- **Explicit/manual primitive.** A `PhysicsShapeBox/Sphere/Capsule/Cylinder` from
  hand-authored, Babylon-space (Y-up) `center`/`size`/`radius`/`height`/`rotation`.

**Why right-handed import.** In Babylon's default left-handed path the glTF loader
parents everything under a `__root__` node carrying a reflection (negative-
determinant) transform to flip handedness. Havok places bodies by decomposing a
node's world matrix, and a reflection is indistinguishable from a 180-deg rotation
once decomposed, so colliders came out mis-oriented (and dynamic bodies visibly
mirrored). `LevelLoader` sets `scene.useRightHandedSystem = true` *before* the
append so the loader skips that mirror entirely. `NeutralizeGltfRoot()` is now just
a guard that warns if a negative-determinant `__root__` ever reappears.

### Manifest schema (reference)

`environment` uses either `file` (exported World texture under `env/`) or
`useDefault: true` (built-in studio IBL). `createSkybox` toggles the visible
background (`true` = show skybox, `false` = IBL only).

```json
{
  "version": 4,
  "glb": "level.glb",
  "scene": {
    "clearColor": [0,0,0,1], "ambientColor": [0,0,0],
    "environment": { "file": "env/sky.env", "intensity": 1, "rotationY": 0, "createSkybox": true },
    "fog": { "mode": "EXP2", "color": [0.5,0.6,0.7], "density": 0.01, "start": 10, "end": 100 },
    "postProcessing": { "defaultPipeline": true, "fxaa": true,
      "bloom": { "enabled": false, "threshold": 0.9, "intensity": 0.5 },
      "ssao": false, "toneMapping": true, "exposure": 1, "contrast": 1 },
    "inputActions": { "maps": [{ "name": "Player", "actions": [ "..."] }] },
    "defaultInputMap": "Player"
  },
  "entities": [
    {
      "id": "guid-hex",
      "name": "Cube",
      "parent": "guid-or-null",
      "components": [
        { "type": "TAG", "tag": "Player" },
        { "type": "COLLIDER", "shape": "BOX", "isTrigger": false, "autoFit": true,
          "size": [1,1,1], "radius": 0.5, "height": 2, "center": [0,0,0],
          "rotation": [0,0,0,1],
          "events": [ { "target": "guid", "message": "open", "filterTag": "Player" } ] },
        { "type": "RIGIDBODY", "bodyType": "DYNAMIC", "mass": 1, "friction": 0.5,
          "restitution": 0.2, "linearDamping": 0, "angularDamping": 0 },
        { "type": "SCRIPT", "script": "Spinner", "path": "...",
          "vars": { "speed": 120, "axis": [0,1,0] } },
        { "type": "AUDIO", "file": "audio/door.mp3", "volume": 1, "loop": false,
          "autoPlay": false, "spatial": true, "maxDistance": 50, "playbackRate": 1 },
        { "type": "GUI", "file": "gui/hud.json", "mode": "FULLSCREEN",
          "foreground": true, "width": 1024, "height": 1024 },
        { "type": "PARTICLE", "file": "particles/fire.json", "gpu": false,
          "autoStart": true, "attachToEntity": true, "capacity": 0 },
        { "type": "MSDF_TEXT", "text": "Hello", "fontJson": "fonts/roboto-regular.json",
          "fontTexture": "fonts/roboto-regular.png", "color": [1,1,1,1], "thickness": 0,
          "billboard": true, "billboardScreenProjected": false, "ignoreDepth": false,
          "strokeColor": [0,0,0,0], "strokeInset": 0, "strokeOutset": 0,
          "textAlign": "center", "maxWidth": 0, "lineHeight": 1, "letterSpacing": 1 },
        { "type": "GUI3D_HOLO", "text": "Open", "image": null, "tooltip": "",
          "events": [ { "target": "guid", "message": "open" } ] },
        { "type": "GUI3D_CYLINDER", "margin": 0.02, "columns": 3, "rows": 0,
          "radius": 5.0 },
        { "type": "CONSTRAINT", "constraintType": "HINGE", "target": "guid",
          "pivot": [0,0,0], "axis": [0,1,0], "collision": false,
          "useLimits": true, "min": -90, "max": 90, "stiffness": 100, "damping": 10,
          "motor": false, "motorSpeed": 90, "motorMaxForce": 100 },
        { "type": "CONSTRAINT", "constraintType": "CUSTOM", "target": "guid",
          "pivot": [0,0,0], "axis": [1,0,0], "collision": false,
          "axes": [
            { "axis": "ANGULAR_X", "mode": "free" },
            { "axis": "LINEAR_Y", "mode": "spring", "min": -0.15, "max": 0.15,
              "stiffness": 80, "damping": 10 },
            { "axis": "LINEAR_X", "mode": "locked" },
            { "axis": "LINEAR_Z", "mode": "locked" },
            { "axis": "ANGULAR_Y", "mode": "locked" },
            { "axis": "ANGULAR_Z", "mode": "locked" }
          ] },
        { "type": "CAMERA", "cameraType": "GEOSPATIAL", "attachControl": true,
          "planetRadius": 1.0, "lowerRadius": 0.01, "upperRadius": 0,
          "checkCollisions": false, "orbitSpeed": 1.0, "zoomSpeed": 1.0, "panSpeed": 1.0 },
        { "type": "CAMERA", "cameraType": "ARC", "attachControl": true,
          "keys": { "scheme": "ARROWS", "up": "W", "down": "S", "left": "A", "right": "D" },
          "useBlenderTransform": true, "followMode": "OFFSET", "lockRoll": false,
          "speed": 1.0, "inertia": 0.9, "radius": 10, "lowerRadius": 0, "upperRadius": 0,
          "target": null, "trackTarget": false, "orbitSpeed": 1.0, "zoomSpeed": 1.0, "panSpeed": 1.0,
          "distance": 10, "height": 4, "rotationOffset": 0 }
      ],
      "light":  { "type": "SUN", "color": [1,1,1], "energy": 1, "sunAngle": 0.00918,
                  "castShadows": true,
                  "shadow": { "filter": "PCSS", "mapSize": 0, "bias": 0.00005,
                              "normalBias": 0, "darkness": 0, "minZ": 0, "maxZ": 0 } },
      "camera": { "type": "PERSP", "clipStart": 0.1, "clipEnd": 1000,
                  "fov": 0.69, "active": true },
      "animation": { "autoPlay": true, "clip": "Walk", "loop": true,
                     "speed": 1, "clips": ["Walk", "Idle"] }
    }
  ]
}
```

`light` and `camera` are present only on lamp/camera objects and are *auto-derived*
(not components). `vars` for an `entity`-typed field holds the target's GUID.

### Gotchas


- **`deltaSeconds` is seconds.** Scale all motion by it for frame-rate independence.
- **Keyboard/pointer input needs canvas focus** — the user must click the viewport
  once. Prefer `scene.onKeyboardObservable` / `onPointerObservable` over global
  listeners, and remove them in `OnDestroy`.
- **References resolve before `OnStart`**, but cross-entity `OnStart` order is
  unspecified — don't assume another entity is fully initialised; guard `null`
  references.
- **Physics is V2/Havok and must be enabled before load.** Mesh colliders can't be
  dynamic. **Constraints** pin the as-placed pose — position both bodies in Blender
  before export. A **Spring** preset locks all relative rotation (two bodies pitch
  together); use **Custom** or **Hinge** for trailer-style pitch. Don't parent a
  physics wheel under a physics chassis if both are joined by a constraint.
- **The Blender camera is fixed by default** (no controls). The fallback
  `ArcRotateCamera` uses arrow keys, leaving WASD free for behaviors; a manually
  attached `FreeCamera` would fight WASD.
- **Light intensity is approximate**; tune `SUN_SCALE`/`PUNCTUAL_SCALE` in
  `subsystems/lights.ts`. Color is exact.
- **Keep glb + manifest filenames matching** what `main.ts` fetches; they must sit
  together under `public/levels/`.

### Code conventions

Engine code and behaviors follow a C#-inspired TypeScript style (PascalCase methods, Allman braces, descriptive names, explicit null handling, with the `@exposed` and `@inputMap` decorators kept lowercase and Babylon `Nullable<T>` values using truthiness checks). Full rules live in **`docs/STYLE_GUIDE.md`**.
