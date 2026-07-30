"""Per-component inspector bodies, registered by component type.

Each drawer has the same shape: (body, obj, comp, index) -> None, where `body`
is the expanded panel column prepared by draw_component (component_draw.py).
Adding a component kind: write one _draw_* function here and register it in
BODY_DRAWERS; the export serializer registers in export/component_serializers.py
and the runtime handler in packages/engine/src/core/loader/componentRegistry.ts.
`node scripts/check-component-types.mjs` verifies the registries stay in sync.
"""

import bpy

from ..components.constants import (
    LIST_ELEM_SLOT, GUI3D_CONTROLS, GUI3D_PANELS, GUI3D_TEXTURED,
    CONSTRAINT_DOF_LABELS,
)
from ..components.component import ensure_custom_constraint_axes
from ..components.particle_scan import enumerate_particle_texture_slots


def count_enabled_colliders(obj):
    """How many enabled COLLIDER components are on this object."""
    return sum(1 for c in obj.bjs_components if c.enabled and c.comp_type == 'COLLIDER')


# ---- shared sub-widgets ----

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

    # Entity refs get a link-from-file button next to the object picker so
    # authors can pull a prefab collection from another .blend (link +
    # library override + assign) without leaving the inspector.
    if v.vtype == 'ENTITY':
        row = layout.row(align=True)
        row.prop(v, "obj_val", text=label)
        link = row.operator("bjs.link_prefab", text="", icon='LINKED')
        link.comp_index = comp_index
        link.var_index = var_index
        return

    slot = {
        'FLOAT': "f_val", 'BOOL': "b_val", 'STRING': "s_val", 'FILE': "file_val",
        'VECTOR2': "v2_val", 'VECTOR3': "v_val", 'COLOR': "c_val",
    }.get(v.vtype, "f_val")
    layout.prop(v, slot, text=label)


def _particle_slot_needs_file(tex_row, particle_file):
    if not particle_file:
        return False
    slots = enumerate_particle_texture_slots(particle_file)
    by_id = {slot["block_id"]: slot for slot in slots}
    info = by_id.get(tex_row.block_id)
    if info is not None:
        return info["needs_file"]
    return not tex_row.image_file


def _draw_particle_textures(body, comp, index):
    """Texture images copied on export and patched into the particle JSON."""
    if not comp.particle_file:
        body.label(text="Pick a particle JSON, then Scan Textures", icon='INFO')
        return

    box = body.box()
    header = box.row()
    header.label(text="Textures", icon='TEXTURE')
    add = header.operator("bjs.particle_texture_add", text="", icon='ADD')
    add.comp_index = index

    if len(comp.particle_textures) == 0:
        box.label(
            text="Scan Textures to list slots from the JSON",
            icon='INFO',
        )
        return

    for tex_i, tex in enumerate(comp.particle_textures):
        col = box.column(align=True)
        needs = _particle_slot_needs_file(tex, comp.particle_file)
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
        op = rem.operator("bjs.particle_texture_remove", text="Remove", icon='X')
        op.comp_index = index
        op.particle_texture_index = tex_i


def _draw_probe_object_list(body, comp, index, collection_name, add_op_id, remove_op_id, empty_hint):
    """Object pointer rows for reflection probe render / exclude lists."""
    entries = getattr(comp, collection_name)
    box = body.box()
    header = box.row()
    header.label(text=collection_name.replace("probe_", "").replace("_", " ").title(), icon='OUTLINER_OB_GROUP_INSTANCE')
    add = header.operator(add_op_id, text="", icon='ADD')
    add.comp_index = index
    if len(entries) == 0:
        box.label(text=empty_hint, icon='INFO')
        return
    for entry_index, entry in enumerate(entries):
        row = box.row(align=True)
        row.prop(entry, "obj_ref", text="")
        rem = row.operator(remove_op_id, text="", icon='X')
        rem.comp_index = index
        rem.entry_index = entry_index


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


# ---- per-type bodies ----

def _draw_tag(body, obj, comp, index):
    body.prop(comp, "tag")


def _draw_rendering_group(body, obj, comp, index):
    body.prop(comp, "rendering_group_id")
    body.prop(comp, "render_layer_apply_owned")
    body.prop(comp, "render_layer_apply_children")


def _draw_layer_mask(body, obj, comp, index):
    body.prop(comp, "layer_mask_preset")
    if comp.layer_mask_preset == 'CUSTOM':
        body.prop(comp, "layer_mask_custom")
    body.prop(comp, "render_layer_apply_owned")
    body.prop(comp, "render_layer_apply_children")


def _draw_collision_layer(body, obj, comp, index):
    body.prop(comp, "collision_layer_select")
    body.prop(comp, "collision_layer_apply_owned")
    body.prop(comp, "collision_layer_apply_children")
    if not any(c.enabled and c.comp_type in {'COLLIDER', 'RIGIDBODY'} for c in obj.bjs_components):
        info = body.box()
        info.label(text="No Collider/Rigid Body — layer has no effect", icon='INFO')


def _draw_collider(body, obj, comp, index):
    if count_enabled_colliders(obj) > 1:
        info = body.box()
        info.label(text="Part of a compound body", icon='MOD_PHYSICS')
        info.label(text="Shapes combine at runtime; use manual center/size per collider")
    body.prop(comp, "collider_shape")
    body.prop(comp, "is_trigger")
    body.prop(comp, "collider_make_invisible")
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

    box = body.box()
    header = box.row()
    header.label(text="Event Messages", icon='OUTLINER_OB_FORCE_FIELD')
    add = header.operator("bjs.event_message_add", text="", icon='ADD')
    add.comp_index = index
    for ev_i, ev in enumerate(comp.event_messages):
        row = box.row(align=True)
        row.prop(ev, "when", text="")
        row.prop(ev, "target", text="")
        row.prop(ev, "message", text="")
        row.prop(ev, "filter_tag", text="", icon='COLOR')
        rem = row.operator("bjs.event_message_remove", text="", icon='X')
        rem.comp_index = index
        rem.event_index = ev_i
    if len(comp.event_messages) == 0:
        box.label(text="When: send Message to Target", icon='INFO')


def _draw_rigidbody(body, obj, comp, index):
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


def _draw_audio(body, obj, comp, index):
    body.prop(comp, "audio_file")
    body.prop(comp, "audio_volume", slider=True)
    row = body.row(align=True)
    row.prop(comp, "audio_loop")
    row.prop(comp, "audio_autoplay")
    body.prop(comp, "audio_spatial")
    if comp.audio_spatial:
        body.prop(comp, "audio_max_distance")
    body.prop(comp, "audio_rate")


def _draw_gui(body, obj, comp, index):
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


def _draw_particle(body, obj, comp, index):
    body.prop(comp, "particle_file")
    row = body.row(align=True)
    scan = row.operator("bjs.scan_particle_textures", text="Scan Textures", icon='FILE_REFRESH')
    scan.comp_index = index
    op = row.operator("bjs.open_launcher_particle", text="Open in Launcher", icon='WORLD')
    op.comp_index = index
    body.prop(comp, "particle_attach")
    body.prop(comp, "particle_autostart")
    body.prop(comp, "particle_gpu")
    body.prop(comp, "particle_capacity")
    _draw_particle_textures(body, comp, index)


def _draw_msdf_text(body, obj, comp, index):
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


def _draw_reflection_probe(body, obj, comp, index):
    cap = body.box()
    cap.label(text="Capture", icon='RENDER_STILL')
    cap.prop(comp, "probe_cube_size")
    cap.prop(comp, "probe_refresh_rate")
    if comp.probe_refresh_rate == 'CUSTOM':
        cap.prop(comp, "probe_refresh_custom")
    cap.prop(comp, "probe_generate_mipmaps")

    render_box = body.box()
    render_box.label(text="Render List", icon='RESTRICT_VIEW_OFF')
    render_box.prop(comp, "probe_render_all")
    if comp.probe_render_all:
        _draw_probe_object_list(
            render_box, comp, index,
            "probe_render_excludes",
            "bjs.probe_exclude_add", "bjs.probe_exclude_remove",
            "Exclude objects from the cubemap capture (optional)",
        )
    else:
        _draw_probe_object_list(
            render_box, comp, index,
            "probe_render_list",
            "bjs.probe_render_add", "bjs.probe_render_remove",
            "Add objects whose meshes are rendered into the cubemap",
        )

    inf = body.box()
    inf.label(text="Influence Volume", icon='CUBE')
    inf.prop(comp, "probe_influence_shape")
    if comp.probe_influence_shape == 'SPHERE':
        inf.prop(comp, "probe_influence_size", index=0, text="Diameter")
    else:
        inf.prop(comp, "probe_influence_size")
    inf.prop(comp, "probe_influence_offset")
    inf.prop(comp, "probe_priority")
    inf.prop(comp, "probe_show_preview")

    pbr = body.box()
    pbr.label(text="PBR", icon='MATERIAL')
    pbr.prop(comp, "probe_realtime_filtering")
    if comp.probe_realtime_filtering:
        pbr.prop(comp, "probe_filter_quality")


def _draw_gui3d_control(body, obj, comp, index):
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


def _draw_gui3d_panel(body, obj, comp, index):
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


def _draw_constraint(body, obj, comp, index):
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


def _draw_script(body, obj, comp, index):
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


def _draw_animator(body, obj, comp, index):
    """Animator: graph picker, Edit button, synced Parameters, summary."""
    body.prop(comp, "animator_tree", text="Graph")

    row = body.row(align=True)
    edit = row.operator("bjs.edit_animator", text="Edit Animator", icon="NODETREE")
    edit.comp_index = index
    row.operator("bjs.animator_purge_unused_trees", text="", icon="TRASH")

    if comp.animator_tree is None:
        body.label(text="Pick a graph above, or Edit Animator to create one", icon="INFO")

    vbox = body.box()
    vhdr = vbox.row(align=True)
    vhdr.label(text="Parameters", icon="PRESET")
    sync = vhdr.operator("bjs.sync_animator_params", text="", icon="FILE_REFRESH")
    sync.comp_index = index
    if len(comp.animator_vars) == 0:
        vbox.label(text="No parameters — add Parameter nodes in the graph")
    for var in comp.animator_vars:
        label = var.label or var.name
        if var.ptype == 'FLOAT':
            vbox.prop(var, "f_val", text=label)
        elif var.ptype == 'BOOL':
            vbox.prop(var, "b_val", text=label)
        elif var.ptype == 'INT':
            vbox.prop(var, "i_val", text=label)
        else:
            vbox.label(text=f"{label}  (trigger)")

    # Summary from the graph when present.
    tree = comp.animator_tree
    if tree is not None and getattr(tree, "bl_idname", "") == "BJSAnimationStateTree":
        from ..animator.serialize import serialize_animator_tree
        graph = serialize_animator_tree(tree)
        n_states = len(graph["states"])
        n_trans = len(graph["transitions"])
        default = graph["defaultState"] or "(none)"
        body.label(
            text=f"{n_states} states · {n_trans} transitions · default: {default}",
            icon="INFO")


def _draw_lod(body, obj, comp, index):
    """LOD levels: distance thresholds + lower-detail mesh targets."""
    box = body.box()
    header = box.row()
    header.label(text="LOD Levels", icon='MOD_DECIM')
    add = header.operator("bjs.lod_level_add", text="", icon='ADD')
    add.comp_index = index
    if len(comp.lod_levels) == 0:
        box.label(text="Add a LOD level: pick a lower-detail mesh or enable Auto LOD", icon='INFO')
        return
    accumulated_distance = 0.0
    for level_index, level in enumerate(comp.lod_levels):
        accumulated_distance += level.distance
        row = box.row(align=True)
        row.prop(level, "distance", text=f"+{level.distance:.1f}m (total {accumulated_distance:.1f}m)")
        row.prop(level, "auto_lod", text="", icon='MOD_DECIM')
        if level.auto_lod:
            auto_row = box.row(align=True)
            auto_row.prop(level, "quality", text="Quality")
            auto_row.prop(level, "optimize_mesh", text="Optimize")
        else:
            target_row = box.row(align=True)
            target_row.prop(level, "target", text="Target")
        rem = box.row()
        rem_op = rem.operator("bjs.lod_level_remove", text="", icon='X')
        rem_op.comp_index = index
        rem_op.level_index = level_index
        if not level.auto_lod and level.target is not None and len(level.target.bjs_components) > 0:
            warn = box.row()
            warn.alert = True
            warn.label(
                text=f"Target '{level.target.name}' has components — LOD targets must be mesh-only",
                icon='ERROR',
            )





def _draw_camera(body, obj, comp, index):
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
        if comp.cam_target:
            body.prop(comp, "cam_track_target")
        body.prop(comp, "cam_radius")
        body.prop(comp, "cam_lower_radius")
        body.prop(comp, "cam_upper_radius")
        if comp.cam_attach_control:
            body.prop(comp, "cam_orbit_speed")
            body.prop(comp, "cam_zoom_speed")
            body.prop(comp, "cam_pan_speed")
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
        if comp.cam_attach_control:
            body.prop(comp, "cam_orbit_speed")
            body.prop(comp, "cam_zoom_speed")
            body.prop(comp, "cam_pan_speed")
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


# The UI registry: component type -> inspector body drawer. The GUI3D families
# share one drawer per family (control vs panel), registered for every member.
BODY_DRAWERS = {
    'TAG': _draw_tag,
    'RENDERING_GROUP': _draw_rendering_group,
    'LAYER_MASK': _draw_layer_mask,
    'COLLIDER': _draw_collider,
    'RIGIDBODY': _draw_rigidbody,
    'SCRIPT': _draw_script,
    'CAMERA': _draw_camera,
    'CONSTRAINT': _draw_constraint,
    'COLLISION_LAYER': _draw_collision_layer,
    'AUDIO': _draw_audio,
    'GUI': _draw_gui,
    'PARTICLE': _draw_particle,
    'MSDF_TEXT': _draw_msdf_text,
    'REFLECTION_PROBE': _draw_reflection_probe,
    'LOD': _draw_lod,
    'ANIMATOR': _draw_animator,
    **{comp_type: _draw_gui3d_control for comp_type in GUI3D_CONTROLS},
    **{comp_type: _draw_gui3d_panel for comp_type in GUI3D_PANELS},
}
