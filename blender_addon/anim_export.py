"""Serializes per-object NLA animation into the manifest. The clips themselves
travel in the glb (as glTF animations -> Babylon AnimationGroups); here we only
record the strip names + the object's autoplay choice. Pure functions."""


def nla_clip_names(obj):
    """Names of all NLA strips on an object (empty list if none)."""
    ad = obj.animation_data
    if not ad or not ad.nla_tracks:
        return []
    names = []
    for track in ad.nla_tracks:
        for strip in track.strips:
            names.append(strip.name)
    return names


def serialize_animation(obj):
    """Return the manifest animation block, or None if the object has no clips."""
    clips = nla_clip_names(obj)
    if not clips:
        return None
    a = obj.bjs_animation
    return {
        "autoPlay": a.auto_play,
        "clip": a.default_clip,
        "loop": a.loop,
        "speed": a.speed,
        "clips": clips,
    }
