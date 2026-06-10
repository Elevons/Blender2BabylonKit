"""UI: a 'Babylon' tab in the 3D viewport N-panel.

Press N in the viewport, then open the Babylon tab. The panel shows the
component stack for the active object plus the export button.
"""

import bpy
from bpy.types import Panel, Menu

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
    hdr, panel = layout.panel_prop(comp, "show_expanded")
    hdr.prop(comp, "enabled", text="")
    label = comp.comp_type.replace('_', ' ').title()
    if comp.comp_type == 'TAG' and comp.tag:
        label = f"Tag: {comp.tag}"
    elif comp.comp_type == 'CONSTRAINT':
        target_name = comp.con_target.name if comp.con_target else "?"
        label = f"Constraint: {comp.con_type.title()} -> {target_name}"
    elif comp.comp_type == 'AUDIO' and comp.audio_file:
        import os as _os
        label = f"Audio: {_os.path.basename(comp.audio_file)}"
    elif comp.comp_type == 'SCRIPT' and comp.script_name:
        label = f"Script: {comp.script_name}"
    elif comp.comp_type == 'CAMERA':
        label = f"Camera: {comp.cam_type.title()}"
    hdr.label(text=label)
    n = len(obj.bjs_components)
    up = hdr.row(align=True)
    up.enabled = index > 0
    op = up.operator("bjs.move_component", text="", icon='TRIA_UP', emboss=False)
    op.index = index
    op.direction = 'UP'
    down = hdr.row(align=True)
    down.enabled = index < n - 1
    op = down.operator("bjs.move_component", text="", icon='TRIA_DOWN', emboss=False)
    op.index = index
    op.direction = 'DOWN'
    menu = hdr.operator("bjs.component_menu", text="", icon='DOWNARROW_HLT', emboss=False)
    menu.index = index

    if panel is None:
        return

    body = panel.column()
    body.active = comp.enabled
    body.use_property_split = True
    body.use_property_decorate = False

    if comp.comp_type == 'TAG':
        body.prop(comp, "tag")

    elif comp.comp_type == 'COLLIDER':
        body.prop(comp, "collider_shape")
        body.prop(comp, "is_trigger")
        body.prop(comp, "collider_show")
        body.prop(comp, "auto_fit")
        fit = body.operator("bjs.fit_collider", text="Fit to Bounds", icon='SHADING_BBOX')
        fit.index = index
        if not comp.auto_fit:
            shape = comp.collider_shape
            if shape in {'BOX', 'CONVEX', 'MESH'}:
                body.prop(comp, "collider_size")
            if shape in {'SPHERE', 'CAPSULE', 'CYLINDER'}:
                body.prop(comp, "collider_radius")
            if shape in {'CAPSULE', 'CYLINDER'}:
                body.prop(comp, "collider_height")
            body.prop(comp, "collider_center")
            body.prop(comp, "collider_rotation")

        if comp.is_trigger:
            box = body.box()
            header = box.row()
            header.label(text="On Enter Events", icon='OUTLINER_OB_FORCE_FIELD')
            add = header.operator("bjs.trigger_event_add", text="", icon='ADD')
            add.comp_index = index
            for ev_i, ev in enumerate(comp.trigger_events):
                row = box.row(align=True)
                row.prop(ev, "target", text="")
                row.prop(ev, "message", text="")
                row.prop(ev, "filter_tag", text="", icon='COLOR')
                rem = row.operator("bjs.trigger_event_remove", text="", icon='X')
                rem.comp_index = index
                rem.event_index = ev_i
            if len(comp.trigger_events) == 0:
                box.label(text="On enter: send Message to Target", icon='INFO')

    elif comp.comp_type == 'RIGIDBODY':
        body.prop(comp, "body_type")
        col = body.column()
        col.enabled = comp.body_type == 'DYNAMIC'
        col.prop(comp, "mass")
        body.prop(comp, "friction")
        body.prop(comp, "restitution")
        body.prop(comp, "linear_damping")
        body.prop(comp, "angular_damping")

    elif comp.comp_type == 'AUDIO':
        body.prop(comp, "audio_file")
        body.prop(comp, "audio_volume", slider=True)
        row = body.row(align=True)
        row.prop(comp, "audio_loop")
        row.prop(comp, "audio_autoplay")
        body.prop(comp, "audio_spatial")
        if comp.audio_spatial:
            body.prop(comp, "audio_max_distance")
        body.prop(comp, "audio_rate")

    elif comp.comp_type == 'CONSTRAINT':
        body.prop(comp, "con_type")
        body.prop(comp, "con_target")
        body.prop(comp, "con_pivot")
        if comp.con_type in {'HINGE', 'SLIDER', 'SPRING'}:
            body.prop(comp, "con_axis")
        body.prop(comp, "con_collision")

        if comp.con_type in {'HINGE', 'SLIDER'}:
            body.prop(comp, "con_use_limits")
            if comp.con_use_limits:
                row = body.row(align=True)
                row.prop(comp, "con_min")
                row.prop(comp, "con_max")
            body.prop(comp, "con_motor")
            if comp.con_motor:
                body.prop(comp, "con_motor_speed")
                body.prop(comp, "con_motor_force")

        if comp.con_type == 'SPRING':
            row = body.row(align=True)
            row.prop(comp, "con_min")
            row.prop(comp, "con_max")
            body.prop(comp, "con_stiffness")
            body.prop(comp, "con_damping")

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
            vbox = body.box()
            vhdr = vbox.row(align=True)
            vhdr.label(text="Variables", icon='PRESET')
            sync = vhdr.operator("bjs.sync_vars", text="", icon='FILE_REFRESH')
            sync.comp_index = index
            if len(comp.exposed_vars) == 0:
                vbox.label(text="No @exposed variables found")
            for vi, v in enumerate(comp.exposed_vars):
                _draw_var(vbox, index, vi, v)

    elif comp.comp_type == 'CAMERA':
        if obj.type != 'CAMERA':
            body.label(text="Only affects Camera objects", icon='INFO')
        body.prop(comp, "cam_type")
        body.prop(comp, "cam_attach_control")
        t = comp.cam_type
        if t in {'FREE', 'UNIVERSAL'}:
            body.prop(comp, "cam_speed")
            body.prop(comp, "cam_inertia")
        elif t == 'ARC':
            body.prop(comp, "cam_target", text="Orbit Target")
            body.prop(comp, "cam_radius")
            body.prop(comp, "cam_lower_radius")
            body.prop(comp, "cam_upper_radius")
        elif t == 'FOLLOW':
            body.prop(comp, "cam_target")
            body.prop(comp, "cam_follow_mode")
            if comp.cam_follow_mode == 'OFFSET':
                body.label(text="Follows at the camera's offset from the target",
                           icon='INFO')
            else:
                body.prop(comp, "cam_use_blender_transform")
                if not comp.cam_use_blender_transform:
                    body.prop(comp, "cam_distance")
                    body.prop(comp, "cam_height")
                    body.prop(comp, "cam_rotation_offset")
        # Key bindings: only for keyboard-driven types, when controls are attached.
        if comp.cam_attach_control and t in {'FREE', 'UNIVERSAL', 'ARC'}:
            kbox = body.box()
            kbox.prop(comp, "cam_key_scheme")
            if comp.cam_key_scheme == 'CUSTOM':
                r1 = kbox.row(align=True)
                r1.prop(comp, "cam_key_up")
                r1.prop(comp, "cam_key_down")
                r2 = kbox.row(align=True)
                r2.prop(comp, "cam_key_left")
                r2.prop(comp, "cam_key_right")


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


def _draw_animation(layout, obj):
    ad = obj.animation_data
    strips = []
    if ad and ad.nla_tracks:
        for track in ad.nla_tracks:
            for strip in track.strips:
                strips.append(strip)
    if not strips:
        return

    a = obj.bjs_animation
    box = layout.box()
    box.label(text="Animation", icon='ANIM')
    col = box.column()
    col.use_property_split = True
    col.prop(a, "auto_play")
    if a.auto_play:
        col.prop(a, "default_clip")
        col.prop(a, "loop")
        col.prop(a, "speed")
    box.label(text="NLA clips (exported):")
    for s in strips:
        box.label(text=f"   {s.name}   [{int(s.frame_start)}-{int(s.frame_end)}]",
                  icon='ACTION')


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


class BJS_MT_component_menu(Menu):
    """Per-component actions (opened from the header dropdown)."""
    bl_idname = "BJS_MT_component_menu"
    bl_label = "Component"

    def draw(self, context):
        layout = self.layout
        obj = context.object
        idx = obj.bjs_components_index if obj else 0
        n = len(obj.bjs_components) if obj else 0

        dup = layout.operator("bjs.duplicate_component", text="Duplicate", icon='DUPLICATE')
        dup.index = idx

        layout.separator()
        layout.operator("bjs.copy_component", text="Copy", icon='COPYDOWN').index = idx
        layout.operator("bjs.cut_component", text="Cut", icon='X').index = idx
        layout.operator("bjs.paste_component", text="Paste", icon='PASTEDOWN')

        layout.separator()
        row = layout.row()
        row.enabled = idx > 0
        up = row.operator("bjs.move_component", text="Move Up", icon='TRIA_UP')
        up.index = idx
        up.direction = 'UP'

        row = layout.row()
        row.enabled = idx < n - 1
        down = row.operator("bjs.move_component", text="Move Down", icon='TRIA_DOWN')
        down.index = idx
        down.direction = 'DOWN'

        layout.separator()
        rm = layout.operator("bjs.remove_component", text="Delete", icon='TRASH')
        rm.index = idx


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

        _draw_animation(layout, obj)

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

        layout.separator()
        scene = context.scene
        link_row = layout.row(align=True)
        link_row.prop(scene, "bjs_live_link", text="Live Link (re-export on save)",
                      icon='FILE_REFRESH')
        if scene.bjs_live_link:
            if scene.bjs_live_link_path:
                layout.label(text=bpy.path.basename(scene.bjs_live_link_path),
                             icon='FILE_TICK')
            else:
                layout.label(text="Export once to set the path", icon='ERROR')

        layout.prop(scene, "bjs_debug_build", text="Debug Build", icon='TOOL_SETTINGS')

        layout.operator("bjs.validate_scene", text="Validate", icon='CHECKMARK')


classes = (
    BJS_MT_component_menu,
    BJS_PT_components,
    BJS_PT_export,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)


def unregister():
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
