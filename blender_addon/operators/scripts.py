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


def _sync_component_vars(obj, comp, comp_index):
    """Sync a SCRIPT component's exposed vars. On a library override we reconcile
    against the prefab source object (never modifying it — we only read its
    structure); otherwise we parse the .ts. Returns (count, from_source)."""
    source_comp = _override_source_component(obj, comp, comp_index)
    if source_comp is not None:
        fields = build_fields_from_component(source_comp)
        # An override forbids remove() on its exposed-var rows, so corruption
        # strays a plain resync leaves behind can't be deleted one by one.
        # clear() is allowed and drops only the locally-inserted rows while
        # keeping the linked base rows (which mirror the source) — so clearing
        # the strays, then reconciling the survivors in place, makes the instance
        # match the prefab. No rows are re-added (the linked ones already match by
        # name), so this avoids the duplication a clear()+rebuild would cause.
        try:
            comp.exposed_vars.clear()
        except TypeError:
            pass
        sync_exposed_vars(comp, fields)
        return len(fields), True

    fields = script_parse.parse_exposed(bpy.path.abspath(comp.script_path))
    sync_exposed_vars(comp, fields)
    return len(fields), False


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
    """Re-read @exposed variables from the script file (after editing it)."""
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
        n, from_source = _sync_component_vars(obj, comp, self.comp_index)
        origin = " from prefab source" if from_source else ""
        self.report({'INFO'}, f"Synced {n} variable(s){origin}")
        return {'FINISHED'}


classes = (
    BJS_OT_pick_script,
    BJS_OT_sync_vars,
)
