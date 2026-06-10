"""Pre-export validation. Catches authoring mistakes at export time instead of
letting them fail silently in the browser.

Pure functions over the scene — no Blender UI here. The export operator (and the
live link) call validate_scene() and surface the returned warnings.
"""

import os

import bpy

from .properties import ID_KEY


def _is_renderable(obj):
    """Mirror export.py's rule: render-disabled objects are skipped entirely."""
    return not obj.hide_render


def _check_scripts(obj, warnings):
    """SCRIPT components whose source file no longer exists on disk, or whose
    registry key is empty, will silently fail to resolve at runtime."""
    for comp in obj.bjs_components:
        if comp.comp_type != 'SCRIPT':
            continue
        if not comp.script_name:
            warnings.append(f"{obj.name}: Script component has no script name")
        if comp.script_path:
            path = bpy.path.abspath(comp.script_path)
            if not os.path.isfile(path):
                warnings.append(
                    f"{obj.name}: script file not found: {comp.script_path}")


def _check_entity_refs(obj, warnings):
    """Entity references to render-disabled or GUID-less objects resolve to
    nothing at runtime (the target won't be in the manifest)."""
    for comp in obj.bjs_components:
        refs = []
        if comp.comp_type == 'CAMERA' and comp.cam_target is not None:
            refs.append(("Camera target", comp.cam_target))
        for v in comp.exposed_vars:
            if v.vtype == 'ENTITY' and v.obj_val is not None:
                refs.append((v.name, v.obj_val))
            elif v.vtype == 'LIST' and v.elem_type == 'ENTITY':
                for item in v.list_items:
                    if item.obj_val is not None:
                        refs.append((v.name, item.obj_val))

        for label, target in refs:
            if not _is_renderable(target):
                warnings.append(
                    f"{obj.name}: '{label}' references '{target.name}', which is "
                    f"render-disabled and won't be exported")


def _check_physics(obj, warnings):
    """A MESH-shaped collider on a DYNAMIC rigid body is a Havok limitation —
    the body won't move. CONVEX is the moving-body shape."""
    collider = None
    body = None
    for comp in obj.bjs_components:
        if comp.comp_type == 'COLLIDER':
            collider = comp
        elif comp.comp_type == 'RIGIDBODY':
            body = comp

    if (collider is not None and body is not None
            and collider.collider_shape == 'MESH' and body.body_type == 'DYNAMIC'):
        warnings.append(
            f"{obj.name}: MESH collider + DYNAMIC body — Havok can't move mesh "
            f"shapes; use CONVEX")


def _check_triggers(obj, warnings):
    """Havok limitation: MESH-shaped trigger volumes never fire trigger events.
    Also catch trigger events authored on a collider that isn't a trigger, and
    audio files that don't exist on disk."""
    for comp in obj.bjs_components:
        if comp.comp_type == 'COLLIDER':
            if comp.is_trigger and comp.collider_shape == 'MESH':
                warnings.append(
                    f"{obj.name}: MESH-shaped triggers never fire events in "
                    f"Havok — use BOX/SPHERE/CAPSULE/CYLINDER/CONVEX")
            if len(comp.trigger_events) > 0 and not comp.is_trigger:
                warnings.append(
                    f"{obj.name}: collider has trigger events but 'Is Trigger' "
                    f"is off — they will never fire")
            for ev in comp.trigger_events:
                if ev.target is None:
                    warnings.append(
                        f"{obj.name}: a trigger event has no target object")
        elif comp.comp_type == 'AUDIO':
            if not comp.audio_file:
                warnings.append(f"{obj.name}: Audio component has no sound file")
            elif not os.path.isfile(bpy.path.abspath(comp.audio_file)):
                warnings.append(
                    f"{obj.name}: audio file not found: {comp.audio_file}")


def _has_physics(obj):
    """True when the object has an enabled COLLIDER or RIGIDBODY component."""
    for comp in obj.bjs_components:
        if comp.enabled and comp.comp_type in {'COLLIDER', 'RIGIDBODY'}:
            return True
    return False


def _check_constraints(obj, warnings):
    """Constraints need a physics body on BOTH ends to exist at runtime."""
    for comp in obj.bjs_components:
        if comp.comp_type != 'CONSTRAINT':
            continue
        if comp.con_target is None:
            warnings.append(f"{obj.name}: Constraint has no target object")
            continue
        if not _has_physics(obj):
            warnings.append(
                f"{obj.name}: Constraint needs a Collider/Rigid Body on this object")
        if not _has_physics(comp.con_target):
            warnings.append(
                f"{obj.name}: constraint target '{comp.con_target.name}' has no "
                f"Collider/Rigid Body")


def _is_skinned_mesh(obj):
    """True when the object's vertices are driven by an armature (glTF skin)."""
    return obj.type == 'MESH' and any(
        m.type == 'ARMATURE' and m.object is not None for m in obj.modifiers)


def _check_skinned_meshes(obj, warnings):
    """glTF skinning rule: a skinned mesh's own node transform is ignored
    (joints define the final vertex positions), and its animation clips target
    the JOINT nodes under the armature. Components on the mesh object therefore
    silently misbehave — scripts move nothing, animation lookups find nothing.
    Everything belongs on the armature object instead."""
    if not _is_skinned_mesh(obj):
        return

    if len(obj.bjs_components) > 0:
        warnings.append(
            f"{obj.name}: components on a skinned mesh won't behave (its node "
            f"transform is ignored by skinning) — attach them to the armature "
            f"object instead")

    a = getattr(obj, "bjs_animation", None)
    if a is not None and a.auto_play:
        warnings.append(
            f"{obj.name}: animation autoplay is set on the skinned mesh, but "
            f"skeletal clips target the armature's joints — set it on the "
            f"armature object instead")


def _check_lights(obj, warnings):
    """Area lights aren't part of glTF and silently vanish from the export."""
    if obj.type == 'LIGHT' and obj.data.type == 'AREA':
        warnings.append(
            f"{obj.name}: AREA lights aren't exported by glTF — use "
            f"Point/Sun/Spot")


def _check_duplicate_guids(scene, warnings):
    """Two renderable objects sharing a GUID (copy-pasted between scenes/files)
    would collide in the manifest. export.py re-IDs duplicates automatically;
    this warns so the author knows references may have moved."""
    seen = {}
    for obj in scene.objects:
        if not _is_renderable(obj):
            continue
        guid = obj.get(ID_KEY)
        if not guid:
            continue
        if guid in seen:
            warnings.append(
                f"'{seen[guid]}' and '{obj.name}' share a GUID — the duplicate "
                f"gets a fresh one on export, so references to it may need "
                f"re-picking")
        else:
            seen[guid] = obj.name


def _check_active_camera(scene, warnings):
    """No active camera means the runtime falls back to a default orbit cam."""
    cam = scene.camera
    if cam is None or not _is_renderable(cam):
        warnings.append(
            "Scene has no (renderable) active camera — the runtime will use a "
            "fallback orbit camera")


def validate_scene(context):
    """Run every check over the renderable scene. Returns a list of warning
    strings; an empty list means the export looks clean."""
    warnings = []
    scene = context.scene

    for obj in scene.objects:
        if not _is_renderable(obj):
            continue
        _check_scripts(obj, warnings)
        _check_entity_refs(obj, warnings)
        _check_physics(obj, warnings)
        _check_triggers(obj, warnings)
        _check_constraints(obj, warnings)
        _check_skinned_meshes(obj, warnings)
        _check_lights(obj, warnings)

    _check_duplicate_guids(scene, warnings)
    _check_active_camera(scene, warnings)

    return warnings
