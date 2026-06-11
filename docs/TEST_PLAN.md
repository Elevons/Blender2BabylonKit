# Test Plan — v0.25 → v0.29

Manual verification for everything shipped since v0.24 (the C#-style rewrite).
Run top to bottom once; later sections assume the setup from §0. Each test lists
**Steps** and **Expect**. Anything that fails: note the section number + the
browser/Blender console output.

## 0. Setup + monorepo smoke test (once)

A *smoke test* = the quickest "does it even start" check, before any detailed
testing. v0.29 restructured the repo into npm workspaces (`packages/engine` +
`apps/playground`), so the smoke test now proves the workspace link resolves:

1. `npm install` **at the repo root** — must link `@bjs/engine` into
   `apps/playground/node_modules` (a symlink) and pull `@babylonjs/inspector`.
2. `npm run typecheck` — runs `tsc --noEmit` over the engine package AND the
   app. **Must pass with zero errors.** This gates the whole plan: the sandbox
   the code was written in cannot run the TypeScript compiler, so this is the
   first real compile of everything since v0.24 — including the new
   `@bjs/engine` import resolution.
3. `npm run dev` (root) — Vite serves the playground; the page must load with
   no import errors in the console. If `@bjs/engine` fails to resolve here but
   typecheck passed, the symlink is the suspect (`ls -la
   apps/playground/node_modules/@bjs`).
4. Install `babylon_level_kit_extension.zip` in Blender (Preferences → Get
   Extensions → Install from Disk), replacing any older version. Restart
   Blender to be safe.
5. Make a test scene: a ground plane (Collider, Static Rigid Body), a cube
   ~3 m above it (Collider + Dynamic Rigid Body), one Sun lamp, one camera.
   Export once via **Export Level** to `apps/playground/public/levels/`, then
   point `main.ts`'s `loader.Load(...)` at your `.scene.json` name.
6. Open the dev URL, click the viewport once (keyboard focus).
   **Expect:** cube falls and lands on the plane.

### 0.b Scaffolder check (v0.29)
- **Steps:** `npm run create -- --name smoke-test`, then `npm install`, then
  `npm run dev --workspace apps/smoke-test`.
- **Expect:** the new app starts (it will 404 its level — fine); its
  `node_modules/@bjs/engine` is a symlink to `packages/engine`. Delete
  `apps/smoke-test` afterwards.

## 1. v0.25 — iteration & debugging

### 1.1 Inspector key
- **Steps:** press **I**. Press **I** again.
- **Expect:** the Babylon Inspector opens embedded (scene tree + properties);
  second press closes it. No console errors on the dynamic import.

### 1.2 Collider debug key
- **Steps:** press **C**, then **C** again.
- **Expect:** cyan physics wireframes on the plane + cube; second press clears.

### 1.3 Export validation
- **Steps:** in Blender, break things on purpose: (a) add a Script component
  and type a filename that doesn't exist; (b) set the cube's collider shape to
  Mesh while its body is Dynamic; (c) add an Area light; (d) delete the camera.
  Click **Validate** in the Export panel.
- **Expect:** one warning per problem (4 total) in the report / Info log. Fix
  them all, Validate again → "No problems found". **Export Level** shows the
  same warnings when problems exist.

### 1.4 Live Link
- **Steps:** Export once by hand. Tick **Live Link** in the Export panel (the
  glb filename should appear under it). Move the cube in Blender, **Ctrl+S**.
- **Expect:** Blender's console prints `[bjs live-link] exported …`; the
  browser reloads by itself within ~a second and the cube is in its new spot.
  Untick Live Link, move + save again → no re-export, no reload.

### 1.5 Debug Build flag (v0.25.1)
- **Steps:** untick **Debug Build** in the Export panel, export, reload.
  Press **C** and **I**.
- **Expect:** neither key does anything. The manifest contains `"debug": false`.
  Re-tick, export → keys work again.

## 2. v0.26 — audio & trigger messaging

### 2.1 Audio component (spatial)
- **Steps:** add an **Audio** component to the cube: pick a short .mp3/.wav,
  Volume 1, Loop ON, Auto Play ON, 3D Spatial ON, Max Distance ~30. Export.
  Reload the page and click once anywhere (browser autoplay gate).
- **Expect:** the sound starts after the click and pans/attenuates as you move
  the camera away from the cube. The file was copied to `levels/audio/` next to
  the export.

### 2.2 Audio via script
- **Steps:** Auto Play OFF, re-export. Attach a Script component →
  `MessageLogger.ts`, set **Play sound** to the file's stem (e.g. `door` for
  `door.mp3`). Continue to 2.3 — the sound should play when a message arrives.

### 2.3 Trigger messaging
- **Steps:** add a box trigger volume: a new cube, Collider (Box, **Is Trigger**
  ON). In its **On Enter Events** list add a row: Target = the audio cube,
  Message = `ping`, Only Tag = empty. Give the falling cube a **Tag** component
  `Player`, and position things so the falling cube lands inside the trigger.
  Export, reload.
- **Expect:** when the cube enters the volume, the console logs
  `[MessageLogger:…] "ping" from "<cube>" (tag Player)` and the sound plays.
- **Tag filter:** set Only Tag = `Enemy`, re-export → nothing fires. Set it to
  `Player` → fires again.
- **Validator tie-in:** set the trigger's shape to Mesh → Validate warns
  (mesh triggers never fire in Havok).

## 3. v0.27 — constraints

Use two dynamic cubes (Collider + Dynamic Rigid Body each), floating ~2 m up so
joints are visible before they settle.

### 3.1 Hinge with limits
- **Steps:** on cube A add **Constraint**: Joint = Hinge, Target = cube B,
  Axis = Z, Use Limits ON, Min −45 / Max 45. Export, reload, press **C**.
- **Expect:** A and B fall together, connected; A swings around the pivot but
  never beyond ±45°. Nothing snaps/teleports on load (the joint pins the
  as-placed pose).

### 3.2 Motor
- **Steps:** on the hinge: Motor ON, Speed 90, Max Force 100, Limits OFF.
  Export.
- **Expect:** the jointed body spins continuously at roughly a quarter turn per
  second relative to its partner.

### 3.3 Slider and Spring
- **Steps:** change the joint to Slider (Limits ON, Min −1 / Max 1) → the bodies
  can only telescope along the axis within ±1 m. Then Spring (Min −0.5 /
  Max 0.5, Stiffness 200, Damping 5) → drop them.
- **Expect:** Slider: pure axial sliding, hard stops at the limits. Spring: the
  pair bounces along the axis and settles (suspension feel).

### 3.4 Fixed and Ball
- **Expect:** Fixed: the two move as one rigid piece. Ball & Socket: free
  swivel around the pivot, no separation.

### 3.5 Validator tie-in
- **Steps:** remove the target's Rigid Body, Validate.
- **Expect:** warning that the constraint target has no Collider/Rigid Body.

## 4. v0.28 — input action map

### 4.1 Keyboard axes + actions
- **Steps:** attach `InputMover.ts` (Script component) to a kinematic or
  physics-free object. Export, reload, click the viewport.
- **Expect:** WASD *and* the arrow keys move it on the ground plane; holding
  **Shift** moves it ~2× faster; tapping **Space** makes it hop exactly once
  per press (hold Space → still one hop: that's the WasPressed edge).

### 4.2 Gamepad (if available)
- **Steps:** connect a pad, press any button on it (browser requirement), then
  use the left stick.
- **Expect:** the object moves with analog speed (slight stick = slow). The
  A/Cross button hops.

### 4.3 Scene default fallback
- **Steps:** attach a script that uses `this.input` (no `@inputMap` fields) or
  `@inputMap()` with no argument. Confirm the **Scene Default** picker in the
  Input Actions panel is set to **Player**. Export and reload.
- **Expect:** movement/actions work the same as an explicit `@inputMap("Player")`
  field — the scene default map is injected on `behavior.input`.

### 4.4 No-conflict check
- **Expect:** the **C**/**I** debug keys still work, and a Blender-authored
  camera with an ARROWS key scheme still responds — Input doesn't swallow keys.

## 5. Regression sweep (v0.24 features that the refactors touched)

The v0.26.1 style refactor restructured `physics.ts`, `subsystems/cameras/`, and
`core/loader/` (from `LevelLoader.ts`) without intending behavior changes — verify:

- **5.1 Colliders:** auto-fit box/sphere on a single-material mesh; a
  multi-material mesh (2+ materials) with auto-fit; a CONVEX dynamic body; a
  manual box with center offset + rotation matching the Blender preview. All
  land correctly with **C** wireframes aligned to the visuals.
- **5.2 Cameras:** a plain Blender camera frames the view exactly as in
  Blender; a CAMERA component set to ArcRotate orbits a picked target from the
  Blender position; Follow (Orbit + Use Blender Position) trails a moving
  target.
- **5.3 Exposed vars:** Rotator speed edited per-object in Blender takes
  effect; a LookAt target picked in Blender resolves (object reference);
  PatrolTargets entity list visits each picked empty in order.
- **5.4 Animation:** an object with 2 NLA strips + Auto Play plays only the
  chosen clip on load (nothing else auto-plays); `ClipSwitcher.ts` cycles clips.
- **5.5 Sounds/level teardown:** if your app ever calls `level.Dispose()`,
  sounds stop, constraints release, and the trigger observer detaches (no
  console errors on a second load).

## Known risk areas (where a failure is most likely)

1. **§0.2 tsc** — the whole v0.25–0.28 span was written without a compiler.
   Most likely complaints: audio v2 type names in `subsystems/audio.ts`,
   `Physics6DoFConstraintLimit.stiffness/damping` in `constraints.ts`, and the
   `@babylonjs/inspector` dynamic import in `main.ts`.
2. **§2.1** — browser autoplay policy differences (Safari is strictest).
3. **§3.x** — constraint frame math: if a hinge rotates around the wrong axis,
   the Blender→Babylon axis conversion in `export.py` is the first suspect.
EOF
echo "TEST_PLAN.md: $(wc -l < /home/claude/bjs-level-kit/docs/TEST_PLAN.md) lines"