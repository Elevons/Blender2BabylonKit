# 08 — Workflow & Tooling

[← Index](00-INDEX.md) · Prev: [Audio & Animation](07-AUDIO-ANIMATION.md) · Next: [Feature Traces →](09-FEATURE-TRACES.md)

## Live Link <a name="live-link"></a>

The save-to-see loop. Export once (the operator remembers the path per-scene),
tick **Live Link** in **Babylon Scene › Export**, then every **Ctrl+S** re-exports
(`export/live_link.py`, a `save_post` handler — no timers/sockets; failures never
break the save). On the runtime side, the Vite plugin `ReloadOnLevelExport`
(`apps/<app>/vite.config.ts`) watches **all files** under `public/levels/` (glb,
`env/`, audio, manifest, …) and sends a 50ms debounced full reload — not only
`.scene.json`, so a replaced environment image still refreshes when the manifest
bytes are unchanged. `IsLevelAsset` resolves paths with `path.resolve` because
chokidar may report relative paths (`public/levels/...`) without a leading slash.

Re-exports are **idempotent for side files**: `export_level` calls
`begin_asset_export()` (`export/assets.py`) so each save overwrites
`env/<name>.hdr`, `audio/…`, etc. instead of accumulating `_2`, `_3`, … copies
when the manifest path is unchanged.

## Object visibility <a name="visibility"></a>

Blender's outliner has two independent toggles:

| Icon | Property | In the exported level |
|---|---|---|
| Eye | `hide_viewport` | Present but starts invisible (`bjs_visible: false` in glTF extras → `node.isVisible = false` at load) |
| Camera | `hide_render` | Absent — skipped by `_is_renderable` in export and `use_renderable=True` on the glTF exporter |

Use **render-disable** for editor-only objects that should never ship. Use
**viewport-hide** for level content you want present (physics, scripts, references)
but off until gameplay or a behavior sets `entity.node.isVisible = true`.

## The validator <a name="validator"></a>

`export/validate.py`, run by the **Validate** button, by Export, and by every Live
Link export. Checks: missing/empty script files · entity references to
render-disabled objects · MESH collider + DYNAMIC body · MESH-shaped triggers
(never fire in Havok) · trigger events on non-trigger colliders / without a
target · mixed trigger/non-trigger colliders on one entity (compound body) ·
constraints missing a target or physics on either end · components or
animation autoplay on a **skinned mesh** (belongs on the armature —
[why](07-AUDIO-ANIMATION.md)) · AREA lights · duplicate GUIDs · audio file
missing · no active camera · **Input Actions** (duplicate map/action names,
actions with no bindings, `@inputMap("Name")` referencing a missing map, Scene
Default map not found).

## Debug Build & debug keys

The Export panel's **Debug Build** checkbox writes a top-level `"debug"` flag
into the manifest (missing = true for old manifests) → `level.debugEnabled`.
It gates the runtime debug keys in `main.ts` — **C** (collider wireframes via
PhysicsViewer) and **I** (the Babylon Inspector, lazily imported so it never
ships in production bundles) — and the `debugColliders` loader option. Untick
for release exports.

## Babylon Launcher <a name="launcher"></a>

`tools/babylon-launcher/` (`@bjs/babylon-launcher`) is a local web hub on port
**3200** (`npm run launcher:dev`). It lists `apps/` projects, starts each app's
Vite dev server, manages **bjs-mcp** for Cursor, scaffolds new projects, and
browses per-level JSON asset folders. It does not host embedded Babylon editors.

Full reference: **[Launcher docs](../launcher/00-INDEX.md)**.

Typical loop: pick project + level in the hub → **Start All Services** → open
the runtime preview link → export from Blender via Live Link into
`apps/<app>/public/levels/<level>/` (path shown in the hub).

## Monorepo & scaffolder

See [Architecture](01-ARCHITECTURE.md#monorepo-layout) for the layout. Daily
commands (repo root): `npm install` (links workspaces) · `npm run dev`
(playground) · `npm run dev --workspace apps/<name>` · `npm run launcher:dev`
(project hub) · `npm run typecheck` (tsc over the engine package and the app) ·
`npm run create -- --name my-game [--title "…"] [--level Arena]` (stamps
`apps/my-game` from the playground template — own `main.ts`/`behaviors`/empty
`public/levels/`; the engine is **not** copied, it's the shared symlinked
package). The launcher wizard calls the same `create-app.mjs` script via
`POST /api/projects`.

## Versioning & artifacts

Engine `package.json`(s) and `blender_addon/blender_manifest.toml` move in
lockstep. Two distributables: `babylon_level_kit_extension.zip` (install in
Blender) and `bjs-level-kit.zip` (the repo, sans node_modules). Manifest schema
is **v4**; additive optional fields don't bump it. Manual verification lives in
[TEST_PLAN](../TEST_PLAN.md); forward work in
[DEVELOPMENT_PLAN](../DEVELOPMENT_PLAN.md).

Continue: [Feature Traces →](09-FEATURE-TRACES.md)
