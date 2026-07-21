"""Shared draw helpers used by more than one panel."""

import bpy


def draw_export_controls(layout, scene):
    """The Export Level / Live Link / Debug Build / Validate block."""
    layout.operator("bjs.export_scene", text="Export Level", icon='EXPORT')
    layout.label(text="Writes .glb + .scene.json", icon='INFO')

    layout.separator()
    link_row = layout.row(align=True)
    link_row.prop(scene, "bjs_live_link", text="Live Link (re-export on save)",
                  icon='FILE_REFRESH')
    if scene.bjs_live_link:
        if scene.bjs_live_link_path:
            row = layout.row(align=True)
            row.label(text=bpy.path.basename(scene.bjs_live_link_path),
                      icon='FILE_TICK')
            row.operator("bjs.live_export_now", text="", icon='PLAY')
        else:
            layout.label(text="Export once to set the path", icon='ERROR')

    layout.prop(scene, "bjs_debug_build", text="Debug Build", icon='TOOL_SETTINGS')

    layout.separator()
    layout.operator("bjs.open_launcher_hub", text="Open Editor Launcher", icon='WORLD')

    layout.operator("bjs.validate_scene", text="Validate", icon='CHECKMARK')
