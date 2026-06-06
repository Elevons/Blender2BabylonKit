"""UI: a 'Babylon' tab in the 3D viewport N-panel.

Press N in the viewport, then open the Babylon tab. The panel shows the
component stack for the active object plus the export button.
"""

import bpy
from bpy.types import Panel

from .properties import LIST_ELEM_SLOT


def _draw_var(layout, comp_index, var_index, v):
    label = v.label or v.name

    if v.vtype == 'ENUM':
        layout.prop(v, "e_val", text=label)
        return

    if v.vtype == 'LIST':
        lbox = layout.box()
        hdr = lbox.row(align=True)
        hdr.label(text=f"{label}  ·  {v.elem_type.title()}[]")
        add = hdr.operator("bjs.list_add", text="", icon='ADD')
        add.comp_index = comp_index
        add.var_index = var_index
        slot = LIST_ELEM_SLOT.get(v.elem_type, "f_val")
        if len(v.list_items) == 0:
            lbox.label(text="(empty)")
        for i, item in enumerate(v.list_items):
            r = lbox.row(align=True)
            r.prop(item, slot, text="")
            rm = r.operator("bjs.list_remove", text="", icon='X')
            rm.comp_index = comp_index
            rm.var_index = var_index
            rm.item_index = i
        return

    slot = {
        'FLOAT': "f_val", 'BOOL': "b_val", 'STRING': "s_val",
        'VECTOR3': "v_val", 'COLOR': "c_val", 'ENTITY': "obj_val",
    }.get(v.vtype, "f_val")
    layout.prop(v, slot, text=label)


def _draw_component(layout, obj, index, comp):
    box = layout.box()
    header = box.row(align=True)
    header.prop(comp, "enabled", text="")
    label = comp.comp_type.replace('_', ' ').title()
    if comp.comp_type == 'TAG' and comp.tag:
        label = f"Tag: {comp.tag}"
    elif comp.comp_type == 'SCRIPT' and comp.script_name:
        label = f"Script: {comp.script_name}"
    header.label(text=label)
    rm = header.operator("bjs.remove_component", text="", icon='X')
    rm.index = index

    if not comp.enabled:
        return

    body = box.column()
    body.use_property_split = True
    body.use_property_decorate = False

    if comp.comp_type == 'TAG':
        body.prop(comp, "tag")

    elif comp.comp_type == 'COLLIDER':
        body.prop(comp, "collider_shape")
        body.prop(comp, "is_trigger")
        body.prop(comp, "auto_fit")
        if not comp.auto_fit:
            shape = comp.collider_shape
            if shape in {'BOX', 'CONVEX', 'MESH'}:
                body.prop(comp, "collider_size")
            if shape in {'SPHERE', 'CAPSULE', 'CYLINDER'}:
                body.prop(comp, "collider_radius")
            if shape in {'CAPSULE', 'CYLINDER'}:
                body.prop(comp, "collider_height")
            body.prop(comp, "collider_center")

    elif comp.comp_type == 'RIGIDBODY':
        body.prop(comp, "body_type")
        col = body.column()
        col.enabled = comp.body_type == 'DYNAMIC'
        col.prop(comp, "mass")
        body.prop(comp, "friction")
        body.prop(comp, "restitution")
        body.prop(comp, "linear_damping")
        body.prop(comp, "angular_damping")

    elif comp.comp_type == 'SCRIPT':
        pick_row = body.row(align=True)
        op = pick_row.operator("bjs.pick_script", text="Open Script…", icon='FILEBROWSER')
        op.comp_index = index
        if comp.script_path:
            fname = bpy.path.basename(comp.script_path) or comp.script_path
            pick_row.label(text=fname, icon='FILE_SCRIPT')
        else:
            pick_row.label(text="no file selected")

        if comp.script_path:
            vbox = box.box()
            hdr = vbox.row(align=True)
            hdr.label(text="Variables", icon='PRESET')
            sync = hdr.operator("bjs.sync_vars", text="", icon='FILE_REFRESH')
            sync.comp_index = index
            if len(comp.exposed_vars) == 0:
                vbox.label(text="No @exposed variables found")
            for vi, v in enumerate(comp.exposed_vars):
                _draw_var(vbox, index, vi, v)


def _draw_light_info(layout, obj):
    lamp = obj.data
    box = layout.box()
    box.label(text=f"Babylon Light · {lamp.type.title()}", icon='LIGHT')

    if lamp.type == 'AREA':
        box.label(text="Area lights aren't supported by glTF", icon='ERROR')
        box.label(text="Use Point, Sun, or Spot instead")
        return

    col = box.column()
    col.use_property_split = True
    col.prop(lamp, "color")
    col.prop(lamp, "energy")
    if lamp.type == 'SPOT':
        col.prop(lamp, "spot_size")
        col.prop(lamp, "spot_blend")
    if lamp.type in {'POINT', 'SPOT'}:
        col.prop(lamp, "use_custom_distance", text="Custom Range")
        if lamp.use_custom_distance:
            col.prop(lamp, "cutoff_distance", text="Range")
    col.prop(lamp, "use_shadow", text="Cast Shadows")
    if lamp.use_shadow:
        sh = obj.bjs_shadow
        sbox = box.box()
        sbox.label(text="Shadow (Babylon)", icon='MOD_OPACITY')
        sc = sbox.column()
        sc.use_property_split = True
        sc.prop(sh, "filter")
        sc.prop(sh, "map_size")
        sc.prop(sh, "bias")
        sc.prop(sh, "normal_bias")
        sc.prop(sh, "darkness")
        sc.prop(sh, "min_z")
        sc.prop(sh, "max_z")
    box.label(text="Exported automatically — no component needed", icon='INFO')


def _draw_camera_info(layout, obj, context):
    cam = obj.data
    box = layout.box()
    box.label(text=f"Babylon Camera · {cam.type.title()}", icon='CAMERA_DATA')
    if obj == context.scene.camera:
        box.label(text="Scene's active camera", icon='CHECKMARK')
    col = box.column()
    col.use_property_split = True
    if cam.type == 'ORTHO':
        col.prop(cam, "ortho_scale")
    else:
        col.prop(cam, "lens")
    col.prop(cam, "clip_start")
    col.prop(cam, "clip_end")
    box.label(text="Exported automatically — no component needed", icon='INFO')


class BJS_PT_components(Panel):
    bl_label = "Components"
    bl_idname = "BJS_PT_components"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon"

    def draw(self, context):
        layout = self.layout
        obj = context.object
        if obj is None:
            layout.label(text="Select an object", icon='INFO')
            return

        layout.label(text=obj.name, icon='OBJECT_DATA')

        obj_id = obj.get("bjs_id")
        id_row = layout.row(align=True)
        if obj_id:
            id_row.label(text=f"GUID: {obj_id[:8]}…", icon='COPY_ID')
        else:
            id_row.label(text="GUID: unassigned", icon='COPY_ID')
            id_row.operator("bjs.assign_id", text="Assign")

        layout.operator_menu_enum("bjs.add_component", "comp_type",
                                  text="Add Component", icon='ADD')

        if obj.type == 'LIGHT':
            _draw_light_info(layout, obj)
        elif obj.type == 'CAMERA':
            _draw_camera_info(layout, obj, context)

        if len(obj.bjs_components) == 0:
            layout.label(text="No components", icon='DOT')
            return
        for i, comp in enumerate(obj.bjs_components):
            _draw_component(layout, obj, i, comp)


class BJS_PT_export(Panel):
    bl_label = "Export"
    bl_idname = "BJS_PT_export"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon"

    def draw(self, context):
        layout = self.layout
        layout.operator("bjs.export_scene", text="Export Level", icon='EXPORT')
        layout.label(text="Writes .glb + .scene.json", icon='INFO')


classes = (
    BJS_PT_components,
    BJS_PT_export,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
