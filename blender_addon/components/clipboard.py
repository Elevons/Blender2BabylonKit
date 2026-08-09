"""Deep-copy of components (duplicate, and the cut/copy/paste clipboard).

The generic RNA walk lives in core/prop_copy.py so new component fields are
copied without maintenance."""

import uuid

from ..core.prop_copy import copy_props


def assign_component_row_name(comp):
    """Give ``comp`` a unique PropertyGroup ``name``.

    Blender library-override ``INSERT_AFTER`` ops identify collection items by
    name. Unnamed rows only get fragile index-based insert ops, so additional
    unnamed inserts on an override are dropped on file/library reload.
    """
    comp.name = uuid.uuid4().hex
    return comp.name


def ensure_component_collection_names(components):
    """Name every unnamed row in ``components`` (in place, stable order).

    Mixing unnamed index-based inserts with a newly named insert makes Blender
    re-diff the override on save and reshuffle row order on reload. Naming the
    existing rows first keeps INSERT_AFTER anchors unambiguous.
    """
    used = {comp.name for comp in components if comp.name}
    for comp in components:
        if comp.name:
            continue
        row_name = uuid.uuid4().hex
        while row_name in used:
            row_name = uuid.uuid4().hex
        comp.name = row_name
        used.add(row_name)


def copy_component(src, dst):
    """Deep-copy a BJSComponent (including exposed vars and their list items).

    Always assigns a fresh row name so paste/duplicate on a library override
    records a distinct insert op instead of colliding with the source name.
    """
    copy_props(src, dst)
    assign_component_row_name(dst)
