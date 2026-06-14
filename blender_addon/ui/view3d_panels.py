"""The 3D viewport "Babylon" N-panel tab — everything about the SELECTED OBJECT.

Layout:
    Components            (BJS_PT_components — the inspector / component stack)
      ├─ Light            (child panel, lights only)
      ├─ Camera           (child panel, cameras only)
      └─ Animation        (child panel, objects with NLA clips only)
    Export                (compact copy of the export controls, for convenience)

Scene-wide settings (rendering, fog, post, input actions, export) live in
Properties > Scene under the "Babylon" panel — see scene_panels.py.
"""

import bpy
from bpy.types import Panel

from .common import draw_export_controls
from .component_draw import draw_component


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

        if len(obj.bjs_components) == 0:
            layout.label(text="No components", icon='DOT')
            return
        for i, comp in enumerate(obj.bjs_components):
            draw_component(layout, obj, i, comp)


class BJS_PT_light_info(Panel):
    """Light export settings — shown only when a light is selected."""
    bl_label = "Light"
    bl_idname = "BJS_PT_light_info"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon"
    bl_parent_id = "BJS_PT_components"

    @classmethod
    def poll(cls, context):
        return context.object is not None and context.object.type == 'LIGHT'

    def draw(self, context):
        layout = self.layout
        obj = context.object
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
        layout.label(text="Exported automatically — no component needed", icon='INFO')


class BJS_PT_camera_info(Panel):
    """Camera export settings — shown only when a camera is selected."""
    bl_label = "Camera"
    bl_idname = "BJS_PT_camera_info"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon"
    bl_parent_id = "BJS_PT_components"

    @classmethod
    def poll(cls, context):
        return context.object is not None and context.object.type == 'CAMERA'

    def draw(self, context):
        layout = self.layout
        obj = context.object
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
    bl_category = "Babylon"
    bl_parent_id = "BJS_PT_components"

    @classmethod
    def poll(cls, context):
        return context.object is not None and len(_nla_strips(context.object)) > 0

    def draw(self, context):
        layout = self.layout
        obj = context.object
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


class BJS_PT_export(Panel):
    """Compact export controls in the sidebar (the full set is also in
    Properties > Scene > Babylon > Export — both draw the same block)."""
    bl_label = "Export"
    bl_idname = "BJS_PT_export"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Babylon"

    def draw(self, context):
        draw_export_controls(self.layout, context.scene)


classes = (
    BJS_PT_components,
    BJS_PT_light_info,
    BJS_PT_camera_info,
    BJS_PT_animation_info,
    BJS_PT_export,
)
