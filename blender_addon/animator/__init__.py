"""Animator package: custom NodeTree for flat animation state machines.

Registers BJSAnimationStateTree, node classes, and a Node Editor add menu.
Component fields (animator_tree / animator_vars) live on BJSComponent.
"""

import bpy
from bpy.types import Panel
from nodeitems_utils import (
    NodeCategory as NodeItemsCategory,
    NodeItem as NodeItemsItem,
    register_node_categories,
    unregister_node_categories,
)

from ..core.props import StringProperty

from .params import BJSAnimatorParam
from .tree import BJSAnimationStateTree
from .nodes import classes as node_classes
from .edit_context import resolve_animator_object


class BJSAnimNodeCategory(NodeItemsCategory):
    @classmethod
    def poll(cls, context):
        space = getattr(context, "space_data", None)
        return (
            space is not None
            and getattr(space, "tree_type", "") == "BJSAnimationStateTree"
        )


_node_categories = [
    BJSAnimNodeCategory(
        "BJS_ANIMATOR",
        "BJS",
        items=[
            NodeItemsItem("BJSAnimEntryNode"),
            NodeItemsItem("BJSAnimStateNode"),
            NodeItemsItem("BJSAnimParameterNode"),
            NodeItemsItem("BJSAnimTransitionNode"),
        ],
    ),
]


class BJS_PT_animator_node_header(Panel):
    """Header info while editing an animator graph."""
    bl_label = "BJS Animator"
    bl_idname = "BJS_PT_animator_node_header"
    bl_space_type = "NODE_EDITOR"
    bl_region_type = "UI"
    bl_category = "BJS"

    @classmethod
    def poll(cls, context):
        space = getattr(context, "space_data", None)
        return (
            space is not None
            and getattr(space, "tree_type", "") == "BJSAnimationStateTree"
        )

    def draw(self, context):
        layout = self.layout
        tree = context.space_data.node_tree if context.space_data else None
        obj = resolve_animator_object(context, tree)
        if obj is not None:
            layout.label(text=f"Armature: {obj.name}", icon="ARMATURE_DATA")
        else:
            layout.label(text="Open via Edit Animator on a component", icon="INFO")

        if tree is not None and len(tree.nodes) == 0:
            layout.separator()
            layout.label(text="Empty graph — Add → Entry / State")
            op = layout.operator("bjs.animator_seed_graph", text="Seed Idle Graph", icon="ADD")


classes = (
    BJSAnimatorParam,
    BJSAnimationStateTree,
    *node_classes,
    BJS_PT_animator_node_header,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    bpy.types.WindowManager.bjs_animator_edit_object = StringProperty(
        name="Animator Edit Object",
        default="",
        description="Object name whose ANIMATOR graph is open in the Node Editor",
    )
    register_node_categories("BJS_ANIMATOR_NODES", _node_categories)


def unregister():
    unregister_node_categories("BJS_ANIMATOR_NODES")
    del bpy.types.WindowManager.bjs_animator_edit_object
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
