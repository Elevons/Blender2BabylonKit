# 01 — Architecture

[← Index](00-INDEX.md) · Next: [Blender Add-on →](02-BLENDER-ADDON.md)

## The core idea: two artifacts

> If glTF can already express it, the glb owns it and the engine writes no code
> for it. If it can't, it goes in the manifest and a small subsystem applies it.

| Artifact | Carries | Consumed by |
|---|---|---|
| `level.glb` | geometry, transforms, hierarchy, materials, lights, cameras, animation clips | Babylon's glTF importer |
| `level.scene.json` | components (TAG/COLLIDER/RIGIDBODY/SCRIPT/CAMERA/AUDIO/CONSTRAINT), per-light/camera/scene settings, schema **v4** | our `LevelLoader` |

The manifest never duplicates the glb — it only adds. This is why there's a
`subsystems/physics.ts` but no `meshes.ts`: meshes ride entirely in the glb.

## Entity identity (GUIDs)

Every addressable Blender object gets a GUID in a custom property (`bjs_id`,
defined once as `ID_KEY` on both sides). The exporter writes it into the glTF
node's `extras`; the manifest references the same GUID. At load it surfaces at
`node.metadata.gltf.extras.bjs_id` (via the `ExtrasAsMetadata` loader
extension) and the loader matches manifest entity → glb node by GUID, name as
a legacy fallback. A GUID is what makes an object an *entity*; pure geometry
without one just lives in the glb. GUIDs are auto-assigned to anything that
needs to be findable: objects with components, lights, cameras, and any object
referenced by an entity field, trigger event, or constraint target.

The GUID is also the discriminator for two subtle cases: multi-material
submeshes have **no** GUID (so they're "owned" by their wrapper — see
[Physics](05-PHYSICS.md#owned-meshes)), while real parented children **do**
(so they're excluded from a parent's collider).

## Monorepo layout

```
bjs-level-kit/
  package.json            # npm workspaces root: dev / typecheck / create
  packages/engine/        # "@bjs/engine" — the runtime, shared by every app
    src/
      index.ts            #   public barrel (apps import "@bjs/engine")
      core/               #   types.ts (schema) · Entity.ts · Level.ts · LevelLoader.ts
      scripting/          #   Behavior.ts · exposed.ts · BehaviorRegistry.ts · Input.ts
      subsystems/         #   physics lights cameras shadows constraints audio
                          #   triggers environment fog postprocess animation
  apps/                   # each game is an app; engine reaches it via symlink
    playground/           #   the dev/test app (Vite); template for npm run create
  blender_addon/          # the editor half (Python, Blender 4.2+ extension)
  scripts/create-app.mjs  # scaffolds apps/<name>
  docs/                   # this documentation, plans, specs
```

Apps declare `"@bjs/engine": "*"`; `npm install` at the root satisfies it with
a **symlink** to `packages/engine` (no publishing, no copying). The engine
ships TS source (`exports` → `src/index.ts`); Vite compiles it across the link
and hot-reloads engine edits into running apps. Engine and Blender add-on
versions move in lockstep.

## End-to-end data flow

```
Blender scene (objects + components + GUIDs)
   │  Export Level / Live Link            [02-BLENDER-ADDON.md]
   ▼
level.glb  +  level.scene.json  (+ audio/ files, env textures)
   │  Vite dev server serves apps/<app>/public/levels/
   ▼
LevelLoader.Load(manifestUrl)             [03-LOAD-PIPELINE.md]
   │  appendSceneAsync (right-handed) → GUID index → per-entity pass
   │  → second pass (refs, camera targets) → FinalizeLevel
   ▼
Level (entities, update loop) ── behaviors run OnStart/OnUpdate
                                          [04-SCRIPTING.md]
```

[← Index](00-INDEX.md)
