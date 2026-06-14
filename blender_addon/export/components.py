"""Per-component serialization: BJSComponent -> manifest dicts, plus the
entity-reference walker shared with validation and GUID assignment."""

import mathutils

from ..core.ids import ensure_object_id
from ..components.constants import (
    ENUM_SEP, LIST_ELEM_SLOT, GUI3D_CONTROLS, GUI3D_PANELS, GUI3D_TEXTURED,
)
from ..components.component import ensure_custom_constraint_axes
from .assets import copy_asset


# Blender local axis -> Babylon Y-up unit vector, via (x, y, z) -> (x, z, -y).
_CONSTRAINT_AXIS_TO_BABYLON = {
    'X': [1.0, 0.0, 0.0],
    'Y': [0.0, 0.0, -1.0],
    'Z': [0.0, 1.0, 0.0],
}


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
            choices = [o for o in v.enum_options.split(ENUM_SEP) if o != ""]
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


def iter_referenced_objects(comp):
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
    if comp.comp_type in GUI3D_CONTROLS:
        for ev in comp.gui3d_events:
            if ev.target is not None:
                yield ev.target
    for v in comp.exposed_vars:
        if v.vtype == 'ENTITY' and v.obj_val is not None:
            yield v.obj_val
        elif v.vtype == 'LIST' and v.elem_type == 'ENTITY':
            for item in v.list_items:
                if item.obj_val is not None:
                    yield item.obj_val


def serialize_components(obj, output_dir):
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
            if c.con_type == 'CUSTOM':
                ensure_custom_constraint_axes(c)
                d["axes"] = [{
                    "axis": ax.dof_axis,
                    "mode": ax.mode.lower(),
                    "min": ax.min_limit,
                    "max": ax.max_limit,
                    "stiffness": ax.stiffness,
                    "damping": ax.damping,
                } for ax in c.con_custom_axes]

        elif c.comp_type == 'AUDIO':
            d.update({
                "file": copy_asset(c.audio_file, output_dir, "audio"),
                "volume": c.audio_volume,
                "loop": bool(c.audio_loop),
                "autoPlay": bool(c.audio_autoplay),
                "spatial": bool(c.audio_spatial),
                "maxDistance": c.audio_max_distance,
                "playbackRate": c.audio_rate,
            })

        elif c.comp_type == 'GUI':
            d.update({
                "file": copy_asset(c.gui_file, output_dir, "gui"),
                "mode": c.gui_mode,
                "foreground": bool(c.gui_foreground),
                "width": c.gui_width,
                "height": c.gui_height,
            })

        elif c.comp_type == 'PARTICLE':
            d.update({
                "file": copy_asset(c.particle_file, output_dir, "particles"),
                "gpu": bool(c.particle_gpu),
                "autoStart": bool(c.particle_autostart),
                "attachToEntity": bool(c.particle_attach),
                "capacity": c.particle_capacity,
            })

        elif c.comp_type in GUI3D_CONTROLS:
            d["events"] = [{
                "target": ensure_object_id(ev.target) if ev.target else None,
                "message": ev.message,
            } for ev in c.gui3d_events]
            if c.comp_type in GUI3D_TEXTURED:
                d["text"] = c.gui3d_text
                d["image"] = (copy_asset(c.gui3d_image, output_dir, "gui")
                              if c.gui3d_image else None)
            if c.comp_type == 'GUI3D_BUTTON':
                d["contentResolution"] = c.gui3d_content_resolution
            if c.comp_type in {'GUI3D_HOLO', 'GUI3D_TOUCH_HOLO'}:
                d["tooltip"] = c.gui3d_tooltip

        elif c.comp_type in GUI3D_PANELS:
            d["margin"] = c.gui3d_margin
            if c.comp_type == 'GUI3D_STACK':
                d["vertical"] = bool(c.gui3d_vertical)
            else:
                d["columns"] = c.gui3d_columns
                d["rows"] = c.gui3d_rows
            if c.comp_type in {'GUI3D_SPHERE', 'GUI3D_CYLINDER'}:
                d["radius"] = c.gui3d_radius
            if c.comp_type == 'GUI3D_SCATTER':
                d["iterations"] = c.gui3d_iterations

        comps.append(d)
    return comps
