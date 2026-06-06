"""Component data model for the Babylon Level Kit.

Blender PropertyGroups do not support polymorphism cleanly, so we use a single
"superset" PropertyGroup (BJSComponent) that holds the fields for every
component type, plus a `comp_type` enum that selects which fields are relevant.
The UI and the exporter both branch on `comp_type`.

To add a new component type you:
  1. add an entry to COMPONENT_TYPES
  2. add its fields to BJSComponent below
  3. draw them in ui.py
  4. serialize them in export.py
  5. handle them in the Babylon runtime (ComponentRegistry / LevelLoader)
"""

import bpy
import os
import uuid
from bpy.props import (
    StringProperty, EnumProperty, FloatProperty, BoolProperty,
    FloatVectorProperty, IntProperty, CollectionProperty, PointerProperty,
)
from bpy.types import PropertyGroup, Object


# Custom-property key under which each object's stable GUID is stored. It is a
# dict-style custom property (obj["bjs_id"]) specifically so that the glTF
# exporter writes it into the node's `extras` (registered RNA props are NOT
# exported). On the Babylon side it surfaces at node.metadata.gltf.extras.bjs_id.
ID_KEY = "bjs_id"


def ensure_object_id(obj):
    """Return obj's GUID, generating and storing one if it doesn't have it yet."""
    current = obj.get(ID_KEY)
    if not current:
        current = uuid.uuid4().hex
        obj[ID_KEY] = current
    return current


COMPONENT_TYPES = [
    ('TAG',       "Tag",        "Assign a tag / layer name to this entity"),
    ('COLLIDER',  "Collider",   "Physics collision shape"),
    ('RIGIDBODY', "Rigid Body", "Physics body (mass, dynamics)"),
    ('SCRIPT',    "Script",     "Attach a named behavior script with parameters"),
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
    ('KINEMATIC', "Kinematic", "Moved by code or animation, not by forces"),
]


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

# Element types a LIST can hold.
LIST_ELEM_SLOT = {
    'FLOAT': "f_val", 'INT': "f_val", 'BOOL': "b_val",
    'STRING': "s_val", 'VECTOR3': "v_val", 'COLOR': "c_val",
    'ENTITY': "obj_val",
}

# Keeps dynamically-generated enum item tuples alive (Blender will crash if the
# strings returned by an EnumProperty items callback get garbage collected).
_ENUM_ITEMS_CACHE = {}


def _on_obj_ref_update(self, context):
    """Picking an object auto-assigns it a GUID so it can be referenced."""
    if self.obj_val is not None:
        ensure_object_id(self.obj_val)


_ENUM_SEP = "\x1f"  # unit separator — safe inside option strings


def _enum_choices(var):
    return [o for o in var.enum_options.split(_ENUM_SEP) if o != ""]


def _enum_items(self, context):
    choices = _enum_choices(self) or ["(none)"]
    items = [(c, c, "") for c in choices]
    _ENUM_ITEMS_CACHE[self.as_pointer()] = items
    return _ENUM_ITEMS_CACHE[self.as_pointer()]


def _enum_get(self):
    choices = _enum_choices(self)
    try:
        return choices.index(self.s_val)
    except ValueError:
        return 0


def _enum_set(self, value):
    choices = _enum_choices(self)
    if 0 <= value < len(choices):
        self.s_val = choices[value]


class BJSListItem(PropertyGroup):
    """One element of a LIST exposed var. The slot used depends on the var's
    elem_type (see LIST_ELEM_SLOT)."""
    f_val: FloatProperty(name="Value")
    b_val: BoolProperty(name="Value")
    s_val: StringProperty(name="Value")
    v_val: FloatVectorProperty(name="Value", size=3, subtype='XYZ')
    c_val: FloatVectorProperty(name="Value", size=3, subtype='COLOR',
                               min=0.0, max=1.0, default=(1.0, 1.0, 1.0))
    obj_val: PointerProperty(name="Object", type=Object, update=_on_obj_ref_update)


class BJSExposedVar(PropertyGroup):
    """One @exposed variable parsed from a behavior script. Auto-populated by
    syncing; the value slot used depends on `vtype`."""
    name:  StringProperty()
    vtype: EnumProperty(items=VAR_TYPES, default='FLOAT')
    label: StringProperty()

    f_val: FloatProperty(name="Value")
    b_val: BoolProperty(name="Value")
    s_val: StringProperty(name="Value")
    v_val: FloatVectorProperty(name="Value", size=3, subtype='XYZ')
    c_val: FloatVectorProperty(name="Value", size=3, subtype='COLOR',
                               min=0.0, max=1.0, default=(1.0, 1.0, 1.0))
    obj_val: PointerProperty(name="Object", type=Object, update=_on_obj_ref_update)

    # ENUM: choices stored as a separator-joined string; selection lives in s_val.
    enum_options: StringProperty()
    e_val: EnumProperty(name="Value", items=_enum_items, get=_enum_get, set=_enum_set)

    # LIST: element type + the items themselves.
    elem_type:  StringProperty(default='FLOAT')
    list_items: CollectionProperty(type=BJSListItem)
    list_index: IntProperty(default=0)


def sync_exposed_vars(comp, fields):
    """Reconcile a component's exposed_vars with freshly parsed `fields`,
    preserving existing values where the name and type still match."""
    existing = {v.name: v for v in comp.exposed_vars}
    keep = {f["name"] for f in fields}

    # Prune vars no longer exposed by the script.
    for i in range(len(comp.exposed_vars) - 1, -1, -1):
        if comp.exposed_vars[i].name not in keep:
            comp.exposed_vars.remove(i)

    for f in fields:
        v = existing.get(f["name"])
        new_type = f["vtype"]
        new_elem = f.get("elem_type") or 'FLOAT'
        # A list whose element type changed must be rebuilt; same for any type swap.
        recreate = (
            v is None
            or v.vtype != new_type
            or (new_type == 'LIST' and v.elem_type != new_elem)
        )
        if recreate:
            if v is not None:
                comp.exposed_vars.remove(list(comp.exposed_vars).index(v))
            v = comp.exposed_vars.add()
            v.name = f["name"]
            v.vtype = new_type
            v.elem_type = new_elem
            _init_var_value(v, f)
        # Enum choices can change without a type change, so refresh every sync.
        if new_type == 'ENUM':
            v.enum_options = _ENUM_SEP.join(f.get("options") or [])
            choices = _enum_choices(v)
            if choices and v.s_val not in choices:
                v.s_val = choices[0]
        v.label = f["label"]


def add_list_item(v, el=None):
    """Append an item to a LIST var, optionally initialised to `el`."""
    item = v.list_items.add()
    slot = LIST_ELEM_SLOT.get(v.elem_type, "f_val")
    if el is None or slot == "obj_val":
        return item  # entity items start empty; you pick the object in Blender
    if slot == "f_val":
        item.f_val = float(el)
    elif slot == "b_val":
        item.b_val = bool(el)
    elif slot == "s_val":
        item.s_val = str(el)
    else:  # v_val / c_val
        vals = list(el)[:3]
        vals += [0.0] * (3 - len(vals))
        setattr(item, slot, tuple(vals))
    return item


def _init_var_value(v, f):
    default = f["default"]
    t = v.vtype
    if t == 'FLOAT':
        v.f_val = float(default)
    elif t == 'BOOL':
        v.b_val = bool(default)
    elif t in ('STRING', 'ENUM'):
        v.s_val = str(default) if default is not None else ""
    elif t == 'VECTOR3':
        v.v_val = tuple(default)[:3]
    elif t == 'COLOR':
        v.c_val = tuple(default)[:3]
    elif t == 'ENTITY':
        v.obj_val = None
    elif t == 'LIST':
        v.list_items.clear()
        for el in (default or []):
            add_list_item(v, el)


class BJSComponent(PropertyGroup):
    comp_type: EnumProperty(name="Type", items=COMPONENT_TYPES, default='TAG')
    enabled:   BoolProperty(name="Enabled", default=True)

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
    collider_size:   FloatVectorProperty(name="Size", size=3, default=(1.0, 1.0, 1.0),
                                          min=0.0, subtype='XYZ',
                                          description="Babylon-space (Y-up) full size")
    collider_radius: FloatProperty(name="Radius", default=0.5, min=0.0)
    collider_height: FloatProperty(name="Height", default=2.0, min=0.0)
    collider_center: FloatVectorProperty(name="Center Offset", size=3, default=(0.0, 0.0, 0.0),
                                         subtype='XYZ', description="Babylon-space offset")

    # --- RIGIDBODY ---
    body_type:       EnumProperty(name="Body Type", items=BODY_TYPES, default='DYNAMIC')
    mass:            FloatProperty(name="Mass", default=1.0, min=0.0)
    friction:        FloatProperty(name="Friction", default=0.5, min=0.0, max=1.0)
    restitution:     FloatProperty(name="Restitution (Bounce)", default=0.2, min=0.0, max=1.0)
    linear_damping:  FloatProperty(name="Linear Damping", default=0.0, min=0.0)
    angular_damping: FloatProperty(name="Angular Damping", default=0.0, min=0.0)

    # --- SCRIPT ---
    script_path: StringProperty(
        name="File", subtype='FILE_PATH', default="",
        description="Path to the behavior source file (picked via Open Script)",
        update=_on_script_path_update)
    # Registry key, derived from the picked file. Not user-editable; exposed
    # variables will come from decorators in the script itself.
    script_name: StringProperty(name="Script", default="")
    exposed_vars: CollectionProperty(type=BJSExposedVar)


SHADOW_FILTERS = [
    ('PCF',      "PCF",            "Percentage-closer filtering (soft edges, default)"),
    ('PCSS',     "PCSS (Contact)", "Contact-hardening soft shadows; softness grows with distance"),
    ('POISSON',  "Poisson",        "Poisson-disk sampling"),
    ('BLUR_ESM', "Blur ESM",       "Blurred exponential shadow map (very soft)"),
    ('NONE',     "Hard",           "No filtering — hard, aliased edges"),
]


class BJSLightShadow(PropertyGroup):
    """Babylon shadow controls for a light. These are Babylon concepts (they
    don't map onto Blender's renderer-specific shadow settings), so they live in
    the Babylon panel and are applied to the ShadowGenerator / light at load."""
    map_size: IntProperty(
        name="Map Size", default=0, min=0, max=8192,
        description="Shadow map resolution for this light. 0 = use the loader default (1024)")
    bias: FloatProperty(
        name="Bias", default=0.00005, min=0.0, soft_max=0.01, precision=5,
        description="Depth bias to fight shadow acne (self-shadowing artifacts)")
    normal_bias: FloatProperty(
        name="Normal Bias", default=0.0, min=0.0, soft_max=0.1, precision=4,
        description="Offset along the surface normal; helps on steep angles")
    darkness: FloatProperty(
        name="Darkness", default=0.0, min=0.0, max=1.0,
        description="0 = fully black shadow, 1 = invisible")
    min_z: FloatProperty(
        name="Clip Start", default=0.0, min=0.0,
        description="Near plane of the shadow frustum. 0 = let Babylon auto-fit")
    max_z: FloatProperty(
        name="Clip End", default=0.0, min=0.0,
        description="Far plane of the shadow frustum. 0 = let Babylon auto-fit")
    filter: EnumProperty(name="Filter", items=SHADOW_FILTERS, default='PCF')


classes = (
    BJSListItem,
    BJSExposedVar,
    BJSComponent,
    BJSLightShadow,
)


def register():
    for c in classes:
        bpy.utils.register_class(c)
    # Per-object component list. Object names are unique within a .blend file,
    # which is how we match entities back to glTF nodes at load time.
    Object.bjs_components = CollectionProperty(type=BJSComponent)
    Object.bjs_components_index = IntProperty(default=0)
    # Per-light Babylon shadow settings (only used/drawn for LIGHT objects).
    Object.bjs_shadow = PointerProperty(type=BJSLightShadow)


def unregister():
    del Object.bjs_shadow
    del Object.bjs_components_index
    del Object.bjs_components
    for c in reversed(classes):
        bpy.utils.unregister_class(c)
