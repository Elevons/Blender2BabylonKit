"""Operators: add/remove components, manage script params, and trigger export."""

import bpy
import os
from bpy.props import EnumProperty, IntProperty, StringProperty, BoolProperty
from bpy.types import Operator
from bpy_extras.io_utils import ExportHelper

from .properties import COMPONENT_TYPES, ensure_object_id, sync_exposed_vars, add_list_item, copy_component
from . import export as bjs_export
from . import validate as bjs_validate
from . import script_parse


class BJS_OT_add_component(Operator):
    bl_idname = "bjs.add_component"
    bl_label = "Add Component"
    bl_options = {'REGISTER', 'UNDO'}

    comp_type: EnumProperty(items=COMPONENT_TYPES, name="Type")

    def execute(self, context):
        obj = context.object
        if obj is None:
            self.report({'WARNING'}, "No active object")
            return {'CANCELLED'}
        ensure_object_id(obj)  # entity gets a stable GUID as soon as it has a component
        comp = obj.bjs_components.add()
        comp.comp_type = self.comp_type
        obj.bjs_components_index = len(obj.bjs_components) - 1
        return {'FINISHED'}


class BJS_OT_assign_id(Operator):
    """Assign a stable GUID to selected objects (auto-done on Add Component)."""
    bl_idname = "bjs.assign_id"
    bl_label = "Assign GUID"
    bl_options = {'REGISTER', 'UNDO'}

    selected_only: BoolProperty(default=False)

    def execute(self, context):
        targets = context.selected_objects if self.selected_only else (
            [context.object] if context.object else [])
        n = 0
        for obj in targets:
            if obj:
                ensure_object_id(obj)
                n += 1
        self.report({'INFO'}, f"Assigned GUIDs to {n} object(s)")
        return {'FINISHED'}


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


def _sync_component_vars(comp):
    fields = script_parse.parse_exposed(bpy.path.abspath(comp.script_path))
    sync_exposed_vars(comp, fields)
    return len(fields)


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


class BJS_OT_duplicate_component(Operator):
    bl_idname = "bjs.duplicate_component"
    bl_label = "Duplicate Component"
    bl_options = {'REGISTER', 'UNDO'}

    index: IntProperty()

    def execute(self, context):
        obj = context.object
        if not (obj and 0 <= self.index < len(obj.bjs_components)):
            return {'CANCELLED'}
        new = obj.bjs_components.add()                 # appended at the end
        copy_component(obj.bjs_components[self.index], new)
        obj.bjs_components.move(len(obj.bjs_components) - 1, self.index + 1)
        obj.bjs_components_index = self.index + 1
        return {'FINISHED'}


class BJS_OT_move_component(Operator):
    bl_idname = "bjs.move_component"
    bl_label = "Move Component"
    bl_options = {'REGISTER', 'UNDO'}

    index: IntProperty()
    direction: EnumProperty(items=[('UP', "Up", ""), ('DOWN', "Down", "")])

    def execute(self, context):
        obj = context.object
        if not obj:
            return {'CANCELLED'}
        comps = obj.bjs_components
        j = self.index - 1 if self.direction == 'UP' else self.index + 1
        if 0 <= self.index < len(comps) and 0 <= j < len(comps):
            comps.move(self.index, j)
            obj.bjs_components_index = j
        return {'FINISHED'}


class BJS_OT_copy_component(Operator):
    """Copy this component to the clipboard (paste onto any object)."""
    bl_idname = "bjs.copy_component"
    bl_label = "Copy Component"

    index: IntProperty()

    def execute(self, context):
        obj = context.object
        if not (obj and 0 <= self.index < len(obj.bjs_components)):
            return {'CANCELLED'}
        clip = context.window_manager.bjs_clipboard
        clip.clear()
        copy_component(obj.bjs_components[self.index], clip.add())
        return {'FINISHED'}


class BJS_OT_cut_component(Operator):
    """Move this component to the clipboard (copy, then remove)."""
    bl_idname = "bjs.cut_component"
    bl_label = "Cut Component"
    bl_options = {'REGISTER', 'UNDO'}

    index: IntProperty()

    def execute(self, context):
        obj = context.object
        if not (obj and 0 <= self.index < len(obj.bjs_components)):
            return {'CANCELLED'}
        clip = context.window_manager.bjs_clipboard
        clip.clear()
        copy_component(obj.bjs_components[self.index], clip.add())
        obj.bjs_components.remove(self.index)
        obj.bjs_components_index = min(self.index, len(obj.bjs_components) - 1)
        return {'FINISHED'}


class BJS_OT_paste_component(Operator):
    """Paste the clipboard component onto the active object."""
    bl_idname = "bjs.paste_component"
    bl_label = "Paste Component"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return (context.object is not None
                and len(context.window_manager.bjs_clipboard) > 0)

    def execute(self, context):
        obj = context.object
        clip = context.window_manager.bjs_clipboard
        if not (obj and len(clip) > 0):
            return {'CANCELLED'}
        ensure_object_id(obj)  # it's now an entity
        copy_component(clip[0], obj.bjs_components.add())
        obj.bjs_components_index = len(obj.bjs_components) - 1
        return {'FINISHED'}


class BJS_OT_fit_collider(Operator):
    """Snapshot the mesh bounding box into the collider's manual size/center,
    then switch off Auto-Fit so it can be hand-tweaked with live preview."""
    bl_idname = "bjs.fit_collider"
    bl_label = "Fit Collider to Bounds"
    bl_options = {'REGISTER', 'UNDO'}

    index: IntProperty()

    def execute(self, context):
        obj = context.object
        if not (obj and 0 <= self.index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.index]
        bb = [tuple(c) for c in obj.bound_box]          # 8 local-space corners
        mn = (min(c[0] for c in bb), min(c[1] for c in bb), min(c[2] for c in bb))
        mx = (max(c[0] for c in bb), max(c[1] for c in bb), max(c[2] for c in bb))
        center = tuple((mn[i] + mx[i]) / 2 for i in range(3))
        size = tuple(mx[i] - mn[i] for i in range(3))
        comp.collider_center = center
        comp.collider_size = size
        comp.collider_radius = max(size) / 2            # sphere
        comp.collider_height = size[2]                  # capsule/cylinder run along Z
        comp.collider_rotation = (0.0, 0.0, 0.0)        # bounds are axis-aligned
        comp.auto_fit = False
        return {'FINISHED'}


class BJS_OT_component_menu(Operator):
    """Open the per-component actions menu (duplicate / move / delete)."""
    bl_idname = "bjs.component_menu"
    bl_label = "Component Actions"

    index: IntProperty()

    def execute(self, context):
        if context.object:
            context.object.bjs_components_index = self.index
        bpy.ops.wm.call_menu(name="BJS_MT_component_menu")
        return {'FINISHED'}


class BJS_OT_remove_component(Operator):
    bl_idname = "bjs.remove_component"
    bl_label = "Remove Component"
    bl_options = {'REGISTER', 'UNDO'}

    index: IntProperty()

    def execute(self, context):
        obj = context.object
        if obj and 0 <= self.index < len(obj.bjs_components):
            obj.bjs_components.remove(self.index)
            obj.bjs_components_index = min(self.index, len(obj.bjs_components) - 1)
        return {'FINISHED'}


class BJS_OT_trigger_event_add(Operator):
    """Add a trigger event row to a collider component."""
    bl_idname = "bjs.trigger_event_add"
    bl_label = "Add Trigger Event"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        comps = context.object.bjs_components
        if 0 <= self.comp_index < len(comps):
            comps[self.comp_index].trigger_events.add()
        return {'FINISHED'}


class BJS_OT_trigger_event_remove(Operator):
    """Remove a trigger event row from a collider component."""
    bl_idname = "bjs.trigger_event_remove"
    bl_label = "Remove Trigger Event"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index:  IntProperty()
    event_index: IntProperty()

    def execute(self, context):
        comps = context.object.bjs_components
        if 0 <= self.comp_index < len(comps):
            events = comps[self.comp_index].trigger_events
            if 0 <= self.event_index < len(events):
                events.remove(self.event_index)
        return {'FINISHED'}


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
        warnings = bjs_validate.validate_scene(context)
        try:
            glb_path, json_path, n_entities = bjs_export.export_level(context, self.filepath)
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


class BJS_OT_list_add(Operator):
    """Add an item to a LIST exposed variable."""
    bl_idname = "bjs.list_add"
    bl_label = "Add Item"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()
    var_index: IntProperty()

    def execute(self, context):
        obj = context.object
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if not (0 <= self.var_index < len(comp.exposed_vars)):
            return {'CANCELLED'}
        v = comp.exposed_vars[self.var_index]
        add_list_item(v)
        v.list_index = len(v.list_items) - 1
        return {'FINISHED'}


class BJS_OT_list_remove(Operator):
    """Remove an item from a LIST exposed variable."""
    bl_idname = "bjs.list_remove"
    bl_label = "Remove Item"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()
    var_index: IntProperty()
    item_index: IntProperty()

    def execute(self, context):
        obj = context.object
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if not (0 <= self.var_index < len(comp.exposed_vars)):
            return {'CANCELLED'}
        v = comp.exposed_vars[self.var_index]
        if 0 <= self.item_index < len(v.list_items):
            v.list_items.remove(self.item_index)
        return {'FINISHED'}


classes = (
    BJS_OT_add_component,
    BJS_OT_assign_id,
    BJS_OT_pick_script,
    BJS_OT_sync_vars,
    BJS_OT_list_add,
    BJS_OT_list_remove,
    BJS_OT_duplicate_component,
    BJS_OT_move_component,
    BJS_OT_fit_collider,
    BJS_OT_copy_component,
    BJS_OT_cut_component,
    BJS_OT_paste_component,
    BJS_OT_component_menu,
    BJS_OT_remove_component,
    BJS_OT_trigger_event_add,
    BJS_OT_trigger_event_remove,
    BJS_OT_validate,
    BJS_OT_export,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
