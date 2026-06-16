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

from .common import draw_export_controls


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
        box.prop(s, "create_skybox")
        if context.scene.world and context.scene.world.use_nodes:
            box.label(text="Texture read from World nodes", icon='INFO')
        else:
            box.label(text="No World environment texture", icon='ERROR')

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


class BJS_PT_scene_post(Panel):
    bl_label = "Post-Processing"
    bl_idname = "BJS_PT_scene_post"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(context.scene.bjs_scene, "use_pipeline", text="")

    def draw(self, context):
        layout = self.layout
        s = context.scene.bjs_scene
        layout.active = s.use_pipeline

        c = layout.column()
        c.prop(s, "use_fxaa")
        c.prop(s, "use_ssao")
        c.prop(s, "use_bloom")
        if s.use_bloom:
            sub = c.column()
            sub.use_property_split = True
            sub.prop(s, "bloom_threshold")
            sub.prop(s, "bloom_intensity")
        c.prop(s, "use_tone_mapping")
        if s.use_tone_mapping:
            sub = c.column()
            sub.use_property_split = True
            sub.prop(s, "exposure")
            sub.prop(s, "contrast")


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
    BJS_PT_scene_post,
    BJS_PT_scene_export,
)
