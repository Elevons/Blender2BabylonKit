"""Properties > Scene panel for the scene-wide Babylon render settings."""

import bpy
from bpy.types import Panel


class BJS_PT_scene(Panel):
    bl_label = "Babylon Scene"
    bl_idname = "BJS_PT_scene"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"

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

        box = layout.box()
        box.prop(s, "use_fog", text="Fog")
        if s.use_fog:
            c = box.column()
            c.use_property_split = True
            c.prop(s, "fog_mode")
            c.prop(s, "fog_color")
            if s.fog_mode == 'LINEAR':
                c.prop(s, "fog_start")
                c.prop(s, "fog_end")
            else:
                c.prop(s, "fog_density")

        box = layout.box()
        box.prop(s, "use_pipeline", text="Post-Processing")
        if s.use_pipeline:
            c = box.column()
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


def register():
    bpy.utils.register_class(BJS_PT_scene)


def unregister():
    bpy.utils.unregister_class(BJS_PT_scene)
