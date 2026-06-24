"""Operators for Babylon node material (NME) authoring on Material datablocks."""

import os
import webbrowser

import bpy
from bpy.types import Operator
from bpy.props import StringProperty, IntProperty

from ..materials.nme_scan import sync_material_nme_textures
from ..materials.context import panel_material
from .launcher_ops import _infer_project_level, _asset_filename, _launcher_url


def _resolve_material(context, material_name=""):
    if material_name:
        return bpy.data.materials.get(material_name)
    return panel_material(context)


class BJS_OT_scan_nme_textures(Operator):
    """Read texture slots from the node material JSON and populate the list."""
    bl_idname = "bjs.scan_nme_textures"
    bl_label = "Scan Textures"
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

        count = sync_material_nme_textures(mat)
        if count == 0:
            self.report({'WARNING'}, "No texture blocks found in the JSON")
        else:
            self.report({'INFO'}, f"Found {count} texture slot{'s' if count != 1 else ''}")
        return {'FINISHED'}


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
    BJS_OT_nme_texture_add,
    BJS_OT_nme_texture_remove,
    BJS_OT_open_launcher_nme,
)
