"""The 3D viewport "Babylon Object" N-panel tab — everything about the SELECTED OBJECT.

Layout:
    Components            (BJS_PT_components — the inspector / component stack)
      ├─ Light            (child panel, lights only)
      ├─ Camera           (child panel, cameras only)
      └─ Animation        (child panel, objects with NLA clips only)

Scene-wide settings (rendering, fog, post, input actions, export) live in
the "Babylon Scene" N-panel — see scene_panels.py.
"""

import bpy
from bpy.types import Panel

from .component_draw import draw_component, count_enabled_colliders
from ..core.inspector import inspector_object


def _nla_strips(obj):
    ad = obj.animation_data
    strips = []
    if ad and ad.nla_tracks:
        for track in ad.nla_tracks:
            for strip in track.strips:
                strips.append(strip)
    return strips


class BJS_PT_components(Panel):
    """The per-object inspector: GUID, Add Component, and the component stack."""
    bl_label = "Components"
    bl_idname = "BJS_PT_components"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Object"

    def draw(self, context):
        layout = self.layout
        wm = context.window_manager
        pinned = wm.bjs_pinned_object is not None
        obj = inspector_object(context)
        if obj is None:
            row = layout.row(align=True)
            row.label(text="Select an object", icon='INFO')
            row.operator("bjs.toggle_pin", text="",
                         icon='PINNED' if pinned else 'UNPINNED', depress=pinned)
            return

        title = layout.row(align=True)
        title.label(text=obj.name, icon='OBJECT_DATA')
        title.operator("bjs.toggle_pin", text="",
                       icon='PINNED' if pinned else 'UNPINNED', depress=pinned)
        if pinned:
            layout.label(text="Pinned — select objects, then Add Selected",
                         icon='PINNED')

        obj_id = obj.get("bjs_id")
        id_row = layout.row(align=True)
        if obj_id:
            id_row.label(text=f"GUID: {obj_id[:8]}…", icon='COPY_ID')
        else:
            id_row.label(text="GUID: unassigned", icon='COPY_ID')
            id_row.operator("bjs.assign_id", text="Assign")

        layout.operator_menu_enum("bjs.add_component", "comp_type",
                                  text="Add Component", icon='ADD')

        if len(obj.bjs_components) == 0:
            layout.label(text="No components", icon='DOT')
            return

        collider_count = count_enabled_colliders(obj)
        if collider_count > 1:
            box = layout.box()
            box.label(text=f"{collider_count} colliders → one compound body", icon='MOD_PHYSICS')
            box.label(text="Each shape is a child in a PhysicsShapeContainer at runtime")

        for i, comp in enumerate(obj.bjs_components):
            draw_component(layout, obj, i, comp)


class BJS_PT_light_info(Panel):
    """Light export settings — shown only when a light is selected."""
    bl_label = "Light"
    bl_idname = "BJS_PT_light_info"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Object"
    bl_parent_id = "BJS_PT_components"

    @classmethod
    def poll(cls, context):
        obj = inspector_object(context)
        return obj is not None and obj.type == 'LIGHT'

    def draw(self, context):
        layout = self.layout
        obj = inspector_object(context)
        lamp = obj.data
        layout.label(text=f"Babylon Light · {lamp.type.title()}", icon='LIGHT')

        if lamp.type == 'AREA':
            layout.label(text="Area lights aren't supported by glTF", icon='ERROR')
            layout.label(text="Use Point, Sun, or Spot instead")
            return

        col = layout.column()
        col.use_property_split = True
        col.prop(lamp, "color")
        col.prop(lamp, "energy")
        if lamp.type == 'SUN':
            col.prop(lamp, "angle")
        if lamp.type == 'SPOT':
            col.prop(lamp, "spot_size")
            col.prop(lamp, "spot_blend")
        if lamp.type in {'POINT', 'SPOT'}:
            col.prop(lamp, "use_custom_distance", text="Custom Range")
            if lamp.use_custom_distance:
                col.prop(lamp, "cutoff_distance", text="Range")
            col.prop(obj.bjs_light, "use_clustered")
        col.prop(lamp, "use_shadow", text="Cast Shadows")
        if lamp.use_shadow:
            sh = obj.bjs_shadow
            sbox = layout.box()
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
            if lamp.type in {'SUN', 'SPOT'}:
                sc.prop(sh, "frustum_edge_falloff")
            sc.prop(sh, "force_back_faces")
        layout.label(text="Exported automatically — no component needed", icon='INFO')


class BJS_PT_camera_info(Panel):
    """Camera export settings — shown only when a camera is selected."""
    bl_label = "Camera"
    bl_idname = "BJS_PT_camera_info"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Object"
    bl_parent_id = "BJS_PT_components"

    @classmethod
    def poll(cls, context):
        obj = inspector_object(context)
        return obj is not None and obj.type == 'CAMERA'

    def draw(self, context):
        layout = self.layout
        obj = inspector_object(context)
        cam = obj.data
        layout.label(text=f"Babylon Camera · {cam.type.title()}", icon='CAMERA_DATA')
        if obj == context.scene.camera:
            layout.label(text="Scene's active camera", icon='CHECKMARK')
        col = layout.column()
        col.use_property_split = True
        if cam.type == 'ORTHO':
            col.prop(cam, "ortho_scale")
        else:
            col.prop(cam, "lens")
        col.prop(cam, "clip_start")
        col.prop(cam, "clip_end")
        layout.label(text="Exported automatically — no component needed", icon='INFO')


class BJS_PT_animation_info(Panel):
    """Animation playback settings — shown only when the object has NLA clips."""
    bl_label = "Animation"
    bl_idname = "BJS_PT_animation_info"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon Object"
    bl_parent_id = "BJS_PT_components"

    @classmethod
    def poll(cls, context):
        obj = inspector_object(context)
        return obj is not None and len(_nla_strips(obj)) > 0

    def draw(self, context):
        layout = self.layout
        obj = inspector_object(context)
        a = obj.bjs_animation
        col = layout.column()
        col.use_property_split = True
        col.prop(a, "auto_play")
        if a.auto_play:
            col.prop(a, "default_clip")
            col.prop(a, "loop")
            col.prop(a, "speed")
        layout.label(text="NLA clips (exported):")
        for s in _nla_strips(obj):
            layout.label(text=f"   {s.name}   [{int(s.frame_start)}-{int(s.frame_end)}]",
                         icon='ACTION')


classes = (
    BJS_PT_components,
    BJS_PT_light_info,
    BJS_PT_camera_info,
    BJS_PT_animation_info,
)
