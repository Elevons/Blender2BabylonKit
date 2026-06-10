#!/usr/bin/env node
/**
 * Build docs/engine/trace.html — the interactive CODE TRACE EXPLORER.
 *
 *   npm run docs:trace        (or: node scripts/build-trace-docs.mjs)
 *
 * For each feature, a trace is an ordered chain of steps; each step names a
 * real file + symbol. This script EXTRACTS the actual source of every symbol
 * from the repo at build time and embeds it, so the explorer always shows the
 * code as it is now — re-run after engine changes and the docs can't rot.
 * A missing symbol fails the build loudly (that's the point).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUT = path.join(ROOT, "docs", "engine", "trace.html");

// ---------------------------------------------------------------------------
// Extraction: pull one function/method/class out of a TS or Python file.
// ---------------------------------------------------------------------------

function ReadFileLines(relativePath)
{
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8").split("\n");
}

/** TS: find the symbol's declaration line, then brace-match to its end. */
function ExtractTs(lines, symbol)
{
  const declaration = new RegExp(
    `^(export )?(async )?(function )?(private |public |static )*(async )?(get )?${symbol}\\b|^(export )?(abstract )?class ${symbol}\\b|^(export )?const ${symbol}\\b`
  );

  for (let index = 0; index < lines.length; index++)
  {
    if (!declaration.test(lines[index].trim()) && !lines[index].trim().startsWith(`${symbol}(`))
    {
      continue;
    }
    // Walk back over a JSDoc block so the comment ships with the code.
    let start = index;
    if (lines[start - 1]?.trim().endsWith("*/"))
    {
      while (start > 0 && !lines[start - 1].trim().startsWith("/**")) { start--; }
      start--;
    }

    let depth = 0;
    let sawBrace = false;
    for (let end = index; end < lines.length; end++)
    {
      for (const character of lines[end])
      {
        if (character === "{") { depth++; sawBrace = true; }
        else if (character === "}") { depth--; }
      }
      if (sawBrace && depth <= 0)
      {
        return { start: start + 1, code: lines.slice(start, end + 1).join("\n") };
      }
      // const X = [...] / = {...}; ends at depth 0 with a semicolon line
      if (!sawBrace && lines[end].trimEnd().endsWith(";") && end > index)
      {
        return { start: start + 1, code: lines.slice(start, end + 1).join("\n") };
      }
    }
  }
  return null;
}

/** Python: find `def symbol` / `class symbol`, capture until dedent. */
function ExtractPy(lines, symbol)
{
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
      const isBlank = line.trim().length === 0;
      const lineIndent = line.length - line.trimStart().length;
      if (!isBlank && lineIndent <= indent) { break; }
      end++;
    }
    while (lines[end - 1].trim().length === 0) { end--; }
    return { start: index + 1, code: lines.slice(index, end).join("\n") };
  }
  return null;
}

function ExtractSymbol(relativePath, symbol)
{
  const lines = ReadFileLines(relativePath);
  const extracted = relativePath.endsWith(".py")
    ? ExtractPy(lines, symbol)
    : ExtractTs(lines, symbol);

  if (extracted === null)
  {
    console.error(`MISSING: ${symbol} in ${relativePath}`);
    process.exitCode = 1;
    return { start: 0, code: `// symbol "${symbol}" not found — regenerate after fixing` };
  }
  return extracted;
}

// ---------------------------------------------------------------------------
// The traces. step = { file, symbol, note } — note explains what data flows.
// step = { title, code, note } embeds literal text (e.g. a manifest excerpt).
// ---------------------------------------------------------------------------

const TRACES = [
  {
    id: "physics",
    title: "Physics: collider → Havok body",
    intro: "From the N-panel checkbox to a body on the node. Authored in Blender space, converted once at export, built at load.",
    steps: [
      { file: "blender_addon/export.py", symbol: "_serialize_components",
        note: "EXPORT — every component becomes one dict. The COLLIDER case converts center (x,y,z)→(x,z,−y), swaps size axes, converts the rotation quaternion, and attaches trigger events. Output: the manifest's components array." },
      { title: "The manifest (data between the two halves)",
        code: `{ "type": "COLLIDER", "shape": "BOX", "isTrigger": false, "autoFit": true,\n  "size": [1,1,1], "radius": 0.5, "height": 2, "center": [0,0,0],\n  "rotation": [0,0,0,1] },\n{ "type": "RIGIDBODY", "bodyType": "DYNAMIC", "mass": 1,\n  "friction": 0.5, "restitution": 0.2,\n  "linearDamping": 0, "angularDamping": 0 }`,
        note: "Already Babylon-space (Y-up). The runtime never converts axes — that happened once, at export." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "ApplyComponents",
        note: "LOAD, per entity — receives Entity + Component[]. ClassifyComponents sorts them; collider/body pair goes to BuildPhysics; the returned PhysicsBody lands on entity.body." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "BuildPhysics",
        note: "The dispatcher. In: node + ColliderComponent? + RigidBodyComponent? + scene. Builds the shared BodyBuildInput, picks one of three shape paths, applies dynamics. Out: PhysicsBody | undefined." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "BuildBodyInput",
        note: "The data every path shares: motion type, mass (DYNAMIC only), material, isTrigger, and the geometry facts (isMesh / hasGeometry via the ownership rule below)." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "OwnedColliderMeshes",
        note: "THE ownership rule (v0.29.1): include a descendant mesh only if no node on its path up carries bjs_id — multi-material submeshes yes, parented child entities no." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "BuildAutoFitBody",
        note: "Default path. Real mesh → PhysicsAggregate sizes the primitive. Multi-material wrapper → FitColliderShape over ComputeLocalBounds (an aggregate would crash on the non-mesh node)." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "AttachShape",
        note: "Shared tail: material + trigger flag onto the shape, then a PhysicsBody on the node with the mass. ApplyBodyDynamics adds motion type + damping." },
    ],
  },
  {
    id: "exposed",
    title: "Scripting: @exposed field → Blender → behavior instance",
    intro: "The cross-language round trip: TS source parsed by Python, values stored per-object, applied back onto the instance before OnStart.",
    steps: [
      { file: "packages/engine/src/scripting/exposed.ts", symbol: "exposed",
        note: "RUNTIME DECLARATION — records field name + UI hints in a WeakMap at class-definition time. Lowercase on purpose: the regex below matches it literally." },
      { file: "blender_addon/script_parse.py", symbol: "parse_exposed",
        note: "BLENDER — regex-parses the .ts source (no TS runtime in Blender). This is why defaults must be single-line literals. Output feeds the BJSExposedVar rows you edit in the panel." },
      { file: "blender_addon/export.py", symbol: "_serialize_vars",
        note: "EXPORT — per-object edited values → the SCRIPT component's vars dict. Entity references serialize as the target's GUID (target force-included so it exists in the glb)." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "InstantiateScripts",
        note: "LOAD — registry.Create(name) → inject entity/scene → ApplyExposedVars. Entity refs come back as PendingRefs (the target may not exist yet)." },
      { file: "packages/engine/src/scripting/exposed.ts", symbol: "ApplyExposedVars",
        note: "Writes stored values onto the instance: scalars coerced (vector3/color arrays → Babylon types), lists per element, entity fields deferred." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "ResolveObjectReferences",
        note: "SECOND PASS — every entity exists now; each PendingRef's GUID resolves via level.ById and the real Entity is assigned (or placed into its list slot). Then Begin → OnStart." },
    ],
  },
  {
    id: "trigger",
    title: "Triggers: On-Enter event → OnMessage",
    intro: "Data-authored gameplay reactions with zero code on the sender side.",
    steps: [
      { file: "blender_addon/properties.py", symbol: "BJSTriggerEvent",
        note: "AUTHORING — one row: target object + message + optional tag filter, on a trigger collider." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "ApplyComponents",
        note: "LOAD — a trigger collider with events queues a TriggerRegistration {sourceEntity, events}; wiring waits for FinalizeLevel (the plugin observable needs physics live)." },
      { file: "packages/engine/src/subsystems/triggers.ts", symbol: "WireTriggerEvents",
        note: "ONE observer on HavokPlugin.onTriggerCollisionObservable. Registrations indexed by trigger body for O(1) dispatch. Returns the observer; Level removes it on dispose." },
      { file: "packages/engine/src/subsystems/triggers.ts", symbol: "DeliverTriggerEvents",
        note: "Per TRIGGER_ENTERED: entering body → entity (metadata.bjsEntity), tag gate, target lookup by GUID, then SendMessage(message, enteringEntity)." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "SendMessage",
        note: "Fan-out to every behavior on the target, each call error-isolated." },
      { file: "packages/engine/src/scripting/Behavior.ts", symbol: "OnMessage",
        note: "RECEIVE — override in your behavior. source = the entity that entered the volume. See MessageLogger.ts / CarController.ts." },
    ],
  },
  {
    id: "constraint",
    title: "Constraints: component → Havok joint",
    intro: "Joints pin the as-placed pose — position things in Blender how they should rest.",
    steps: [
      { file: "blender_addon/export.py", symbol: "_serialize_components",
        note: "EXPORT — the CONSTRAINT case: pivot converted to Y-up, the axis enum mapped to a unit vector (_CONSTRAINT_AXIS_TO_BABYLON), target GUID, limits/motor/spring numbers passed through raw (degrees/meters; runtime converts)." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "BuildConstraints",
        note: "FINALIZE — both bodies exist now. Per registration: resolve target, require body on both ends, compute the frame, create, addConstraint, optional motor. Out: level.constraints." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "ComputeConstraintFrame",
        note: "THE key math. Owner-local pivot/axis → world via live transforms → target-local. Pins the CURRENT relative pose so nothing snaps on load." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "BuildAxisLimits",
        note: "Per-type 6DoF table: frame X = authored axis; HINGE frees/limits ANGULAR_X (deg→rad), SLIDER/SPRING free/limit LINEAR_X, SPRING adds stiffness/damping to the limit." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "ApplyMotor",
        note: "VELOCITY motor on the moving axis: target speed (deg/s→rad/s for hinges) + max force." },
    ],
  },
  {
    id: "audio",
    title: "Audio: component → positional sound",
    intro: "Audio engine v2; autoplay negotiates the browser gesture policy without blocking the load.",
    steps: [
      { file: "blender_addon/export.py", symbol: "_copy_audio_file",
        note: "EXPORT — the sound file is copied to audio/ next to the manifest; the component stores the relative path." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "ApplyComponents",
        note: "LOAD — each AUDIO component queues an ApplyAudio promise (fetch+decode is async); the entity loop never blocks on sound I/O." },
      { file: "packages/engine/src/subsystems/audio.ts", symbol: "ApplyAudio",
        note: "CreateSoundAsync with spatialEnabled at creation; spatial.attach(entity.node) so 3D sounds follow. Name = file stem. Autoplay: void unlockAsync().then(play) — fire-and-forget." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "Promise.allSettled over the audio tasks: a bad file logs a warning; the level still loads. Then triggers, constraints, Begin." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetSound",
        note: "RUNTIME — entity.GetSound(\"door\")?.play() from any behavior (exact name, then contains)." },
    ],
  },
  {
    id: "load",
    title: "Level load, end to end",
    intro: "The spine everything above hangs off.",
    steps: [
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "Load",
        note: "The orchestrator: fetch/validate → right-handed glb append → GUID index → entity loop → second pass → FinalizeLevel. Returns the Level." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "BuildIdIndex",
        note: "GUID → node map from metadata.gltf.extras.bjs_id (needs the ExtrasAsMetadata import or this is empty and matching silently falls back to names)." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "ProcessEntity",
        note: "Per manifest entity: node match (GUID first), Entity created + registered + back-referenced, components applied, light/camera processed." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "Shadows → scene look → animations → audio settle → trigger wiring → constraints → Begin → (debug colliders if the export allows)." },
      { file: "packages/engine/src/core/Level.ts", symbol: "Begin",
        note: "Attach Input, run every OnStart (error-isolated), subscribe RunFrame." },
      { file: "packages/engine/src/core/Level.ts", symbol: "RunFrame",
        note: "Every frame: all OnUpdate(deltaSeconds) → updaters (offset cams) → Input.Update LAST so WasPressed edges last exactly one frame." },
    ],
  },
  {
    id: "input",
    title: "Input: key press → behavior",
    intro: "No Blender side — bindings live in one runtime file.",
    steps: [
      { file: "packages/engine/src/scripting/Input.ts", symbol: "DEFAULT_ACTIONS",
        note: "THE binding table — change the control scheme here (or BindAction/BindAxis at startup)." },
      { file: "packages/engine/src/scripting/Input.ts", symbol: "Attach",
        note: "Level.Begin calls this: one scene keyboard observer maintains heldKeys + pressedThisFrame (edge set)." },
      { file: "packages/engine/src/scripting/Input.ts", symbol: "Axis",
        note: "Digital keys first (−1/0/+1), analog stick past the deadzone otherwise. Behaviors call this in OnUpdate." },
      { file: "packages/engine/src/scripting/Input.ts", symbol: "Update",
        note: "Called by Level.RunFrame AFTER behaviors: clears the edge set, re-polls the first gamepad (snapshots in some browsers)." },
      { file: "apps/playground/src/behaviors/InputMover.ts", symbol: "OnUpdate",
        note: "CONSUMER — a behavior reading axes/actions; no key codes anywhere in gameplay code." },
    ],
  },
  {
    id: "livelink",
    title: "Live Link: Ctrl+S → browser reload",
    intro: "The iteration loop.",
    steps: [
      { file: "blender_addon/live_link.py", symbol: "_on_save_post",
        note: "BLENDER — save_post handler: checkbox on + path remembered → validate + export. Failures log; the save never breaks." },
      { file: "apps/playground/vite.config.ts", symbol: "ReloadOnLevelExport",
        note: "APP — Vite plugin watches public/levels/*.scene.json (manifest written AFTER the glb, so both are ready) → ws full-reload." },
    ],
  },
];

// ---------------------------------------------------------------------------
// Resolve every step (extract code), embed, emit HTML.
// ---------------------------------------------------------------------------

for (const trace of TRACES)
{
  for (const step of trace.steps)
  {
    if (step.file !== undefined)
    {
      const { start, code } = ExtractSymbol(step.file, step.symbol);
      step.code = code;
      step.line = start;
      step.title = `${step.symbol} — ${step.file.split("/").pop()}`;
    }
    else
    {
      step.file = ""; step.line = 0; step.symbol = step.title;
    }
  }
}

if (process.exitCode === 1)
{
  console.error("Extraction failures above — trace.html NOT written.");
  process.exit(1);
}

const SHELL = fs.readFileSync(path.join(ROOT, "docs", "engine", "index.html"), "utf8");

// Trace pages + the area pages they coexist with (two nav rows).
const AREA_NAV = [
  ["index.html","Overview"],["blender-addon.html","Blender add-on"],["load-pipeline.html","Load pipeline"],
  ["scripting.html","Scripting"],["physics.html","Physics"],["rendering.html","Rendering"],
  ["audio-animation.html","Audio/Anim"],["workflow.html","Workflow"],
];
const TRACE_NAV = TRACES.map((trace) => [`trace-${trace.id}.html`, trace.title.split(":")[0]]);

/**
 * Remove a previously injected nav (the fixed bottom bar) by walking div depth
 * from its opening tag to the matching close — regex can't handle the nesting.
 */
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
      depth--;
      index += 6;
      if (depth === 0) { return html.slice(0, start) + html.slice(index); }
      continue;
    }
    index++;
  }
  return html; // unbalanced — leave untouched rather than corrupt
}

function BuildNav(currentFile)
{
  const link = ([file, label]) => file === currentFile
    ? `<span style="background:#4f6df5;color:#fff;border-radius:6px;padding:2px 8px;">${label}</span>`
    : `<a href="${file}" style="color:#cdd5ff;text-decoration:none;padding:2px 8px;">${label}</a>`;
  return '<div style="position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:9999;'
    + 'background:#1b2030;border:1px solid #333a55;border-radius:10px;padding:6px 10px;'
    + 'font:12px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4);">'
    + '<div style="display:flex;gap:2px;justify-content:center;">' + AREA_NAV.map(link).join("")
    + '<a href="../blender/index.html" style="color:#f0cda8;text-decoration:none;padding:2px 8px;border-left:1px solid #2a3050;margin-left:4px;">Blender docs →</a>' + '</div>'
    + '<div style="display:flex;gap:2px;justify-content:center;margin-top:3px;border-top:1px solid #2a3050;padding-top:3px;">'
    + '<span style="color:#6c7396;padding:2px 6px;">Traces:</span>' + TRACE_NAV.map(link).join("") + '</div></div>';
}

// Patch appended to trace pages: widen the open panel and render n.code as a
// read-only code block under the description textarea.
const CODE_PANEL_PATCH = `
<style>
  /* Trace pages: the panel is the reading surface — let it breathe. */
  #panel { position: relative; }
  #panel.open { width: var(--trace-panel-w, min(560px, 85vw)) !important; }
  #pi { width: 100% !important; box-sizing: border-box; }
  /* Sections are individually resizable (drag the bottom-right grip). */
  textarea.inp.pta { resize: vertical !important; min-height: 80px; max-height: 70vh; }
  .trace-code { background:#0d101a; border:1px solid #262d4a; border-radius:8px; padding:12px;
    margin:10px 0 14px; overflow:auto; font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;
    white-space:pre; tab-size:2; color:#dde2f1; height:42vh; resize: vertical; box-sizing: border-box; }
  .trace-loc { color:#8b93b8; font:11px system-ui; margin:6px 0 0; }
  /* Drag the panel's left edge to resize the whole sidebar. */
  #trace-resizer { position:absolute; left:0; top:0; bottom:0; width:7px; cursor: ew-resize; z-index: 10; }
  #trace-resizer:hover, #trace-resizer.dragging { background: #4f6df533; }
</style>
<script>
  // Render the step's source under the description (read-only, scrollable).
  const __openNodePanel = openNodePanel;
  openNodePanel = function(n)
  {
    __openNodePanel(n);
    if (!n.code) { return; }
    const panel = document.getElementById('pi');
    const loc = document.createElement('div');
    loc.className = 'trace-loc';
    loc.textContent = n.file ? n.file + '  :  line ' + n.line : 'data between the two halves';
    const pre = document.createElement('pre');
    pre.className = 'trace-code';
    pre.textContent = n.code;
    panel.appendChild(loc);
    panel.appendChild(pre);
  };

  // Left-edge drag handle: resize the whole sidebar (width persists per page load).
  (function AttachPanelResizer()
  {
    const panel = document.getElementById('panel');
    if (!panel) { return; }
    const handle = document.createElement('div');
    handle.id = 'trace-resizer';
    panel.appendChild(handle);

    let dragging = false;
    handle.addEventListener('mousedown', (mouseEvent) =>
    {
      dragging = true;
      handle.classList.add('dragging');
      panel.style.transition = 'none'; // no easing fight while dragging
      mouseEvent.preventDefault();
    });
    window.addEventListener('mousemove', (mouseEvent) =>
    {
      if (!dragging) { return; }
      const width = Math.min(Math.max(window.innerWidth - mouseEvent.clientX, 260), window.innerWidth * 0.92);
      document.documentElement.style.setProperty('--trace-panel-w', width + 'px');
    });
    window.addEventListener('mouseup', () =>
    {
      if (!dragging) { return; }
      dragging = false;
      handle.classList.remove('dragging');
      panel.style.transition = '';
    });
  })();
</script>`;

/** Serpentine layout: left→right, drop a row, right→left — reads like a script. */
function LayoutSteps(stepCount)
{
  const PER_ROW = 3, W = 190, H = 56, GAP_X = 260, GAP_Y = 150;
  const positions = [];
  for (let index = 0; index < stepCount; index++)
  {
    const row = Math.floor(index / PER_ROW);
    const column = index % PER_ROW;
    const x = 40 + (row % 2 === 0 ? column : PER_ROW - 1 - column) * GAP_X;
    positions.push({ x, y: 40 + row * GAP_Y, w: W, h: H });
  }
  return positions;
}

function BuildTracePage(trace)
{
  const positions = LayoutSteps(trace.steps.length);
  const nodes = trace.steps.map((step, index) => ({
    id: index + 1,
    ...positions[index],
    label: `${index + 1}. ${step.symbol}`,
    sub: step.file ? step.file.split("/").pop() : "data",
    desc: step.note,
    meta: step.file ? [["File", step.file], ["Line", String(step.line)]] : [["Kind", "data contract"]],
    code: step.code,
    file: step.file,
    line: step.line,
  }));
  const edges = trace.steps.slice(1).map((step, index) => ({
    id: 100 + index, src: index + 1, tgt: index + 2, label: "",
  }));

  const data = { title: "Trace — " + trace.title, nodes, edges };
  const match = SHELL.match(/const DIAGRAM_DATA = \{[\s\S]*?\};/);
  let page = SHELL.slice(0, match.index)
    + "const DIAGRAM_DATA = " + JSON.stringify(data) + ";"
    + SHELL.slice(match.index + match[0].length);
  page = page.replace(/<title>.*?<\/title>/, `<title>Trace — ${trace.title}</title>`);
  page = RemoveNav(page);
  page = page.replace("<body>", "<body>" + BuildNav(`trace-${trace.id}.html`));
  page = page.replace("</body>", CODE_PANEL_PATCH + "</body>");

  const out = path.join(ROOT, "docs", "engine", `trace-${trace.id}.html`);
  fs.writeFileSync(out, page);
  return out;
}

const written = TRACES.map(BuildTracePage);
console.log("trace pages:", written.map((p) => path.basename(p)).join(", "));

// Refresh the nav on the eight area pages so both rows appear everywhere.
for (const [file] of AREA_NAV)
{
  const target = path.join(ROOT, "docs", "engine", file);
  let page = fs.readFileSync(target, "utf8");
  page = RemoveNav(page);
  page = page.replace("<body>", "<body>" + BuildNav(file));
  fs.writeFileSync(target, page);
}
console.log("area-page navs refreshed");

// The old list-style explorer is superseded by the per-feature diagram pages.
const legacy = path.join(ROOT, "docs", "engine", "trace.html");
if (fs.existsSync(legacy)) { fs.unlinkSync(legacy); console.log("trace.html (list UI) removed"); }
