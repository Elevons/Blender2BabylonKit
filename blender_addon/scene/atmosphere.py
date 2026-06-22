"""Physically based sky / aerial perspective (Babylon Atmosphere addon)."""

import bpy
from bpy.props import BoolProperty, FloatProperty, FloatVectorProperty, PointerProperty
from bpy.types import PropertyGroup, Object

from ..core.ids import ensure_object_id


def _on_sun_light_update(self, context):
    """Sun lamp target: assign a GUID so the runtime can resolve it."""
    if self.sun_light is not None:
        ensure_object_id(self.sun_light)


class BJSAtmosphereSettings(PropertyGroup):
    use_atmosphere: BoolProperty(
        name="Atmosphere", default=False,
        description="Physically based sky and aerial perspective (replaces the "
                    "environment skybox at runtime)")

    sun_light: PointerProperty(
        name="Sun Light", type=Object,
        description="The Blender SUN lamp that drives the atmosphere. "
                    "Leave empty to use the first exported SUN lamp",
        update=_on_sun_light_update,
        poll=lambda self, obj: obj.type == 'LIGHT' and obj.data.type == 'SUN')

    pbr_sun_intensity: BoolProperty(
        name="PBR Sun Intensity", default=True,
        description="Set the sun's intensity to π at runtime so PBR materials "
                    "receive correct brightness")

    use_luts: BoolProperty(
        name="Use LUTs", default=True,
        description="Lookup tables for sky and aerial perspective (faster). "
                    "Disable for full ray marching (slower, higher quality)")

    multi_scattering_intensity: FloatProperty(
        name="Multi Scattering", default=1.0, min=0.0, soft_max=10.0,
        description="Overall multiple-scattering contribution")
    minimum_multi_scattering_intensity: FloatProperty(
        name="Night Ambient", default=0.1, min=0.0, soft_max=1.0,
        description="Minimum multi-scattering when the sun is below the horizon")
    ground_albedo: FloatVectorProperty(
        name="Ground Albedo", subtype='COLOR', size=3,
        default=(1.0, 1.0, 1.0), min=0.0, max=1.0,
        description="Average color of light reflected off the ground")

    # Rayleigh / Mie / ozone (Earth-like defaults match the Babylon addon).
    peak_rayleigh_scattering: FloatVectorProperty(
        name="Peak Rayleigh", size=3,
        default=(5.802e-6, 13.558e-6, 33.1e-6), min=0.0,
        description="Rayleigh scattering per km at sea level (R, G, B)")
    mie_scattering_scale: FloatProperty(
        name="Mie Scattering Scale", default=1.0, min=0.0, soft_max=200.0)
    ozone_absorption_scale: FloatProperty(
        name="Ozone Absorption Scale", default=1.0, min=0.0, soft_max=20.0)

    origin_height: FloatProperty(
        name="Origin Height (km)", default=0.0, min=0.0,
        description="Height of the scene origin above the planet surface")


def register():
    bpy.utils.register_class(BJSAtmosphereSettings)


def unregister():
    bpy.utils.unregister_class(BJSAtmosphereSettings)
