"""Babylon Level Kit — a small Unity-style ECS / level-editor layer for Blender
that exports scenes to Babylon.js.

Packaged as a Blender extension (blender_manifest.toml). Install via
Preferences > Get Extensions > Install from Disk. Metadata (incl. version)
lives in the manifest.

Where things are:
    core/           GUIDs and TypeScript @exposed/@inputMap parsing
    components/     the per-object component data model (Object.bjs_components)
    animator/       NLA state-machine NodeTree (ANIMATOR component)
    scene/          scene-wide render settings (Scene.bjs_scene)
    input_actions/  the Input Actions asset: data, defaults, JSON I/O, operators
    export/         everything that writes the .glb + .scene.json (+ live link)
    operators/      component / script / export operators
    ui/             all panels and menus (viewport N-panels)
    viewport/       GPU overlays (collider wireframe + CoM preview)

Where the UI is:
    3D viewport N-panel "Babylon Object" tab -> the selected object (components,
                                               light/camera/animation)
    3D viewport N-panel "Babylon Scene" tab  -> the scene (rendering, fog,
                                               post-processing, input actions, export)
"""

# Re-import every package submodule cleanly on addon reload (F8 / Reload
# Scripts). Reload parents before children isn't required, but reloading
# shallow modules first keeps `from . import x` references fresh.
if "components" in locals():
    import importlib
    import sys

    _names = sorted(
        (name for name in sys.modules if name.startswith(__name__ + ".")),
        key=lambda n: n.count("."),
    )
    for _name in _names:
        importlib.reload(sys.modules[_name])

# animator before components: BJSComponent references BJSAnimatorParam, and
# importing components first would load animator mid-component (circular risk).
from . import animator, components, scene, input_actions, collision_layers, materials, export, operators, ui, viewport

# Registration order: data first (properties the UI reads), then behavior,
# then presentation, then overlays. core/ is pure functions — nothing to register.
# animator registers before components so BJSAnimatorParam exists for BJSComponent.
_modules = (animator, components, scene, input_actions, collision_layers, materials, export, operators, ui, viewport)


def register():
    for m in _modules:
        m.register()


def unregister():
    for m in reversed(_modules):
        m.unregister()


if __name__ == "__main__":
    register()
