"""Animator parameter rows mirrored on the ANIMATOR component panel.

Graph Parameter nodes are the schema source of truth; these rows hold editable
default values for the inspector (same idea as SCRIPT exposed_vars).
"""

from bpy.types import PropertyGroup

from ..core.props import (
    StringProperty, EnumProperty, FloatProperty, BoolProperty, IntProperty,
)

ANIMATOR_PARAM_TYPES = [
    ('FLOAT', "Float", "Continuous numeric parameter"),
    ('BOOL', "Bool", "Boolean flag"),
    ('INT', "Int", "Integer parameter"),
    ('TRIGGER', "Trigger", "One-shot pulse that resets after evaluation"),
]


class BJSAnimatorParam(PropertyGroup):
    """One animator parameter mirrored from a Parameter node in the graph."""
    name: StringProperty(name="Name", default="")
    ptype: EnumProperty(name="Type", items=ANIMATOR_PARAM_TYPES, default='FLOAT')
    label: StringProperty(name="Label", default="")

    f_val: FloatProperty(name="Value", default=0.0)
    b_val: BoolProperty(name="Value", default=False)
    i_val: IntProperty(name="Value", default=0)
