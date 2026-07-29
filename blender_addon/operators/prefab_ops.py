"""Operators for linking a prefab collection from another .blend file into the
level, auto-applying a library override (so components are editable and export
correctly — the documented prefab workflow in docs/blender/PREFABS.html), and
assigning the linked hierarchy's root object to an exposed ENTITY variable.

Surfaced as the link button next to every ENTITY exposed-var picker
(ui/component_bodies.py _draw_var) — e.g. PopulatePrefabs' "Prefab" field."""

import bpy
from bpy.props import EnumProperty, IntProperty, StringProperty
from bpy.types import Operator

from ..core.inspector import inspector_object

# Handoff between the file browser and the collection picker popup. The names
# list must stay referenced here — dynamic EnumProperty items that point at
# garbage-collected strings are a classic Blender crash.
_pick_state = {"filepath": "", "names": []}


def _resolve_entity_var(context, comp_index, var_index):
    """The exposed ENTITY var the invoking link button belongs to, or None."""
    obj = inspector_object(context)
    if obj is None or not (0 <= comp_index < len(obj.bjs_components)):
        return None
    comp = obj.bjs_components[comp_index]
    if not (0 <= var_index < len(comp.exposed_vars)):
        return None
    var = comp.exposed_vars[var_index]
    return var if var.vtype == 'ENTITY' else None


def _collection_root_object(collection):
    """The hierarchy root inside a collection: an object whose parent is None
    or lives outside the collection. Prefers a root carrying components."""
    objects = list(collection.all_objects)
    inside = set(objects)
    roots = [o for o in objects if o.parent is None or o.parent not in inside]
    if not roots:
        return None
    for root in roots:
        if len(getattr(root, "bjs_components", [])) > 0:
            return root
    return roots[0]


def _link_orphan_hierarchy_objects(collection, fallback_collection):
    """Link override objects that are parented under the collection's hierarchy
    but belong to no collection themselves. override_hierarchy_create only
    links objects that were members of the SOURCE collection — children merely
    parented under the root (LOD meshes kept in a separate collection in the
    library, for instance) become orphan datablocks: invisible in the viewport
    and skipped by export.

    Override collections refuse objects.link() ("collection is overridden"),
    so orphans go into fallback_collection — a local, writable one. Object
    parenting, not collection membership, drives the exported hierarchy, so
    placement only affects outliner tidiness. Returns the number linked."""
    if collection.override_library is None and collection.library is None:
        destination = collection
    else:
        destination = fallback_collection

    members = set(collection.all_objects)
    linked_count = 0
    for member in list(members):
        for child in member.children_recursive:
            if child not in members and len(child.users_collection) == 0:
                destination.objects.link(child)
                members.add(child)
                linked_count += 1
    return linked_count


def _link_prefab_collection(context, filepath, collection_name):
    """Link one collection from a library .blend and apply a library-override
    hierarchy so the objects become editable scene members. Returns
    (root_object, error_message) — exactly one is None."""
    try:
        with bpy.data.libraries.load(filepath, link=True) as (data_from, data_to):
            if collection_name not in data_from.collections:
                return None, f"No collection '{collection_name}' in {filepath}"
            data_to.collections = [collection_name]
    except OSError as error:
        return None, f"Could not read {filepath}: {error}"

    linked = data_to.collections[0] if data_to.collections else None
    if linked is None:
        return None, f"Could not link '{collection_name}' from {filepath}"

    # The override makes the hierarchy real, editable scene objects — a bare
    # linked collection instance is a single empty and its components would be
    # read-only. override_hierarchy_create also instantiates it in the scene.
    override = linked.override_hierarchy_create(
        context.scene, context.view_layer, do_fully_editable=True)

    target = override if override is not None else linked
    if override is None:
        # Extremely defensive fallback: keep the linked collection usable.
        context.scene.collection.children.link(linked)
    else:
        orphan_count = _link_orphan_hierarchy_objects(override, context.scene.collection)
        if orphan_count > 0:
            print(f"[bjs] Link prefab: linked {orphan_count} orphan child "
                  f"object(s) of '{collection_name}' into the scene")

    root = _collection_root_object(target)
    if root is None:
        return None, f"'{collection_name}' contains no objects"
    return root, None


def _link_and_assign(operator, context, filepath, collection_name):
    """Shared tail of both operators: link + override + assign to the var."""
    var = _resolve_entity_var(context, operator.comp_index, operator.var_index)
    if var is None:
        operator.report({'ERROR'}, "The invoking Entity variable no longer exists")
        return {'CANCELLED'}

    root, error = _link_prefab_collection(context, filepath, collection_name)
    if root is None:
        operator.report({'ERROR'}, error)
        return {'CANCELLED'}

    # The obj_val update callback assigns the root a GUID automatically.
    var.obj_val = root
    operator.report(
        {'INFO'},
        f"Linked '{collection_name}' with library override — root '{root.name}' assigned")
    return {'FINISHED'}


class BJS_OT_link_prefab(Operator):
    """Link a prefab collection from another .blend file, auto-apply a library
    override, and assign its root object to this Entity variable"""
    bl_idname = "bjs.link_prefab"
    bl_label = "Link Prefab From File"
    bl_options = {'REGISTER', 'UNDO'}

    filepath: StringProperty(subtype='FILE_PATH')
    filter_glob: StringProperty(default="*.blend", options={'HIDDEN'})
    comp_index: IntProperty()
    var_index: IntProperty()

    def invoke(self, context, event):
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        if not self.filepath.lower().endswith(".blend"):
            self.report({'ERROR'}, "Pick a .blend file")
            return {'CANCELLED'}
        if bpy.data.filepath and bpy.path.abspath(self.filepath) == bpy.data.filepath:
            self.report({'ERROR'}, "Cannot link a prefab from the current file")
            return {'CANCELLED'}

        try:
            with bpy.data.libraries.load(self.filepath, link=True) as (data_from, _data_to):
                names = [name for name in data_from.collections if name]
        except OSError as error:
            self.report({'ERROR'}, f"Could not read {self.filepath}: {error}")
            return {'CANCELLED'}

        if not names:
            self.report({'ERROR'}, "That .blend contains no collections")
            return {'CANCELLED'}

        if len(names) == 1:
            return _link_and_assign(self, context, self.filepath, names[0])

        # Several collections: hand off to the search popup picker.
        _pick_state["filepath"] = self.filepath
        _pick_state["names"] = names
        bpy.ops.bjs.link_prefab_collection(
            'INVOKE_DEFAULT', comp_index=self.comp_index, var_index=self.var_index)
        return {'FINISHED'}


def _collection_items(self, context):
    return [(name, name, "") for name in _pick_state["names"]]


class BJS_OT_link_prefab_collection(Operator):
    """Pick which collection to link from the chosen prefab .blend"""
    bl_idname = "bjs.link_prefab_collection"
    bl_label = "Link Prefab Collection"
    bl_options = {'REGISTER', 'UNDO'}
    bl_property = "collection_name"

    collection_name: EnumProperty(items=_collection_items, name="Collection")
    comp_index: IntProperty()
    var_index: IntProperty()

    def invoke(self, context, event):
        context.window_manager.invoke_search_popup(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        return _link_and_assign(self, context, _pick_state["filepath"], self.collection_name)


classes = (
    BJS_OT_link_prefab,
    BJS_OT_link_prefab_collection,
)
