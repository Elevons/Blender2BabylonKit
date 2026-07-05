"""Right-click menu entries that reset NME parameters/gradients from the JSON.

Blender's built-in "Reset to Default Value" resets to the PropertyGroup
declaration defaults (0 / black) — it cannot know about the NME JSON. These
entries appear in the same right-click menu and reload the authored JSON value.
"""

import bpy

from ..materials.properties import BJSNmeInput


def _find_gradient_for_pointer(button_pointer):
    """Map a clicked ColorRamp / ColorRampElement / Texture back to its material and row."""
    is_texture = isinstance(button_pointer, bpy.types.Texture)
    pointer_value = button_pointer.as_pointer()

    for material in bpy.data.materials:
        for row in material.bjs_nme_gradients:
            texture = row.ramp_texture
            if texture is None:
                continue
            if is_texture:
                if texture == button_pointer:
                    return material, row
                continue

            ramp = texture.color_ramp
            if ramp.as_pointer() == pointer_value:
                return material, row
            for element in ramp.elements:
                if element.as_pointer() == pointer_value:
                    return material, row

    return None, None


def _draw_nme_reset_menu(self, context):
    """Append reset-from-JSON entries when right-clicking NME-owned widgets."""
    button_pointer = getattr(context, "button_pointer", None)
    if button_pointer is None:
        return

    layout = self.layout

    if isinstance(button_pointer, BJSNmeInput):
        material = button_pointer.id_data
        if material is None or not button_pointer.block_id:
            return
        layout.separator()
        op = layout.operator("bjs.nme_input_reset", icon='FILE_REFRESH')
        op.material_name = material.name
        op.block_id = button_pointer.block_id
        return

    if isinstance(
        button_pointer,
        (bpy.types.ColorRamp, bpy.types.ColorRampElement, bpy.types.Texture),
    ):
        material, row = _find_gradient_for_pointer(button_pointer)
        if material is None or row is None or not row.block_id:
            return
        layout.separator()
        op = layout.operator("bjs.nme_gradient_reset", icon='FILE_REFRESH')
        op.material_name = material.name
        op.block_id = row.block_id


def register():
    bpy.types.UI_MT_button_context_menu.append(_draw_nme_reset_menu)


def unregister():
    bpy.types.UI_MT_button_context_menu.remove(_draw_nme_reset_menu)
