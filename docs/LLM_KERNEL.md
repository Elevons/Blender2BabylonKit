# Babylon Level Kit — Behavior Authoring Kernel

Minimal contract for generating a behavior script (runtime **engine v0.31.1 · Blender add-on v0.32.0**). For
task-specific steps, call **`route_task(intent, className)`** first — do not
guess. For API detail, use **`get_scripting_context(section=…)`**.

**Terminology:** a **component** is authored data on an entity (TAG, SCRIPT,
ANIMATOR, …); a **behavior** is a runtime script class (`extends Behavior`) from
a SCRIPT component (ANIMATOR also mounts a built-in `AnimatorController`).

## File contract

- One class per file, `export default`, **class name === filename stem**
  (`Patrol.ts` → class `Patrol` → Blender registry key `"Patrol"`).
- Path: `src/behaviors/`.
- Import engine: `from "@bjs/engine"`; Babylon types: `from "@babylonjs/core"`.
- Auto-registered by filename stem via `import.meta.glob` + `BehaviorRegistry`.
- After changing `@exposed` fields, press **Sync** on the Script component in Blender.
- Locomotion FSMs (Idle/Walk/Jump): author an **ANIMATOR** component on the
  armature in Blender — do not invent a custom SCRIPT state machine. Clip names
  are **Action** names (glTF ACTIONS mode), not NLA strip labels.

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
| `OnPostReady(): void` | Once, after NME compile and post attach (`level.postReady`) |
| `OnUpdate(deltaSeconds: number): void` | Every frame |
| `OnDestroy(): void` | Level dispose — remove observers |
| `OnMessage(message: string, source: Entity): void` | Event Messages or `SendMessage` |
| `OnCollisionEnter/Stay/Exit`, `OnTriggerEnter/Exit` | Havok collision/trigger lifecycle (opt-in overrides) |

- Scale continuous motion by `deltaSeconds`. Babylon **velocities** are already
  per-second — do not multiply those by `deltaSeconds`.
- Cross-entity `OnStart` order is unspecified; guard `null` references.
- Use **`OnPostReady`** for `level.post` / pipeline work — not `OnStart`.
- Input edges (`WasPressedThisFrame`) last one frame; processed before `OnUpdate`.

## Members on `this`

```ts
this.entity : Entity    // entity this behavior is on
this.scene  : Scene
this.node   : TransformNode   // === this.entity.node
this.input? : InputActionMap  // scene default when no @inputMap fields
this.spawner: PrefabSpawner   // Spawn, HideTemplate, FlushSpawnShadowRefresh
this.session: LevelSession    // Restart / Load / Unload (LevelDirector)
this.time   : GameClock       // timeScale (0 freezes gameplay) + un/scaled deltas/elapsed
```

`this.time` is the single time authority: writing `timeScale` scales OnUpdate
deltas, scene animations, particles, and physics together. `OnUpdate`'s `deltaSeconds` is
the **scaled** delta; wall-clock timers (pause menus, slow-mo ramps) use
`this.time.unscaledDeltaSeconds`. Deltas are hitch-clamped
(`maxFrameDeltaSeconds`, 0.1 s). Never set `scene.animationTimeScale` or the
physics timestep by hand.

Behaviors do **not** receive a full `Level` handle. Prefer `@exposed({ type: "entity" })`
for cross-entity refs; same-entity: `entity.GetBehavior(OtherClass)` (first match),
`entity.GetScript("Instance Name")` when multiple SCRIPT rows share a class, or
`entity.GetAttachment("SCRIPT")?.behavior`. To **duplicate** a loaded subtree
(linked prefab or in-scene hierarchy) use `this.spawner.Spawn` — never
`node.clone()` + copy attachments. Spawn hides the template when the call starts;
`keepTemplate: true` to opt out; `@exposed({ spawnTemplate: true })` hides at
level load for deferred spawners. Animated templates get independent skeleton +
AnimationGroups per instance. Multi-spawn loops:
`deferShadowRefresh: true` + `FlushSpawnShadowRefresh()` once. Paint-scatter:
`get_scripting_context(section="prefab-spawn")` / `populateprefabs.ts`
(auto `COLOR_n`, luminance threshold — not Blender attribute names). Soft restart
or change levels with `await this.session.Restart()` / `Load(url)` (app wires
`LevelDirector`).

## Decorators (literal tokens — never rename)

- `@exposed` — lowercase; Blender parses the source for this token.
- `@inputMap("Player")` — lowercase; injects an `InputActionMap` before `OnStart`.

Entity refs: `@exposed({ type: "entity" }) target: Entity | null = null`.
Entity lists: start `[]` — authors fill them in Blender.
`@exposed` defaults must be **single-line literals** (Blender does not parse
computed or multi-line defaults).

## Physics movement (one question)

| Body? | Mode | Rule |
|-------|------|------|
| No | — | Write `node.position` freely |
| Yes | DYNAMIC | Velocity / impulse only — **never** `node.position` each frame |
| Yes | ANIMATED | `disablePreStep = false`; teleport or drive each frame |

**MCP:** `get_physics_movement` — full decision tree + copy-in code.

## Coordinate axes (do not mix frames)

- **World:** Babylon Y-up (+Y up, −Z forward). Manifest collider/constraint
  vectors are converted at export — use as-is at runtime.
- **Node local:** Blender Z-up (+X lateral, **+Y forward**, +Z up). glTF keeps
  each object's local axes; behavior rotations act in this frame.
- **`lookAt` / `setDirection`:** aligns local **+Y** (Blender forward), not +Z.
  Parented nodes (e.g. camera HUD): pass `Space.WORLD` or the mesh won't turn.

**MCP:** `get_axis_conversion(topic?)` · `get_doc_chapter(chapter="engine/15-axis-conversion")`.

## MCP workflow (use tools — do not guess)

1. **`route_task(intent, className)`** — playbook + exact steps
2. **`preflight_behavior`** — checklist
3. **`get_recipe_template`** — valid skeleton
4. **`list_input_actions` / `list_scene_entities`** — real names
5. **`get_physics_movement`** — if anything moves
6. **`search_docs(query)`** — find doc sections by natural language or API name
7. **`validate_behavior`** — until clean

Also: `get_do_not_list`, `get_engine_basics`, `get_playbook`, `get_scripting_context`.

Full contract: `docs/LLM_SCRIPTING_CONTEXT.md`. Task recipes: `docs/LLM_PLAYBOOK.md`.
Engine prose: `docs/engine/00-INDEX.html`. Style: `docs/STYLE_GUIDE.md`.
