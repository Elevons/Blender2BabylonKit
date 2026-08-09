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
| 7 | `search_docs(query)` | When you need a doc section but don't know which chapter |
| 8 | `validate_behavior(source, ClassName.ts)` | Fix all errors; revalidate until clean |

### Deep path (manual)

| Step | Tool | Why |
|------|------|-----|
| 1 | `get_engine_basics(topic="components-vs-behaviors")` | First session only |
| 2 | `plan_behavior(intent, className)` | Recipes, sections, fragments |
| 3 | `get_playbook(name=…)` | Full Blender + MCP steps for one task |
| 4+ | Same as steps 4–8 above | |

Playbooks: `docs/LLM_PLAYBOOK.md` · `list_playbooks()` · `get_playbook(name=…)`.
Engine concepts: `get_engine_basics(topic=…)` → human chapters in `docs/engine/`.

### Semantic doc search (`search_docs`)

When you don't know which chapter covers a topic, call **`search_docs(query)`** before
guessing. It uses **local vector similarity** (no external LLM server):

- **Build time:** `npm run docs:build` embeds every prose section + contract markdown
  into `tools/bjs-mcp/data/doc-embeddings.json`.
- **Query time:** the MCP loads `Xenova/all-MiniLM-L6-v2` in-process, embeds your query,
  and ranks sections with hybrid scoring (75% cosine similarity + 25% keyword boost for
  exact API names).
- **Fetch hits:** `get_doc_chapter(chapter="…", section="…")` using slugs from results.

Example: `search_docs("spawn prefabs on mesh surface")` → `scripting-context` › Prefab spawn.
Contributors: re-run `npm run docs:build` or `npm run mcp:index` after editing prose or
LLM contract files. Details: `docs/BUILDING-DOCS.html` · MCP semantic search section.

`get_scripting_context(section="list")` returns section slugs. Common pulls:

| Section slug | Topic |
|--------------|-------|
| `lifecycle` | OnStart / OnPostReady / OnUpdate / OnDestroy / OnEnable / OnDisable / OnMessage / collision & trigger hooks |
| `level-session` | `this.session` — soft restart / load / unload the level (`LevelDirector`) |
| `entity` | Entity API, attachments |
| `exposed` | `@exposed` types and Blender parse rules |
| `input` | Input Actions, `@inputMap` |
| `physics` | Bodies, triggers, constraints, movement |
| `cameras` | Camera component types, Geospatial, `FindCameraForNode` / `CopyLens` |
| `scene-look` | Atmosphere, fog, post — **author in Blender** (runtime exceptions below) |
| `lights` | `FindLightForNode`, clustered punctual lights, IBL compensation |
| `visibility` | Eye icon, Make Invisible, `SetEntityActive`, shadow casters |
| `lod` | Level-of-detail mesh swapping (author in Blender) |
| `coordinate-axes` | Blender local vs Babylon world — **prefer `get_axis_conversion`** |
| `animation` | ANIMATOR FSM, clips, armature rule |
| `gui` | 2D GUI, particles, 3D GUI, MSDF text |
| `detail-maps` | Detail texture overrides on glTF PBR — **author in Blender** |
| `sidecar-assets` | Hot-reload GUI / particle / material JSON from the Control Panel with no Blender re-export |

## Author in Blender vs write in behavior

| Need | Author in Blender | Write in behavior |
|------|-------------------|-------------------|
| Collider / rigid body / joint | COLLIDER, RIGIDBODY, CONSTRAINT components | Read `entity.body`, drive motors, override `OnCollision*` / `OnTrigger*` hooks |
| Camera type (orbit, globe) | CAMERA component on camera object | Rare: `flyToPointAsync` on GeospatialCamera only |
| Sky / atmosphere / bloom / SSAO | Babylon Scene panels | **Never** — loader owns these |
| Color grading LUT (scene-wide) | Post-Processing › Color Grading | **Rare** — zone behaviors swap via `ApplyColorGradingLut` (see scene-look) |
| Detail map on glTF PBR | **Properties › Material › Babylon › Detail Map** | **Never** — loader applies `detailMaps[]` |
| Input bindings | Input Actions panel | Poll `FindAction("Move")` by **name** |
| Tunable fields per object | `@exposed` on SCRIPT + **Sync** | Declare fields; runtime values applied before `OnStart` |
| Trigger → gameplay (data) | COLLIDER Event Messages → target entity | `OnMessage` on target behaviors |
| 2D HUD / particles / 3D buttons | GUI / PARTICLE / GUI3D_* components | `GetGui` / `GetParticles` / `GetControl3D` |
| MSDF labels | MSDF_TEXT component | `GetTextRenderer` — update paragraphs only |
| Locomotion / clip state machine | **ANIMATOR** on the **armature** (node graph + Parameters) | Drive params: `SetFloat` / `SetBool` / `SetTrigger` via `GetAttachment("ANIMATOR")` |
| Enable / disable an object at runtime | — | `SetEntityActive(entity, active)` from `@bjs/engine` (rendering, physics, behaviors) |
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
OnPostReady(): void                   // once, after NME compile + post attach (see load order below)
OnUpdate(deltaSeconds: number): void  // every frame; seconds since last frame, scaled by this.time.timeScale
OnDestroy(): void                     // on level dispose — unsubscribe observers, dispose constraints
OnEnable(): void                      // when the entity becomes effectively active (SetEntityActive / hierarchy)
OnDisable(): void                     // when the entity becomes effectively inactive
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
- `deltaSeconds` is **scaled game time** (`this.time.deltaSeconds`) — it shrinks
  under slow motion and is 0 while frozen. Wall-clock timers use
  `this.time.unscaledDeltaSeconds` (see [Time and time scale](#time-and-time-scale)).
- Cross-entity `OnStart` order is unspecified; guard references for `null`.
- **`OnPostReady`** runs once after `ApplyPostProcessing` (when the manifest has
  `scene.postProcessing`) and `BuildNodeMaterials`. Use it for
  `level.post.pipeline` / zone LUT swaps — not `OnStart`. Cast `this.spawner as Level`
  for `post` and `componentHost.baseUrl`. Spawned or runtime-added scripts receive
  `OnPostReady` immediately after `OnStart` when `level.postReady` is already true.
- Input is processed **before** `OnUpdate` each frame; `WasPressedThisFrame` /
  `WasReleasedThisFrame` edges last one full frame (`InputManager.EndFrame` runs
  after all behaviors).
- Entities that are **effectively inactive** skip `OnUpdate`, collision/trigger hooks, and
  incoming `SendMessage`. Use `IsEntityActive(entity)` (hierarchy-aware) or
  `entity.active` (local `activeSelf` only).

## Members available on `this`

```ts
this.entity : Entity          // the entity this behavior is attached to
this.scene  : Scene           // the Babylon scene
this.node   : TransformNode   // shortcut === this.entity.node
this.input? : InputActionMap  // scene default map — injected when you have no @inputMap fields
this.spawner: PrefabSpawner   // runtime prefab spawn — Spawn, HideTemplate, FlushSpawnShadowRefresh
this.session: LevelSession    // load / restart / unload — see "Level session" below
this.time   : GameClock       // unified game clock — see "Time and time scale" below
this.byTag  : (tag: string) => Entity[]  // find every entity carrying the given tag
```

Behaviors do **not** receive a full `Level` handle. Look up other objects via
`@exposed({ type: "entity" })` fields (preferred), `this.byTag("Enemy")` for
tag-based grouping, `entity.GetAttachment("SCRIPT")` / `entity.GetBehavior` on
the same entity, or `node.metadata.bjsEntity` from a Babylon node. For
**duplicating** a loaded entity subtree at runtime, use `this.spawner.Spawn`
(see [Prefab spawn](#prefab-spawn)) — never `node.clone()` plus manual
attachment copying. For **restarting or changing levels**, use `this.session`
(see [Level session](#level-session)).

**Runtime component add/remove** is app-code only: `level.componentHost.AddComponent`
/ `RemoveComponent` after load (mutations are not written back to the manifest).
Behaviors cannot call `componentHost` — orchestrate from your app layer or use
messages.

## Level session

`this.session` is a narrow `LevelSession` for load / restart / unload — not a
full `Level` handle. The app wires a `LevelDirector` (see `game/src/main.ts`)
so these methods recreate the Scene + Havok world and reload the manifest.

```ts
await this.session.Restart();                 // soft-reload the current level
await this.session.Load("/levels/Other/Other.scene.json");
this.session.Unload();                        // tear down without loading
this.session.manifestUrl;                     // current (or last) manifest URL
this.session.isLoading;                       // true while Load/Restart is in flight
```

Rules:

- Prefer `Restart()` / `Load(url)` over `window.location.reload()`.
- Calls are deferred past the current stack and serialized — safe from GUI
  clicks and `OnUpdate`.
- Without a `LevelDirector` (or another `LevelSession` passed as
  `LevelLoaderOptions.session`), methods warn and no-op.
- Still not a full `Level`: use `this.spawner` for prefabs, `this.byTag` for
  queries, and app code for `componentHost`.

### Loading UI (Babylon spinner)

`LevelDirector` shows Babylon's default loading overlay (spinning logo) for
every `Load` / `Restart` via `engine.displayLoadingUI()`, and hides it with
`engine.hideLoadingUI()` when the level is ready (or the load fails). Behaviors
do **not** call those APIs — the director owns the overlay so the canvas never
freezes on a stale last frame while the new scene is built.

To customize the overlay, assign a Babylon `ILoadingScreen` on the **engine**
from app code (`main.ts`), after the first load has created the engine (or from
`onLoaded` on subsequent loads — the same engine is reused across restarts):

```ts
import type { ILoadingScreen } from "@babylonjs/core";

const customLoadingScreen: ILoadingScreen = {
  loadingUIBackgroundColor: "#000000",
  loadingUIText: "Loading…",
  displayLoadingUI()
  {
    // show your DOM / brand overlay
  },
  hideLoadingUI()
  {
    // hide it
  },
};

// After director.Load(...) has created the engine at least once:
director.GetEngine()!.loadingScreen = customLoadingScreen;
```

`DefaultLoadingScreen` is registered by the director (`@babylonjs/core/Loading/loadingScreen`).
Replace `loadingScreen` before the next `Restart` / `Load` for the custom UI to
appear. Full director API: `docs/engine/14-API-GUIDE.html`.

Fragment: `get_fragment(name="restart-level")`. App-side API (`LevelDirector`,
`GetLevel()` / `GetScene()`, `onLoaded`): `docs/engine/14-API-GUIDE.html`.

## Time and time scale

`this.time` (a `GameClock`) is the engine's **single time authority** — the
equivalent of Unity's `Time`. `Level` ticks it once per frame before behaviors
run; the clock clamps hitch deltas, applies `timeScale`, and syncs
`scene.animationTimeScale`, every particle system's `updateSpeed`, and the
Havok physics step. Never scale time by hand (`engine.getDeltaTime()`,
`scene.animationTimeScale`, `particleSystem.updateSpeed` multipliers,
`physicsEngine.setTimeStep`) — write `this.time.timeScale` and everything
follows.

```ts
this.time.timeScale = 0.5;            // slow motion; 0 freezes gameplay, 1 = real time
this.time.deltaSeconds;               // scaled frame delta — same value OnUpdate receives
this.time.unscaledDeltaSeconds;       // wall-clock delta (hitch-clamped) — menus, slow-mo ramps
this.time.elapsedSeconds;             // scaled game time since the level began
this.time.unscaledElapsedSeconds;     // wall-clock time since the level began
this.time.maxFrameDeltaSeconds;       // hitch clamp, default 0.1 (Unity maximumDeltaTime)
```

Rules:

- **`timeScale = 0` freezes gameplay** — behavior `OnUpdate` deltas, scene
  animations, particles (simulation + emission; frozen particles stay
  visible), and physics all stop; rendering and input keep running (so a
  pause menu still works). Setting it mid-frame takes effect the same frame.
- While `timeScale != 1` the clock owns `particleSystem.updateSpeed` (it
  rescales the authored value every frame and restores it at 1) — don't tune
  `updateSpeed` from a behavior during slow motion.
- **Ramps that write `timeScale` must read the unscaled clock.** A slow-motion
  ease driven by `deltaSeconds` slows itself down and never finishes — advance
  it with `unscaledDeltaSeconds` (see `game/src/behaviors/Endgame.ts`).
- **Timers that must run while paused** (menus, fades) also use
  `unscaledDeltaSeconds` / `unscaledElapsedSeconds`.
- **Deltas are hitch-clamped.** Both clocks cap each frame at
  `maxFrameDeltaSeconds` (0.1 s), so the giant catch-up delta after a hidden
  browser tab lands as one ordinary step instead of a physics explosion.
- Restore `timeScale = 1` in `OnDestroy` if your behavior may leave it
  changed when the level unloads.

## Blender local axes vs Babylon world space

> **Full guide:** `docs/engine/15-AXIS-CONVERSION.html` · `get_doc_chapter(chapter="engine/15-axis-conversion")` · **`get_axis_conversion(topic?)`**

Two coordinate frames show up in behavior code. Mixing them up causes silent
wrong rotations (an arrow that never turns, a mesh pointing sideways, pitch
applied on the wrong axis).

### World space (Babylon Y-up)

- The **game world** uses glTF/Babylon convention: **+Y up**, **−Z forward**
  (cameras look down −Z).
- **Manifest / component data** (collider offsets, constraint pivots, rigid-body
  CoM, etc.) is converted at export:
  `(x, y, z)_Blender → (x, z, −y)_Babylon` in
  `export/component_serializers.py`. The runtime reads those values as
  Babylon-space — do not convert again in behaviors.
- Babylon helpers like `Vector3.Up()`, `Vector3.Forward()`, and world positions
  from `getAbsolutePosition()` are in this frame.

### Node local space (Blender axes preserved)

- Each exported object's **local axes stay Blender's** (Z-up): **+X lateral**,
  **+Y forward**, **+Z up**. The Y-up flip is applied at the scene/root level,
  not by remapping every mesh's local frame.
- glTF loads each node's rest rotation as a quaternion; rotations you apply in
  behaviors act in this Blender-local frame. See `BoatRocker.ts` (comment on
  local pitch/roll).
- `@exposed` vector3 defaults such as `[0, 1, 0]` mean **Blender forward**,
  not Babylon forward.

### `lookAt` / `setDirection`

- `node.lookAt(worldTarget)` calls `setDirection`, which aligns the node's
  **local +Y axis** toward the target — **not +Z** (despite some Babylon doc
  wording elsewhere).
- **Model tip/forward along Blender +Y** when using `lookAt`.
- Default space is `Space.LOCAL`. When the node has a **rotated parent** (e.g.
  an arrow parented to the camera), LOCAL space mis-computes the direction — the
  mesh appears not to rotate. Pass **`Space.WORLD`**:

```ts
import { Space } from "@babylonjs/core";

this.node.lookAt(target.node.getAbsolutePosition(), 0, 0, 0, Space.WORLD);
```

Reference: `ObjectiveArrow.ts` (camera-child arrow), `BoatRocker.ts` (local
pitch/roll on rest rotation).

### Quick reference

| What | Frame | Notes |
|------|-------|-------|
| `@exposed` vector3 / list of vector3 | Blender local | **Not** converted at export — same frame as `node.position` |
| Collider offset / CoM in manifest | Babylon (exported) | Already converted at export |
| `node.position` / `node.rotation` on a loaded mesh | Blender local | +Y = forward, +Z = up |
| `lookAt` / `setDirection` | Aligns local **+Y** | Model forward along Blender +Y |
| `Vector3.Forward()` | Babylon world | World −Z, not Blender +Y |
| Camera local −Z | Babylon camera space | View / look direction |

Human docs: `docs/engine/15-AXIS-CONVERSION.html` · export math:
`docs/engine/03-BLENDER-ADDON.html` › Axis conversions.

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
entity.GetNamedAttachment(type, name): AttachmentOfType | undefined  // Blender header Name / manifest `name`
entity.GetBehavior<T>(Ctor): T | undefined        // first behavior of that class on this entity
entity.GetScript(name): Behavior | undefined     // SCRIPT row by manifest `name` (instance label)
entity.GetAnimation(name): AnimationGroup | undefined  // exact match, then contains
entity.GetSound(name): StaticSound | undefined         // exact match, then contains
entity.GetGui(name): AdvancedDynamicTexture | undefined      // exact match, then contains
entity.GetParticles(name): IParticleSystem | undefined       // exact match, then contains
entity.GetControl3D(name): Control3D | undefined             // exact match, then contains
entity.GetTextRenderer(fontStem): TextRenderer | undefined   // MSDF font JSON file stem
entity.GetReflectionProbe(): ReflectionProbe | undefined     // first REFLECTION_PROBE attachment
entity.GetReflectionProbes(): ReflectionProbe[]              // every REFLECTION_PROBE attachment
entity.SendMessage(message, source): void              // deliver to all its behaviors' OnMessage
entity.active: boolean                               // local activeSelf (Unity) — default true
// IsEntityActive(entity)                             // activeInHierarchy (local + ancestor chain)
```

**Load-time hide vs runtime SetActive:** Viewport-hidden and **Make Invisible**
colliders call `HideEntityNode` at load — rendering off only (`ApplyNodeSubtreeVisibility`);
**physics and behaviors still run**. For Unity-style **SetActive**, use
**`SetEntityActive(entity, active)`** (`core/entityActive/`):

- Sets **`entity.active`** (local `activeSelf`) on **one entity**, then reconciles
  every descendant entity on its node subtree.
- **Effective activity** = local `active` && every ancestor entity's local `active`
  (`IsEntityActive` / `activeInHierarchy`). A child with `active=true` under an
  inactive parent stays off until the parent is re-enabled.
- **OnDisable** / **OnEnable** fire on effective transitions (not on local-only
  changes that hierarchy still blocks).
- Disabling suspends Havok (the body is disposed; authored collider/rigidbody
  data is cached in `suspendedPhysics` and rebuilt on enable), stops particles,
  sounds, animations, GUI, constraints, reflection-probe refresh; re-enabling
  restores what was playing.

`entity.node.isVisible` at load mirrors the Blender **viewport** eye icon. **Make
Invisible** hides the mesh the same way at load while leaving the object visible
in Blender. **Do not** hand-roll visibility for full disable — use `SetEntityActive`.
Load hide does **not** change `entity.active`, so `SetEntityActive(entity, true)`
on a load-hidden entity is a **no-op** (it is already active). To reveal an entity
at runtime, create a real transition: `SetEntityActive(this.entity, false)` in
`OnStart`, then `SetEntityActive(this.entity, true)` later — the enable re-shows
the subtree even when the mesh loaded hidden.
**Ray Visibility → Shadow**
(`visible_shadow`) controls **shadow casting** only when no **Mesh Shadows** component is enabled: when off, export stamps
`bjs_cast_shadows: 0` and the mesh still renders and **receives** shadows but is omitted
from `ShadowGenerator` casters (useful for huge ground planes that would blow up the sun
frustum). Add **Mesh Shadows** (Rendering) for explicit modes: Cast & Receive, Receive Only, Cast Only, or None — the component **overrides** ray visibility when present.
**Render-disabled**
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

// Multiple SCRIPT rows on one entity — use Blender header Name → manifest `name`
const primary = entity.GetScript("Primary Spawner");
const backup = entity.GetScript("Backup Spawner");

// Named collider on a compound body
const hitbox = entity.GetNamedAttachment("COLLIDER", "Hitbox");

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
| `"MESH_SHADOWS"` | `data` only (cast/receive applied after `SetupShadows` in `FinalizeLevel`) |
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

Use `GetBehavior(MyClass)` when you know the behavior **class** and there is only one
instance (or you want the first). Use `GetScript(name)` or
`GetNamedAttachment("SCRIPT", name)` when the entity has multiple SCRIPT rows or you
authored a Blender header **Name**. Use `GetAttachment("SCRIPT")` when you care about
the first component row or manifest `data`. Failed async loads (missing audio/GUI/particle file) produce no row.
Convenience arrays (`sounds`, `guiTextures`, …) mirror attachments.

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
@exposed({ type: "file", label: "LUT" }) zoneLut = "";              // file picker -> post/ on export
@exposed({ type: "list", of: "float" }) speeds = [1, 2];    // add/remove list
@exposed({ type: "list", of: "entity" }) targets: (Entity | null)[] = []; // entity list
```

Options object: `{ min?, max?, step?, label?, type?, options?, of? }`.
`type` ∈ `float | int | bool | string | file | vector2 | vector3 | color | entity | enum | list`.
`of` (list element type) ∈ `float | int | string | bool | vector3 | color | entity`.

**Authoring rules that affect codegen:**
- Default must be a **single-line literal** (`= 45` / `= true` / `= "x"` /
  `= [0,1,0]` / `= null` / `= []`). Computed or multi-line defaults are NOT parsed
  by Blender (the field keeps its code default at runtime).
- Entity references need the explicit `type: "entity"` hint and an `Entity | null`
  field type. Entity lists use `(Entity | null)[]` and **start empty** — the level
  author fills them in Blender (type a count, or pin the inspector and use *Add
  Selected* to add every selected object at once).
- **`type: "file"`** — Blender shows a file picker; export copies the picked asset
  into `post/` and writes a manifest-relative path into `vars`. Runtime receives
  that path string — load with `ApplyColorGradingLut` (see **Scene look**), not a
  plain `Texture`.
- `vector3`/`color` values arrive as Babylon `Vector3`/`Color3` at runtime (coerced
  from arrays); plain arrays stay arrays.

## Visibility

Blender has three ways to control what ships visible at runtime:

| Blender toggle | Property | Export / runtime |
|---|---|---|
| **Eye** (viewport) | `hide_viewport` | Exported; loads with `entity.node.isVisible = false` |
| **Collider › Make Invisible** | `collider_make_invisible` | Exported; mesh loads invisible when any enabled collider has `makeInvisible: true` (physics unchanged) |
| **Ray Visibility → Shadow** | `visible_shadow` | Exported; visible and receives shadows; does **not** cast when off (`bjs_cast_shadows: 0`). Overridden by **Mesh Shadows** component when enabled. |
| **Mesh Shadows** component | `mesh_shadow_mode` | Manifest `MESH_SHADOWS`: Cast & Receive, Receive Only, Cast Only, or None on owned meshes |
| **Camera** (render) | `hide_render` | Omitted from the `.glb` and manifest entirely |

Viewport-hidden objects still exist as entities (physics, scripts, references resolve).
Export writes `"visible": false` on manifest entities (check `.scene.json`) and
`bjs_visible: 0` in glTF extras (collection / hierarchy visibility via
`visible_get()`, not just the per-object eye flag). Use the eye icon for props
that should stay off until a behavior reveals them — but note the reveal needs a
disable-then-enable cycle (below), because load hide leaves `entity.active` true.
Use **Collider › Make Invisible** when you want the mesh visible while editing in Blender
but collision-only at runtime (invisible triggers, hidden blocking volumes).
Use render-disable for editor-only helpers (rigs, guides, blocking meshes) that should
never ship.

```ts
import { SetEntityActive, IsEntityActive } from "@bjs/engine";

SetEntityActive(targetEntity, false); // local activeSelf off
SetEntityActive(targetEntity, true);

if (IsEntityActive(targetEntity)) { /* activeInHierarchy */ }
```

`SetEntityActive` fires **OnDisable** / **OnEnable** on effective transitions.
Example: `ToggleInWater.ts` toggles underwater FX targets when a probe enters water.

```ts
// Reveal on message. Load hide keeps entity.active === true, so disable first —
// otherwise SetEntityActive(this.entity, true) is a no-op and nothing appears.
OnStart(): void
{
  SetEntityActive(this.entity, false);
}

OnMessage(message: string, _source: Entity): void
{
  if (message === "reveal")
  {
    SetEntityActive(this.entity, true); // re-shows the subtree even if it loaded hidden
  }
}
```

## Reaching other objects

Prefer an `@exposed({ type: "entity" })` field (the author picks the target in
Blender; it resolves to an `Entity` before `OnStart`). For tag-based grouping,
author a TAG component in Blender and call `this.byTag("Enemy")` — it returns
every entity carrying that tag. On the same entity, use
`entity.GetBehavior(OtherBehavior)` or `entity.GetAttachment("SCRIPT")?.behavior`.
If you only have a node:
`node.metadata.bjsEntity` is the back-reference to its `Entity`.

## LOD (level of detail)

Distance-based mesh swapping is **authored in Blender**, not in a behavior.
Add a **LOD** component (Rendering section) on the high-detail entity, then add
rows — each row picks a lower-detail mesh target and the **additional distance**
beyond the previous level at which to swap.

**LOD targets must be mesh-only empties** — no components, no behaviors, no
physics. The Blender UI shows a red warning when a picked target has components;
the runtime skips any level whose target has attachments.

LOD targets are **referenced objects** at export: they get GUIDs assigned before
the glb is written and are force-exported as entities even when mesh-only. Two
things still make a target unexportable (runtime logs `target … not found`):
it is render-disabled, or it belongs to **no collection in the scene** — a
common leftover when a prefab's LOD meshes weren't members of the collection in
the library file, so the library override leaves them as orphan datablocks.
Export validation warns about both; fix orphans in the prefab library by making
the LOD meshes members of the prefab's collection.

**LOD target meshes need unique mesh data.** Babylon's `addLODLevel` only
accepts `Mesh` — shared glTF mesh data (linked prefab duplicates) imports as
`InstancedMesh` and cannot serve as a LOD level. The runtime warns
(`only owns instanced meshes`); make the LOD meshes single-user in the library.

At runtime Babylon handles the distance-based mesh swap automatically. The
source entity keeps all its components (physics, scripts, audio, etc.) active
at every distance — only the visual mesh changes.

```
Source Entity (the real one)          LOD Target (mesh-only)
┌──────────────────────────┐          ┌──────────────────┐
│ TAG: "Enemy"             │          │ (no components)  │
│ COLLIDER (capsule)       │          │                  │
│ RIGIDBODY (dynamic)      │          │  lowpoly mesh    │
│ SCRIPT: EnemyAI          │          │                  │
│ LOD:                     │          │                  │
│   [+20m → LOD Target]    │ ───────► │                  │
└──────────────────────────┘          └──────────────────┘
```

Distances are **relative** in Blender (each row is the additional distance
beyond the previous level). The serializer accumulates them into absolute
distances for the runtime, so the first row at +20m swaps at 20m, the second
at +30m swaps at 50m, and so on. This prevents duplicate distances by design.

### Auto LOD

Each LOD level can optionally enable **Auto LOD** instead of picking a target
entity. When enabled, Babylon's built-in mesh simplification automatically
generates a lower-detail version of the source mesh at runtime.

Auto LOD settings:
- **Quality** (0.0–1.0): percentage of faces to keep. 1.0 = no reduction, 0.0 = maximum simplification
- **Optimize Mesh**: optimize mesh indices before simplification (better UV preservation but slower)

You can mix manual and Auto LOD levels on the same entity. For example:
- LOD1 at +20m → manual target (immediate)
- LOD2 at +50m → Auto LOD (async, adds itself when simplification completes)

Auto LOD runs asynchronously in the background. During the brief window before
simplification completes, the mesh uses the previous LOD level or the original
high-detail mesh depending on distance. Once ready, the auto-generated level
kicks in automatically.

Distances are **relative** in Blender (each row is the additional distance
beyond the previous level). The serializer accumulates them into absolute
distances for the runtime, so the first row at +20m swaps at 20m, the second
at +30m swaps at 50m, and so on. This prevents duplicate distances by design.

Distances are **relative** in Blender (each row is the additional distance
beyond the previous level). The serializer accumulates them into absolute
distances for the runtime, so the first row at +20m swaps at 20m, the second
at +30m swaps at 50m, and so on. This prevents duplicate distances by design.

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

For a **script-built** camera that replaces the exported one (e.g. `camera-follow`
/ `TrainCamera`), copy the Blender lens onto the new camera so FOV and clip planes
match the authored camera:

```ts
import { CopyLens, FindCameraForNode } from "@bjs/engine";
import { ArcRotateCamera } from "@babylonjs/core";

const authored = FindCameraForNode(this.scene, this.node);
const camera = new ArcRotateCamera(/* … */);
if (authored !== null)
{
  CopyLens(authored, camera); // fov, fovMode, minZ, maxZ, mode
}
this.scene.activeCamera = camera;
```

`FindCameraForNode` walks the parent chain (same pattern as `FindLightForNode`).
`CopyLens` is the same helper `BuildTypedCamera` uses for Blender Camera-component
overrides. Prefer authoring camera **type** in Blender when possible; use these
helpers only when a behavior must create its own Babylon camera. Only one active
camera per scene.

Post-processing (bloom, SSAO, etc.) attaches to
`scene.activeCamera` **after** all `OnStart` hooks run, then every behavior's
**`OnPostReady`** runs. If your behavior creates or swaps the active camera in
`OnStart`, the exported stack is already on whichever camera is active at that
moment. Touch `level.post.pipeline` in **`OnPostReady`**, not `OnStart`. Use
`RetargetPostProcessing` from app code if gameplay swaps the active camera later.
Prefer authoring cameras and post-processing in Blender when possible.

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
| Color grading LUT (scene-wide) | Post-Processing › Color Grading + **LUT File** | None — `.3dl`, Adobe `.cube`, or strip `.png`; copied to `post/` at export |
| Zone LUT / tone map swap | `@exposed({ type: "file" })` on zone behavior + **Sync** | `FogChanger`-style: ACES outside, LUT inside via `ApplyColorGradingLut` in **`OnPostReady`** |
| SSAO | Post-Processing › SSAO | None |

**Runtime fog (exception):** behaviors like `FogChanger` may drive `scene.fogEnabled`,
`scene.fogMode`, `scene.fogColor`, and `scene.fogStart` / `scene.fogEnd` from trigger
volumes. Reliable pattern (poll-only — do not rely on `OnTriggerEnter`/`Exit` alone):

- Assign **`@exposed({ type: "entity" })` probe** on the moving sample point when the
  script host is not that point (e.g. `CameraBlock` for a `TrainCamera` rig — same as
  `TrainCamera.colliderProbe` / `FogChanger.movingObject`).
- Poll **`IsEntityInsideColliderVolume(probe, volumeEntity)`** in `OnStart` and
  `OnUpdate` (exported from `@bjs/engine`, `physics/shapes.ts`). BOX and SPHERE
  trigger colliders only; auto-fit volumes resolve owned-mesh bounds like Havok body build.
- Apply the initial fog/LUT preset in **`OnPostReady`** (when `level.post` exists).
- Linear fog divides by `(fogEnd - fogStart)` — equal or inverted ranges break scene
  fog and water NME blocks that mirror the range; use a valid span or treat equal
  start/end as "no visible fog" with a far end (e.g. `[0, 1e9]`).
- NME water materials with **Fog Start** / **Fog End** input blocks need the same
  range pushed when scene fog changes (`FogChanger.SyncWaterFogOpacityRange`).

See **`get_fragment(name="poll-trigger-volume")`** and `FogChanger.ts` / `ToggleInWater.ts`.

**Runtime color grading (exception):** do not instantiate a second
`DefaultRenderingPipeline` or load `.cube` files as plain `Texture` objects.
Use the exported **`ApplyColorGradingLut(scene, baseUrl, imageProcessing, { file })`**
from `@bjs/engine` on the **existing** pipeline:

```ts
import { ApplyColorGradingLut, Behavior, exposed } from "@bjs/engine";
import type { Level } from "@bjs/engine";

// level.post.pipeline.imageProcessing — cast this.spawner as Level when needed
const imageProcessing = (this.spawner as Level).post?.pipeline?.imageProcessing;
const baseUrl = (this.spawner as Level).componentHost.baseUrl;

imageProcessing.toneMappingEnabled = false;
ApplyColorGradingLut(this.scene, baseUrl, imageProcessing, { file: manifestPath });
imageProcessing._updateParameters();
```

`@exposed({ type: "file" })` fields pick the LUT in Blender; export copies it to
`post/` and stores the manifest path in `vars`. **`FogChanger.ts`** combines this
with zone fog: ACES tone mapping outside the volume, LUT-only look inside (tone
mapping off). Prefer leaving scene **Color Grading** off when a zone behavior owns
the LUT — avoids loading an unused global grade at startup.

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

**Color grading LUTs** (when **Post-Processing › Color Grading** is on): export
writes `scene.postProcessing.colorGrading.file` (manifest-relative path under
`post/`). Supported formats at runtime:

| Format | Loader | Notes |
|--------|--------|-------|
| `.3dl` | Babylon `ColorGradingTexture` | Integer lattice LUT |
| `.cube` | `CubeColorGradingTexture` (`subsystems/postprocess/cubeLutTexture.ts`) | Adobe/IRIDAS float LUT; sets `colorGradingBGR=false`. 1D `.cube` not supported. |
| `.png` | 2D strip texture | Horizontal LUT strip |

Do **not** load `.cube` files as a plain `Texture` or third-party post-process
from behaviors — that produces garbage (black/red) or no visible grade. For
**scene-wide** looks, author the LUT in **Post-Processing › Color Grading**; the
loader wires it into the Default Rendering Pipeline image-processing pass after
`Level.Begin()` (so cameras created in `OnStart` receive it), then
`NotifyPostReady()` fires. For **per-zone** LUTs, use `@exposed({ type: "file" })`
+ `ApplyColorGradingLut` in **`OnPostReady`** (see above).

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

### Physics raycasts (obstacle / ground / line-of-sight)

**Do not use `scene.pickWithRay` for gameplay collision queries.** `pickWithRay`
only hits pickable render meshes, not Havok colliders. Terrain and obstacles are
physics bodies, so rays often miss them entirely.

Use **`scene.getPhysicsEngine()?.raycastToRef(start, end, PhysicsRaycastResult)`**
instead — same pattern as `TrainCamera.ts` (camera wall pull-in), `CarController.ts`
(ground check), and `fishNavigator.ts` (obstacle avoidance).

Reuse one `PhysicsRaycastResult` instance per behavior. Filter hits in code: skip
self (`hitBody === this.entity.body`), trigger volumes, and any authored ignore
entities (see `TrainCamera.ts` `IsBlockingRayHit`).

### Trigger volume queries (zone overlap)

Havok **`OnTriggerEnter` / `OnTriggerExit`** and Event Messages work for many setups,
but **zone behaviors** (fog swaps, underwater toggles, lighting presets) should poll
trigger collider geometry when overlap must stay correct (dual-trigger probes,
start-overlapped volumes, scripts on the moving entity rather than the volume).

```ts
import { IsEntityInsideColliderVolume, IsPointInsideColliderVolume } from "@bjs/engine";

// Probe entity world position vs volume entity (BOX/SPHERE trigger collider)
const inside = IsEntityInsideColliderVolume(probeEntity, volumeEntity);

// Or a raw world point (e.g. camera.position)
const insidePoint = IsPointInsideColliderVolume(worldPoint, volumeEntity);
```

- **`volumeEntity`** — entity that owns the trigger `COLLIDER` (e.g. `Water`).
- **`probeEntity`** — entity whose **node position** is the sample point. When the
  script lives on a camera pivot, wire a child probe (`CameraBlock`) via `@exposed`.
- Optional third arg: cached `AttachmentOfType<"COLLIDER">` from `GetAttachment`.
- **Manual colliders** (`autoFit: false`) — manifest `center` / `size` / `radius`
  (matches the Blender collider preview).
- **Auto-fit colliders** (`autoFit: true`) — owned-mesh bounds resolved the same
  way as Havok body build (`FitColliderShape`), not placeholder manifest `size`.
- **Not Havok overlap queries** — analytic point-in-volume math so bodyless probes
  work reliably in `OnStart` / `OnUpdate`.
- Returns `false` for missing collider, non-trigger, unsupported shapes
  (CAPSULE, CYLINDER, CONVEX, MESH), or auto-fit with no owned mesh geometry.
- Poll in **`OnStart`** (initial state) and **`OnUpdate`** (edge-detect state changes).
  Fragment: **`poll-trigger-volume`**. Examples: `FogChanger.ts`, `ToggleInWater.ts`.

**Still use Havok triggers** for logging (`TriggerLogger`), Event Messages, and
listeners on the volume entity when events are enough. **`animalSpawner`** uses
`HavokPlugin.onTriggerCollisionObservable` for train↔water pairs — different pattern.

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
- **Duplicated / shared glTF meshes → `InstancedMesh`.** Linked prefab copies and
  duplicated objects often share one mesh buffer. Babylon keeps the first as a
  normal `Mesh` and later copies as `InstancedMesh`. CONVEX / MESH hulls clone
  from `sourceMesh` and bake verts into the **physics body's local frame**
  (`ResolvePhysicsMesh` in `geometry.ts`) — the same local-frame rule as
  `CloneChildIntoLocalFrame`. An older bake used the instance **world** matrix,
  so Havok applied the node pose twice: the visual stayed put, the collider sat
  far away (often near 2× world position) on every duplicate after the first.
  Current kits are fixed. If you still see that on an old engine build, update
  the kit (or make the mesh data single-user in Blender as a workaround).
- **Make Invisible** on a Collider (`makeInvisible` in the manifest) hides the
  entity mesh at load via `HideEntityNode`; Havok and behaviors are unaffected.
  **`SetEntityActive`** is the runtime SetActive path (with OnEnable/OnDisable).
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

**Do not use `body.getCollisionObservable()` for triggers.** That per-body
observable only receives solid contacts (`COLLISION_STARTED` / `CONTINUED`).
Trigger overlaps (`TRIGGER_ENTERED` / `EXITED`) are dispatched on
`HavokPlugin.onTriggerCollisionObservable`. Override `OnTriggerEnter` /
`OnTriggerExit` on the entity that owns the trigger body, or subscribe to the
plugin observable when listening from another entity (e.g. `animalSpawner.ts`).

**Zone behaviors** (fog, underwater toggles, lighting): prefer
**`IsEntityInsideColliderVolume(probe, volume)`** polled in `OnStart`/`OnUpdate`
over Havok enter/exit alone. Assign an explicit **probe** entity when the script
host is not the moving sample point. See [Trigger volume queries](#trigger-volume-queries-zone-overlap).

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

For rigged characters, components and scripts must be attached to the **armature**
entity (components on a skinned mesh do nothing — glTF skinning ignores the
mesh node's transform, and clips target the joints under the armature).

### Clip names (glTF ACTIONS mode)

Export uses Blender’s **ACTIONS** animation mode. Clip / `AnimationGroup` names
are the **Action** name by default — **not** the NLA strip display name. Renaming
an NLA track away from `NlaTrack*` / `[Action Stash]*` overrides the exported
name (and merges tracks that share that override).

Stashed Actions live on muted NLA tracks; those still export (and appear in
Animator State clip dropdowns). Only **muted strips** and multi-strip tracks are
skipped — matching glTF-Blender-IO. Prefer one Action per NLA track.

Looping clips: trim dead frames / holds at the end of the Action so the last
pose matches the first — a short hold on a 4s swim reads as a pause every cycle.

### Prefer ANIMATOR for multi-state FSMs

Author a flat state machine in Blender:

1. Stash or push-down **Actions** on the armature (Idle, Walk, …) — one strip per
   NLA track.
2. Add **Animator** component → **Edit Animator** (opens that object’s
   `BJSAnimationStateTree`). Each armature needs its **own** graph; State clip
   dropdowns list **that** object’s Actions (resolved from the open tree’s owner).
3. Graph nodes: **Entry** → default **State**, **Parameter** nodes (float / bool /
   int / trigger), **Transition** nodes with AND conditions. Pick State clips by
   **Action** name. Node Editor Add menu / sidebar tab: **BJS**.
4. Parameter defaults appear under **Parameters** on the component (press **Sync**
   after editing the graph). Do **not** also enable Animation panel autoplay —
   the Animator owns playback.

Conditions: parameter compare, `clipFinished`, `afterSeconds`, Input Actions
phase, or `OnMessage` string. Transitions are instant in v1 (no crossfade).

Runtime: the loader creates a built-in `AnimatorController` (extends `Behavior`,
not a SCRIPT / BehaviorRegistry entry). Behaviors on the same entity drive it:

```ts
import type { AnimatorController } from "@bjs/engine";

const attachment = this.entity.GetAttachment("ANIMATOR");
if (attachment !== undefined && attachment.type === "ANIMATOR")
{
  const animator = attachment.behavior as AnimatorController;
  animator.SetFloat("Speed", moveMagnitude);
  animator.SetBool("IsGrounded", grounded);
  animator.SetTrigger("Jump");
}
```

### Manual clip control (simple cases)

Animation groups are scoped to an entity **by membership**: a clip belongs to an
entity if any targeted animation hits the entity's node or a descendant.

```ts
this.entity.GetAnimation("Walk")?.start(true);  // loop
for (const group of this.entity.animations) { group.stop(); }
```

Use manual control or the `animation-cycle` recipe only for simple demos. Prefer
**ANIMATOR** for Idle/Walk/Jump-style FSMs.

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

## Hot-reloading sidecar assets (no re-export)

The JSON a level references — **GUI** (`gui/`), **particles** (`particles/`),
**node materials** (`materials/`) — ships as plain files **beside** the level
(`game/public/levels/<level>/<folder>/…`), not baked into the `.glb`. You can
edit one and update the running level **without re-exporting from Blender**.

- **Two locations.** Authored/staging copies live under **`game/workspace/<folder>/`**
  (moved out of `public/` so they are not served directly). The **deployed**
  copies the runtime fetches live under **`game/public/levels/<level>/<folder>/`**.
  A full Blender export copies workspace → level.
- **Reload one file.** The **Project Control Panel › Assets** panel lists every
  asset the selected level's `.scene.json` references and gives each a **Reload**
  button. Reload recopies the `game/workspace/` source over the deployed level
  file; Vite's level watcher then triggers a full page reload. It is disabled
  when no matching workspace source exists ("No workspace source"), so the
  Blender-authored asset never drifts.
- **Transparent to behaviors.** Scripts resolve these assets by name
  (`GetGui("hud")`, `GetParticles("fire")`, node-material name match), so an
  edited-and-reloaded asset is picked up with **no behavior code change**. When
  you change the *structure* a behavior depends on (a renamed GUI control, a new
  particle system), update the lookups accordingly.

Full workflow + REST API (`/assets/:level/references`, `/assets/:level/reload`):
`get_doc_chapter(chapter="control-panel/01-control-panel")`.

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

## Prefab spawn

Duplicate any **loaded** entity subtree at runtime with full components, fresh
GUIDs, physics, scripts, and constraints. The template is whatever is already
in the level — a linked/appended collection flattened at export, or an in-scene
hierarchy. No separate prefab asset format in v1.

**From a behavior** (injected `PrefabSpawner` — not a `Level` handle):

```ts
@exposed({ type: "entity", label: "Prefab", spawnTemplate: true })
prefab: Entity | null = null;

@exposed({ type: "list", of: "entity", label: "Prefabs", spawnTemplate: true })
prefabs: (Entity | null)[] = [];
```

Use `spawnTemplate: true` when spawning is deferred (e.g. waits for a trigger).
Omit it when the template must stay visible until spawn (`keepTemplate: true`,
e.g. populateprefabs “Keep original prefabs”).

```ts
if (this.prefab !== null)
{
  const handle = await this.spawner.Spawn(this.prefab, {
    position: new Vector3(x, y, z),
    // rotationQuaternion?, scaling?
    // parent?: Entity | null  — Entity = parent-local transform; null = scene root (world transform); omit = template's parent
    // deferShadowRefresh?: true  — batch with FlushSpawnShadowRefresh (multi-spawn loops)
    // keepTemplate?: true       — opt out of the default template hide at spawn start
  });
  // handle.rootEntity — new instance root
  // handle.entities — every entity in the spawned subtree
  // handle.guidMap — templateGuid → runtimeGuid
  // handle.cameras — cameras built for the instance (never auto-activated)
}

// After a multi-spawn loop that used deferShadowRefresh on each call:
this.spawner.FlushSpawnShadowRefresh();
```

**`PrefabSpawner` surface** (behaviors only — app code uses matching methods on `Level`):

```ts
await spawner.Spawn(templateEntityOrGuid, options?): Promise<SpawnHandle>
spawner.FlushSpawnShadowRefresh(): void   // after batched spawns with deferShadowRefresh
await spawner.HideTemplate(templateEntityOrGuid): Promise<void>
```

**From app code:** `await level.Spawn(templateEntityOrGuid, options)` — same
pipeline. `level.FlushSpawnShadowRefresh()` and `level.HideTemplate(...)` match
the behavior surface. `Spawn` is async (asset-backed AUDIO/GUI/PARTICLE settle before
`OnStart` runs on the new behaviors).

**Do not** `node.clone()` and copy attachment rows — that skips physics rebuild,
script injection, and GUID remapping (wheel constraints and `@exposed` entity
refs would still point at the template).

**`SpawnOptions` parenting:**

| `parent` | Clone parent | `position` / `rotationQuaternion` space |
|---|---|---|
| omitted | template root's parent (default) | local to that parent |
| `Entity` | that entity's node | local to that entity |
| `null` | scene root (none) | **world** space |

Use `parent: null` when instances should stay fixed in the world after spawn
(e.g. fish scattered from a moving spawner volume — see `animalSpawner.ts`).
Use the default or an explicit `Entity` when clones should live under a rig or
folder empty.

**Spawn transform (position / rotation / scaling):** the pipeline applies all
three on the hidden clone **before** meshes are revealed
(`loader/prefabSpawn/clone.ts` → `ApplySpawnTransform`). Pass the final root transform in
`SpawnOptions` so nothing flashes at the template pose or scale while
components, assets, and `OnStart` run. Do not spawn at full scale and patch
transform afterward.

For grow-in spawns, pass zero scale up front and animate afterward:

```ts
const targetScale = template.node.scaling.clone();

const handle = await this.spawner.Spawn(template, {
  position: worldPosition,
  rotationQuaternion: this.ComputeYaw(),
  parent: null,
  scaling: Vector3.Zero(),
});
// lerp handle.rootEntity.node.scaling from zero → targetScale in OnUpdate
```

See `animalSpawner.ts` for the full grow/shrink pool pattern.

**Template hygiene:** `Spawn` **hides the template by default when the call
starts** (before the clone is built) — meshes/lights/cameras hidden and live
components torn down (physics, scripts, audio, constraints, …) so only clones
stay active. Pass `keepTemplate: true` to leave the source visible. For
deferred spawners (spawn begins later than `OnStart`), mark the template field
with `@exposed({ spawnTemplate: true })` so referenced templates hide at level
load instead. Omit `spawnTemplate` when the template must stay visible until
spawn (e.g. `populateprefabs.ts` with “Keep original prefabs”). `HideTemplate`
hides a template without spawning. Templates hidden in Blender (viewport eye
icon → `visible: false`) keep their export visibility. Spawn rebuilds from
retained `EntityData` after hide. Types that cannot be runtime-removed (CAMERA,
LOD, REFLECTION_PROBE) stay attached — the visual hide covers cameras.
REFLECTION_PROBE on a template is skipped at spawn with a console warning.
LOD components spawn correctly —
keep LOD target meshes **inside** the template hierarchy so each instance gets
its own cloned LOD meshes (a target outside the subtree is shared with the
template and Babylon rejects reusing it as an LOD level).

**Animation on spawn:** when the template entity has `animation` in the manifest
(`autoPlay`, `clip`, `loop`, `speed` — Animation panel / Action clip names on the
Blender object), each spawned instance gets **its own** skeleton (glTF skins often
share one rig at load time) and **cloned, retargeted** `AnimationGroup`s. Clips
start from frame 0 on an independent timeline — not synced to the template's
current pose or phase. Prefer **ANIMATOR** on spawned characters when you need an
FSM; keep Animation autoplay off if Animator owns playback. Load-time
`ApplyAutoPlayAnimations` runs on the template at load; hide the template when
you only want clones visible/animating.

**Shadows carry over:** spawned meshes register on the level's existing shadow
generators as casters and receivers, honoring Blender ray-visibility Shadow
(`bjs_cast_shadows` survives the clone — a receive-only template spawns
receive-only instances). Frozen shadow maps re-render once when casters are
registered (or once after a batched flush — see below).

**Batched shadow registration:** multi-spawn loops (paint-scatter, point lists)
should pass `deferShadowRefresh: true` on each `Spawn`, then call
`this.spawner.FlushSpawnShadowRefresh()` once after the loop. That registers every
queued mesh on all generators in one pass and triggers a single
`RefreshShadows()`. **Do not** defer when spawns are spread over time (interval
spawners) — each instance should register immediately so shadows stay correct
while earlier instances are already in the world.

```ts
for (const point of this.points)
{
  await this.spawner.Spawn(this.prefab, {
    position: point.clone(),
    deferShadowRefresh: true,
  });
}
this.spawner.FlushSpawnShadowRefresh();
```

**Cameras spawn too:** a camera entity in the template (with or without a
typed CAMERA component — ARC / FOLLOW / OFFSET / UNIVERSAL / GEOSPATIAL) is
rebuilt per instance, with target refs remapped so each instance's camera
follows **its own** entities. Spawned cameras are **never made active** — a
scatter spawn must not steal the view. Activate one explicitly:

```ts
const handle = await this.spawner.Spawn(this.playerPrefab, { position });
if (handle.cameras.length > 0)
{
  this.scene.activeCamera = handle.cameras[0];
}
```

**Blender:** every ENTITY exposed-var picker has a link button that runs
`bjs.link_prefab` — pick a `.blend` collection, auto library-override, assign
the root to the field. See `docs/blender/PREFABS.html`.

**Paint-scatter (`populateprefabs.ts`):** spawn on a mesh Color Attribute
instead of a point list.

1. Fill **Prefabs** with one or more templates — each spawn picks one at random.
2. Vertex-paint bright values where instances should appear (dark = empty).
3. Leave **Vertex color kind** blank so the behavior **auto-picks** the most
   varied `COLOR_n` set. Blender often invents an all-white `COLOR_0` (so
   materials stay untinted) and puts real paint in `COLOR_1` when “Export all
   vertex colors” is on — stock Babylon only loads `COLOR_0`; LevelLoader
   registers `bjs_extra_vertex_colors` so `getVerticesData("COLOR_1")` works.
4. Use **Paint luminance threshold** (~`0.5`) — soft strokes are rarely pure
   white (`RGB >= 0.99` will miss them or, on fake `COLOR_0`, select everything).
5. Do **not** pass Blender attribute names like `"Color.001"` as the kind —
   those are not glTF buffer names.

MCP: `get_fragment(name="spawn-prefab-instance")` ·
`get_fragment(name="paint-scatter-vertex-colors")` ·
`get_recipe_template(recipe="scatter-prefab-spawner")` ·
`get_playbook(name="spawn-prefab-instances")`.

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
| Coordinate axes (Blender local vs Babylon world) | `get_scripting_context(section="coordinate-axes")` · `docs/engine/15-AXIS-CONVERSION.html` |
| Engine doc index (choose your path) | `docs/engine/00-INDEX.html` |
| Full scripting chapter | `docs/engine/05-SCRIPTING.html` |
| Physics (bodies, triggers, constraints) | `docs/engine/06-PHYSICS.html` · `get_physics_movement` |
| Load order / when `OnStart` and `OnPostReady` run / visibility | `docs/engine/04-LOAD-PIPELINE.html` |
| Cameras (component types, Geospatial) | `docs/engine/07-RENDERING.html` |
| Scene look / atmosphere / post-processing | `docs/engine/07-RENDERING.html` · `get_scripting_context(section="scene-look")` |
| Runtime lights / clustering / IBL compensation | `get_scripting_context(section="lights")` · `docs/engine/07-RENDERING.html` |
| Node materials (NME) | `docs/engine/trace-materials.html` · `get_scripting_context(section="detail-maps")` |
| Detail maps (glTF PBR) | `get_scripting_context(section="detail-maps")` · `docs/engine/07-RENDERING.html` |
| Audio, animation, ANIMATOR FSM, skinned-mesh rule | `docs/engine/08-AUDIO-ANIMATION.html` |
| 2D GUI, particles, 3D GUI, MSDF | `docs/engine/11-UI.html` |
| Hot-reload GUI/particle/material JSON (no re-export) | `get_scripting_context(section="sidecar-assets")` · `get_doc_chapter(chapter="control-panel/01-control-panel")` |
| Example behaviors | `list_behaviors` · `get_behavior` · `find_similar_behavior` |
| Code style | `docs/STYLE_GUIDE.md` · `get_style_guide` |
| Prefabs + `this.spawner.Spawn` / `level.Spawn` | `get_scripting_context(section="prefab-spawn")` · `docs/blender/PREFABS.html` |
| Level restart / load / unload (`this.session`, `LevelDirector`) | `get_scripting_context(section="level-session")` · `docs/engine/14-API-GUIDE.html` |
