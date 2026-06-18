"""Properties > Scene > "Babylon" — ALL scene-wide settings in one place.

Layout:
    Babylon                  (BJS_PT_scene — root, just a container)
      ├─ Rendering           (clear/ambient color, environment/skybox)
      ├─ Fog                 (header checkbox enables it)
      ├─ Post-Processing     (header checkbox enables it)
      ├─ Input Actions       (input_panel.py)
      └─ Export              (same controls as the viewport sidebar)

Per-object settings live in the 3D viewport N-panel — see view3d_panels.py.
"""

import bpy
from bpy.types import Panel

from ..scene.environment import find_world_env_node
from .common import draw_export_controls
from .post_panels import classes as post_panel_classes


class BJS_PT_scene(Panel):
    """Root container panel; the real settings are the child panels."""
    bl_label = "Babylon"
    bl_idname = "BJS_PT_scene"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"

    def draw(self, context):
        pass


class BJS_PT_scene_rendering(Panel):
    bl_label = "Rendering"
    bl_idname = "BJS_PT_scene_rendering"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene"

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
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene"
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


class BJS_PT_scene_export(Panel):
    bl_label = "Export"
    bl_idname = "BJS_PT_scene_export"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene"

    def draw(self, context):
        draw_export_controls(self.layout, context.scene)


classes = (
    BJS_PT_scene,
    BJS_PT_scene_rendering,
    BJS_PT_scene_fog,
    *post_panel_classes,
    BJS_PT_scene_export,
)
