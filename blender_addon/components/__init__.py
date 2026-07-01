"""Component data model package.

Registers the per-object collections (`Object.bjs_components`, `bjs_shadow`,
`bjs_animation`) and the session clipboard. Constants live in constants.py;
the superset component group in component.py; @exposed script vars in
exposed_vars.py; per-object non-component settings in object_settings.py;
deep-copy in clipboard.py.
"""

import bpy
from bpy.types import Object, WindowManager

from ..core.props import CollectionProperty, IntProperty, PointerProperty

from .exposed_vars import BJSListItem, BJSExposedVar
from .component import (
    BJSConstraintAxisDoF,
    BJSParticleTexture,
    BJSTriggerEvent,
    BJSComponent,
)

from .object_settings import BJSLightShadow, BJSAnimationSettings

classes = (
    BJSListItem,
    BJSExposedVar,
    BJSConstraintAxisDoF,
    BJSParticleTexture,
    BJSTriggerEvent,
    BJSComponent,
    BJSLightShadow,
    BJSAnimationSettings,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    # Per-object component list. Object names are unique within a .blend file,
    # which is how we match entities back to glTF nodes at load time.
    Object.bjs_components = CollectionProperty(type=BJSComponent)
    Object.bjs_components_index = IntProperty(default=0)
    # Per-light Babylon shadow settings (only used/drawn for LIGHT objects).
    Object.bjs_shadow = PointerProperty(type=BJSLightShadow)
    # Per-object NLA animation settings (drawn when the object has NLA strips).
    Object.bjs_animation = PointerProperty(type=BJSAnimationSettings)
    # Session clipboard for cut/copy/paste of components (holds 0 or 1).
    WindowManager.bjs_clipboard = CollectionProperty(type=BJSComponent)
    # When set, the Components panel pins to this object instead of following
    # the active selection (lets you pick other objects to batch-add to lists).
    WindowManager.bjs_pinned_object = PointerProperty(type=Object)


def unregister():
    del WindowManager.bjs_pinned_object
    del WindowManager.bjs_clipboard
    del Object.bjs_animation
    del Object.bjs_shadow
    del Object.bjs_components_index
    del Object.bjs_components
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
