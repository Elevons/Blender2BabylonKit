"""Serialize the manifest atmosphere block from Blender scene settings."""

from ..core.ids import ID_KEY


def _round3(c):
    return [round(c[0], 6), round(c[1], 6), round(c[2], 6)]


def serialize_atmosphere(context):
    """Build the manifest atmosphere object, or None when disabled."""
    atmosphere = context.scene.bjs_scene.atmosphere
    if not atmosphere.use_atmosphere:
        return None

    data = {
        "pbrSunIntensity": atmosphere.pbr_sun_intensity,
        "useLuts": atmosphere.use_luts,
        "multiScatteringIntensity": round(atmosphere.multi_scattering_intensity, 4),
        "minimumMultiScatteringIntensity": round(atmosphere.minimum_multi_scattering_intensity, 4),
        "groundAlbedo": _round3(atmosphere.ground_albedo),
        "physical": {
            "peakRayleighScattering": _round3(atmosphere.peak_rayleigh_scattering),
            "mieScatteringScale": round(atmosphere.mie_scattering_scale, 4),
            "ozoneAbsorptionScale": round(atmosphere.ozone_absorption_scale, 4),
            "originHeight": round(atmosphere.origin_height, 4),
        },
    }

    if atmosphere.sun_light is not None:
        sun_id = atmosphere.sun_light.get(ID_KEY, "")
        if len(sun_id) > 0:
            data["sunLightId"] = sun_id

    return data
