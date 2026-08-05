"""
Fix Broken Links — standalone Blender Text Editor script
==========================================================

Repoints file references that broke when the project moved from
"apps/playground/" to "game/" (linked libraries, particle/audio/gui
component files, node-material JSON, post-processing LUT) and when the
Texturing library was reorganized (sand albedo/roughness converted
jpg -> png, moved under Nature/Ground/Sand/...; underwater HDRI moved
under Environment/Underwater/...). It also moves authored workspace
references from "game/public/workspace/" to "game/workspace/".

How to use
----------
1. Open the .blend file you want fixed (e.g. "Train Scene 2.blend").
2. Open this file in Blender's Text Editor (or paste it in) and press Run Script.
3. Check the System Console (Window > Toggle System Console on Windows,
   or launch Blender from a terminal on Linux/Mac) for the report.
4. The script saves the file itself once everything it CAN find is fixed.
   Anything it can't find is printed under "STILL BROKEN" and left alone.

Only rewrites a path when the new target actually exists on disk — it
never guesses.
"""

import bpy
import os

OLD_PREFIX = "apps/playground"
NEW_PREFIX = "game"
OLD_WORKSPACE_PREFIX = "public/workspace"
NEW_WORKSPACE_PREFIX = "workspace"

TEX_ROOT = "/home/jordan/Dropbox/1-Resources/1 Media/Texturing"
SAND_DIR = TEX_ROOT + "/Nature/Ground/Sand/Sand 1/TexturesCom_Ground_SandDesert2_3x3_512"
IMAGE_FIXES = {
    "TexturesCom_Ground_SandDesert2_3x3_512_albedo.jpg": SAND_DIR + "/TexturesCom_Ground_SandDesert2_3x3_512_albedo.png",
    "TexturesCom_Ground_SandDesert2_3x3_512_normal.png": SAND_DIR + "/TexturesCom_Ground_SandDesert2_3x3_512_normal.png",
    "TexturesCom_Ground_SandDesert2_3x3_512_roughness.jpg": SAND_DIR + "/TexturesCom_Ground_SandDesert2_3x3_512_roughness.png",
    "UNDERWATER-04SN.hdr": TEX_ROOT + "/Environment/Underwater/UNDERWATER-04SN.hdr",
}

COMPONENT_FILE_FIELDS = [
    "audio_file", "gui_file", "particle_file",
    "msdf_font_json", "msdf_font_texture", "gui3d_image", "file",
]

still_broken = []
fixed = []


def swap(path):
    if path and OLD_PREFIX in path:
        path = path.replace(OLD_PREFIX, NEW_PREFIX)
    if path and OLD_WORKSPACE_PREFIX in path:
        path = path.replace(OLD_WORKSPACE_PREFIX, NEW_WORKSPACE_PREFIX)
    return path


def try_fix(label, get_fn, set_fn):
    old = get_fn()
    if not old:
        return
    new = swap(old)
    if new != old:
        new_abs = bpy.path.abspath(new)
        if os.path.exists(new_abs):
            set_fn(new)
            fixed.append((label, old, new))
            return
    # not changed (or target still missing) -> check final state
    final = get_fn()
    if final:
        final_abs = bpy.path.abspath(final)
        if not os.path.exists(final_abs):
            still_broken.append((label, final))


print("=" * 70)
print("Fixing:", bpy.data.filepath)
print("=" * 70)

# ---- 1. Linked libraries ----
for lib in bpy.data.libraries:
    try_fix(f"LIBRARY {lib.name}", lambda lib=lib: lib.filepath, lambda v, lib=lib: setattr(lib, "filepath", v))

for lib in bpy.data.libraries:
    try:
        lib.reload()
    except Exception as e:
        print("  (reload warning)", lib.filepath, e)

# ---- 2. Object components ----
for obj in bpy.data.objects:
    comps = getattr(obj, "bjs_components", None)
    if not comps:
        continue
    for comp in comps:
        for fld in COMPONENT_FILE_FIELDS:
            if hasattr(comp, fld):
                try_fix(f"{obj.name}.{fld}",
                        lambda comp=comp, fld=fld: getattr(comp, fld),
                        lambda v, comp=comp, fld=fld: setattr(comp, fld, v))
        for ev_attr in ("exposed_vars", "bjs_exposed_vars"):
            evs = getattr(comp, ev_attr, None)
            if evs:
                for ev in evs:
                    if hasattr(ev, "file_val"):
                        try_fix(f"{obj.name}.exposed_var.file_val",
                                lambda ev=ev: ev.file_val,
                                lambda v, ev=ev: setattr(ev, "file_val", v))

# ---- 3. Materials ----
for mat in bpy.data.materials:
    if hasattr(mat, "bjs_nme_file"):
        try_fix(f"MAT {mat.name}.bjs_nme_file",
                lambda mat=mat: mat.bjs_nme_file,
                lambda v, mat=mat: setattr(mat, "bjs_nme_file", v))

    for tex in getattr(mat, "bjs_nme_textures", []):
        for fld in ("image_file", "json_url", "match_url"):
            if hasattr(tex, fld):
                try_fix(f"MAT {mat.name}.nme_texture({tex.block_name}).{fld}",
                        lambda tex=tex, fld=fld: getattr(tex, fld),
                        lambda v, tex=tex, fld=fld: setattr(tex, fld, v))

    dm = getattr(mat, "bjs_detail_map", None)
    if dm:
        for fld in ("texture_file", "albedo_file", "normal_file", "roughness_file"):
            if hasattr(dm, fld):
                try_fix(f"MAT {mat.name}.detail_map.{fld}",
                        lambda dm=dm, fld=fld: getattr(dm, fld),
                        lambda v, dm=dm, fld=fld: setattr(dm, fld, v))

# ---- 4. Scene post-processing LUT ----
for scene in bpy.data.scenes:
    bjs = getattr(scene, "bjs_scene", None)
    post = getattr(bjs, "post", None) if bjs else None
    if post and hasattr(post, "color_grading_file"):
        try_fix(f"SCENE {scene.name}.post.color_grading_file",
                lambda post=post: post.color_grading_file,
                lambda v, post=post: setattr(post, "color_grading_file", v))

# ---- 5. Direct image datablocks (Texturing library reorg) ----
for img in bpy.data.images:
    if img.name in IMAGE_FIXES:
        target = IMAGE_FIXES[img.name]
        if os.path.exists(target):
            rel = bpy.path.relpath(target, start=os.path.dirname(bpy.data.filepath))
            old = img.filepath
            img.filepath = rel
            img.source = 'FILE'
            try:
                img.reload()
            except Exception as e:
                print("  (reload warning)", img.name, e)
            fixed.append((f"IMAGE {img.name}", old, rel))
    elif img.filepath:
        ap = bpy.path.abspath(img.filepath)
        if not os.path.exists(ap):
            still_broken.append((f"IMAGE {img.name}", img.filepath))

# ---- Report ----
print("\n--- FIXED (%d) ---" % len(fixed))
for label, old, new in fixed:
    print(f"  {label}\n    old: {old}\n    new: {new}")

print("\n--- STILL BROKEN (%d) — left untouched, target not found anywhere ---" % len(still_broken))
for label, path in still_broken:
    print(f"  {label}: {path}")

if fixed:
    bpy.ops.wm.save_mainfile()
    print("\nSaved:", bpy.data.filepath)
else:
    print("\nNothing changed — not saving.")
