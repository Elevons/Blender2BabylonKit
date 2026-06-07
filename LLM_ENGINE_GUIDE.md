# Babylon Level Kit — Engine Guide

**Babylon Level Kit** lets you author a level in **Blender** and reconstruct it at
runtime with a small **Babylon.js 9** TypeScript engine. Blender is the editor;
the engine is the player. This document explains how the engine is structured,
how a level loads, and how to extend it — in enough detail to work on the engine
itself, not just write scripts against it.

Stack: Blender 5.x (4.2+) extension · Babylon.js 9.x · Havok Physics **V2** ·
Vite + TypeScript (`experimentalDecorators` enabled).

---

## 1. The core idea: two artifacts

Exporting a Blender scene produces **two files**:

| File | Carries | Built by |
|------|---------|----------|
| `level.glb` | geometry, transforms, hierarchy, materials, and the existence + placement of lights and cameras | Babylon's glTF importer |
| `level.scene.json` | the "ECS" data glTF can't express: components, tags, physics, script bindings + their values, and per-light/-camera settings | our `LevelLoader` |

The division is deliberate and is the key to understanding the whole engine:

> **If glTF can already express it, the glb owns it and the engine writes no code
> for it. If it can't, it goes in the manifest and a small engine module applies
> it.**

This is why there is a `subsystems/physics.ts`, `lights.ts`, `cameras.ts`, and
`shadows.ts` but no `meshes.ts` or `transforms.ts`: meshes and transforms ride entirely inside
the glb, so there is nothing for the engine to do. The manifest never duplicates
what the glb holds — it only adds. Entities in the two files are matched back
together by a **GUID** (see §6).

---

## 2. Project layout

```
babylon_runtime/
  index.html              # entry -> /src/main.ts
  src/
    main.ts               # app bootstrap: engine, physics, load a level, render loop
    behaviors/            # YOUR scripts — one Behavior subclass per file
    engine/               # the library
      index.ts            #   public barrel — always import from "../engine"
      core/               #   schema + runtime container + load pipeline
        types.ts          #     manifest schema + Entity class + ID_KEY
        Level.ts          #     runtime container: entities, update loop, debug view
        LevelLoader.ts    #     orchestrates the whole load pipeline
      scripting/          #   the gameplay-script system
        Behavior.ts       #     base class for scripts
        exposed.ts        #     @exposed decorator + value application
        BehaviorRegistry.ts #  maps SCRIPT-component names -> Behavior classes
      subsystems/         #   one module per manifest concern the glb can't express
        physics.ts        #     COLLIDER/RIGIDBODY -> Havok V2 body
        lights.ts         #     Blender lamp props  -> Babylon light
        cameras.ts        #     Blender camera props -> Babylon camera
        shadows.ts        #     shadow-casting lights -> ShadowGenerators
        environment.ts    #     World env texture -> IBL + skybox
        fog.ts            #     scene fog
        postprocess.ts    #     DefaultRenderingPipeline + SSAO
        animation.ts      #     NLA clips -> AnimationGroups + autoplay
blender_addon/            # the Blender plugin (Python) — the editor half
```

Folders, not flat: **core/** is the schema, the runtime `Level`, and the loader
that ties everything together; **scripting/** is the generic behavior system; and
**subsystems/** holds the "manifest applier" modules. Imports never reach across
folders by hand outside the engine — everything external imports the barrel
(`import { … } from "../engine"`), so the internal layout can change freely.

### When does a concern get its own subsystem module?

A new file in `engine/subsystems/` is justified only when a Babylon **subsystem**
needs real translation work from Blender data. The current set all do:

- **physics.ts** — colliders and rigid bodies have no glTF representation, so they
  are rebuilt entirely from the manifest.
- **lights.ts** — the glb creates the light and places it, but Blender's
  intensity (watts), exact color, and spot cone need copying onto it.
- **cameras.ts** — the glb creates and places the camera, but clip range, FOV/ortho
  mode, and *which camera is active* need applying.
- **shadows.ts** — shadows are a pure-Babylon construct assembled from per-light
  settings; nothing in the glb expresses them.

Everything else is handled without a per-type module:
geometry/transforms/materials (the glb), tags (one field on `Entity`, set inline
in the loader), and arbitrary gameplay logic (the generic
registry + `Behavior` + `@exposed` system). Adding, say, a `materials.ts` would
only make sense if we started overriding Blender materials at runtime.

---

## 3. The load pipeline

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
   so the glb imports without the handedness-flipping `__root__` mirror — see §7.
3. **Build the GUID index** (`BuildIdIndex`): walk every transform node and mesh,
   read `node.metadata.gltf.extras.bjs_id`, and map GUID -> node. This requires
   the `ExtrasAsMetadata` glTF loader extension, which is imported at the top of
   `core/LevelLoader.ts`; without it `node.metadata` stays empty and GUID matching
   silently fails.
4. **Iterate the manifest entities** (`ProcessEntity` per entity). For each one:
   - Resolve its glb node: **GUID first**, then a name-match fallback.
   - Create an `Entity(id, name, node)` and register it in `level.entities`.
   - Stash a back-reference: `node.metadata.bjsEntity = entity`.
   - **Apply components** (`ApplyComponents`, see §5) — this may return deferred
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

---

## 4. Runtime API

### Entity (`core/types.ts`)

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

### Level (`core/Level.ts`)

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

### Behavior (`scripting/Behavior.ts`)

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

---

## 5. Components & behaviors

Components are authored by a human in Blender's "Babylon" N-panel and serialized
into each entity's `components` array. The loader's `ApplyComponents` interprets
them:

- **TAG** -> sets `entity.tag`. Query with `level.ByTag("Enemy")`.
- **COLLIDER** and/or **RIGIDBODY** -> combined into one Havok body on the node by
  `BuildPhysics` (see §7) and stored as `entity.body`.
- **SCRIPT** -> looked up in the `BehaviorRegistry` by name, instantiated, has its
  `entity`/`scene` injected and its `@exposed` values applied, then is pushed to
  `entity.behaviors`.

### The registry and auto-registration

`BehaviorRegistry` maps a SCRIPT name (the string stored in Blender) to a
`Behavior` subclass. Rather than register by hand, `main.ts` uses Vite's
`import.meta.glob` + `AutoRegisterBehaviors` to register every file in
`behaviors/` **by filename stem**. So `behaviors/Spinner.ts` becomes the key
`"Spinner"`, which is exactly what the Blender "Open Script…" picker stores. This
is the contract that ties the two halves together:

> **One behavior class per file, file named after the class, exported as
> `export default`.** Break this and the Blender picker's name won't resolve.

### Writing a behavior

```ts
// src/behaviors/Spinner.ts
import { Behavior, exposed } from "../engine";   // always the barrel
import { Vector3, Space } from "@babylonjs/core";

export default class Spinner extends Behavior
{
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" }) speed = 90;
  @exposed() axis: [number, number, number] = [0, 1, 0];

  private radiansPerSecond = 0;
  private rotationAxis = new Vector3(0, 1, 0);

  OnStart(): void
  {
    this.radiansPerSecond = (this.speed * Math.PI) / 180; // exposed values already applied
    this.rotationAxis = Vector3.FromArray(this.axis);
  }

  OnUpdate(deltaSeconds: number): void
  {
    this.node.rotate(this.rotationAxis, this.radiansPerSecond * deltaSeconds, Space.WORLD);
  }
}
```

`rotate`/`translate` default to **local** space; pass `Space.WORLD` for world
space.

---

## 6. Entity identity (GUIDs)

Every addressable Blender object gets a GUID stored in a custom property
(`bjs_id`). On export it is written into the glTF node's `extras`, and the Blender
manifest references the same GUID. At load, GUIDs surface at
`node.metadata.gltf.extras.bjs_id` (via the `ExtrasAsMetadata` extension) and the
loader matches manifest entity -> glb node by GUID, falling back to name only for
older exports without one.

GUIDs are assigned **before** the glb is written, for any object that needs to be
findable: anything with components, any light, any camera, any object referenced
by an `entity` field, and any object you explicitly mark with the "Assign GUID"
button. A GUID is what makes an object an "entity" — i.e. present in the manifest
and reachable via `level.ById` / `level.ByTag`. Pure geometry with no GUID just
lives in the glb and isn't an entity.

---

## 7. Subsystem: physics (`subsystems/physics.ts`)

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

---

## 8. Subsystem: lights (`subsystems/lights.ts`)

Lights are **automatic** — no component. The glb creates and places the light;
`ApplyBlenderLight` copies the Blender lamp's properties onto it. Because Blender
inserts an orientation-correction node between the object node and the light when
exporting to +Y-up, the GUID'd node is an *ancestor* (often grandparent) of the
light, so `FindLightForNode` walks the entire parent chain rather than assuming a
fixed depth.

Mapping: POINT->Point, SUN->Directional, SPOT->Spot (AREA is unsupported by glTF).
Color (diffuse + specular) is exact; intensity is approximate because Blender
watts don't map cleanly to real-time intensity — the two scale constants
`SUN_SCALE` and `PUNCTUAL_SCALE` at the top of the file are the single place to
tune that. Spot cone angle and blend are copied too. Position/direction are left
to the glb, so moving a lamp in Blender and re-exporting "just works." There is no
fallback light: a dark scene means add a light in Blender.

---

## 9. Subsystem: cameras (`subsystems/cameras.ts`)

Cameras are automatic too, and mirror the lights design. The glb creates a
`FreeCamera`, placing it correctly (its transform lives on the parent node chain,
which is why `FindCameraForNode` walks parents like the light finder).
`ApplyBlenderCamera` then copies clip range (`minZ`/`maxZ`), and either the
vertical FOV (perspective) or orthographic mode. The exporter flags which camera
is the Blender scene's active one; the loader sets that as `scene.activeCamera`
and exposes it as `level.activeCamera`.

The camera is **not** given fly controls by default — it stays exactly where
Blender framed it (faithful playback). To make it navigable for inspection,
`level.activeCamera?.attachControl(canvas, true)`. `main.ts` only creates a
fallback `ArcRotateCamera` when the scene shipped no camera at all. Orthographic
bounds come from the glb's `xmag`/`ymag`, so the engine sets the mode but doesn't
recompute the rectangle from Blender's `ortho_scale`.

A **CAMERA component** (opt-in) overrides the type: FREE/UNIVERSAL/ARC/FOLLOW. `BuildTypedCamera` (subsystems/cameras.ts) builds it from the faithful camera's world transform and disposes the original. ARC and FOLLOW can reference a target object (the `target` GUID): FOLLOW sets it as `lockedTarget`, ARC re-pivots its orbit onto it — both resolved in the second pass like entity references. When controls are attached, FREE/UNIVERSAL/ARC apply a key scheme (`ApplyCameraKeys`). FOLLOW has two modes: `ORBIT` (Babylon FollowCamera; with `useBlenderTransform` it derives radius/height/rotationOffset from the exported position via `DeriveFollowFromPosition`, and its pointer-input multi-axis warning is silenced) and `OFFSET` (a UniversalCamera the loader drives each frame via `Level.AddUpdater` to hold a constant world offset from the target — the offset is the exported camera position minus the target). ARC likewise starts from the exported position: `setPosition(eye)` after `setTarget` makes the camera's offset from the pivot define alpha/beta/radius.

---

## 10. Subsystem: shadows (`subsystems/shadows.ts`)

Driven by each lamp's **Cast Shadows** toggle (`use_shadow`). When on, the light
carries a `shadow` settings object in the manifest, and `SetupShadows` builds one
`ShadowGenerator` per shadow-casting light, then registers **all** scene geometry
as both caster and receiver (a global "shadows on" default). Per-light settings
applied: `filter` (PCF / PCSS contact-hardening / Poisson / Blur ESM / hard),
`bias`, `normalBias`, `darkness`, per-light `mapSize`, and the frustum clip planes
(`minZ`/`maxZ`, which are set on the *light* as `shadowMinZ`/`shadowMaxZ`; `0`
means let Babylon auto-fit). Only Directional/Spot/Point can cast — others are
skipped with a warning. Loader options `{ shadows?: boolean; shadowMapSize?: number }`
set the global on/off and default resolution. Generators are exposed as
`level.shadowGenerators` for further tuning.

---

## 11. Exposed variables (`scripting/exposed.ts`)

`@exposed` marks a behavior field as editable per-object in Blender. The decorator
only records the field's name + UI hints in a registry (a `WeakMap` keyed by the
class); it never changes how the field behaves in code. At load,
`ApplyExposedVars` writes the human's stored value onto the instance **before
`OnStart`**, falling back to the code default when the manifest has no value.

```ts
@exposed() speed = 90;                                   // number  -> float
@exposed() enabled = true;                               // boolean -> checkbox
@exposed() title = "hi";                                 // string
@exposed() dir: [number, number, number] = [0, 1, 0];    // 3-array -> vector3
@exposed({ type: "color" }) tint = new Color3(1, 0, 0);  // color picker
@exposed({ type: "entity" }) target: Entity | null = null; // object picker
@exposed({ type: "enum", options: ["a","b"] }) mode = "a"; // dropdown -> string
@exposed({ type: "list", of: "float" }) speeds = [1, 2];   // add/remove list
```

Options: `{ min?, max?, step?, label?, type?, options?, of? }`.
`type` ∈ `color | vector3 | float | int | bool | string | entity | enum | list`.
`options` are an enum's choices; `of` is a list's element type
(`float | int | string | bool | vector3 | color | entity`).

How each value arrives at runtime:

- **scalars** (float/int/bool/string/enum) — assigned as-is; an enum is just its
  selected string.
- **vector3/color** — a 3-number array is coerced to `Vector3`/`Color3` when the
  field's default is one of those.
- **entity** — stored as a GUID, resolved to the referenced `Entity` (or `null`)
  in the loader's second pass.
- **list** — an array; `vector3`/`color` elements are coerced per-element, and
  `entity` elements resolve into their array slots in the second pass (empty picks
  stay `null`, hence type these `(Entity | null)[]`).

**Critical constraint:** Blender can't run TypeScript, so it **parses the
decorators out of the `.ts` source**. Keep declarations parseable — a one-line
literal default (`= 45` / `= true` / `= "x"` / `= [a,b,c]` / `= null`). Computed
or multi-line defaults won't be read by Blender (the field still uses its code
default at runtime). Entity references need the explicit `type:"entity"` hint, and
entity lists always start empty (you pick objects in Blender). After changing
which fields a script exposes, hit the **Sync** button in Blender to re-read them.

---

## 12. Manifest schema (reference)

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

---

## 13. Gotchas

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

---

## 14. Running

```
cd babylon_runtime && npm install
mkdir -p public/levels
cp /path/level.glb /path/level.scene.json public/levels/
npm run dev
```

`main.ts` enables Havok, auto-registers every behavior in `behaviors/`, loads
`/levels/<name>.scene.json`, sets up the camera (Blender's or a fallback), and
starts the render loop.

**Collider authoring space.** Manual collider `center`/`size` are authored in Blender axes and converted to Babylon Y-up in `export._serialize_components` (`center (x,y,z)->(x,z,-y)`, `size` swaps y/z, `rotation` is a quaternion with vector part (x,z,-y) and w kept). Rotation applies to manual box/capsule/cylinder shapes (sphere is symmetric). The runtime (`subsystems/physics.ts`) still receives Y-up values unchanged. `blender_addon/collider_preview.py` draws the wireframe in Blender space via a `SpaceView3D` POST_VIEW GPU handler, so the viewport preview matches the exported body.

**Multi-material meshes.** A Blender mesh with multiple materials exports as a glTF mesh with one primitive per material; Babylon's loader imports that as a `TransformNode` with one child `Mesh` per material — so the entity's GUID node is a `TransformNode`, not a mesh. This is why §7 special-cases wrapper nodes (and why `PhysicsAggregate`, which calls `getTotalVertices` on the node, can't size a primitive from one).

**Collider debug view.** `Level.ShowColliders(show?)` toggles Babylon's `PhysicsViewer` over every entity body (no arg = flip). `LevelLoaderOptions.debugColliders` shows them on load; the runtime template binds **C** to the toggle. The viewer is disposed with the level.

---

## 15. Code conventions

The engine and behaviors follow a C#-inspired TypeScript style — PascalCase
methods/functions, Allman braces, descriptive names, explicit null handling, and a
few project-specific exceptions (the `@exposed` decorator stays lowercase; Babylon
`Nullable<T>` values use truthiness checks).

The full rules live in **`STYLE_GUIDE.md`** at the repo root. Read it before
editing engine code or writing a behavior.
