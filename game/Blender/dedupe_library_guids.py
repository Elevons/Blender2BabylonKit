"""
Dedupe library GUIDs across several .blend files — headless Blender script
==========================================================================

Gives every object a ``bjs_id`` that is unique *across all the .blend files
processed in one run*, not just within each file.

Why a shared registry
---------------------
Deduping each library on its own is not enough. ``Small Rover.blend``
contains its own copy of the Engine Rover rig carrying the same GUIDs as
the objects in ``Engine Rover.blend``. Each file looks internally
consistent, but a level that links both gets a collision. So one run walks
every file in order, carrying a registry of claimed GUIDs on disk.

Order matters: the first file to claim a GUID keeps it. List the file that
"owns" an object before any file that holds a copy of it.

Why the source files and not the level
--------------------------------------
Linked data is re-read from its library every time the level is opened, so
a GUID rewritten in the level file is discarded on reload. Only the source
library can hold the fix.

Safety
------
No .blend stores a GUID as a raw string — constraint targets, camera
targets, @exposed object vars and the Atmosphere sun light are all real
object pointers, and the GUID is read off the pointer at export time. So
re-issuing an id cannot dangle a reference. Blender writes a .blend1
backup next to each file it saves.

Usage
-----
    blender --background "file.blend" --python dedupe_library_guids.py \\
        -- --registry /tmp/guids.json --log /tmp/report.txt [--dry-run]

Run it once per file, in order, reusing the same --registry path. Objects
that have no GUID are left alone — this never creates new entities.

Afterwards: reload the libraries in each level file (or just open and save
it), re-run Validate, then re-export.
"""

import bpy
import json
import os
import sys
import uuid

ID_KEY = "bjs_id"


def parse_args():
    """Read the arguments after the ``--`` separator Blender passes through."""
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []

    options = {"registry": None, "log": None, "dry_run": False}
    index = 0
    while index < len(argv):
        argument = argv[index]
        if argument == "--dry-run":
            options["dry_run"] = True
        elif argument == "--registry":
            index += 1
            options["registry"] = argv[index]
        elif argument == "--log":
            index += 1
            options["log"] = argv[index]
        index += 1

    if options["registry"] is None:
        raise SystemExit("dedupe_library_guids: --registry PATH is required")
    return options


def load_registry(path):
    """guid -> "file::object" of whoever claimed it first."""
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as registry_file:
        return json.load(registry_file)


def save_registry(path, registry):
    with open(path, "w", encoding="utf-8") as registry_file:
        json.dump(registry, registry_file, indent=1, sort_keys=True)


def local_objects():
    """Objects that live in this file, sorted by name so runs are reproducible.
    Linked objects belong to another library and are fixed when that file's turn
    comes, so they are skipped here."""
    return sorted(
        (obj for obj in bpy.data.objects if obj.library is None),
        key=lambda obj: obj.name)


def main():
    options = parse_args()
    registry = load_registry(options["registry"])
    blend_name = os.path.basename(bpy.data.filepath)

    lines = []

    def log(message=""):
        lines.append(str(message))
        print(str(message))

    log("=" * 70)
    log("FILE: %s" % bpy.data.filepath)
    if options["dry_run"]:
        log("DRY RUN — nothing will be written")

    reissued = []
    claimed = 0
    without_id = 0

    for obj in local_objects():
        guid = obj.get(ID_KEY)
        if not guid:
            without_id += 1
            continue

        holder = "%s::%s" % (blend_name, obj.name)
        owner = registry.get(guid)

        if owner is None or owner == holder:
            registry[guid] = holder
            claimed += 1
            continue

        fresh = uuid.uuid4().hex
        while fresh in registry:
            fresh = uuid.uuid4().hex

        if not options["dry_run"]:
            obj[ID_KEY] = fresh
        registry[fresh] = holder
        reissued.append((obj.name, guid, fresh, owner))

    log("objects: %d local, %d kept their id, %d re-issued, %d have no id"
        % (len(local_objects()), claimed, len(reissued), without_id))

    if reissued:
        log()
        log("RE-ISSUED (%d) — 'was' was already claimed by the file in brackets"
            % len(reissued))
        for name, was, now, owner in reissued:
            log("  %-28s %s -> %s   [%s]" % (name, was, now, owner))

    if reissued and not options["dry_run"]:
        bpy.ops.wm.save_mainfile()
        log("SAVED %s" % bpy.data.filepath)
    elif not reissued:
        log("nothing to change — not saving")

    save_registry(options["registry"], registry)

    if options["log"]:
        with open(options["log"], "a", encoding="utf-8") as log_file:
            log_file.write("\n".join(lines) + "\n")


main()
