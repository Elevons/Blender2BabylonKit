# Babylon Level Kit — Engine Guide (for an AI assistant)

You are working in **Babylon Level Kit**: a Blender add-on that exports a scene
to **Babylon.js 9** plus a small TypeScript engine that reconstructs it. Levels
are authored in Blender (geometry, components, lights) and exported as a `.glb`
(geometry/transforms/lights/cameras) and a `.scene.json` manifest (the ECS data
glTF can't express). The runtime loads the glb, then attaches components and
behaviors from the manifest.

Stack: Blender 5.x (4.2+) extension · Babylon.js 9.x · Havok Physics **V2** ·
Vite + TypeScript (`experimentalDecorators` enabled). Do not downgrade APIs.

## What you'll usually be asked to do

**Write behavior scripts.** That is the main extension point. Components,
lights, and references are authored by a human in Blender; your job is almost
always to add or edit a `Behavior` in `src/behaviors/`. Avoid editing
`src/engine/**` unless explicitly asked — that is the library.

## Project layout

```
babylon_runtime/
  index.html              # entry -> /src/main.ts
  src/
    main.ts               # app bootstrap (engine wiring + loads a level)
    behaviors/            # YOUR scripts — one Behavior per file
    engine/               # the library (don't edit unless asked)
      index.ts            #   public barrel — import the engine from "../engine"
      Behavior.ts types.ts exposed.ts ComponentRegistry.ts
      physics.ts lights.ts cameras.ts shadows.ts LevelLoader.ts
blender_addon/            # the Blender plugin (Python). You rarely touch this.
```

## Writing a behavior (the core task)

Rules — follow all of them:

1. **One behavior class per file**, in `src/behaviors/`.
2. The file is **named after the class** and the class is the **default export**.
   The filename stem is the registry key the human selects in Blender
   (`Spinner.ts` → key `Spinner`). `main.ts` auto-registers everything in
   `src/behaviors/` by filename, so no manual registration is needed.
3. **Import the engine from `"../engine"`** (the barrel), never from deep paths
   like `"../engine/Behavior"`.
4. Extend `Behavior` and override the lifecycle hooks you need.

```ts
// src/behaviors/Spinner.ts
import { Behavior, exposed } from "../engine";
import { Vector3 } from "@babylonjs/core";

export default class Spinner extends Behavior {
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" }) speed = 90;
  @exposed() axis: [number, number, number] = [0, 1, 0];

  private rad = 0;
  private _axis = new Vector3(0, 1, 0);

  onStart() {
    this.rad = (this.speed * Math.PI) / 180;     // exposed values are already applied
    this._axis = Vector3.FromArray(this.axis);
  }

  onUpdate(dt: number) {                          // dt is SECONDS since last frame
    this.node.rotate(this._axis, this.rad * dt);
  }
}
```

### Behavior lifecycle & members

- `onStart()` — runs once after the **whole** level has loaded and all entities
  + object references are resolved. Read exposed values here; they are applied
  before `onStart`.
- `onUpdate(dt)` — every frame, `dt` in **seconds**.
- `onDestroy()` — on level dispose. Unsubscribe observers here.
- `this.node` → the object's `TransformNode` (Babylon). `rotate`/`translate`
  default to **local** space; pass `Space.WORLD` for world space.
- `this.entity` → the `Entity` (see API). `this.scene` → the Babylon `Scene`.

## Exposed variables (`@exposed`)

Decorate a field to make it editable per-object in Blender. The decorator only
marks the field; the runtime applies the human's value onto the instance
**before `onStart`**, falling back to the code default.

```ts
@exposed() speed = 90;                                   // number  -> float
@exposed() enabled = true;                               // boolean -> checkbox
@exposed() title = "hi";                                 // string
@exposed() dir: [number, number, number] = [0, 1, 0];    // 3-array -> vector3
@exposed({ type: "color" }) tint = new Color3(1, 0, 0);  // color picker
@exposed({ type: "entity" }) target: Entity | null = null; // object reference
@exposed({ type: "enum", options: ["a","b"] }) mode = "a"; // dropdown -> string
@exposed({ type: "list", of: "float" }) speeds = [1, 2];   // add/remove list
```

Options: `{ min?, max?, step?, label?, type?, options?, of? }`. `type` ∈
`"color" | "vector3" | "float" | "int" | "bool" | "string" | "entity" | "enum" |
"list"`. `options` is the enum's string choices; `of` is a list's element type
(`float|int|string|bool|vector3|color` — entity not allowed in lists). At runtime
an enum is just its string; a list is an array with `vector3`/`color` elements
coerced to `Vector3`/`Color3`. List defaults must be one line.

Type rules:
- Numbers are floats (there is no distinct int field yet — `type:"int"` is not
  specially handled).
- A 3-number array is a **vector3** by default; add `type:"color"` for a color.
  Arrays become `Color3`/`Vector3` automatically if the field default is one.
- **Object references**: use `type:"entity"` on an `Entity | null` field
  defaulting to `null`. In Blender this is an object picker; picking an object
  auto-assigns it a GUID and the field resolves to the referenced **`Entity`**
  at runtime (or `null` if unset/missing).

Important constraint: **Blender parses these decorators from the .ts source**
(it can't run TS). Keep declarations parseable: a literal default
(`= 45` / `= true` / `= "x"` / `= [a,b,c]` / `= null`) on one line. Computed or
multi-line defaults won't be read by Blender (the field still uses its code
default at runtime). For object refs the `type:"entity"` hint is required.

## Runtime API (what behaviors can use)

```ts
class Entity {
  readonly id: string;          // Blender GUID
  readonly name: string;        // Blender object name
  readonly node: TransformNode; // the Babylon node
  tag: string;                  // from a Blender TAG component, else "Untagged"
  behaviors: Behavior[];
  body?: PhysicsBody;           // present if it has a Collider/RigidBody
  getBehavior<T extends Behavior>(ctor: new () => T): T | undefined;
}

class Level {
  entities: Map<string, Entity>;        // keyed by GUID
  byId(id: string): Entity | undefined;
  byTag(tag: string): Entity[];
}
```

Reach other objects via `this.entity` → (the loader sets `node.metadata.bjsEntity`),
or through an `@exposed({type:"entity"})` reference, or `level.byTag(...)` if you
hold a `Level` reference. Physics lives on `entity.body` (Havok V2 `PhysicsBody`):
e.g. `this.entity.body?.applyImpulse(...)`, `setMotionType(...)`.

## Components (authored in Blender — context for behaviors)

A human adds these in Blender's "Babylon" N-panel; you generally don't create
them in code, but you read their effects:

- **TAG** → `entity.tag`. Query with `level.byTag("Enemy")`.
- **COLLIDER** + **RIGIDBODY** → `entity.body` (Havok V2). Collider shapes:
  box/sphere/capsule/cylinder/convex/mesh; mesh colliders must be static. Body
  types: dynamic/static/kinematic.
- **SCRIPT** → attaches one of your behaviors (picked by file) and its exposed
  values.
- **Lights** are automatic: any Blender lamp becomes a Babylon light (POINT→
  Point, SUN→Directional, SPOT→Spot) with color/energy/range copied. No
  component, no code needed. There is no fallback light — a dark scene means add
  a light in Blender.
- **Cameras** are automatic too: the Blender camera's transform/FOV/clip come
  through and the scene's active camera is set as `scene.activeCamera` (also
  `level.activeCamera`). No component. No fallback when one is provided.
- **Shadows** are driven by each lamp's `castShadows` flag (Blender `use_shadow`).
  When on, the light carries a `shadow` object of Babylon settings (filter, mapSize,
  bias, normalBias, darkness, minZ/maxZ). On load, `setupShadows` (engine/shadows.ts)
  makes a `ShadowGenerator` per light, applies those settings (clip planes go on the
  light as `shadowMinZ/MaxZ`; `0` = auto), and registers all geometry as
  caster+receiver. Exposed as `level.shadowGenerators`. Loader options
  `{ shadows?: boolean; shadowMapSize?: number }` set the global default (on, 1024).
  Only Directional/Spot/Point cast; others are skipped with a warning.

## Data flow / manifest (reference)

`export.py` writes `level.glb` + `level.scene.json`. A manifest entity:

```json
{
  "id": "guid-hex",
  "name": "Cube",
  "parent": "guid-or-null",
  "components": [
    { "type": "TAG", "tag": "Player" },
    { "type": "COLLIDER", "shape": "BOX", "isTrigger": false, "autoFit": true },
    { "type": "RIGIDBODY", "bodyType": "DYNAMIC", "mass": 1, "friction": 0.5, "restitution": 0.2 },
    { "type": "SCRIPT", "script": "Spinner", "path": "...", "vars": { "speed": 120, "axis": [0,1,0] } }
  ],
  "light": { "type": "SUN", "color": [1,1,1], "energy": 1, "castShadows": true,
             "shadow": { "filter": "PCF", "mapSize": 0, "bias": 0.00005,
                         "normalBias": 0, "darkness": 0, "minZ": 0, "maxZ": 0 } }
}
```

Entities are matched to glb nodes by **GUID** (stored in glTF `extras`, read via
the `ExtrasAsMetadata` loader extension), falling back to name. `vars` for an
`entity`-typed field is the referenced object's GUID, resolved in a second pass
after all entities exist.

## Gotchas (read before debugging)

- **Keyboard/pointer input needs canvas focus** — the user must click the
  viewport once. Use `scene.onKeyboardObservable` / `onPointerObservable`, not
  ad-hoc global listeners, and clean them up in `onDestroy`.
- **`dt` is seconds.** Scale all motion by it for frame-rate independence.
- **Object references resolve before `onStart`,** but do **not** assume another
  entity's `onStart` has already run — cross-entity init order is unspecified.
  Reference fields may be `null`; guard them.
- **Physics is V2/Havok and must be enabled before load** (`main.ts` calls
  `enableHavokPhysics`). Mesh colliders can't be dynamic.
- **Camera key clashes:** `main.ts` uses `ArcRotateCamera` (arrow keys), so WASD
  is free for behaviors. A `FreeCamera` would fight WASD.
- **Don't reintroduce removed APIs:** there are no `this.num()/this.str()/`
  `this.vec3()` param helpers anymore — read exposed fields directly off `this`.
- **Light intensity is approximate** (Blender watts ≠ real-time intensity);
  color is exact. Tune `SUN_SCALE`/`PUNCTUAL_SCALE` in `engine/lights.ts` if asked.

## Running

```
cd babylon_runtime && npm install
mkdir -p public/levels && cp /path/level.glb /path/level.scene.json public/levels/
npm run dev
```

`main.ts` enables Havok, auto-registers behaviors, loads
`/levels/<name>.scene.json`. Keep the `.glb` and `.scene.json` filenames
matching what `main.ts` fetches.
