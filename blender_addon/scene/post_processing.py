"""Post-processing settings for the Default Rendering Pipeline + SSAO2."""

import bpy
from bpy.props import (
    BoolProperty, FloatProperty, EnumProperty, IntProperty, StringProperty,
)
from bpy.types import PropertyGroup


class BJSPostProcessingSettings(PropertyGroup):
    use_pipeline: BoolProperty(name="Default Pipeline", default=False)

    # Antialiasing
    use_fxaa: BoolProperty(name="FXAA", default=True)
    msaa_samples: IntProperty(
        name="MSAA Samples", default=1, min=1, max=8,
        description="Multisample anti-aliasing (WebGL 2 only; 1 = off)")

    # Bloom
    use_bloom: BoolProperty(name="Bloom", default=False)
    bloom_threshold: FloatProperty(name="Threshold", default=0.9, min=0.0, max=2.0)
    bloom_intensity: FloatProperty(name="Intensity", default=0.5, min=0.0, max=5.0)
    bloom_kernel: IntProperty(name="Kernel", default=64, min=1, max=128)
    bloom_scale: FloatProperty(name="Scale", default=0.5, min=0.0, max=1.0)

    # SSAO
    use_ssao: BoolProperty(name="SSAO", default=False)
    ssao_radius: FloatProperty(name="Radius", default=2.0, min=0.0, max=10.0)
    ssao_strength: FloatProperty(name="Strength", default=1.0, min=0.0, max=2.0)
    ssao_samples: IntProperty(name="Samples", default=8, min=1, max=32)
    ssao_max_z: FloatProperty(name="Max Z", default=10000.0, min=0.0)

    # Image processing
    use_tone_mapping: BoolProperty(name="Tone Mapping", default=True)
    tone_mapping_type: EnumProperty(
        name="Tone Mapping Type",
        items=[
            ('STANDARD', "Standard", "Babylon default tone mapping"),
            ('ACES', "ACES", "ACES filmic curve (Unreal/Unity default)"),
            ('KHR_PBR_NEUTRAL', "Khronos PBR Neutral", "Khronos neutral curve"),
        ],
        default='ACES')
    exposure: FloatProperty(name="Exposure", default=1.0, min=0.0, max=10.0)
    contrast: FloatProperty(name="Contrast", default=1.0, min=0.0, max=5.0)

    # Vignette
    use_vignette: BoolProperty(name="Vignette", default=False)
    vignette_weight: FloatProperty(name="Weight", default=1.5, min=0.0, max=10.0)
    vignette_stretch: FloatProperty(name="Stretch", default=0.0, min=0.0, max=1.0)
    vignette_center_x: FloatProperty(name="Center X", default=0.0, min=-1.0, max=1.0)
    vignette_center_y: FloatProperty(name="Center Y", default=0.0, min=-1.0, max=1.0)

    # Color grading / curves
    use_color_grading: BoolProperty(name="Color Grading", default=False)
    color_grading_file: StringProperty(
        name="LUT File", subtype='FILE_PATH', default="",
        description="3D LUT (.3dl, .cube) or color grade PNG")
    use_color_curves: BoolProperty(name="Color Curves", default=False)
    curve_global_hue: FloatProperty(name="Global Hue", default=30.0, min=0.0, max=360.0)
    curve_global_density: FloatProperty(name="Global Density", default=0.0, min=-100.0, max=100.0)
    curve_global_saturation: FloatProperty(name="Global Saturation", default=0.0, min=-100.0, max=100.0)
    curve_global_exposure: FloatProperty(name="Global Exposure", default=0.0, min=-100.0, max=100.0)
    curve_highlights_hue: FloatProperty(name="Highlights Hue", default=30.0, min=0.0, max=360.0)
    curve_highlights_density: FloatProperty(name="Highlights Density", default=0.0, min=-100.0, max=100.0)
    curve_highlights_saturation: FloatProperty(name="Highlights Saturation", default=0.0, min=-100.0, max=100.0)
    curve_highlights_exposure: FloatProperty(name="Highlights Exposure", default=0.0, min=-100.0, max=100.0)
    curve_midtones_hue: FloatProperty(name="Midtones Hue", default=30.0, min=0.0, max=360.0)
    curve_midtones_density: FloatProperty(name="Midtones Density", default=0.0, min=-100.0, max=100.0)
    curve_midtones_saturation: FloatProperty(name="Midtones Saturation", default=0.0, min=-100.0, max=100.0)
    curve_midtones_exposure: FloatProperty(name="Midtones Exposure", default=0.0, min=-100.0, max=100.0)
    curve_shadows_hue: FloatProperty(name="Shadows Hue", default=30.0, min=0.0, max=360.0)
    curve_shadows_density: FloatProperty(name="Shadows Density", default=0.0, min=-100.0, max=100.0)
    curve_shadows_saturation: FloatProperty(name="Shadows Saturation", default=0.0, min=-100.0, max=100.0)
    curve_shadows_exposure: FloatProperty(name="Shadows Exposure", default=0.0, min=-100.0, max=100.0)

    # Sharpen
    use_sharpen: BoolProperty(name="Sharpen", default=False)
    sharpen_edge_amount: FloatProperty(name="Edge Amount", default=0.3, min=0.0, max=1.0)
    sharpen_color_amount: FloatProperty(name="Color Amount", default=1.0, min=0.0, max=1.0)

    # Depth of field
    use_dof: BoolProperty(name="Depth of Field", default=False)
    dof_blur_level: EnumProperty(
        name="Blur Level",
        items=[('LOW', "Low", ""), ('MEDIUM', "Medium", ""), ('HIGH', "High", "")],
        default='LOW')
    dof_focus_distance: FloatProperty(
        name="Focus Distance", default=2000.0, min=0.0,
        description="Focus distance in millimeters (1 scene unit = 1 meter)")
    dof_focal_length: FloatProperty(name="Focal Length", default=50.0, min=1.0, soft_max=200.0)
    dof_f_stop: FloatProperty(name="F-Stop", default=1.4, min=0.1, max=22.0)

    # Chromatic aberration
    use_chromatic_aberration: BoolProperty(name="Chromatic Aberration", default=False)
    ca_aberration_amount: FloatProperty(name="Amount", default=30.0, min=0.0, max=500.0)
    ca_radial_intensity: FloatProperty(name="Radial Intensity", default=0.0, min=0.0, max=10.0)
    ca_direction_x: FloatProperty(name="Direction X", default=0.0, min=-1.0, max=1.0)
    ca_direction_y: FloatProperty(name="Direction Y", default=0.0, min=-1.0, max=1.0)

    # Grain
    use_grain: BoolProperty(name="Grain", default=False)
    grain_intensity: FloatProperty(name="Intensity", default=30.0, min=0.0, max=100.0)
    grain_animated: BoolProperty(name="Animated", default=False)

    # Glow
    use_glow: BoolProperty(name="Glow Layer", default=False)
    glow_blur_kernel: IntProperty(name="Blur Kernel", default=16, min=1, max=128)
    glow_intensity: FloatProperty(name="Intensity", default=1.0, min=0.0, max=5.0)


def register():
    bpy.utils.register_class(BJSPostProcessingSettings)


def unregister():
    bpy.utils.unregister_class(BJSPostProcessingSettings)
