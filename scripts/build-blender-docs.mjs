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

const AREA_PAGES = {
  "index.html": {
    title: "Add-on overview",
    nodes: [
      N(1, 40, 40, "__init__.py", "registration", "The extension entry point. register()/unregister() pull in every submodule's own register() in dependency order (properties first — others reference its PropertyGroups). Dev-reloads submodules so editing during a session takes effect.", [["Blender", "4.2+ extension"], ["Reload", "importlib"]]),
      N(2, 40, 150, "properties.py", "component data", "BJSComponent (one group, per-type fields), exposed vars + list items, trigger events, light/shadow/animation settings. Owns ID_KEY and ensure_object_id().", [["Key class", "BJSComponent"], ["Identity", "ID_KEY = bjs_id"]]),
      N(12, 40, 260, "input_*.py", "Input Actions", "input_properties (maps/actions/bindings + Scene.bjs_input_default_map), input_ui (three-level panel + Scene Default picker), input_ops (edit/load/save/capture/sync), input_defaults (built-in asset).", [["Panel", "BJS_PT_input_map"], ["Export keys", "inputActions + defaultInputMap"]]),
      N(3, 40, 370, "ui.py", "the N-panel", "Draws the Babylon panel: component list with per-type fields, light/camera/animation info, and the Export panel (Export / Live Link / Debug Build / Validate). Drawing only — every button calls an operator.", [["Panels", "BJS_PT_components / _export"]]),
      N(4, 280, 200, "operators.py", "component verbs", "Add/remove/duplicate/move/copy/cut/paste components, Assign GUID, Fit Collider, pick-script + Sync, list & trigger-event rows, Validate, Export. Input ops live in input_ops.py.", [["Export op", "BJS_OT_export"]]),
      N(5, 520, 80, "script_parse.py", "TS → fields", "Regex-reads @exposed(...) out of a behavior's TypeScript so Blender can show editable widgets without a TS runtime. THE cross-language contract.", [["Trigger", "pick-script / Sync"]]),
      N(6, 520, 190, "export.py", "the heart", "Writes the glb (Blender glTF exporter, +Y-up, GUIDs in extras) and builds the schema-v4 manifest. Converts axes Blender→Babylon. Force-includes referenced objects. Copies audio files.", [["Output", "glb + scene.json"], ["Schema", "v4"]]),
      N(7, 520, 300, "scene_export.py", "scene block", "Clear/ambient color, environment texture (copied out), fog, post-processing, inputActions + defaultInputMap — the manifest's scene-wide settings.", [["Manifest keys", "scene.*"]]),
      N(8, 520, 400, "anim_export.py", "NLA block", "Per-object animation: NLA strip names + autoplay clip/loop/speed. nla_clip_names() also feeds the validator.", [["Manifest key", "animation"]]),
      N(9, 760, 120, "validate.py", "pre-export checks", "Catches silent failures before export: missing scripts, dangling refs, MESH+DYNAMIC, mesh triggers, constraint ends without physics, skinned-mesh components, area lights, duplicate GUIDs, missing audio, no camera, Input Actions (duplicate names, empty bindings, bad @inputMap refs, missing Scene Default map).", [["Entry", "validate_scene"]]),
      N(10, 760, 240, "live_link.py", "save → export", "save_post handler: when the scene opted in, every Ctrl+S re-validates + re-exports to the remembered path. Owns the live-link + Debug Build scene properties. Never breaks a save.", [["Hook", "_on_save_post"]]),
      N(11, 760, 360, "collider_preview.py", "viewport gizmo", "GPU wireframe of manual colliders drawn in the 3D view, in Blender space — so the preview matches the body export produces.", [["Draw", "POST_VIEW handler"]]),
    ],
    edges: [
      E(100, 1, 2, "registers"), E(101, 1, 12), E(102, 1, 3), E(103, 1, 4), E(104, 3, 4, "buttons"),
      E(105, 3, 2, "draws"), E(106, 4, 5, "Sync"), E(107, 4, 6, "Export"), E(108, 4, 9, "Validate"),
      E(109, 6, 7), E(110, 6, 8), E(111, 9, 6, "warn"), E(112, 10, 6, "Ctrl+S"), E(113, 2, 11, "values"),
      E(114, 12, 7, "serializes"),
    ],
  },
  "data-model.html": {
    title: "Data model",
    nodes: [
      N(1, 40, 40, "ensure_object_id", "GUID assignment", "Stamps a unique bjs_id custom property on an object (and re-issues duplicates). This is what promotes a plain object into an addressable entity. ID_KEY is defined here and imported by the runtime so both halves agree on the key.", [["Prop", "obj['bjs_id']"], ["Imported by", "physics.ts etc."]]),
      N(2, 40, 170, "BJSComponent", "one group, many faces", "A single PropertyGroup holding fields for every component type, switched by comp_type (TAG/COLLIDER/RIGIDBODY/SCRIPT/CAMERA/AUDIO/CONSTRAINT). One collection of these lives on every object (obj.bjs_components).", [["Switch", "comp_type enum"], ["On", "Object"]]),
      N(3, 300, 60, "BJSExposedVar", "script values", "One per @exposed field on a SCRIPT component: name, type, and the value (float/bool/string/vector/color/entity/enum). Object & enum changes fire update callbacks.", [["Lives in", "comp.vars"]]),
      N(4, 300, 180, "BJSListItem", "list elements", "Elements of an exposed list field (e.g. entity lists). add_list_item seeds the right value type.", [["Lives in", "var.items"]]),
      N(5, 300, 290, "BJSTriggerEvent", "on-enter rows", "A trigger collider's reaction: target object + message + optional tag filter. Serialized into collider.events.", [["Lives in", "comp.trigger_events"]]),
      N(6, 560, 110, "sync_exposed_vars", "reconcile", "Given freshly parsed @exposed fields, add new vars / drop removed ones / keep existing values. Called by the Sync operator and on script-path change.", [["Pairs with", "script_parse"]]),
      N(7, 560, 230, "BJSLightShadow / BJSAnimationSettings", "per-object blocks", "Shadow parameters per lamp; autoplay clip/loop/speed + the NLA strip list per object.", [["On", "Object"]]),
      N(8, 560, 350, "copy_component", "clipboard", "Deep-copies one component group to another (copy/cut/paste, duplicate). _copy_props handles the field-by-field clone.", [["Used by", "paste/duplicate ops"]]),
    ],
    edges: [
      E(100, 2, 3, "vars"), E(101, 3, 4, "items"), E(102, 2, 5, "events"),
      E(103, 6, 3, "maintains"), E(104, 2, 7, "siblings"), E(105, 8, 2, "clones"), E(106, 1, 2, "promotes"),
    ],
  },
  "export.html": {
    title: "Export pipeline",
    nodes: [
      N(1, 40, 200, "export_level", "orchestrator", "The entry the Export operator and Live Link both call. Dedupe GUIDs → ensure GUIDs → write glb → build manifest → attach debug flag → write .scene.json. Returns (glb, json, entity count).", [["File", "export.py"]]),
      N(2, 300, 60, "_dedupe_entity_ids", "step 1", "Copy-pasted objects share a GUID; this re-issues fresh ones so identity stays unique.", [["Before", "glb write"]]),
      N(3, 300, 170, "_ensure_entity_ids", "step 2", "Assign GUIDs to everything addressable (components, lights, cameras) AND every referenced object, so refs always resolve. Must run before the glb so extras carry the IDs.", [["Covers", "_referenced_ids"]]),
      N(4, 300, 280, "_export_glb", "step 3", "Invokes Blender's glTF exporter (+Y-up, GUIDs in node extras, cameras/lights/animation included).", [["Format", "GLB"]]),
      N(5, 300, 390, "_build_manifest", "step 4", "Per renderable object: serialize components, light, camera, animation. Plus the scene block. The schema-v4 dict that becomes .scene.json.", [["Schema", "v4"]]),
      N(6, 560, 300, "_serialize_components", "per object", "One dict per component. Converts collider center/size/rotation and constraint pivot/axis to Babylon Y-up; attaches trigger events; copies audio files.", [["Axis conv", "here"]]),
      N(7, 560, 410, "_serialize_vars", "per script", "Exposed values → vars dict; entity refs become target GUIDs.", [["Refs", "GUID strings"]]),
      N(8, 800, 250, "_serialize_light / _serialize_camera", "auto blocks", "Derived from the lamp/camera datablock (no component needed); the active camera is flagged.", [["No component", "auto"]]),
      N(9, 800, 380, "serialize_scene", "scene block", "Color, environment (copied), fog, post, inputActions + defaultInputMap — from scene_export.py.", [["File", "scene_export.py"]]),
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

const TRACES = [
  {
    id: "export",
    title: "Export: scene → glb + manifest",
    intro: "What Export Level (and every Live Link save) actually runs, top to bottom.",
    steps: [
      { file: "blender_addon/operators.py", symbol: "BJS_OT_export", note: "The operator behind the Export button (an ExportHelper, so it shows a file dialog). execute() runs the validator for warnings, then calls export_level with the chosen path." },
      { file: "blender_addon/export.py", symbol: "export_level", note: "The orchestrator. Dedupe + ensure GUIDs (before the glb so extras carry them), write the glb, build the manifest, attach the Debug Build flag, write .scene.json. Returns (glb, json, count)." },
      { file: "blender_addon/export.py", symbol: "_ensure_entity_ids", note: "GUIDs for everything addressable AND everything referenced (so an entity/constraint/trigger target always exists in the glb to point at)." },
      { file: "blender_addon/export.py", symbol: "_build_manifest", note: "Walks renderable objects; per object emits components + light + camera + animation blocks, plus the scene block. The schema-v4 dict." },
      { file: "blender_addon/export.py", symbol: "_serialize_components", note: "The core converter: one dict per component, with all Blender→Babylon axis conversion (collider center/size/rotation, constraint pivot/axis) happening HERE, once." },
    ],
  },
  {
    id: "guid",
    title: "GUID identity: object → entity",
    intro: "How a Blender object becomes an addressable runtime entity.",
    steps: [
      { file: "blender_addon/properties.py", symbol: "ensure_object_id", note: "Stamps obj['bjs_id'] (ID_KEY). Having a GUID is what makes an object an entity; pure geometry without one just rides in the glb." },
      { file: "blender_addon/export.py", symbol: "_referenced_ids", note: "Collects GUIDs that MUST exist because something points at them: entity fields, camera/constraint/trigger targets — so references never dangle." },
      { file: "blender_addon/export.py", symbol: "_dedupe_entity_ids", note: "Duplicated objects (Shift+D) inherit the same custom prop; this detects collisions and re-issues fresh GUIDs before export." },
    ],
  },
  {
    id: "exposed",
    title: "@exposed: TypeScript → Blender fields",
    intro: "The editor side of the cross-language contract — parsing behavior source into editable widgets.",
    steps: [
      { file: "blender_addon/script_parse.py", symbol: "parse_exposed", note: "Entry: read a behavior .ts file, scan its @exposed decorators, return field descriptors (name, type, default, options). No TS runtime — pure regex, hence the single-line-literal rule." },
      { file: "blender_addon/script_parse.py", symbol: "_scan_decorators", note: "Finds each `@exposed(...)` and the field it annotates, capturing the option blob and the field name + default expression." },
      { file: "blender_addon/script_parse.py", symbol: "_parse_default", note: "Turns a literal default ([0,1,0], 5, \"idle\", true) into a Python value of the right type for the Blender property." },
      { file: "blender_addon/operators.py", symbol: "BJS_OT_sync_vars", note: "The Sync button: re-parse the script and reconcile the component's vars (add new, drop removed, keep existing values)." },
      { file: "blender_addon/properties.py", symbol: "sync_exposed_vars", note: "The reconcile itself — the function Sync and the script-path callback share." },
    ],
  },
  {
    id: "validate",
    title: "Validation: catching silent failures",
    intro: "The checks that run on Validate, Export, and every Live Link save.",
    steps: [
      { file: "blender_addon/validate.py", symbol: "validate_scene", note: "The entry: iterate objects, run every per-object check, collect warnings, plus scene-wide checks (duplicate GUIDs, active camera)." },
      { file: "blender_addon/validate.py", symbol: "_check_physics", note: "Example check: a MESH-shaped collider can't be a DYNAMIC body in Havok — warn before it silently fails at runtime." },
      { file: "blender_addon/validate.py", symbol: "_check_skinned_meshes", note: "The skinned-mesh trap: components/animation on a skinned mesh do nothing (its node transform is ignored; clips target the armature's joints). Warn to move them to the armature." },
      { file: "blender_addon/validate.py", symbol: "_check_constraints", note: "A joint needs a physics body on BOTH ends or it won't exist at runtime — warn if either is missing. CUSTOM: six axis rows expected; min ≤ max on limited/spring rows." },
    ],
  },
  {
    id: "input",
    title: "Input Actions: panel → manifest",
    intro: "How the scene-level Input Actions asset and Scene Default map reach the runtime.",
    steps: [
      { file: "blender_addon/input_ui.py", symbol: "BJS_PT_input_map", note: "The Input Actions panel: Scene Default picker, maps/actions/bindings editor, load/save .inputactions.json." },
      { file: "blender_addon/scene_export.py", symbol: "_serialize_input_asset", note: "Maps/actions/bindings → scene.inputActions (built-in Player asset when the panel is empty)." },
      { file: "blender_addon/scene_export.py", symbol: "serialize_scene", note: "Writes scene.defaultInputMap alongside inputActions — the map scripts without @inputMap receive on behavior.input." },
      { file: "blender_addon/validate.py", symbol: "_check_input_map", note: "Duplicate map/action names, actions without bindings, @inputMap refs without a matching map, and a Scene Default that doesn't exist." },
      { file: "blender_addon/script_parse.py", symbol: "parse_input_maps", note: "Regex-scans behavior sources for @inputMap(\"Name\") so Sync / validate can create and check map references." },
    ],
  },
  {
    id: "livelink",
    title: "Live Link: Ctrl+S → re-export",
    intro: "The save-to-see loop, Blender side (the browser reload is in the runtime packet).",
    steps: [
      { file: "blender_addon/live_link.py", symbol: "_on_save_post", note: "A @persistent save_post handler: after every .blend save, re-export each scene that opted in." },
      { file: "blender_addon/live_link.py", symbol: "_do_live_export", note: "Re-validate + re-export to the remembered path. Wrapped so a failed export logs to the console but never breaks the user's save." },
    ],
  },
  {
    id: "collider-preview",
    title: "Collider preview: the viewport gizmo",
    intro: "How manual colliders are drawn in the 3D view so the preview matches the exported body.",
    steps: [
      { file: "blender_addon/collider_preview.py", symbol: "_draw", note: "The POST_VIEW draw handler: for each object with a manual collider, build its wireframe in Blender space and batch it to the GPU." },
      { file: "blender_addon/collider_preview.py", symbol: "_local_geometry", note: "Produces the shape's edge geometry (box/sphere/capsule/cylinder) in the object's local space — the same center/size/rotation export will convert, so preview == runtime." },
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
