"""Operators for SCRIPT components: pick the behavior source file and sync its
@exposed variables into the component."""

import bpy
from bpy.props import IntProperty, StringProperty, BoolProperty
from bpy.types import Operator

from ..core import script_parse
from ..components.exposed_vars import sync_exposed_vars


def _sync_component_vars(comp):
    fields = script_parse.parse_exposed(bpy.path.abspath(comp.script_path))
    sync_exposed_vars(comp, fields)
    return len(fields)


class BJS_OT_pick_script(Operator):
    """Open a file browser to select the behavior source file for a SCRIPT component."""
    bl_idname = "bjs.pick_script"
    bl_label = "Open Script"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()
    filepath: StringProperty(subtype='FILE_PATH')
    # Show only script-like files in the browser.
    filter_glob: StringProperty(
        default="*.ts;*.tsx;*.js;*.jsx;*.mjs", options={'HIDDEN'})
    use_relative: BoolProperty(
        name="Relative Path", default=True,
        description="Store the path relative to the .blend file when possible")

    def invoke(self, context, event):
        # Opens Blender's file browser; selection comes back in execute().
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        obj = context.object
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            self.report({'WARNING'}, "Invalid component")
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]

        path = self.filepath
        if self.use_relative and bpy.data.filepath:
            try:
                path = bpy.path.relpath(path)
            except ValueError:
                pass  # e.g. a different drive on Windows; keep the absolute path

        # Setting script_path triggers its update() which derives script_name.
        comp.script_path = path
        _sync_component_vars(comp)
        self.report({'INFO'}, f"Script: {comp.script_name}")
        return {'FINISHED'}


class BJS_OT_sync_vars(Operator):
    """Re-read @exposed variables from the script file (after editing it)."""
    bl_idname = "bjs.sync_vars"
    bl_label = "Sync Variables"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = context.object
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if not comp.script_path:
            self.report({'WARNING'}, "Pick a script first")
            return {'CANCELLED'}
        n = _sync_component_vars(comp)
        self.report({'INFO'}, f"Synced {n} variable(s)")
        return {'FINISHED'}


classes = (
    BJS_OT_pick_script,
    BJS_OT_sync_vars,
)
