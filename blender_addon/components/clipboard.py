"""Deep-copy of components (duplicate, and the cut/copy/paste clipboard).

Works generically over RNA so new component fields are copied without
maintenance."""

import bpy

# Properties whose value is fully derived from other stored properties (virtual
# proxies), so copying them directly is wrong — copy their backing fields instead.
_VIRTUAL_PROPS = {"e_val"}  # EnumProperty proxy over s_val + enum_options


def _copy_props(src, dst):
    """Recursively copy every stored property from one PropertyGroup to another.
    Object/datablock pointers are copied by reference; nested groups recurse;
    collections are rebuilt item by item; virtual proxy props are skipped."""
    for prop in src.bl_rna.properties:
        pid = prop.identifier
        if pid == "rna_type" or pid in _VIRTUAL_PROPS:
            continue
        if prop.type == 'COLLECTION':
            # Collections report is_readonly (can't be reassigned) but are still
            # mutable via clear()/add() — so handle them BEFORE the readonly skip.
            dst_coll = getattr(dst, pid)
            dst_coll.clear()
            for s_item in getattr(src, pid):
                _copy_props(s_item, dst_coll.add())
        elif prop.is_readonly:
            continue
        elif prop.type == 'POINTER':
            sub = getattr(src, pid)
            if sub is None or isinstance(sub, bpy.types.ID):
                try:
                    setattr(dst, pid, sub)  # datablock ref (e.g. Object) by reference
                except (AttributeError, TypeError):
                    pass
            else:
                _copy_props(sub, getattr(dst, pid))  # nested PropertyGroup
        else:
            val = getattr(src, pid)
            if getattr(prop, "is_array", False):
                val = val[:]
            try:
                setattr(dst, pid, val)
            except (AttributeError, TypeError, ValueError):
                pass


def copy_component(src, dst):
    """Deep-copy a BJSComponent (including exposed vars and their list items)."""
    _copy_props(src, dst)
