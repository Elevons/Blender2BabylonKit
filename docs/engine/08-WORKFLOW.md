# 08 — Workflow & Tooling

[← Index](00-INDEX.md) · Prev: [Audio & Animation](07-AUDIO-ANIMATION.md) · Next: [Feature Traces →](09-FEATURE-TRACES.md)

## Live Link <a name="live-link"></a>

The save-to-see loop. Export once (the operator remembers the path per-scene),
tick **Live Link** in the Export panel, then every **Ctrl+S** re-exports
(`live_link.py`, a `save_post` handler — no timers/sockets; failures never
break the save). On the runtime side, the Vite plugin `ReloadOnLevelExport`
(`apps/<app>/vite.config.ts`) watches `public/levels/*.scene.json` and sends a
full reload — the manifest is written *after* the glb, so both files are ready
when it fires.

## The validator <a name="validator"></a>

`validate.py`, run by the **Validate** button, by Export, and by every Live
Link export. Checks: missing/empty script files · entity references to
render-disabled objects · MESH collider + DYNAMIC body · MESH-shaped triggers
(never fire in Havok) · trigger events on non-trigger colliders / without a
target · constraints missing a target or physics on either end · components or
animation autoplay on a **skinned mesh** (belongs on the armature —
[why](07-AUDIO-ANIMATION.md)) · AREA lights · duplicate GUIDs · audio file
missing · no active camera.

## Debug Build & debug keys

The Export panel's **Debug Build** checkbox writes a top-level `"debug"` flag
into the manifest (missing = true for old manifests) → `level.debugEnabled`.
It gates the runtime debug keys in `main.ts` — **C** (collider wireframes via
PhysicsViewer) and **I** (the Babylon Inspector, lazily imported so it never
ships in production bundles) — and the `debugColliders` loader option. Untick
for release exports.

## Monorepo & scaffolder

See [Architecture](01-ARCHITECTURE.md#monorepo-layout) for the layout. Daily
commands (repo root): `npm install` (links workspaces) · `npm run dev`
(playground) · `npm run dev --workspace apps/<name>` · `npm run typecheck`
(tsc over the engine package and the app) ·
`npm run create -- --name my-game [--title "…"] [--level Arena]` (stamps
`apps/my-game` from the playground template — own `main.ts`/`behaviors`/empty
`public/levels/`; the engine is **not** copied, it's the shared symlinked
package).

## Versioning & artifacts

Engine `package.json`(s) and `blender_addon/blender_manifest.toml` move in
lockstep. Two distributables: `babylon_level_kit_extension.zip` (install in
Blender) and `bjs-level-kit.zip` (the repo, sans node_modules). Manifest schema
is **v4**; additive optional fields don't bump it. Manual verification lives in
[TEST_PLAN](../TEST_PLAN.md); forward work in
[DEVELOPMENT_PLAN](../DEVELOPMENT_PLAN.md).

Continue: [Feature Traces →](09-FEATURE-TRACES.md)
