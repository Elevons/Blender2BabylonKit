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
Matching is by a stable **GUID** stamped into each object, so renaming objects
in Blender doesn't break the link. See
[Architecture](docs/engine/01-ARCHITECTURE.html) for the full data-flow picture.

## Documentation

The **canonical manual** is the HTML docs — build and serve them from the repo
root:

```bash
npm run docs:build
npm run docs:serve    # http://localhost:4173
```

| I want to… | Start here |
|------------|------------|
| **First level in ~15 minutes** | [Quickstart](docs/QUICKSTART.html) |
| **Author in Blender** (export, components, Live Link) | [Blender docs](docs/blender/00-INDEX.html) |
| **Write behavior scripts** | [Runtime basics](docs/engine/02-RUNTIME-BASICS.html) → [API guide](docs/engine/14-API-GUIDE.html) |
| **Does the kit support X?** | [Feature list](docs/engine/13-FEATURE-LIST.html) |
| **Hack on engine / add-on code** | [Engine index](docs/engine/00-INDEX.html) · [Feature traces](docs/engine/10-FEATURE-TRACES.html) |
| **Contribute to the docs** | [Building the documentation](docs/BUILDING-DOCS.html) |

Search every page from the [landing page](docs/index.html). Quick checks:
`npm run docs:validate` and `npm run docs:check-links`.

## Install the Blender add-on

Use `babylon_level_kit_extension.zip`. Blender → Edit → Preferences → Get
Extensions → drop-down (top-right) → **Install from Disk…** → pick the zip →
enable it. In the 3D viewport press **N** and open the **Babylon** tab.

Targets Blender 4.2+ (incl. 5.x). Uses only stable operator/panel/property
APIs.

## Run the playground

The repo is an **npm workspaces monorepo**: the engine lives once in
`packages/engine` (`@bjs/engine`) and every app under `apps/` depends on it via
a workspace symlink.

```bash
npm install        # once, at the repo root
# put exported level files where the playground expects them:
cp /path/to/level.glb /path/to/level.scene.json apps/playground/public/levels/
npm run dev        # Vite dev server
npm run typecheck  # tsc over engine + app
```

Open the dev URL. `apps/playground/src/main.ts` boots an engine, enables Havok
physics, registers example behaviors, and loads a level manifest.

> Physics uses Babylon's **V2 / Havok** API. The `@babylonjs/havok` package
> ships a `.wasm` that must be served — the included `vite.config.ts` handles
> this by excluding it from dep pre-bundling.

Press **C** to toggle physics debug wireframes and **I** for the Babylon
Inspector (both gated by the **Debug Build** checkbox in the Export panel). See
[Workflow](docs/engine/09-WORKFLOW.html) for Live Link, the validator, and
debug export options.

## Authoring a level

Select an object → **Babylon Object** tab → **Add Component**. Each component is
a collapsible panel with enable, reorder, copy/paste, and delete. Empties work
well as logic entities. **Export → Export Level** writes `yourlevel.glb` +
`yourlevel.scene.json` side by side.

Objects **disabled in renders** (camera icon in the outliner) are skipped
entirely. Viewport-only hiding does *not* exclude an object.

Every component type (collider, rigid body, script, audio, GUI, particles, MSDF
text, 3D GUI, camera override, constraints, …), scene-wide settings, and
"where do I click?" reference:
**[Feature list](docs/engine/13-FEATURE-LIST.html)**.

### Behaviors (scripts)

Put one behavior class per file in `src/behaviors/`, default-exported, class
name matching the filename stem. Mark editable fields with `@exposed`:

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

Pick the file with **Open Script…** in Blender; the add-on parses `@exposed` and
`@inputMap` and shows typed widgets. Press **Sync** after changing exposed
fields. Full scripting reference:
[05 — Scripting](docs/engine/05-SCRIPTING.html) ·
[14 — API Guide](docs/engine/14-API-GUIDE.html) ·
[Style guide](docs/STYLE_GUIDE.md).

## Live Link

Export once by hand to set the path, tick **Live Link** in the Export panel, and
every **Ctrl+S** in Blender re-exports automatically. The dev server watches
`public/levels/` and reloads the browser. Details:
[Workflow — Live Link](docs/engine/09-WORKFLOW.html).

## Prefabs (linked .blend files)

Link library `.blend` files into your level, apply **library overrides** per
instance, and export from the level file. Full workflow:
[Prefabs](docs/blender/PREFABS.html).

## Creating a new project

```bash
npm run create -- --name my-game --title "My Game" --level Arena
npm install
npm run dev --workspace apps/my-game
```

Flags: `--title <text>`, `--level <name>`, `--force` (overwrite). The scaffold
copies the playground template; the engine stays a workspace dependency.

## Adding a new component (contributors)

Component dispatch is registry-driven — one table per layer, one entry per
component type:

1. **`blender_addon/components/`** — PropertyGroup fields + the
   `COMPONENT_TYPES` enum in `constants.py`
2. **`blender_addon/ui/component_bodies.py`** — inspector body drawer,
   registered in `BODY_DRAWERS`
3. **`blender_addon/export/component_serializers.py`** — manifest serializer,
   registered in `SERIALIZERS`
4. **`packages/engine/src/core/types.ts`** — `Component` union
5. **`packages/engine/src/core/loader/componentRegistry.ts`** — runtime handler,
   registered in `COMPONENT_HANDLERS` (components that need every entity built
   first — constraints, GUI3D, reflection probes — queue a registration in
   their handler and build in a `subsystems/` module wired into
   `LevelLoader.FinalizeLevel`)

`npm run check:components` (part of `npm run typecheck`) verifies all the
registries declare the same component types and that the exporter and runtime
agree on the manifest schema version — a forgotten entry fails the build with
the missing type named.

Adding a new *behavior* needs only the runtime: subclass `Behavior`, register it,
and reference it from a Script component in Blender.

## Known limitations

- **Manual collider center offset** applies only in explicit (non-auto-fit) mode.
- **No in-Blender play mode** — iterate with **Live Link** (Ctrl+S) or manual export.
- If `node.metadata` is empty at runtime, confirm `ExtrasAsMetadata` is imported
  and the glb was exported with custom properties — see
  [Load pipeline](docs/engine/04-LOAD-PIPELINE.html).

## Layout

```
blender_addon/          # Blender extension (export, components, UI)
packages/engine/        # @bjs/engine — runtime, loader, behaviors
apps/playground/        # dev app (Vite); npm run create stamps new games
docs/                   # built HTML docs (sources under scripts/docs/)
tools/bjs-mcp/          # MCP server for LLM-assisted behavior authoring
```

Engine internals (load pipeline, manifest schema, subsystems):
**[Engine documentation](docs/engine/00-INDEX.html)**.
