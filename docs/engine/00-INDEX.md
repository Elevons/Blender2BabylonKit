# Babylon Level Kit — Engine (Runtime) Documentation

The runtime half of the kit, current as of **v0.32.0**. The interactive version
is the HTML diagram set in this folder — open **[index.html](index.html)** and
use the bottom nav (an area row for the subsystem diagrams + a **Traces** row
for code walk-throughs; "Blender docs →" jumps to the editor packet).

> **Looking for something specific?** Open the searchable landing page at
> **[../index.html](../index.html)** and type a term (e.g. *collision*,
> *export*, *input*) to surface the relevant pages from both the engine and
> Blender sides.

## What the runtime does

`@bjs/engine` (`packages/engine/`) loads the two artifacts Blender exports —
`level.glb` (everything glTF can express) and `level.scene.json` (everything it
can't) — and turns them into a live `Level`. `LevelLoader.Load` appends the glb,
indexes nodes by GUID, builds an `Entity` per manifest entry, applies components
through small subsystems (physics, lights, cameras, audio, …), then runs your
`Behavior` scripts. See [Architecture](01-ARCHITECTURE.md) for the two-artifact
split and [Blender Add-on](02-BLENDER-ADDON.md) for the editor side.

## The interactive pages

Area diagrams (clickable node graphs): **[index.html](index.html)** (engine
overview) · **[load-pipeline.html](load-pipeline.html)** ·
**[scripting.html](scripting.html)** · **[physics.html](physics.html)** ·
**[rendering.html](rendering.html)** ·
**[audio-animation.html](audio-animation.html)** · **[ui.html](ui.html)** ·
**[workflow.html](workflow.html)** · **[blender-addon.html](blender-addon.html)**
(the editor, from the runtime's point of view).

Code traces (each node is a step; click for the explanation + the actual current
TypeScript source): **Load** (manifest → `Level`) · **Physics** (collider →
Havok body) · **@exposed** (field → Blender → instance) · **Triggers**
(On-Enter → `OnMessage`) · **Constraints** (component → joint) · **Audio** ·
**Input** (key → action → behavior) · **Live Link** · **2D GUI** · **Particles**
· **MSDF text** · **3D GUI** · **Atmosphere** (SUN lamp → physical sky).

## The prose chapters

1. [Architecture](01-ARCHITECTURE.md) — two artifacts, GUID identity, monorepo, data flow
2. [Blender Add-on](02-BLENDER-ADDON.md) — the editor half + export pipeline
3. [Load Pipeline](03-LOAD-PIPELINE.md) — `LevelLoader.Load`, the passes, `FinalizeLevel`
4. [Scripting](04-SCRIPTING.md) — `Entity`, `Behavior`, `@exposed`, `@inputMap`, Input
5. [Physics](05-PHYSICS.md) — bodies, constraints, triggers, right-handed import
6. [Rendering](06-RENDERING.md) — lights, cameras, shadows, environment, atmosphere, scene look
7. [Audio & Animation](07-AUDIO-ANIMATION.md) — sounds, NLA clips, the skinned-mesh rule
8. [Workflow](08-WORKFLOW.md) — Live Link, the validator, Debug Build, tooling, [Babylon Launcher](../launcher/00-INDEX.md)
9. [Feature Traces](09-FEATURE-TRACES.md) — every feature's Blender → runtime file/function chain
10. [UI](10-UI.md) — 2D GUI, particles, MSDF text, 3D GUI

## Regenerating

`npm run docs:build` regenerates both packets from the shared shell template
(`docs/_template/diagram-shell.html`) and rebuilds the searchable landing page.
`npm run docs:trace` rebuilds only this folder; it re-extracts every trace's
source from `packages/engine/`. A renamed/deleted symbol fails the build loudly
— the anti-rot guard. (The Blender packet alone is `npm run docs:blender`.)
