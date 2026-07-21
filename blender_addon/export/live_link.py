"""Live link: re-export the level automatically every time the .blend is saved.

Opt-in via the checkbox in the Export panel. The export path from the last
manual "Export Level" is remembered per-scene (saved with the .blend), so the
flow is: export once by hand, tick "Live Link", then just Ctrl+S — the runtime's
dev server sees the changed files and reloads the browser.

Implementation: a bpy save_post handler. No timers, no sockets, no polling —
saving is already the natural "I want to see this" gesture.

This module also owns the export-related Scene properties (live link path,
debug build flag).
"""

import bpy
from bpy.app.handlers import persistent
from bpy.types import Operator

from . import level as bjs_level
from . import validate


def _do_live_export(scene):
    """Re-run the last export for this scene; report to the console/status bar.
    Never raises — a failed live export must not break the user's save."""
    path = scene.bjs_live_link_path
    if not path:
        return

    try:
        warnings = validate.validate_scene(bpy.context)
        glb_path, json_path, n_entities, detail_warnings = bjs_level.export_level(bpy.context, path)
    except Exception as e:
        print(f"[bjs live-link] export failed: {e}")
        return

    for w in warnings + detail_warnings:
        print(f"[bjs live-link] warning: {w}")
    print(f"[bjs live-link] exported {n_entities} entities -> {json_path}")


@persistent
def _on_save_post(filepath):
    """Runs after every .blend save; exports scenes that opted in."""
    for scene in bpy.data.scenes:
        if getattr(scene, "bjs_live_link", False):
            _do_live_export(scene)


class BJS_OT_live_export_now(Operator):
    """Re-export the level using the stored Live Link path (no save required)."""
    bl_idname = "bjs.live_export_now"
    bl_label = "Live Export Now"
    bl_options = {'REGISTER'}

    def execute(self, context):
        scene = context.scene
        path = scene.bjs_live_link_path
        if not path:
            self.report({'WARNING'}, "No export path set — run Export Level first")
            return {'CANCELLED'}

        try:
            warnings = validate.validate_scene(context)
            glb_path, json_path, n_entities, detail_warnings = bjs_level.export_level(context, path)
        except Exception as e:
            self.report({'ERROR'}, f"Live export failed: {e}")
            return {'CANCELLED'}

        for w in warnings + detail_warnings:
            self.report({'WARNING'}, w)
        self.report({'INFO'}, f"Live exported {n_entities} entities -> {json_path}")
        return {'FINISHED'}


_addon_keymaps = []


def register():
    bpy.utils.register_class(BJS_OT_live_export_now)

    bpy.types.Scene.bjs_live_link = bpy.props.BoolProperty(
        name="Live Link",
        description="Re-export the level automatically every time the file is "
                    "saved (uses the last export path)",
        default=False)
    bpy.types.Scene.bjs_live_link_path = bpy.props.StringProperty(
        name="Live Link Path",
        description="The .glb path used by Live Link (set by Export Level)",
        default="", subtype='FILE_PATH')
    bpy.types.Scene.bjs_debug_build = bpy.props.BoolProperty(
        name="Debug Build",
        description="Enable the runtime debug keys: C (collider wireframes) and "
                    "I (Babylon Inspector). Turn off for release exports",
        default=True)

    if _on_save_post not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(_on_save_post)

    # Register Ctrl+E keymap for Live Export Now
    wm = bpy.context.window_manager
    kc = wm.keyconfigs.addon
    if kc:
        km = kc.keymaps.new(name="3D View", space_type='VIEW_3D')
        kmi = km.keymap_items.new(BJS_OT_live_export_now.bl_idname, type='E', value='PRESS', ctrl=True)
        _addon_keymaps.append((km, kmi))


def unregister():
    # Remove keymap items
    for km, kmi in _addon_keymaps:
        km.keymap_items.remove(kmi)
    _addon_keymaps.clear()

    if _on_save_post in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(_on_save_post)

    bpy.utils.unregister_class(BJS_OT_live_export_now)

    del bpy.types.Scene.bjs_live_link
    del bpy.types.Scene.bjs_live_link_path
    del bpy.types.Scene.bjs_debug_build
