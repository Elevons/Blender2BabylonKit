"""3D viewport N-panel "Babylon Scene" — ALL scene-wide settings in one place.

Layout:
    Rendering           (clear/ambient color, environment/skybox)
    Fog                 (header checkbox enables it)
    Atmosphere
    Post-Processing     (header checkbox enables it)
    Input Actions       (input_panel.py)
    Export

Per-object settings live in the "Babylon Object" N-panel — see view3d_panels.py.
"""

import bpy
from bpy.types import Panel

from ..scene.environment import find_world_env_node
from .common import draw_export_controls
from .post_panels import classes as post_panel_classes
from .input_panel import classes as input_panel_classes


def _atmosphere(context):
    return context.scene.bjs_scene.atmosphere


class BJS_PT_scene_rendering(Panel):
    bl_label = "Rendering"
    bl_idname = "BJS_PT_scene_rendering"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Scene"

    def draw(self, context):
        layout = self.layout
        s = context.scene.bjs_scene

        col = layout.column()
        col.use_property_split = True
        col.prop(s, "clear_color")
        col.prop(s, "ambient_color")

        box = layout.box()
        box.label(text="Environment", icon='WORLD')
        ecol = box.column()
        ecol.use_property_split = True
        ecol.prop(s, "use_default_environment")
        ecol.prop(s, "create_skybox")
        fog_row = ecol.row()
        fog_row.enabled = s.create_skybox
        fog_row.prop(s, "skybox_ignore_fog")
        world = context.scene.world
        has_world_env = world and world.use_nodes and find_world_env_node(world)
        if has_world_env:
            box.label(text="IBL texture from World Output surface", icon='INFO')
        elif s.use_default_environment:
            box.label(text="Built-in studio environment at runtime", icon='INFO')
        else:
            box.label(
                text="No environment — enable Default Environment or add a World texture",
                icon='ERROR')

        sbox = layout.box()
        sbox.label(text="Shadows", icon='MOD_OPACITY')
        sbox.prop(s, "freeze_shadows")


class BJS_PT_scene_fog(Panel):
    bl_label = "Fog"
    bl_idname = "BJS_PT_scene_fog"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Scene"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(context.scene.bjs_scene, "use_fog", text="")

    def draw(self, context):
        layout = self.layout
        s = context.scene.bjs_scene
        layout.active = s.use_fog

        c = layout.column()
        c.use_property_split = True
        c.prop(s, "fog_mode")
        c.prop(s, "fog_color")
        if s.fog_mode == 'LINEAR':
            c.prop(s, "fog_start")
            c.prop(s, "fog_end")
        else:
            c.prop(s, "fog_density")


class BJS_PT_scene_atmosphere(Panel):
    bl_label = "Atmosphere"
    bl_idname = "BJS_PT_scene_atmosphere"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Scene"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_atmosphere(context), "use_atmosphere", text="")

    def draw(self, context):
        layout = self.layout
        atmosphere = _atmosphere(context)
        layout.active = atmosphere.use_atmosphere

        col = layout.column()
        col.use_property_split = True
        col.prop(atmosphere, "sun_light")
        col.prop(atmosphere, "pbr_sun_intensity")
        col.prop(atmosphere, "use_luts")

        box = layout.box()
        box.label(text="Scattering", icon='LIGHT_SUN')
        scattering = box.column()
        scattering.use_property_split = True
        scattering.prop(atmosphere, "multi_scattering_intensity")
        scattering.prop(atmosphere, "minimum_multi_scattering_intensity")
        scattering.prop(atmosphere, "ground_albedo")
        scattering.prop(atmosphere, "peak_rayleigh_scattering")
        scattering.prop(atmosphere, "mie_scattering_scale")
        scattering.prop(atmosphere, "ozone_absorption_scale")
        scattering.prop(atmosphere, "origin_height")

        if atmosphere.use_atmosphere:
            layout.label(
                text="Replaces the environment skybox; enable Post-Processing "
                     "HDR + tone mapping for best results",
                icon='INFO')


class BJS_PT_scene_export(Panel):
    bl_label = "Export"
    bl_idname = "BJS_PT_scene_export"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Scene"

    def draw(self, context):
        draw_export_controls(self.layout, context.scene)


classes = (
    BJS_PT_scene_rendering,
    BJS_PT_scene_fog,
    BJS_PT_scene_atmosphere,
    *post_panel_classes,
    *input_panel_classes,
    BJS_PT_scene_export,
)
