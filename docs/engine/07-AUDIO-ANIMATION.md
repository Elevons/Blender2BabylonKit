# 07 — Audio & Animation

[← Index](00-INDEX.md) · Prev: [Rendering](06-RENDERING.md) · Next: [Workflow →](08-WORKFLOW.md)

## Audio (`subsystems/audio.ts`)

AUDIO components (file, volume, loop, autoPlay, spatial + maxDistance,
playbackRate) become **audio engine v2** `StaticSound`s — the legacy `Sound`
class is deprecated. One engine, created lazily (`CreateAudioEngineAsync`);
sounds via `CreateSoundAsync` with `spatialEnabled` set at creation (avoids
first-use latency), then `sound.spatial.attach(entity.node)` so 3D sounds
follow their entity. Sound names = file stem (`audio/door.mp3` → `"door"`),
reachable via `entity.GetSound`. Browser autoplay policy: auto-play sounds
await `audioEngine.unlockAsync()` (resolves on the first user gesture) without
blocking the load — creation promises are collected during the entity pass and
settled in `FinalizeLevel` so a bad file logs instead of failing the level.
The exporter copies sound files into `audio/` next to the manifest. Sounds are
disposed with the level.

## Animation (`subsystems/animation.ts`)

NLA strips export as glTF animations → global `AnimationGroup`s.
`FindAnimationGroups` scopes them to an entity **by membership**: a group
belongs to a node if any targeted animation targets the node or a descendant —
no reliance on globally-unique names. `ApplyAutoPlayAnimations` first stops the
glTF loader's auto-started groups, then plays each entity's chosen clip
(exact name, contains, else first) with its loop/speed. Runtime control:
`entity.animations`, `entity.GetAnimation("Walk")?.start(true)` — see the
`ClipSwitcher` behavior for clip cycling.

### The skinned-mesh rule (important)

For rigged characters, **everything goes on the armature object** — GUID,
Animation settings, Script components. Two glTF facts make the mesh object a
trap: (1) a skinned mesh's own node transform is *ignored* (joints define the
final pose), so a script moving the mesh entity moves nothing visible; (2)
skeletal clips target the **joint nodes under the armature**, so clip scoping
on the mesh entity finds zero clips. Both failures are silent, so the
[validator](08-WORKFLOW.md#validator) warns when components or autoplay sit on
a skinned mesh. (An animation *state machine* was prototyped and deliberately
reverted — see [DEVELOPMENT_PLAN](../DEVELOPMENT_PLAN.md) for the revival
constraints.)

Continue: [Workflow →](08-WORKFLOW.md)
