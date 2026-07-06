"""Deep-copy of components (duplicate, and the cut/copy/paste clipboard).

The generic RNA walk lives in core/prop_copy.py so new component fields are
copied without maintenance."""

from ..core.prop_copy import copy_props


def copy_component(src, dst):
    """Deep-copy a BJSComponent (including exposed vars and their list items)."""
    copy_props(src, dst)
