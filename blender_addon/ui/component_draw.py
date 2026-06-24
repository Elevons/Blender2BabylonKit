"""Shared draw code for the component stack (the Unity-style inspector).

Panel classes live in view3d_panels.py; this module only knows how to draw a
single component (header + body) and its sub-widgets, so any panel can host
the same inspector without drifting copies.
"""

import os

import bpy

from ..components.constants import (
    LIST_ELEM_SLOT, GUI3D_CONTROLS, GUI3D_PANELS, GUI3D_TEXTURED,
    CONSTRAINT_DOF_LABELS,
)
from ..components.component import ensure_custom_constraint_axes


def _draw_var(layout, comp_index, var_index, v):
    label = v.label or v.name

    if v.vtype == 'ENUM':
        layout.prop(v, "e_val", text=label)
        return

    if v.vtype == 'LIST':
        lbox = layout.box()
        hdr = lbox.row(align=True)
        hdr.use_property_split = False
        # Per-list collapse arrow — independent of the component's collapse.
        hdr.prop(v, "show_expanded", text="",
                 icon='TRIA_DOWN' if v.show_expanded else 'TRIA_RIGHT', emboss=False)
        hdr.label(text=f"{label}  ·  {v.elem_type.title()}[]")
        if not v.show_expanded:
            hdr.label(text=f"{len(v.list_items)} item(s)")
            return
        # Type a length directly instead of clicking + repeatedly.
        hdr.prop(v, "list_count", text="")
        if v.elem_type == 'ENTITY':
            sel = hdr.operator("bjs.list_add_selected", text="", icon='RESTRICT_SELECT_OFF')
            sel.comp_index = comp_index
            sel.var_index = var_index
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


def _draw_particle_textures(body, comp, index):
    """Texture images copied on export and patched into the particle JSON."""
    box = body.box()
    header = box.row()
    header.label(text="Particle Textures", icon='TEXTURE')
    add = header.operator("bjs.particle_texture_add", text="", icon='ADD')
    add.comp_index = index
    for tex_i, tex in enumerate(comp.particle_textures):
        col = box.column(align=True)
        col.prop(tex, "image_file", text="Image")
        col.prop(tex, "json_url", text="URL in JSON")
        col.prop(tex, "match_url", text="Replace URL")
        rem = col.row()
        op = rem.operator("bjs.particle_texture_remove", text="Remove", icon='X')
        op.comp_index = index
        op.particle_texture_index = tex_i
    if len(comp.particle_textures) == 0:
        box.label(
            text="Optional: copy images to particles/ and set the JSON URL",
            icon='INFO',
        )


def _draw_click_events(body, comp, index):
    """The On Click events box for 3D GUI controls (mirrors trigger events)."""
    box = body.box()
    header = box.row()
    header.label(text="On Click Events", icon='RESTRICT_SELECT_OFF')
    add = header.operator("bjs.gui3d_event_add", text="", icon='ADD')
    add.comp_index = index
    for ev_i, ev in enumerate(comp.gui3d_events):
        row = box.row(align=True)
        row.prop(ev, "target", text="")
        row.prop(ev, "message", text="")
        rem = row.operator("bjs.gui3d_event_remove", text="", icon='X')
        rem.comp_index = index
        rem.event_index = ev_i
    if len(comp.gui3d_events) == 0:
        box.label(text="On click: send Message to Target", icon='INFO')


def count_enabled_colliders(obj):
    """How many enabled COLLIDER components are on this object."""
    return sum(1 for c in obj.bjs_components if c.enabled and c.comp_type == 'COLLIDER')


def _component_label(comp, obj=None, index=None):
    """The collapsed-header label: type name, enriched with the key detail."""
    label = comp.comp_type.replace('_', ' ').title()
    if comp.comp_type == 'TAG' and comp.tag:
        label = f"Tag: {comp.tag}"
    elif comp.comp_type == 'CONSTRAINT':
        target_name = comp.con_target.name if comp.con_target else "?"
        label = f"Constraint: {comp.con_type.title()} -> {target_name}"
    elif comp.comp_type == 'AUDIO' and comp.audio_file:
        label = f"Audio: {os.path.basename(comp.audio_file)}"
    elif comp.comp_type == 'GUI' and comp.gui_file:
        label = f"GUI: {os.path.basename(comp.gui_file)}"
    elif comp.comp_type == 'PARTICLE' and comp.particle_file:
        label = f"Particles: {os.path.basename(comp.particle_file)}"
    elif comp.comp_type == 'MSDF_TEXT' and comp.msdf_text:
        label = f"MSDF Text: {comp.msdf_text[:32]}"
    elif comp.comp_type in GUI3D_TEXTURED and comp.gui3d_text:
        kind = {'GUI3D_BUTTON': "3D Button", 'GUI3D_HOLO': "3D Holo Button",
                'GUI3D_TOUCH_HOLO': "3D Touch Button"}[comp.comp_type]
        label = f"{kind}: {comp.gui3d_text}"
    elif comp.comp_type == 'SCRIPT' and comp.script_name:
        label = f"Script: {comp.script_name}"
    elif comp.comp_type == 'CAMERA':
        label = f"Camera: {comp.cam_type.title()}"
    elif comp.comp_type == 'COLLIDER' and obj is not None and index is not None:
        collider_indices = [
            i for i, c in enumerate(obj.bjs_components)
            if c.enabled and c.comp_type == 'COLLIDER'
        ]
        if len(collider_indices) > 1 and index in collider_indices:
            n = collider_indices.index(index) + 1
            label = f"Collider {n}/{len(collider_indices)}"
    return label


def draw_component(layout, obj, index, comp):
    """One component: collapsible header (enable toggle, label, reorder, menu)
    plus the per-type body."""
    hdr, panel = layout.panel_prop(comp, "show_expanded")
    hdr.prop(comp, "enabled", text="")
    hdr.label(text=_component_label(comp, obj, index))
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
        if count_enabled_colliders(obj) > 1:
            info = body.box()
            info.label(text="Part of a compound body", icon='MOD_PHYSICS')
            info.label(text="Shapes combine at runtime; use manual center/size per collider")
        body.prop(comp, "collider_shape")
        body.prop(comp, "is_trigger")
        body.prop(comp, "collider_show")
        body.prop(comp, "auto_fit")
        body.prop(comp, "collider_apply_scale")
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
        body.prop(comp, "cog_show")
        col = body.column()
        col.enabled = comp.body_type == 'DYNAMIC'
        col.prop(comp, "mass")
        body.prop(comp, "friction")
        body.prop(comp, "restitution")
        body.prop(comp, "linear_damping")
        body.prop(comp, "angular_damping")
        row = body.row()
        row.enabled = comp.body_type == 'DYNAMIC'
        row.prop(comp, "start_asleep")
        dyn = body.column()
        dyn.enabled = comp.body_type == 'DYNAMIC'
        dyn.prop(comp, "cog_auto_fit")
        fit_cog = dyn.operator("bjs.fit_cog", text="Fit CoM to Bounds", icon='SHADING_BBOX')
        fit_cog.index = index
        if not comp.cog_auto_fit:
            dyn.prop(comp, "cog_center")

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

    elif comp.comp_type == 'GUI':
        body.prop(comp, "gui_file")
        row = body.row(align=True)
        op = row.operator("bjs.open_launcher_gui", text="Open in Launcher", icon='WORLD')
        op.comp_index = index
        body.prop(comp, "gui_mode")
        if comp.gui_mode == 'FULLSCREEN':
            body.prop(comp, "gui_foreground")
        else:
            if obj.type != 'MESH':
                body.label(text="On-Mesh mode needs a mesh object", icon='INFO')
            body.prop(comp, "gui_width")
            body.prop(comp, "gui_height")

    elif comp.comp_type == 'PARTICLE':
        body.prop(comp, "particle_file")
        row = body.row(align=True)
        op = row.operator("bjs.open_launcher_particle", text="Open in Launcher", icon='WORLD')
        op.comp_index = index
        body.prop(comp, "particle_attach")
        body.prop(comp, "particle_autostart")
        body.prop(comp, "particle_gpu")
        body.prop(comp, "particle_capacity")
        _draw_particle_textures(body, comp, index)

    elif comp.comp_type == 'MSDF_TEXT':
        body.prop(comp, "msdf_text")
        body.prop(comp, "msdf_font_json")
        body.prop(comp, "msdf_font_texture")
        body.prop(comp, "msdf_color")
        body.prop(comp, "msdf_thickness", slider=True)
        row = body.row(align=True)
        row.prop(comp, "msdf_billboard")
        row.prop(comp, "msdf_billboard_screen")
        body.prop(comp, "msdf_ignore_depth")
        body.prop(comp, "msdf_stroke_color")
        row = body.row(align=True)
        row.prop(comp, "msdf_stroke_inset")
        row.prop(comp, "msdf_stroke_outset")
        body.prop(comp, "msdf_text_align")
        row = body.row(align=True)
        row.prop(comp, "msdf_max_width")
        row.prop(comp, "msdf_line_height")
        body.prop(comp, "msdf_letter_spacing")

    elif comp.comp_type in GUI3D_CONTROLS:
        if comp.comp_type in GUI3D_TEXTURED:
            body.prop(comp, "gui3d_text")
            body.prop(comp, "gui3d_image")
            if comp.comp_type in {'GUI3D_HOLO', 'GUI3D_TOUCH_HOLO'}:
                body.prop(comp, "gui3d_tooltip")
            if comp.comp_type == 'GUI3D_BUTTON':
                body.prop(comp, "gui3d_content_resolution")
        else:  # GUI3D_MESH — the object's own mesh is the visual
            if obj.type != 'MESH':
                body.label(text="Needs a mesh object to wrap", icon='ERROR')
            else:
                body.label(text="This mesh becomes the clickable control", icon='INFO')
        if obj.parent is not None and any(
                c.comp_type in GUI3D_PANELS for c in obj.parent.bjs_components):
            body.label(text="Laid out by the parent panel", icon='CON_CHILDOF')
        _draw_click_events(body, comp, index)

    elif comp.comp_type in GUI3D_PANELS:
        body.prop(comp, "gui3d_margin")
        if comp.comp_type == 'GUI3D_STACK':
            body.prop(comp, "gui3d_vertical")
        else:
            row = body.row(align=True)
            row.prop(comp, "gui3d_columns")
            row.prop(comp, "gui3d_rows")
        if comp.comp_type in {'GUI3D_SPHERE', 'GUI3D_CYLINDER'}:
            body.prop(comp, "gui3d_radius")
        if comp.comp_type == 'GUI3D_SCATTER':
            body.prop(comp, "gui3d_iterations")
        child_buttons = sum(
            1 for child in obj.children
            for c in child.bjs_components if c.comp_type in GUI3D_CONTROLS)
        if child_buttons == 0:
            body.label(text="Parent 3D button objects under this one", icon='INFO')
        else:
            body.label(text=f"{child_buttons} child control(s)", icon='CON_CHILDOF')

    elif comp.comp_type == 'CONSTRAINT':
        body.prop(comp, "con_type")
        body.prop(comp, "con_target")
        body.prop(comp, "con_pivot")
        body.prop(comp, "con_apply_scale")
        if comp.con_type in {'HINGE', 'SLIDER', 'SPRING', 'CUSTOM'}:
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

        if comp.con_type == 'CUSTOM':
            ensure_custom_constraint_axes(comp)
            box = body.box()
            box.label(text="6DoF Axes (frame X = Axis above)", icon='CONSTRAINT')
            for row_data in comp.con_custom_axes:
                row_box = box.box()
                header = row_box.row(align=True)
                header.label(text=CONSTRAINT_DOF_LABELS.get(row_data.dof_axis, row_data.dof_axis))
                header.prop(row_data, "mode", text="")
                if row_data.mode in {'LIMITED', 'SPRING'}:
                    lim = row_box.row(align=True)
                    lim.prop(row_data, "min_limit", text="Min")
                    lim.prop(row_data, "max_limit", text="Max")
                if row_data.mode == 'SPRING':
                    spring = row_box.row(align=True)
                    spring.prop(row_data, "stiffness")
                    spring.prop(row_data, "damping")

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
            body.prop(comp, "cam_lock_roll")
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
        elif t == 'GEOSPATIAL':
            body.prop(comp, "cam_planet_radius")
            body.prop(comp, "cam_lower_radius")
            body.prop(comp, "cam_upper_radius")
            body.prop(comp, "cam_check_collisions")
            body.label(
                text="Starts at the exported camera pose; planet must be centered at world origin",
                icon='INFO')
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
