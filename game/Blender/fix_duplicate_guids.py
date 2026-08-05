"""
Fix Duplicate GUIDs — standalone Blender Text Editor script
============================================================

Makes the "share a GUID" validation warnings go away permanently by
re-issuing a fresh ``bjs_id`` on every object after the first that carries
a given GUID, then saving the .blend.

Why this is needed
------------------
Blender copies custom properties when you duplicate an object, and a
library override starts life carrying the GUIDs of the objects it was
linked from. So Alt-D scatters, Ctrl-C/Ctrl-V copies and multiple
instances of the same prefab all end up sharing one ``bjs_id``.

``_dedupe_entity_ids`` in ``export/level.py`` already repairs this at
export time, but only in memory and only for the scene being exported.
Unless the .blend happens to get saved afterwards the duplicates come
back next session, GUIDs churn on every export, and validate keeps
shouting. Running this once and saving makes the ids stable.

Is it safe?
-----------
Yes. Nothing in a .blend stores a GUID as a raw string — every entity
pointer (constraint targets, camera targets, @exposed object vars,
Atmosphere sun light, probe refs) is a real Blender object pointer, and
the GUID is only read off that pointer while the manifest is being
written. Re-issuing an id therefore cannot dangle a reference.

The ids in an already-exported .scene.json / .glb do change, so re-export
the level afterwards.

How to use
----------
1. Open the .blend you want fixed (e.g. "Train Scene.blend").
2. Open this file in Blender's Text Editor (or paste it in), press Run Script.
3. Open the report next to the .blend:
   ``<blend-name>_guid_fix_report.txt``
   (a Blender Info popup also shows the path when the script finishes).
4. Re-run Babylon Scene > Validate, then re-export the level.

Set DRY_RUN = True below to see what would change without touching anything.
"""

import bpy
import os
import uuid

DRY_RUN = False

ID_KEY = "bjs_id"

# Lines collected for the on-disk report (and mirrored to print()).
_lines = []


def log(message=""):
    """Append one report line and echo it to stdout if a console is attached."""
    text = str(message)
    _lines.append(text)
    print(text)


def is_writable(obj):
    """Linked (non-overridden) objects belong to the library file and reject
    custom-property writes — their GUIDs have to be fixed in the source .blend."""
    return obj.library is None


def source_label(obj):
    """Where this object really lives, for the report."""
    if obj.library is not None:
        return "linked from %s" % obj.library.filepath
    if obj.override_library is not None:
        reference = obj.override_library.reference
        library = reference.library if reference is not None else None
        return "override of %s" % (library.filepath if library else "?")
    return "local"


def ordered_objects():
    """Every object, scene members first in scene order so the object that keeps
    the original GUID is the same one export's _dedupe_entity_ids would keep."""
    ordered = []
    seen = set()
    for scene in bpy.data.scenes:
        for obj in scene.objects:
            if obj.name_full not in seen:
                seen.add(obj.name_full)
                ordered.append(obj)
    for obj in bpy.data.objects:
        if obj.name_full not in seen:
            seen.add(obj.name_full)
            ordered.append(obj)
    return ordered


def report_path():
    """``Train Scene_guid_fix_report.txt`` next to the open .blend."""
    blend_path = bpy.data.filepath
    if not blend_path:
        return os.path.join(os.path.expanduser("~"), "guid_fix_report.txt")
    stem, _ = os.path.splitext(blend_path)
    return stem + "_guid_fix_report.txt"


log("=" * 70)
log("Deduplicating bjs_id in: %s" % bpy.data.filepath)
if DRY_RUN:
    log("DRY RUN — nothing will be written")
log("=" * 70)

owners = {}          # guid -> first object that claimed it
groups = {}          # guid -> list of later objects sharing it
reissued = []
blocked = []

for obj in ordered_objects():
    guid = obj.get(ID_KEY)
    if not guid:
        continue

    owner = owners.get(guid)
    if owner is None:
        owners[guid] = obj
        continue

    groups.setdefault(guid, []).append(obj)

    if not is_writable(obj):
        blocked.append((obj, owner, guid, "linked data"))
        continue

    fresh = uuid.uuid4().hex
    if not DRY_RUN:
        try:
            obj[ID_KEY] = fresh
        except Exception as error:
            # A partially-editable override can still refuse the write.
            blocked.append((obj, owner, guid, str(error)))
            continue
    reissued.append((obj, owner, fresh))

log()
log("--- DUPLICATE GROUPS (%d) ---" % len(groups))
for guid, members in sorted(groups.items(), key=lambda item: -len(item[1])):
    owner = owners[guid]
    log("  %s  kept by '%s' (%s), %d duplicate(s)"
        % (guid, owner.name, source_label(owner), len(members)))
    for member in members[:8]:
        log("      %s (%s)" % (member.name, source_label(member)))
    if len(members) > 8:
        log("      ... and %d more" % (len(members) - 8))

log()
log("--- RE-ISSUED (%d) ---" % len(reissued))
for obj, owner, fresh in reissued:
    log("  %s  was sharing with '%s'  ->  %s" % (obj.name, owner.name, fresh))

log()
log("--- COULD NOT FIX (%d) — edit the source .blend instead ---" % len(blocked))
for obj, owner, guid, reason in blocked:
    log("  %s (%s) shares %s with '%s' — %s"
        % (obj.name, source_label(obj), guid, owner.name, reason))

log()
log("Total objects with a GUID: %d" % len(owners))

if reissued and not DRY_RUN:
    bpy.ops.wm.save_mainfile()
    log()
    log("Saved: %s" % bpy.data.filepath)
    log("Now re-run Validate, then re-export the level.")
elif DRY_RUN:
    log()
    log("Dry run — not saving.")
else:
    log()
    log("No duplicates to fix — not saving.")

out_path = report_path()
with open(out_path, "w", encoding="utf-8") as report_file:
    report_file.write("\n".join(_lines) + "\n")

# Blender Info area (bottom of the window / Window > Toggle System Console
# is not required) — shows the path so you know where to look.
summary = "Report written to %s  (re-issued %d, blocked %d)" % (
    out_path, len(reissued), len(blocked))
try:
    bpy.context.window_manager.popup_menu(
        lambda self, _context: self.layout.label(text=summary),
        title="GUID Fix",
        icon='INFO')
except Exception:
    pass

# Also push into the Info log (same place validate warnings go).
print(summary)
