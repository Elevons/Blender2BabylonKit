"""Open Babylon Editor Launcher deep links for GUI and particle assets."""

import os
import re
import webbrowser

import bpy
from bpy.types import Operator
from bpy.props import StringProperty, IntProperty


LAUNCHER_BASE = "http://localhost:3200"


def _infer_project_level(scene):
    """Guess app + level folder from the Live Link export path, if set."""
    export_path = getattr(scene, "bjs_live_link_path", "") or ""
    if not export_path:
        return "playground", "_workspace"

    norm = os.path.normpath(bpy.path.abspath(export_path))
    parts = norm.replace("\\", "/").split("/")
    project = "playground"
    level = "_workspace"

    if "apps" in parts:
        idx = parts.index("apps")
        if idx + 1 < len(parts):
            project = parts[idx + 1]
    if "levels" in parts:
        idx = parts.index("levels")
        if idx + 1 < len(parts):
            level = parts[idx + 1]

    return project, level


def _asset_filename(filepath):
    if not filepath:
        return ""
    return os.path.basename(bpy.path.abspath(filepath))


def _launcher_url(editor_id, project, level, filename):
    from urllib.parse import urlencode
    params = urlencode({"project": project, "level": level, "file": filename})
    return f"{LAUNCHER_BASE}/editors/{editor_id}?{params}"


class BJS_OT_open_launcher_gui(Operator):
    """Open this GUI asset in the local Babylon Editor Launcher"""
    bl_idname = "bjs.open_launcher_gui"
    bl_label = "Open in Launcher"
    bl_options = {'REGISTER'}

    comp_index: IntProperty(default=0)

    def execute(self, context):
        obj = context.active_object
        if not obj or self.comp_index >= len(obj.bjs_components):
            self.report({'ERROR'}, "No GUI component")
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if comp.comp_type != 'GUI':
            self.report({'ERROR'}, "Component is not a GUI")
            return {'CANCELLED'}

        project, level = _infer_project_level(context.scene)
        filename = _asset_filename(comp.gui_file) or "new-gui.json"
        if not filename.endswith(".json"):
            filename += ".json"

        url = _launcher_url("gui", project, level, filename)
        webbrowser.open(url)
        self.report({'INFO'}, f"Opened {url}")
        return {'FINISHED'}


class BJS_OT_open_launcher_particle(Operator):
    """Open this particle asset in the local Babylon Editor Launcher"""
    bl_idname = "bjs.open_launcher_particle"
    bl_label = "Open in Launcher"
    bl_options = {'REGISTER'}

    comp_index: IntProperty(default=0)

    def execute(self, context):
        obj = context.active_object
        if not obj or self.comp_index >= len(obj.bjs_components):
            self.report({'ERROR'}, "No particle component")
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if comp.comp_type != 'PARTICLE':
            self.report({'ERROR'}, "Component is not a PARTICLE")
            return {'CANCELLED'}

        project, level = _infer_project_level(context.scene)
        filename = _asset_filename(comp.particle_file) or "new-particles.json"
        if not filename.endswith(".json"):
            filename += ".json"

        url = _launcher_url("npe", project, level, filename)
        webbrowser.open(url)
        self.report({'INFO'}, f"Opened {url}")
        return {'FINISHED'}


class BJS_OT_open_launcher_hub(Operator):
    """Open the Babylon Editor Launcher hub in your browser"""
    bl_idname = "bjs.open_launcher_hub"
    bl_label = "Open Editor Launcher"
    bl_options = {'REGISTER'}

    def execute(self, context):
        webbrowser.open(LAUNCHER_BASE)
        self.report({'INFO'}, f"Opened {LAUNCHER_BASE}")
        return {'FINISHED'}


classes = (
    BJS_OT_open_launcher_gui,
    BJS_OT_open_launcher_particle,
    BJS_OT_open_launcher_hub,
)
