"""Serialize the manifest postProcessing block from Blender scene settings."""

from .assets import copy_asset


def _optional_block(enabled, data):
    return data if enabled else None


def _color_curves_block(s):
    return {
        "enabled": True,
        "globalHue": s.curve_global_hue,
        "globalDensity": s.curve_global_density,
        "globalSaturation": s.curve_global_saturation,
        "globalExposure": s.curve_global_exposure,
        "highlightsHue": s.curve_highlights_hue,
        "highlightsDensity": s.curve_highlights_density,
        "highlightsSaturation": s.curve_highlights_saturation,
        "highlightsExposure": s.curve_highlights_exposure,
        "midtonesHue": s.curve_midtones_hue,
        "midtonesDensity": s.curve_midtones_density,
        "midtonesSaturation": s.curve_midtones_saturation,
        "midtonesExposure": s.curve_midtones_exposure,
        "shadowsHue": s.curve_shadows_hue,
        "shadowsDensity": s.curve_shadows_density,
        "shadowsSaturation": s.curve_shadows_saturation,
        "shadowsExposure": s.curve_shadows_exposure,
    }


def serialize_post_processing(scene_settings, output_dir):
    """Build the manifest postProcessing object, or None when disabled."""
    s = scene_settings.post
    if not s.use_pipeline:
        return None

    color_grading = None
    if s.use_color_grading and s.color_grading_file:
        lut_path = copy_asset(s.color_grading_file, output_dir, "post")
        if lut_path:
            color_grading = {"enabled": True, "file": lut_path}

    data = {
        "defaultPipeline": True,
        "fxaa": s.use_fxaa,
        "msaaSamples": s.msaa_samples,
        "bloom": {
            "enabled": s.use_bloom,
            "threshold": s.bloom_threshold,
            "intensity": s.bloom_intensity,
            "kernel": s.bloom_kernel,
            "scale": s.bloom_scale,
        },
        "ssao": s.use_ssao,
        "toneMapping": s.use_tone_mapping,
        "exposure": s.exposure if s.use_tone_mapping else 1.0,
        "contrast": s.contrast if s.use_tone_mapping else 1.0,
    }

    if s.use_tone_mapping:
        data["toneMappingType"] = s.tone_mapping_type

    if s.use_ssao:
        data["ssaoSettings"] = {
            "radius": s.ssao_radius,
            "totalStrength": s.ssao_strength,
            "samples": s.ssao_samples,
            "maxZ": s.ssao_max_z,
        }

    sharpen = _optional_block(s.use_sharpen, {
        "enabled": True,
        "edgeAmount": s.sharpen_edge_amount,
        "colorAmount": s.sharpen_color_amount,
    })
    if sharpen:
        data["sharpen"] = sharpen

    dof = _optional_block(s.use_dof, {
        "enabled": True,
        "blurLevel": s.dof_blur_level,
        "focusDistance": s.dof_focus_distance,
        "focalLength": s.dof_focal_length,
        "fStop": s.dof_f_stop,
    })
    if dof:
        data["depthOfField"] = dof

    ca = _optional_block(s.use_chromatic_aberration, {
        "enabled": True,
        "aberrationAmount": s.ca_aberration_amount,
        "radialIntensity": s.ca_radial_intensity,
        "directionX": s.ca_direction_x,
        "directionY": s.ca_direction_y,
    })
    if ca:
        data["chromaticAberration"] = ca

    grain = _optional_block(s.use_grain, {
        "enabled": True,
        "intensity": s.grain_intensity,
        "animated": s.grain_animated,
    })
    if grain:
        data["grain"] = grain

    glow = _optional_block(s.use_glow, {
        "enabled": True,
        "blurKernelSize": s.glow_blur_kernel,
        "intensity": s.glow_intensity,
    })
    if glow:
        data["glow"] = glow

    vignette = _optional_block(s.use_vignette, {
        "enabled": True,
        "weight": s.vignette_weight,
        "stretch": s.vignette_stretch,
        "centerX": s.vignette_center_x,
        "centerY": s.vignette_center_y,
    })
    if vignette:
        data["vignette"] = vignette

    if color_grading:
        data["colorGrading"] = color_grading

    if s.use_color_curves:
        data["colorCurves"] = _color_curves_block(s)

    return data
