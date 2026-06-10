"""Exporter: writes a .glb (geometry, lights, cameras) plus a sidecar
`<name>.scene.json` manifest carrying the ECS component data.

The runtime loads the glb, then matches each manifest entity to a glTF node
by name and attaches the components. Geometry/transform/parenting all ride
along inside the glb, so the manifest only stores what glTF can't express.
"""

import json
import os
import shutil
import bpy
import mathutils

from .properties import ID_KEY, ensure_object_id, LIST_ELEM_SLOT, _ENUM_SEP
from .scene_export import serialize_scene
from .anim_export import serialize_animation, nla_clip_names


SCHEMA_VERSION = 4


def _serialize_list(v):
    slot = LIST_ELEM_SLOT.get(v.elem_type, "f_val")
    out = []
    for item in v.list_items:
        val = getattr(item, slot)
        if slot == "obj_val":
            out.append(ensure_object_id(val) if val else None)
        elif slot in ("v_val", "c_val"):
            out.append(list(val))
        elif slot == "f_val":
            out.append(float(val))
        elif slot == "b_val":
            out.append(bool(val))
        else:  # s_val
            out.append(val)
    return out


def _serialize_vars(comp):
    out = {}
    for v in comp.exposed_vars:
        if v.vtype == 'FLOAT':
            out[v.name] = v.f_val
        elif v.vtype == 'BOOL':
            out[v.name] = bool(v.b_val)
        elif v.vtype == 'STRING':
            out[v.name] = v.s_val
        elif v.vtype == 'ENUM':
            # s_val holds the selected choice; clamp to a valid option if needed.
            choices = [o for o in v.enum_options.split(_ENUM_SEP) if o != ""]
            out[v.name] = v.s_val if (v.s_val in choices or not choices) else choices[0]
        elif v.vtype == 'VECTOR3':
            out[v.name] = list(v.v_val)
        elif v.vtype == 'COLOR':
            out[v.name] = list(v.c_val)
        elif v.vtype == 'LIST':
            out[v.name] = _serialize_list(v)
        elif v.vtype == 'ENTITY':
            out[v.name] = ensure_object_id(v.obj_val) if v.obj_val else None
    return out


def _iter_referenced_objects(comp):
    """Yield Blender objects referenced by a component's exposed vars — both
    scalar entity refs and entity-list items — plus a follow-camera target."""
    if comp.comp_type == 'CAMERA' and comp.cam_target is not None:
        yield comp.cam_target
    if comp.comp_type == 'COLLIDER':
        for ev in comp.trigger_events:
            if ev.target is not None:
                yield ev.target
    if comp.comp_type == 'CONSTRAINT' and comp.con_target is not None:
        yield comp.con_target
    for v in comp.exposed_vars:
        if v.vtype == 'ENTITY' and v.obj_val is not None:
            yield v.obj_val
        elif v.vtype == 'LIST' and v.elem_type == 'ENTITY':
            for item in v.list_items:
                if item.obj_val is not None:
                    yield item.obj_val


def _referenced_ids(context):
    """GUIDs of objects referenced by any ENTITY exposed var (scalar or list)."""
    ids = set()
    for obj in context.scene.objects:
        for comp in obj.bjs_components:
            for ref in _iter_referenced_objects(comp):
                rid = ref.get(ID_KEY)
                if rid:
                    ids.add(rid)
    return ids


# Blender local axis -> Babylon Y-up unit vector, via (x, y, z) -> (x, z, -y).
_CONSTRAINT_AXIS_TO_BABYLON = {
    'X': [1.0, 0.0, 0.0],
    'Y': [0.0, 0.0, -1.0],
    'Z': [0.0, 1.0, 0.0],
}


def _copy_audio_file(filepath, output_dir):
    """Copy the authored sound file into <output_dir>/audio/ (like env textures)
    and return its manifest-relative path, or None if the source is missing."""
    src = bpy.path.abspath(filepath)
    if not os.path.isfile(src):
        return None
    audio_dir = os.path.join(output_dir, "audio")
    os.makedirs(audio_dir, exist_ok=True)
    filename = os.path.basename(src)
    dest = os.path.join(audio_dir, filename)
    if os.path.abspath(src) != os.path.abspath(dest):
        shutil.copy2(src, dest)
    return "audio/" + filename


def _serialize_components(obj, output_dir):
    comps = []
    for c in obj.bjs_components:
        if not c.enabled:
            continue
        d = {"type": c.comp_type}

        if c.comp_type == 'TAG':
            d["tag"] = c.tag

        elif c.comp_type == 'COLLIDER':
            # Authored in Blender axes (Z-up); convert offset + size + rotation to
            # Babylon Y-up so the runtime body matches the viewport preview.
            cx, cy, cz = c.collider_center
            sx, sy, sz = c.collider_size
            q = mathutils.Euler(c.collider_rotation, 'XYZ').to_quaternion()
            d.update({
                "shape": c.collider_shape,
                "isTrigger": bool(c.is_trigger),
                "autoFit": bool(c.auto_fit),
                "size": [sx, sz, sy],        # extents: y<->z axes swap
                "radius": c.collider_radius,
                "height": c.collider_height,
                "center": [cx, cz, -cy],     # offset: (x, y, z) -> (x, z, -y)
                "rotation": [q.x, q.z, -q.y, q.w],  # quaternion xyzw, axis Z-up -> Y-up
            })
            if c.is_trigger and len(c.trigger_events) > 0:
                d["events"] = [{
                    "target": ensure_object_id(ev.target) if ev.target else None,
                    "message": ev.message,
                    "filterTag": ev.filter_tag,
                } for ev in c.trigger_events]

        elif c.comp_type == 'RIGIDBODY':
            d.update({
                "bodyType": c.body_type,
                "mass": c.mass,
                "friction": c.friction,
                "restitution": c.restitution,
                "linearDamping": c.linear_damping,
                "angularDamping": c.angular_damping,
            })

        elif c.comp_type == 'SCRIPT':
            d["script"] = c.script_name
            d["path"] = c.script_path
            d["vars"] = _serialize_vars(c)

        elif c.comp_type == 'CAMERA':
            d.update({
                "cameraType": c.cam_type,
                "attachControl": bool(c.cam_attach_control),
                "keys": {
                    "scheme": c.cam_key_scheme,
                    "up": c.cam_key_up, "down": c.cam_key_down,
                    "left": c.cam_key_left, "right": c.cam_key_right,
                },
                "useBlenderTransform": bool(c.cam_use_blender_transform),
                "followMode": c.cam_follow_mode,
                "speed": c.cam_speed,
                "inertia": c.cam_inertia,
                "radius": c.cam_radius,
                "lowerRadius": c.cam_lower_radius,
                "upperRadius": c.cam_upper_radius,
                "target": ensure_object_id(c.cam_target) if c.cam_target else None,
                "distance": c.cam_distance,
                "height": c.cam_height,
                "rotationOffset": c.cam_rotation_offset,
            })

        elif c.comp_type == 'CONSTRAINT':
            px, py, pz = c.con_pivot
            d.update({
                "constraintType": c.con_type,
                "target": ensure_object_id(c.con_target) if c.con_target else None,
                "pivot": [px, pz, -py],  # owner-local, converted to Babylon Y-up
                "axis": _CONSTRAINT_AXIS_TO_BABYLON[c.con_axis],
                "collision": bool(c.con_collision),
                "useLimits": bool(c.con_use_limits),
                "min": c.con_min,   # degrees (hinge) / meters (slider, spring)
                "max": c.con_max,
                "stiffness": c.con_stiffness,
                "damping": c.con_damping,
                "motor": bool(c.con_motor),
                "motorSpeed": c.con_motor_speed,   # deg/s (hinge) / m/s (slider)
                "motorMaxForce": c.con_motor_force,
            })

        elif c.comp_type == 'AUDIO':
            d.update({
                "file": _copy_audio_file(c.audio_file, output_dir),
                "volume": c.audio_volume,
                "loop": bool(c.audio_loop),
                "autoPlay": bool(c.audio_autoplay),
                "spatial": bool(c.audio_spatial),
                "maxDistance": c.audio_max_distance,
                "playbackRate": c.audio_rate,
            })

        comps.append(d)
    return comps


def _serialize_light(obj):
    """Read the native Blender light datablock so Babylon can mirror it.
    No component is added; any object of type LIGHT is picked up automatically."""
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


def _serialize_camera(obj, is_active):
    """Read the native Blender camera datablock so Babylon can mirror it.
    Like lights, any object of type CAMERA is picked up automatically."""
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


def _is_renderable(obj):
    """Objects disabled in renders (the camera icon / `hide_render`) are excluded
    from the level entirely — no glb geometry and no manifest entry."""
    return not obj.hide_render


def _dedupe_entity_ids(context):
    """Blender object duplication copies custom properties — including our GUID —
    so a duplicated object shares the original's id. Give each later duplicate a
    fresh id so it becomes a distinct entity. Runs before ids/refs are resolved."""
    seen = {}
    for obj in context.scene.objects:
        oid = obj.get(ID_KEY)
        if not oid:
            continue
        owner = seen.get(oid)
        if owner is not None and owner is not obj:
            del obj[ID_KEY]
            ensure_object_id(obj)      # assign a fresh, unique id
        else:
            seen[oid] = obj


def _ensure_entity_ids(context):
    """Assign GUIDs to every object that will become an entity BEFORE the glb is
    written, so the id lands in the glTF node extras. Lights never go through
    'Add Component', and referenced objects may have no components at all, so
    this is where they get their id."""
    for obj in context.scene.objects:
        if not _is_renderable(obj):
            continue
        if (len(obj.bjs_components) > 0 or obj.type in {'LIGHT', 'CAMERA'}
                or nla_clip_names(obj)):
            ensure_object_id(obj)
        for comp in obj.bjs_components:
            for ref in _iter_referenced_objects(comp):
                if _is_renderable(ref):
                    ensure_object_id(ref)


def _build_manifest(context, glb_filename, output_dir):
    referenced = _referenced_ids(context)
    entities = []
    for obj in context.scene.objects:
        if not _is_renderable(obj):
            continue  # disabled in renders → not part of the level
        comps = _serialize_components(obj, output_dir)
        light = _serialize_light(obj) if obj.type == 'LIGHT' else None
        camera = _serialize_camera(obj, obj == context.scene.camera) if obj.type == 'CAMERA' else None
        animation = serialize_animation(obj)
        is_referenced = obj.get(ID_KEY) in referenced
        has_id = bool(obj.get(ID_KEY))
        # A GUID is an explicit "make this addressable" marker (e.g. Assign GUID
        # on a bare empty), so include it even with nothing else on it.
        if (not comps and not light and not camera and not animation
                and not is_referenced and not has_id):
            continue  # pure geometry needs no manifest entry; it lives in the glb
        obj_id = ensure_object_id(obj)  # guarantee a GUID exists
        parent = obj.parent
        parent_id = parent.get(ID_KEY) if parent else None
        entity = {
            "id": obj_id,
            "name": obj.name,            # kept for debugging / name-match fallback
            "parent": parent_id,         # parent GUID if the parent has one, else null
            "components": comps,
        }
        if light:
            entity["light"] = light      # auto-derived from the Blender lamp, not a component
        if camera:
            entity["camera"] = camera    # auto-derived from the Blender camera
        if animation:
            entity["animation"] = animation  # NLA clips + autoplay
        entities.append(entity)
    return {
        "version": SCHEMA_VERSION,
        "glb": glb_filename,
        "scene": serialize_scene(context, output_dir),
        "entities": entities,
    }


def _export_glb(glb_path):
    """Call Blender's built-in glTF exporter, tolerating version differences
    in the available keyword arguments."""
    base_kwargs = dict(
        filepath=glb_path,
        export_format='GLB',
        use_selection=False,
        use_renderable=True,  # skip objects disabled in renders (matches manifest)
        export_apply=True,    # apply modifiers
        export_yup=True,      # Babylon is Y-up
        export_extras=True,   # REQUIRED: writes obj["bjs_id"] into node extras
    )
    # Optional kwargs that exist on most but not all Blender versions.
    optional = dict(export_cameras=True, export_lights=True,
                    export_animations=True, export_nla_strips=True)
    try:
        bpy.ops.export_scene.gltf(**base_kwargs, **optional)
    except TypeError:
        bpy.ops.export_scene.gltf(**base_kwargs)


def export_level(context, filepath):
    if not filepath.lower().endswith(".glb"):
        filepath += ".glb"

    glb_path = bpy.path.abspath(filepath)
    glb_filename = os.path.basename(glb_path)
    json_path = os.path.splitext(glb_path)[0] + ".scene.json"

    _dedupe_entity_ids(context)   # duplicated objects get fresh GUIDs
    _ensure_entity_ids(context)   # assign GUIDs BEFORE the glb is written
    _export_glb(glb_path)

    manifest = _build_manifest(context, glb_filename, os.path.dirname(glb_path))
    manifest["debug"] = bool(getattr(context.scene, "bjs_debug_build", True))
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    return glb_path, json_path, len(manifest["entities"])
