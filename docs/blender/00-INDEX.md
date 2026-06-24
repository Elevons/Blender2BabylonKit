# Babylon Level Kit — Blender Add-on Documentation

The editor half of the kit, current as of **v0.32.0**. The interactive version
is the HTML diagram set in this folder — open **[index.html](index.html)** and
use the bottom nav (a **Blender** row for the area diagrams + a **Traces** row
for code walk-throughs; "Runtime docs →" jumps to the engine packet).

> **Looking for something specific?** Open the searchable landing page at
> **[../index.html](../index.html)** and type a term (e.g. *collision*,
> *export*, *input*) to surface the relevant pages from both the engine and
> Blender sides.

## What the add-on does

Blender is the editor. The add-on adds two viewport N-panel tabs — **Babylon
Object** for the selected object, **Babylon Scene** for scene-wide settings
(Input Actions, rendering, export) — and writes the two artifacts the
[runtime](../engine/00-INDEX.html) consumes: `level.glb` (what glTF can express)
and `level.scene.json` (everything else). See
[Architecture](../engine/01-ARCHITECTURE.html) for the two-artifact split and
[Blender Add-on](../engine/02-BLENDER-ADDON.html) for the prose module tour.

## The pages

Area diagrams: **[index.html](index.html)** (package layout + flow) ·
**[data-model.html](data-model.html)** (`components/` + `core/ids.py`) ·
**[export.html](export.html)** (the export pipeline).

Code traces (each node is a step; click for the explanation + the actual
current Python source): **Export** (operator → glb + manifest) · **GUID**
(object → entity) · **@exposed** (TypeScript → Blender fields) · **Input
Actions** (panel → `inputActions` + `defaultInputMap`) · **Validation** · **Live
Link** · **Collider preview** · **3D GUI** (GUI3D_* authoring → manifest).

## Regenerating

`npm run docs:build` regenerates both packets from the shared shell template
(`docs/_template/diagram-shell.html`). `npm run docs:blender` rebuilds only
this folder; it re-extracts every trace's source from `blender_addon/`. A
renamed/deleted function fails the build loudly — the anti-rot guard. (The
runtime packet alone is `npm run docs:trace`.)

Full build pipeline, file layout, and how to add traces or diagrams:
**[Building the documentation](../BUILDING-DOCS.html)**.
