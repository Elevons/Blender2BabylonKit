# Babylon Level Kit — 0.32.0 restructure notes

This release reorganizes the addon from 18 flat files into packages of small,
single-concern modules, and consolidates the UI. **No behavior changed and no
data changed** — all property names (`bjs_components`, `bjs_scene`,
`bjs_input_maps`, `bjs_id`, ...) and operator idnames (`bjs.*`) are identical,
so existing .blend files keep working as-is.

## Package layout

    babylon_level_kit/
    ├── __init__.py            registration order + reload handling
    ├── blender_manifest.toml
    ├── core/                  pure helpers, no bpy registration
    │   ├── ids.py             GUIDs (Object["bjs_id"])
    │   └── script_parse.py    TypeScript @exposed / @inputMap parsing
    ├── components/            per-object data model
    │   ├── constants.py       every enum table (component types, shapes, ...)
    │   ├── exposed_vars.py    BJSExposedVar / BJSListItem + enum proxy machinery
    │   ├── component.py       BJSComponent + constraint axes / trigger events
    │   ├── object_settings.py BJSLightShadow, BJSAnimationSettings
    │   └── clipboard.py       component copy/paste buffer
    ├── scene/
    │   └── settings.py        BJSSceneSettings (Scene.bjs_scene)
    ├── input_actions/         the Input Actions asset, end to end
    │   ├── defaults.py        built-in "Player" asset
    │   ├── properties.py      maps > actions > bindings data model
    │   ├── serialize.py       to/from JSON (save/load/export) + key aliases
    │   └── operators.py       all bjs.input_* operators
    ├── export/                everything that writes files
    │   ├── assets.py          generic asset copying (audio, GUI JSON, ...)
    │   ├── animation.py       NLA clip serialization
    │   ├── datablocks.py      light / camera serialization
    │   ├── components.py      component stack -> manifest (Z-up -> Y-up here)
    │   ├── scene.py           scene block (environment, fog, post, input)
    │   ├── level.py           the .glb + .scene.json writer
    │   ├── validate.py        pre-export checks
    │   └── live_link.py       re-export on save (save_post handler)
    ├── operators/             component / script / export operators
    ├── ui/                    all panels and menus
    │   ├── common.py          draw_export_controls() — shared by both export panels
    │   ├── component_draw.py  the per-component inspector body
    │   ├── menus.py           component context menu
    │   ├── view3d_panels.py   viewport N-panel (per-object)
    │   ├── scene_panels.py    Properties > Scene (scene-wide)
    │   └── input_panel.py     Input Actions editor (+ reusable draw mixin)
    └── viewport/
        └── collider_preview.py  GPU collider wireframe overlay

Rule of thumb: `core/`, `components/`, `scene/`, `input_actions/` own *data*;
`export/` owns *output*; `operators/` owns *behavior*; `ui/` owns *presentation*.

## UI reorganization

The split is now **"about the object" vs "about the scene"**:

- **3D viewport N-panel, "Babylon" tab** — everything about the selected object:
  - *Components* — GUID, Add Component, the component stack
    - *Light / Camera / Animation* — now collapsible child panels that only
      appear for the relevant object type (previously inline boxes)
  - *Export* — a compact copy of the export controls for convenience
- **Properties > Scene > "Babylon"** — everything scene-wide, under one parent:
  - *Rendering* — clear/ambient color, freeze shadows
  - *Environment* — default env, intensity/rotation (default env), skybox
  - *Fog* — enabled by the checkbox in the panel header
  - *Post-Processing* — enabled by the checkbox in the panel header
  - *Input Actions* — **moved here from the N-panel** (it's scene data, not
    object data)
  - *Export* — the same controls as the viewport copy; both are drawn by one
    function (`ui/common.py: draw_export_controls`) so they can't drift

If you miss the Input Actions N-panel, re-add it by subclassing the mixin:

```python
from bpy.types import Panel
from .ui.input_panel import BJSInputMapDrawMixin

class BJS_PT_input_map_view3d(BJSInputMapDrawMixin, Panel):
    bl_label = "Input Actions"
    bl_idname = "BJS_PT_input_map_view3d"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        self.draw_input_editor(self.layout, context.scene)
```

## Small internal renames (no data impact)

- `_ENUM_SEP` → `components.constants.ENUM_SEP`, `_CUSTOM_AXIS_DEFAULTS` →
  `CUSTOM_AXIS_DEFAULTS` (now shared, so public)
- `_copy_audio_file` generalized into `export.assets.copy_asset(filepath,
  output_dir, subdir)`
- Key aliases (`"space"` → `" "`, ...) moved from scene export into
  `input_actions/serialize.py`, which now owns both serialization directions
- `iter_referenced_objects` made public in `export/components.py`

## Version

`blender_manifest.toml` bumped 0.31.1 → 0.32.0 (UI moved, no data migration
needed).
