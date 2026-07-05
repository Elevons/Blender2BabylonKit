"""Shared draw code for the component stack (the Unity-style inspector).

Panel classes live in view3d_panels.py; this module draws a single component's
collapsible header and dispatches the body to the BODY_DRAWERS registry in
component_bodies.py, so any panel can host the same inspector without
drifting copies.
"""

import os

from ..components.constants import GUI3D_TEXTURED
from .component_bodies import BODY_DRAWERS, count_enabled_colliders


def _component_label(comp, obj=None, index=None):
    """The collapsed-header label: type name, enriched with the key detail."""
    label = comp.comp_type.replace('_', ' ').title()
    if comp.comp_type == 'TAG' and comp.tag:
        label = f"Tag: {comp.tag}"
    elif comp.comp_type == 'RENDERING_GROUP':
        label = f"Rendering Group: {comp.rendering_group_id}"
    elif comp.comp_type == 'LAYER_MASK':
        label = f"Layer Mask: {comp.layer_mask_preset.replace('_', ' ').title()}"
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
    elif comp.comp_type == 'REFLECTION_PROBE':
        shape = comp.probe_influence_shape.title()
        size = max(comp.probe_influence_size)
        label = f"Reflection Probe ({comp.probe_cube_size}, {shape} {size:.1g}m)"
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
    plus the per-type body from the BODY_DRAWERS registry."""
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

    drawer = BODY_DRAWERS.get(comp.comp_type)
    if drawer is None:
        body.label(text=f"No inspector for '{comp.comp_type}'", icon='ERROR')
        return
    drawer(body, obj, comp, index)
