# Babylon Level Kit — Behavior Authoring Kernel

Minimal contract for generating a behavior script (runtime **v0.32.0**). For
domain detail, use **bjs-mcp** tools (`get_scripting_context`, `plan_behavior`,
`get_recipe_template`, `validate_behavior`) — do not guess APIs.

**Terminology:** a **component** is authored data on an entity (TAG, SCRIPT, …);
a **behavior** is a runtime script class (`extends Behavior`) from a SCRIPT
component.

## File contract

- One class per file, `export default`, **class name === filename stem**
  (`Patrol.ts` → class `Patrol` → Blender registry key `"Patrol"`).
- Path: `src/behaviors/`.
- Import engine: `from "@bjs/engine"`; Babylon types: `from "@babylonjs/core"`.
- Auto-registered by filename stem via `import.meta.glob` + `BehaviorRegistry`.
- After changing `@exposed` fields, press **Sync** on the Script component in Blender.

```ts
import { Behavior, exposed, type Entity } from "@bjs/engine";

export default class MyBehavior extends Behavior
{
}
```

## Lifecycle (PascalCase — lowercase names never run)

| Method | When |
|--------|------|
| `OnStart(): void` | Once, after level load and `@exposed` refs resolve |
| `OnUpdate(deltaSeconds: number): void` | Every frame |
| `OnDestroy(): void` | Level dispose — remove observers |
| `OnMessage(message: string, source: Entity): void` | Trigger events or `SendMessage` |

- Scale continuous motion by `deltaSeconds`. Babylon **velocities** are already
  per-second — do not multiply those by `deltaSeconds`.
- Cross-entity `OnStart` order is unspecified; guard `null` references.
- Input edges (`WasPressedThisFrame`) last one frame; processed before `OnUpdate`.

## Members on `this`

```ts
this.entity : Entity    // entity this behavior is on
this.scene  : Scene
this.node   : TransformNode   // === this.entity.node
this.input? : InputActionMap  // scene default when no @inputMap fields
```

Behaviors do **not** receive a `Level` handle. Prefer `@exposed({ type: "entity" })`
for cross-entity refs; same-entity: `entity.GetBehavior(OtherClass)` or
`entity.GetAttachment("SCRIPT")?.behavior`.

## Decorators (literal tokens — never rename)

- `@exposed` — lowercase; Blender parses the source for this token.
- `@inputMap("Player")` — lowercase; injects an `InputActionMap` before `OnStart`.

Entity refs: `@exposed({ type: "entity" }) target: Entity | null = null`.
Entity lists: start `[]` — authors fill them in Blender.
`@exposed` defaults must be **single-line literals** (Blender does not parse
computed or multi-line defaults).

## Silent failure checklist

| Mistake | Result |
|---------|--------|
| `onStart` instead of `OnStart` | Hook never runs |
| `@Exposed` / `@InputMap` | Blender UI breaks |
| `node.position` every frame on DYNAMIC body | Fights physics solver |
| Behavior on skinned mesh, not armature | Animation/transform ignored |
| MESH trigger collider | Never fires in Havok |
| Invented input action names | Always undefined at runtime |
| `window` keyboard listeners | Leaks; use scene observables + `OnDestroy` |
| Script-built `UniversalCamera` for globe navigation | Use Blender **Camera** component `GEOSPATIAL` instead |
| Wrong **Planet Radius** on Geospatial camera | Zoom/pan limits and pose derivation break — match globe mesh |
| `DefaultRenderingPipeline` / scene post in a behavior | Author post in Blender **Babylon Scene › Post-Processing** |
| `Atmosphere` / `@babylonjs/addons/atmosphere` in a behavior | Author sky in Blender **Babylon Scene › Atmosphere** (Sun lamp) |

## MCP workflow (complex scripts)

1. `plan_behavior(intent)` — recipes, sections, reference, steps
2. `get_recipe_template(recipe, ClassName)` — valid skeleton
3. `list_input_actions` / `list_scene_entities` — real names
4. `find_similar_behavior(query, includeSource=true)` — copy proven patterns
5. `get_scripting_context(section=…)` — pull only needed API detail
6. `get_fragment(name)` / `get_exposed_field_snippet` — paste-in blocks
7. `validate_behavior(source, Filename.ts)` — fix errors; revalidate

Full contract: `docs/LLM_SCRIPTING_CONTEXT.md` (via `get_scripting_context`).
Style: `docs/STYLE_GUIDE.md` (via `get_style_guide`).
