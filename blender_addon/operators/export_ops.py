"""Validate / Export Level operators."""

from bpy.props import StringProperty
from bpy.types import Operator
from bpy_extras.io_utils import ExportHelper

from ..export import level as bjs_level
from ..export import validate as bjs_validate
from ..input_actions.serialize import ensure_scene_input_maps


class BJS_OT_validate(Operator):
    """Check the scene for export problems without exporting."""
    bl_idname = "bjs.validate_scene"
    bl_label = "Validate Level"
    bl_options = {'REGISTER'}

    def execute(self, context):
        warnings = bjs_validate.validate_scene(context)
        if not warnings:
            self.report({'INFO'}, "No problems found")
            return {'FINISHED'}
        for w in warnings:
            self.report({'WARNING'}, w)
        self.report({'INFO'}, f"{len(warnings)} warning{'s' if len(warnings) != 1 else ''} — open the Info log for details")
        return {'FINISHED'}


class BJS_OT_export(Operator, ExportHelper):
    """Export the scene as a .glb mesh + a .scene.json ECS manifest."""
    bl_idname = "bjs.export_scene"
    bl_label = "Export Babylon Level"
    bl_options = {'REGISTER'}

    filename_ext = ".glb"
    filter_glob: StringProperty(default="*.glb", options={'HIDDEN'})

    def execute(self, context):
        if ensure_scene_input_maps(context.scene):
            self.report({'INFO'}, "Seeded Input Actions with the default asset")
        warnings = bjs_validate.validate_scene(context)
        try:
            glb_path, json_path, n_entities = bjs_level.export_level(context, self.filepath)
        except Exception as e:  # surface errors in the Blender UI
            self.report({'ERROR'}, f"Export failed: {e}")
            return {'CANCELLED'}

        # Remember the path so Live Link can re-export on save.
        context.scene.bjs_live_link_path = self.filepath

        for w in warnings:
            self.report({'WARNING'}, w)
        summary = f"Exported {n_entities} entities -> {json_path}"
        if warnings:
            summary += f" ({len(warnings)} warning{'s' if len(warnings) != 1 else ''} — see report)"
        self.report({'INFO'}, summary)
        return {'FINISHED'}


classes = (
    BJS_OT_validate,
    BJS_OT_export,
)
