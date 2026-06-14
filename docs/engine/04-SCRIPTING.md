# 04 — Scripting: Entity, Behavior, @exposed, @inputMap, Input

[← Index](00-INDEX.md) · Prev: [Load Pipeline](03-LOAD-PIPELINE.md) · Next: [Physics →](05-PHYSICS.md)

## Entity (`core/Entity.ts`)

The runtime wrapper around one Blender object: `id` (GUID), `name`, `node`
(the glb TransformNode), `tag`, `behaviors`, `body?` (Havok), `animations`
(its AnimationGroups), `sounds` (its StaticSounds). Methods:
`GetBehavior(Ctor)`, `GetAnimation(name)`, `GetSound(name)` (exact match then
contains), and `SendMessage(message, source)` → every behavior's `OnMessage`.

Three ways to reach another entity: an `@exposed({type:"entity"})` field
(cleanest), `node.metadata.bjsEntity` from a node, or `level.ById`/`ByTag`.

## Behavior lifecycle (`scripting/Behavior.ts`)

`OnStart` (once, after the whole level + all references resolved — cross-entity
order unspecified, guard nulls) · `OnUpdate(deltaSeconds)` (every frame;
seconds) · `OnDestroy` (level dispose; remove observers, dispose constraints) ·
`OnMessage(message, source)` (a [trigger event](05-PHYSICS.md#triggers) or
`SendMessage` arrived). Injected before OnStart: `entity`, `scene`; `node` is a
getter for `entity.node`. Names are PascalCase — a lowercase `onStart` silently
never runs (it stops overriding the base hook).

## The registry contract (`scripting/BehaviorRegistry.ts`)

`BehaviorRegistry` maps a SCRIPT component's name → Behavior class (it
registers *behaviors*; TAG/COLLIDER/etc. are applied directly by the loader).
`main.ts` auto-registers every file in `behaviors/` **by filename stem** via
`import.meta.glob` + `AutoRegisterBehaviors` — exactly the key Blender's
"Open Script…" picker stores. Hence the contract: **one class per file, file
named after the class, `export default`.**

## `@exposed` (`scripting/exposed.ts`)

Marks a field editable per-object in Blender. The decorator only records
name + UI hints in a WeakMap; `ApplyExposedVars` writes the manifest's stored
values onto the instance **before OnStart** (entity refs deferred to the
loader's second pass; lists handled per element type). Types:
`float int bool string vector3 color entity enum list` (+ `of` for list
elements). Blender can't run TS — `core/script_parse.py` regex-parses the source —
so: **single-line literal defaults only**, explicit `type:"entity"` hints,
entity lists start `[]`, and the decorator name stays lowercase (the
cross-language contract; the one PascalCase exception, see
[STYLE_GUIDE](../STYLE_GUIDE.md)). Press **Sync** in Blender after changing
exposed fields.

## Input (`src/input/`) <a name="input"></a>

A Unity Input System clone: `InputManager` owns the device state (keyboard +
first gamepad, deadzoned) and the project-wide `InputActionAsset` of **Action
Maps** > **Actions** > **Bindings** (direct key/button/axis/stick reads, plus
`1DAXIS`/`2DVECTOR` composites). Actions have a type (`BUTTON`/`VALUE`/
`PASSTHROUGH`) and fire Unity-style `started`/`performed`/`canceled`
callbacks; polling: `ReadValue()`, `ReadVector2()`, `IsPressed()`,
`WasPressedThisFrame()`, `WasReleasedThisFrame()`, `WasPerformedThisFrame()`.

The asset and **Scene Default** map are authored in Blender's **Input Actions**
panel (the `input_actions/` package: `properties.py` / `serialize.py` /
`operators.py`, drawn by `ui/input_panel.py`) and exported as
`scene.inputActions` + `scene.defaultInputMap`. `LevelLoader` calls
`InputManager.LoadAsset` before behaviors are built. Map injection
(`core/loader/entityBuilder.ts` → `InjectInputMaps`):

- `@inputMap("Name")` on a field → that map;
- `@inputMap()` or `@inputMap("")` → scene default;
- no `@inputMap` fields → `behavior.input` receives the scene default.

`@inputMap` stays lowercase like `@exposed` (Blender scans the literal token).
If the panel is empty at export, the built-in "Player" map is serialized anyway.
Lifecycle is automatic: `Level.Begin` attaches and enables every map, `RunFrame`
processes actions *before* behaviors and clears device edges in
`InputManager.EndFrame` after, `Dispose` detaches. Babylon camera key schemes
intentionally stay native (cameras consume keycode arrays).

Continue: [Physics →](05-PHYSICS.md)
