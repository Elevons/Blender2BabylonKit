"""bpy.props wrappers that mark addon properties library-overridable.

Linked .blend files used as prefabs need every RNA property in the chain from
Object.bjs_components down to leaf fields flagged LIBRARY_OVERRIDABLE so Blender
allows edits on library-overridden instances. Collections that support add/remove
also need USE_INSERTION.
"""

import bpy

_OVERRIDE = {'LIBRARY_OVERRIDABLE'}
_OVERRIDE_COLLECTION = {'LIBRARY_OVERRIDABLE', 'USE_INSERTION'}


def _apply_override(kwargs, *, collection=False, overridable=True):
    if not overridable:
        return kwargs
    out = dict(kwargs)
    flags = _OVERRIDE_COLLECTION if collection else _OVERRIDE
    existing = out.get('override')
    if existing is None:
        out['override'] = set(flags)
    else:
        out['override'] = set(existing) | set(flags)
    return out


def BoolProperty(*, overridable=True, **kwargs):
    return bpy.props.BoolProperty(**_apply_override(kwargs, overridable=overridable))


def CollectionProperty(*, overridable=True, **kwargs):
    return bpy.props.CollectionProperty(
        **_apply_override(kwargs, collection=True, overridable=overridable))


def EnumProperty(*, overridable=True, **kwargs):
    return bpy.props.EnumProperty(**_apply_override(kwargs, overridable=overridable))


def FloatProperty(*, overridable=True, **kwargs):
    return bpy.props.FloatProperty(**_apply_override(kwargs, overridable=overridable))


def FloatVectorProperty(*, overridable=True, **kwargs):
    return bpy.props.FloatVectorProperty(**_apply_override(kwargs, overridable=overridable))


def IntProperty(*, overridable=True, **kwargs):
    return bpy.props.IntProperty(**_apply_override(kwargs, overridable=overridable))


def PointerProperty(*, overridable=True, **kwargs):
    return bpy.props.PointerProperty(**_apply_override(kwargs, overridable=overridable))


def StringProperty(*, overridable=True, **kwargs):
    return bpy.props.StringProperty(**_apply_override(kwargs, overridable=overridable))
