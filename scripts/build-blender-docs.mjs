#!/usr/bin/env node
/**
 * Build docs/blender/ — area diagrams + code-trace pages.
 *
 *   npm run docs:blender   (or: node scripts/build-blender-docs.mjs)
 *
 * All HTML is generated from docs/_template/diagram-shell.html.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ReadShell,
  EmitDiagramPage,
  BuildBlenderNav,
  LAYOUT_PATCH_BLENDER,
  CODE_PANEL_PATCH_BLENDER,
  LayoutSteps,
  ExtractPySymbol,
  N,
  E,
} from "./docs/shared.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "docs", "blender");

// ---------------------------------------------------------------------------
// Area diagrams (hand-authored node graphs of the add-on's structure).
// ---------------------------------------------------------------------------

export const AREA_PAGES = {
  "index.html": {
    title: "Add-on overview",
    nodes: [
      N(1, 300, 40, "__init__.py", "registration", "Extension entry point. register()/unregister() call each subpackage's register() in dependency order — components & scene first (their PropertyGroups are referenced everywhere), then input_actions, export, operators, ui, viewport. Reloads submodules so edits land mid-session.", [["Blender", "4.2+ extension"], ["Order", "data → ui"]]),
      N(2, 40, 60, "core/", "ids + TS parsing", "Pure helpers, nothing registered. ids.py owns ID_KEY ('bjs_id') and ensure_object_id(); script_parse.py regex-reads @exposed(...) and @inputMap(\"...\") from behavior TypeScript — THE cross-language contract.", [["Files", "ids · script_parse"]]),
      N(3, 40, 180, "components/", "per-object data", "The component model on every Object: BJSComponent (one group switched by comp_type), exposed vars + list items, trigger/click events, light-shadow & animation blocks, and the copy/paste clipboard. constants.py isolates every enum table.", [["Key class", "BJSComponent"], ["On", "Object.bjs_components"]]),
      N(4, 40, 300, "scene/", "scene settings", "BJSSceneSettings on Scene.bjs_scene: clear/ambient, environment (World texture via scene/environment.py find_world_env_node, or useDefault flag via use_default_environment), Show Skybox (IBL without visible background when off; forced off when Atmosphere on), Skybox Ignores Fog (mesh.applyFog = false when on), fog, Atmosphere (scene/atmosphere.py — SUN lamp, scattering), freeze shadows; post-processing lives on the nested bjs_scene.post block (scene/post_processing.py) — MSAA, FXAA, bloom, SSAO, volumetric light scattering, image processing (tone mapping type, exposure, contrast, vignette, color grading, curves), sharpen, DOF, chromatic aberration, grain, glow.", [["On", "Scene.bjs_scene.post"]]),
      N(5, 40, 420, "input_actions/", "Input Actions asset", "The asset end-to-end: data model (maps/actions/bindings), the built-in Player defaults, JSON serialize/apply (+ friendly-key aliases), and every bjs.input_* operator.", [["Export keys", "inputActions + defaultInputMap"]]),
      N(6, 300, 200, "operators/", "the verbs", "Component verbs (add/remove/duplicate/move/copy/cut/paste, Assign GUID, Fit Collider, Pin Inspector), exposed-list items (add, resize-to-count, add-selected for entity lists), script pick + Sync, and Validate / Export. Pure behavior — every UI button routes here, and the stack verbs resolve their target through core/inspector.py so they honor the pin.", [["Export op", "BJS_OT_export"]]),
      N(7, 300, 340, "ui/", "panels + menus", "All presentation. Viewport 'Babylon' N-panel = the selected object — or a PINNED object — with components + light/camera/animation child panels + quick export. Properties › Scene 'Babylon' = scene-wide (rendering, fog, atmosphere, post-processing sub-panels via post_panels.py, Input Actions, export). Both export blocks share draw_export_controls().", [["Object", "N-panel"], ["Scene", "Properties › Scene"]]),
      N(8, 560, 110, "export/", "the pipeline", "The output half. level.py orchestrates the glb + schema-v4 manifest (begin_asset_export resets copy reservations each pass); components / datablocks / animation / scene serialize each block (Blender→Babylon axis swap happens here); assets.py copies media with stable sanitized names (re-export overwrites; _2 only on same-pass collision); validate.py pre-flights; live_link.py re-exports on Ctrl+S.", [["Output", "glb + scene.json"], ["Schema", "v4"]]),
      N(9, 560, 320, "viewport/", "viewport gizmo", "GPU overlays. collider_preview.py draws manual colliders in the 3D view in Blender space, so the preview matches the body export produces.", [["Draw", "POST_VIEW handler"]]),
    ],
    edges: [
      E(100, 1, 3, "registers"), E(101, 1, 7), E(102, 1, 6),
      E(103, 7, 6, "buttons"), E(104, 7, 3, "draws"), E(105, 7, 4, "draws"), E(106, 7, 5, "edits"),
      E(107, 6, 8, "Export / Validate"), E(108, 6, 2, "Sync"),
      E(109, 8, 3, "reads"), E(110, 8, 4, "reads"), E(111, 8, 5, "serializes"), E(112, 8, 2, "GUIDs"),
      E(113, 3, 9, "values"),
    ],
  },
  "data-model.html": {
    title: "Data model",
    nodes: [
      N(1, 40, 40, "ensure_object_id", "GUID assignment", "Stamps a unique bjs_id custom property on an object (and re-issues duplicates). This is what promotes a plain object into an addressable entity. ID_KEY is defined here (core/ids.py) and imported by the runtime so both halves agree on the key.", [["Prop", "obj['bjs_id']"], ["File", "core/ids.py"]]),
      N(2, 40, 170, "BJSComponent", "one group, many faces", "A single PropertyGroup holding fields for every component type, switched by comp_type (TAG/COLLIDER/RIGIDBODY/SCRIPT/CAMERA/AUDIO/CONSTRAINT/GUI/PARTICLE/GUI3D_*). One collection of these lives on every object (obj.bjs_components).", [["Switch", "comp_type enum"], ["File", "components/component.py"]]),
      N(3, 300, 60, "BJSExposedVar", "script values", "One per @exposed field on a SCRIPT component: name, type, and the value (float/bool/string/vector/color/entity/enum/list). LIST vars also own list_items, list_count (typed resize), and show_expanded (per-list collapse, independent of the component header). Object & enum changes fire update callbacks.", [["Lives in", "comp.vars"], ["File", "components/exposed_vars.py"]]),
      N(4, 300, 180, "BJSListItem", "list elements", "Elements of an exposed list field (e.g. entity lists). add_list_item seeds the right value type; the parent var's list_count get/set lets you type a length instead of clicking +, and bjs.list_add_selected drops every selected object into an entity list at once. ui/component_draw.py draws each list in its own collapsible box.", [["Lives in", "var.items"], ["File", "components/exposed_vars.py"]]),
      N(5, 300, 290, "BJSTriggerEvent", "on-enter / on-click rows", "Trigger collider On Enter reactions AND 3D GUI button On Click reactions: target object + message (+ optional tag filter for triggers). Serialized into collider.events or gui3d events[].", [["Lives in", "comp.trigger_events / gui3d_events"], ["File", "components/component.py"]]),
      N(6, 560, 110, "sync_exposed_vars", "reconcile", "Given freshly parsed @exposed fields, add new vars / drop removed ones / keep existing values. Called by the Sync operator (operators/scripts.py) and on script-path change.", [["Pairs with", "core/script_parse"], ["File", "components/exposed_vars.py"]]),
      N(7, 560, 230, "BJSLightShadow / BJSAnimationSettings", "per-object blocks", "Shadow parameters per lamp; autoplay clip/loop/speed + the NLA strip list per object.", [["On", "Object"], ["File", "components/object_settings.py"]]),
      N(8, 560, 350, "copy_component", "clipboard", "Deep-copies one component group to another (copy/cut/paste, duplicate). _copy_props handles the field-by-field clone.", [["Used by", "paste/duplicate ops"], ["File", "components/clipboard.py"]]),
    ],
    edges: [
      E(100, 2, 3, "vars"), E(101, 3, 4, "items"), E(102, 2, 5, "events"),
      E(103, 6, 3, "maintains"), E(104, 2, 7, "siblings"), E(105, 8, 2, "clones"), E(106, 1, 2, "promotes"),
    ],
  },
  "export.html": {
    title: "Export pipeline",
    nodes: [
      N(1, 40, 200, "export_level", "orchestrator", "The entry the Export operator and Live Link both call. begin_asset_export → dedupe GUIDs → ensure GUIDs → write glb → build manifest → attach debug flag → write .scene.json. Returns (glb, json, entity count).", [["File", "export/level.py"]]),
      N(2, 300, 60, "_dedupe_entity_ids", "step 1", "Copy-pasted objects share a GUID; this re-issues fresh ones so identity stays unique.", [["File", "export/level.py"]]),
      N(3, 300, 170, "_ensure_entity_ids", "step 2", "Assign GUIDs to everything addressable (components, lights, cameras) AND every referenced object, so refs always resolve. Must run before the glb so extras carry the IDs.", [["File", "export/level.py"]]),
      N(4, 300, 280, "_export_glb", "step 3", "Invokes Blender's glTF exporter (+Y-up, GUIDs in node extras, cameras/lights/animation included).", [["File", "export/level.py"]]),
      N(5, 300, 390, "_build_manifest", "step 4", "Per renderable object: serialize components, light, camera, animation. Plus the scene block. The schema-v4 dict that becomes .scene.json.", [["File", "export/level.py"]]),
      N(6, 560, 300, "serialize_components", "per object", "One dict per component. Converts collider center/size/rotation and constraint pivot/axis to Babylon Y-up; attaches trigger events; copies GUI/particle JSON and 3D button images via copy_asset; serializes GUI3D_* layout and click events.", [["Axis conv", "here"], ["File", "export/components.py"]]),
      N(7, 560, 410, "_serialize_vars", "per script", "Exposed values → vars dict; entity refs become target GUIDs.", [["Refs", "GUID strings"], ["File", "export/components.py"]]),
      N(8, 800, 250, "serialize_light / serialize_camera", "auto blocks", "Derived from the lamp/camera datablock (no component needed); the active camera is flagged.", [["No component", "auto"], ["File", "export/datablocks.py"]]),
      N(9, 800, 380, "serialize_scene", "scene block", "Clear/ambient, environment (World Output chain → env/ via scene/environment.py, or useDefault when Default Environment is on; createSkybox forced off when Atmosphere on; skyboxIgnoreFog), fog, atmosphere (export/atmosphere.py), post (export/post_processing.py; LUTs → post/), inputActions + defaultInputMap.", [["File", "export/scene.py"]]),
    ],
    edges: [
      E(100, 1, 2), E(101, 1, 3), E(102, 1, 4), E(103, 1, 5),
      E(104, 5, 6), E(106, 6, 7, "scripts"), E(107, 5, 8), E(108, 5, 9),
    ],
  },
};

// ---------------------------------------------------------------------------
// Trace chains.
// ---------------------------------------------------------------------------

export const TRACES = [
  {
    id: "export",
    title: "Export: scene → glb + manifest",
    intro: "What Export Level (and every Live Link save) actually runs, top to bottom.",
    steps: [
      { file: "blender_addon/operators/export_ops.py", symbol: "BJS_OT_export", note: "The operator behind the Export button (an ExportHelper, so it shows a file dialog). execute() runs the validator for warnings, then calls export_level with the chosen path." },
      { file: "blender_addon/export/level.py", symbol: "export_level", note: "The orchestrator. begin_asset_export (stable side-file paths) → dedupe + ensure GUIDs (before the glb so extras carry them) → write the glb → build the manifest → attach the Debug Build flag → write .scene.json. Returns (glb, json, count)." },
      { file: "blender_addon/export/level.py", symbol: "_ensure_entity_ids", note: "GUIDs for everything addressable AND everything referenced (so an entity/constraint/trigger target always exists in the glb to point at)." },
      { file: "blender_addon/export/level.py", symbol: "_build_manifest", note: "Walks renderable objects; per object emits components + light + camera + animation blocks, plus the scene block. The schema-v4 dict." },
      { file: "blender_addon/export/components.py", symbol: "serialize_components", note: "The core converter: one dict per component, with all Blender→Babylon axis conversion (collider center/size/rotation, constraint pivot/axis) happening HERE, once." },
    ],
  },
  {
    id: "guid",
    title: "GUID identity: object → entity",
    intro: "How a Blender object becomes an addressable runtime entity.",
    steps: [
      { file: "blender_addon/core/ids.py", symbol: "ensure_object_id", note: "Stamps obj['bjs_id'] (ID_KEY). Having a GUID is what makes an object an entity; pure geometry without one just rides in the glb." },
      { file: "blender_addon/export/level.py", symbol: "_referenced_ids", note: "Collects GUIDs that MUST exist because something points at them: entity fields, camera/constraint/trigger targets, VLS light source — so references never dangle." },
      { file: "blender_addon/export/level.py", symbol: "_dedupe_entity_ids", note: "Duplicated objects (Shift+D) inherit the same custom prop; this detects collisions and re-issues fresh GUIDs before export." },
    ],
  },
  {
    id: "exposed",
    title: "@exposed: TypeScript → Blender fields",
    intro: "The editor side of the cross-language contract — parsing behavior source into editable widgets.",
    steps: [
      { file: "blender_addon/core/script_parse.py", symbol: "parse_exposed", note: "Entry: read a behavior .ts file, scan its @exposed decorators, return field descriptors (name, type, default, options). No TS runtime — pure regex, hence the single-line-literal rule." },
      { file: "blender_addon/core/script_parse.py", symbol: "_scan_decorators", note: "Finds each `@exposed(...)` and the field it annotates, capturing the option blob and the field name + default expression." },
      { file: "blender_addon/core/script_parse.py", symbol: "_parse_default", note: "Turns a literal default ([0,1,0], 5, \"idle\", true) into a Python value of the right type for the Blender property." },
      { file: "blender_addon/operators/scripts.py", symbol: "BJS_OT_sync_vars", note: "The Sync button: re-parse the script and reconcile the component's vars (add new, drop removed, keep existing values)." },
      { file: "blender_addon/components/exposed_vars.py", symbol: "sync_exposed_vars", note: "The reconcile itself — the function Sync and the script-path callback share." },
    ],
  },
  {
    id: "validate",
    title: "Validation: catching silent failures",
    intro: "The checks that run on Validate, Export, and every Live Link save.",
    steps: [
      { file: "blender_addon/export/validate.py", symbol: "validate_scene", note: "The entry: iterate objects, run every per-object check, collect warnings, plus scene-wide checks (duplicate GUIDs, active camera)." },
      { file: "blender_addon/export/validate.py", symbol: "_check_physics", note: "Example check: a MESH-shaped collider can't be a DYNAMIC body in Havok — warn before it silently fails at runtime." },
      { file: "blender_addon/export/validate.py", symbol: "_check_skinned_meshes", note: "The skinned-mesh trap: components/animation on a skinned mesh do nothing (its node transform is ignored; clips target the armature's joints). Warn to move them to the armature." },
      { file: "blender_addon/export/validate.py", symbol: "_check_constraints", note: "A joint needs a physics body on BOTH ends or it won't exist at runtime — warn if either is missing. CUSTOM: six axis rows expected; min ≤ max on limited/spring rows." },
      { file: "blender_addon/export/validate.py", symbol: "_check_atmosphere", note: "When Atmosphere is on: Sun Light must be a renderable SUN lamp, or at least one exported SUN must exist in the scene." },
    ],
  },
  {
    id: "input",
    title: "Input Actions: panel → manifest",
    intro: "How the scene-level Input Actions asset and Scene Default map reach the runtime.",
    steps: [
      { file: "blender_addon/ui/input_panel.py", symbol: "BJS_PT_input_map", note: "The Input Actions editor — now a child panel under Properties › Scene › Babylon (was the N-panel). Scene Default picker, maps/actions/bindings editor, load/save .inputactions.json. Draw logic is a reusable mixin." },
      { file: "blender_addon/input_actions/serialize.py", symbol: "serialize_input_asset", note: "Maps/actions/bindings → scene.inputActions (built-in Player asset when the panel is empty). Lives with its inverse (apply_input_asset) and the friendly-key aliases." },
      { file: "blender_addon/export/scene.py", symbol: "serialize_scene", note: "Writes scene.defaultInputMap alongside inputActions — the map scripts without @inputMap receive on behavior.input." },
      { file: "blender_addon/export/validate.py", symbol: "_check_input_map", note: "Duplicate map/action names, actions without bindings, @inputMap refs without a matching map, and a Scene Default that doesn't exist." },
      { file: "blender_addon/core/script_parse.py", symbol: "parse_input_maps", note: "Regex-scans behavior sources for @inputMap(\"Name\") so Sync / validate can create and check map references." },
    ],
  },
  {
    id: "livelink",
    title: "Live Link: Ctrl+S → re-export",
    intro: "The save-to-see loop, Blender side (the browser reload is in the runtime packet).",
    steps: [
      { file: "blender_addon/export/live_link.py", symbol: "_on_save_post", note: "A @persistent save_post handler: after every .blend save, re-export each scene that opted in." },
      { file: "blender_addon/export/live_link.py", symbol: "_do_live_export", note: "Re-validate + re-export to the remembered path. Wrapped so a failed export logs to the console but never breaks the user's save." },
    ],
  },
  {
    id: "collider-preview",
    title: "Collider preview: the viewport gizmo",
    intro: "How manual colliders are drawn in the 3D view so the preview matches the exported body.",
    steps: [
      { file: "blender_addon/viewport/collider_preview.py", symbol: "_draw", note: "The POST_VIEW draw handler: for each object with a manual collider, build its wireframe in Blender space and batch it to the GPU." },
      { file: "blender_addon/viewport/collider_preview.py", symbol: "_local_geometry", note: "Produces the shape's edge geometry (box/sphere/capsule/cylinder) in the object's local space — the same center/size/rotation export will convert, so preview == runtime." },
    ],
  },
  {
    id: "gui3d",
    title: "3D GUI: authoring → manifest",
    intro: "How nine GUI3D_* component types serialize and validate before export.",
    steps: [
      { file: "blender_addon/components/component.py", symbol: "BJSComponent", note: "AUTHORING — one PropertyGroup, many faces. GUI3D_* types share gui3d_text/image/tooltip/events and panel layout fields. Membership sets GUI3D_CONTROLS / GUI3D_PANELS / GUI3D_TEXTURED (in components/constants.py) classify draw + export branches." },
      { file: "blender_addon/ui/component_draw.py", symbol: "_draw_click_events", note: "The On Click Events box for 3D controls — same target+message UI as trigger colliders, wired to bjs.gui3d_event_add/remove operators." },
      { file: "blender_addon/export/components.py", symbol: "serialize_components", note: "GUI3D_* cases emit type-specific fields; button images copied via copy_asset to gui/; click-event targets yielded by iter_referenced_objects for GUID assignment." },
      { file: "blender_addon/export/validate.py", symbol: "_check_gui3d", note: "Mesh button on non-mesh, panel without button children, click events without targets, missing button image files." },
      { file: "blender_addon/export/validate.py", symbol: "_check_media", note: "GUI (missing JSON, MESH mode on non-mesh) and PARTICLE (missing JSON) checks run alongside 3D GUI validation." },
    ],
  },
];

// ---------------------------------------------------------------------------
// Build.
// ---------------------------------------------------------------------------

export function BuildBlenderDocs()
{
  const shell = ReadShell();
  const areaNav = Object.entries(AREA_PAGES).map(([file, page]) => [
    file,
    page.title.split(" ")[0] === "Add-on" ? "Overview" : page.title,
  ]);
  const traceNav = TRACES.map((trace) => [`trace-${trace.id}.html`, trace.title.split(":")[0]]);

  for (const [file, page] of Object.entries(AREA_PAGES))
  {
    EmitDiagramPage({
      shell,
      outPath: path.join(OUT_DIR, file),
      pageTitle: `Blender — ${page.title}`,
      diagramData: { title: "Blender — " + page.title, nodes: page.nodes, edges: page.edges },
      navHtml: BuildBlenderNav(file, areaNav, traceNav),
      bodyPatch: LAYOUT_PATCH_BLENDER,
    });
  }

  for (const trace of TRACES)
  {
    for (const step of trace.steps)
    {
      const { start, code } = ExtractPySymbol(step.file, step.symbol);
      step.code = code; step.line = start;
    }
  }
  if (process.exitCode === 1)
  {
    console.error("Extraction failures above — Blender trace pages NOT written.");
    process.exit(1);
  }

  for (const trace of TRACES)
  {
    const pos = LayoutSteps(trace.steps.length);
    const nodes = trace.steps.map((step, i) => ({
      id: i + 1, ...pos[i],
      label: `${i + 1}. ${step.symbol}`,
      sub: step.file.split("/").pop(),
      desc: step.note,
      meta: [["File", step.file], ["Line", String(step.line)]],
      code: step.code, file: step.file, line: step.line,
    }));
    const edges = trace.steps.slice(1).map((_, i) => ({ id: 100 + i, src: i + 1, tgt: i + 2, label: "" }));
    const outFile = `trace-${trace.id}.html`;
    EmitDiagramPage({
      shell,
      outPath: path.join(OUT_DIR, outFile),
      pageTitle: `Blender — ${trace.title}`,
      diagramData: { title: "Trace — " + trace.title, nodes, edges },
      navHtml: BuildBlenderNav(outFile, areaNav, traceNav),
      bodyPatch: CODE_PANEL_PATCH_BLENDER,
    });
  }

  const total = TRACES.reduce((sum, t) => sum + t.steps.length, 0);
  console.log(`Blender docs: ${Object.keys(AREA_PAGES).length} area pages, ${TRACES.length} trace pages (${total} steps) → docs/blender/`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href)
{
  BuildBlenderDocs();
}
