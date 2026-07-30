"""Node and socket classes for BJSAnimationStateTree.

Node types:
  Entry      — wires to the default State
  State      — one NLA clip (loop / speed)
  Parameter  — float / bool / int / trigger schema
  Transition — conditions between two States
"""

from bpy.types import Node, NodeSocket, PropertyGroup

from ..core.props import (
    StringProperty, EnumProperty, FloatProperty, BoolProperty, IntProperty,
    CollectionProperty,
)
from .params import ANIMATOR_PARAM_TYPES
from .edit_context import resolve_animator_object

# Keeps dynamically-generated enum item tuples alive (Blender GC crash otherwise).
_CLIP_ITEMS_CACHE = {}
_PARAM_ITEMS_CACHE = {}

CONDITION_KINDS = [
    ('PARAM', "Parameter", "Compare an animator parameter"),
    ('CLIP_FINISHED', "Clip Finished", "Fire when the state's clip finishes (non-looping)"),
    ('AFTER_SECONDS', "After Seconds", "Fire after time in the current state"),
    ('INPUT', "Input Action", "Input Actions phase edge"),
    ('MESSAGE', "Message", "OnMessage string match"),
]

COMPARE_OPS = [
    ('GT', ">", "Greater than"),
    ('GTE', ">=", "Greater than or equal"),
    ('LT', "<", "Less than"),
    ('LTE', "<=", "Less than or equal"),
    ('EQ', "==", "Equal"),
    ('NEQ', "!=", "Not equal"),
]

INPUT_PHASES = [
    ('PRESSED', "Pressed", "WasPressedThisFrame"),
    ('HELD', "Held", "IsPressed"),
    ('RELEASED', "Released", "WasReleasedThisFrame"),
]


def _clip_enum_items(self, context):
    """Clip dropdown = glTF / AnimationGroup names (action or renamed track)."""
    # Lazy import: export/__init__ pulls components, and component.py imports
    # animator.params — a top-level import here creates a circular load.
    from ..export.animation import nla_clip_names

    items = [("", "(none)", "")]
    tree = getattr(self, "id_data", None)
    obj = resolve_animator_object(context, tree)
    if obj is not None:
        for clip_name in nla_clip_names(obj):
            items.append((clip_name, clip_name, "glTF animation / Action name"))
    _CLIP_ITEMS_CACHE[self.as_pointer()] = items
    return _CLIP_ITEMS_CACHE[self.as_pointer()]


def _param_enum_items(self, context):
    """Parameter names from Parameter nodes in the same tree."""
    items = [("", "(none)", "")]
    node = getattr(self, "id_data", None)
    # Conditions live on Transition nodes; id_data is the NodeTree.
    tree = None
    if hasattr(self, "id_data") and self.id_data is not None:
        # When called from a PropertyGroup on a node, id_data is the node tree.
        tree = self.id_data if self.id_data.bl_rna.identifier == "BJSAnimationStateTree" else None
    if tree is None and context is not None:
        space = getattr(context, "space_data", None)
        if space is not None and getattr(space, "node_tree", None) is not None:
            tree = space.node_tree
    if tree is not None:
        for n in tree.nodes:
            if getattr(n, "bl_idname", "") == "BJSAnimParameterNode":
                pname = (n.param_name or "").strip()
                if pname:
                    items.append((pname, pname, ""))
    _PARAM_ITEMS_CACHE[self.as_pointer()] = items
    return _PARAM_ITEMS_CACHE[self.as_pointer()]


class BJSAnimCondition(PropertyGroup):
    """One transition condition (AND with siblings on the same Transition)."""
    kind: EnumProperty(name="Kind", items=CONDITION_KINDS, default='PARAM')

    param: EnumProperty(name="Parameter", items=_param_enum_items)
    op: EnumProperty(name="Op", items=COMPARE_OPS, default='GT')
    value: FloatProperty(name="Value", default=0.0)
    bool_value: BoolProperty(name="Value", default=True)
    int_value: IntProperty(name="Value", default=0)

    action: StringProperty(name="Action", default="",
                           description="Input Actions action name")
    phase: EnumProperty(name="Phase", items=INPUT_PHASES, default='PRESSED')

    message: StringProperty(name="Message", default="")
    seconds: FloatProperty(name="Seconds", default=1.0, min=0.0)


class BJSAnimSocket(NodeSocket):
    """Directed link between Entry / State / Transition nodes."""
    bl_idname = "BJSAnimSocket"
    bl_label = "State Link"

    def draw(self, context, layout, node, text):
        layout.label(text=text)

    def draw_color(self, context, node):
        return (0.35, 0.7, 1.0, 1.0)


class BJSAnimTreeNode:
    """Mixin: only appear in BJSAnimationStateTree."""

    @classmethod
    def poll(cls, ntree):
        return ntree.bl_idname == "BJSAnimationStateTree"


class BJSAnimEntryNode(Node, BJSAnimTreeNode):
    """Marks the default state (output wires to a State)."""
    bl_idname = "BJSAnimEntryNode"
    bl_label = "Entry"
    bl_icon = "PLAY"

    def init(self, context):
        self.outputs.new("BJSAnimSocket", "Default")

    def draw_buttons(self, context, layout):
        layout.label(text="→ default state")


class BJSAnimStateNode(Node, BJSAnimTreeNode):
    """One FSM state bound to an NLA clip."""
    bl_idname = "BJSAnimStateNode"
    bl_label = "State"
    bl_icon = "ACTION"

    state_id: StringProperty(
        name="State Id", default="State",
        description="Stable state name used by transitions (defaults to node label)")
    clip: EnumProperty(name="Clip", items=_clip_enum_items)
    loop: BoolProperty(name="Loop", default=True)
    speed: FloatProperty(name="Speed", default=1.0, min=0.0, soft_max=10.0)

    def init(self, context):
        self.inputs.new("BJSAnimSocket", "In")
        self.outputs.new("BJSAnimSocket", "Out")
        self.state_id = "State"

    def draw_buttons(self, context, layout):
        layout.prop(self, "state_id", text="Id")
        layout.prop(self, "clip", text="Clip")
        layout.label(text="Clip = Action name (glb)", icon="INFO")
        layout.prop(self, "loop")
        layout.prop(self, "speed")

    def copy(self, node):
        self.state_id = node.state_id


class BJSAnimParameterNode(Node, BJSAnimTreeNode):
    """Declares a named parameter; defaults sync to the component panel."""
    bl_idname = "BJSAnimParameterNode"
    bl_label = "Parameter"
    bl_icon = "PRESET"

    param_name: StringProperty(name="Name", default="Speed")
    ptype: EnumProperty(name="Type", items=ANIMATOR_PARAM_TYPES, default='FLOAT')
    f_default: FloatProperty(name="Default", default=0.0)
    b_default: BoolProperty(name="Default", default=False)
    i_default: IntProperty(name="Default", default=0)

    def init(self, context):
        pass

    def draw_buttons(self, context, layout):
        layout.prop(self, "param_name", text="Name")
        layout.prop(self, "ptype", text="Type")
        if self.ptype == 'FLOAT':
            layout.prop(self, "f_default", text="Default")
        elif self.ptype == 'BOOL':
            layout.prop(self, "b_default", text="Default")
        elif self.ptype == 'INT':
            layout.prop(self, "i_default", text="Default")
        else:
            layout.label(text="Trigger (no default)")


class BJSAnimTransitionNode(Node, BJSAnimTreeNode):
    """Transition between two States with AND conditions."""
    bl_idname = "BJSAnimTransitionNode"
    bl_label = "Transition"
    bl_icon = "ARROW_LEFTRIGHT"

    duration: FloatProperty(
        name="Duration", default=0.0, min=0.0,
        description="Crossfade seconds (reserved; v1 is instant)")
    conditions: CollectionProperty(type=BJSAnimCondition)
    active_condition: IntProperty(default=0)

    def init(self, context):
        self.inputs.new("BJSAnimSocket", "From")
        self.outputs.new("BJSAnimSocket", "To")

    def draw_buttons(self, context, layout):
        layout.prop(self, "duration")
        box = layout.box()
        hdr = box.row(align=True)
        hdr.label(text="Conditions (AND)")
        add = hdr.operator("bjs.animator_condition_add", text="", icon="ADD")
        add.node_name = self.name
        if len(self.conditions) == 0:
            box.label(text="(always true if empty)", icon="INFO")
            return
        for index, cond in enumerate(self.conditions):
            row = box.box()
            top = row.row(align=True)
            top.prop(cond, "kind", text="")
            rem = top.operator("bjs.animator_condition_remove", text="", icon="X")
            rem.node_name = self.name
            rem.index = index
            if cond.kind == 'PARAM':
                row.prop(cond, "param")
                row.prop(cond, "op")
                row.prop(cond, "value")
            elif cond.kind == 'CLIP_FINISHED':
                row.label(text="When clip ends")
            elif cond.kind == 'AFTER_SECONDS':
                row.prop(cond, "seconds")
            elif cond.kind == 'INPUT':
                row.prop(cond, "action")
                row.prop(cond, "phase")
            elif cond.kind == 'MESSAGE':
                row.prop(cond, "message")


classes = (
    BJSAnimCondition,
    BJSAnimSocket,
    BJSAnimEntryNode,
    BJSAnimStateNode,
    BJSAnimParameterNode,
    BJSAnimTransitionNode,
)
