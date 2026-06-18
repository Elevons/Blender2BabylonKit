"""Properties > Scene > Babylon > Post-Processing sub-panels."""

import bpy
from bpy.types import Panel


def _post(context):
    return context.scene.bjs_scene.post


class BJS_PT_scene_post(Panel):
    bl_label = "Post-Processing"
    bl_idname = "BJS_PT_scene_post"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_pipeline", text="")

    def draw(self, context):
        layout = self.layout
        p = _post(context)
        layout.active = p.use_pipeline

        box = layout.box()
        box.label(text="Antialiasing")
        col = box.column()
        col.prop(p, "use_fxaa")
        sub = col.column()
        sub.use_property_split = True
        sub.prop(p, "msaa_samples")


class BJS_PT_scene_post_bloom(Panel):
    bl_label = "Bloom"
    bl_idname = "BJS_PT_scene_post_bloom"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_bloom", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_pipeline and p.use_bloom
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "bloom_threshold")
        col.prop(p, "bloom_intensity")
        col.prop(p, "bloom_kernel")
        col.prop(p, "bloom_scale")


class BJS_PT_scene_post_ssao(Panel):
    bl_label = "SSAO"
    bl_idname = "BJS_PT_scene_post_ssao"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_ssao", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_pipeline and p.use_ssao
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "ssao_radius")
        col.prop(p, "ssao_strength")
        col.prop(p, "ssao_samples")
        col.prop(p, "ssao_max_z")


class BJS_PT_scene_post_image(Panel):
    bl_label = "Image Processing"
    bl_idname = "BJS_PT_scene_post_image"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post"
    bl_options = {'DEFAULT_CLOSED'}

    @classmethod
    def poll(cls, context):
        return context.scene.bjs_scene.post.use_pipeline

    def draw(self, context):
        p = _post(context)
        layout = self.layout

        col = layout.column()
        col.prop(p, "use_tone_mapping")
        if p.use_tone_mapping:
            sub = col.column()
            sub.use_property_split = True
            sub.prop(p, "tone_mapping_type")
            sub.prop(p, "exposure")
            sub.prop(p, "contrast")


class BJS_PT_scene_post_vignette(Panel):
    bl_label = "Vignette"
    bl_idname = "BJS_PT_scene_post_vignette"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post_image"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_vignette", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_vignette
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "vignette_weight")
        col.prop(p, "vignette_stretch")
        col.prop(p, "vignette_center_x")
        col.prop(p, "vignette_center_y")


class BJS_PT_scene_post_color_grading(Panel):
    bl_label = "Color Grading"
    bl_idname = "BJS_PT_scene_post_color_grading"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post_image"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_color_grading", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_color_grading
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "color_grading_file")


class BJS_PT_scene_post_color_curves(Panel):
    bl_label = "Color Curves"
    bl_idname = "BJS_PT_scene_post_color_curves"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post_image"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_color_curves", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_color_curves
        col = self.layout.column()
        col.use_property_split = True

        col.label(text="Global")
        col.prop(p, "curve_global_hue")
        col.prop(p, "curve_global_density")
        col.prop(p, "curve_global_saturation")
        col.prop(p, "curve_global_exposure")

        col.label(text="Highlights")
        col.prop(p, "curve_highlights_hue")
        col.prop(p, "curve_highlights_density")
        col.prop(p, "curve_highlights_saturation")
        col.prop(p, "curve_highlights_exposure")

        col.label(text="Midtones")
        col.prop(p, "curve_midtones_hue")
        col.prop(p, "curve_midtones_density")
        col.prop(p, "curve_midtones_saturation")
        col.prop(p, "curve_midtones_exposure")

        col.label(text="Shadows")
        col.prop(p, "curve_shadows_hue")
        col.prop(p, "curve_shadows_density")
        col.prop(p, "curve_shadows_saturation")
        col.prop(p, "curve_shadows_exposure")


class BJS_PT_scene_post_sharpen(Panel):
    bl_label = "Sharpen"
    bl_idname = "BJS_PT_scene_post_sharpen"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_sharpen", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_pipeline and p.use_sharpen
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "sharpen_edge_amount")
        col.prop(p, "sharpen_color_amount")


class BJS_PT_scene_post_dof(Panel):
    bl_label = "Depth of Field"
    bl_idname = "BJS_PT_scene_post_dof"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_dof", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_pipeline and p.use_dof
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "dof_blur_level")
        col.prop(p, "dof_focus_distance")
        col.prop(p, "dof_focal_length")
        col.prop(p, "dof_f_stop")


class BJS_PT_scene_post_chromatic(Panel):
    bl_label = "Chromatic Aberration"
    bl_idname = "BJS_PT_scene_post_chromatic"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_chromatic_aberration", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_pipeline and p.use_chromatic_aberration
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "ca_aberration_amount")
        col.prop(p, "ca_radial_intensity")
        col.prop(p, "ca_direction_x")
        col.prop(p, "ca_direction_y")


class BJS_PT_scene_post_grain(Panel):
    bl_label = "Grain"
    bl_idname = "BJS_PT_scene_post_grain"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_grain", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_pipeline and p.use_grain
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "grain_intensity")
        col.prop(p, "grain_animated")


class BJS_PT_scene_post_glow(Panel):
    bl_label = "Glow Layer"
    bl_idname = "BJS_PT_scene_post_glow"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = "scene"
    bl_parent_id = "BJS_PT_scene_post"
    bl_options = {'DEFAULT_CLOSED'}

    def draw_header(self, context):
        self.layout.prop(_post(context), "use_glow", text="")

    def draw(self, context):
        p = _post(context)
        self.layout.active = p.use_pipeline and p.use_glow
        col = self.layout.column()
        col.use_property_split = True
        col.prop(p, "glow_blur_kernel")
        col.prop(p, "glow_intensity")


classes = (
    BJS_PT_scene_post,
    BJS_PT_scene_post_bloom,
    BJS_PT_scene_post_ssao,
    BJS_PT_scene_post_image,
    BJS_PT_scene_post_vignette,
    BJS_PT_scene_post_color_grading,
    BJS_PT_scene_post_color_curves,
    BJS_PT_scene_post_sharpen,
    BJS_PT_scene_post_dof,
    BJS_PT_scene_post_chromatic,
    BJS_PT_scene_post_grain,
    BJS_PT_scene_post_glow,
)
