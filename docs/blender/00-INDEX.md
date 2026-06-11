# Babylon Level Kit — Blender Add-on Documentation

The editor half of the kit, current as of **v0.29.2**. The interactive version
is the HTML diagram set in this folder — open **[index.html](index.html)** and
use the bottom nav (a **Blender** row for the area diagrams + a **Traces** row
for code walk-throughs; "Runtime docs →" jumps to the engine packet).

## What the add-on does

Blender is the editor. The add-on adds the **Babylon** N-panel (components,
GUIDs, per-object settings) and the export that produces the two artifacts the
[runtime](../engine/00-INDEX.md) consumes: `level.glb` (what glTF can express)
and `level.scene.json` (everything else). See
[Architecture](../engine/01-ARCHITECTURE.md) for the two-artifact split and
[Blender Add-on](../engine/02-BLENDER-ADDON.md) for the prose module tour.

## The pages

Area diagrams: **[index.html](index.html)** (all modules + flow, including
`input_*.py`) · **[data-model.html](data-model.html)** (properties.py —
components, exposed vars, trigger events) · **[export.html](export.html)** (the
export pipeline).

Code traces (each node is a step; click for the explanation + the actual
current Python source): **Export** (operator → glb + manifest) · **GUID**
(object → entity) · **@exposed** (TypeScript → Blender fields) · **Input
Actions** (panel → `inputActions` + `defaultInputMap`) · **Validation** · **Live
Link** · **Collider preview**.

## Regenerating

`npm run docs:blender` re-extracts every trace's source from `blender_addon/`.
A renamed/deleted function fails the build loudly — the anti-rot guard. (The
runtime packet is `npm run docs:trace`.)
