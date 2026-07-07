"""Operators for SCRIPT components: pick the behavior source file and sync its
@exposed variables into the component."""

import bpy
from bpy.props import IntProperty, StringProperty, BoolProperty
from bpy.types import Operator

from ..core import script_parse
from ..core.inspector import inspector_object
from ..components.exposed_vars import sync_exposed_vars, build_fields_from_component


def _override_source_component(obj, comp, comp_index):
    """For a library-override (linked prefab) object, the matching SCRIPT
    component on the read-only source object reached via
    `override_library.reference`. That source is the structural authority for
    @exposed vars, since an override cannot remove its linked base rows. Returns
    None for local objects, so they fall back to parsing the .ts directly."""
    override = getattr(obj, "override_library", None)
    if override is None or override.reference is None:
        return None

    source_obj = override.reference
    source_comps = getattr(source_obj, "bjs_components", None)
    if not source_comps:
        return None

    name = comp.script_name
    matches = [
        c for c in source_comps
        if c.comp_type == 'SCRIPT' and name and c.script_name == name
    ]
    if len(matches) == 1:
        return matches[0]

    # Ambiguous (same script twice) or no name match: try the same index.
    if 0 <= comp_index < len(source_comps):
        candidate = source_comps[comp_index]
        if candidate.comp_type == 'SCRIPT':
            return candidate
    return matches[0] if matches else None


def _merge_override_fields(source_comp, script_path):
    """Field list for a library-override SCRIPT sync.

    Names already on the prefab source keep their library values and types.
    Names only in the script are appended so new @exposed vars show up on the
    level before the prefab is re-synced. After the library reloads, the next
    override sync clears the temporary local rows and reconciles the linked ones.
    """
    source_fields = build_fields_from_component(source_comp)
    source_names = {field["name"] for field in source_fields}
    script_fields = script_parse.parse_exposed(bpy.path.abspath(script_path))
    script_only = [
        field for field in script_fields
        if field["name"] not in source_names
    ]
    return source_fields + script_only, len(script_only)


def _clear_override_local_rows(comp):
    """Drop locally-inserted exposed-var rows on an override.

    Linked base rows survive; a later in-place reconcile never re-adds names that
    already exist as linked rows (the old clear()+rebuild duplication trap)."""
    try:
        comp.exposed_vars.clear()
    except TypeError:
        pass


def _sync_component_vars(obj, comp, comp_index):
    """Sync a SCRIPT component's exposed vars. On a library override we reconcile
    against the prefab source object (never modifying it — we only read its
    structure), plus any @exposed names not yet on the source from the script
    file. Otherwise we parse the .ts. Returns (count, from_source, script_only)."""
    source_comp = _override_source_component(obj, comp, comp_index)
    if source_comp is not None:
        fields, script_only = _merge_override_fields(source_comp, comp.script_path)
        _clear_override_local_rows(comp)
        sync_exposed_vars(comp, fields)
        return len(fields), True, script_only

    fields = script_parse.parse_exposed(bpy.path.abspath(comp.script_path))
    sync_exposed_vars(comp, fields)
    return len(fields), False, 0


class BJS_OT_pick_script(Operator):
    """Open a file browser to select the behavior source file for a SCRIPT component."""
    bl_idname = "bjs.pick_script"
    bl_label = "Open Script"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()
    filepath: StringProperty(subtype='FILE_PATH')
    # Show only script-like files in the browser.
    filter_glob: StringProperty(
        default="*.ts;*.tsx;*.js;*.jsx;*.mjs", options={'HIDDEN'})
    use_relative: BoolProperty(
        name="Relative Path", default=True,
        description="Store the path relative to the .blend file when possible")

    def invoke(self, context, event):
        # Opens Blender's file browser; selection comes back in execute().
        context.window_manager.fileselect_add(self)
        return {'RUNNING_MODAL'}

    def execute(self, context):
        obj = inspector_object(context)
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            self.report({'WARNING'}, "Invalid component")
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]

        path = self.filepath
        if self.use_relative and bpy.data.filepath:
            try:
                path = bpy.path.relpath(path)
            except ValueError:
                pass  # e.g. a different drive on Windows; keep the absolute path

        # Setting script_path triggers its update() which derives script_name.
        comp.script_path = path
        _sync_component_vars(obj, comp, self.comp_index)
        self.report({'INFO'}, f"Script: {comp.script_name}")
        return {'FINISHED'}


class BJS_OT_sync_vars(Operator):
    """Re-read @exposed variables after editing the script.

    On a library-override prefab instance, reconciles linked source rows and
    adds any names that exist in the script but not yet on the prefab source."""
    bl_idname = "bjs.sync_vars"
    bl_label = "Sync Variables"
    bl_options = {'REGISTER', 'UNDO'}

    comp_index: IntProperty()

    def execute(self, context):
        obj = inspector_object(context)
        if not obj or not (0 <= self.comp_index < len(obj.bjs_components)):
            return {'CANCELLED'}
        comp = obj.bjs_components[self.comp_index]
        if not comp.script_path:
            self.report({'WARNING'}, "Pick a script first")
            return {'CANCELLED'}
        count, from_source, script_only = _sync_component_vars(
            obj, comp, self.comp_index)
        if from_source and script_only:
            self.report(
                {'INFO'},
                f"Synced {count} variable(s) from prefab source "
                f"(+{script_only} new from script)",
            )
        elif from_source:
            self.report({'INFO'}, f"Synced {count} variable(s) from prefab source")
        else:
            self.report({'INFO'}, f"Synced {count} variable(s)")
        return {'FINISHED'}


classes = (
    BJS_OT_pick_script,
    BJS_OT_sync_vars,
)
