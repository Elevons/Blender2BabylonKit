"""Material Properties › Babylon — node material overrides on the Material datablock."""

import bpy
from bpy.types import Panel

from ..materials.nme_scan import enumerate_nme_texture_slots


def _material_user_count(mat):
    count = 0
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            if slot.material == mat:
                count += 1
                break
    return count


def _slot_needs_file(tex_row, nme_file):
    if not nme_file:
        return False
    slots = enumerate_nme_texture_slots(nme_file)
    by_id = {slot["block_id"]: slot for slot in slots}
    info = by_id.get(tex_row.block_id)
    if info is not None:
        return info["needs_file"]
    return not tex_row.image_file


def draw_babylon_material(layout, mat):
    """Shared draw routine for the material's Babylon / NME settings."""
    users = _material_user_count(mat)
    if users > 0:
        layout.label(
            text=f"Used by {users} mesh object{'s' if users != 1 else ''}",
            icon='OBJECT_DATA',
        )
    else:
        layout.label(text="Not assigned to any mesh", icon='INFO')

    layout.prop(mat, "bjs_nme_file", text="Node Material JSON")

    row = layout.row(align=True)
    scan = row.operator("bjs.scan_nme_textures", text="Scan Textures", icon='FILE_REFRESH')
    scan.material_name = mat.name
    if mat.bjs_nme_file:
        launch = row.operator("bjs.open_launcher_nme", text="Open in Launcher", icon='WORLD')
        launch.material_name = mat.name

    if not mat.bjs_nme_file:
        layout.label(text="Pick an NME JSON, then Scan Textures", icon='INFO')
        return

    box = layout.box()
    header = box.row()
    header.label(text="Textures", icon='TEXTURE')
    add = header.operator("bjs.nme_texture_add", text="", icon='ADD')
    add.material_name = mat.name

    if len(mat.bjs_nme_textures) == 0:
        box.label(
            text="Scan Textures to list slots from the JSON",
            icon='INFO',
        )
        return

    for tex_i, tex in enumerate(mat.bjs_nme_textures):
        col = box.column(align=True)
        needs = _slot_needs_file(tex, mat.bjs_nme_file)
        label = tex.block_type or "Texture"
        if tex.block_name:
            label = f"{label} · {tex.block_name}"
        if tex.block_id:
            label = f"{label} (id {tex.block_id})"
        row = col.row()
        row.label(
            text=label,
            icon='ERROR' if needs and not tex.image_file else 'TEXTURE',
        )
        if tex.match_url:
            col.label(text=f"JSON URL: {tex.match_url}", icon='LINKED')
        col.prop(tex, "image_file", text="Image")
        col.prop(tex, "json_url", text="URL in JSON")
        rem = col.row()
        op = rem.operator("bjs.nme_texture_remove", text="Remove", icon='X')
        op.material_name = mat.name
        op.texture_index = tex_i


class BJS_PT_material(Panel):
    """Node Material Editor JSON and texture overrides on this Material."""
    bl_label = "Babylon"
    bl_idname = "BJS_PT_material"
    bl_space_type = 'PROPERTIES'
    bl_region_type = 'WINDOW'
    bl_context = 'material'

    @classmethod
    def poll(cls, context):
        return context.material is not None

    def draw(self, context):
        draw_babylon_material(self.layout, context.material)


classes = (
    BJS_PT_material,
)
