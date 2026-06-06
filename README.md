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
               └─►  level.scene.json  (your components, keyed by object name)

Babylon runtime ──► loads the .glb, then reads the manifest and matches each
                    entity to a glTF node by name, attaching components.
```

glTF already carries everything it's good at (geometry/transforms/parenting),
so the manifest only stores what glTF can't express: your ECS components.
Matching is by **object name** — Blender guarantees unique object names, so keep
them unique and they line up with the imported nodes.

## Install the Blender add-on

Use `babylon_level_kit_extension.zip`. Blender → Edit → Preferences → Get
Extensions → drop-down (top-right) → **Install from Disk…** → pick the zip →
enable it. In the 3D viewport press **N** and open the **Babylon** tab.

Targets Blender 4.2+ (incl. 5.x). Uses only stable operator/panel/property
APIs.

## Authoring a level

- Select an object → **Babylon** tab → **Add Component**.
- **Tag** – an entity tag/layer you can query at runtime (`level.byTag("Enemy")`).
- **Collider** – box/sphere/capsule/cylinder/convex/mesh. *Auto-Fit* derives
  size from the mesh bounding box at runtime (recommended). Toggle *Is Trigger*
  for overlap-only volumes.
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

### Behaviors (scripts)

Put one behavior class per file in `src/behaviors/`, named after the class and
default-exported. Mark editable fields with `@exposed`:

```ts
// src/behaviors/Rotator.ts
import { Behavior, exposed } from "../engine";

export default class Rotator extends Behavior {
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" }) speed = 45;
  @exposed() axis: [number, number, number] = [0, 1, 0];

  onUpdate(dt: number) { /* uses this.speed, this.axis */ }
}
```

When you pick this file with **Open Script…** in Blender, the add-on parses the
`@exposed` fields and shows typed widgets (float/bool/string/vector/color) right
in the component. Edit the values per-object; on export they're written to the
manifest as typed JSON, and the runtime applies them onto the instance before
`onStart()`. Hit the **Sync** (refresh) button after changing which fields a
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
`vector3`, or `color` (`vector3`/`color` elements arrive as `Vector3`/`Color3`).
Entities aren't supported as list elements. See `Waypoints.ts` for both. List
defaults must be a single-line literal.

`min`/`max`/`label` hints are read from the decorator. The Blender side is a
conservative source parser — anything it can't read is simply not shown, and the
field keeps its code default at runtime. `main.ts` auto-registers everything in
`behaviors/` by filename stem via `autoRegisterBehaviors`.

## Adding a new component (end-to-end)

1. **`properties.py`** – add it to `COMPONENT_TYPES` and add its fields to
   `BJSComponent`.
2. **`ui.py`** – draw the fields in `_draw_component`.
3. **`export.py`** – serialize the fields in `_serialize_components`.
4. **`types.ts`** – add the matching interface to the `Component` union.
5. **`LevelLoader.ts`** – handle the new `type` in `applyComponents`.

Adding a new *behavior* (the common case) needs only the runtime: subclass
`Behavior`, register it (`registry.registerScripts({ MyThing })`), and reference
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
`src/engine/lights.ts` are the two knobs to tune if a scene reads too bright or dim.
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
levels keep working. Query at runtime with `level.byId("...")` or `level.byTag(...)`.

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
      types.ts          # manifest schema + Entity
      Behavior.ts       # scriptable behavior base class
      exposed.ts        # @exposed decorator + value application
      ComponentRegistry.ts
      physics.ts        # Collider+RigidBody -> Havok V2
      lights.ts         # copies Blender lamp props onto glb lights
      LevelLoader.ts    # loads glb + manifest, builds the ECS, runs the loop
      index.ts          # barrel — import the engine via "../engine"
```
