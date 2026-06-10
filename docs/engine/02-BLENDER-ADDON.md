# 02 — The Blender Add-on (editor half)

[← Index](00-INDEX.md) · Prev: [Architecture](01-ARCHITECTURE.md) · Next: [Load Pipeline →](03-LOAD-PIPELINE.md)

A Blender 4.2+/5.x **extension** (`blender_addon/`, installed from
`babylon_level_kit_extension.zip`). It owns authoring (the "Babylon" N-panel),
GUID assignment, and the export that produces the [two artifacts](01-ARCHITECTURE.md).

## Module map

| Module | Single purpose |
|---|---|
| `__init__.py` | extension registration; dev-reloads submodules |
| `properties.py` | the data model: `BJSComponent` (one PropertyGroup with per-type fields), `BJSExposedVar`/`BJSListItem` (script values), `BJSTriggerEvent`, light/shadow/animation settings, `ID_KEY` + `ensure_object_id()` |
| `ui.py` | the N-panel: component list + per-type drawing, Animation box, Export panel (Export / Live Link / Debug Build / Validate) |
| `operators.py` | add/remove/duplicate/move/copy/paste components, GUID assign, script picker + Sync, list & trigger-event row editing, **Validate**, **Export** |
| `export.py` | the heart: writes the glb (Blender's glTF exporter) + builds the manifest; serializes every component; converts axes Blender→Babylon; copies audio files; force-includes referenced objects |
| `scene_export.py` | the scene-wide block: clear/ambient color, environment texture (copied next to the export), fog, post-processing |
| `anim_export.py` | the per-object animation block from NLA strips (`nla_clip_names`) |
| `script_parse.py` | regex-parses `@exposed(...)` fields out of behavior `.ts` source — the cross-language contract (this is why the decorator must stay lowercase) |
| `validate.py` | pre-export checks (see [Workflow](08-WORKFLOW.md#validator)) |
| `live_link.py` | `save_post` handler: re-export on Ctrl+S when enabled; owns the `bjs_live_link*` and `bjs_debug_build` Scene properties |
| `collider_preview.py` | GPU viewport wireframe of manual colliders (drawn in Blender space, matching what export converts) |

## The export pipeline (what "Export Level" does)

1. **Validate** (`validate.validate_scene`) — warnings surface in the report.
2. **GUID pass** — `ensure_object_id` for every object that needs one,
   including *referenced* objects (entity fields, camera targets, trigger-event
   targets, constraint targets) so references always resolve. Duplicated GUIDs
   (copy-pasted objects) are re-issued, with a validator warning.
3. **Write the glb** via Blender's glTF exporter (+Y-up), GUIDs in node extras.
4. **Build the manifest** — per entity: `_serialize_components` (one dict per
   component; see per-feature conversion notes below), plus auto-derived
   `light` / `camera` / `animation` blocks; plus the scene block; plus the
   top-level `"debug"` flag (Debug Build checkbox). Schema `"version": 4`.
5. **Copy side files** — environment texture, audio files → `audio/`.
6. Remember the path for [Live Link](08-WORKFLOW.md#live-link).

### Axis conversions (Blender Z-up → Babylon Y-up)

Done **at export**, so the runtime receives Babylon-space values unchanged:
vectors `(x, y, z) → (x, z, −y)`; sizes swap y/z; quaternions keep `w` with
vector part converted; constraint axis enum X/Y/Z → unit vectors via the same
map. `collider_preview.py` draws raw Blender values, so the viewport preview
matches the exported body.

Continue: [Load Pipeline →](03-LOAD-PIPELINE.md)
