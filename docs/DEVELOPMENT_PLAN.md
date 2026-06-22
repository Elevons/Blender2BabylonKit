# Development Plan — remaining work

Status as of **v0.29.0** (npm-workspaces monorepo: `packages/engine` is the
shared `@bjs/engine` package; games are `apps/*` created by `npm run create`). Shipped so far: C#-style codebase + engine reorg
(core/scripting/subsystems), Live Link, export validation, Inspector key,
Debug Build flag, AUDIO component, trigger messaging (OnMessage), CONSTRAINT
component (fixed/ball/hinge/slider/spring + limits + motors), Input Actions
(panel → `scene.inputActions` + `scene.defaultInputMap`, `@inputMap` /
`behavior.input` injection).
This file is the forward plan only; per-feature design notes live with each item.

## Deferred mid-build (explicit decisions, not omissions)

- **Animation state machine** — skipped by decision. The NLA pipeline
  (AnimationGroups, `entity.GetAnimation`, autoplay, ClipSwitcher-style direct
  control) already covers playback; a state layer was started and fully
  reverted. If revived: it must be a *layer over* the existing clips with a
  single playback authority (states replace autoplay when present), built on
  AnimationGroup weight cross-fades. No Blender or runtime remnants exist.
- **Constraint viewport preview** — pivot/axis gizmo in the Blender viewport
  (extend `viewport/collider_preview.py`'s GPU-draw pattern). Deferred because joints
  pin the as-placed pose, which removes most of the guesswork the preview
  would solve. Medium effort, pure Blender-side.
- **Camera key-scheme migration to Input** — Babylon cameras consume keycode
  arrays natively (`keysUp` etc.); routing them through the polled Input map
  would mean reimplementing camera inputs. Revisit only if per-user rebinding
  of *camera* controls becomes a requirement.

## Next up (in suggested order)

1. **Prefabs + Spawn/Despawn API** — the biggest remaining capability; full
   design already in `PREFAB_SPEC.md` (linked .blend collections -> per-prefab
   glb/manifest, composite GUIDs, `level.Spawn()`). Schema v5. Large.
2. ~~**Particles component**~~ — **shipped** as an editor-JSON component:
   **GUI** and **Particles** components reference the `.json` saved by Babylon's
   online GUI/Particle editors (copied next to the export), loaded at runtime in
   `ui/gui2d.ts` (`AdvancedDynamicTexture`, `@babylonjs/gui` peer dep) and
   `subsystems/particles.ts` (`ParticleHelper.ParseFromFileAsync`). This replaces
   the originally-planned preset-based particle component — the external editors
   already cover authoring far more thoroughly. A preset/quick-emit component
   could still be layered on later if in-Blender authoring is wanted.
3. ~~**3D GUI components**~~ — **shipped**: nine `GUI3D_*` components (Button3D,
   Holographic + TouchHolographic buttons, MeshButton3D, stack/sphere/cylinder/
   plane/scatter panels) built in a FinalizeLevel post-pass on a shared
   `GUI3DManager` (`ui/gui3d/`). Panels lay out Blender child objects; On Click
   rows deliver `OnMessage`. Still unwrapped (add as components when needed):
   **HolographicSlate**, **NearMenu**, **HandMenu** (XR-followers — most useful
   alongside a WebXR session story), and per-control scaling overrides.
4. **Input: mouse support** — pointer buttons/delta as actions and axes
   ("Fire", "LookX" from mouse delta). The central Input Map (Blender panel →
   manifest → runtime) shipped in v0.30; this extends it to pointer input.
5. **Navmesh + NavAgent** — bake from tagged geometry via Babylon's Recast
   plugin; `NavAgent` behavior (SetDestination). Large; needs the recast wasm
   dependency. Do after prefabs (agents usually chase spawned things).
6. **LOD / level streaming** — distance-based mesh swap component; later,
   multi-manifest loading. Large; only when a real level needs it.

## Standing engineering debt

- **No automated tests.** The sandbox can't run `tsc`/Blender, so every release
  leans on the manual TEST_PLAN.md. A CI step (`tsc --noEmit` + a headless
  manifest-parse test) on the user's machine/repo would catch most regressions.
- ~~Template copy drift~~ — **resolved in v0.29**: the engine is the shared
  `@bjs/engine` workspace package; apps depend on it via symlink, and
  `npm run create` no longer copies engine code. Publishing to npm remains the
  eventual endgame once the engine stabilizes.
- **Audio engine v2 / Inspector API risk** — both verified against current docs
  but new; if a Babylon minor bump breaks them, `subsystems/audio.ts` and
  `main.ts` are the only touch points.

## Release mapping

| Version | Contents |
|---|---|
| v0.29 | (shipped) monorepo: @bjs/engine workspace package + app scaffolder |
| v0.30 | Prefabs phase 1: exporter (prefab artifacts + placements) |
| v0.31 | Prefabs phase 2: runtime instancing + Spawn/Despawn |
| v0.32 | (shipped early) GUI + Particles + 3D GUI components; Input mouse support |
| v0.32+ | MSDF Text component (`MSDF_TEXT` → `@babylonjs/addons` TextRenderer) |
| v0.33 | Navmesh + NavAgent |
