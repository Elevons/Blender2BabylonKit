# Babylon Level Kit — Behavior Authoring Context

Context for an LLM **generating a behavior script** for this engine (runtime
**v0.32.0**). Each behavior is one self-contained `.ts` file the runtime loads
and runs per-frame. This file is the **behavior authoring contract** — you do
not need engine internals to write one. Deeper docs: `docs/engine/04-SCRIPTING.md`,
`docs/STYLE_GUIDE.md`, and the full packet at `docs/engine/00-INDEX.md`.

**Terminology:** a **component** is authored *data* on an entity (TAG, COLLIDER,
SCRIPT, …) serialized from Blender; a **behavior** is a runtime *script class*
(`extends Behavior`) instantiated from a `SCRIPT` component.

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
OnMessage(message: string, source: Entity): void  // a message arrived (trigger event or SendMessage)
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
entity.SendMessage(message, source): void              // deliver to all its behaviors' OnMessage
```

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
| `"COLLIDER"` / `"RIGIDBODY"` | `data` + `body` |
| `"SCRIPT"` | `data` + `behavior` |
| `"AUDIO"` | `data` + `sound` |
| `"GUI"` | `data` + `texture` |
| `"PARTICLE"` | `data` + `system` (+ `emptyEmitter` when the entity node is an empty) |
| `"CONSTRAINT"` | `data` + `constraint` |
| `"GUI3D_*"` | `data` + `control` |

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
@exposed({ type: "color" }) tint = new Color3(1, 0, 0);     // color picker
@exposed({ type: "entity" }) target: Entity | null = null;  // object picker
@exposed({ type: "enum", options: ["idle","walk"] }) state = "idle"; // dropdown -> string
@exposed({ type: "list", of: "float" }) speeds = [1, 2];    // add/remove list
@exposed({ type: "list", of: "entity" }) targets: (Entity | null)[] = []; // entity list
```

Options object: `{ min?, max?, step?, label?, type?, options?, of? }`.
`type` ∈ `float | int | bool | string | vector3 | color | entity | enum | list`.
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
| `FREE` / `UNIVERSAL` | Free-fly inspection; optional key scheme + **Keep Upright** |
| `ARC` | Orbit a target object (or a point ahead of the exported view) |
| `FOLLOW` | Track a target — fixed world offset or Babylon FollowCamera orbit |
| `GEOSPATIAL` | **Globe / planet** at world origin — map-like pan, zoom-to-cursor, tilt |

**Geospatial** (`GEOSPATIAL`): the planet mesh must be centered at world origin;
set **Planet Radius** to match the mesh radius in scene units. Optional min/max
zoom and collision checking. Controls attach when **Attach Controls** is on
(pointer, wheel, keyboard — built into Babylon's `GeospatialCamera`). Do **not**
write a behavior to recreate globe navigation — author the Camera component
instead.

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
`updateFlyToDestination` redirects an in-flight animation. Movement tuning
(`movement.zoomSpeed`, `movement.panInertia`, etc.) is on the runtime camera
object — not exported from Blender today.

For a **script-built** orbit around a moving entity (not a globe), see the
`camera-follow` recipe — it creates a `UniversalCamera` and sets
`scene.activeCamera`. Only one active camera per scene.

Post-processing (bloom, SSAO, volumetric light scattering, etc.) attaches to
`scene.activeCamera` **after** all `OnStart` hooks run. If your behavior creates
or swaps the active camera in `OnStart`, the exported stack is already on
whichever camera is active at that moment — you do not get a `Level` handle to
call `RetargetPostProcessing` from behaviors. Prefer authoring cameras and
post-processing in Blender when possible.

## Scene look & post-processing

Scene-wide rendering (environment, fog, atmosphere, post-processing) is **not** a behavior
concern — it is authored under **Properties › Scene › Babylon** and exported in
`manifest.scene`. Behaviors do not receive `level.post`, `level.atmosphere`, or a `Level` handle.

| Effect | Author in Blender | Behavior role |
|---|---|---|
| Environment / IBL | Rendering › Environment | None — IBL only when Atmosphere replaces the skybox |
| **Atmosphere** (physical sky) | Atmosphere (SUN lamp + scattering) | None — time of day follows the sun lamp direction |
| Fog | Scene › Fog | None |
| Default pipeline (bloom, DOF, …) | Post-Processing › Default Pipeline | None |
| SSAO | Post-Processing › SSAO | None |
| **Volumetric light scattering** | Post-Processing › Volumetric Light Scattering | None — pick a **Light Source** mesh (sun billboard); empty = default billboard |

**Volumetric light scattering** creates light shafts from a mesh light source via
Babylon's `VolumetricLightScatteringPostProcess`. Author the sun (or floor glow)
as a mesh with an emissive/diffuse material in Blender, assign it as **Light
Source**, enable the panel, and export. The manifest block is
`scene.postProcessing.volumetricLightScattering` (`lightSource` GUID, `samples`,
`ratio`, `invert`, optional `customMeshPosition`, `exposure`/`decay`/`weight`/
`density`). It works with or without Default Pipeline.

**Atmosphere** (`@babylonjs/addons/atmosphere`) provides a physically based sky and
aerial perspective. Author under **Properties › Scene › Babylon › Atmosphere**:
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

Do **not** instantiate `VolumetricLightScatteringPostProcess` (or other scene
post stacks) inside behaviors — that duplicates the loader, fights the exported
settings, and won't survive level reload. Use `list_scene_entities` to see
enabled **atmosphere** / **post-processing** and which entity is the sun lamp
or VLS light source when grounding `@exposed` picks.

Runtime detail: `docs/engine/06-RENDERING.md` (Atmosphere + post-processing).

## Physics

`entity.body` is a Havok V2 `PhysicsBody`. Common calls:

```ts
entity.body?.applyImpulse(force, point);
entity.body?.setLinearVelocity(v);   entity.body?.getLinearVelocityToRef(out);
entity.body?.setAngularVelocity(v);  entity.body?.getAngularVelocityToRef(out);
entity.body?.setMotionType(PhysicsMotionType.ANIMATED); // imports from @babylonjs/core
```

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
  **Auto-Fit Center of Mass** (default) → manifest `centerOfMassAutoFit: true`
  (runtime uses owned-mesh bounds center); custom offset →
  `centerOfMassAutoFit: false` + `centerOfMass` in Babylon Y-up. CoM is
  independent of collider placement — shift it low on a car chassis for stable
  tipping without resizing the collider.
- MESH-shaped colliders can't be DYNAMIC (Havok limitation) — author CONVEX for
  moving bodies.
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

Hand-built `Physics6DoFConstraint` in code is still possible — reuse
`ComputeConstraintFrame` / limit patterns from `subsystems/constraints.ts`.

### Triggers

Trigger colliders can be authored in Blender with **On Enter Events** (target
GUID, message, optional **filter tag**). **MESH-shaped triggers never fire** in
Havok — use box/sphere/capsule/convex. Receive events via `OnMessage`.

## Input

The input system clones Unity's Input System: an **InputActionAsset** of
**Action Maps** ("Player", "UI") containing **Actions** ("Jump", "Move") with
**Bindings** (keys, gamepad buttons/sticks, and 1D-axis / 2D-vector
composites). Maps enable/disable as a unit. The scene's asset and **Scene
Default** map are authored in Blender's **Input Actions** panel and exported as
`scene.inputActions` + `scene.defaultInputMap` in the manifest. The canvas needs
focus (the user clicks the viewport once).

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

Trigger colliders and 3D GUI buttons can send messages on enter/click — receive
them by overriding `OnMessage`. Optional **filter tag** on trigger events
drops enterers whose `entity.tag` doesn't match.

## GUI & particles

GUI layouts and particle systems are authored in Blender as **GUI** / **Particles**
components pointing at a Babylon-editor `.json`. **Particle Textures** (optional
list on the Particles component) copy images into `particles/` on export and
patch texture URLs in the exported JSON; the runtime resolves those paths beside
the particle file (`rootUrl` in `LoadParticleSystems`). Behaviors drive the
already-built objects:

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

| Topic | Doc |
|---|---|
| Full scripting chapter | `docs/engine/04-SCRIPTING.md` |
| Physics (bodies, triggers, constraints) | `docs/engine/05-PHYSICS.md` |
| Load order / when `OnStart` runs | `docs/engine/03-LOAD-PIPELINE.md` |
| Cameras (component types, Geospatial) | `docs/engine/06-RENDERING.md` |
| Scene look / atmosphere / post-processing (VLS, bloom, SSAO) | `docs/engine/06-RENDERING.md` · `get_scripting_context(section="scene-look")` |
| Audio, animation, skinned-mesh rule | `docs/engine/07-AUDIO-ANIMATION.md` |
| 2D GUI, particles, 3D GUI | `docs/engine/10-UI.md` |
| Code style | `docs/STYLE_GUIDE.md` |
| Prefabs + `level.Spawn()` (planned) | `docs/PREFAB_SPEC.md` |
