"""Operators for the component stack: add/remove, reorder, duplicate,
cut/copy/paste, collider fitting, trigger / click event rows, and LIST
exposed-var items."""

import bpy
from bpy.props import EnumProperty, IntProperty, BoolProperty
from bpy.types import Operator

from ..core.bounds import compute_local_bounds
from ..core.ids import ensure_object_id
from ..core.inspector import inspector_object
from ..core.prop_copy import remove_collection_item
from ..components.constants import ADD_COMPONENT_MENU
from ..components.exposed_vars import add_list_item
from ..components.clipboard import copy_component
from ..components.particle_scan import sync_component_particle_textures


class BJS_OT_toggle_pin(Operator):
    """Pin the Components panel to the active object so it stays put while you
    change the viewport selection (toggle off to follow selection again)."""
    bl_idname = "bjs.toggle_pin"
    bl_label = "Pin Inspector"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        wm = context.window_manager
        if wm.bjs_pinned_object is not None:
            wm.bjs_pinned_object = None
        else:
            if context.object is None:
                self.report({'WARNING'}, "No active object to pin")
                return {'CANCELLED'}
            wm.bjs_pinned_object = context.object
        return {'FINISHED'}


class BJS_OT_add_component(Operator):
    bl_idname = "bjs.add_component"
    bl_label = "Add Component"
    bl_options = {'REGISTER', 'UNDO'}

    comp_type: EnumProperty(items=ADD_COMPONENT_MENU, name="Type")

    def execute(self, context):
        obj = inspector_object(context)
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
        single = inspector_object(context)
        targets = context.selected_objects if self.selected_only else (
            [single] if single else [])
        n = 0
        for obj in targets:
            if obj:
                ensure_object_id(obj)
                n += 1
        self.report({'INFO'}, f"Assigned GUIDs to {n} object(s)")
        return {'FINISHED'}


class BJS_OT_duplicate_component(Operator):
    bl_idname = "bjs.duplicate_component"
    bl_label = "Duplicate Component"
    bl_options = {'REGISTER', 'UNDO'}

    index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
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
        obj = inspector_object(context)
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
        obj = inspector_object(context)
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
        obj = inspector_object(context)
        if not (obj and 0 <= self.index < len(obj.bjs_components)):
            return {'CANCELLED'}
        clip = context.window_manager.bjs_clipboard
        clip.clear()
        copy_component(obj.bjs_components[self.index], clip.add())
        remove_collection_item(obj.bjs_components, self.index)
        obj.bjs_components_index = min(self.index, len(obj.bjs_components) - 1)
        return {'FINISHED'}


class BJS_OT_paste_component(Operator):
    """Paste the clipboard component onto the active object."""
    bl_idname = "bjs.paste_component"
    bl_label = "Paste Component"
    bl_options = {'REGISTER', 'UNDO'}

    @classmethod
    def poll(cls, context):
        return (inspector_object(context) is not None
                and len(context.window_manager.bjs_clipboard) > 0)

    def execute(self, context):
        obj = inspector_object(context)
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
        obj = inspector_object(context)
        if not (obj and 0 <= self.index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.index]
        center, size = compute_local_bounds(obj)
        comp.collider_center = center
        comp.collider_size = size
        comp.collider_radius = max(size[0], size[1]) / 2   # cylinder/capsule: XY in Z-up
        comp.collider_height = size[2]                       # runs along Blender Z
        if comp.collider_shape == 'SPHERE':
            comp.collider_radius = max(size) / 2
        comp.collider_rotation = (0.0, 0.0, 0.0)        # bounds are axis-aligned
        comp.auto_fit = False
        return {'FINISHED'}


class BJS_OT_fit_cog(Operator):
    """Snapshot the mesh bounding box center into the rigid body's custom CoM,
    then switch off Auto-Fit so it can be hand-tweaked."""
    bl_idname = "bjs.fit_cog"
    bl_label = "Fit Center of Mass to Bounds"
    bl_options = {'REGISTER', 'UNDO'}

    index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if not (obj and 0 <= self.index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.index]
        if comp.comp_type != 'RIGIDBODY':
            return {'CANCELLED'}
        center, _size = compute_local_bounds(obj)
        comp.cog_center = center
        comp.cog_auto_fit = False
        return {'FINISHED'}


class BJS_OT_component_menu(Operator):
    """Open the per-component actions menu (duplicate / move / delete)."""
    bl_idname = "bjs.component_menu"
    bl_label = "Component Actions"

    index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj:
            obj.bjs_components_index = self.index
        bpy.ops.wm.call_menu(name="BJS_MT_component_menu")
        return {'FINISHED'}


class BJS_OT_remove_component(Operator):
    bl_idname = "bjs.remove_component"
    bl_label = "Remove Component"
    bl_options = {'REGISTER', 'UNDO'}

    index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj and 0 <= self.index < len(obj.bjs_components):
            remove_collection_item(obj.bjs_components, self.index)
            obj.bjs_components_index = min(self.index, len(obj.bjs_components) - 1)
        return {'FINISHED'}


class BJS_OT_event_message_add(Operator):
    """Add an Event Message row to a collider component."""
    bl_idname = "bjs.event_message_add"
    bl_label = "Add Event Message"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            comps[self.comp_index].event_messages.add()
        return {'FINISHED'}


class BJS_OT_event_message_remove(Operator):
    """Remove an Event Message row from a collider component."""
    bl_idname = "bjs.event_message_remove"
    bl_label = "Remove Event Message"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index:  IntProperty()
    event_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            events = comps[self.comp_index].event_messages
            remove_collection_item(events, self.event_index)
        return {'FINISHED'}


class BJS_OT_gui3d_event_add(Operator):
    """Add an On Click event row to a 3D GUI control component."""
    bl_idname = "bjs.gui3d_event_add"
    bl_label = "Add Click Event"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            comps[self.comp_index].gui3d_events.add()
        return {'FINISHED'}


class BJS_OT_gui3d_event_remove(Operator):
    """Remove an On Click event row from a 3D GUI control component."""
    bl_idname = "bjs.gui3d_event_remove"
    bl_label = "Remove Click Event"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index:  IntProperty()
    event_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            events = comps[self.comp_index].gui3d_events
            remove_collection_item(events, self.event_index)
        return {'FINISHED'}


class BJS_OT_scan_particle_textures(Operator):
    """Read texture slots from the particle JSON and populate the list."""
    bl_idname = "bjs.scan_particle_textures"
    bl_label = "Scan Textures"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if not (0 <= self.comp_index < len(comps)):
            return {'CANCELLED'}
        comp = comps[self.comp_index]
        if not comp.particle_file:
            self.report({'ERROR'}, "Assign a particle JSON first")
            return {'CANCELLED'}

        count = sync_component_particle_textures(comp)
        if count == 0:
            self.report({'WARNING'}, "No texture blocks found in the JSON")
        else:
            self.report({'INFO'}, f"Found {count} texture slot{'s' if count != 1 else ''}")
        return {'FINISHED'}


class BJS_OT_particle_texture_add(Operator):
    """Add a particle texture override row."""
    bl_idname = "bjs.particle_texture_add"
    bl_label = "Add Particle Texture"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            comps[self.comp_index].particle_textures.add()
        return {'FINISHED'}


class BJS_OT_particle_texture_remove(Operator):
    """Remove a particle texture override row."""
    bl_idname = "bjs.particle_texture_remove"
    bl_label = "Remove Particle Texture"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()
    particle_texture_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            textures = comps[self.comp_index].particle_textures
            remove_collection_item(textures, self.particle_texture_index)
        return {'FINISHED'}


class BJS_OT_probe_render_add(Operator):
    """Add an object to the reflection probe render list."""
    bl_idname = "bjs.probe_render_add"
    bl_label = "Add Render Object"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            comps[self.comp_index].probe_render_list.add()
        return {'FINISHED'}


class BJS_OT_probe_render_remove(Operator):
    """Remove an object from the reflection probe render list."""
    bl_idname = "bjs.probe_render_remove"
    bl_label = "Remove Render Object"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()
    entry_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            entries = comps[self.comp_index].probe_render_list
            remove_collection_item(entries, self.entry_index)
        return {'FINISHED'}


class BJS_OT_probe_exclude_add(Operator):
    """Add an object to the reflection probe exclude list."""
    bl_idname = "bjs.probe_exclude_add"
    bl_label = "Add Exclude Object"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            comps[self.comp_index].probe_render_excludes.add()
        return {'FINISHED'}


class BJS_OT_probe_exclude_remove(Operator):
    """Remove an object from the reflection probe exclude list."""
    bl_idname = "bjs.probe_exclude_remove"
    bl_label = "Remove Probe Exclude"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index:  IntProperty()
    entry_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            entries = comps[self.comp_index].probe_render_excludes
            remove_collection_item(entries, self.entry_index)
        return {'FINISHED'}


class BJS_OT_lod_level_add(Operator):
    """Add a LOD level row."""
    bl_idname = "bjs.lod_level_add"
    bl_label = "Add LOD Level"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            comps[self.comp_index].lod_levels.add()
        return {'FINISHED'}


class BJS_OT_lod_level_remove(Operator):
    """Remove a LOD level row."""
    bl_idname = "bjs.lod_level_remove"
    bl_label = "Remove LOD Level"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index:  IntProperty()
    level_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if obj is None:
            return {'CANCELLED'}
        comps = obj.bjs_components
        if 0 <= self.comp_index < len(comps):
            levels = comps[self.comp_index].lod_levels
            remove_collection_item(levels, self.level_index)
        return {'FINISHED'}


class BJS_OT_list_add(Operator):
    """Add an item to a LIST exposed variable."""
    bl_idname = "bjs.list_add"
    bl_label = "Add Item"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()
    var_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if not (0 <= self.var_index < len(comp.exposed_vars)):
            return {'CANCELLED'}
        v = comp.exposed_vars[self.var_index]
        add_list_item(v)
        v.list_index = len(v.list_items) - 1
        return {'FINISHED'}


class BJS_OT_list_add_selected(Operator):
    """Add every selected object to an ENTITY list var (skips ones already in it)."""
    bl_idname = "bjs.list_add_selected"
    bl_label = "Add Selected Objects"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()
    var_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if not (0 <= self.var_index < len(comp.exposed_vars)):
            return {'CANCELLED'}
        v = comp.exposed_vars[self.var_index]
        if v.elem_type != 'ENTITY':
            self.report({'WARNING'}, "Not an entity list")
            return {'CANCELLED'}

        existing = {item.obj_val for item in v.list_items if item.obj_val is not None}
        added = 0
        for picked in context.selected_objects:
            # Don't add the list's own object to itself, and skip duplicates.
            if picked is obj or picked in existing:
                continue
            item = add_list_item(v)
            item.obj_val = picked
            existing.add(picked)
            added += 1

        if added == 0:
            self.report({'INFO'}, "No new objects to add")
            return {'CANCELLED'}
        v.list_index = len(v.list_items) - 1
        self.report({'INFO'}, f"Added {added} object(s)")
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
        obj = inspector_object(context)
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if not (0 <= self.var_index < len(comp.exposed_vars)):
            return {'CANCELLED'}
        v = comp.exposed_vars[self.var_index]
        remove_collection_item(v.list_items, self.item_index)
        return {'FINISHED'}


classes = (
    BJS_OT_toggle_pin,
    BJS_OT_add_component,
    BJS_OT_assign_id,
    BJS_OT_list_add,
    BJS_OT_list_add_selected,
    BJS_OT_list_remove,
    BJS_OT_duplicate_component,
    BJS_OT_move_component,
    BJS_OT_fit_collider,
    BJS_OT_fit_cog,
    BJS_OT_copy_component,
    BJS_OT_cut_component,
    BJS_OT_paste_component,
    BJS_OT_component_menu,
    BJS_OT_remove_component,
    BJS_OT_event_message_add,
    BJS_OT_event_message_remove,
    BJS_OT_gui3d_event_add,
    BJS_OT_gui3d_event_remove,
    BJS_OT_scan_particle_textures,
    BJS_OT_particle_texture_add,
    BJS_OT_particle_texture_remove,
    BJS_OT_probe_render_add,
    BJS_OT_probe_render_remove,
    BJS_OT_probe_exclude_add,
    BJS_OT_probe_exclude_remove,
    BJS_OT_lod_level_add,
    BJS_OT_lod_level_remove,
)
