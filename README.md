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
  for overlap-only volumes. When the object is selected, *Show Preview* draws the
  collider as a cyan wireframe in the viewport. Manual *Size* / *Center Offset* / *Rotation*
  are authored in Blender axes (what the preview shows) and converted to Babylon
  Y-up on export; capsule/cylinder run along Blender's up (Z) axis. Convex/mesh
  use the mesh itself, so they have no separate wireframe. *Fit to Bounds*
  snapshots the mesh bounding box into the manual fields so you can start from an
  accurate shape and tweak it with the preview.
- **Rigid Body** – Dynamic / Static / Kinematic, plus mass, friction, bounce,
  damping. Combine with a Collider on the same object; the collider supplies the
  shape and the rigid body supplies the dynamics.
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

```bash
cd babylon_runtime
npm install
# put your exported files where main.ts expects them:
mkdir -p public/levels && cp /path/to/level.glb /path/to/level.scene.json public/levels/
npm run dev
```

Open the dev URL. `src/main.ts` boots an engine, enables Havok physics,
registers the example behaviors, and loads `/levels/level.scene.json`.

> Physics uses Babylon's **V2 / Havok** API. The `@babylonjs/havok` package
> ships a `.wasm` that must be served — the included `vite.config.ts` handles
> this by excluding it from dep pre-bundling.

To **see the colliders** in the running scene, press **C** (toggles Babylon's
physics debug wireframes), or call `level.ShowColliders(true)` yourself. You can
also have them on from the start: `loader.Load(url)` with the loader constructed
as `new LevelLoader(scene, registry, { debugColliders: true })`.

## Creating a new project

`babylon_runtime/` doubles as a template. To spin up a fresh runtime under a new
name, from inside `babylon_runtime/`:

```bash
npm run create -- --name "My Game"
```

This copies the engine, behaviors, and config into a sibling folder
(`../my-game` by default), rewrites the package name and browser-tab title, and
skips generated files (`node_modules`, `dist`, exported levels, the scaffolder
itself). Useful flags: `--dir <path>` (target location), `--title <text>`,
`--level <name>` (point `main.ts` at `/levels/<name>.scene.json`), `--install`
(run `npm install` for you), `--force` (allow a non-empty target). Then `cd` in,
`npm install`, and `npm run dev`.

Note: this is a *template copy*, so each project gets its own frozen copy of
`src/engine/` — engine fixes don't propagate automatically. Packaging the engine
as a shared dependency is the planned next step.

### Behaviors (scripts)

Put one behavior class per file in `src/behaviors/`, named after the class and
default-exported. Mark editable fields with `@exposed`:

```ts
// src/behaviors/Rotator.ts
import { Behavior, exposed } from "../engine";

export default class Rotator extends Behavior
{
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" }) speed = 45;
  @exposed() axis: [number, number, number] = [0, 1, 0];

  OnUpdate(deltaSeconds: number): void { /* uses this.speed, this.axis */ }
}
```

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
5. **`LevelLoader.ts`** – handle the new `type` in `ApplyComponents`.

Adding a new *behavior* (the common case) needs only the runtime: subclass
`Behavior`, register it (`registry.RegisterScripts({ MyThing })`), and reference
it from a Script component in Blender.

## Lights

Lights need **no component** — any Blender light object is picked up
automatically. The Blender lamp *is* the light: edit its color, energy, spot
cone, and range in Blender (the Babylon tab also surfaces these for
convenience), and on export the plugin reads the native lamp datablock into the
manifest. The glb already places the light with the correct converted
transform, so at load the runtime copies the Blender properties onto that light
— position and aim included. Move or recolor the lamp in Blender, re-export, and
Babylon follows.

Mapping: `POINT → PointLight`, `SUN → DirectionalLight`, `SPOT → SpotLight`.
Area lights aren't part of glTF and don't transfer (the panel warns you).
Intensity is approximate by nature — `SUN_SCALE` and `PUNCTUAL_SCALE` in
`src/engine/subsystems/lights.ts` are the two knobs to tune if a scene reads too bright or dim.
Color transfers exactly.

**Shadows** follow the lamp's **Cast Shadows** toggle (Blender's `use_shadow`).
When it's on, the Babylon tab reveals a **Shadow** subsection with per-light
controls — filter (PCF / PCSS contact-hardening / Poisson / Blur ESM / hard),
map size, bias, normal bias, darkness, and frustum clip start/end. These are
Babylon shadow concepts (they don't map onto Blender's renderer-specific shadow
settings), so they're authored here and serialized per light. On load, each
shadow-casting light gets a `ShadowGenerator` configured from those values, and
all geometry casts and receives by default. PointLight, Sun (Directional) and
Spot can cast; anything else is skipped with a warning. Generators are exposed as
`level.shadowGenerators`. A clip start/end of `0` means "let Babylon auto-fit the
frustum", and a map size of `0` falls back to the loader default. To set the
default resolution or disable the whole pass:
`new LevelLoader(scene, registry, { shadows: false })` or `{ shadowMapSize: 2048 }`.

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
or, if none, a point ahead of where Blender framed the camera; with optional zoom
limits), or **Follow** (tracks a target object you pick). All build from the
faithful camera's world transform, so they begin where Blender framed them: Arc
starts at the exported position (its offset from the orbit target defines the
starting angle/distance). Follow has two modes: **Fixed Offset** (default) keeps
the camera at a constant world-space offset from the target — exactly where it
sits in Blender — translating with the target and always looking at it; **Orbit**
uses Babylon's FollowCamera, whose offset rotates with the target's facing (with
**Use Blender Position** to derive distance/height/angle from the exported camera,
or set them by hand). When controls are attached, the keyboard-driven types
(Free/Universal/Arc) take a **key scheme** — Arrow keys, WASD, both, or a custom
up/down/left/right assignment.

## Scene settings (environment, fog, post-processing)

The **Properties → Scene → Babylon Scene** panel holds scene-wide render
settings, serialized into a top-level `scene` block in the manifest and applied
at load:

- **Clear / ambient color** — `scene.clearColor` / `ambientColor`.
- **Environment** — if the World has an environment-texture node, it's copied
  next to the export (into `env/`) and used for image-based lighting, with an
  optional skybox. `.env` (Babylon's prefiltered cube) is recommended; `.hdr`
  works; `.exr` can't load in-browser, so export `.env`. Intensity and Y-rotation
  are read from the World's Background/Mapping nodes.
- **Fog** — linear/exp/exp² with color and range/density.
- **Post-processing** — Babylon's `DefaultRenderingPipeline` (FXAA, bloom, tone
  mapping/exposure/contrast). SSAO is wired as a *separate* `SSAO2RenderingPipeline`
  (it isn't part of the default pipeline). These attach to the active camera, so
  the scene needs one. Handles are exposed on `level.post`.

## Animation (NLA clips)

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
- Materials beyond what glTF/PBR covers (custom shaders) aren't handled.
- If `node.metadata` comes back empty, confirm the `ExtrasAsMetadata` import
  wasn't tree-shaken out and that the glb was exported with Custom Properties
  enabled — the loader will have silently used the name fallback.

## Layout

```
blender_addon/      # the Blender plugin (a Python package)
  __init__.py       # manifest-based registration
  properties.py     # component data model (PropertyGroups) + exposed-var storage
  operators.py      # add/remove components, script picker, export operator
  ui.py             # the Babylon N-panel
  export.py         # glb + JSON manifest writer
  script_parse.py   # reads @exposed decorators from .ts files
babylon_runtime/    # the Babylon.js side (TypeScript + Vite)
  index.html        # entry -> src/main.ts
  src/
    main.ts           # app bootstrap (engine + your scene wiring)
    behaviors/        # YOUR scripts, one behavior per file (Rotator, LookAt…)
    engine/           # the reusable engine library
      index.ts          # barrel — always import the engine via "../engine"
      core/             # schema + runtime container + load pipeline
        types.ts          #   manifest schema + Entity + ID_KEY
        Level.ts          #   runtime container: entities, update loop, debug view
        LevelLoader.ts    #   loads glb + manifest, builds the ECS, runs the loop
      scripting/        # the behavior system
        Behavior.ts       #   scriptable behavior base class
        exposed.ts        #   @exposed decorator + value application
        BehaviorRegistry.ts  #  maps SCRIPT names -> Behavior classes
      subsystems/       # one module per manifest concern the glb can't express
        physics.ts lights.ts cameras.ts shadows.ts
        environment.ts fog.ts postprocess.ts animation.ts

Docs:
  README.md                  # this file — overview, authoring, engine reference
  STYLE_GUIDE.md             # C#-style coding conventions for engine + behaviors
  LLM_SCRIPTING_CONTEXT.md   # short context for an LLM generating a behavior file
```


---

# Engine reference (runtime internals)

*This section is for working on the engine itself or understanding load-time behavior. To just write a behavior script, see `LLM_SCRIPTING_CONTEXT.md`; for coding conventions, `STYLE_GUIDE.md`.*

### The load pipeline


`LevelLoader.Load(manifestUrl)` is the heart of the engine. It runs these steps
in order (each step below is an extracted private method of `LevelLoader`):

1. **Fetch + validate the manifest.** Clear errors if the file 404s or the dev
   server returned `index.html` (HTML instead of JSON) — the two most common
   "it doesn't load" mistakes.
2. **Append the glb** with `appendSceneAsync(base + manifest.glb, scene)`. The glb
   path is resolved relative to the manifest. This creates all meshes, transform
   nodes, materials, lights, and cameras in the scene. (Babylon 9 note: the old
   `SceneLoader.AppendAsync` statics are deprecated — use `appendSceneAsync`.)
   **The scene is switched to `useRightHandedSystem = true` immediately before this**
   so the glb imports without the handedness-flipping `__root__` mirror — see *Subsystem: physics* below.
3. **Build the GUID index** (`BuildIdIndex`): walk every transform node and mesh,
   read `node.metadata.gltf.extras.bjs_id`, and map GUID -> node. This requires
   the `ExtrasAsMetadata` glTF loader extension, which is imported at the top of
   `core/LevelLoader.ts`; without it `node.metadata` stays empty and GUID matching
   silently fails.
4. **Iterate the manifest entities** (`ProcessEntity` per entity). For each one:
   - Resolve its glb node: **GUID first**, then a name-match fallback.
   - Create an `Entity(id, name, node)` and register it in `level.entities`.
   - Stash a back-reference: `node.metadata.bjsEntity = entity`.
   - **Apply components** (`ApplyComponents`, see section 5) — this may return deferred
     object references (`PendingRef[]`).
   - If the entity has `light`, call `ApplyBlenderLight` (`ProcessLightForEntity`);
     if it casts shadows, remember it for step 6.
   - If the entity has `camera`, call `ApplyBlenderCamera` (`ProcessCameraForEntity`);
     if it's the active one, set `scene.activeCamera` and `level.activeCamera`.
5. **Resolve object references (second pass)** via `ResolveObjectReferences`.
   Entity-typed `@exposed` fields were stored as GUIDs because the target may not
   have existed yet during step 4. Now that every entity exists, each `PendingRef`
   is resolved to its `Entity` (scalar fields assigned directly; entity-list fields
   assigned into their array slot by `index`). Camera targets (FOLLOW/ARC/offset)
   are resolved in this same post-pass via `ResolveCameraTargets` (in `subsystems/cameras.ts`).
6. **Set up shadows** (`SetupShadows`) for the collected shadow-casting lights —
   unless disabled via loader options.
7. **`level.Begin()`**: call `OnStart()` on every behavior, then subscribe a
   single `onBeforeRenderObservable` callback that drives every behavior's
   `OnUpdate(deltaSeconds)` each frame.

`EnableHavokPhysics(scene)` **must be called before `Load`** (the example
`main.ts` does this), because colliders/bodies are built during step 4.

### Runtime API


#### Entity (`core/types.ts`)

```ts
class Entity
{
  readonly id: string;          // Blender GUID
  readonly name: string;        // Blender object name
  readonly node: TransformNode; // the Babylon node from the glb
  tag = "Untagged";             // from a TAG component
  behaviors: Behavior[];
  body?: PhysicsBody;           // present if it has a Collider/RigidBody
  GetBehavior<T extends Behavior>(behaviorConstructor: new () => T): T | undefined;
  GetAnimation(clipName: string): AnimationGroup | undefined;
}
```

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
> they're treated as variables. Only methods are PascalCase. See STYLE_GUIDE.md.

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


```json
{
  "version": 3,
  "glb": "level.glb",
  "scene": {
    "clearColor": [0,0,0,1], "ambientColor": [0,0,0],
    "environment": { "file": "env/sky.env", "intensity": 1, "rotationY": 0, "createSkybox": true },
    "fog": { "mode": "EXP2", "color": [0.5,0.6,0.7], "density": 0.01, "start": 10, "end": 100 },
    "postProcessing": { "defaultPipeline": true, "fxaa": true,
      "bloom": { "enabled": false, "threshold": 0.9, "intensity": 0.5 },
      "ssao": false, "toneMapping": true, "exposure": 1, "contrast": 1 }
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
          "rotation": [0,0,0,1] },
        { "type": "RIGIDBODY", "bodyType": "DYNAMIC", "mass": 1, "friction": 0.5,
          "restitution": 0.2, "linearDamping": 0, "angularDamping": 0 },
        { "type": "SCRIPT", "script": "Spinner", "path": "...",
          "vars": { "speed": 120, "axis": [0,1,0] } },
        { "type": "CAMERA", "cameraType": "ARC", "attachControl": true,
          "keys": { "scheme": "ARROWS", "up": "W", "down": "S", "left": "A", "right": "D" },
          "useBlenderTransform": true, "followMode": "OFFSET", "radius": 10, "lowerRadius": 0, "upperRadius": 0,
          "target": null, "distance": 10, "height": 4, "rotationOffset": 0 }
      ],
      "light":  { "type": "SUN", "color": [1,1,1], "energy": 1, "castShadows": true,
                  "shadow": { "filter": "PCF", "mapSize": 0, "bias": 0.00005,
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
  dynamic.
- **The Blender camera is fixed by default** (no controls). The fallback
  `ArcRotateCamera` uses arrow keys, leaving WASD free for behaviors; a manually
  attached `FreeCamera` would fight WASD.
- **Light intensity is approximate**; tune `SUN_SCALE`/`PUNCTUAL_SCALE` in
  `subsystems/lights.ts`. Color is exact.
- **Keep glb + manifest filenames matching** what `main.ts` fetches; they must sit
  together under `public/levels/`.

### Code conventions

Engine code and behaviors follow a C#-inspired TypeScript style (PascalCase methods, Allman braces, descriptive names, explicit null handling, with the `@exposed` decorator kept lowercase and Babylon `Nullable<T>` values using truthiness checks). Full rules live in **`STYLE_GUIDE.md`**.
