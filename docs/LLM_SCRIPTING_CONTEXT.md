# Babylon Level Kit — Behavior Authoring Context

Context for an LLM **generating a behavior script** for this engine. Each behavior
is one self-contained `.ts` file the runtime loads and runs per-frame. This file
is the full contract; you do not need the engine internals to write one.

## File contract (every behavior)

- **One class per file**, `export default`, **class name === file name** (the
  filename stem is the Blender registry key: `behaviors/Patrol.ts` → `"Patrol"`).
- Lives in `src/behaviors/`.
- Import the engine package: `from "@bjs/engine"` (the workspace package).
- Import Babylon types from `@babylonjs/core`.

```ts
import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

export default class MyBehavior extends Behavior
{
  // @exposed fields + lifecycle methods go here
}
```

## Lifecycle methods (override only what you need)

```ts
OnStart(): void                       // once, after the level + all @exposed refs are resolved
OnUpdate(deltaSeconds: number): void  // every frame; deltaSeconds = seconds since last frame
OnDestroy(): void                     // on level dispose — unsubscribe observers, dispose constraints
OnMessage(message: string, source: Entity): void  // a message arrived (trigger event or SendMessage)
```

- Names are **PascalCase** (`OnStart`, not `onStart`) — a lowercase name silently
  never runs.
- `@exposed` values and entity references are applied **before** `OnStart`.
- Scale continuous motion by `deltaSeconds`. (Setting a Babylon *velocity* is
  already per-second — don't multiply those by `deltaSeconds`.)
- Cross-entity `OnStart` order is unspecified; guard references for `null`.

## Members available on `this`

```ts
this.entity : Entity          // the entity this behavior is attached to
this.scene  : Scene           // the Babylon scene
this.node   : TransformNode   // shortcut === this.entity.node
this.input? : InputActionMap  // scene default map — injected when you have no @inputMap fields
```

## Entity API

```ts
entity.id: string                 // Blender GUID (readonly)
entity.name: string               // Blender object name (readonly)
entity.node: TransformNode        // its Babylon node (readonly)
entity.tag: string                // from a TAG component ("Untagged" default)
entity.body?: PhysicsBody         // Havok V2 body — present iff a COLLIDER/RIGIDBODY was authored
entity.animations: AnimationGroup[]               // glTF clips targeting this entity
entity.sounds: StaticSound[]                      // sounds from AUDIO components (audio engine v2)
entity.GetBehavior<T>(Ctor): T | undefined        // another behavior on the same entity
entity.GetAnimation(name): AnimationGroup | undefined  // exact match, then contains
entity.GetSound(name): StaticSound | undefined         // exact match, then contains
entity.SendMessage(message, source): void              // deliver to all its behaviors' OnMessage
```

## `@exposed` — fields editable per-object in Blender

The decorator marks a field so Blender shows a widget for it and writes the edited
value into the manifest; the runtime applies it before `OnStart`. **The decorator
name is lowercase `@exposed` — never rename it** (Blender parses the literal token).

```ts
@exposed() speed = 90;                                       // number  -> float
@exposed({ min: 0, max: 720, step: 5, label: "Speed" }) s = 1; // hints are optional
@exposed() enabled = true;                                   // boolean -> checkbox
@exposed() title = "hi";                                     // string
@exposed() dir: [number, number, number] = [0, 1, 0];       // 3-array -> vector3
@exposed({ type: "color" }) tint = new Color3(1, 0, 0);     // color picker
@exposed({ type: "entity" }) target: Entity | null = null;  // object picker
@exposed({ type: "enum", options: ["idle","walk"] }) state = "idle"; // dropdown -> string
@exposed({ type: "list", of: "float" }) speeds = [1, 2];    // add/remove list
@exposed({ type: "list", of: "entity" }) targets: (Entity | null)[] = []; // entity list
```

Options object: `{ min?, max?, step?, label?, type?, options?, of? }`.
`type` ∈ `float | int | bool | string | vector3 | color | entity | enum | list`.
`of` (list element type) ∈ `float | int | string | bool | vector3 | color | entity`.

**Authoring rules that affect codegen:**
- Default must be a **single-line literal** (`= 45` / `= true` / `= "x"` /
  `= [0,1,0]` / `= null` / `= []`). Computed or multi-line defaults are NOT parsed
  by Blender (the field keeps its code default at runtime).
- Entity references need the explicit `type: "entity"` hint and an `Entity | null`
  field type. Entity lists use `(Entity | null)[]` and **start empty**.
- `vector3`/`color` values arrive as Babylon `Vector3`/`Color3` at runtime (coerced
  from arrays); plain arrays stay arrays.

## Reaching other objects

Prefer an `@exposed({ type: "entity" })` field (the author picks the target in
Blender; it resolves to an `Entity` before `OnStart`). If you only have a node:
`node.metadata.bjsEntity` is the back-reference to its `Entity`.

## Physics quick reference

`entity.body` is a Havok V2 `PhysicsBody`. Common calls:

```ts
entity.body?.applyImpulse(force, point);
entity.body?.setLinearVelocity(v);   entity.body?.getLinearVelocityToRef(out);
entity.body?.setAngularVelocity(v);  entity.body?.getAngularVelocityToRef(out);
entity.body?.setMotionType(PhysicsMotionType.ANIMATED); // imports from @babylonjs/core
```

- To move/rotate a body by hand each frame, set it to `ANIMATED` (kinematic) first,
  or drive it via velocity. Don't fight the solver by writing `node.position` on a
  DYNAMIC body (`disablePreStep` defaults to true, but sync still wins after the
  physics step).
- MESH-shaped colliders can't be DYNAMIC (Havok limitation) — author CONVEX for
  moving bodies.
- **Joints are authored in Blender, not in behavior scripts.** There is no
  `@exposed` for constraints — add a **Constraint** component in the N-panel.
  The loader builds them in a post-pass and stores them on the `Level` object
  (`level.constraints` in app/load code; behaviors don't receive a `level` handle).

### Constraint types (author in Blender)

| Preset | What it does |
|--------|----------------|
| Fixed | Weld — no relative motion |
| Ball & Socket | Free rotation at the pivot |
| Hinge | One rotation axis (frame X); optional limits + motor |
| Slider | One slide axis (frame X); optional limits + motor |
| Spring | Sprung slide on frame X; **locks all relative rotation** |
| **Custom (6DoF)** | Six rows (Linear/Angular X/Y/Z): each **Free**, **Locked**, **Limited**, or **Spring** |

**Custom** is one `Physics6DoFConstraint` — use it when presets would fight. Example:
trailer hitch on the rear chassis → Target = front chassis, Axis = vehicle width (X),
pivot at hitch; **Angular X** = Free (relative pitch), **Linear Y** = Spring
(±0.15 m), everything else Locked. Do **not** stack Hinge + Spring on the same two
bodies (Spring welds rotation; you get both pitching the same way).

**Authoring pitfalls (mention in comments if the behavior drives a constrained rig):**
- Constrained bodies work best as **siblings**, not parented to each other.
- Don't overwrite `node.rotation` every frame on entities that have hinge-driven
  `PhysicsBody` wheels — visual spin should be visual-only meshes, or skip the
  override (see `CarController.ts`: arcade visuals vs physics wheels).
- Spring travel limits are **meters**; hinge limits are **degrees**.

Hand-built `Physics6DoFConstraint` in code is still possible — reuse
`ComputeConstraintFrame` / limit patterns from `subsystems/constraints.ts`.

## Input

The input system clones Unity's Input System: an **InputActionAsset** of
**Action Maps** ("Player", "UI") containing **Actions** ("Jump", "Move") with
**Bindings** (keys, gamepad buttons/sticks, and 1D-axis / 2D-vector
composites). Maps enable/disable as a unit. The scene's asset and **Scene
Default** map are authored in Blender's **Input Actions** panel and exported as
`scene.inputActions` + `scene.defaultInputMap` in the manifest. The canvas needs
focus (the user clicks the viewport once).

**Three ways to get a map handle** (all injected before `OnStart`):

```ts
import { Behavior, inputMap } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";

export default class MyBehavior extends Behavior
{
  // 1. Explicit map name:
  @inputMap("Player") player!: InputActionMap;

  // 2. Scene default (same map as Blender's "Scene Default" picker):
  // @inputMap() input!: InputActionMap;

  // 3. No @inputMap at all — use this.input (also the scene default)

  OnStart(): void
  {
    this.player.FindAction("Jump")?.performed.add(() => { /* ... */ });
  }

  OnUpdate(): void
  {
    const move = this.player.FindAction("Move")?.ReadVector2() ?? { x: 0, y: 0 };
    const sprinting = this.player.FindAction("Sprint")?.IsPressed() === true;
    const jumped = this.player.FindAction("Jump")?.WasPressedThisFrame() === true;
  }
}
```

`@inputMap` stays **lowercase** (Blender parses the literal token, like
`@exposed`). Actions have a type (`BUTTON` / `VALUE` / `PASSTHROUGH`) and a
control type (`BUTTON` / `AXIS` / `VECTOR2`). Polling: `ReadValue()` (scalar),
`ReadVector2()`, `IsPressed()`, `WasPressedThisFrame()`,
`WasReleasedThisFrame()`, `WasPerformedThisFrame()`. `InputManager.actions` is
the whole asset (`InputManager.FindAction("Player/Jump")` also works); maps can
be toggled with `map.Enable()` / `map.Disable()`.

If the panel is empty at export, the built-in "Player" map (Move/Look/Jump/
Interact/Sprint/Crouch) is serialized anyway; first export also seeds the panel
so you can edit it. Scripts should reference **action names**, never key codes.
If the app has a generated `src/InputActions.ts` (from `npm run input:gen`
reading `input.inputactions.json`), import its constants —
`import { PlayerActions } from "../InputActions"` then
`this.player.FindAction(PlayerActions.Jump)` — so typos fail at compile time.
If a behavior needs a NEW action, name it and note that it must be added in the
Input Actions panel (and constants regenerated). See `InputMover.ts`.

For input the asset doesn't cover (pointer events, custom keys), fall back to
scene observables — never global `window` listeners — and remove them in
`OnDestroy`:

```ts
this.observer = this.scene.onKeyboardObservable.add((keyboardInfo) => { /* ... */ });
// OnDestroy: this.scene.onKeyboardObservable.remove(this.observer);
```

## Animation

For rigged characters, the behavior must be attached to the **armature**
entity (components on a skinned mesh do nothing — glTF skinning ignores the
mesh node's transform, and clips target the joints under the armature).

```ts
this.entity.GetAnimation("Walk")?.start(true);  // loop
for (const group of this.entity.animations) { group.stop(); }
```

## Audio & messaging

```ts
this.entity.GetSound("door")?.play();           // sound names = file stem ("audio/door.mp3" -> "door")
otherEntity.SendMessage("open", this.entity);   // their behaviors get OnMessage("open", source)
```

Trigger colliders can be authored in Blender to send a message on enter — receive
it by overriding `OnMessage`. Sounds with Auto Play start after the browser's
first user gesture (autoplay policy); calling `.play()` from input handlers is
always safe.

## Style (generated code must match)

PascalCase methods/functions; camelCase, fully-descriptive fields & locals (no
`i`/`dt`/`tmp`); Allman braces (opening brace on its own line) for methods, `if`,
`for`; braces on every `if`; explicit `: void`; explicit null checks
(`if (x !== null)`), except real booleans. The `@exposed` and `@inputMap`
decorators stay lowercase. Full rules: `STYLE_GUIDE.md`.

## Complete example

```ts
// src/behaviors/HoverBob.ts
import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/** Bobs the node up and down, and faces an optional target while doing so. */
export default class HoverBob extends Behavior
{
  @exposed({ min: 0, max: 5, step: 0.1, label: "Amplitude (m)" })
  amplitude = 0.5;

  @exposed({ min: 0.1, max: 4, label: "Period (s)" })
  period = 2;

  @exposed({ type: "entity", label: "Face target" })
  target: Entity | null = null;

  private restY = 0;
  private elapsedSeconds = 0;

  OnStart(): void
  {
    this.restY = this.node.position.y;
  }

  OnUpdate(deltaSeconds: number): void
  {
    this.elapsedSeconds += deltaSeconds;

    const offset = Math.sin((this.elapsedSeconds / this.period) * Math.PI * 2) * this.amplitude;
    this.node.position.y = this.restY + offset;

    if (this.target !== null)
    {
      this.node.lookAt(this.target.node.getAbsolutePosition());
    }
  }
}
```
