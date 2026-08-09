# Babylon Level Kit — LLM Playbook

**Purpose:** step-by-step recipes so an LLM can write a correct behavior **without guessing**.
Use MCP tool **`route_task(intent, className)`** first — it picks a playbook and lists exact tool calls.

**Related docs:**
- Minimal contract: `docs/LLM_KERNEL.md` (`get_kernel`)
- Full API: `docs/LLM_SCRIPTING_CONTEXT.md` (`get_scripting_context`)
- Engine prose: `docs/engine/00-INDEX.html` (choose your path)
- Style: `docs/STYLE_GUIDE.md` (`get_style_guide`)

## Golden rules (never violate)

1. **One class per file** — `export default class Name extends Behavior`; **Name === filename stem**.
2. **PascalCase hooks** — `OnStart`, `OnPostReady`, `OnUpdate`, `OnDestroy`, `OnMessage`, `OnCollision*`, `OnTrigger*` (lowercase = silent no-op).
3. **Lowercase decorators** — `@exposed`, `@inputMap` (Blender parses these literals).
4. **Never invent** input action names or entity names — call `list_input_actions` / `list_scene_entities`.
5. **Never write** `node.position` every frame on a **DYNAMIC** body — use velocity or ANIMATED mode.
6. **Never create** atmosphere, post-processing, or MSDF renderers in behaviors — author in Blender.
7. **Always end with** `validate_behavior` — fix every error; revalidate until clean.

## Route table

| You want to… | Playbook slug | Recipe |
|--------------|---------------|--------|
| First empty script | `first-behavior` | `minimal-behavior` |
| WASD / stick mover | `player-mover` | `input-poll-move` |
| React to trigger zone (data) | `trigger-reaction` | `on-message-handler` |
| Collision/trigger hooks (code) | — | override `OnCollision*` / `OnTrigger*` |
| Moving platform | `moving-platform` | `patrol-oscillate` |
| Patrol through points | `waypoint-patrol` | `waypoint-path` |
| Train on rails + throttle | `train-on-path` | `path-follow-advanced` |
| Rover / car wheels | `rover-drive` | `rover-wheel-drive` |
| Spin on axis | `spin-object` | `constant-rotate` |
| Face a target | `look-at-target` | `look-at-target` |
| Cycle animations (script only) | `animation-cycle` | `animation-cycle` |
| Locomotion FSM (Idle/Walk/…) | `animator-fsm` | `animator-driver` |
| Reveal hidden mesh | `reveal-on-trigger` | `reveal-on-message` |
| Play sound on event | `sound-on-trigger` | `sound-on-message` |
| Update 3D MSDF label | `update-msdf-label` | `msdf-label-update` |
| Orbit camera (script) | `orbit-camera` | `camera-follow` |
| Fly globe camera | `geospatial-flyto` | `geospatial-camera-flyto` |
| Debug trigger overlaps | `debug-triggers` | `trigger-logger` |
| Spawn prefab instances | `spawn-prefab-instances` | `scatter-prefab-spawner` |
| Pool spawner (interval + grow/shrink) | `pool-spawner` | `pool-prefab-spawner` |

Call `list_playbooks()` for this table. Call `get_playbook(name="player-mover")` for one recipe.

## Troubleshooting

| Symptom | Likely cause | MCP fix |
|---------|--------------|---------|
| Hook never runs | `onStart` not `OnStart` | `get_do_not_list` |
| Input does nothing | Wrong action name | `list_input_actions` |
| Mesh won't move | DYNAMIC + `node.position` | `get_physics_movement` |
| Position logs but mesh stuck | ANIMATED without `disablePreStep=false` | `get_physics_movement(mode="animated-teleport")` |
| Body drifts forever | `setTargetTransform` once | `get_physics_movement(mode="animated-continuous")` |
| Trigger never fires | MESH trigger shape | `get_scripting_context(section="physics")` |
| Trigger log silent | `getCollisionObservable()` used for triggers | `get_do_not_list` · recipe `trigger-logger` |
| Duplicate prefab collider floats far from mesh | Shared glTF mesh → InstancedMesh; old hull bake used world matrix | `get_do_not_list` · `get_scripting_context(section="physics")` |
| Script camera wrong FOV | Forgot `CopyLens` after `new` camera | `get_fragment(name="copy-lens-from-authored-camera")` |
| Animation ignored | Script/Animator on mesh not armature | `get_playbook(name="animator-fsm")` |
| HUD arrow never rotates / mesh points sideways | `lookAt` without `Space.WORLD` on parented node, or assumed +Z not +Y | `get_axis_conversion(topic="look-at")` · `get_do_not_list` |
| @exposed field missing in Blender | Forgot Sync | Re-export + Sync in Blender |

---

## Playbook: first-behavior

### Blender setup
1. Select object → Babylon Object → Add Component → **SCRIPT**.
2. Open Script → pick or create `MyBehavior.ts` in `src/behaviors/`.
3. Export level (or Live Link).

### Behavior file
- Path: `src/behaviors/MyBehavior.ts`
- Start from recipe `minimal-behavior` — add logic only after template validates.

### MCP steps
1. `route_task(intent="empty behavior shell", className="MyBehavior")`
2. `get_recipe_template(recipe="minimal-behavior", className="MyBehavior")`
3. `get_engine_basics(topic="components-vs-behaviors")`
4. `validate_behavior(source, "MyBehavior.ts")`

### Do not
- Add physics, cameras, or post-processing in an empty first script.
- Skip `export default`.

---

## Playbook: player-mover

### Blender setup
1. SCRIPT on the object that should move (often the character root / rigid body object).
2. Optional: COLLIDER + RIGIDBODY — if DYNAMIC, behavior must use velocity not `node.position`.
3. Input Actions panel has a **Move** action (default Player map).

### Behavior file
- Recipe: `input-poll-move`
- Reference: `InputMover.ts`
- Use `PlayerActions.Move` from `../InputActions` — never raw key codes.

### MCP steps
1. `route_task(intent="wasd mover", className="MyMover")`
2. `list_input_actions()`
3. `get_recipe_template(recipe="input-poll-move", className="MyMover")`
4. `get_scripting_context(section="input")`
5. If entity has Rigid Body: `get_physics_movement()`
6. `validate_behavior(source, "MyMover.ts")`

### Do not
- Invent action names like `"WASD"` or `"MoveForward"`.
- Multiply `ReadVector2()` by deltaSeconds twice — scale the **position delta** once.

---

## Playbook: trigger-reaction

### Blender setup
1. **Trigger object:** COLLIDER → Is Trigger → **Event Messages** → When = Trigger Enter → pick target entity + message string (e.g. `"door_open"`).
2. **Target object:** SCRIPT component with your behavior (e.g. `DoorLogic.ts`).
3. Trigger shape: box/sphere/capsule/convex — **not MESH**.

### Behavior file
- Recipe: `on-message-handler`
- Override `OnMessage(message, source)` — filter by `message` string.

### MCP steps
1. `route_task(intent="react to trigger", className="DoorLogic")`
2. `list_scene_entities(level="…", filter="door")` — verify names
3. `get_recipe_template(recipe="on-message-handler", className="DoorLogic")`
4. `get_scripting_context(section="physics")` — trigger section
5. `validate_behavior(source, "DoorLogic.ts")`

### Do not
- Use `OnStart` expecting trigger overlap — Event Messages and hooks use **OnMessage** / **OnTrigger***.
- Put trigger logic on the trigger volume unless you also listen there.

---

## Playbook: moving-platform

### Blender setup
1. Platform object: COLLIDER + RIGIDBODY → body type **Animated** (kinematic).
2. SCRIPT with patrol behavior on same object.

### Behavior file
- Recipe: `patrol-oscillate`
- Reference: `Patrol.ts`
- **OnStart:** `setMotionType(PhysicsMotionType.ANIMATED)` if not already Animated in Blender.

### MCP steps
1. `route_task(intent="moving platform", className="Platform")`
2. `get_physics_movement(mode="animated-continuous")`
3. `get_recipe_template(recipe="patrol-oscillate", className="Platform")`
4. `get_fragment(name="make-body-kinematic")`
5. `validate_behavior(source, "Platform.ts")`

### Do not
- Leave body as DYNAMIC while writing `node.position` each frame.

---

## Playbook: waypoint-patrol

### Blender setup
1. SCRIPT on moving object.
2. @exposed list of **vector3** waypoints — author fills points in Blender after Sync.

### Behavior file
- Recipe: `waypoint-path`
- Reference: `Waypoints.ts`
- List starts `[]` in code — level author adds points in inspector.

### MCP steps
1. `route_task(intent="patrol waypoints", className="PatrolRoute")`
2. `get_recipe_template(recipe="waypoint-path", className="PatrolRoute")`
3. `get_physics_movement()` if body exists
4. `validate_behavior(source, "PatrolRoute.ts")`

---

## Playbook: train-on-path

### Blender setup
1. Waypoint empties in scene; SCRIPT on train body.
2. @exposed **entity list** — author picks waypoint objects in Blender (pin inspector + Add Selected).
3. Rigid Body **Animated** on train.
4. Input actions: Throttle Up / Throttle Down (or use scene default map).

### Behavior file
- Recipe: `path-follow-advanced`
- Reference: `TrainBehavior.ts`
- `disablePreStep = false` when body exists.

### MCP steps
1. `route_task(intent="train follows path", className="TrainDriver")`
2. `list_scene_entities(level="Train Scene", filter="waypoint")`
3. `list_input_actions()`
4. `get_physics_movement(mode="animated-continuous")`
5. `get_recipe_template(recipe="path-follow-advanced", className="TrainDriver")`
6. `get_behavior("TrainBehavior")`
7. `validate_behavior(source, "TrainDriver.ts")`

---

## Playbook: rover-drive

### Blender setup
1. Each wheel: COLLIDER + RIGIDBODY + **CONSTRAINT** (HINGE) to chassis — authored in Blender.
2. Chassis: SCRIPT `RoverDrive.ts`.
3. @exposed entity list **Wheels** — pick wheel objects in Blender.

### Behavior file
- Recipe: `rover-wheel-drive`
- Reference: `CarController.ts`
- Resolve hinges via `GetAttachmentsOfType("CONSTRAINT")` — do not build constraints in code.

### MCP steps
1. `route_task(intent="rover wheel drive", className="RoverDrive")`
2. `list_scene_entities(level="…", filter="wheel")`
3. `list_input_actions()`
4. `get_recipe_template(recipe="rover-wheel-drive", className="RoverDrive")`
5. `get_behavior("CarController")`
6. `get_fragment(name="set-hinge-motor-velocity")`
7. `validate_behavior(source, "RoverDrive.ts")`

### Do not
- Rotate wheel `node.rotation` every frame when hinge motors drive physics.
- Parent wheel under chassis — constrained bodies work best as siblings.

---

## Playbook: spin-object

### Blender setup
- SCRIPT on object to spin. No physics required.

### Behavior file
- Recipe: `constant-rotate`
- Reference: `Rotator.ts`

### MCP steps
1. `get_recipe_template(recipe="constant-rotate", className="Spinner")`
2. `validate_behavior(source, "Spinner.ts")`

---

## Playbook: look-at-target

### Blender setup
- @exposed **entity** field for target — pick in Blender.

### Behavior file
- Recipe: `look-at-target`
- Guard `target !== null` in `OnUpdate`.

### MCP steps
1. `list_scene_entities` for target name
2. `get_recipe_template(recipe="look-at-target", className="Turret")`
3. `validate_behavior(source, "Turret.ts")`

---

## Playbook: animation-cycle

### Blender setup
- SCRIPT on **armature** (not skinned mesh).
- Stashed/pushed **Actions** on that entity (clip names = Action names).

### Behavior file
- Recipe: `animation-cycle`
- Reference: `ClipSwitcher.ts`
- Prefer **`animator-fsm`** for real Idle/Walk state machines.

### MCP steps
1. `get_engine_basics(topic="components-vs-behaviors")`
2. `get_recipe_template(recipe="animation-cycle", className="AnimCycler")`
3. `get_scripting_context(section="animation")`
4. `validate_behavior(source, "AnimCycler.ts")`

---

## Playbook: animator-fsm

### Blender setup
- Stash/push **Actions** (Idle, Walk, …) on the **armature** — one strip per NLA track. Clip names = **Action** names (or a renamed NLA track), not strip labels.
- **ANIMATOR** component → **Edit Animator** (opens this object’s graph; clip dropdowns follow the graph owner): Entry → Idle, Parameter `Speed`, Transitions Idle↔Walk on `Speed`.
- Sync Parameters on the component. Turn **off** Animation autoplay.
- Optional SCRIPT `DriveAnimator` (or your own) on the same armature to set `Speed` from Move.
- Trim looping Actions so the last frame matches the first (avoid end-of-cycle holds).

### Behavior file
- Recipe: `animator-driver` (thin input driver) — or hand-write like `DriveAnimator.ts`
- Reference: `DriveAnimator.ts`
- Do **not** reimplement the FSM in TypeScript when ANIMATOR can own it.

### MCP steps
1. `get_recipe_template(recipe="animator-driver", className="DriveAnimator")`
2. `get_scripting_context(section="animation")`
3. `get_fragment(name="set-animator-float")`
4. `get_engine_basics(topic="components-vs-behaviors")`
5. `validate_behavior(source, "DriveAnimator.ts")` (if writing a driver script)

---

## Playbook: reveal-on-trigger

### Blender setup
- Hidden object: viewport eye off OR Collider › Make Invisible.
- Trigger → Event Message (Trigger Enter) → message `"reveal"` → target = hidden object's behavior.

### Behavior file
- Recipe: `reveal-on-message`
- Sets `this.node.isVisible = true` in `OnMessage`.

### MCP steps
1. `get_recipe_template(recipe="reveal-on-message", className="Revealable")`
2. `get_fragment(name="reveal-entity")`
3. `validate_behavior(source, "Revealable.ts")`

---

## Playbook: sound-on-trigger

### Blender setup
- **AUDIO** component on entity (file copied on export).
- Trigger sends message; behavior plays sound.

### Behavior file
- Recipe: `sound-on-message`
- `GetSound("stem")` — stem = audio filename without path/extension.

### MCP steps
1. `get_recipe_template(recipe="sound-on-message", className="DoorSound")`
2. `get_scripting_context(section="audio")` — see messaging section in full context
3. `validate_behavior(source, "DoorSound.ts")`

---

## Playbook: update-msdf-label

### Blender setup
- **MSDF_TEXT** component (font JSON + atlas) on entity.

### Behavior file
- Recipe: `msdf-label-update`
- `GetTextRenderer(fontStem)` → `clearParagraphs` → `addParagraph`.

### MCP steps
1. `get_recipe_template(recipe="msdf-label-update", className="ScoreLabel")`
2. `get_fragment(name="update-msdf-text")`
3. `validate_behavior(source, "ScoreLabel.ts")`

### Do not
- Import or construct `TextRenderer` yourself.

---

## Playbook: orbit-camera

### Blender setup
- Usually an empty with SCRIPT; @exposed target entity.
- Author FOV / clip on the Blender camera — the script copies them with `CopyLens`.

### Behavior file
- Recipe: `camera-follow`
- Reference: `TrainCamera.ts`
- Sets `scene.activeCamera` — only one active camera.
- Must call `FindCameraForNode` + `CopyLens` before activating a script-built camera.

### MCP steps
1. `list_scene_entities` for target
2. `get_recipe_template(recipe="camera-follow", className="OrbitCam")`
3. `get_fragment(name="copy-lens-from-authored-camera")`
4. `get_scripting_context(section="cameras")`
5. `validate_behavior(source, "OrbitCam.ts")`

### Do not
- Use for globe/planet — use Blender **GEOSPATIAL** camera instead.
- `new` a camera without `CopyLens` — authored FOV will be ignored.

---

## Playbook: geospatial-flyto

### Blender setup
- Scene camera: **CAMERA** component type **GEOSPATIAL**; planet at origin; radius set.
- SCRIPT on any entity; @exposed fly-to target.

### Behavior file
- Recipe: `geospatial-camera-flyto`
- Cast `scene.activeCamera` to `GeospatialCamera`; `flyToPointAsync`.

### MCP steps
1. `get_engine_basics(topic="blender-vs-behavior")`
2. `get_recipe_template(recipe="geospatial-camera-flyto", className="MapFlyTo")`
3. `get_fragment(name="geospatial-camera-flyto-point")`
4. `get_scripting_context(section="cameras")`
5. `validate_behavior(source, "MapFlyTo.ts")`

---

## Playbook: debug-triggers

### Blender setup
- COLLIDER **Is Trigger** on the debug volume.
- Attach the script to **that same entity** (the one that owns the trigger body).

### Behavior file
- Recipe: `trigger-logger`
- Reference: `TriggerLogger.ts`
- Uses `OnTriggerEnter` / `OnTriggerExit` — **not** `body.getCollisionObservable()`.

### MCP steps
1. `get_recipe_template(recipe="trigger-logger", className="TriggerDebug")`
2. `validate_behavior(source, "TriggerDebug.ts")`

### Do not
- Subscribe with `body.getCollisionObservable()` — that stream is solid collisions only.
- For solid + trigger logging, use recipe `collision-probe` instead.

---

## Playbook: spawn-prefab-instances

### Blender setup
1. Place a **template** in the level — either link a collection from another
   `.blend` (ENTITY picker → link button / `bjs.link_prefab`, or File → Link +
   library override) or use any in-scene hierarchy with components.
2. Hide the template in the viewport (eye icon) when it should never appear at
   load — or mark `@exposed({ spawnTemplate: true })` on deferred spawner fields
   so the engine hides referenced templates before `OnStart`. Pass
   `keepTemplate: true` on `Spawn` when the source must stay visible through
   spawn. `HideTemplate` is for hiding without spawning.
3. SCRIPT on a spawner object; `@exposed({ type: "entity" })` prefab → pick the
   template root.
4. Placement options:
   - **Point list:** `@exposed` vector3 list of spawn points; or
   - **Paint-scatter (`populateprefabs`):** pick a target mesh, vertex-paint
     bright values where instances should appear. Leave color kind blank
     (auto). Soft paint → luminance threshold ~`0.5` (not pure white). Blender
     may export paint as `COLOR_1` with a fake all-white `COLOR_0` — the engine
     loads `COLOR_1+`; do not hard-code Blender names like `Color.001`.

### Behavior file
- Recipe: `scatter-prefab-spawner`
- Reference: `populateprefabs.ts`
- Core call: `await this.spawner.Spawn(this.prefab, { position })`
- Multi-spawn loops: `deferShadowRefresh: true` on each call, then
  `this.spawner.FlushSpawnShadowRefresh()` once (see `populateprefabs.ts`).
  Skip defer for interval spawners — register shadows per spawn.

### MCP steps
1. `route_task(intent="spawn prefab instances", className="ScatterSpawner")`
2. `get_recipe_template(recipe="scatter-prefab-spawner", className="ScatterSpawner")`
3. `get_fragment(name="spawn-prefab-instance")`
4. `get_fragment(name="paint-scatter-vertex-colors")` — when placing from a Color Attribute
5. `get_scripting_context(section="prefab-spawn")`
6. `list_scene_entities` — real template entity names
7. `validate_behavior(source, "ScatterSpawner.ts")`

### Do not
- `node.clone()` + copy attachments / metadata — no physics, no OnStart, stale GUID refs.
- Expect a `Level` field on Behavior — spawn goes through `this.spawner` only.
- Put REFLECTION_PROBE on templates (skipped at spawn in v1).
- Point template LOD levels at meshes outside the template hierarchy — keep LOD targets inside the subtree so each instance clones its own.
- Expect a spawned camera to activate itself — cameras spawn per instance (targets remapped) but are never made active; set `scene.activeCamera = handle.cameras[0]` yourself.
- Defer shadow refresh in interval spawners — fish/animal spawns seconds apart need immediate registration; batch defer only for tight multi-spawn loops.
- Assume spawned skinned meshes share the template animation phase — spawn isolates skeletons and clones AnimationGroups; templates hide at spawn start by default (`keepTemplate: true` to retain; `spawnTemplate: true` on @exposed fields for deferred spawners).
- Sample only `VertexBuffer.ColorKind` with `RGB >= 0.99` for paint masks — that hits Blender's fake white `COLOR_0` and scatters everywhere (or misses soft strokes).

---

## Playbook: pool-spawner

### Blender setup
1. Link or place **prefab template(s)** in the level (fish, animals, …) — hide templates in the viewport when only clones should appear.
2. Add a **spawn volume** empty with a box/sphere **trigger collider** (for position sampling).
3. Optional: trigger colliders to gate spawning (e.g. train enters water zone).
4. SCRIPT on a spawner object; `@exposed` prefab list + spawn volume entity picks.

### Behavior file
- Recipe: `pool-prefab-spawner`
- Reference: `animalSpawner.ts`
- Core spawn call:

```ts
await this.spawner.Spawn(template, {
  position: worldPosition,
  parent: null,
  scaling: Vector3.Zero(),
});
```

- Grow instances by lerping `node.scaling` toward `template.node.scaling` in `OnUpdate`.
- Track lifetimes; shrink then dispose; refill pool to `spawnCount`.
- **Do not** use `deferShadowRefresh` — spawns are spread over time.

### MCP steps
1. `route_task(intent="pool spawner with grow shrink lifecycle", className="PoolSpawner")`
2. `get_recipe_template(recipe="pool-prefab-spawner", className="PoolSpawner")`
3. `get_behavior("animalSpawner")` or `find_similar_behavior(query="animalSpawner", includeSource=true)`
4. `get_scripting_context(section="prefab-spawn")`
5. `get_fragment(name="spawn-prefab-instance")`
6. `validate_behavior(source, "PoolSpawner.ts")`

### Do not
- Parent spawned instances under the spawner if they must stay fixed in world space — use `parent: null`.
- Spawn at full scale and patch afterward — pass zero scale in `SpawnOptions`.
- Batch shadow deferral across interval spawns — register each instance immediately.

---

## Engine basics (in MCP)

These topics are available via `get_engine_basics(topic=…)`:

| Topic | Covers |
|-------|--------|
| `architecture` | glb + scene.json, GUIDs |
| `frame-loop` | OnStart vs OnUpdate, deltaSeconds |
| `components-vs-behaviors` | SCRIPT vs TAG/COLLIDER |
| `load-order` | What exists in OnStart vs OnPostReady |
| `blender-vs-behavior` | What to author where |

Human chapters: `docs/engine/01-ARCHITECTURE.html` through `docs/engine/05-SCRIPTING.html`.
