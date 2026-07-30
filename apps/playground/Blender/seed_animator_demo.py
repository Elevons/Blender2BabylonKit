"""Seed a demo ANIMATOR graph on the active armature (run inside Blender).

Usage (Blender Scripting workspace):
  1. Select an armature that already has Idle + Walk NLA strips.
  2. Text Editor › Open › this file › Run Script.
  3. Adds an ANIMATOR component (if missing), creates Entry/Idle/Walk/Speed/
     Transition nodes, and syncs Parameters.
  4. Optionally attach SCRIPT DriveAnimator.ts on the same armature.

Does not export — use Babylon Scene › Export after authoring.
"""

import bpy


def nla_clip_names(obj):
    """glTF / Action clip names on an object (empty if none)."""
    ad = obj.animation_data
    if ad is None:
        return []
    names = []
    seen = set()

    def add(name):
        if name and name not in seen:
            seen.add(name)
            names.append(name)

    if ad.nla_tracks:
        for track in ad.nla_tracks:
            if getattr(track, "mute", False):
                continue
            track_name = track.name or ""
            use_track = not (
                track_name.startswith("NlaTrack")
                or track_name.startswith("[Action Stash]")
            )
            for strip in track.strips:
                if getattr(strip, "mute", False) or strip.action is None:
                    continue
                add(track_name if use_track else strip.action.name)
    if ad.action:
        add(ad.action.name)
    return names


def find_clip(clips, *candidates):
    lower = {c.lower(): c for c in clips}
    for candidate in candidates:
        if candidate.lower() in lower:
            return lower[candidate.lower()]
    return clips[0] if clips else ""


def ensure_animator(obj):
    for comp in obj.bjs_components:
        if comp.comp_type == "ANIMATOR":
            return comp
    comp = obj.bjs_components.add()
    comp.comp_type = "ANIMATOR"
    return comp


def seed(obj):
    clips = nla_clip_names(obj)
    if len(clips) < 1:
        raise RuntimeError(f"{obj.name} has no exportable animation Actions")

    idle_clip = find_clip(clips, "Idle", "idle", "Stand", "SharkSwim")
    walk_clip = find_clip(clips, "Walk", "walk", "Run", "run")
    if walk_clip == idle_clip and len(clips) > 1:
        walk_clip = clips[1]

    comp = ensure_animator(obj)
    tree_name = f"{obj.name}_Animator"
    tree = bpy.data.node_groups.get(tree_name)
    if tree is None or getattr(tree, "bl_idname", "") != "BJSAnimationStateTree":
        tree = bpy.data.node_groups.new(tree_name, "BJSAnimationStateTree")
    else:
        tree.nodes.clear()
        tree.links.clear()

    comp.animator_tree = tree
    bpy.context.window_manager.bjs_animator_edit_object = obj.name

    entry = tree.nodes.new("BJSAnimEntryNode")
    entry.location = (-320, 80)

    idle = tree.nodes.new("BJSAnimStateNode")
    idle.location = (0, 160)
    idle.state_id = "Idle"
    idle.label = "Idle"
    idle.clip = idle_clip
    idle.loop = True

    walk = tree.nodes.new("BJSAnimStateNode")
    walk.location = (0, -80)
    walk.state_id = "Walk"
    walk.label = "Walk"
    walk.clip = walk_clip
    walk.loop = True

    speed = tree.nodes.new("BJSAnimParameterNode")
    speed.location = (-320, -120)
    speed.param_name = "Speed"
    speed.ptype = "FLOAT"
    speed.f_default = 0.0

    to_walk = tree.nodes.new("BJSAnimTransitionNode")
    to_walk.location = (280, 120)
    cond = to_walk.conditions.add()
    cond.kind = "PARAM"
    cond.param = "Speed"
    cond.op = "GT"
    cond.value = 0.1

    to_idle = tree.nodes.new("BJSAnimTransitionNode")
    to_idle.location = (280, -40)
    cond2 = to_idle.conditions.add()
    cond2.kind = "PARAM"
    cond2.param = "Speed"
    cond2.op = "LTE"
    cond2.value = 0.1

    tree.links.new(entry.outputs[0], idle.inputs[0])
    tree.links.new(idle.outputs[0], to_walk.inputs[0])
    tree.links.new(to_walk.outputs[0], walk.inputs[0])
    tree.links.new(walk.outputs[0], to_idle.inputs[0])
    tree.links.new(to_idle.outputs[0], idle.inputs[0])

    # Prefer the add-on's sync when the extension is loaded.
    try:
        from blender_addon.animator.sync import sync_animator_params
        sync_animator_params(comp, tree)
    except ImportError:
        # Extension package name may differ; Sync button in the panel also works.
        pass
    print(f"Seeded ANIMATOR on {obj.name}: Idle={idle_clip!r} Walk={walk_clip!r}")


obj = bpy.context.object
if obj is None:
    raise RuntimeError("Select an armature first")
seed(obj)
