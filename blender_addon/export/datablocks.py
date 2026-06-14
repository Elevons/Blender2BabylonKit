"""Serialization of native Blender datablocks (lights, cameras). No component
is needed for these — any object of type LIGHT/CAMERA is picked up
automatically by the exporter."""


def serialize_light(obj):
    """Read the native Blender light datablock so Babylon can mirror it."""
    lamp = obj.data
    info = {
        "type": lamp.type,                       # POINT / SUN / SPOT / AREA
        "color": list(lamp.color),               # linear RGB
        "energy": lamp.energy,                    # W (point/spot/area) or W/m^2 (sun)
        "castShadows": bool(getattr(lamp, "use_shadow", False)),
    }
    if lamp.type == 'SPOT':
        info["spotSize"] = lamp.spot_size        # full cone angle, radians
        info["spotBlend"] = lamp.spot_blend
    if lamp.type in {'POINT', 'SPOT'} and getattr(lamp, "use_custom_distance", False):
        info["range"] = lamp.cutoff_distance
    if info["castShadows"]:
        sh = obj.bjs_shadow
        info["shadow"] = {
            "mapSize": sh.map_size,      # 0 = use loader default
            "bias": sh.bias,
            "normalBias": sh.normal_bias,
            "darkness": sh.darkness,
            "minZ": sh.min_z,            # 0 = auto
            "maxZ": sh.max_z,            # 0 = auto
            "filter": sh.filter,         # PCF / PCSS / POISSON / BLUR_ESM / NONE
        }
    return info


def serialize_camera(obj, is_active):
    """Read the native Blender camera datablock so Babylon can mirror it."""
    cam = obj.data
    info = {
        "type": cam.type,                # PERSP / ORTHO / PANO
        "clipStart": cam.clip_start,
        "clipEnd": cam.clip_end,
        "active": bool(is_active),       # is this the scene's active camera?
    }
    if cam.type == 'ORTHO':
        info["orthoScale"] = cam.ortho_scale
    else:
        info["fov"] = cam.angle_y        # vertical FOV in radians
    return info
