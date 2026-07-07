"""The "Input Actions" editor — a three-level editor for the scene's Input
Actions asset (Action Maps > Actions > Bindings).

It lives in the "Babylon Scene" N-panel, next to the other scene-wide
settings. The draw code is a mixin (BJSInputMapDrawMixin) so a second copy
can be added elsewhere with a few lines if needed.

The data model lives in input_actions/properties.py and the operators in
input_actions/operators.py.
"""

import bpy
from bpy.types import Panel


class BJSInputMapDrawMixin:
    """All Input Actions draw logic, independent of where the panel lives."""

    def draw_input_editor(self, layout, scene):
        if len(scene.bjs_input_maps) == 0:
            layout.label(text="No maps yet — load defaults or add a map", icon='INFO')
        row = layout.row(align=True)
        row.operator("bjs.input_save_map", icon='FILE_TICK')
        row.operator("bjs.input_load_map", icon='FILEBROWSER')
        row = layout.row(align=True)
        row.operator("bjs.input_load_defaults", icon='IMPORT')
        row.operator("bjs.input_sync_scripts", icon='FILE_SCRIPT')

        self._draw_default_map(layout, scene)
        self._draw_maps(layout, scene)

        active_map = None
        if 0 <= scene.bjs_input_map_active < len(scene.bjs_input_maps):
            active_map = scene.bjs_input_maps[scene.bjs_input_map_active]
        if active_map is None:
            return

        self._draw_actions(layout, active_map)

        if 0 <= active_map.active_action < len(active_map.actions):
            self._draw_bindings(layout, active_map.actions[active_map.active_action])

    def _draw_default_map(self, layout, scene):
        """The map scripts receive when they have no @inputMap decorator."""
        box = layout.box()
        box.label(text="Scene Default", icon='EVENT_A')
        box.label(text="Injected when a script has no @inputMap", icon='INFO')
        if len(scene.bjs_input_maps) == 0:
            return

        row = box.row(align=True)
        for m in scene.bjs_input_maps:
            op = row.operator(
                "bjs.input_set_default_map",
                text=m.name,
                depress=(scene.bjs_input_default_map == m.name),
            )
            op.map_name = m.name

    def _draw_maps(self, layout, scene):
        """The Action Maps list ("Player", "UI", ...): the enable/disable unit."""
        box = layout.box()
        header = box.row()
        header.label(text="Action Maps", icon='OUTLINER_COLLECTION')
        add = header.operator("bjs.input_map_edit", text="", icon='ADD')
        add.action = "add"
        box.template_list("UI_UL_list", "bjs_input_maps", scene, "bjs_input_maps",
                          scene, "bjs_input_map_active", rows=2)
        if 0 <= scene.bjs_input_map_active < len(scene.bjs_input_maps):
            row = box.row(align=True)
            row.prop(scene.bjs_input_maps[scene.bjs_input_map_active], "name", text="Map")
            rem = row.operator("bjs.input_map_edit", text="", icon='X')
            rem.action, rem.index = "remove", scene.bjs_input_map_active

    def _draw_actions(self, layout, active_map):
        """The selected map's actions ("Jump", "Move") with type settings."""
        box = layout.box()
        header = box.row()
        header.label(text=f"Actions — {active_map.name}", icon='EVENT_A')
        add = header.operator("bjs.input_action_edit", text="", icon='ADD')
        add.action = "add"
        box.template_list("UI_UL_list", "bjs_input_actions", active_map, "actions",
                          active_map, "active_action", rows=3)
        if 0 <= active_map.active_action < len(active_map.actions):
            action = active_map.actions[active_map.active_action]
            row = box.row(align=True)
            row.prop(action, "name", text="Action")
            rem = row.operator("bjs.input_action_edit", text="", icon='X')
            rem.action, rem.index = "remove", active_map.active_action
            row = box.row(align=True)
            row.prop(action, "action_type", text="")
            row.prop(action, "control_type", text="")

    def _draw_bindings(self, layout, action):
        """The selected action's bindings; composite parts indent under their
        header row (Unity's serialized composite layout)."""
        box = layout.box()
        box.label(text=f"Bindings — {action.name}", icon='LINKED')
        add_row = box.row(align=True)
        for kind, label in (("DIRECT", "+ Binding"),
                            ("1DAXIS", "+ 1D Axis"),
                            ("2DVECTOR", "+ 2D Vector")):
            add = add_row.operator("bjs.input_binding_edit", text=label)
            add.action, add.kind = "add", kind

        if len(action.bindings) == 0:
            box.label(text="No bindings — this action never fires", icon='ERROR')

        for i, binding in enumerate(action.bindings):
            if binding.composite != 'NONE':
                row = box.row(align=True)
                label = "1D Axis" if binding.composite == '1DAXIS' else "2D Vector"
                row.label(text=label, icon='CON_TRANSFORM')
                rem = row.operator("bjs.input_binding_edit", text="", icon='X')
                rem.action, rem.index = "remove", i
                continue

            row = box.row(align=True)
            if binding.part != 'NONE':
                row.separator(factor=1.5)
                row.label(text=binding.part.capitalize())
            row.prop(binding, "device", text="")
            if binding.device == 'KEYBOARD':
                row.prop(binding, "key", text="")
                cap = row.operator("bjs.input_capture_key", text="", icon='REC')
                cap.binding_index = i
            else:
                row.prop(binding, "gp_control", text="")
                if binding.gp_control == 'BUTTON':
                    row.prop(binding, "gp_button", text="")
                elif binding.gp_control == 'AXIS':
                    row.prop(binding, "gp_axis", text="")
                    if binding.part != 'NONE':
                        row.prop(binding, "axis_half", text="")
                else:
                    row.prop(binding, "gp_stick", text="")
                row.prop(binding, "scale", text="")
                cap = row.operator("bjs.input_capture_gamepad", text="", icon='REC')
                cap.binding_index = i
            if binding.part == 'NONE':
                rem = row.operator("bjs.input_binding_edit", text="", icon='X')
                rem.action, rem.index = "remove", i


class BJS_PT_input_map(BJSInputMapDrawMixin, Panel):
    """Scene-level Input Actions (Unity Input System style): Action Maps >
    Actions > Bindings, edited once. Scripts with @inputMap("Name") get that
    map; scripts without @inputMap receive the scene Default Map."""
    bl_label = "Input Actions"
    bl_idname = "BJS_PT_input_map"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Scene"
    bl_options = {'DEFAULT_CLOSED'}

    def draw(self, context):
        self.draw_input_editor(self.layout, context.scene)


classes = (
    BJS_PT_input_map,
)
