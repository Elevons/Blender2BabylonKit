"""Operators for the ANIMATOR component: open the node graph, sync parameters,
manage transition conditions, and seed an empty graph."""

import bpy
from bpy.props import IntProperty, StringProperty
from bpy.types import Operator

from ..core.inspector import inspector_object
from ..animator.sync import sync_animator_params, write_param_defaults_to_tree
from ..animator.edit_context import resolve_animator_object, set_animator_edit_object


def _animator_component(obj, comp_index):
    if obj is None or not (0 <= comp_index < len(obj.bjs_components)):
        return None
    comp = obj.bjs_components[comp_index]
    if comp.comp_type != 'ANIMATOR':
        return None
    return comp


def _ensure_animator_tree(obj, comp):
    """Create or reuse a BJSAnimationStateTree for this component."""
    tree = comp.animator_tree
    if tree is not None and getattr(tree, "bl_idname", "") == "BJSAnimationStateTree":
        return tree

    tree_name = f"{obj.name}_Animator"
    existing = bpy.data.node_groups.get(tree_name)
    if existing is not None and getattr(existing, "bl_idname", "") == "BJSAnimationStateTree":
        comp.animator_tree = existing
        return existing

    tree = bpy.data.node_groups.new(tree_name, "BJSAnimationStateTree")
    comp.animator_tree = tree
    return tree


def _focus_node_editor(context, tree):
    """Point an existing Node Editor at `tree`, or split the current area."""
    for area in context.screen.areas:
        if area.type == 'NODE_EDITOR':
            for space in area.spaces:
                if space.type == 'NODE_EDITOR':
                    space.tree_type = "BJSAnimationStateTree"
                    space.node_tree = tree
                    return True

    # No node editor — try to split the largest area into one.
    area = context.area
    if area is None:
        for candidate in context.screen.areas:
            if candidate.type == 'VIEW_3D':
                area = candidate
                break
    if area is None:
        return False

    override = context.copy()
    override["area"] = area
    try:
        with context.temp_override(**override):
            bpy.ops.screen.area_split(direction='VERTICAL', factor=0.5)
    except Exception:
        return False

    # After split, find the new NODE-capable area (still VIEW_3D until we change it).
    # Prefer the rightmost VIEW_3D and convert it.
    view_areas = [a for a in context.screen.areas if a.type == 'VIEW_3D']
    target = view_areas[-1] if view_areas else area
    target.type = 'NODE_EDITOR'
    for space in target.spaces:
        if space.type == 'NODE_EDITOR':
            space.tree_type = "BJSAnimationStateTree"
            space.node_tree = tree
            break
    return True


class BJS_OT_edit_animator(Operator):
    """Ensure an animator graph exists and open it in the Node Editor."""
    bl_idname = "bjs.edit_animator"
    bl_label = "Edit Animator"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty(default=0)

    def execute(self, context):
        obj = inspector_object(context)
        comp = _animator_component(obj, self.comp_index)
        if comp is None:
            self.report({'WARNING'}, "No ANIMATOR component")
            return {'CANCELLED'}

        tree = _ensure_animator_tree(obj, comp)
        set_animator_edit_object(context, obj)
        sync_animator_params(comp, tree)

        if not _focus_node_editor(context, tree):
            self.report({'WARNING'}, "Could not open a Node Editor — open one manually")
            return {'FINISHED'}

        self.report({'INFO'}, f"Editing animator graph '{tree.name}'")
        return {'FINISHED'}


class BJS_OT_sync_animator_params(Operator):
    """Rescan Parameter nodes into the component's Parameters panel."""
    bl_idname = "bjs.sync_animator_params"
    bl_label = "Sync Animator Parameters"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty(default=0)

    def execute(self, context):
        obj = inspector_object(context)
        comp = _animator_component(obj, self.comp_index)
        if comp is None:
            self.report({'WARNING'}, "No ANIMATOR component")
            return {'CANCELLED'}

        write_param_defaults_to_tree(comp, comp.animator_tree)
        count = sync_animator_params(comp, comp.animator_tree)
        self.report({'INFO'}, f"Synced {count} animator parameter(s)")
        return {'FINISHED'}


class BJS_OT_animator_condition_add(Operator):
    """Add a condition row on a Transition node."""
    bl_idname = "bjs.animator_condition_add"
    bl_label = "Add Condition"
    bl_options = {'REGISTER', 'UNDO'}

    node_name: StringProperty()

    def execute(self, context):
        space = getattr(context, "space_data", None)
        tree = getattr(space, "node_tree", None) if space else None
        if tree is None:
            return {'CANCELLED'}
        node = tree.nodes.get(self.node_name)
        if node is None or getattr(node, "bl_idname", "") != "BJSAnimTransitionNode":
            return {'CANCELLED'}
        node.conditions.add()
        node.active_condition = len(node.conditions) - 1
        return {'FINISHED'}


class BJS_OT_animator_condition_remove(Operator):
    """Remove a condition row on a Transition node."""
    bl_idname = "bjs.animator_condition_remove"
    bl_label = "Remove Condition"
    bl_options = {'REGISTER', 'UNDO'}

    node_name: StringProperty()
    index: IntProperty(default=0)

    def execute(self, context):
        space = getattr(context, "space_data", None)
        tree = getattr(space, "node_tree", None) if space else None
        if tree is None:
            return {'CANCELLED'}
        node = tree.nodes.get(self.node_name)
        if node is None or getattr(node, "bl_idname", "") != "BJSAnimTransitionNode":
            return {'CANCELLED'}
        if 0 <= self.index < len(node.conditions):
            node.conditions.remove(self.index)
        return {'FINISHED'}


class BJS_OT_animator_seed_graph(Operator):
    """Drop Entry + Idle State into an empty animator graph."""
    bl_idname = "bjs.animator_seed_graph"
    bl_label = "Seed Idle Graph"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        space = getattr(context, "space_data", None)
        tree = getattr(space, "node_tree", None) if space else None
        if tree is None or getattr(tree, "bl_idname", "") != "BJSAnimationStateTree":
            self.report({'WARNING'}, "No animator graph open")
            return {'CANCELLED'}
        if len(tree.nodes) > 0:
            self.report({'WARNING'}, "Graph is not empty")
            return {'CANCELLED'}

        entry = tree.nodes.new("BJSAnimEntryNode")
        entry.location = (-200, 0)
        state = tree.nodes.new("BJSAnimStateNode")
        state.location = (100, 0)
        state.state_id = "Idle"
        state.label = "Idle"

        # Prefer first exportable clip (Action name) on the tree's owner.
        obj = resolve_animator_object(context, tree)
        if obj is not None:
            from ..export.animation import nla_clip_names
            clips = nla_clip_names(obj)
            if clips:
                state.clip = clips[0]

        tree.links.new(entry.outputs[0], state.inputs[0])
        return {'FINISHED'}


class BJS_OT_animator_purge_unused_trees(Operator):
    """Delete BJSAnimationStateTree datablocks that nothing references."""
    bl_idname = "bjs.animator_purge_unused_trees"
    bl_label = "Purge Unused Animator Graphs"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        removed = 0
        for tree in list(bpy.data.node_groups):
            if getattr(tree, "bl_idname", "") != "BJSAnimationStateTree":
                continue
            if tree.users > 0:
                continue
            bpy.data.node_groups.remove(tree)
            removed += 1

        if removed == 0:
            self.report(
                {'INFO'},
                "No unused animator graphs — clear Graph on components first, "
                "or unlink in Outliner › Blender File › Node Trees",
            )
        else:
            self.report({'INFO'}, f"Removed {removed} unused animator graph(s)")
        return {'FINISHED'}


classes = (
    BJS_OT_edit_animator,
    BJS_OT_sync_animator_params,
    BJS_OT_animator_condition_add,
    BJS_OT_animator_condition_remove,
    BJS_OT_animator_seed_graph,
    BJS_OT_animator_purge_unused_trees,
)
