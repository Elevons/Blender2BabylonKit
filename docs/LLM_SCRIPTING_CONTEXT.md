# Babylon Level Kit — Behavior Authoring Context

Context for an LLM **generating a behavior script** for this engine (runtime
**engine v0.31.1 · Blender add-on v0.32.0**). Each behavior is one self-contained `.ts` file the runtime loads
and runs per-frame. This file is the **behavior authoring contract** — you do
not need engine internals to write one.

**MCP:** use **bjs-mcp** — start with **`route_task(intent, className)`**, then
`preflight_behavior`, `get_recipe_template`, `get_physics_movement` (if moving),
`validate_behavior`. Reference: `docs/LLM_PLAYBOOK.md` (`get_playbook`).

**Human docs:** `docs/engine/00-INDEX.html` (choose your path) ·
`docs/engine/14-API-GUIDE.html` · `docs/engine/13-FEATURE-LIST.html` ·
`docs/engine/02-RUNTIME-BASICS.html` · `docs/engine/05-SCRIPTING.html` ·
`docs/STYLE_GUIDE.md`.

**Terminology:** a **component** is authored *data* on an entity (TAG, COLLIDER,
SCRIPT, …) serialized from Blender; a **behavior** is a runtime *script class*
(`extends Behavior`) instantiated from a `SCRIPT` component.

## Start here (LLM / MCP)

**Goal:** one file at `src/behaviors/ClassName.ts` where **class name === filename stem**.

### Fast path (recommended)

| Step | Tool | Why |
|------|------|-----|
| 1 | **`route_task(intent, className)`** | Picks playbook + numbered MCP steps — **start here** |
| 2 | `preflight_behavior(intent, className)` | Checkbox list before coding |
| 3 | `get_do_not_list` | Silent failures — skim once per session |
| 4 | `get_recipe_template(recipe, className)` | From route result — valid skeleton |
| 5 | `list_scene_entities` / `list_input_actions` | Real names — never guess |
| 6 | `get_physics_movement` | If the script moves anything with a body |
| 7 | `validate_behavior(source, ClassName.ts)` | Fix all errors; revalidate until clean |

### Deep path (manual)

| Step | Tool | Why |
|------|------|-----|
| 1 | `get_engine_basics(topic="components-vs-behaviors")` | First session only |
| 2 | `plan_behavior(intent, className)` | Recipes, sections, fragments |
| 3 | `get_playbook(name=…)` | Full Blender + MCP steps for one task |
| 4+ | Same as steps 4–7 above | |

Playbooks: `docs/LLM_PLAYBOOK.md` · `list_playbooks()` · `get_playbook(name=…)`.
Engine concepts: `get_engine_basics(topic=…)` → human chapters in `docs/engine/`.

`get_scripting_context(section="list")` returns section slugs. Common pulls:

| Section slug | Topic |
|--------------|-------|
| `lifecycle` | OnStart / OnUpdate / OnDestroy / OnMessage / collision & trigger hooks |
| `entity` | Entity API, attachments |
| `exposed` | `@exposed` types and Blender parse rules |
| `input` | Input Actions, `@inputMap` |
| `physics` | Bodies, triggers, constraints, movement |
| `cameras` | Camera component types, Geospatial |
| `scene-look` | Atmosphere, fog, post — **author in Blender** (runtime exceptions below) |
| `lights` | `FindLightForNode`, clustered punctual lights, IBL compensation |
| `visibility` | Eye icon, Make Invisible, shadow casters |
| `animation` | Clips, armature rule |
| `gui` | 2D GUI, particles, 3D GUI, MSDF text |
| `detail-maps` | Detail texture overrides on glTF PBR — **author in Blender** |

## Author in Blender vs write in behavior

| Need | Author in Blender | Write in behavior |
|------|-------------------|-------------------|
| Collider / rigid body / joint | COLLIDER, RIGIDBODY, CONSTRAINT components | Read `entity.body`, drive motors, override `OnCollision*` / `OnTrigger*` hooks |
| Camera type (orbit, globe) | CAMERA component on camera object | Rare: `flyToPointAsync` on GeospatialCamera only |
| Sky / atmosphere / bloom / SSAO | Babylon Scene panels | **Never** — loader owns these |
| Detail map on glTF PBR | **Properties › Material › Babylon › Detail Map** | **Never** — loader applies `detailMaps[]` |
| Input bindings | Input Actions panel | Poll `FindAction("Move")` by **name** |
| Tunable fields per object | `@exposed` on SCRIPT + **Sync** | Declare fields; runtime values applied before `OnStart` |
| Trigger → gameplay (data) | COLLIDER Event Messages → target entity | `OnMessage` on target behaviors |
| 2D HUD / particles / 3D buttons | GUI / PARTICLE / GUI3D_* components | `GetGui` / `GetParticles` / `GetControl3D` |
| MSDF labels | MSDF_TEXT component | `GetTextRenderer` — update paragraphs only |
| Light budget / clustering | **Babylon Scene › Export** (budget + master toggle); per lamp **Cluster When Over Budget** | Drive intensity with `FindLightForNode` only |

## File contract (every behavior)

- **One class per file**, `export default`, **class name === file name** (the
  filename stem is the Blender registry key: `behaviors/Patrol.ts` → `"Patrol"`).
- Lives in `src/behaviors/`.
- Import the engine package: `from "@bjs/engine"` (the workspace package).
- Import Babylon types from `@babylonjs/core`.
- `main.ts` auto-registers every file in `behaviors/` **by filename stem** via
  `import.meta.glob` + `BehaviorRegistry` — exactly the key Blender's "Open
  Script…" picker stores.
- After changing `@exposed` fields in code, press **Sync** on the Script
  component in Blender so the inspector picks up new fields.

```ts
import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

export default class MyBehavior extends Behavior
{
  // @exposed fields + lifecycle methods go here
}
```

## Lifecycle methods (override only what you need)

```ts
OnStart(): void                       // once, after the level + all @exposed refs are resolved
OnUpdate(deltaSeconds: number): void  // every frame; deltaSeconds = seconds since last frame
OnDestroy(): void                     // on level dispose — unsubscribe observers, dispose constraints
OnMessage(message: string, source: Entity): void  // Event Message, 3D GUI click, or SendMessage

// Unity-style physics hooks (opt-in — override only what you need)
OnCollisionEnter(other: Entity, contact: CollisionContact): void
OnCollisionStay(other: Entity, contact: CollisionContact): void   // Havok CONTINUED; stops when bodies sleep
OnCollisionExit(other: Entity): void
OnTriggerEnter(other: Entity): void
OnTriggerExit(other: Entity): void   // no OnTriggerStay — track overlap state in code if needed
```

- Names are **PascalCase** (`OnStart`, not `onStart`) — a lowercase name silently
  never runs.
- `@exposed` values and entity references are applied **before** `OnStart`.
- Scale continuous motion by `deltaSeconds`. (Setting a Babylon *velocity* is
  already per-second — don't multiply those by `deltaSeconds`.)
- Cross-entity `OnStart` order is unspecified; guard references for `null`.
- Input is processed **before** `OnUpdate` each frame; `WasPressedThisFrame` /
  `WasReleasedThisFrame` edges last one full frame (`InputManager.EndFrame` runs
  after all behaviors).

## Members available on `this`

```ts
this.entity : Entity          // the entity this behavior is attached to
this.scene  : Scene           // the Babylon scene
this.node   : TransformNode   // shortcut === this.entity.node
this.input? : InputActionMap  // scene default map — injected when you have no @inputMap fields
```

Behaviors do **not** receive a `Level` handle. Look up other objects via
`@exposed({ type: "entity" })` fields (preferred), `entity.GetAttachment("SCRIPT")`
/ `entity.GetBehavior` on the same entity, or `node.metadata.bjsEntity` from a
Babylon node.

**Runtime component add/remove** is app-code only: `level.componentHost.AddComponent`
/ `RemoveComponent` after load (mutations are not written back to the manifest).
Behaviors cannot call `componentHost` — orchestrate from your app layer or use
messages.

## Entity API

Types for attachments live in `core/attachments.ts` (`EntityAttachment`,
`ComponentType`, `AttachmentOfType<T>` — exported from `@bjs/engine`).

```ts
entity.id: string                 // Blender GUID (readonly)
entity.name: string               // Blender object name (readonly)
entity.node: TransformNode        // its Babylon node (readonly)
entity.tag: string                // from a TAG component ("Untagged" default)
entity.attachments: EntityAttachment[]  // live registry — one row per applied component
entity.body?: PhysicsBody         // Havok V2 body — present iff a COLLIDER/RIGIDBODY was authored
entity.animations: AnimationGroup[]               // glTF clips targeting this entity
entity.sounds: StaticSound[]                      // sounds from AUDIO components (audio engine v2)
entity.guiTextures: AdvancedDynamicTexture[]      // from GUI components (@babylonjs/gui)
entity.particleSystems: IParticleSystem[]         // from PARTICLE components
entity.controls3D: Control3D[]                    // from GUI3D_* components (buttons + panels)
entity.textRenderers: TextRenderer[]              // from MSDF_TEXT components
entity.reflectionProbes: ReflectionProbe[]        // from REFLECTION_PROBE components
entity.GetAttachments(): readonly EntityAttachment[]
entity.GetAttachment(type): AttachmentOfType | undefined   // first row of that type
entity.GetAttachmentsOfType(type): AttachmentOfType[]      // every row of that type
entity.HasAttachment(type): boolean
entity.GetBehavior<T>(Ctor): T | undefined        // another behavior on the same entity (by class)
entity.GetAnimation(name): AnimationGroup | undefined  // exact match, then contains
entity.GetSound(name): StaticSound | undefined         // exact match, then contains
entity.GetGui(name): AdvancedDynamicTexture | undefined      // exact match, then contains
entity.GetParticles(name): IParticleSystem | undefined       // exact match, then contains
entity.GetControl3D(name): Control3D | undefined             // exact match, then contains
entity.GetTextRenderer(fontStem): TextRenderer | undefined   // MSDF font JSON file stem
entity.GetReflectionProbe(): ReflectionProbe | undefined     // first REFLECTION_PROBE attachment
entity.GetReflectionProbes(): ReflectionProbe[]              // every REFLECTION_PROBE attachment
entity.SendMessage(message, source): void              // deliver to all its behaviors' OnMessage
```

`entity.node.isVisible` mirrors Blender's **viewport** visibility (eye icon): objects
hidden in the viewport export with `bjs_visible: false` in glTF extras and load with
`isVisible = false` (child lights/cameras are disabled too). A COLLIDER component's
**Make Invisible** does the same at runtime (`makeInvisible: true` in the manifest →
`HideEntityNode` during `ApplyComponents`) while leaving the object visible in Blender
for authoring. Toggle at runtime with
`entity.node.isVisible = true` (if the object is a lamp, also
`this.scene.getLightByName(this.entity.name)?.setEnabled(true)`). **Ray Visibility → Shadow**
(`visible_shadow`) controls **shadow casting** only: when off, export stamps
`bjs_cast_shadows: 0` and the mesh still renders and **receives** shadows but is omitted
from `ShadowGenerator` casters (useful for huge ground planes that would blow up the sun
frustum). **Render-disabled**
objects (camera icon / `hide_render`) are **not exported at all** — they won't exist in
the level.

### Component queries (`attachments`)

At load time each successfully applied **component** becomes one row on
`entity.attachments`. Each row pairs the authored manifest `data` with its
runtime object when one exists (`behavior`, `body`, `sound`, `texture`, …).
There is no frozen manifest copy on `Entity` — query attachments, not JSON.

```ts
import { type EntityAttachment, type AttachmentOfType } from "@bjs/engine";

// First SCRIPT row (typed) — same as entity.behaviors[0] when one script is authored
const script = entity.GetAttachment("SCRIPT");
const patrol = script?.behavior;

// Physics — COLLIDER and RIGIDBODY are separate rows when both are authored (same body ref)
const collider = entity.GetAttachment("COLLIDER");  // { type, data, body }
if (entity.HasAttachment("RIGIDBODY")) { /* … */ }

// Every AUDIO component (entities can have more than one)
for (const row of entity.GetAttachmentsOfType("AUDIO"))
{
  row.sound.setVolume(0.5);
}
```

| `GetAttachment` type | Runtime field on the row |
|---|---|
| `"TAG"` | `data` only |
| `"RENDERING_GROUP"` | `data` only (mesh `renderingGroupId` set in `FinalizeLevel`) |
| `"LAYER_MASK"` | `data` only (mesh `layerMask` set in `FinalizeLevel`) |
| `"COLLISION_LAYER"` | `data` only (Havok filter masks set in `FinalizeLevel`) |
| `"COLLIDER"` / `"RIGIDBODY"` | `data` + `body` |
| `"SCRIPT"` | `data` + `behavior` |
| `"AUDIO"` | `data` + `sound` |
| `"GUI"` | `data` + `texture` |
| `"PARTICLE"` | `data` + `system` (+ `emptyEmitter` when the entity node is an empty) |
| `"CONSTRAINT"` | `data` + `constraint` |
| `"GUI3D_*"` | `data` + `control` |
| `"MSDF_TEXT"` | `data` + `renderer` |
| `"REFLECTION_PROBE"` | `data` + `probe` |

Use `GetBehavior(MyClass)` when you know the behavior **class**; use
`GetAttachment("SCRIPT")` when you care about the component row or manifest
`data`. Failed async loads (missing audio/GUI/particle file) produce no row.
Convenience arrays (`sounds`, `guiTextures`, …) stay in sync for now.

## `@exposed` — fields editable per-object in Blender

The decorator marks a field so Blender shows a widget for it and writes the edited
value into the manifest; the runtime applies it before `OnStart`. **The decorator
name is lowercase `@exposed` — never rename it** (Blender parses the literal token).

```ts
@exposed() speed = 90;                                       // number  -> float
@exposed({ min: 0, max: 720, step: 5, label: "Speed" }) s = 1; // hints are optional
@exposed() enabled = true;                                   // boolean -> checkbox
@exposed() title = "hi";                                     // string
@exposed() dir: [number, number, number] = [0, 1, 0];       // 3-array -> vector3
@exposed({ type: "vector2" }) range: [number, number] = [10, 100]; // XY fields
@exposed({ type: "color" }) tint = new Color3(1, 0, 0);     // color picker
@exposed({ type: "entity" }) target: Entity | null = null;  // object picker
@exposed({ type: "enum", options: ["idle","walk"] }) state = "idle"; // dropdown -> string
@exposed({ type: "list", of: "float" }) speeds = [1, 2];    // add/remove list
@exposed({ type: "list", of: "entity" }) targets: (Entity | null)[] = []; // entity list
```

Options object: `{ min?, max?, step?, label?, type?, options?, of? }`.
`type` ∈ `float | int | bool | string | vector2 | vector3 | color | entity | enum | list`.
`of` (list element type) ∈ `float | int | string | bool | vector3 | color | entity`.

**Authoring rules that affect codegen:**
- Default must be a **single-line literal** (`= 45` / `= true` / `= "x"` /
  `= [0,1,0]` / `= null` / `= []`). Computed or multi-line defaults are NOT parsed
  by Blender (the field keeps its code default at runtime).
- Entity references need the explicit `type: "entity"` hint and an `Entity | null`
  field type. Entity lists use `(Entity | null)[]` and **start empty** — the level
  author fills them in Blender (type a count, or pin the inspector and use *Add
  Selected* to add every selected object at once).
- `vector3`/`color` values arrive as Babylon `Vector3`/`Color3` at runtime (coerced
  from arrays); plain arrays stay arrays.

## Visibility

Blender has three ways to control what ships visible at runtime:

| Blender toggle | Property | Export / runtime |
|---|---|---|
| **Eye** (viewport) | `hide_viewport` | Exported; loads with `entity.node.isVisible = false` |
| **Collider › Make Invisible** | `collider_make_invisible` | Exported; mesh loads invisible when any enabled collider has `makeInvisible: true` (physics unchanged) |
| **Ray Visibility → Shadow** | `visible_shadow` | Exported; visible and receives shadows; does **not** cast when off (`bjs_cast_shadows: 0`) |
| **Camera** (render) | `hide_render` | Omitted from the `.glb` and manifest entirely |

Viewport-hidden objects still exist as entities (physics, scripts, references resolve).
Export writes `"visible": false` on manifest entities (check `.scene.json`) and
`bjs_visible: 0` in glTF extras (collection / hierarchy visibility via
`visible_get()`, not just the per-object eye flag). Use the eye icon for props you want in the level but off until a behavior reveals them.
Use **Collider › Make Invisible** when you want the mesh visible while editing in Blender
but collision-only at runtime (invisible triggers, hidden blocking volumes).
Use render-disable for editor-only helpers (rigs, guides, blocking meshes) that should
never ship.

```ts
// Reveal on trigger enter (sender is the trigger entity)
OnMessage(message: string, _source: Entity): void
{
  if (message === "reveal")
  {
    this.node.isVisible = true;
  }
}
```

## Reaching other objects

Prefer an `@exposed({ type: "entity" })` field (the author picks the target in
Blender; it resolves to an `Entity` before `OnStart`). On the same entity, use
`entity.GetBehavior(OtherBehavior)` or `entity.GetAttachment("SCRIPT")?.behavior`.
If you only have a node:
`node.metadata.bjsEntity` is the back-reference to its `Entity`. For tag-based
grouping, author a TAG component and read `entity.tag` (or filter in your own
`@exposed` entity list).

## Cameras

Cameras are **not** behaviors. By default the Blender scene camera exports as a
faithful `FreeCamera` with no controls — you see exactly what Blender framed.

To change the camera type, add a **Camera** component on the camera object in
Blender (not a SCRIPT behavior). The loader builds the requested type from the
exported pose:

| `cameraType` | Use when |
|---|---|
| `FREE` / `UNIVERSAL` | Free-fly inspection; `speed` / `inertia`; optional key scheme + **Keep Upright** |
| `ARC` | Orbit a target (or a point ahead of the exported view); **Track Target** moves the pivot each frame; `orbitSpeed` / `zoomSpeed` / `panSpeed` (1 = Babylon default) |
| `FOLLOW` | Track a target — fixed world offset or Babylon FollowCamera orbit |
| `GEOSPATIAL` | **Globe / planet** at world origin — map-like pan, zoom-to-cursor, tilt; `orbitSpeed` / `zoomSpeed` / `panSpeed` |

**ArcRotate** (`ARC`): pick an **Orbit Target** object (or leave unset to pivot ahead of
the exported view). Enable **Track Target** when the pivot should follow a moving
entity each frame (`trackTarget` in the manifest). When **Attach Controls** is on,
**Orbit Speed**, **Zoom Speed**, and **Pan Speed** are multipliers (`1.0` = Babylon's
default feel; higher = faster). Exported as `orbitSpeed`, `zoomSpeed`, `panSpeed`.

**Geospatial** (`GEOSPATIAL`): the planet mesh must be centered at world origin;
set **Planet Radius** to match the mesh radius in scene units. Optional min/max
zoom and collision checking. The same **Orbit/Zoom/Pan Speed** fields apply when
controls are attached (pointer, wheel, keyboard — built into Babylon's
`GeospatialCamera`). Do **not** write a behavior to recreate globe navigation —
author the Camera component instead.

Behaviors that need to **drive** an authored Geospatial camera (e.g. fly to a
marker on click) use `this.scene.activeCamera` after load:

```ts
import { GeospatialCamera } from "@babylonjs/core/Cameras/geospatialCamera";
import { Vector3 } from "@babylonjs/core";

const camera = this.scene.activeCamera;
if (camera instanceof GeospatialCamera)
{
  const destination = marker.node.getAbsolutePosition();
  await camera.flyToPointAsync(destination, 0.5, 1500);
}
```

`flyToAsync(yaw?, pitch?, radius?, center?, durationMs?)` animates all four
properties; any argument can be `undefined` to keep the current value.
`updateFlyToDestination` redirects an in-flight animation. Fine-grained movement
tuning beyond the exported speed multipliers (`movement.panInertia`, etc.) is on
the runtime camera object via the Babylon API after load.

For a **script-built** orbit around a moving entity (not a globe), see the
`camera-follow` recipe — it creates a `UniversalCamera` and sets
`scene.activeCamera`. Only one active camera per scene.

Post-processing (bloom, SSAO, etc.) attaches to
`scene.activeCamera` **after** all `OnStart` hooks run. If your behavior creates
or swaps the active camera in `OnStart`, the exported stack is already on
whichever camera is active at that moment — you do not get a `Level` handle to
call `RetargetPostProcessing` from behaviors. Prefer authoring cameras and
post-processing in Blender when possible.

## Scene look & post-processing

Scene-wide rendering (environment, fog, atmosphere, post-processing) is **not** a behavior
concern — it is authored under **Babylon Scene** and exported in
`manifest.scene`. Behaviors do not receive `level.post`, `level.atmosphere`, or a `Level` handle.

| Effect | Author in Blender | Behavior role |
|---|---|---|
| Environment / IBL | Environment (Default Environment, Intensity, Rotation Y, Show Skybox) | None — IBL only when Atmosphere replaces the skybox |
| **Atmosphere** (physical sky) | Atmosphere (SUN lamp + scattering) | None — time of day follows the sun lamp direction |
| **Sun shadow penumbra** | Sun lamp **Angle** (0–45° → PCSS softness; clamped above) | None — `level.shadowGenerators` is app-level, not available in behaviors |
| Fog | Babylon Scene › Fog | Rare — zone behaviors (e.g. `FogChanger`) swap presets at runtime |
| Default pipeline (bloom, DOF, …) | Post-Processing › Default Pipeline | None |
| SSAO | Post-Processing › SSAO | None |

**Runtime fog (exception):** behaviors like `FogChanger` may drive `scene.fogEnabled`,
`scene.fogMode`, `scene.fogColor`, and `scene.fogStart` / `scene.fogEnd` from trigger
volumes. Patterns that work reliably:

- Put a **solid** (non-trigger) collider on the **moving probe** entity; trigger-on-trigger
  pairs often miss Havok enter/exit events.
- On `OnStart`, detect whether the probe is already inside the volume — don't assume
  fog A until the first trigger event.
- Poll probe position in `OnUpdate` when zones must stay in sync (same pattern as
  `FogChanger.ts`).
- Linear fog divides by `(fogEnd - fogStart)` — equal or inverted ranges break scene
  fog and water NME blocks that mirror the range; use a valid span or treat equal
  start/end as "no visible fog" with a far end (e.g. `[0, 1e9]`).
- NME water materials with **Fog Start** / **Fog End** input blocks need the same
  range pushed when scene fog changes (`FogChanger.SyncWaterFogOpacityRange`).

**Runtime IBL dimming (exception):** behaviors like `reducelight` may write
`scene.environmentTexture.level` from height or distance. Pair with `increaselights`
(or similar) to boost punctual lamp intensity when IBL drops — see **Runtime lights**
below.

**Atmosphere** (`@babylonjs/addons/atmosphere`) provides a physically based sky and
aerial perspective. Author under **Babylon Scene › Atmosphere**:
enable the panel, add or pick a **Sun Light** (Blender **Sun** lamp), tune
scattering if needed. Export writes `scene.atmosphere` (`sunLightId` GUID when
picked, `pbrSunIntensity`, `useLuts`, `multiScatteringIntensity`,
`minimumMultiScatteringIntensity`, `groundAlbedo`, `physical.*`). When atmosphere
is on, export forces `environment.createSkybox: false` — the addon renders the
sky; World/Default Environment IBL still loads for materials. Pair with
**Post-Processing › Default Pipeline** + tone mapping for HDR. Time of day =
aim the Sun lamp in Blender and re-export.

Do **not** import `Atmosphere` from `@babylonjs/addons/atmosphere` (or
`ApplyAtmosphere`) inside behaviors — the loader owns creation and disposal on
`level.atmosphere`. PBR integration is automatic; you do not wire sky shaders in
script code.

Do **not** instantiate `DefaultRenderingPipeline` (or other scene
post stacks) inside behaviors — that duplicates the loader, fights the exported
settings, and won't survive level reload. Use `list_scene_entities` to see
enabled **atmosphere** / **post-processing** and which entity is the sun lamp
when grounding `@exposed` picks.

Runtime detail: `docs/engine/07-RENDERING.html` (Atmosphere + post-processing).

**Environment skybox:** when `environment.createSkybox` is true, `ApplyEnvironment`
(in `FinalizeLevel`, after entities load) calls `ComputeSkyboxSize()` —
`max(1000, visible scene diagonal × 3)` — then `createDefaultSkybox` for
exported `.env` / `.hdr` / equirect World textures (built-in env uses
`EnvironmentHelper` + CDN DDS). IBL and skybox share the same texture;
`ApplyEnvironmentRotation` sets `texture.rotationY` (or a reflection matrix for
equirect PNG/JPG) on both — not a separate mesh rotation. Panorama files (`.hdr`,
equirect — not prefiltered `.env`) get `+π/2` baseline yaw in
`ResolveEnvironmentRotation` (Blender Z-up → Babylon Y-up). World Mapping Z is
exported as `-rotationY`. Skyboxes use `infiniteDistance` + `ignoreCameraMaxZ`;
`EnvironmentHelper` meshes are unparented without re-applying rotation. On
km-scale levels, camera **Clip End** in Blender often needs raising above the
default `1000`.

## Runtime lights and IBL

Lamps are authored in Blender (no component) and copied at load via
`ApplyBlenderLight`. To **drive lamp intensity at runtime**, resolve the Babylon
light from the lamp entity's node — do not iterate `scene.lights` alone.

```ts
import { Behavior, exposed, FindLightForNode } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

// FindLightForNode walks the light's parent chain (orientation-correction nodes)
// and falls back to name match. It also searches lights inside
// ClusteredLightContainer — required when the scene exceeds the punctual budget.
const light = FindLightForNode(this.scene, lampEntity.node);
if (light !== null)
{
  light.intensity = brightness;
}
```

**Clustered punctual lights:** when enabled light count exceeds the budget
(default **8**, set in **Babylon Scene › Export › Light Budget**), the loader
moves eligible **point/spot** lamps into a `ClusteredLightContainer` and
**removes them from `scene.lights`**. They remain the same `Light` instances —
`light.intensity` still updates the cluster each frame via `getScaledIntensity()`.
Use **`FindLightForNode`** (exported from `@bjs/engine`); raw `scene.lights` /
`getLightByName` lookups silently fail on large rigs.

**Authoring (Blender, not behavior code):**

- **Babylon Scene › Export › Light Budget** — max forward scene lights before
  clustering (default 8). Exported as `scene.lightBudget`.
- **Cluster Punctual Lights** — master toggle (`scene.clusterPunctualLights`).
  When off, the loader uses the UBO fallback instead of clustering.
- **Babylon Object › Light › Cluster When Over Budget** (point/spot only) —
  uncheck to keep a hero lamp in the forward shader even when over budget
  (`entities[].light.cluster: false`). Sun/directional lamps are never clustered
  (shadow maps stay forward).

Check load console for `[bjs] punctual lighting: clustered …` or read
`level.punctualLightingMode` from app code after load (behaviors don't get `Level`).

**IBL compensation pattern** (`increaselights` + `reducelight`): one behavior dims
`scene.environmentTexture.level` (e.g. with camera height above a water surface);
another maps that level from authored `sceneIntensityA` → `sceneIntensityB` onto
lamp brightness `brightnessX` → `brightnessY`. Align the A/B ranges with what the
dimming behavior actually writes (manifest environment intensity may differ from
runtime near/far values). Behaviors on different entities run in unspecified
order — one frame of lag is normal; both should read/write the same texture each
frame.

## Physics

`entity.body` is a Havok V2 `PhysicsBody`. Common calls:

```ts
entity.body?.applyImpulse(force, point);
entity.body?.setLinearVelocity(v);   entity.body?.getLinearVelocityToRef(out);
entity.body?.setAngularVelocity(v);  entity.body?.getAngularVelocityToRef(out);
entity.body?.setMotionType(PhysicsMotionType.ANIMATED); // imports from @babylonjs/core
```

### How to move something (decision tree)

Ask: does this entity have a **Rigid Body**, and who owns the transform?

| Situation | What to do |
|-----------|------------|
| No Rigid Body | Write `this.node.position` / rotation directly in `OnUpdate`. |
| **DYNAMIC** body | Never write `node.position` each frame — use velocity, impulse, or force. |
| **ANIMATED**, move once (teleport) | `setMotionType(ANIMATED)`, `disablePreStep = false`, write transform, **zero velocity after**. |
| **ANIMATED**, move every frame | `disablePreStep = false` in `OnStart`; drive `node.position` each frame **or** call `setTargetTransform` **every** frame (not once). |
| Switch DYNAMIC ↔ ANIMATED | Zero velocity on every switch; restore `disablePreStep` when going back to DYNAMIC. |

**MCP:** `get_physics_movement` returns copy-in patterns per mode (`no-body`, `dynamic`,
`animated-teleport`, `animated-continuous`, `toggle-dynamic-animated`).

**Classic bugs:** writing `node.position` on DYNAMIC (mesh jitters); forgetting
`disablePreStep = false` on ANIMATED (position logs but mesh does not move);
calling `setTargetTransform` once on kinematic (body drifts forever).

### Motion types (author on Rigid Body in Blender)

| `bodyType` | Role |
|---|---|
| `STATIC` | Never moves; still collides (terrain, walls). |
| `DYNAMIC` | Fully simulated — forces, collisions, mass. |
| `ANIMATED` | Driven by animation or code; pushes dynamic bodies and constraints but is not pushed by collisions. Use for elevators, moving platforms, or behaviors that set `node` transforms each frame. |

- To move/rotate a body by hand each frame, author **Animated** on the Rigid Body
  (or call `setMotionType(PhysicsMotionType.ANIMATED)` in `OnStart`), or drive it
  via velocity. Don't fight the solver by writing `node.position` on a
  DYNAMIC body (`disablePreStep` defaults to true, but sync still wins after the
  physics step).
- For dynamic props at rest on load, enable **Start Asleep** in Blender
  (`startAsleep` in the manifest). Treat it as a performance hint only — do
  not rely on a body staying asleep.
- **Center of mass** is authored on the Rigid Body component (Dynamic only):
  **Show Preview** (default) draws an amber cross in the Blender viewport when the
  object is selected (`viewport/cog_preview.py`; scales with mesh bounds, no depth
  test so it stays visible inside solid geometry). **Auto-Fit Center of Mass**
  (default) → manifest `centerOfMassAutoFit: true` (runtime uses owned-mesh bounds
  center); custom offset → `centerOfMassAutoFit: false` + `centerOfMass` in
  Babylon Y-up. CoM is independent of collider placement — shift it low on a car
  chassis for stable tipping without resizing the collider.
- MESH-shaped colliders can't be DYNAMIC (Havok limitation) — author CONVEX for
  moving bodies.
- **Make Invisible** on a Collider (`makeInvisible` in the manifest) hides the
  entity mesh at load via `HideEntityNode`; the Havok body is unchanged.
- **Multiple Collider components** on one entity combine into one compound body
  (`PhysicsShapeContainer`). `entity.body` is shared; `GetAttachment("COLLIDER")`
  returns the first row — use `entity.attachments.filter(a => a.type === "COLLIDER")`
  to inspect each authored shape. Prefer manual offsets per collider; auto-fit
  on each row fits the full mesh bounds.
- **Collision layers** (Unity-style): define named layers + a collision matrix in
  **Babylon Scene › Collision Layers** (`scene.collisionLayers` in the manifest).
  Assign one layer per object with the **Collision Layer** component (`COLLISION_LAYER`
  row). At load, `ApplyCollisionLayers` sets Havok `filterMembershipMask` /
  `filterCollideMask` on every physics shape. Propagation toggles mirror render
  layers (`applyOwnedColliders`, `applyChildEntities`). Entities without the
  component (and no inherited layer) keep Havok defaults — they collide with
  everything. Filtered pairs skip contacts and trigger events.
- **Joints are authored in Blender, not in behavior scripts.** There is no
  `@exposed` for constraints — add a **Constraint** component in the N-panel.
  The loader builds them in a post-pass and stores them on the `Level` object
  (`level.constraints` in app/load code; behaviors don't receive a `level` handle).

### Constraint types (author in Blender)

| Preset | What it does |
|--------|----------------|
| Fixed | Weld — no relative motion |
| Ball & Socket | Free rotation at the pivot |
| Hinge | One rotation axis (frame X); optional limits + motor |
| Slider | One slide axis (frame X); optional limits + motor |
| Spring | Sprung slide on frame X; **locks all relative rotation** |
| **Custom (6DoF)** | Six rows (Linear/Angular X/Y/Z): each **Free**, **Locked**, **Limited**, or **Spring** |

**Custom** is one `Physics6DoFConstraint` — use it when presets would fight. Example:
trailer hitch on the rear chassis → Target = front chassis, Axis = vehicle width (X),
pivot at hitch; **Angular X** = Free (relative pitch), **Linear Y** = Spring
(±0.15 m), everything else Locked. Do **not** stack Hinge + Spring on the same two
bodies (Spring welds rotation; you get both pitching the same way).

**Bodies Collide** (manifest `collision`, default off) controls whether the two
connected bodies generate contact impulses against each other — turn off when
colliders overlap at rest.

**Authoring pitfalls (mention in comments if the behavior drives a constrained rig):**
- Constrained bodies work best as **siblings**, not parented to each other.
- Don't overwrite `node.rotation` every frame on entities that have hinge-driven
  `PhysicsBody` wheels — visual spin should be visual-only meshes, or skip the
  override (see `CarController.ts`: arcade visuals vs physics wheels).
- Spring travel limits are **meters**; hinge limits are **degrees**.

Hand-built `Physics6DoFConstraint` in code is still possible — follow the
pivot/axis frame and limit patterns in `subsystems/constraints.ts` (its helpers
are internal, not exported from `@bjs/engine`).

### Event Messages and collision hooks

**Event Messages** (authored in Blender on any COLLIDER): each row has **When**
(`TRIGGER_ENTER` / `TRIGGER_EXIT` / `COLLISION_ENTER` / `COLLISION_EXIT`),
target GUID, message, optional **filter tag**. At runtime matching rows call
`target.SendMessage(message, source)` → `OnMessage` on the target. **MESH-shaped
triggers never fire** in Havok — use box/sphere/capsule/convex.

**Programmatic hooks** on the entity's own behaviors: `OnCollisionEnter` /
`OnCollisionStay` / `OnCollisionExit` (solid colliders) and `OnTriggerEnter` /
`OnTriggerExit` (trigger volumes). Both bodies in a contact receive collision
hooks. No manual subscription — override the hook and the engine wires Havok.
No `OnTriggerStay` (Havok has no continued trigger event).

**Zone behaviors (fog, lighting, messages):** the entity **entering** the trigger
should use a **solid** collider on a child probe (camera rig, train body, etc.).
A trigger probe overlapping a trigger volume often never fires enter/exit — add
position-based overlap checks in `OnStart` / `OnUpdate` when gameplay must stay
correct (see `FogChanger.ts`).

## Input

The input system clones Unity's Input System: an **InputActionAsset** of
**Action Maps** ("Player", "UI") containing **Actions** ("Jump", "Move") with
**Bindings** (keys, gamepad buttons/sticks/axes, and 1D-axis / 2D-vector
composites). Maps enable/disable as a unit. The scene's asset and **Scene
Default** map are authored in Blender's **Input Actions** panel and exported as
`scene.inputActions` + `scene.defaultInputMap` in the manifest. The canvas needs
focus (the user clicks the viewport once).

### Blender gamepad authoring

- **Labeled pickers** — face buttons, stick axes, and sticks use W3C standard-mapping names (not raw indices).
- **LT / RT** — bind as **Axis** → **LT / L2** (index 4) or **RT / R2** (index 5), not as face buttons. Use **Value** actions for analog throttle.
- **Control type matters** — for `ReadVector2()` set **Type = Value** and **Control Type = Vector 2**. **Button** control type flattens 2D bindings to a scalar; `ReadVector2()` then breaks (throttle/steer on wrong axes).
- **Choosing bindings:**
  - **2D move / drive + steer** → **Vector 2** action: keyboard **2D Vector** (WASD) + gamepad **Stick** (Left Stick). **Do not** rebuild a stick with a 2D Vector of four axis-half rows.
  - **1D throttle or brake only** → **Axis** action: **1D Axis** composite on stick Y with **+ Half** / **− Half**.
  - **One digital direction** → **Button** action: direct key or direct axis with half.
- **Composites** — **+ 1D Axis** (`positive − negative` scalar); **+ 2D Vector** (WASD keys). Default Move = 2D Vector + Left Stick binding.
- **Axis half** — on composite **axis** rows only (not Stick bindings): **+ Half** / **− Half** so one stick axis can mean forward vs back. Manifest: `"axisHalf": "POSITIVE"` | `"NEGATIVE"` (export uppercase; runtime accepts any case). Stick Y (indices 1, 3) flipped at runtime (`OrientGamepadAxis`) so **+ Half = stick up**.
- **Disambiguation** — multiple bindings on one action: **most-actuated whole binding wins** (not per-axis merge). Use one device at a time (full stick *or* full WASD).
- **Vehicle / `CarController`** — `@inputMap("Vehicle")`, action **Main Control** (Value, Vector 2): WASD 2D Vector + Left Stick; `throttle = control.y`, `steer = control.x`.
- **Capture** — record icon binds keyboard or gamepad (Linux js device; Xbox-style remap).

**Three ways to get a map handle** (all injected before `OnStart`):

```ts
import { Behavior, inputMap } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";

export default class MyBehavior extends Behavior
{
  // 1. Explicit map name:
  @inputMap("Player") player!: InputActionMap;

  // 2. Scene default (same map as Blender's "Scene Default" picker):
  // @inputMap() input!: InputActionMap;

  // 3. No @inputMap at all — use this.input (also the scene default)

  OnStart(): void
  {
    this.player.FindAction("Jump")?.performed.add(() => { /* ... */ });
  }

  OnUpdate(): void
  {
    const move = this.player.FindAction("Move")?.ReadVector2() ?? { x: 0, y: 0 };
    const sprinting = this.player.FindAction("Sprint")?.IsPressed() === true;
    const jumped = this.player.FindAction("Jump")?.WasPressedThisFrame() === true;
  }
}
```

`@inputMap` stays **lowercase** (Blender parses the literal token, like
`@exposed`). Actions have a type (`BUTTON` / `VALUE` / `PASSTHROUGH`) and a
control type (`BUTTON` / `AXIS` / `VECTOR2`). Polling: `ReadValue()` (scalar),
`ReadVector2()`, `IsPressed()`, `WasPressedThisFrame()`,
`WasReleasedThisFrame()`, `WasPerformedThisFrame()`. `InputManager.actions` is
the whole asset (`InputManager.FindAction("Player/Jump")` also works); maps can
be toggled with `map.Enable()` / `map.Disable()`.

If the panel is empty at export, the built-in "Player" map (Move/Look/Jump/
Interact/Sprint/Crouch) is serialized anyway; first export also seeds the panel
so you can edit it. Scripts should reference **action names**, never key codes.
If the app has a generated `src/InputActions.ts` (from `npm run input:gen`
reading `input.inputactions.json`), import its constants —
`import { PlayerActions } from "../InputActions"` then
`this.player.FindAction(PlayerActions.Jump)` — so typos fail at compile time.
If a behavior needs a NEW action, name it and note that it must be added in the
Input Actions panel (and constants regenerated). See `InputMover.ts`.

For input the asset doesn't cover (pointer events, custom keys), fall back to
scene observables — never global `window` listeners — and remove them in
`OnDestroy`:

```ts
this.observer = this.scene.onKeyboardObservable.add((keyboardInfo) => { /* ... */ });
// OnDestroy: this.scene.onKeyboardObservable.remove(this.observer);
```

## Animation

For rigged characters, the behavior must be attached to the **armature**
entity (components on a skinned mesh do nothing — glTF skinning ignores the
mesh node's transform, and clips target the joints under the armature).

Animation groups are scoped to an entity **by membership**: a clip belongs to an
entity if any targeted animation hits the entity's node or a descendant.

```ts
this.entity.GetAnimation("Walk")?.start(true);  // loop
for (const group of this.entity.animations) { group.stop(); }
```

## Audio & messaging

```ts
this.entity.GetSound("door")?.play();           // sound names = file stem ("audio/door.mp3" -> "door")
otherEntity.SendMessage("open", this.entity);   // their behaviors get OnMessage("open", source)
```

AUDIO components support volume, loop, spatial 3D (`spatial` + `maxDistance`),
and playback rate — spatial sounds follow `entity.node` automatically. Sounds with
Auto Play start after the browser's first user gesture (autoplay policy); calling
`.play()` from input handlers is always safe.

Event Messages and 3D GUI buttons can send messages on physics phases or click —
receive them by overriding `OnMessage`. Optional **filter tag** on Event Message
rows drops enterers whose `entity.tag` doesn't match.

## GUI & particles

GUI layouts and particle systems are authored in Blender as **GUI** / **Particles**
components pointing at a Babylon-editor `.json`. On the **Particles**
component, **Scan Textures** lists `ParticleTextureSourceBlock` slots from the
JSON (NME materials use **Scan NME** on **Properties › Material › Babylon**, which also lists inspector-visible shader parameters and gradient color stops); per-slot image picks
copy into `particles/` on export and patch texture URLs in the exported JSON.
The runtime resolves those paths beside the particle file (`rootUrl` in
`LoadParticleSystems`). Behaviors drive the already-built objects:

| GUI mode | Babylon API | Requirement |
|---|---|---|
| **FULLSCREEN** | `AdvancedDynamicTexture.CreateFullscreenUI` | Any entity node (typically an empty) |
| **MESH** | `AdvancedDynamicTexture.CreateForMesh` | Entity node must be a mesh |

```ts
this.entity.GetGui("hud")?.getControlByName("Score");   // names = file stem ("gui/hud.json" -> "hud")
this.entity.GetParticles("fire")?.start();              // or .stop(); also this.entity.particleSystems
```

Particle **autoStart** and **attachToEntity** are authored in Blender. With
**attachToEntity**, meshes use the mesh as the Babylon emitter; empties use an
owned world-space `Vector3` kept in sync each frame by
`WireParticleEmitterTracking` (`level.particleEmitterManager`). Already-spawned
particles stay in world space unless the particle file sets `isLocal: true`.
`AdvancedDynamicTexture` / GUI control types import from `@babylonjs/gui`;
`IParticleSystem` imports from `@babylonjs/core`.

### MSDF text (3D labels)

Authored as **MSDF_TEXT** on an entity (bmfont JSON + atlas PNG). The loader
creates a `TextRenderer` and draws after the main pass — behaviors **update**
copy, they do not create renderers.

```ts
import type { TextRenderer } from "@babylonjs/addons/msdfText";

const label = this.entity.GetTextRenderer("roboto-regular"); // font JSON file stem
if (label !== undefined)
{
  label.clearParagraphs();
  label.addParagraph(`Score: ${score}`, { textAlign: "center" });
}
```

**MCP:** `get_fragment(name="update-msdf-text")` · recipe `msdf-label-update`.

## Node materials (NME)

Custom shaders are authored per **Blender Material** on **Properties › Material › Babylon**
(not per object). Point at a `.json` from the
[Node Material Editor](https://nme.babylonjs.com); use **Scan NME** to list
`ImageSourceBlock` / `TextureBlock` slots, inspector-visible `InputBlock`
parameters (mark uniforms **Visible in Inspector** in NME), and inspector-visible
`GradientBlock` color stops (mark the gradient block **Visible in Inspector** in
NME). NME may embed image
bytes in the JSON (`texture.url` as `data:…;base64,…`, or `base64String`) — the
runtime loads these without external files. Use **Extract Textures…** to write
PNG/JPG beside the JSON and wire relative paths when you want smaller manifests or
Blender-side image picks. Assign image files for external texture slots; tune floats,
colors, vectors, and booleans in the **Parameters** box; edit gradient color stops in
**Gradients**. Export copies JSON + picked
images to `materials/` (each distinct NME source file is copied once per export;
several Blender materials can share one exported JSON and accumulate patches).
External texture overrides strip embedded `base64String` / `internalTextureLabel`
from the exported JSON and write manifest `textures[]`; embedded-only slots ship
unchanged in the JSON. Authored inputs and gradients also write manifest
`inputs[]` / `gradients[]`:

```json
"materials": [
  { "name": "Water", "file": "materials/water.json",
    "textures": [{ "blockId": 42, "blockName": "albedo", "file": "materials/albedo.png" }],
    "inputs": [{ "blockId": 21, "blockName": "fillColor", "type": "COLOR4", "value": [0.15, 0.4, 1, 0.35] }],
    "gradients": [{ "blockId": 22553, "blockName": "Gradient", "colorSteps": [
      { "step": 0, "color": { "r": 0, "g": 0, "b": 0 } },
      { "step": 1, "color": { "r": 1, "g": 1, "b": 1 } }
    ]}] }
]
```

At load, `ApplyNodeMaterials` runs after the glb import: parse NME JSON,
bind manifest `textures[]` / `inputs[]` / `gradients[]`, and replace `mesh.material` when the
glTF material **name** matches. **No shader compile yet** — `BuildNodeMaterials`
runs once in `FinalizeLevel`, immediately after `ApplySceneSettings` (so
`scene.environmentTexture` exists when the manifest declares environment IBL).
Parsed materials are cached per `file` + Blender material `name`. Embedded
textures load from `data:` / `base64String` in the JSON; manifest `textures[]`
always wins over embedded JSON when present; block ids resolve through
`editorData.map`. NME shaders need a `ReflectionBlock` on the PBR `reflection`
input for IBL (leave its texture empty to use scene IBL). No behavior API —
meshes using that material pick up the node shader automatically.

## Detail maps (glTF PBR)

Tile a **secondary detail texture** over standard glTF PBR materials when viewed up
close — Babylon's `DetailMapConfiguration` plugin (not a behavior API). Author on
**Properties › Material › Babylon › Detail Map** (same panel as NME, independent of
node materials).

**Packed or separate channels.** Assign a pre-packed detail map **or** separate
Albedo / Normal / Roughness images — a **packed map is optional** when separate
channels are set. Export packs separate channels into Babylon's Unity-layout PNG
using Blender's image API (no Pillow dependency). Missing channels → 0.5 gray,
which disables that effect in the shader:

| Channel | Content |
|---|---|
| **R** | Greyscale albedo detail |
| **G** | Normal map green |
| **B** | Roughness detail |
| **A** | Normal map red |

**Settings:** **UV Set** (`uv_set` → manifest `coordinatesIndex`: 0 = first UV /
UVMap / glTF `TEXCOORD_0`, 1 = second UV / `TEXCOORD_1`, …), **UV Scale** (tiles
over that layer via `uScale` / `vScale`), Diffuse Blend, Roughness Blend (PBR
only), Bump Level, Normal Blend (Whiteout / RNM).

**Formats.** Source images must be **PNG, JPG, or WEBP** (browser-safe). TIFF/EXR
and other formats are rejected — **Validate** warns before export, and **Export**
warns if an enabled detail map could not be written. Packed maps are copied
as-is; separate channels become `{MaterialName}_detail.png` under `materials/`.
Source paths can live anywhere on disk; only the copied files ship with the level.

**Validate / export warnings** include: enabled but no texture assigned, enabled
but material unused by any exportable mesh, missing or unsupported channel files,
detail UV set higher than a mesh's UV layer count, and pack/copy failures.

**Live Link** re-exports `detailMaps[]` and packed PNGs on every save (same path
as manual Export Level).

Export writes a top-level manifest block:

```json
"detailMaps": [
  {
    "name": "Marble",
    "file": "materials/Marble_detail.png",
    "coordinatesIndex": 1,
    "uvScale": 10,
    "diffuseBlendLevel": 0.1,
    "roughnessBlendLevel": 0.25,
    "bumpLevel": 1,
    "normalBlendMethod": "WHITEOUT"
  }
]
```

At load, `ApplyDetailMaps` runs immediately after `ApplyNodeMaterials`: matches
glTF material **name** on `scene.materials`, sets `material.detailMap.texture`,
`coordinatesIndex`, blend levels, and UV scale, then marks the material dirty.
Skips Node Materials. If a material has both NME and detail map authored, NME
wins (whole material replaced).

## 3D GUI

3D buttons and panels are authored as **GUI3D_*** components (one per Babylon
control type). Panels lay out the controls on their Blender *child* objects.
Parent button empties under a panel empty (Ctrl+P); child transforms express
**membership only** — the panel arranges controls at runtime. The runtime builds
them all on a shared `GUI3DManager` after entities exist, so behaviors only
drive the finished controls:

| Component | Babylon class |
|---|---|
| `GUI3D_BUTTON` | `Button3D` |
| `GUI3D_HOLO` | `HolographicButton` |
| `GUI3D_TOUCH_HOLO` | `TouchHolographicButton` |
| `GUI3D_MESH` | `MeshButton3D` |
| `GUI3D_STACK` | `StackPanel3D` |
| `GUI3D_SPHERE` | `SpherePanel` |
| `GUI3D_CYLINDER` | `CylinderPanel` |
| `GUI3D_PLANE` | `PlanePanel` |
| `GUI3D_SCATTER` | `ScatterPanel` |

```ts
this.entity.GetControl3D("StartButton");          // named after the Blender object
(this.entity.GetControl3D("StartButton") as HolographicButton).text = "Resume";
```

Authored On Click events arrive as `OnMessage(message, buttonEntity)` on the
target entity's behaviors — handle clicks the same way as trigger messages.
`Control3D` / button classes import from `@babylonjs/gui`.

## Style (generated code must match)

PascalCase methods/functions; camelCase, fully-descriptive fields & locals (no
`i`/`dt`/`tmp`); Allman braces (opening brace on its own line) for methods, `if`,
`for`; braces on every `if`; explicit `: void`; explicit null checks
(`if (x !== null)`), except real booleans. The `@exposed` and `@inputMap`
decorators stay lowercase. Full rules: `docs/STYLE_GUIDE.md`.

## Complete example

```ts
// src/behaviors/HoverBob.ts
import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/** Bobs the node up and down, and faces an optional target while doing so. */
export default class HoverBob extends Behavior
{
  @exposed({ min: 0, max: 5, step: 0.1, label: "Amplitude (m)" })
  amplitude = 0.5;

  @exposed({ min: 0.1, max: 4, label: "Period (s)" })
  period = 2;

  @exposed({ type: "entity", label: "Face target" })
  target: Entity | null = null;

  private restY = 0;
  private elapsedSeconds = 0;

  OnStart(): void
  {
    this.restY = this.node.position.y;
  }

  OnUpdate(deltaSeconds: number): void
  {
    this.elapsedSeconds += deltaSeconds;

    const offset = Math.sin((this.elapsedSeconds / this.period) * Math.PI * 2) * this.amplitude;
    this.node.position.y = this.restY + offset;

    if (this.target !== null)
    {
      this.node.lookAt(this.target.node.getAbsolutePosition());
    }
  }
}
```

## Related documentation

| Topic | Doc / MCP |
|---|---|
| MCP tool order | `get_authoring_workflow` · **`route_task`** |
| Task playbooks | `docs/LLM_PLAYBOOK.md` · `get_playbook` · `list_playbooks` |
| Runtime loop / OnUpdate / delta time | `docs/engine/02-RUNTIME-BASICS.html` · `trace-runtime-loop` |
| Engine doc index (choose your path) | `docs/engine/00-INDEX.html` |
| Full scripting chapter | `docs/engine/05-SCRIPTING.html` |
| Physics (bodies, triggers, constraints) | `docs/engine/06-PHYSICS.html` · `get_physics_movement` |
| Load order / when `OnStart` runs / visibility | `docs/engine/04-LOAD-PIPELINE.html` |
| Cameras (component types, Geospatial) | `docs/engine/07-RENDERING.html` |
| Scene look / atmosphere / post-processing | `docs/engine/07-RENDERING.html` · `get_scripting_context(section="scene-look")` |
| Runtime lights / clustering / IBL compensation | `get_scripting_context(section="lights")` · `docs/engine/07-RENDERING.html` |
| Node materials (NME) | `docs/engine/trace-materials.html` · `get_scripting_context(section="detail-maps")` |
| Detail maps (glTF PBR) | `get_scripting_context(section="detail-maps")` · `docs/engine/07-RENDERING.html` |
| Audio, animation, skinned-mesh rule | `docs/engine/08-AUDIO-ANIMATION.html` |
| 2D GUI, particles, 3D GUI, MSDF | `docs/engine/11-UI.html` |
| Example behaviors | `list_behaviors` · `get_behavior` · `find_similar_behavior` |
| Code style | `docs/STYLE_GUIDE.md` · `get_style_guide` |
| Prefabs + `level.Spawn()` (planned) | not documented in-repo |
