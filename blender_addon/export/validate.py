"""Pre-export validation. Catches authoring mistakes at export time instead of
letting them fail silently in the browser.

Pure functions over the scene — no Blender UI here. The export operator (and
the live link) call validate_scene() and surface the returned warnings.
"""

import os

import bpy

from ..core.ids import ID_KEY
from ..components.constants import GUI3D_CONTROLS, GUI3D_PANELS, GUI3D_TEXTURED
from .visibility import is_renderable


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


def _check_entity_refs(obj, context, warnings):
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
            if not is_renderable(target, context):
                warnings.append(
                    f"{obj.name}: '{label}' references '{target.name}', which is "
                    f"render-disabled and won't be exported")


def _check_physics(obj, warnings):
    """A MESH-shaped collider on a DYNAMIC rigid body is a Havok limitation —
    the body won't move. CONVEX is the moving-body shape. Multiple colliders on
    one entity are combined into a compound shape at runtime."""
    colliders = []
    body = None
    for comp in obj.bjs_components:
        if not comp.enabled:
            continue
        if comp.comp_type == 'COLLIDER':
            colliders.append(comp)
        elif comp.comp_type == 'RIGIDBODY':
            body = comp

    for collider in colliders:
        if (body is not None and collider.collider_shape == 'MESH'
                and body.body_type == 'DYNAMIC'):
            warnings.append(
                f"{obj.name}: MESH collider + DYNAMIC body — Havok can't move mesh "
                f"shapes; use CONVEX")

    if len(colliders) > 1:
        triggers = [c.is_trigger for c in colliders]
        if any(triggers) and not all(triggers):
            warnings.append(
                f"{obj.name}: mixed trigger/non-trigger colliders on one entity — "
                f"each shape keeps its own trigger flag in the compound body")


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


def _check_media(obj, warnings):
    """GUI / particle JSON files that don't exist on disk won't load at runtime;
    on-mesh GUIs also need a mesh object to project onto."""
    for comp in obj.bjs_components:
        if comp.comp_type == 'GUI':
            if not comp.gui_file:
                warnings.append(f"{obj.name}: GUI component has no JSON file")
            elif not os.path.isfile(bpy.path.abspath(comp.gui_file)):
                warnings.append(f"{obj.name}: GUI file not found: {comp.gui_file}")
            if comp.gui_mode == 'MESH' and obj.type != 'MESH':
                warnings.append(
                    f"{obj.name}: GUI is in On-Mesh mode but the object isn't a "
                    f"mesh — use Fullscreen, or attach it to a mesh")
        elif comp.comp_type == 'PARTICLE':
            if not comp.particle_file:
                warnings.append(f"{obj.name}: Particles component has no JSON file")
            elif not os.path.isfile(bpy.path.abspath(comp.particle_file)):
                warnings.append(
                    f"{obj.name}: particle file not found: {comp.particle_file}")
            else:
                from ..components.particle_scan import enumerate_particle_texture_slots

                slots = enumerate_particle_texture_slots(comp.particle_file)
                needs_by_id = {slot["block_id"]: slot["needs_file"] for slot in slots}
                for tex_i, tex in enumerate(comp.particle_textures):
                    label = tex.block_name or f"texture {tex_i + 1}"
                    if tex.image_file:
                        if not os.path.isfile(bpy.path.abspath(tex.image_file)):
                            warnings.append(
                                f"{obj.name}: {label} image not found: "
                                f"{tex.image_file}")
                    elif tex.block_id and needs_by_id.get(tex.block_id):
                        warnings.append(
                            f"{obj.name}: {label} needs an image file "
                            f"(no URL in the particle JSON)")
        elif comp.comp_type == 'MSDF_TEXT':
            if not comp.msdf_text:
                warnings.append(f"{obj.name}: MSDF Text component has no text")
            if not comp.msdf_font_json:
                warnings.append(f"{obj.name}: MSDF Text component has no font JSON")
            elif not os.path.isfile(bpy.path.abspath(comp.msdf_font_json)):
                warnings.append(
                    f"{obj.name}: MSDF font JSON not found: {comp.msdf_font_json}")
            if not comp.msdf_font_texture:
                warnings.append(f"{obj.name}: MSDF Text component has no font texture")
            elif not os.path.isfile(bpy.path.abspath(comp.msdf_font_texture)):
                warnings.append(
                    f"{obj.name}: MSDF font texture not found: {comp.msdf_font_texture}")


def _check_gui3d(obj, warnings):
    """3D GUI sanity: a mesh button needs a mesh, panels need button children,
    click events need targets, and image files must exist on disk."""
    for comp in obj.bjs_components:
        if comp.comp_type in GUI3D_CONTROLS:
            if comp.comp_type == 'GUI3D_MESH' and obj.type != 'MESH':
                warnings.append(
                    f"{obj.name}: 3D Mesh Button needs a mesh object to wrap")
            if comp.comp_type in GUI3D_TEXTURED and comp.gui3d_image:
                if not os.path.isfile(bpy.path.abspath(comp.gui3d_image)):
                    warnings.append(
                        f"{obj.name}: 3D button image not found: {comp.gui3d_image}")
            for ev in comp.gui3d_events:
                if ev.target is None:
                    warnings.append(
                        f"{obj.name}: a 3D GUI click event has no target object")
        elif comp.comp_type in GUI3D_PANELS:
            has_child_control = any(
                child_comp.comp_type in GUI3D_CONTROLS
                for child in obj.children
                for child_comp in child.bjs_components)
            if not has_child_control:
                warnings.append(
                    f"{obj.name}: 3D panel has no child objects with 3D button "
                    f"components — parent the buttons under it")


def _has_physics(obj):
    """True when the object has an enabled COLLIDER or RIGIDBODY component."""
    for comp in obj.bjs_components:
        if comp.enabled and comp.comp_type in {'COLLIDER', 'RIGIDBODY'}:
            return True
    return False


def _check_constraints(obj, warnings):
    """Constraints need a physics body on BOTH ends to exist at runtime."""
    from ..components.component import ensure_custom_constraint_axes
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
        if comp.con_type == 'CUSTOM':
            ensure_custom_constraint_axes(comp)
            if len(comp.con_custom_axes) != 6:
                warnings.append(
                    f"{obj.name}: Custom constraint should have 6 axis rows "
                    f"(has {len(comp.con_custom_axes)})")
            for ax in comp.con_custom_axes:
                if ax.mode in {'LIMITED', 'SPRING'} and ax.min_limit > ax.max_limit:
                    warnings.append(
                        f"{obj.name}: Custom {ax.dof_axis} min > max")


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


def _check_input_map(scene, warnings):
    """Input Actions sanity: duplicate map names, duplicate action names
    within a map, actions with no bindings, and @inputMap("Name") references
    in scripts that have no matching Action Map."""
    from ..core import script_parse

    seen_maps = set()
    for m in scene.bjs_input_maps:
        if m.name in seen_maps:
            warnings.append(f"Input Actions: duplicate map name '{m.name}'")
        seen_maps.add(m.name)

        seen_actions = set()
        for action in m.actions:
            if action.name in seen_actions:
                warnings.append(
                    f"Input Actions: duplicate action name '{action.name}' in map '{m.name}'")
            seen_actions.add(action.name)
            if len(action.bindings) == 0:
                warnings.append(
                    f"Input Actions: action '{m.name}/{action.name}' has no bindings")

    from ..input_actions.defaults import DEFAULT_INPUT_ASSET, DEFAULT_INPUT_MAP_NAME

    # An empty panel exports the built-in default asset ("Player" map).
    if len(scene.bjs_input_maps) == 0:
        seen_maps = {m["name"] for m in DEFAULT_INPUT_ASSET.get("maps", [])}
    default_map = scene.bjs_input_default_map or DEFAULT_INPUT_MAP_NAME
    if default_map not in seen_maps:
        warnings.append(
            f"Input Actions: default map '{default_map}' does not exist "
            f"(set Scene Default in the Input Actions panel)")

    reported = set()
    for obj in scene.objects:
        for comp in obj.bjs_components:
            if comp.comp_type != 'SCRIPT' or not comp.script_path:
                continue
            path = bpy.path.abspath(comp.script_path)
            for ref in script_parse.parse_input_maps(path):
                name = ref["map"]
                if name and name not in seen_maps and name not in reported:
                    reported.add(name)
                    warnings.append(
                        f"{obj.name}: script '{comp.script_name}' uses @inputMap(\"{name}\") "
                        f"but no Action Map with that name exists (Input Actions panel "
                        f"> Create Maps Used by Scripts)")


def _check_duplicate_guids(context, warnings):
    """Two renderable objects sharing a GUID (copy-pasted between scenes/files)
    would collide in the manifest. export.py re-IDs duplicates automatically;
    this warns so the author knows references may have moved."""
    scene = context.scene
    seen = {}
    for obj in scene.objects:
        if not is_renderable(obj, context):
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


def _check_active_camera(context, warnings):
    """No active camera means the runtime falls back to a default orbit cam."""
    cam = context.scene.camera
    if cam is None or not is_renderable(cam, context):
        warnings.append(
            "Scene has no (renderable) active camera — the runtime will use a "
            "fallback orbit camera")


def _check_atmosphere(context, warnings):
    """Atmosphere needs at least one exported SUN lamp (or a valid Sun Light pick)."""
    scene = context.scene
    atmosphere = scene.bjs_scene.atmosphere
    if not atmosphere.use_atmosphere:
        return

    if atmosphere.sun_light is not None:
        if not is_renderable(atmosphere.sun_light, context):
            warnings.append(
                "Atmosphere: Sun Light is render-disabled and won't be exported")
        elif atmosphere.sun_light.data.type != 'SUN':
            warnings.append(
                f"Atmosphere: Sun Light '{atmosphere.sun_light.name}' is not a SUN lamp")
        return

    has_sun = any(
        obj.type == 'LIGHT' and obj.data.type == 'SUN' and is_renderable(obj, context)
        for obj in scene.objects
    )
    if not has_sun:
        warnings.append(
            "Atmosphere: no SUN lamp in the scene — add a Sun light or pick one "
            "in Sun Light")


def _check_materials(context, warnings):
    """Node material JSON and texture overrides must exist on disk."""
    from .materials import _materials_in_use
    from ..materials.nme_scan import enumerate_nme_texture_slots

    used = _materials_in_use(context)
    for mat in bpy.data.materials:
        if not mat.bjs_nme_file:
            continue
        if mat not in used:
            warnings.append(
                f"Material '{mat.name}': node material JSON assigned but not "
                f"used by any exportable mesh")
            continue
        if not os.path.isfile(bpy.path.abspath(mat.bjs_nme_file)):
            warnings.append(
                f"Material '{mat.name}': node material file not found: "
                f"{mat.bjs_nme_file}")
            continue

        slots = enumerate_nme_texture_slots(mat.bjs_nme_file)
        needs_by_id = {slot["block_id"]: slot["needs_file"] for slot in slots}
        for tex_i, tex in enumerate(mat.bjs_nme_textures):
            label = tex.block_name or f"texture {tex_i + 1}"
            if tex.image_file:
                if not os.path.isfile(bpy.path.abspath(tex.image_file)):
                    warnings.append(
                        f"Material '{mat.name}': {label} image not found: "
                        f"{tex.image_file}")
            elif tex.block_id and needs_by_id.get(tex.block_id):
                warnings.append(
                    f"Material '{mat.name}': {label} needs an image file "
                    f"(not embedded in the JSON)")


def _check_large_world_rendering(context, warnings):
    """Geospatial globes need floating origin to stay stable at large coordinates."""
    scene = context.scene
    if scene.bjs_scene.use_large_world_rendering:
        return

    for obj in scene.objects:
        if not is_renderable(obj, context):
            continue
        for comp in obj.bjs_components:
            if comp.comp_type == 'CAMERA' and comp.cam_type == 'GEOSPATIAL':
                warnings.append(
                    f"{obj.name}: Geospatial camera but Large World Rendering is off — "
                    "enable Babylon Scene › Rendering › Large World Rendering for "
                    "globe-scale coordinates")
                return


def validate_scene(context):
    """Run every check over the renderable scene. Returns a list of warning
    strings; an empty list means the export looks clean."""
    warnings = []
    scene = context.scene

    for obj in scene.objects:
        if not is_renderable(obj, context):
            continue
        _check_scripts(obj, warnings)
        _check_entity_refs(obj, context, warnings)
        _check_physics(obj, warnings)
        _check_triggers(obj, warnings)
        _check_media(obj, warnings)
        _check_gui3d(obj, warnings)
        _check_constraints(obj, warnings)
        _check_skinned_meshes(obj, warnings)
        _check_lights(obj, warnings)

    _check_input_map(scene, warnings)
    _check_duplicate_guids(context, warnings)
    _check_active_camera(context, warnings)
    _check_atmosphere(context, warnings)
    _check_large_world_rendering(context, warnings)
    _check_materials(context, warnings)

    return warnings
