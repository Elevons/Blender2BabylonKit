"""Level exporter entry point: writes a .glb (geometry, lights, cameras) plus
a sidecar `<name>.scene.json` manifest carrying the ECS component data.

The runtime loads the glb, then matches each manifest entity to a glTF node
by name and attaches the components. Geometry/transform/parenting all ride
along inside the glb, so the manifest only stores what glTF can't express.
"""

import json
import os

import bpy

from ..core.ids import ID_KEY, VISIBLE_KEY, ensure_object_id
from .animation import serialize_animation, nla_clip_names
from .assets import begin_asset_export
from .components import serialize_components, iter_referenced_objects
from .datablocks import serialize_light, serialize_camera
from .scene import serialize_scene


SCHEMA_VERSION = 4


def _is_renderable(obj):
    """Objects disabled in renders (the camera icon / `hide_render`) are excluded
    from the level entirely — no glb geometry and no manifest entry."""
    return not obj.hide_render


def _is_viewport_hidden(obj):
    """True when the eye icon is off, including collection / hierarchy visibility."""
    visible_get = getattr(obj, "visible_get", None)
    if visible_get is not None:
        return not visible_get()
    return obj.hide_viewport


def _referenced_ids(context):
    """GUIDs of objects referenced by any ENTITY exposed var (scalar or list)."""
    ids = set()
    for obj in context.scene.objects:
        for comp in obj.bjs_components:
            for ref in iter_referenced_objects(comp):
                rid = ref.get(ID_KEY)
                if rid:
                    ids.add(rid)
    return ids


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
                or nla_clip_names(obj) or _is_viewport_hidden(obj)):
            ensure_object_id(obj)
        for comp in obj.bjs_components:
            for ref in iter_referenced_objects(comp):
                if _is_renderable(ref):
                    ensure_object_id(ref)


def _build_manifest(context, glb_filename, output_dir):
    referenced = _referenced_ids(context)
    entities = []
    for obj in context.scene.objects:
        if not _is_renderable(obj):
            continue  # disabled in renders → not part of the level
        comps = serialize_components(obj, output_dir)
        light = serialize_light(obj) if obj.type == 'LIGHT' else None
        camera = serialize_camera(obj, obj == context.scene.camera) if obj.type == 'CAMERA' else None
        animation = serialize_animation(obj)
        is_referenced = obj.get(ID_KEY) in referenced
        has_id = bool(obj.get(ID_KEY))
        viewport_hidden = _is_viewport_hidden(obj)
        # A GUID is an explicit "make this addressable" marker (e.g. Assign GUID
        # on a bare empty), so include it even with nothing else on it.
        if (not comps and not light and not camera and not animation
                and not is_referenced and not has_id):
            if not viewport_hidden:
                continue  # pure geometry needs no manifest entry; it lives in the glb
            obj_id = ensure_object_id(obj)
            parent = obj.parent
            parent_id = parent.get(ID_KEY) if parent else None
            entities.append({
                "id": obj_id,
                "name": obj.name,
                "parent": parent_id,
                "components": [],
                "visible": False,
            })
            continue
        obj_id = ensure_object_id(obj)  # guarantee a GUID exists
        parent = obj.parent
        parent_id = parent.get(ID_KEY) if parent else None
        entity = {
            "id": obj_id,
            "name": obj.name,            # kept for debugging / name-match fallback
            "parent": parent_id,         # parent GUID if the parent has one, else null
            "components": comps,
        }
        if viewport_hidden:
            entity["visible"] = False
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


def _stamp_viewport_visibility(context):
    """Write viewport-hidden state into glTF extras (transient — cleared after export)."""
    stamped = []
    for obj in context.scene.objects:
        if not _is_renderable(obj):
            continue
        if _is_viewport_hidden(obj):
            # Int 0 — some glTF exporter versions omit boolean false from extras.
            obj[VISIBLE_KEY] = 0
            stamped.append(obj)
    return stamped


def _clear_viewport_visibility(stamped):
    for obj in stamped:
        if VISIBLE_KEY in obj:
            del obj[VISIBLE_KEY]


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

    begin_asset_export()
    _dedupe_entity_ids(context)   # duplicated objects get fresh GUIDs
    _ensure_entity_ids(context)   # assign GUIDs BEFORE the glb is written
    visibility_stamped = _stamp_viewport_visibility(context)
    _export_glb(glb_path)
    _clear_viewport_visibility(visibility_stamped)

    manifest = _build_manifest(context, glb_filename, os.path.dirname(glb_path))
    manifest["debug"] = bool(getattr(context.scene, "bjs_debug_build", True))
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    return glb_path, json_path, len(manifest["entities"])
