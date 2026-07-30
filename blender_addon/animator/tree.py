"""Custom NodeTree datablock for animation state machines."""

from bpy.types import NodeTree


class BJSAnimationStateTree(NodeTree):
    """Flat FSM graph: Entry, State, Parameter, and Transition nodes."""
    bl_idname = "BJSAnimationStateTree"
    bl_label = "BJS Animator"
    bl_icon = "ANIM"
