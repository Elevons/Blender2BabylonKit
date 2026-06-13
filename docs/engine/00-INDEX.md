# Babylon Level Kit — Engine Documentation

Interlinked documentation of the whole engine, current as of **v0.31.1**.
Start here; every page links back. **The interactive version of this
documentation is the HTML diagram set — open [index.html](index.html)** and
navigate with the bottom bar: Overview · Blender add-on · Load pipeline ·
Scripting · Physics · Rendering · Audio/Anim · **UI** · Workflow. Click any node for its
description, file path, and key facts. The **Traces row** in the nav opens the
per-feature trace diagrams (trace-physics.html, trace-input.html, …): each node
is one step of the call chain — click it for the explanation AND the actual
current source of that function, extracted from the repo at build time.
Regenerate after code or template changes with `npm run docs:build` (or
`npm run docs:trace` for the engine packet only). HTML pages are generated from
`docs/_template/diagram-shell.html`; area diagram data lives in
`scripts/docs/engine-areas.mjs`. These markdown pages
are the prose companion.

## The one-paragraph version

Blender is the editor; a small Babylon.js 9 engine is the player. Exporting a
scene produces **two artifacts**: `level.glb` (everything glTF can express:
meshes, transforms, hierarchy, materials, lights, cameras, animation clips) and
`level.scene.json` (everything it can't: components, tags, physics, script
bindings + values, per-light/camera settings). Entities in the two files are
matched by **GUID**. At runtime, `LevelLoader` appends the glb, walks the
manifest, and hands each concern to a small subsystem module.

## Reading order

| Doc | Covers |
|---|---|
| [01 — Architecture](01-ARCHITECTURE.md) | the two artifacts, GUID identity, monorepo layout, end-to-end data flow |
| [02 — Blender Add-on](02-BLENDER-ADDON.md) | every Python module, the export pipeline, validation, Live Link |
| [03 — Load Pipeline](03-LOAD-PIPELINE.md) | `LevelLoader.Load` step by step, the two passes, `FinalizeLevel` |
| [04 — Scripting](04-SCRIPTING.md) | Entity, Behavior lifecycle, the registry contract, `@exposed`, Input |
| [05 — Physics](05-PHYSICS.md) | colliders/bodies, the owned-meshes rule, right-handed import, constraints, triggers |
| [06 — Rendering](06-RENDERING.md) | lights, cameras (+ typed overrides), shadows, environment/fog/post |
| [07 — Audio & Animation](07-AUDIO-ANIMATION.md) | audio engine v2, NLA clip scoping, the skinned-mesh rule |
| [10 — UI](10-UI.md) | 2D GUI Editor JSON, particle systems, 3D GUI buttons/panels |
| [08 — Workflow & Tooling](08-WORKFLOW.md) | Live Link, validator checks, Debug Build, debug keys, monorepo/scaffolder |
| [09 — Feature Traces](09-FEATURE-TRACES.md) | per feature: the exact file/function chain from Blender to runtime |

Related, outside this folder: [README](../../README.md) (overview + authoring),
[STYLE_GUIDE](../STYLE_GUIDE.md) (code conventions),
[LLM_SCRIPTING_CONTEXT](../LLM_SCRIPTING_CONTEXT.md) (behavior codegen
contract), [TEST_PLAN](../TEST_PLAN.md), [DEVELOPMENT_PLAN](../DEVELOPMENT_PLAN.md),
[PREFAB_SPEC](../PREFAB_SPEC.md) (deferred design).

For the editor side, see the **[Blender add-on documentation](../blender/00-INDEX.md)** (parallel diagram + trace packet).
