"""Generic RNA property copy for PropertyGroups, plus a collection remove()
that tolerates Blender's restrictions.

Works generically over bl_rna so new fields are handled without maintenance.
Blender forbids bpy_prop_collection.remove() on some collections — notably the
linked base rows of library-override data, where local insertions can be added
and removed but the linked rows cannot be touched. remove_collection_item is
therefore best-effort: it never falls back to clear()+rebuild, because clear()
on override data drops only the local rows and would duplicate the linked ones
on re-add.
"""

import bpy

# Properties whose value is fully derived from other stored properties (virtual
# get/set proxies), so copying them directly is wrong — their backing fields
# are copied instead.
VIRTUAL_PROPS = {
    "e_val",                  # enum proxy over s_val + enum_options (exposed vars)
    "list_count",             # typed-length proxy over list_items (exposed vars)
    "collision_layer_select", # enum proxy over collision_layer (components)
}


def copy_props(src, dst):
    """Recursively copy every stored property from one PropertyGroup to another.
    Object/datablock pointers are copied by reference; nested groups recurse;
    collections are rebuilt item by item; virtual proxy props are skipped."""
    for prop in src.bl_rna.properties:
        pid = prop.identifier
        if pid == "rna_type" or pid in VIRTUAL_PROPS:
            continue
        if prop.type == 'COLLECTION':
            # Collections report is_readonly (can't be reassigned) but are still
            # mutable via clear()/add() — so handle them BEFORE the readonly skip.
            dst_coll = getattr(dst, pid)
            dst_coll.clear()
            for s_item in getattr(src, pid):
                copy_props(s_item, dst_coll.add())
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
                copy_props(sub, getattr(dst, pid))  # nested PropertyGroup
        else:
            val = getattr(src, pid)
            if getattr(prop, "is_array", False):
                val = val[:]
            try:
                setattr(dst, pid, val)
            except (AttributeError, TypeError, ValueError):
                pass


def remove_collection_item(collection, index):
    """Best-effort remove of collection[index]. Returns True on success.

    On collections that refuse remove() (linked library-override base rows),
    returns False and leaves the collection untouched — a destructive
    clear()+rebuild would duplicate the linked rows, so callers accept that
    linked rows simply cannot be removed (Blender's own constraint)."""
    if not (0 <= index < len(collection)):
        return False
    try:
        collection.remove(index)
        return True
    except TypeError:
        return False
