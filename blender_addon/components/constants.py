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
]

# Membership sets for the 3D GUI family: interactive controls carry On Click
# events; panels lay out the controls on their Blender CHILD objects.
GUI3D_CONTROLS = {'GUI3D_BUTTON', 'GUI3D_HOLO', 'GUI3D_TOUCH_HOLO', 'GUI3D_MESH'}
GUI3D_PANELS = {'GUI3D_STACK', 'GUI3D_SPHERE', 'GUI3D_CYLINDER', 'GUI3D_PLANE', 'GUI3D_SCATTER'}
# Controls that render text/image content (everything but the mesh button).
GUI3D_TEXTURED = {'GUI3D_BUTTON', 'GUI3D_HOLO', 'GUI3D_TOUCH_HOLO'}

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

VAR_TYPES = [
    ('FLOAT',   "Float",   ""),
    ('BOOL',    "Bool",    ""),
    ('STRING',  "String",  ""),
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
