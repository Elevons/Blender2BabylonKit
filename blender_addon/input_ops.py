"""Operators for the Input Actions panel: edit Scene.bjs_input_maps (Action
Maps > Actions > Bindings), load/save the asset as .inputactions.json, capture
keys, and sync maps that scripts ask for via @inputMap("Name").

The data model lives in input_properties.py and the panel in input_ui.py.
"""

import bpy
from bpy.props import IntProperty, StringProperty
from bpy.types import Operator

from . import script_parse
from .input_defaults import DEFAULT_INPUT_ASSET, DEFAULT_INPUT_MAP_NAME


def ensure_scene_input_maps(scene):
    """Seed the panel with the built-in asset when empty so the scene always
    has an authored input set visible in the Input Actions view."""
    if len(scene.bjs_input_maps) > 0:
        return False
    _apply_input_asset(scene, DEFAULT_INPUT_ASSET)
    scene.bjs_input_default_map = DEFAULT_INPUT_MAP_NAME
    return True


def _active_input_map(scene):
    maps = scene.bjs_input_maps
    if 0 <= scene.bjs_input_map_active < len(maps):
        return maps[scene.bjs_input_map_active]
    return None


def _active_input_action(scene):
    m = _active_input_map(scene)
    if m is not None and 0 <= m.active_action < len(m.actions):
        return m.actions[m.active_action]
    return None


_ACTION_TYPES = {'BUTTON', 'VALUE', 'PASSTHROUGH'}
_CONTROL_TYPES = {'BUTTON', 'AXIS', 'VECTOR2'}
_GP_CONTROLS = {'BUTTON', 'AXIS', 'STICK'}
_COMPOSITES = {'1DAXIS', '2DVECTOR'}
_COMPOSITE_PART_ORDER = {
    '1DAXIS': ("negative", "positive"),
    '2DVECTOR': ("up", "down", "left", "right"),
}


def _apply_binding_fields(row, data):
    """Fill one binding row's control fields from manifest-shaped data."""
    from .scene_export import _KEY_ALIASES
    js_to_alias = {real: alias for alias, real in _KEY_ALIASES.items()}

    device = str(data.get("device", "KEYBOARD")).upper()
    row.device = device if device in ('KEYBOARD', 'GAMEPAD') else 'KEYBOARD'
    if row.device == 'KEYBOARD':
        key = str(data.get("control", ""))
        row.key = js_to_alias.get(key, key)
    else:
        control = str(data.get("control", "button")).upper()
        row.gp_control = control if control in _GP_CONTROLS else 'BUTTON'
        row.index = max(0, int(data.get("index", 0) or 0))
    try:
        row.scale = float(data.get("scale", 1.0))
    except (TypeError, ValueError):
        row.scale = 1.0


def _apply_input_asset(scene, data):
    """Replace the scene's Input Actions with manifest-shaped asset data."""
    scene.bjs_input_maps.clear()

    for map_data in data.get("maps", []):
        m = scene.bjs_input_maps.add()
        m.name = map_data.get("name", "Map")

        for action_data in map_data.get("actions", []):
            a = m.actions.add()
            a.name = action_data.get("name", "Action")
            atype = str(action_data.get("type", "BUTTON")).upper()
            a.action_type = atype if atype in _ACTION_TYPES else 'BUTTON'
            ctype = str(action_data.get("controlType", "BUTTON")).upper()
            a.control_type = ctype if ctype in _CONTROL_TYPES else 'BUTTON'

            for binding_data in action_data.get("bindings", []):
                composite = str(binding_data.get("composite") or "").upper()
                if composite in _COMPOSITES:
                    header = a.bindings.add()
                    header.composite = composite
                    parts = binding_data.get("parts", {})
                    for part in _COMPOSITE_PART_ORDER[composite]:
                        if part in parts:
                            row = a.bindings.add()
                            row.part = part.upper()
                            _apply_binding_fields(row, parts[part])
                else:
                    row = a.bindings.add()
                    _apply_binding_fields(row, binding_data)

        m.active_action = 0 if len(m.actions) else -1

    scene.bjs_input_map_active = 0 if len(scene.bjs_input_maps) else -1
    if scene.bjs_input_default_map not in {m.name for m in scene.bjs_input_maps}:
        scene.bjs_input_default_map = (
            scene.bjs_input_maps[0].name if len(scene.bjs_input_maps) else DEFAULT_INPUT_MAP_NAME
        )


class BJS_OT_input_set_default_map(Operator):
    """Mark an Action Map as the scene default (used when a script has no
    @inputMap decorator, or @inputMap with no map name)."""
    bl_idname = "bjs.input_set_default_map"
    bl_label = "Set Default Map"
    bl_options = {'REGISTER', 'UNDO'}

    map_name: StringProperty()

    def execute(self, context):
        context.scene.bjs_input_default_map = self.map_name
        return {'FINISHED'}


class BJS_OT_input_map_edit(Operator):
    """Add or remove an Action Map."""
    bl_idname = "bjs.input_map_edit"
    bl_label = "Edit Action Map"
    bl_options = {'REGISTER', 'UNDO'}

    action: StringProperty()      # "add" or "remove"
    index:  IntProperty(default=-1)

    def execute(self, context):
        scene = context.scene
        maps = scene.bjs_input_maps

        if self.action == "add":
            m = maps.add()
            m.name = f"Map{len(maps)}"
            m.active_action = -1
            scene.bjs_input_map_active = len(maps) - 1
        elif self.action == "remove" and 0 <= self.index < len(maps):
            maps.remove(self.index)
            scene.bjs_input_map_active = min(scene.bjs_input_map_active, len(maps) - 1)
        return {'FINISHED'}


class BJS_OT_input_action_edit(Operator):
    """Add or remove an Action in the selected Action Map."""
    bl_idname = "bjs.input_action_edit"
    bl_label = "Edit Action"
    bl_options = {'REGISTER', 'UNDO'}

    action: StringProperty()      # "add" or "remove"
    index:  IntProperty(default=-1)

    def execute(self, context):
        m = _active_input_map(context.scene)
        if m is None:
            self.report({'WARNING'}, "Select an Action Map first")
            return {'CANCELLED'}

        if self.action == "add":
            a = m.actions.add()
            a.name = f"Action{len(m.actions)}"
            a.active_binding = -1
            m.active_action = len(m.actions) - 1
        elif self.action == "remove" and 0 <= self.index < len(m.actions):
            m.actions.remove(self.index)
            m.active_action = min(m.active_action, len(m.actions) - 1)
        return {'FINISHED'}


class BJS_OT_input_binding_edit(Operator):
    """Add or remove a binding on the selected Action. Adding a composite
    creates its header row plus all of its part rows in one step."""
    bl_idname = "bjs.input_binding_edit"
    bl_label = "Edit Binding"
    bl_options = {'REGISTER', 'UNDO'}

    action: StringProperty()      # "add" or "remove"
    kind:   StringProperty(default="DIRECT")  # add: "DIRECT" | "1DAXIS" | "2DVECTOR"
    index:  IntProperty(default=-1)

    def execute(self, context):
        a = _active_input_action(context.scene)
        if a is None:
            self.report({'WARNING'}, "Select an Action first")
            return {'CANCELLED'}

        if self.action == "add":
            if self.kind in _COMPOSITES:
                header = a.bindings.add()
                header.composite = self.kind
                for part in _COMPOSITE_PART_ORDER[self.kind]:
                    row = a.bindings.add()
                    row.part = part.upper()
            else:
                a.bindings.add()
        elif self.action == "remove" and 0 <= self.index < len(a.bindings):
            # Removing a composite header takes its part rows with it.
            count = 1
            if a.bindings[self.index].composite != 'NONE':
                probe = self.index + 1
                while probe < len(a.bindings) and a.bindings[probe].part != 'NONE':
                    count += 1
                    probe += 1
            for _ in range(count):
                a.bindings.remove(self.index)
        return {'FINISHED'}


# Blender event.type -> the JS KeyboardEvent.key value our Input system stores.
# Keys with awkward literal values (" ", ",") use a friendly alias that
# scene_export._serialize_binding converts at export.
_BLENDER_KEY_TO_JS = {
    'SPACE': "space", 'RET': "enter", 'NUMPAD_ENTER': "enter", 'TAB': "tab",
    'BACK_SPACE': "backspace", 'DEL': "delete",
    'LEFT_ARROW': "arrowleft", 'RIGHT_ARROW': "arrowright",
    'UP_ARROW': "arrowup", 'DOWN_ARROW': "arrowdown",
    'LEFT_SHIFT': "shift", 'RIGHT_SHIFT': "shift",
    'LEFT_CTRL': "control", 'RIGHT_CTRL': "control",
    'LEFT_ALT': "alt", 'RIGHT_ALT': "alt", 'OSKEY': "meta",
    'COMMA': "comma", 'PERIOD': "period", 'SEMI_COLON': "semicolon",
    'QUOTE': "quote", 'ACCENT_GRAVE': "backquote", 'MINUS': "minus",
    'EQUAL': "equals", 'SLASH': "slash", 'BACK_SLASH': "backslash",
    'LEFT_BRACKET': "bracketleft", 'RIGHT_BRACKET': "bracketright",
    'ZERO': "0", 'ONE': "1", 'TWO': "2", 'THREE': "3", 'FOUR': "4",
    'FIVE': "5", 'SIX': "6", 'SEVEN': "7", 'EIGHT': "8", 'NINE': "9",
    'NUMPAD_0': "0", 'NUMPAD_1': "1", 'NUMPAD_2': "2", 'NUMPAD_3': "3",
    'NUMPAD_4': "4", 'NUMPAD_5': "5", 'NUMPAD_6': "6", 'NUMPAD_7': "7",
    'NUMPAD_8': "8", 'NUMPAD_9': "9",
}
_BLENDER_KEY_TO_JS.update({chr(c): chr(c).lower() for c in range(ord('A'), ord('Z') + 1)})
_BLENDER_KEY_TO_JS.update({f"F{n}": f"f{n}" for n in range(1, 13)})


class BJS_OT_input_capture_key(Operator):
    """Modal key capture: click, press a key, and it becomes the binding's
    key (Esc or right-click cancels). Keyboard only — browsers don't let
    Blender see your gamepad, so pad controls stay typed by index."""
    bl_idname = "bjs.input_capture_key"
    bl_label = "Capture Key"
    bl_options = {'REGISTER', 'UNDO'}

    binding_index: IntProperty()

    def invoke(self, context, event):
        context.window_manager.modal_handler_add(self)
        context.workspace.status_text_set("Press a key to bind…  (Esc / right-click cancels)")
        return {'RUNNING_MODAL'}

    def modal(self, context, event):
        if event.type in {'ESC', 'RIGHTMOUSE'}:
            context.workspace.status_text_set(None)
            return {'CANCELLED'}

        if event.value != 'PRESS' or event.type.startswith('MOUSE')                 or event.type in {'INBETWEEN_MOUSEMOVE', 'WHEELUPMOUSE', 'WHEELDOWNMOUSE'}:
            return {'RUNNING_MODAL'}

        js_key = _BLENDER_KEY_TO_JS.get(event.type)
        if js_key is None:
            self.report({'WARNING'}, f"'{event.type}' has no web equivalent — try another key")
            return {'RUNNING_MODAL'}

        a = _active_input_action(context.scene)
        if a is None or not (0 <= self.binding_index < len(a.bindings)):
            context.workspace.status_text_set(None)
            return {'CANCELLED'}

        row = a.bindings[self.binding_index]
        row.device = 'KEYBOARD'
        row.key = js_key
        self.report({'INFO'}, f"Bound '{js_key}'")

        context.workspace.status_text_set(None)
        return {'FINISHED'}


class BJS_OT_input_save_map(Operator):
    """Save the scene's Input Actions as a standalone .inputactions.json asset
    — the shareable source of truth other tools (and the constants generator)
    can read. The export still embeds the asset into the level manifest."""
    bl_idname = "bjs.input_save_map"
    bl_label = "Save Asset (.json)"

    filepath: StringProperty(subtype='FILE_PATH')
    filter_glob: StringProperty(default="*.json", options={'HIDDEN'})

    def invoke(self, context, event):
        if not self.filepath:
            self.filepath = "input.inputactions.json"
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        import json
        from .scene_export import _serialize_input_asset
        data = _serialize_input_asset(context.scene)
        if data is None:
            self.report({'WARNING'}, "Input Actions are empty — nothing to save")
            return {'CANCELLED'}
        with open(self.filepath, "w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2)
        self.report({'INFO'}, f"Saved input asset: {self.filepath}")
        return {'FINISHED'}


class BJS_OT_input_load_map(Operator):
    """Load an .inputactions.json asset into the scene's Input Actions
    (replacing the current maps) — share one asset across scenes/projects."""
    bl_idname = "bjs.input_load_map"
    bl_label = "Load Asset (.json)"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype='FILE_PATH')
    filter_glob: StringProperty(default="*.json", options={'HIDDEN'})

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        import json
        try:
            with open(self.filepath, "r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (OSError, json.JSONDecodeError) as error:
            self.report({'ERROR'}, f"Couldn't load asset: {error}")
            return {'CANCELLED'}

        if not isinstance(data, dict) or "maps" not in data:
            self.report({'ERROR'}, "Not an Input Actions asset (no \"maps\" block)")
            return {'CANCELLED'}

        _apply_input_asset(context.scene, data)
        self.report({'INFO'}, f"Loaded input asset: {self.filepath}")
        return {'FINISHED'}


class BJS_OT_input_load_defaults(Operator):
    """Seed the Input Actions with the engine's built-in asset (a "Player" map
    with Move/Look/Jump/Interact/Sprint/Crouch), so customizing starts from a
    complete, working setup."""
    bl_idname = "bjs.input_load_defaults"
    bl_label = "Load Default Asset"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        _apply_input_asset(context.scene, DEFAULT_INPUT_ASSET)
        context.scene.bjs_input_default_map = DEFAULT_INPUT_MAP_NAME
        self.report({'INFO'}, "Loaded the default input asset")
        return {'FINISHED'}


class BJS_OT_input_sync_scripts(Operator):
    """Scan every Script component's source for @inputMap("Name") and create
    any Action Map the scripts reference that doesn't exist yet."""
    bl_idname = "bjs.input_sync_scripts"
    bl_label = "Create Maps Used by Scripts"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        scene = context.scene
        existing = {m.name for m in scene.bjs_input_maps}
        created = []

        for obj in scene.objects:
            for comp in obj.bjs_components:
                if comp.comp_type != 'SCRIPT' or not comp.script_path:
                    continue
                path = bpy.path.abspath(comp.script_path)
                for ref in script_parse.parse_input_maps(path):
                    name = ref["map"]
                    if name and name not in existing:
                        m = scene.bjs_input_maps.add()
                        m.name = name
                        m.active_action = -1
                        existing.add(name)
                        created.append(name)

        if created:
            scene.bjs_input_map_active = len(scene.bjs_input_maps) - 1
            self.report({'INFO'}, f"Created map(s): {', '.join(created)}")
        else:
            self.report({'INFO'}, "All @inputMap references already have maps")
        return {'FINISHED'}


classes = (
    BJS_OT_input_set_default_map,
    BJS_OT_input_map_edit,
    BJS_OT_input_action_edit,
    BJS_OT_input_binding_edit,
    BJS_OT_input_capture_key,
    BJS_OT_input_save_map,
    BJS_OT_input_load_map,
    BJS_OT_input_load_defaults,
    BJS_OT_input_sync_scripts,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
