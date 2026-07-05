"""Operators for Babylon node material (NME) authoring on Material datablocks."""

import webbrowser

import bpy
from bpy.types import Operator
from bpy.props import StringProperty, IntProperty

from ..materials.nme_scan import (
    enumerate_nme_gradient_slots,
    enumerate_nme_input_slots,
    sync_material_nme,
)
from ..materials.nme_inputs import write_row_value
from ..materials.nme_gradients import setup_gradient_ramp, write_row_steps
from ..materials.nme_textures import extract_nme_textures
from ..materials.context import panel_material
from .launcher_ops import _infer_project_level, _asset_filename, _launcher_url


def _resolve_material(context, material_name=""):
    if material_name:
        return bpy.data.materials.get(material_name)
    return panel_material(context)


class BJS_OT_scan_nme_textures(Operator):
    """Read texture slots, inspector parameters, and gradients from the node material JSON."""
    bl_idname = "bjs.scan_nme_textures"
    bl_label = "Scan NME"
    bl_options = {'REGISTER'}

    material_name: StringProperty(default="")

    def execute(self, context):
        mat = _resolve_material(context, self.material_name)
        if mat is None:
            self.report({'ERROR'}, "No active material")
            return {'CANCELLED'}
        if not mat.bjs_nme_file:
            self.report({'ERROR'}, "Assign a node material JSON first")
            return {'CANCELLED'}

        texture_count, input_count, gradient_count = sync_material_nme(mat)
        parts = []
        if texture_count > 0:
            parts.append(
                f"{texture_count} texture slot{'s' if texture_count != 1 else ''}")
        if input_count > 0:
            parts.append(
                f"{input_count} parameter{'s' if input_count != 1 else ''}")
        if gradient_count > 0:
            parts.append(
                f"{gradient_count} gradient{'s' if gradient_count != 1 else ''}")
        if not parts:
            self.report({'WARNING'}, "No texture blocks, inspector inputs, or gradients found")
        else:
            self.report({'INFO'}, f"Found {' and '.join(parts)}")
        return {'FINISHED'}


class BJS_OT_nme_input_reset(Operator):
    """Reset this parameter to the value stored in the node material JSON."""
    bl_idname = "bjs.nme_input_reset"
    bl_label = "Reset to NME JSON Value"
    bl_options = {'REGISTER', 'UNDO'}

    material_name: StringProperty(default="")
    block_id: IntProperty(default=0)

    def execute(self, context):
        mat = _resolve_material(context, self.material_name)
        if mat is None or not mat.bjs_nme_file:
            self.report({'ERROR'}, "No material with an NME JSON assigned")
            return {'CANCELLED'}

        slots = {slot["block_id"]: slot for slot in enumerate_nme_input_slots(mat.bjs_nme_file)}
        slot = slots.get(self.block_id)
        if slot is None:
            self.report({'ERROR'}, f"Block id {self.block_id} not found in the NME JSON")
            return {'CANCELLED'}

        for row in mat.bjs_nme_inputs:
            if row.block_id != self.block_id:
                continue
            row.value_type = slot["value_type"]
            write_row_value(row, row.value_type, slot["value"])
            self.report({'INFO'}, f"Reset '{row.block_name}' from JSON")
            return {'FINISHED'}

        self.report({'ERROR'}, "Parameter row not found — Scan NME first")
        return {'CANCELLED'}


class BJS_OT_nme_gradient_reset(Operator):
    """Reset this gradient's color stops to those stored in the node material JSON."""
    bl_idname = "bjs.nme_gradient_reset"
    bl_label = "Reset Gradient from NME JSON"
    bl_options = {'REGISTER', 'UNDO'}

    material_name: StringProperty(default="")
    block_id: IntProperty(default=0)

    def execute(self, context):
        mat = _resolve_material(context, self.material_name)
        if mat is None or not mat.bjs_nme_file:
            self.report({'ERROR'}, "No material with an NME JSON assigned")
            return {'CANCELLED'}

        slots = {slot["block_id"]: slot for slot in enumerate_nme_gradient_slots(mat.bjs_nme_file)}
        slot = slots.get(self.block_id)
        if slot is None:
            self.report({'ERROR'}, f"Block id {self.block_id} not found in the NME JSON")
            return {'CANCELLED'}

        for row in mat.bjs_nme_gradients:
            if row.block_id != self.block_id:
                continue
            write_row_steps(row, slot["color_steps"])
            setup_gradient_ramp(mat, row)
            self.report({'INFO'}, f"Reset '{row.block_name}' from JSON")
            return {'FINISHED'}

        self.report({'ERROR'}, "Gradient row not found — Scan NME first")
        return {'CANCELLED'}


class BJS_OT_nme_texture_add(Operator):
    """Add a manual node material texture override row."""
    bl_idname = "bjs.nme_texture_add"
    bl_label = "Add Texture Override"
    bl_options = {'REGISTER'}

    material_name: StringProperty(default="")

    def execute(self, context):
        mat = _resolve_material(context, self.material_name)
        if mat is None:
            self.report({'ERROR'}, "No active material")
            return {'CANCELLED'}
        mat.bjs_nme_textures.add()
        return {'FINISHED'}


class BJS_OT_nme_texture_remove(Operator):
    """Remove a node material texture override row."""
    bl_idname = "bjs.nme_texture_remove"
    bl_label = "Remove Texture Override"
    bl_options = {'REGISTER'}

    material_name: StringProperty(default="")
    texture_index: IntProperty()

    def execute(self, context):
        mat = _resolve_material(context, self.material_name)
        if mat is None:
            self.report({'ERROR'}, "No active material")
            return {'CANCELLED'}
        textures = mat.bjs_nme_textures
        if 0 <= self.texture_index < len(textures):
            textures.remove(self.texture_index)
        return {'FINISHED'}


class BJS_OT_extract_nme_textures(Operator):
    """Extract embedded NME textures into a folder on disk."""
    bl_idname = "bjs.extract_nme_textures"
    bl_label = "Extract Embedded Textures"
    bl_options = {'REGISTER'}

    material_name: StringProperty(default="")
    directory: StringProperty(subtype='DIR_PATH')

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        mat = _resolve_material(context, self.material_name)
        if mat is None:
            self.report({'ERROR'}, "No active material")
            return {'CANCELLED'}
        if not mat.bjs_nme_file:
            self.report({'ERROR'}, "Assign a node material JSON first")
            return {'CANCELLED'}
        if not self.directory:
            self.report({'ERROR'}, "Pick a destination folder")
            return {'CANCELLED'}

        extracted = extract_nme_textures(mat.bjs_nme_file, self.directory)
        if not extracted:
            self.report({'WARNING'}, "No embedded textures found to extract")
            return {'CANCELLED'}

        sync_material_nme(mat)
        by_id = {row.block_id: row for row in mat.bjs_nme_textures if row.block_id}
        for entry in extracted:
            row = by_id.get(entry["block_id"])
            if row is not None:
                row.image_file = entry["abs_path"]

        names = ", ".join(entry["filename"] for entry in extracted)
        self.report({'INFO'}, f"Extracted {len(extracted)} texture(s): {names}")
        return {'FINISHED'}


class BJS_OT_open_launcher_nme(Operator):
    """Open this node material in the local Babylon Editor Launcher"""
    bl_idname = "bjs.open_launcher_nme"
    bl_label = "Open in Launcher"
    bl_options = {'REGISTER'}

    material_name: StringProperty(default="")

    def execute(self, context):
        mat = _resolve_material(context, self.material_name)
        if mat is None:
            self.report({'ERROR'}, "No active material")
            return {'CANCELLED'}

        project, level = _infer_project_level(context.scene)
        filename = _asset_filename(mat.bjs_nme_file) or "new-material.json"
        if not filename.endswith(".json"):
            filename += ".json"

        url = _launcher_url("nme", project, level, filename)
        webbrowser.open(url)
        self.report({'INFO'}, f"Opened {url}")
        return {'FINISHED'}


classes = (
    BJS_OT_scan_nme_textures,
    BJS_OT_nme_input_reset,
    BJS_OT_nme_gradient_reset,
    BJS_OT_nme_texture_add,
    BJS_OT_nme_texture_remove,
    BJS_OT_extract_nme_textures,
    BJS_OT_open_launcher_nme,
)
