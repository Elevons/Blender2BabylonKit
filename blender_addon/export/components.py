"""Component serialization entry point: BJSComponent -> manifest dicts via the
SERIALIZERS registry (component_serializers.py), plus the entity-reference
walker shared with validation and GUID assignment."""

from ..components.constants import GUI3D_CONTROLS
from .component_serializers import SERIALIZERS


def iter_referenced_objects(comp):
    """Yield Blender objects referenced by a component — exposed vars (scalar
    and list), camera/constraint targets, trigger and GUI3D event targets,
    reflection-probe lists, and LOD level targets.

    This is the single registry of GUID-bearing references: the exporter uses
    it to assign GUIDs BEFORE the glb is written and to force manifest rows
    for referenced mesh-only objects. Missing a reference type here means the
    runtime cannot resolve it (mirrored by the engine's guidFields.ts)."""
    if comp.comp_type == 'CAMERA' and comp.cam_target is not None:
        yield comp.cam_target
    if comp.comp_type == 'LOD':
        for level in comp.lod_levels:
            if not level.auto_lod and level.target is not None:
                yield level.target
    if comp.comp_type == 'COLLIDER':
        for ev in comp.event_messages:
            if ev.target is not None:
                yield ev.target
    if comp.comp_type == 'CONSTRAINT' and comp.con_target is not None:
        yield comp.con_target
    if comp.comp_type in GUI3D_CONTROLS:
        for ev in comp.gui3d_events:
            if ev.target is not None:
                yield ev.target
    if comp.comp_type == 'REFLECTION_PROBE':
        for entry in comp.probe_render_list:
            if entry.obj_ref is not None:
                yield entry.obj_ref
        for entry in comp.probe_render_excludes:
            if entry.obj_ref is not None:
                yield entry.obj_ref
    for v in comp.exposed_vars:
        if v.vtype == 'ENTITY' and v.obj_val is not None:
            yield v.obj_val
        elif v.vtype == 'LIST' and v.elem_type == 'ENTITY':
            for item in v.list_items:
                if item.obj_val is not None:
                    yield item.obj_val


def serialize_components(obj, output_dir):
    """Serialize every enabled component on one object through the registry."""
    comps = []
    for c in obj.bjs_components:
        if not c.enabled:
            continue

        serializer = SERIALIZERS.get(c.comp_type)
        if serializer is None:
            print(f"[bjs export] '{obj.name}': no serializer for component "
                  f"type '{c.comp_type}' — skipped")
            continue

        d = {"type": c.comp_type}
        serializer(c, d, output_dir)
        display_name = c.display_name.strip()
        if display_name:
            d["name"] = display_name
        comps.append(d)
    return comps
