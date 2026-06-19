# Babylon Level Kit — Code Style Guide

All TypeScript in this project follows C#-inspired conventions for readability.
Follow these rules when writing or modifying engine code or behaviors. The engine
guide (`docs/engine/00-INDEX.md`) covers *how the engine works*; this file covers *how
the code is written*.

---

## Naming

- **PascalCase for all methods and functions:** `BuildNodeIndex()`,
  `ResolveReferences()`, `ProcessCameraForEntity()`, `OnStart()`. This is the rule
  that ripples — renaming an exported function means updating every caller, so do
  it deliberately and all at once.
- **Fields, properties, and getters stay camelCase.** They're treated as variables
  (`entity.node`, `level.entities`, the `Behavior.node` getter). Only things you
  call with `()` are PascalCase.
- **camelCase for variables and parameters, but fully descriptive** — never single
  letters or vague abbreviations:
  - `entityData` not `data`
  - `sceneNode` not `node`
  - `builtCamera` not `built`
  - `reference` not `ref`
  - `cameraComponent` not `camComp`
- **Expand common JS shorthand:** `response` not `res`, `error` not `err`,
  `element` not `el`.
- **Loop variables are not exempt:** `index` not `i`, unless it is a trivial
  numeric counter with no semantic meaning.

### Exception: `@exposed` and `@inputMap` stay lowercase

`@exposed` and `@inputMap` are **cross-language contracts**, not ordinary code.
The Blender add-on's `core/script_parse.py` scans behavior `.ts` sources for the literal
tokens `@exposed` and `@inputMap("…")` to build its UI and validate Input Actions
references. Renaming them to `@Exposed` / `@InputMap` would silently break script
authoring. They are deliberate violations of the PascalCase-function rule.

---

## Braces and spacing

- **Allman style:** opening braces on their own line for functions, methods,
  classes, `if`/`else`, `for`/`while`, and `switch`.
- **Always use braces** for control-flow blocks, even single-line `if`s — never
  omit them.
- **Inline arrow callbacks are the exception:** short lambdas passed as callbacks
  (`observable.add(() => { … })`, `.map(value => …)`) keep the brace on the arrow
  line. Allman on a one-line lambda reads worse.
- One blank line between logical sections within a function.

---

## Functions and methods

- **Extract any block longer than ~40 lines into its own named private method.**
  For example, `LevelLoader.Load` orchestrates `core/loader/` modules
  (`FetchAndValidateManifest`, `ProcessEntity`, `InjectInputMaps`, …); and
  `ResolveCameraTargets` into `ResolveFollowCameras` / `ResolveArcCameras` /
  `ResolveOffsetCameras`.
- **Always declare an explicit `void` return type** on methods that return nothing.
- **Name a function for what it accomplishes, not what it touches:**
  `ProcessCameraForEntity()` not `HandleCamera()`.

---

## Comments

- JSDoc (`/** */`) on every method and class, describing **intent** rather than
  mechanics.
- Inline comments explain **why**, not **what** — remove any comment that merely
  restates the code in English.
- Use a single descriptive comment above a logical block rather than line-by-line
  narration.

---

## Types and null handling

- **Prefer explicit null/undefined checks over truthiness:** `if (value !== null)`
  / `if (value === undefined)`, not `if (value)`. (Negating a real boolean,
  `if (!hasGeometry)`, is fine — the rule targets null/undefined ambiguity.)
- **Exception: Babylon `Nullable<T>` values.** Some Babylon getters (e.g.
  `scene.activeCamera`, `scene.getPhysicsEngine()`) are typed `T | null` but can
  return `undefined` at runtime, and `strict` mode forbids comparing a `T | null`
  to `undefined`. Use a truthiness check (`if (!scene.activeCamera)`) for those,
  with a comment saying why.
- **Avoid `any`;** use `unknown` and narrow it explicitly with a type guard.
- **Spell out multi-type union annotations on their own lines** when they exceed
  one type (in type aliases and interface members). Short two-type parameter unions
  (`FreeCamera | ArcRotateCamera`) stay inline — breaking those across lines reads
  worse.

---

## General

- **No chained ternaries** (a single ternary is fine).
- **No implicit returns in multi-line arrow functions** — use an explicit `return`.
- **Prefer `for...of` over `.forEach()` callbacks.** Keep `.map` / `.filter` /
  `.find` / `.some` — those are transformations, not iteration.
- **Group related `const` declarations** at the top of a scope rather than
  scattering them inline.

---

## Terminology: component vs behavior

These two words name different things; keep them distinct.

- A **component** is authored *data* on an entity — the `Component` union
  (`TAG`, `COLLIDER`, `RIGIDBODY`, `SCRIPT`, `CAMERA`), serialized from Blender.
- A **behavior** is a runtime *script class* (`extends Behavior`), instantiated
  from a `SCRIPT` component.

Data vs code. This differs from Unity, where a script *is* a `Component` — here
they're deliberately separate. Accordingly, `BehaviorRegistry` registers
*behaviors*, not components: `TAG` / `COLLIDER` / `RIGIDBODY` / `CAMERA` are applied
directly by the loader.

At runtime, successfully applied components are recorded on
`entity.attachments` (`core/attachments.ts`) — one row per component, each pairing
manifest `data` with its runtime object (`body`, `behavior`, `sound`, …). Query
with `GetAttachment` / `GetAttachmentsOfType` / `HasAttachment`; convenience
fields (`entity.body`, `entity.behaviors`, …) mirror attachments for now.
