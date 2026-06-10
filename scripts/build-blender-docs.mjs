#!/usr/bin/env node
/**
 * Build the Blender-add-on documentation packet (HTML diagram + trace pages),
 * the editor-side parallel to the engine packet:
 *
 *   npm run docs:blender     (or: node scripts/build-blender-docs.mjs)
 *
 * Area pages are hand-authored node graphs; trace pages embed the ACTUAL
 * current Python source of each step, extracted at build time. A renamed or
 * deleted symbol fails the build loudly (the anti-rot guard). Output lands in
 * docs/blender/ alongside a copy of the viewer shell.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUT_DIR = path.join(ROOT, "docs", "blender");
const SHELL = fs.readFileSync(path.join(ROOT, "docs", "engine", "index.html"), "utf8");

// ---------------------------------------------------------------------------
// Python symbol extraction (def / class, captured until dedent; comments kept).
// ---------------------------------------------------------------------------

function ExtractPy(relativePath, symbol)
{
  const lines = fs.readFileSync(path.join(ROOT, relativePath), "utf8").split("\n");
  const declaration = new RegExp(`^(\\s*)(def|class) ${symbol}\\b`);

  for (let index = 0; index < lines.length; index++)
  {
    const match = lines[index].match(declaration);
    if (match === null) { continue; }
    const indent = match[1].length;

    let end = index + 1;
    while (end < lines.length)
    {
      const line = lines[end];
      const blank = line.trim().length === 0;
      const lineIndent = line.length - line.trimStart().length;
      if (!blank && lineIndent <= indent) { break; }
      end++;
    }
    while (end > index + 1 && lines[end - 1].trim().length === 0) { end--; }
    return { start: index + 1, code: lines.slice(index, end).join("\n") };
  }

  console.error(`MISSING: ${symbol} in ${relativePath}`);
  process.exitCode = 1;
  return { start: 0, code: `# symbol "${symbol}" not found — regenerate after fixing` };
}

// ---------------------------------------------------------------------------
// Area diagrams (hand-authored node graphs of the add-on's structure).
// ---------------------------------------------------------------------------

function N(id, x, y, label, sub, desc, meta, w = 160, h = 44)
{
  return { id, x, y, w, h, label, sub, desc, meta };
}
function E(id, src, tgt, label = "")
{
  return { id, src, tgt, label };
}

const AREA_PAGES = {
  "index.html": {
    title: "Add-on overview",
    nodes: [
      N(1, 40, 40, "__init__.py", "registration", "The extension entry point. register()/unregister() pull in every submodule's own register() in dependency order (properties first — others reference its PropertyGroups). Dev-reloads submodules so editing during a session takes effect.", [["Blender", "4.2+ extension"], ["Reload", "importlib"]]),
      N(2, 40, 150, "properties.py", "the data model", "Every PropertyGroup: BJSComponent (one group, per-type fields), exposed vars + list items, trigger events, light/shadow/animation settings. Owns ID_KEY and ensure_object_id(). The single source of truth for what an object can carry.", [["Key class", "BJSComponent"], ["Identity", "ID_KEY = bjs_id"]]),
      N(3, 40, 270, "ui.py", "the N-panel", "Draws the Babylon panel: component list with per-type fields, light/camera/animation info, and the Export panel (Export / Live Link / Debug Build / Validate). Drawing only — every button calls an operator.", [["Panels", "BJS_PT_components / _export"]]),
      N(4, 280, 200, "operators.py", "all the verbs", "Add/remove/duplicate/move/copy/cut/paste components, Assign GUID, Fit Collider, pick-script + Sync, list & trigger-event rows, Validate, Export. Each is a bpy Operator invoked by a button.", [["Export op", "BJS_OT_export"], ["Count", "~20 operators"]]),
      N(5, 520, 80, "script_parse.py", "TS → fields", "Regex-reads @exposed(...) out of a behavior's TypeScript so Blender can show editable widgets without a TS runtime. THE cross-language contract.", [["Trigger", "pick-script / Sync"]]),
      N(6, 520, 190, "export.py", "the heart", "Writes the glb (Blender glTF exporter, +Y-up, GUIDs in extras) and builds the schema-v4 manifest. Converts axes Blender→Babylon. Force-includes referenced objects. Copies audio files.", [["Output", "glb + scene.json"], ["Schema", "v4"]]),
      N(7, 520, 300, "scene_export.py", "scene block", "Clear/ambient color, environment texture (copied out), fog, post-processing — the manifest's scene-wide settings.", [["Manifest key", "scene"]]),
      N(8, 520, 400, "anim_export.py", "NLA block", "Per-object animation: NLA strip names + autoplay clip/loop/speed. nla_clip_names() also feeds the validator.", [["Manifest key", "animation"]]),
      N(9, 760, 120, "validate.py", "pre-export checks", "Catches silent failures before export: missing scripts, dangling refs, MESH+DYNAMIC, mesh triggers, constraint ends without physics, skinned-mesh components, area lights, duplicate GUIDs, missing audio, no camera.", [["Entry", "validate_scene"]]),
      N(10, 760, 240, "live_link.py", "save → export", "save_post handler: when the scene opted in, every Ctrl+S re-validates + re-exports to the remembered path. Owns the live-link + Debug Build scene properties. Never breaks a save.", [["Hook", "_on_save_post"]]),
      N(11, 760, 360, "collider_preview.py", "viewport gizmo", "GPU wireframe of manual colliders drawn in the 3D view, in Blender space — so the preview matches the body export produces.", [["Draw", "POST_VIEW handler"]]),
    ],
    edges: [
      E(100, 1, 2, "registers"), E(101, 1, 3), E(102, 1, 4), E(103, 3, 4, "buttons"),
      E(104, 3, 2, "draws"), E(105, 4, 5, "Sync"), E(106, 4, 6, "Export"), E(107, 4, 9, "Validate"),
      E(108, 6, 7), E(109, 6, 8), E(110, 9, 6, "warn"), E(111, 10, 6, "Ctrl+S"), E(112, 2, 11, "values"),
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
      N(9, 800, 380, "serialize_scene", "scene block", "Color, environment (copied), fog, post — from scene_export.py.", [["File", "scene_export.py"]]),
    ],
    edges: [
      E(100, 1, 2), E(101, 1, 3), E(102, 1, 4), E(103, 1, 5),
      E(104, 5, 6), E(106, 6, 7, "scripts"), E(107, 5, 8), E(108, 5, 9),
    ],
  },
};

// ---------------------------------------------------------------------------
// Trace chains (each step: real Python symbol → embedded source).
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
      { file: "blender_addon/validate.py", symbol: "_check_constraints", note: "A joint needs a physics body on BOTH ends or it won't exist at runtime — warn if either is missing." },
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
// Shared page assembly (nav, code-panel patch, layout) — mirrors the engine set.
// ---------------------------------------------------------------------------

const AREA_NAV = Object.entries(AREA_PAGES).map(([file, page]) => [file, page.title.split(" ")[0] === "Add-on" ? "Overview" : page.title]);
const TRACE_NAV = TRACES.map((trace) => [`trace-${trace.id}.html`, trace.title.split(":")[0]]);

function RemoveNav(html)
{
  const marker = '<div style="position:fixed;bottom:10px;';
  const start = html.indexOf(marker);
  if (start === -1) { return html; }
  let depth = 0;
  let index = start;
  while (index < html.length)
  {
    if (html.startsWith("<div", index)) { depth++; index += 4; continue; }
    if (html.startsWith("</div>", index))
    {
      depth--; index += 6;
      if (depth === 0) { return html.slice(0, start) + html.slice(index); }
      continue;
    }
    index++;
  }
  return html;
}

function BuildNav(currentFile)
{
  const link = ([file, label]) => file === currentFile
    ? `<span style="background:#e08a3c;color:#fff;border-radius:6px;padding:2px 8px;">${label}</span>`
    : `<a href="${file}" style="color:#f0cda8;text-decoration:none;padding:2px 8px;">${label}</a>`;
  return '<div style="position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:9999;'
    + 'background:#241c14;border:1px solid #553f28;border-radius:10px;padding:6px 10px;'
    + 'font:12px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4);">'
    + '<div style="display:flex;gap:2px;justify-content:center;">'
    + '<span style="color:#967a52;padding:2px 6px;">Blender:</span>' + AREA_NAV.map(link).join("")
    + '<a href="../engine/index.html" style="color:#8fa3ff;text-decoration:none;padding:2px 8px;border-left:1px solid #553f28;margin-left:4px;">Runtime docs →</a></div>'
    + '<div style="display:flex;gap:2px;justify-content:center;margin-top:3px;border-top:1px solid #553f28;padding-top:3px;">'
    + '<span style="color:#967a52;padding:2px 6px;">Traces:</span>' + TRACE_NAV.map(link).join("") + '</div></div>';
}

const CODE_PANEL_PATCH = `
<style>
  #panel { position: relative; }
  #panel.open { width: var(--trace-panel-w, min(560px, 85vw)) !important; }
  #pi { width: 100% !important; box-sizing: border-box; }
  textarea.inp.pta { resize: vertical !important; min-height: 80px; max-height: 70vh; }
  .trace-code { background:#0d101a; border:1px solid #262d4a; border-radius:8px; padding:12px;
    margin:10px 0 14px; overflow:auto; font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;
    white-space:pre; tab-size:4; color:#dde2f1; height:42vh; resize: vertical; box-sizing: border-box; }
  .trace-loc { color:#8b93b8; font:11px system-ui; margin:6px 0 0; }
  #trace-resizer { position:absolute; left:0; top:0; bottom:0; width:7px; cursor: ew-resize; z-index: 10; }
  #trace-resizer:hover, #trace-resizer.dragging { background: #e08a3c33; }
</style>
<script>
  const __openNodePanel = openNodePanel;
  openNodePanel = function(n)
  {
    __openNodePanel(n);
    if (!n.code) { return; }
    const panel = document.getElementById('pi');
    const loc = document.createElement('div');
    loc.className = 'trace-loc';
    loc.textContent = n.file ? n.file + '  :  line ' + n.line : 'data';
    const pre = document.createElement('pre');
    pre.className = 'trace-code';
    pre.textContent = n.code;
    panel.appendChild(loc);
    panel.appendChild(pre);
  };
  (function AttachPanelResizer()
  {
    const panel = document.getElementById('panel');
    if (!panel) { return; }
    const handle = document.createElement('div');
    handle.id = 'trace-resizer';
    panel.appendChild(handle);
    let dragging = false;
    handle.addEventListener('mousedown', (e) => { dragging = true; handle.classList.add('dragging'); panel.style.transition = 'none'; e.preventDefault(); });
    window.addEventListener('mousemove', (e) => { if (!dragging) return; const w = Math.min(Math.max(window.innerWidth - e.clientX, 260), window.innerWidth * 0.92); document.documentElement.style.setProperty('--trace-panel-w', w + 'px'); });
    window.addEventListener('mouseup', () => { if (!dragging) return; dragging = false; handle.classList.remove('dragging'); panel.style.transition = ''; });
  })();
</script>`;

function EmitPage(file, title, data, isTrace)
{
  const match = SHELL.match(/const DIAGRAM_DATA = \{[\s\S]*?\};/);
  let page = SHELL.slice(0, match.index)
    + "const DIAGRAM_DATA = " + JSON.stringify(data) + ";"
    + SHELL.slice(match.index + match[0].length);
  page = page.replace(/<title>.*?<\/title>/, `<title>Blender — ${title}</title>`);
  page = RemoveNav(page);
  page = page.replace("<body>", "<body>" + BuildNav(file));
  if (isTrace) { page = page.replace("</body>", CODE_PANEL_PATCH + "</body>"); }
  fs.writeFileSync(path.join(OUT_DIR, file), page);
}

function LayoutSteps(count)
{
  const PER_ROW = 3, GAP_X = 260, GAP_Y = 150;
  return Array.from({ length: count }, (_, i) =>
  {
    const row = Math.floor(i / PER_ROW), col = i % PER_ROW;
    return { x: 40 + (row % 2 === 0 ? col : PER_ROW - 1 - col) * GAP_X, y: 40 + row * GAP_Y, w: 190, h: 56 };
  });
}

// ---------------------------------------------------------------------------
// Build.
// ---------------------------------------------------------------------------

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [file, page] of Object.entries(AREA_PAGES))
{
  EmitPage(file, page.title, { title: "Blender — " + page.title, nodes: page.nodes, edges: page.edges }, false);
}

for (const trace of TRACES)
{
  for (const step of trace.steps)
  {
    const { start, code } = ExtractPy(step.file, step.symbol);
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
  EmitPage(`trace-${trace.id}.html`, trace.title, { title: "Trace — " + trace.title, nodes, edges }, true);
}

const total = TRACES.reduce((sum, t) => sum + t.steps.length, 0);
console.log(`Blender docs: ${Object.keys(AREA_PAGES).length} area pages, ${TRACES.length} trace pages (${total} steps) → docs/blender/`);
