"""@exposed script variables: the PropertyGroups that store parsed script
parameters per component, plus the sync logic that reconciles them with a
fresh parse of the script source."""

from bpy.types import PropertyGroup, Object

from ..core.props import (
    StringProperty, EnumProperty, FloatProperty, BoolProperty,
    FloatVectorProperty, IntProperty, CollectionProperty, PointerProperty,
)

from ..core.ids import ensure_object_id
from ..core.prop_copy import remove_collection_item
from .constants import LIST_ELEM_SLOT, ENUM_SEP

# Keeps dynamically-generated enum item tuples alive (Blender will crash if the
# strings returned by an EnumProperty items callback get garbage collected).
_ENUM_ITEMS_CACHE = {}


def _on_obj_ref_update(self, context):
    """Picking an object auto-assigns it a GUID so it can be referenced."""
    if self.obj_val is not None:
        ensure_object_id(self.obj_val)


def _enum_choices(var):
    return [o for o in var.enum_options.split(ENUM_SEP) if o != ""]


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


def _list_count_get(self):
    return len(self.list_items)


def _list_count_set(self, value):
    """Resize a LIST var to `value` items by adding/removing from the end —
    lets the user type a length instead of repeatedly hitting +."""
    value = max(0, value)
    while len(self.list_items) > value:
        remove_collection_item(self.list_items, len(self.list_items) - 1)
    while len(self.list_items) < value:
        add_list_item(self)
    self.list_index = max(0, len(self.list_items) - 1)


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
    # String id ('ENTITY', 'COLOR', …) — not EnumProperty, so .blend files survive
    # reordering VAR_TYPES. Set by sync from script_parse, never user-edited.
    vtype: StringProperty(default='FLOAT')
    label: StringProperty()

    f_val: FloatProperty(name="Value")
    b_val: BoolProperty(name="Value")
    s_val: StringProperty(name="Value")
    v2_val: FloatVectorProperty(name="Value", size=2, subtype='XYZ')
    v_val: FloatVectorProperty(name="Value", size=3, subtype='XYZ')
    c_val: FloatVectorProperty(name="Value", size=3, subtype='COLOR',
                               min=0.0, max=1.0, default=(1.0, 1.0, 1.0))
    obj_val: PointerProperty(name="Object", type=Object, update=_on_obj_ref_update)

    # ENUM: choices stored as a separator-joined string; selection lives in s_val.
    enum_options: StringProperty()
    e_val: EnumProperty(
        name="Value", items=_enum_items, get=_enum_get, set=_enum_set,
        overridable=False,
    )

    # LIST: element type + the items themselves.
    elem_type:  StringProperty(default='FLOAT')
    list_items: CollectionProperty(type=BJSListItem)
    list_index: IntProperty(default=0)
    # Per-list collapse, independent of the component's own show_expanded.
    show_expanded: BoolProperty(default=True)
    # Typed length: reading returns the current item count, writing resizes.
    list_count: IntProperty(
        name="Count", description="Number of items in the list",
        min=0, get=_list_count_get, set=_list_count_set,
        overridable=False,
    )


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
    elif t == 'VECTOR2':
        vals = list(default)[:2]
        vals += [0.0] * (2 - len(vals))
        v.v2_val = tuple(vals)
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


def _retype_var(v, f):
    """Change a var's type in place and re-init its value slots, preserving an
    entity pick that survived in obj_val across a stale/other-type slot."""
    kept_obj = v.obj_val if f["vtype"] == 'ENTITY' else None
    v.vtype = f["vtype"]
    v.elem_type = f.get("elem_type") or 'FLOAT'
    _init_var_value(v, f)
    if kept_obj is not None:
        v.obj_val = kept_obj


def sync_exposed_vars(comp, fields):
    """Reconcile a component's exposed_vars with freshly parsed `fields`,
    updating rows in place (never clear()+rebuild — that duplicates linked rows
    on library-override prefabs). Existing values are preserved when the name and
    type still match; type changes re-init the value slots.

    Also de-duplicates: earlier bugs could leave two rows with the same name, so
    only the first occurrence of each name is kept before reconciling."""
    keep = {f["name"] for f in fields}

    # Prune rows no longer exposed, plus duplicate-name rows (keep the first).
    first_index = {}
    for index, v in enumerate(comp.exposed_vars):
        first_index.setdefault(v.name, index)
    for index in range(len(comp.exposed_vars) - 1, -1, -1):
        name = comp.exposed_vars[index].name
        if name not in keep or first_index[name] != index:
            remove_collection_item(comp.exposed_vars, index)

    existing = {v.name: v for v in comp.exposed_vars}

    for f in fields:
        v = existing.get(f["name"])
        new_type = f["vtype"]
        new_elem = f.get("elem_type") or 'FLOAT'
        if v is None:
            v = comp.exposed_vars.add()
            v.name = f["name"]
            v.vtype = new_type
            v.elem_type = new_elem
            _init_var_value(v, f)
        elif v.vtype != new_type or (new_type == 'LIST' and v.elem_type != new_elem):
            _retype_var(v, f)
        # else: same type — keep the authored value untouched.

        if new_type == 'ENUM':
            v.enum_options = ENUM_SEP.join(f.get("options") or [])
            choices = _enum_choices(v)
            if choices and v.s_val not in choices:
                v.s_val = choices[0]
        v.label = f["label"]


def _source_var_default(v):
    """The current value of an exposed var expressed as a script_parse-style
    `default`, so it can seed a newly-added row when syncing an override against
    its source (the prefab value becomes the starting value on the instance)."""
    t = v.vtype
    if t == 'FLOAT':
        return v.f_val
    if t == 'BOOL':
        return v.b_val
    if t in ('STRING', 'ENUM'):
        return v.s_val
    if t == 'VECTOR2':
        return list(v.v2_val)
    if t == 'VECTOR3':
        return list(v.v_val)
    if t == 'COLOR':
        return list(v.c_val)
    if t == 'ENTITY':
        return None
    if t == 'LIST':
        slot = LIST_ELEM_SLOT.get(v.elem_type, "f_val")
        items = []
        for item in v.list_items:
            value = getattr(item, slot)
            items.append(list(value) if slot in ("v_val", "c_val") else value)
        return items
    return 0.0


def build_fields_from_component(comp):
    """Produce script_parse-style field dicts from a component's own exposed_vars.

    Used to sync a library-override (linked prefab) instance against its source
    object instead of re-parsing the .ts: an override cannot remove its linked
    base rows, so the source component is the structural authority. Feeding these
    fields back through `sync_exposed_vars` makes the instance mirror the prefab
    and drops only the removable local stray rows a bad earlier sync left behind."""
    fields = []
    for v in comp.exposed_vars:
        fields.append({
            "name": v.name,
            "label": v.label,
            "vtype": v.vtype,
            "elem_type": v.elem_type or 'FLOAT',
            "options": _enum_choices(v),
            "default": _source_var_default(v),
        })
    return fields
