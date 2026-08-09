"""Enum item lists and lookup tables shared by the component data model, the
UI, and the exporter. Pure data — importing this never touches bpy state."""

# Separator entries ("", "Section", "") render as labeled headers in enum menus.
COMPONENT_TYPES = [
    ("", "General", ""),
    ('TAG',    "Tag",    "Assign a tag / layer name to this entity"),
    ('SCRIPT', "Script", "Attach a named behavior script with parameters"),

    ("", "Physics", ""),
    ('COLLIDER',   "Collider",   "Physics collision shape"),
    ('RIGIDBODY',  "Rigid Body", "Physics body (mass, dynamics)"),
    ('CONSTRAINT', "Constraint", "Physics joint to another body (hinge, slider, spring...)"),

    ("", "Media & UI", ""),
    ('CAMERA',   "Camera",   "Override the camera type (ArcRotate / Follow / ...)"),
    ('AUDIO',    "Audio",    "Attach a sound to this entity (ambient or 3D-positioned)"),
    ('GUI',      "GUI",      "Attach a Babylon GUI (.json from the GUI Editor) as a HUD or on this mesh"),
    ('PARTICLE', "Particles", "Attach a Babylon particle system (.json from the Particle Editor)"),
    ('MSDF_TEXT', "MSDF Text", "Crisp scalable 3D text via Babylon's MSDF TextRenderer"),

    ("", "Rendering", ""),
    ('RENDERING_GROUP', "Rendering Group",
     "Babylon draw-order group (0–3); lower groups render first"),
    ('LAYER_MASK', "Layer Mask",
     "Babylon visibility bitmask for multi-camera / light filtering"),
    ('REFLECTION_PROBE', "Reflection Probe",
     "Realtime cubemap reflections for nearby PBR materials"),
    ('LOD', "LOD", "Distance-based mesh level-of-detail swapping"),

    ("", "3D GUI — Controls", ""),
    ('GUI3D_BUTTON',     "3D Button",                   "A 3D button plate rendering text or an image (Button3D)"),
    ('GUI3D_HOLO',       "3D Holographic Button",       "MRTK-style holographic button with text/image/tooltip"),
    ('GUI3D_TOUCH_HOLO', "3D Touch Holographic Button", "Holographic button with XR near-touch support"),
    ('GUI3D_MESH',       "3D Mesh Button",              "Make this object's own mesh a clickable 3D control"),

    ("", "3D GUI — Layout", ""),
    ('GUI3D_STACK',    "3D Stack Panel",    "Stack child 3D buttons in a row or column"),
    ('GUI3D_SPHERE',   "3D Sphere Panel",   "Arrange child 3D buttons on a sphere surface"),
    ('GUI3D_CYLINDER', "3D Cylinder Panel", "Arrange child 3D buttons on a cylinder surface"),
    ('GUI3D_PLANE',    "3D Plane Panel",    "Arrange child 3D buttons on a plane"),
    ('GUI3D_SCATTER',  "3D Scatter Panel",  "Scatter child 3D buttons with randomized placement"),

    ('COLLISION_LAYER', "Collision Layer",
     "Named Havok collision layer from the scene matrix"),
    ('ANIMATOR', "Animator",
     "NLA clip state machine (node graph) — attach to the armature"),
    # APPEND ONLY — comp_type is EnumProperty; Blender persists indices in .blend files.
    ('MESH_SHADOWS', "Mesh Shadows",
     "Override shadow casting and receiving on owned meshes"),
]

# Add Component menu — section order for artists. May differ from COMPONENT_TYPES
# (which must stay append-only for comp_type index stability in .blend files).
ADD_COMPONENT_MENU = [
    ("", "General", ""),
    ('TAG',    "Tag",    "Assign a tag / layer name to this entity"),
    ('SCRIPT', "Script", "Attach a named behavior script with parameters"),

    ("", "Physics", ""),
    ('COLLIDER',   "Collider",   "Physics collision shape"),
    ('RIGIDBODY',  "Rigid Body", "Physics body (mass, dynamics)"),
    ('CONSTRAINT', "Constraint", "Physics joint to another body (hinge, slider, spring...)"),
    ('COLLISION_LAYER', "Collision Layer",
     "Named Havok collision layer from the scene matrix"),

    ("", "Media & UI", ""),
    ('CAMERA',   "Camera",   "Override the camera type (ArcRotate / Follow / ...)"),
    ('AUDIO',    "Audio",    "Attach a sound to this entity (ambient or 3D-positioned)"),
    ('GUI',      "GUI",      "Attach a Babylon GUI (.json from the GUI Editor) as a HUD or on this mesh"),
    ('PARTICLE', "Particles", "Attach a Babylon particle system (.json from the Particle Editor)"),
    ('MSDF_TEXT', "MSDF Text", "Crisp scalable 3D text via Babylon's MSDF TextRenderer"),

    ("", "Rendering", ""),
    ('RENDERING_GROUP', "Rendering Group",
     "Babylon draw-order group (0–3); lower groups render first"),
    ('LAYER_MASK', "Layer Mask",
     "Babylon visibility bitmask for multi-camera / light filtering"),
    ('REFLECTION_PROBE', "Reflection Probe",
     "Realtime cubemap reflections for nearby PBR materials"),
    ('LOD', "LOD", "Distance-based mesh level-of-detail swapping"),
    ('MESH_SHADOWS', "Mesh Shadows",
     "Override shadow casting and receiving on owned meshes"),

    ("", "3D GUI — Controls", ""),
    ('GUI3D_BUTTON',     "3D Button",                   "A 3D button plate rendering text or an image (Button3D)"),
    ('GUI3D_HOLO',       "3D Holographic Button",       "MRTK-style holographic button with text/image/tooltip"),
    ('GUI3D_TOUCH_HOLO', "3D Touch Holographic Button", "Holographic button with XR near-touch support"),
    ('GUI3D_MESH',       "3D Mesh Button",              "Make this object's own mesh a clickable 3D control"),

    ("", "3D GUI — Layout", ""),
    ('GUI3D_STACK',    "3D Stack Panel",    "Stack child 3D buttons in a row or column"),
    ('GUI3D_SPHERE',   "3D Sphere Panel",   "Arrange child 3D buttons on a sphere surface"),
    ('GUI3D_CYLINDER', "3D Cylinder Panel", "Arrange child 3D buttons on a cylinder surface"),
    ('GUI3D_PLANE',    "3D Plane Panel",    "Arrange child 3D buttons on a plane"),
    ('GUI3D_SCATTER',  "3D Scatter Panel",  "Scatter child 3D buttons with randomized placement"),

    ("", "Animation", ""),
    ('ANIMATOR', "Animator",
     "NLA clip state machine (node graph) — attach to the armature"),
]

# Membership sets for the 3D GUI family: interactive controls carry On Click
# events; panels lay out the controls on their Blender CHILD objects.
GUI3D_CONTROLS = {'GUI3D_BUTTON', 'GUI3D_HOLO', 'GUI3D_TOUCH_HOLO', 'GUI3D_MESH'}
GUI3D_PANELS = {'GUI3D_STACK', 'GUI3D_SPHERE', 'GUI3D_CYLINDER', 'GUI3D_PLANE', 'GUI3D_SCATTER'}
# Controls that render text/image content (everything but the mesh button).
GUI3D_TEXTURED = {'GUI3D_BUTTON', 'GUI3D_HOLO', 'GUI3D_TOUCH_HOLO'}

# Physics phases for authored Event Message rows on COLLIDER components.
EVENT_MESSAGE_WHEN = [
    ('TRIGGER_ENTER',    "Trigger Enter",    "When another body enters this trigger volume"),
    ('TRIGGER_EXIT',     "Trigger Exit",     "When another body leaves this trigger volume"),
    ('COLLISION_ENTER',  "Collision Enter",  "When this solid collider first contacts another body"),
    ('COLLISION_EXIT',   "Collision Exit",   "When this solid collider stops contacting another body"),
]

MSDF_TEXT_ALIGNS = [
    ('left', "Left", ""),
    ('center', "Center", ""),
    ('right', "Right", ""),
]

GUI_MODES = [
    ('FULLSCREEN', "Fullscreen", "Render as a fullscreen 2D overlay (a HUD)"),
    ('MESH',       "On Mesh",    "Project the UI onto this object's mesh (in-world UI)"),
]

CONSTRAINT_TYPES = [
    ('FIXED',  "Fixed",          "Weld the two bodies together (no relative motion)"),
    ('BALL',   "Ball & Socket",  "Free rotation around a shared pivot point"),
    ('HINGE',  "Hinge",          "Rotation around one axis (door, lever, wheel)"),
    ('SLIDER', "Slider",         "Translation along one axis (drawer, piston)"),
    ('SPRING', "Spring",         "Sprung translation along one axis (suspension)"),
    ('CUSTOM', "Custom (6DoF)",  "Per-axis free/locked/limited/spring on one 6DoF joint"),
]

CONSTRAINT_DOF_AXES = [
    ('LINEAR_X',  "Linear X",  "Slide along constraint frame X (the authored Axis)"),
    ('LINEAR_Y',  "Linear Y",  "Slide along constraint frame Y"),
    ('LINEAR_Z',  "Linear Z",  "Slide along constraint frame Z"),
    ('ANGULAR_X', "Angular X", "Rotate around frame X (degrees)"),
    ('ANGULAR_Y', "Angular Y", "Rotate around frame Y (degrees)"),
    ('ANGULAR_Z', "Angular Z", "Rotate around frame Z (degrees)"),
]

CONSTRAINT_AXIS_MODES = [
    ('FREE',    "Free",    "Unrestricted on this axis"),
    ('LOCKED',  "Locked",  "No relative motion"),
    ('LIMITED', "Limited", "Min/max range"),
    ('SPRING',  "Spring",  "Sprung within min/max range"),
]

CONSTRAINT_DOF_LABELS = {item[0]: item[1] for item in CONSTRAINT_DOF_AXES}

# Default CUSTOM rows: all locked until the author opens up the DOFs they need.
CUSTOM_AXIS_DEFAULTS = (
    ('LINEAR_X',  'LOCKED'),
    ('LINEAR_Y',  'LOCKED'),
    ('LINEAR_Z',  'LOCKED'),
    ('ANGULAR_X', 'LOCKED'),
    ('ANGULAR_Y', 'LOCKED'),
    ('ANGULAR_Z', 'LOCKED'),
)

CONSTRAINT_AXES = [
    ('X', "X", "The object's local X axis (Blender)"),
    ('Y', "Y", "The object's local Y axis (Blender)"),
    ('Z', "Z", "The object's local Z axis (Blender)"),
]

CAMERA_TYPES = [
    ('FREE',        "Free",         "FreeCamera (the faithful default, configurable)"),
    ('UNIVERSAL',   "Universal",    "UniversalCamera (free + touch/gamepad)"),
    ('ARC',         "ArcRotate",    "Orbit camera around a target"),
    ('FOLLOW',      "Follow",       "Follow a target object"),
    ('GEOSPATIAL',  "Geospatial",   "Orbit a spherical planet at world origin (map-like pan/zoom/tilt)"),
]

CAMERA_KEY_SCHEMES = [
    ('ARROWS', "Arrow Keys", "Up/Down/Left/Right arrows"),
    ('WASD',   "WASD",       "W/A/S/D"),
    ('BOTH',   "Arrows + WASD", "Both arrow keys and WASD"),
    ('CUSTOM', "Custom",     "Assign your own keys below"),
]

FOLLOW_MODES = [
    ('OFFSET', "Fixed Offset", "Keep a constant world offset from the target "
                               "(camera placed where it sits in Blender)"),
    ('ORBIT',  "Orbit",        "Babylon FollowCamera — offset rotates with the "
                               "target's facing"),
]

COLLIDER_SHAPES = [
    ('BOX',     "Box",         "Axis-aligned box"),
    ('SPHERE',  "Sphere",      "Sphere"),
    ('CAPSULE', "Capsule",     "Capsule (good for characters)"),
    ('CYLINDER',"Cylinder",    "Cylinder"),
    ('CONVEX',  "Convex Hull", "Convex hull of the mesh"),
    ('MESH',    "Mesh",        "Exact triangle mesh (static bodies only)"),
]

BODY_TYPES = [
    ('DYNAMIC',   "Dynamic",   "Moved by the physics simulation"),
    ('STATIC',    "Static",    "Immovable (mass 0)"),
    ('ANIMATED', "Animated", "Driven by animation or code; pushes others but is not pushed by collisions"),
]

SHADOW_FILTERS = [
    ('PCF',      "PCF",            "Percentage-closer filtering (soft edges, default)"),
    ('PCSS',     "PCSS (Contact)", "Contact-hardening soft shadows; softness grows with distance"),
    ('POISSON',  "Poisson",        "Poisson-disk sampling"),
    ('BLUR_ESM', "Blur ESM",       "Blurred exponential shadow map (very soft)"),
    ('NONE',     "Hard",           "No filtering — hard, aliased edges"),
]

SHADOW_MAP_SIZE_PRESETS = [
    ('DEFAULT', "Default (1024)", "Use the loader default (1024)"),
    ('256', "256", "Low resolution"),
    ('512', "512", "Medium-low resolution"),
    ('1024', "1024", "Medium resolution"),
    ('2048', "2048", "High resolution"),
    ('4096', "4096", "Very high resolution"),
    ('8192', "8192", "Maximum resolution (expensive)"),
    ('CUSTOM', "Custom", "Enter any value from 256 to 8192"),
]

SHADOW_MAP_SIZE_PRESET_VALUES = {256, 512, 1024, 2048, 4096, 8192}

# UI labels for @exposed var kinds. vtype is stored as a string id (see exposed_vars.py),
# so this list can be reordered freely — it is not persisted by index.
VAR_TYPES = [
    ('FLOAT',   "Float",   ""),
    ('BOOL',    "Bool",    ""),
    ('STRING',  "String",  ""),
    ('FILE',    "File",    "Asset path copied into the level on export"),
    ('VECTOR2', "Vector2", ""),
    ('VECTOR3', "Vector3", ""),
    ('COLOR',   "Color",   ""),
    ('ENTITY',  "Object",  "Reference to another object in the scene"),
    ('ENUM',    "Enum",    "One choice from a fixed set of options"),
    ('LIST',    "List",    "A variable-length array of values"),
]

# Element types a LIST can hold -> the BJSListItem slot that stores the value.
LIST_ELEM_SLOT = {
    'FLOAT': "f_val", 'INT': "f_val", 'BOOL': "b_val",
    'STRING': "s_val", 'VECTOR3': "v_val", 'COLOR': "c_val",
    'ENTITY': "obj_val",
}

# Separator used to pack ENUM choices into one StringProperty — the unit
# separator control character is safe inside option strings.
ENUM_SEP = "\x1f"

LAYER_MASK_PRESETS = [
    ('DEFAULT', "Default", "All cameras and lights (0x0FFFFFFF)"),
    ('SLOT_0', "Slot 0", "0x10000000 — typical HUD / overlay slot"),
    ('SLOT_1', "Slot 1", "0x20000000"),
    ('SLOT_2', "Slot 2", "0x40000000"),
    ('SLOT_3', "Slot 3", "0x80000000"),
    ('CUSTOM', "Custom", "Use the custom bitmask below"),
]

# Resolved at export; CUSTOM reads layer_mask_custom on the component.
LAYER_MASK_PRESET_VALUES = {
    'DEFAULT': 0x0FFFFFFF,
    'SLOT_0': 0x10000000,
    'SLOT_1': 0x20000000,
    'SLOT_2': 0x40000000,
    'SLOT_3': 0x80000000,
}

MESH_SHADOW_MODES = [
    ('CAST_AND_RECEIVE', "Cast & Receive",
     "Cast shadows onto other meshes and receive shadows from lights"),
    ('RECEIVE_ONLY', "Receive Only",
     "Receive shadows but do not cast (typical for large ground planes)"),
    ('CAST_ONLY', "Cast Only",
     "Cast shadows but do not show shadows from other objects"),
    ('NONE', "None",
     "No shadow casting or receiving"),
]

REFLECTION_PROBE_CUBE_SIZES = [
    ('256', "256", "Low resolution (faster)"),
    ('512', "512", "Medium resolution (default)"),
    ('1024', "1024", "High resolution (slower)"),
]

REFLECTION_PROBE_REFRESH_RATES = [
    ('ONCE', "Once", "Capture once at load (best for static scenes)"),
    ('EVERY_FRAME', "Every Frame", "Update every frame (expensive — 6 faces per frame)"),
    ('EVERY_TWO_FRAMES', "Every 2 Frames", "Update every other frame"),
    ('CUSTOM', "Custom", "Custom frame interval (see Custom Interval)"),
]

# Babylon RenderTargetTexture refresh constants.
REFLECTION_PROBE_REFRESH_TO_BABYLON = {
    'ONCE': 0,
    'EVERY_FRAME': 1,
    'EVERY_TWO_FRAMES': 2,
}

REFLECTION_PROBE_INFLUENCE_SHAPES = [
    ('BOX', "Box", "Axis-aligned influence box"),
    ('SPHERE', "Sphere", "Spherical influence volume"),
]

REFLECTION_PROBE_FILTER_QUALITY = [
    ('LOW', "Low", "Fastest PBR probe filtering"),
    ('MEDIUM', "Medium", "Balanced quality and performance"),
    ('HIGH', "High", "Best glossiness / roughness filtering (slowest)"),
]

_COMPONENT_TYPE_LABELS = {
    item[0]: item[1] for item in COMPONENT_TYPES if item[0]
}


def component_type_label(comp_type):
    """Human menu label for a comp_type id (e.g. SCRIPT -> 'Script')."""
    return _COMPONENT_TYPE_LABELS.get(
        comp_type, comp_type.replace('_', ' ').title())
