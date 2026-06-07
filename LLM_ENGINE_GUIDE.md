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

This is why there is a `physics.ts`, `lights.ts`, `cameras.ts`, and `shadows.ts`
but no `meshes.ts` or `transforms.ts`: meshes and transforms ride entirely inside
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
      types.ts            #   manifest schema + Entity class + ID_KEY
      Behavior.ts         #   base class for scripts
      exposed.ts          #   @exposed decorator + value application
      ComponentRegistry.ts#   maps SCRIPT names -> Behavior classes
      physics.ts          #   COLLIDER/RIGIDBODY -> Havok V2 body      (subsystem)
      lights.ts           #   Blender lamp props  -> Babylon light     (subsystem)
      cameras.ts          #   Blender camera props -> Babylon camera   (subsystem)
      shadows.ts          #   shadow-casting lights -> ShadowGenerators (subsystem)
      environment.ts      #   World env texture -> IBL + skybox         (subsystem)
      fog.ts              #   scene fog                                 (subsystem)
      postprocess.ts      #   DefaultRenderingPipeline + SSAO           (subsystem)
      animation.ts        #   NLA clips -> AnimationGroups + autoplay   (subsystem)
      LevelLoader.ts      #   orchestrates the whole load + the Level object
blender_addon/            # the Blender plugin (Python) — the editor half
```

### When does a concern get its own engine module?

A new file in `engine/` is justified only when a Babylon **subsystem** needs
real translation work from Blender data. The current four all do:

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

`LevelLoader.load(manifestUrl)` is the heart of the engine. It runs these steps
in order:

1. **Fetch + validate the manifest.** Clear errors if the file 404s or the dev
   server returned `index.html` (HTML instead of JSON) — the two most common
   "it doesn't load" mistakes.
2. **Append the glb** with `appendSceneAsync(base + manifest.glb, scene)`. The glb
   path is resolved relative to the manifest. This creates all meshes, transform
   nodes, materials, lights, and cameras in the scene. (Babylon 9 note: the old
   `SceneLoader.AppendAsync` statics are deprecated — use `appendSceneAsync`.)
3. **Build the GUID index** (`buildIdIndex`): walk every transform node and mesh,
   read `node.metadata.gltf.extras.bjs_id`, and map GUID -> node. This requires
   the `ExtrasAsMetadata` glTF loader extension, which is imported at the top of
   `LevelLoader.ts`; without it `node.metadata` stays empty and GUID matching
   silently fails.
4. **Iterate the manifest entities.** For each one:
   - Resolve its glb node: **GUID first**, then a name-match fallback.
   - Create an `Entity(id, name, node)` and register it in `level.entities`.
   - Stash a back-reference: `node.metadata.bjsEntity = entity`.
   - **Apply components** (`applyComponents`, see §5) — this may return deferred
     object references (`PendingRef[]`).
   - If the entity has `light`, call `applyBlenderLight`; if it casts shadows,
     remember it for step 6.
   - If the entity has `camera`, call `applyBlenderCamera`; if it's the active
     one, set `scene.activeCamera` and `level.activeCamera`.
5. **Resolve object references (second pass).** Entity-typed `@exposed` fields
   were stored as GUIDs because the target may not have existed yet during step
   4. Now that every entity exists, each `PendingRef` is resolved to its `Entity`
   (scalar fields assigned directly; entity-list fields assigned into their array
   slot by `index`).
6. **Set up shadows** (`setupShadows`) for the collected shadow-casting lights —
   unless disabled via loader options.
7. **`level._begin()`**: call `onStart()` on every behavior, then subscribe a
   single `onBeforeRenderObservable` callback that drives every behavior's
   `onUpdate(dt)` each frame (`dt` in seconds).

`enableHavokPhysics(scene)` **must be called before `load`** (the example
`main.ts` does this), because colliders/bodies are built during step 4.

---

## 4. Runtime API

### Entity (`types.ts`)

```ts
class Entity {
  readonly id: string;          // Blender GUID
  readonly name: string;        // Blender object name
  readonly node: TransformNode; // the Babylon node from the glb
  tag = "Untagged";             // from a TAG component
  behaviors: Behavior[];
  body?: PhysicsBody;           // present if it has a Collider/RigidBody
  getBehavior<T extends Behavior>(ctor: new () => T): T | undefined;
}
```

### Level (`LevelLoader.ts`)

```ts
class Level {
  entities: Map<string, Entity>;     // keyed by GUID (or name for un-GUID'd v1 data)
  activeCamera?: Camera;             // the Blender scene's active camera, if exported
  shadowGenerators: ShadowGenerator[];
  byId(id: string): Entity | undefined;
  byTag(tag: string): Entity[];
  dispose(): void;                   // stops the update loop, calls onDestroy()
}
```

Three ways to reach another object from a behavior: an `@exposed({type:"entity"})`
reference (cleanest), `node.metadata.bjsEntity` if you have a node, or `level.byId`
/ `level.byTag` if you hold the `Level`.

### Behavior (`Behavior.ts`)

```ts
abstract class Behavior {
  entity!: Entity;              // injected before onStart
  scene!: Scene;
  get node(): TransformNode;    // === entity.node
  onStart(): void;              // once, after the whole level + refs are ready
  onUpdate(dt: number): void;   // every frame; dt is SECONDS
  onDestroy(): void;            // on level dispose
}
```

---

## 5. Components & behaviors

Components are authored by a human in Blender's "Babylon" N-panel and serialized
into each entity's `components` array. The loader's `applyComponents` interprets
them:

- **TAG** -> sets `entity.tag`. Query with `level.byTag("Enemy")`.
- **COLLIDER** and/or **RIGIDBODY** -> combined into one Havok body on the node by
  `buildPhysics` (see §7) and stored as `entity.body`.
- **SCRIPT** -> looked up in the `ComponentRegistry` by name, instantiated, has its
  `entity`/`scene` injected and its `@exposed` values applied, then is pushed to
  `entity.behaviors`.

### The registry and auto-registration

`ComponentRegistry` maps a SCRIPT name (the string stored in Blender) to a
`Behavior` subclass. Rather than register by hand, `main.ts` uses Vite's
`import.meta.glob` + `autoRegisterBehaviors` to register every file in
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

export default class Spinner extends Behavior {
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" }) speed = 90;
  @exposed() axis: [number, number, number] = [0, 1, 0];

  private rad = 0;
  private _axis = new Vector3(0, 1, 0);

  onStart() {
    this.rad = (this.speed * Math.PI) / 180;   // exposed values already applied
    this._axis = Vector3.FromArray(this.axis);
  }

  onUpdate(dt: number) {
    this.node.rotate(this._axis, this.rad * dt, Space.WORLD);
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
and reachable via `level.byId` / `level.byTag`. Pure geometry with no GUID just
lives in the glb and isn't an entity.

---

## 7. Subsystem: physics (`physics.ts`)

`buildPhysics(node, collider?, body?, scene)` merges a COLLIDER and/or RIGIDBODY
into one Havok V2 `PhysicsBody`:

- **collider only** -> static (or trigger) body
- **rigidbody only** -> dynamic body with an auto-fit box collider
- **both** -> shape from the collider, dynamics from the rigidbody

Shape sizing has two paths. With **auto-fit** (the default), a `PhysicsAggregate`
sizes the shape from the mesh bounding box. With an **explicit** shape, a
`PhysicsShapeBox/Sphere/Capsule` is built from hand-authored, Babylon-space
(Y-up) dimensions. Mass applies only to DYNAMIC bodies; KINEMATIC maps to Havok's
`ANIMATED` motion type. Constraints: physics must be enabled first, and the node
must be an `AbstractMesh` (mesh colliders additionally can't be dynamic). Reach it
at `entity.body` — e.g. `entity.body?.applyImpulse(...)`.

---

## 8. Subsystem: lights (`lights.ts`)

Lights are **automatic** — no component. The glb creates and places the light;
`applyBlenderLight` copies the Blender lamp's properties onto it. Because Blender
inserts an orientation-correction node between the object node and the light when
exporting to +Y-up, the GUID'd node is an *ancestor* (often grandparent) of the
light, so `findLightForNode` walks the entire parent chain rather than assuming a
fixed depth.

Mapping: POINT->Point, SUN->Directional, SPOT->Spot (AREA is unsupported by glTF).
Color (diffuse + specular) is exact; intensity is approximate because Blender
watts don't map cleanly to real-time intensity — the two scale constants
`SUN_SCALE` and `PUNCTUAL_SCALE` at the top of the file are the single place to
tune that. Spot cone angle and blend are copied too. Position/direction are left
to the glb, so moving a lamp in Blender and re-exporting "just works." There is no
fallback light: a dark scene means add a light in Blender.

---

## 9. Subsystem: cameras (`cameras.ts`)

Cameras are automatic too, and mirror the lights design. The glb creates a
`FreeCamera`, placing it correctly (its transform lives on the parent node chain,
which is why `findCameraForNode` walks parents like the light finder).
`applyBlenderCamera` then copies clip range (`minZ`/`maxZ`), and either the
vertical FOV (perspective) or orthographic mode. The exporter flags which camera
is the Blender scene's active one; the loader sets that as `scene.activeCamera`
and exposes it as `level.activeCamera`.

The camera is **not** given fly controls by default — it stays exactly where
Blender framed it (faithful playback). To make it navigable for inspection,
`level.activeCamera?.attachControl(canvas, true)`. `main.ts` only creates a
fallback `ArcRotateCamera` when the scene shipped no camera at all. Orthographic
bounds come from the glb's `xmag`/`ymag`, so the engine sets the mode but doesn't
recompute the rectangle from Blender's `ortho_scale`.

A **CAMERA component** (opt-in) overrides the type: FREE/UNIVERSAL/ARC/FOLLOW. `buildTypedCamera` (cameras.ts) builds it from the faithful camera's world transform and disposes the original. ARC and FOLLOW can reference a target object (the `target` GUID): FOLLOW sets it as `lockedTarget`, ARC re-pivots its orbit onto it — both resolved in the second pass like entity references. When controls are attached, FREE/UNIVERSAL/ARC apply a key scheme (`applyCameraKeys`). FOLLOW has two modes: `ORBIT` (Babylon FollowCamera; with `useBlenderTransform` it derives radius/height/rotationOffset from the exported position via `deriveFollowFromPosition`, and its pointer-input multi-axis warning is silenced) and `OFFSET` (a UniversalCamera the loader drives each frame via `Level.addUpdater` to hold a constant world offset from the target — the offset is the exported camera position minus the target). ARC likewise starts from the exported position: `setPosition(eye)` after `setTarget` makes the camera's offset from the pivot define alpha/beta/radius.

---

## 10. Subsystem: shadows (`shadows.ts`)

Driven by each lamp's **Cast Shadows** toggle (`use_shadow`). When on, the light
carries a `shadow` settings object in the manifest, and `setupShadows` builds one
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

## 11. Exposed variables (`exposed.ts`)

`@exposed` marks a behavior field as editable per-object in Blender. The decorator
only records the field's name + UI hints in a registry (a `WeakMap` keyed by the
class); it never changes how the field behaves in code. At load,
`applyExposedVars` writes the human's stored value onto the instance **before
`onStart`**, falling back to the code default when the manifest has no value.

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
  "version": 2,
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
          "size": [1,1,1], "radius": 0.5, "height": 2, "center": [0,0,0] },
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

- **`dt` is seconds.** Scale all motion by it for frame-rate independence.
- **Keyboard/pointer input needs canvas focus** — the user must click the viewport
  once. Prefer `scene.onKeyboardObservable` / `onPointerObservable` over global
  listeners, and remove them in `onDestroy`.
- **References resolve before `onStart`**, but cross-entity `onStart` order is
  unspecified — don't assume another entity is fully initialised; guard `null`
  references.
- **Physics is V2/Havok and must be enabled before load.** Mesh colliders can't be
  dynamic.
- **The Blender camera is fixed by default** (no controls). The fallback
  `ArcRotateCamera` uses arrow keys, leaving WASD free for behaviors; a manually
  attached `FreeCamera` would fight WASD.
- **Light intensity is approximate**; tune `SUN_SCALE`/`PUNCTUAL_SCALE` in
  `lights.ts`. Color is exact.
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

**Collider authoring space.** Manual collider `center`/`size` are authored in Blender axes and converted to Babylon Y-up in `export._serialize_components` (`center (x,y,z)->(x,z,-y)`, `size` swaps y/z, `rotation` is a quaternion with vector part (x,z,-y) and w kept). Rotation applies to manual box/capsule/cylinder shapes (sphere is symmetric). The runtime (`physics.ts`) still receives Y-up values unchanged. `blender_addon/collider_preview.py` draws the wireframe in Blender space via a `SpaceView3D` POST_VIEW GPU handler, so the viewport preview matches the exported body.

**Multi-material meshes & physics.** A Blender mesh with multiple materials exports as a glTF mesh with one primitive per material; Babylon's loader imports that as a `TransformNode` with one child `Mesh` per material — so the entity's GUID node is a `TransformNode`, not a mesh. `physics.ts` handles this: if the node is a real mesh it uses `PhysicsAggregate`; if it's a wrapper TransformNode, `fitColliderShape` builds a box/sphere/capsule from the hierarchy bounding box (in node-local space) and attaches a `PhysicsBody` to the node. (PhysicsAggregate can't size a primitive from a non-mesh node — it calls `getTotalVertices` on it — so the node is never passed to it directly.)

**Collider debug view.** `Level.showColliders(show?)` toggles Babylon's `PhysicsViewer` over every entity body (no arg = flip). `LevelLoaderOptions.debugColliders` shows them on load; the runtime template binds **C** to the toggle. The viewer is disposed with the level.

**glTF __root__ physics fix.** The glTF loader parents imported content under a `__root__` node whose mirrored (negative) scale encodes the right->left handedness flip. Havok places shapes by decomposing a node's world matrix, and a mirror is indistinguishable from a 180-deg rotation when decomposed, so colliders land offset (typically below the mesh). STATIC colliders are now built **in world space and attached to a fresh identity anchor node** (`buildStaticWorldBody`), so Havok never decomposes the mirror at all - position and orientation both match the rendered mesh. Auto-fit uses the world AABB; manual shapes transform the authored center through the node world matrix (box/sphere/capsule/cylinder are symmetric so the mirror-ambiguous rotation is harmless); convex/mesh bake child geometry into world space. DYNAMIC/KINEMATIC bodies still attach to the node (they must drive it) and rely on `LevelLoader.neutralizeGltfRoot()` wrapping `__root__` in an identity parent (the fix from Babylon's physics docs) - dynamic bodies on mirrored imported nodes may still have residual flips and are best authored with clean transforms. **Convex/Mesh shapes** are always geometry-derived (manual size/center ignored): a single mesh feeds PhysicsShapeConvexHull/Mesh directly; a multi-material wrapper has its per-material children cloned, baked into the node's local frame, and merged into one temp mesh for the shape. Falls back to a fitted box if the hull/mesh can't be built.
