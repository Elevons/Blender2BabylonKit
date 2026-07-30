"""Serializes per-object animation into the manifest. The clips themselves
travel in the glb (as glTF animations -> Babylon AnimationGroups); here we only
record the clip names that the glTF exporter will emit + autoplay choice.

Blender 4.2+ default animation mode is ACTIONS: each stashed/active Action
becomes a glTF animation named after the **Action**. Renaming the NLA track
away from the defaults (`NlaTrack*` / `[Action Stash]*`) overrides that name
(and merges tracks that share the override). Strip names are *not* what the
exporter writes — do not use strip.name for clip lookups.

Muted **tracks** are still exported (Stash creates muted tracks on purpose).
Only muted **strips** are skipped — matching glTF-Blender-IO `__track_extract`.
"""


def _is_default_nla_track_name(name):
    """True when Blender's glTF ACTIONS mode will ignore this track name."""
    if not name:
        return True
    return name.startswith("NlaTrack") or name.startswith("[Action Stash]")


def _clip_name_for_strip(track, strip):
    """glTF animation name for one NLA strip under ACTIONS export mode."""
    action = getattr(strip, "action", None)
    if action is None:
        return None
    track_name = getattr(track, "name", "") or ""
    if _is_default_nla_track_name(track_name):
        return action.name
    return track_name


def iter_exported_clips(obj):
    """Yield (clip_name, strip, track) for every exportable clip on `obj`.

    Deduplicates by clip_name (first strip wins) so the Animator dropdown and
    manifest `clips[]` match Babylon AnimationGroup names.
    """
    ad = getattr(obj, "animation_data", None)
    if ad is None:
        return

    seen = set()

    if ad.nla_tracks:
        for track in ad.nla_tracks:
            # Do NOT skip muted tracks — Stash mutes the track; glTF still
            # exports unmuted strips on those tracks.
            non_muted = [
                strip for strip in track.strips
                if not getattr(strip, "mute", False)
                and getattr(strip, "action", None) is not None
            ]
            # glTF ACTIONS mode only supports single-strip tracks.
            if len(non_muted) != 1:
                continue
            strip = non_muted[0]
            name = _clip_name_for_strip(track, strip)
            if name is None or name in seen:
                continue
            seen.add(name)
            yield name, strip, track

    # Active action not pushed to NLA still exports in ACTIONS mode.
    action = getattr(ad, "action", None)
    if action is not None and action.name not in seen:
        yield action.name, None, None


def nla_clip_names(obj):
    """Clip names that become glTF animations / Babylon AnimationGroups.

    Kept as `nla_clip_names` for call-site compatibility; values are action
    names (or renamed NLA track names), not NLA strip display names.
    """
    return [name for name, _strip, _track in iter_exported_clips(obj)]


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
