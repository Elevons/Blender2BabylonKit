"""Per-component manifest serializers, registered by component type.

Adding a component kind touches three registries, one per layer:
  1. SERIALIZERS here (BJSComponent -> manifest dict),
  2. BODY_DRAWERS in ui/component_bodies.py (inspector body),
  3. COMPONENT_HANDLERS in packages/engine/src/core/loader/componentRegistry.ts
     (runtime apply).
`node scripts/check-component-types.mjs` verifies the three stay in sync with
the COMPONENT_TYPES enum in components/constants.py.

Every serializer has the same shape: (comp, out, output_dir) -> None, mutating
`out` (which already carries {"type": comp.comp_type}).
"""

import mathutils

from ..core.ids import ensure_object_id
from ..components.constants import (
    ENUM_SEP, LIST_ELEM_SLOT, GUI3D_CONTROLS, GUI3D_PANELS, GUI3D_TEXTURED,
    REFLECTION_PROBE_REFRESH_TO_BABYLON, LAYER_MASK_PRESET_VALUES,
)
from ..components.component import ensure_custom_constraint_axes
from .assets import copy_asset
from .particles import export_particle_system


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
        elif v.vtype == 'VECTOR2':
            out[v.name] = list(v.v2_val)
        elif v.vtype == 'VECTOR3':
            out[v.name] = list(v.v_val)
        elif v.vtype == 'COLOR':
            out[v.name] = list(v.c_val)
        elif v.vtype == 'LIST':
            out[v.name] = _serialize_list(v)
        elif v.vtype == 'ENTITY':
            out[v.name] = ensure_object_id(v.obj_val) if v.obj_val else None
    return out


def _serialize_tag(comp, out, output_dir):
    out["tag"] = comp.tag


def _serialize_rendering_group(comp, out, output_dir):
    out["renderingGroupId"] = int(comp.rendering_group_id)
    out["applyOwnedMeshes"] = bool(comp.render_layer_apply_owned)
    out["applyChildEntities"] = bool(comp.render_layer_apply_children)


def _serialize_layer_mask(comp, out, output_dir):
    if comp.layer_mask_preset == 'CUSTOM':
        mask = int(comp.layer_mask_custom)
    else:
        mask = LAYER_MASK_PRESET_VALUES[comp.layer_mask_preset]
    out["layerMask"] = mask
    out["applyOwnedMeshes"] = bool(comp.render_layer_apply_owned)
    out["applyChildEntities"] = bool(comp.render_layer_apply_children)


def _serialize_collision_layer(comp, out, output_dir):
    out["layer"] = comp.collision_layer
    out["applyOwnedColliders"] = bool(comp.collision_layer_apply_owned)
    out["applyChildEntities"] = bool(comp.collision_layer_apply_children)


def _serialize_collider(comp, out, output_dir):
    # Authored in Blender axes (Z-up); convert offset + size + rotation to
    # Babylon Y-up so the runtime body matches the viewport preview.
    cx, cy, cz = comp.collider_center
    sx, sy, sz = comp.collider_size
    q = mathutils.Euler(comp.collider_rotation, 'XYZ').to_quaternion()
    out.update({
        "shape": comp.collider_shape,
        "isTrigger": bool(comp.is_trigger),
        "makeInvisible": bool(comp.collider_make_invisible),
        "autoFit": bool(comp.auto_fit),
        "applyObjectScale": bool(comp.collider_apply_scale),
        "size": [sx, sz, sy],        # extents: y<->z axes swap
        "radius": comp.collider_radius,
        "height": comp.collider_height,
        "center": [cx, cz, -cy],     # offset: (x, y, z) -> (x, z, -y)
        "rotation": [q.x, q.z, -q.y, q.w],  # quaternion xyzw, axis Z-up -> Y-up
    })
    if len(comp.event_messages) > 0:
        out["eventMessages"] = [{
            "when": ev.when,
            "target": ensure_object_id(ev.target) if ev.target else None,
            "message": ev.message,
            "filterTag": ev.filter_tag,
        } for ev in comp.event_messages]


def _serialize_rigidbody(comp, out, output_dir):
    out.update({
        "bodyType": comp.body_type,
        "mass": comp.mass,
        "friction": comp.friction,
        "restitution": comp.restitution,
        "linearDamping": comp.linear_damping,
        "angularDamping": comp.angular_damping,
        "startAsleep": comp.start_asleep,
    })
    if comp.body_type == 'DYNAMIC':
        out["centerOfMassAutoFit"] = bool(comp.cog_auto_fit)
        if not comp.cog_auto_fit:
            cx, cy, cz = comp.cog_center
            out["centerOfMass"] = [cx, cz, -cy]  # Blender Z-up -> Babylon Y-up


def _serialize_script(comp, out, output_dir):
    out["script"] = comp.script_name
    out["path"] = comp.script_path
    out["vars"] = _serialize_vars(comp)


def _serialize_camera(comp, out, output_dir):
    out.update({
        "cameraType": comp.cam_type,
        "attachControl": bool(comp.cam_attach_control),
        "keys": {
            "scheme": comp.cam_key_scheme,
            "up": comp.cam_key_up, "down": comp.cam_key_down,
            "left": comp.cam_key_left, "right": comp.cam_key_right,
        },
        "useBlenderTransform": bool(comp.cam_use_blender_transform),
        "followMode": comp.cam_follow_mode,
        "lockRoll": bool(comp.cam_lock_roll),
        "speed": comp.cam_speed,
        "inertia": comp.cam_inertia,
        "radius": comp.cam_radius,
        "lowerRadius": comp.cam_lower_radius,
        "upperRadius": comp.cam_upper_radius,
        "target": ensure_object_id(comp.cam_target) if comp.cam_target else None,
        "trackTarget": bool(comp.cam_track_target),
        "orbitSpeed": comp.cam_orbit_speed,
        "zoomSpeed": comp.cam_zoom_speed,
        "panSpeed": comp.cam_pan_speed,
        "distance": comp.cam_distance,
        "height": comp.cam_height,
        "rotationOffset": comp.cam_rotation_offset,
    })
    if comp.cam_type == 'GEOSPATIAL':
        out["planetRadius"] = comp.cam_planet_radius
        out["checkCollisions"] = bool(comp.cam_check_collisions)


def _serialize_constraint(comp, out, output_dir):
    px, py, pz = comp.con_pivot
    out.update({
        "constraintType": comp.con_type,
        "target": ensure_object_id(comp.con_target) if comp.con_target else None,
        "applyObjectScale": bool(comp.con_apply_scale),
        "pivot": [px, pz, -py],  # owner-local, converted to Babylon Y-up
        "axis": _CONSTRAINT_AXIS_TO_BABYLON[comp.con_axis],
        "collision": bool(comp.con_collision),
        "useLimits": bool(comp.con_use_limits),
        "min": comp.con_min,   # degrees (hinge) / meters (slider, spring)
        "max": comp.con_max,
        "stiffness": comp.con_stiffness,
        "damping": comp.con_damping,
        "motor": bool(comp.con_motor),
        "motorSpeed": comp.con_motor_speed,   # deg/s (hinge) / m/s (slider)
        "motorMaxForce": comp.con_motor_force,
    })
    if comp.con_type == 'CUSTOM':
        ensure_custom_constraint_axes(comp)
        out["axes"] = [{
            "axis": ax.dof_axis,
            "mode": ax.mode.lower(),
            "min": ax.min_limit,
            "max": ax.max_limit,
            "stiffness": ax.stiffness,
            "damping": ax.damping,
        } for ax in comp.con_custom_axes]


def _serialize_audio(comp, out, output_dir):
    out.update({
        "file": copy_asset(comp.audio_file, output_dir, "audio"),
        "volume": comp.audio_volume,
        "loop": bool(comp.audio_loop),
        "autoPlay": bool(comp.audio_autoplay),
        "spatial": bool(comp.audio_spatial),
        "maxDistance": comp.audio_max_distance,
        "playbackRate": comp.audio_rate,
    })


def _serialize_gui(comp, out, output_dir):
    out.update({
        "file": copy_asset(comp.gui_file, output_dir, "gui"),
        "mode": comp.gui_mode,
        "foreground": bool(comp.gui_foreground),
        "width": comp.gui_width,
        "height": comp.gui_height,
    })


def _serialize_particle(comp, out, output_dir):
    out.update({
        "file": export_particle_system(
            comp.particle_file, comp.particle_textures, output_dir),
        "gpu": bool(comp.particle_gpu),
        "autoStart": bool(comp.particle_autostart),
        "attachToEntity": bool(comp.particle_attach),
        "capacity": comp.particle_capacity,
    })


def _serialize_msdf_text(comp, out, output_dir):
    out.update({
        "text": comp.msdf_text,
        "fontJson": copy_asset(comp.msdf_font_json, output_dir, "fonts"),
        "fontTexture": copy_asset(comp.msdf_font_texture, output_dir, "fonts"),
        "color": list(comp.msdf_color),
        "thickness": comp.msdf_thickness,
        "billboard": bool(comp.msdf_billboard),
        "billboardScreenProjected": bool(comp.msdf_billboard_screen),
        "ignoreDepth": bool(comp.msdf_ignore_depth),
        "strokeColor": list(comp.msdf_stroke_color),
        "strokeInset": comp.msdf_stroke_inset,
        "strokeOutset": comp.msdf_stroke_outset,
        "textAlign": comp.msdf_text_align,
        "maxWidth": comp.msdf_max_width,
        "lineHeight": comp.msdf_line_height,
        "letterSpacing": comp.msdf_letter_spacing,
    })


def _serialize_lod(comp, out, output_dir):
    # Accumulate relative distances into absolute values for the runtime.
    absolute_distance = 0.0
    levels = []
    for level in comp.lod_levels:
        absolute_distance += level.distance
        level_data = {
            "distance": absolute_distance,
            "autoLod": bool(level.auto_lod),
        }
        if level.auto_lod:
            level_data["quality"] = level.quality
            level_data["optimizeMesh"] = bool(level.optimize_mesh)
        else:
            level_data["target"] = ensure_object_id(level.target) if level.target else None
        levels.append(level_data)
    out["levels"] = levels


def _serialize_reflection_probe(comp, out, output_dir):
    ox, oy, oz = comp.probe_influence_offset
    sx, sy, sz = comp.probe_influence_size
    if comp.probe_refresh_rate == 'CUSTOM':
        refresh_rate = comp.probe_refresh_custom
    else:
        refresh_rate = REFLECTION_PROBE_REFRESH_TO_BABYLON[comp.probe_refresh_rate]
    out.update({
        "cubeSize": int(comp.probe_cube_size),
        "refreshRate": refresh_rate,
        "generateMipMaps": bool(comp.probe_generate_mipmaps),
        "renderAll": bool(comp.probe_render_all),
        "renderList": [
            ensure_object_id(entry.obj_ref)
            for entry in comp.probe_render_list if entry.obj_ref is not None
        ],
        "renderExcludes": [
            ensure_object_id(entry.obj_ref)
            for entry in comp.probe_render_excludes if entry.obj_ref is not None
        ],
        "influenceShape": comp.probe_influence_shape,
        "influenceSize": [sx, sz, sy],
        "influenceOffset": [ox, oz, -oy],
        "priority": comp.probe_priority,
        "realTimeFiltering": bool(comp.probe_realtime_filtering),
        "realTimeFilteringQuality": comp.probe_filter_quality,
    })


def _serialize_gui3d_control(comp, out, output_dir):
    out["events"] = [{
        "target": ensure_object_id(ev.target) if ev.target else None,
        "message": ev.message,
    } for ev in comp.gui3d_events]
    if comp.comp_type in GUI3D_TEXTURED:
        out["text"] = comp.gui3d_text
        out["image"] = (copy_asset(comp.gui3d_image, output_dir, "gui")
                        if comp.gui3d_image else None)
    if comp.comp_type == 'GUI3D_BUTTON':
        out["contentResolution"] = comp.gui3d_content_resolution
    if comp.comp_type in {'GUI3D_HOLO', 'GUI3D_TOUCH_HOLO'}:
        out["tooltip"] = comp.gui3d_tooltip


def _serialize_gui3d_panel(comp, out, output_dir):
    out["margin"] = comp.gui3d_margin
    if comp.comp_type == 'GUI3D_STACK':
        out["vertical"] = bool(comp.gui3d_vertical)
    else:
        out["columns"] = comp.gui3d_columns
        out["rows"] = comp.gui3d_rows
    if comp.comp_type in {'GUI3D_SPHERE', 'GUI3D_CYLINDER'}:
        out["radius"] = comp.gui3d_radius
    if comp.comp_type == 'GUI3D_SCATTER':
        out["iterations"] = comp.gui3d_iterations


# The export registry: component type -> serializer. The GUI3D families share
# one serializer per family (control vs panel), registered for every member.
SERIALIZERS = {
    'TAG': _serialize_tag,
    'RENDERING_GROUP': _serialize_rendering_group,
    'LAYER_MASK': _serialize_layer_mask,
    'COLLISION_LAYER': _serialize_collision_layer,
    'COLLIDER': _serialize_collider,
    'RIGIDBODY': _serialize_rigidbody,
    'SCRIPT': _serialize_script,
    'CAMERA': _serialize_camera,
    'CONSTRAINT': _serialize_constraint,
    'AUDIO': _serialize_audio,
    'GUI': _serialize_gui,
    'PARTICLE': _serialize_particle,
    'MSDF_TEXT': _serialize_msdf_text,
    'REFLECTION_PROBE': _serialize_reflection_probe,
    'LOD': _serialize_lod,
    **{comp_type: _serialize_gui3d_control for comp_type in GUI3D_CONTROLS},
    **{comp_type: _serialize_gui3d_panel for comp_type in GUI3D_PANELS},
}
