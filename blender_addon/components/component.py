"""The component data model: BJSComponent plus its row PropertyGroups.

Blender PropertyGroups do not support polymorphism cleanly, so we use a single
"superset" PropertyGroup (BJSComponent) that holds the fields for every
component type, plus a `comp_type` enum that selects which fields are relevant.
The UI and the exporter both branch on `comp_type`.

To add a new component type you:
  1. add an entry to constants.COMPONENT_TYPES
  2. add its fields to BJSComponent below
  3. draw them in ui/component_draw.py
  4. serialize them in export/components.py
  5. handle them in the Babylon runtime (ComponentRegistry / LevelLoader)
"""

import os

import bpy
from bpy.props import (
    StringProperty, EnumProperty, FloatProperty, BoolProperty,
    FloatVectorProperty, IntProperty, CollectionProperty, PointerProperty,
)
from bpy.types import PropertyGroup, Object

from ..core.ids import ensure_object_id
from .constants import (
    COMPONENT_TYPES, GUI_MODES, MSDF_TEXT_ALIGNS, COLLIDER_SHAPES, BODY_TYPES,
    CONSTRAINT_TYPES, CONSTRAINT_AXES, CONSTRAINT_DOF_AXES,
    CONSTRAINT_AXIS_MODES, CUSTOM_AXIS_DEFAULTS,
    CAMERA_TYPES, CAMERA_KEY_SCHEMES, FOLLOW_MODES,
)
from .exposed_vars import BJSExposedVar


def _script_name_from_path(path):
    """'.../behaviors/PlayerController.ts' -> 'PlayerController' (the registry key)."""
    base = os.path.basename(path.rstrip("/\\"))
    return os.path.splitext(base)[0]


def _on_script_path_update(self, context):
    """When a script file is picked/typed, derive the runtime registry key."""
    if self.script_path:
        name = _script_name_from_path(bpy.path.abspath(self.script_path))
        if name:
            self.script_name = name


def _on_cam_target_update(self, context):
    """Follow-camera target: assign it a GUID so the runtime can resolve it."""
    if self.cam_target is not None:
        ensure_object_id(self.cam_target)


def ensure_custom_constraint_axes(comp):
    """Ensure a CUSTOM constraint owns the six standard 6DoF axis rows."""
    if comp.con_type != 'CUSTOM':
        return
    if len(comp.con_custom_axes) == len(CUSTOM_AXIS_DEFAULTS):
        return
    comp.con_custom_axes.clear()
    for axis_id, mode in CUSTOM_AXIS_DEFAULTS:
        row = comp.con_custom_axes.add()
        row.dof_axis = axis_id
        row.mode = mode


def _on_con_type_update(self, context):
    """When switching to CUSTOM, seed the six per-axis rows."""
    ensure_custom_constraint_axes(self)


class BJSConstraintAxisDoF(PropertyGroup):
    """One 6DoF axis row for a CUSTOM constraint."""
    dof_axis: EnumProperty(name="Axis", items=CONSTRAINT_DOF_AXES, default='LINEAR_X')
    mode: EnumProperty(name="Mode", items=CONSTRAINT_AXIS_MODES, default='LOCKED')
    min_limit: FloatProperty(
        name="Min", default=0.0,
        description="Lower limit: meters (linear) or degrees (angular)")
    max_limit: FloatProperty(
        name="Max", default=0.0,
        description="Upper limit: meters (linear) or degrees (angular)")
    stiffness: FloatProperty(name="Stiffness", default=100.0, min=0.0,
                             description="Spring stiffness (N/m)")
    damping: FloatProperty(name="Damping", default=10.0, min=0.0,
                           description="Spring damping")


class BJSParticleTexture(PropertyGroup):
    """One particle texture image copied on export and wired into the particle JSON."""
    image_file: StringProperty(
        name="Image",
        subtype='FILE_PATH',
        default="",
        description="Source image copied into the level's particles/ folder on export",
    )
    json_url: StringProperty(
        name="URL in JSON",
        default="",
        description="Filename the particle JSON references (e.g. bubble.png or "
                    "fx/bubble.png). Empty = use the exported image filename",
    )
    match_url: StringProperty(
        name="Replace URL",
        default="",
        description="Only patch texture blocks whose current URL equals this "
                    "(empty = auto: first empty block, or the only block)",
    )


class BJSTriggerEvent(PropertyGroup):
    """One authored trigger reaction: when something enters this trigger
    collider, send `message` to `target`'s behaviors (OnMessage). An optional
    tag filter restricts which entities may set it off."""
    target:     PointerProperty(name="Target", type=Object,
                                description="The entity whose behaviors receive the message")
    message:    StringProperty(name="Message", default="",
                               description="Delivered to the target's OnMessage(message, source)")
    filter_tag: StringProperty(name="Only Tag", default="",
                               description="Only entities with this tag set the event off (empty = any)")


class BJSComponent(PropertyGroup):
    comp_type: EnumProperty(name="Type", items=COMPONENT_TYPES, default='TAG')
    enabled:   BoolProperty(name="Enabled", default=True)
    show_expanded: BoolProperty(name="Expanded", default=True)

    # --- TAG ---
    tag: StringProperty(name="Tag", default="Untagged")

    # --- COLLIDER ---
    collider_shape: EnumProperty(name="Shape", items=COLLIDER_SHAPES, default='BOX')
    is_trigger:     BoolProperty(name="Is Trigger",
                                 description="Detect overlaps without solid collision",
                                 default=False)
    auto_fit:       BoolProperty(name="Auto-Fit to Bounds",
                                 description="Compute size from the mesh bounding box at runtime",
                                 default=True)
    collider_show:  BoolProperty(name="Show Preview", default=True,
                                 description="Draw this collider in the viewport (when selected)")
    collider_size:   FloatVectorProperty(name="Size", size=3, default=(1.0, 1.0, 1.0),
                                          min=0.0, subtype='XYZ',
                                          description="Full size, in Blender axes")
    collider_radius: FloatProperty(name="Radius", default=0.5, min=0.0)
    collider_height: FloatProperty(name="Height", default=2.0, min=0.0)
    collider_center: FloatVectorProperty(name="Center Offset", size=3, default=(0.0, 0.0, 0.0),
                                         subtype='XYZ', description="Offset, in Blender axes")
    collider_rotation: FloatVectorProperty(name="Rotation", size=3, default=(0.0, 0.0, 0.0),
                                           subtype='EULER',
                                           description="Local rotation of the collider, in Blender axes")
    collider_apply_scale: BoolProperty(
        name="Apply Object Scale",
        default=True,
        description="Multiply collider dimensions by this object's local scale "
                    "(parent scales use the world transform; not baked twice)",
    )

    # --- RIGIDBODY ---
    body_type:       EnumProperty(name="Body Type", items=BODY_TYPES, default='DYNAMIC')
    mass:            FloatProperty(name="Mass", default=1.0, min=0.0)
    friction:        FloatProperty(name="Friction", default=0.5, min=0.0)
    restitution:     FloatProperty(name="Restitution (Bounce)", default=0.2, min=0.0)
    linear_damping:  FloatProperty(name="Linear Damping", default=0.0, min=0.0)
    angular_damping: FloatProperty(name="Angular Damping", default=0.0, min=0.0)
    start_asleep:    BoolProperty(name="Start Asleep", default=False,
                                 description="Begin in sleep mode for bodies at rest "
                                             "(performance hint; not guaranteed to stay asleep)")
    cog_auto_fit:    BoolProperty(name="Auto-Fit Center of Mass",
                                  description="Compute center of mass from the mesh bounding box at runtime",
                                  default=True)
    cog_center:      FloatVectorProperty(name="Center of Mass", size=3, default=(0.0, 0.0, 0.0),
                                         subtype='XYZ',
                                         description="Custom center of mass offset, in Blender axes")

    # --- COLLIDER: trigger events (shown when Is Trigger is on) ---
    trigger_events: CollectionProperty(type=BJSTriggerEvent)

    # --- AUDIO ---
    audio_file:     StringProperty(name="Sound File", subtype='FILE_PATH', default="",
                                   description=".mp3/.wav/.ogg — copied next to the export")
    audio_volume:   FloatProperty(name="Volume", default=1.0, min=0.0, max=2.0)
    audio_loop:     BoolProperty(name="Loop", default=False)
    audio_autoplay: BoolProperty(name="Auto Play", default=False,
                                 description="Start on load (after the browser allows audio)")
    audio_spatial:  BoolProperty(name="3D Spatial", default=True,
                                 description="Position the sound at this object (vs. ambient)")
    audio_max_distance: FloatProperty(name="Max Distance", default=50.0, min=0.0,
                                      description="Distance at which the sound is inaudible")
    audio_rate:     FloatProperty(name="Playback Rate", default=1.0, min=0.1, max=4.0)

    # --- GUI ---
    gui_file:       StringProperty(name="GUI File", subtype='FILE_PATH', default="",
                                   description=".json exported from the Babylon GUI Editor — "
                                               "copied next to the export")
    gui_mode:       EnumProperty(name="Mode", items=GUI_MODES, default='FULLSCREEN')
    gui_foreground: BoolProperty(name="Foreground", default=True,
                                 description="Fullscreen: draw in front of the scene (vs behind it)")
    gui_width:      IntProperty(name="Texture Width", default=1024, min=1,
                                description="On Mesh: resolution of the UI texture")
    gui_height:     IntProperty(name="Texture Height", default=1024, min=1,
                                description="On Mesh: resolution of the UI texture")

    # --- PARTICLE ---
    particle_file:      StringProperty(name="Particle File", subtype='FILE_PATH', default="",
                                       description=".json exported from the Babylon Particle "
                                                   "Editor — copied next to the export")
    particle_gpu:       BoolProperty(name="Use GPU", default=False,
                                     description="Create a GPUParticleSystem when supported "
                                                 "(falls back to CPU)")
    particle_autostart: BoolProperty(name="Auto Start", default=True,
                                     description="Begin emitting as soon as the level loads")
    particle_attach:    BoolProperty(name="Attach to Object", default=True,
                                     description="Emit from this object (meshes and empties "
                                                 "follow it at runtime)")
    particle_capacity:  IntProperty(name="Max Particles", default=0, min=0,
                                    description="Override the JSON's capacity (0 = use the file's value)")
    particle_textures: CollectionProperty(type=BJSParticleTexture)

    # --- MSDF TEXT ---
    msdf_text: StringProperty(name="Text", default="",
                              description="Paragraph text rendered with MSDF")
    msdf_font_json: StringProperty(name="Font JSON", subtype='FILE_PATH', default="",
                                   description="MSDF font definition (.json from msdf-bmfont or msdfgen)")
    msdf_font_texture: StringProperty(name="Font Texture", subtype='FILE_PATH', default="",
                                      description="MSDF glyph atlas (.png paired with the JSON)")
    msdf_color: FloatVectorProperty(name="Color", size=4, subtype='COLOR',
                                    default=(1.0, 1.0, 1.0, 1.0), min=0.0, max=1.0)
    msdf_thickness: FloatProperty(name="Thickness", default=0.0, min=-0.5, max=0.5,
                                  description="Overall glyph thickness (-0.5 to 0.5; 0 = font default)")
    msdf_billboard: BoolProperty(name="Billboard", default=False,
                                 description="Always face the camera (only parent translation is used)")
    msdf_billboard_screen: BoolProperty(name="Screen Projected", default=False,
                                        description="Billboard keeps constant on-screen size")
    msdf_ignore_depth: BoolProperty(name="Ignore Depth", default=False,
                                    description="Draw on top of the scene (no depth test)")
    msdf_stroke_color: FloatVectorProperty(name="Stroke Color", size=4, subtype='COLOR',
                                           default=(0.0, 0.0, 0.0, 0.0), min=0.0, max=1.0)
    msdf_stroke_inset: FloatProperty(name="Stroke Inset", default=0.0, min=0.0,
                                     description="Stroke width inside the glyphs")
    msdf_stroke_outset: FloatProperty(name="Stroke Outset", default=0.0, min=0.0,
                                      description="Stroke width outside the glyphs")
    msdf_text_align: EnumProperty(name="Align", items=MSDF_TEXT_ALIGNS, default='center')
    msdf_max_width: FloatProperty(name="Max Width", default=0.0, min=0.0,
                                  description="Wrap width in font units (0 = no wrap)")
    msdf_line_height: FloatProperty(name="Line Height", default=1.0, min=0.1)
    msdf_letter_spacing: FloatProperty(name="Letter Spacing", default=1.0, min=0.0)

    # --- GUI3D (3D buttons + layout panels) ---
    gui3d_text:    StringProperty(name="Text", default="",
                                  description="Button label text")
    gui3d_image:   StringProperty(name="Image", subtype='FILE_PATH', default="",
                                  description="Button icon image — copied next to the export")
    gui3d_tooltip: StringProperty(name="Tooltip", default="",
                                  description="Hover tooltip (holographic buttons)")
    gui3d_content_resolution: IntProperty(
        name="Content Resolution", default=512, min=64, max=4096,
        description="Texture resolution rendering the 3D Button's content")
    # On Click reactions: reuses the trigger-event rows (target + message).
    gui3d_events:  CollectionProperty(type=BJSTriggerEvent)
    gui3d_margin:  FloatProperty(name="Margin", default=0.02, min=0.0,
                                 description="Distance between child controls")
    gui3d_columns: IntProperty(name="Columns", default=10, min=0,
                               description="0 = derive from Rows")
    gui3d_rows:    IntProperty(name="Rows", default=0, min=0,
                               description="0 = derive from Columns (setting Rows wins)")
    gui3d_radius:  FloatProperty(name="Radius", default=5.0, min=0.0,
                                 description="Radius of the sphere/cylinder hosting the children")
    gui3d_vertical: BoolProperty(name="Vertical", default=False,
                                 description="Stack children vertically instead of horizontally")
    gui3d_iterations: IntProperty(name="Iterations", default=100, min=1,
                                  description="Iterations used to scatter the children")

    # --- CONSTRAINT ---
    con_type:   EnumProperty(name="Joint", items=CONSTRAINT_TYPES, default='HINGE',
                             update=_on_con_type_update)
    con_target: PointerProperty(name="Target", type=Object,
                                description="The other body this object is jointed to")
    con_pivot:  FloatVectorProperty(name="Pivot", size=3, default=(0.0, 0.0, 0.0),
                                    subtype='XYZ',
                                    description="Joint anchor, in this object's local space (Blender axes)")
    con_apply_scale: BoolProperty(
        name="Apply Object Scale",
        default=True,
        description="Multiply pivot and linear limits by this object's local scale "
                    "(parent scales use the world transform; not baked twice)",
    )
    con_axis:   EnumProperty(name="Axis", items=CONSTRAINT_AXES, default='Z',
                             description="Hinge rotation / slide / spring axis (this object's local axes)")
    con_collision: BoolProperty(name="Bodies Collide", default=False,
                                description="Allow the two jointed bodies to collide with each other")
    con_use_limits: BoolProperty(name="Use Limits", default=False)
    con_min: FloatProperty(name="Min", default=0.0,
                           description="Lower limit: degrees (hinge) or meters (slider/spring)")
    con_max: FloatProperty(name="Max", default=0.0,
                           description="Upper limit: degrees (hinge) or meters (slider/spring)")
    con_stiffness: FloatProperty(name="Stiffness", default=100.0, min=0.0,
                                 description="Spring stiffness (N/m)")
    con_damping:   FloatProperty(name="Damping", default=10.0, min=0.0,
                                 description="Spring damping")
    con_motor: BoolProperty(name="Motor", default=False,
                            description="Drive the joint at a target speed (hinge/slider)")
    con_motor_speed: FloatProperty(name="Motor Speed", default=90.0,
                                   description="Target speed: deg/s (hinge) or m/s (slider)")
    con_motor_force: FloatProperty(name="Motor Max Force", default=100.0, min=0.0)
    con_custom_axes: CollectionProperty(type=BJSConstraintAxisDoF)

    # --- SCRIPT ---
    script_path: StringProperty(
        name="File", subtype='FILE_PATH', default="",
        description="Path to the behavior source file (picked via Open Script)",
        update=_on_script_path_update)
    # Registry key, derived from the picked file. Not user-editable; exposed
    # variables will come from decorators in the script itself.
    script_name: StringProperty(name="Script", default="")
    exposed_vars: CollectionProperty(type=BJSExposedVar)

    # --- CAMERA (opt-in type override; default cameras stay faithful FreeCameras) ---
    cam_type:           EnumProperty(name="Camera Type", items=CAMERA_TYPES, default='ARC')
    cam_attach_control: BoolProperty(name="Attach Controls", default=True)
    cam_key_scheme:     EnumProperty(name="Keys", items=CAMERA_KEY_SCHEMES, default='ARROWS')
    cam_key_up:         StringProperty(name="Up", default="W", maxlen=1)
    cam_key_down:       StringProperty(name="Down", default="S", maxlen=1)
    cam_key_left:       StringProperty(name="Left", default="A", maxlen=1)
    cam_key_right:      StringProperty(name="Right", default="D", maxlen=1)
    cam_use_blender_transform: BoolProperty(
        name="Use Blender Position", default=True,
        description="Start the follow camera where it sits in Blender, relative "
                    "to the target (derives distance/height/angle)")
    cam_follow_mode:    EnumProperty(name="Follow Mode", items=FOLLOW_MODES, default='OFFSET')
    cam_lock_roll:      BoolProperty(
        name="Keep Upright", default=False,
        description="Lock roll (rotation around the view/Z axis) so the camera "
                    "always stays level with the horizon")
    cam_speed:          FloatProperty(name="Speed", default=1.0, min=0.0)
    cam_inertia:        FloatProperty(name="Inertia", default=0.9, min=0.0, max=1.0)
    cam_radius:         FloatProperty(name="Orbit Distance", default=10.0, min=0.1)
    cam_lower_radius:   FloatProperty(name="Min Zoom", default=0.0, min=0.0,
                                      description="0 = no limit")
    cam_upper_radius:   FloatProperty(name="Max Zoom", default=0.0, min=0.0,
                                      description="0 = no limit")
    cam_target:         PointerProperty(name="Target", type=Object,
                                        update=_on_cam_target_update)
    cam_distance:       FloatProperty(name="Follow Distance", default=10.0, min=0.0)
    cam_height:         FloatProperty(name="Height Offset", default=4.0)
    cam_rotation_offset: FloatProperty(name="Rotation Offset", default=0.0,
                                       description="Degrees behind the target")
    cam_planet_radius: FloatProperty(
        name="Planet Radius", default=1.0, min=0.001,
        description="Radius of the globe mesh at world origin (must match your scene scale)")
    cam_check_collisions: BoolProperty(
        name="Check Collisions", default=False,
        description="Use the scene collision system to keep the camera out of geometry")
