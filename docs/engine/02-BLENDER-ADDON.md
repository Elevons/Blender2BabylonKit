# 02 — The Blender Add-on (editor half)

[← Index](00-INDEX.md) · Prev: [Architecture](01-ARCHITECTURE.md) · Next: [Load Pipeline →](03-LOAD-PIPELINE.md)

A Blender 4.2+/5.x **extension** (`blender_addon/`, installed from
`babylon_level_kit_extension.zip`). It owns authoring, GUID assignment, and the
export that produces the [two artifacts](01-ARCHITECTURE.md).

## Where the UI lives

Split by **object vs scene**:

- **3D viewport N-panel, "Babylon" tab** (`ui/view3d_panels.py`) — the selected
  object: component stack, light/camera/animation child panels, compact Export
  block.
- **Properties › Scene › "Babylon"** (`ui/scene_panels.py` + `ui/input_panel.py`)
  — scene-wide: rendering, fog, post-processing, **Input Actions**, and the same
  Export controls. Both export blocks call `ui/common.py:draw_export_controls()`
  so they cannot drift.

## Package map

| Package | Single purpose |
|---|---|
| `__init__.py` | extension registration order + dev-reload of submodules |
| `core/` | pure helpers, nothing registered: `ids.py` (GUIDs), `script_parse.py` (`@exposed` / `@inputMap` regex parsing) |
| `components/` | per-object data model: `component.py` (`BJSComponent`, trigger/click events), `exposed_vars.py`, `object_settings.py`, `clipboard.py`, `constants.py` (all enums) |
| `scene/` | scene-wide render settings on `Scene.bjs_scene` (`settings.py`) |
| `input_actions/` | the Input Actions asset end-to-end: `properties.py`, `defaults.py`, `serialize.py`, `operators.py` |
| `export/` | everything that writes files: `level.py` (orchestrator), `components.py` (component stack → manifest, axis conversion here), `datablocks.py`, `animation.py`, `scene.py`, `assets.py` (`copy_asset`), `validate.py`, `live_link.py` |
| `operators/` | component verbs (`components.py`), script pick + Sync (`scripts.py`), Validate + Export (`export_ops.py`) |
| `ui/` | all panels and menus: `view3d_panels.py`, `scene_panels.py`, `input_panel.py`, `component_draw.py`, `common.py`, `menus.py` |
| `viewport/` | GPU overlays: `collider_preview.py` (manual collider wireframe) |

Rule of thumb: `core/`, `components/`, `scene/`, `input_actions/` own *data*;
`export/` owns *output*; `operators/` owns *behavior*; `ui/` owns *presentation*.

## The export pipeline (what "Export Level" does)

1. **Validate** (`export/validate.py:validate_scene`) — warnings surface in the report.
2. **GUID pass** (`export/level.py`) — `ensure_object_id` (`core/ids.py`) for
   every object that needs one, including *referenced* objects (entity fields,
   camera targets, trigger/click targets, constraint targets) so references
   always resolve. Duplicated GUIDs (copy-pasted objects) are re-issued.
3. **Write the glb** via Blender's glTF exporter (+Y-up), GUIDs in node extras.
4. **Build the manifest** — per entity: `serialize_components`
   (`export/components.py`; one dict per component), plus auto-derived
   `light` / `camera` / `animation` blocks; plus the scene block
   (`export/scene.py`); plus the top-level `"debug"` flag (Debug Build checkbox,
   owned by `export/live_link.py`). Schema `"version": 4`.
5. **Copy side files** — `copy_asset` (`export/assets.py`): environment texture,
   audio → `audio/`, GUI layouts → `gui/`, particle systems → `particles/`, 3D
   button images → `gui/`.
6. Remember the path for [Live Link](08-WORKFLOW.md#live-link).

### Axis conversions (Blender Z-up → Babylon Y-up)

Done **at export** in `export/components.py`, so the runtime receives
Babylon-space values unchanged: vectors `(x, y, z) → (x, z, −y)`; sizes swap
y/z; quaternions keep `w` with vector part converted; constraint axis enum
X/Y/Z → unit vectors via the same map. CUSTOM constraints also export six
per-axis rows (`axes[]`: mode, min/max, stiffness/damping).
`viewport/collider_preview.py` draws raw Blender values, so the viewport preview
matches the exported body.

Continue: [Load Pipeline →](03-LOAD-PIPELINE.md)
