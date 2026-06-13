#!/usr/bin/env node
/**
 * Build docs/engine/ — area diagrams + code-trace pages.
 *
 *   npm run docs:trace   (or: node scripts/build-trace-docs.mjs)
 *
 * All HTML is generated from docs/_template/diagram-shell.html.
 * Area diagram data lives in scripts/docs/engine-areas.mjs.
 * Trace chains and symbol extraction are defined below.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_AREA_PAGES } from "./docs/engine-areas.mjs";
import {
  ReadShell,
  EmitDiagramPage,
  BuildEngineNav,
  LAYOUT_PATCH_ENGINE,
  CODE_PANEL_PATCH_ENGINE,
  LayoutSteps,
  ExtractSymbol,
} from "./docs/shared.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "docs", "engine");

// ---------------------------------------------------------------------------
// Trace chains — step = { file, symbol, note } or { title, code, note }.
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
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ApplyComponents",
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
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "InstantiateScripts",
        note: "LOAD — registry.Create(name) → inject entity/scene → ApplyExposedVars. Entity refs come back as PendingRefs (the target may not exist yet)." },
      { file: "packages/engine/src/scripting/exposed.ts", symbol: "ApplyExposedVars",
        note: "Writes stored values onto the instance: scalars coerced (vector3/color arrays → Babylon types), lists per element, entity fields deferred." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ResolveObjectReferences",
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
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ApplyComponents",
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
        note: "EXPORT — the CONSTRAINT case: pivot/axis → Y-up, target GUID, preset limits/motor/spring. CUSTOM also exports axes[] (six rows: axis id, mode, min/max, stiffness/damping)." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "BuildConstraints",
        note: "FINALIZE — both bodies exist now. Per registration: resolve target, require body on both ends, compute the frame, create, addConstraint, optional motor. Out: level.constraints." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "ComputeConstraintFrame",
        note: "THE key math. Owner-local pivot/axis → world via live transforms → target-local. Pins the CURRENT relative pose so nothing snaps on load." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "BuildAxisLimits",
        note: "Preset 6DoF table: frame X = authored axis; HINGE frees/limits ANGULAR_X (deg→rad), SLIDER/SPRING free/limit LINEAR_X, SPRING adds stiffness/damping. Dispatches CUSTOM to BuildCustomAxisLimits." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "BuildCustomAxisLimits",
        note: "CUSTOM — per manifest axes[] row: free (omit), locked (0,0), limited (min/max), spring (+ stiffness/damping). Angular limits deg→rad at runtime." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "ApplyMotor",
        note: "VELOCITY motor on the moving axis: target speed (deg/s→rad/s for hinges) + max force. HINGE/SLIDER presets only." },
    ],
  },
  {
    id: "audio",
    title: "Audio: component → positional sound",
    intro: "Audio engine v2; autoplay negotiates the browser gesture policy without blocking the load.",
    steps: [
      { file: "blender_addon/export.py", symbol: "_copy_audio_file",
        note: "EXPORT — the sound file is copied to audio/ next to the manifest; the component stores the relative path." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ApplyComponents",
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
        note: "The orchestrator: fetch/validate → InputManager.LoadAsset (inputActions + defaultInputMap) → right-handed glb append → entity loop → second pass → FinalizeLevel. Returns the Level." },
      { file: "packages/engine/src/core/loader/nodeResolution.ts", symbol: "BuildIdIndex",
        note: "GUID → node map from metadata.gltf.extras.bjs_id (needs the ExtrasAsMetadata import or this is empty and matching silently falls back to names)." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ProcessEntity",
        note: "Per manifest entity: node match (GUID first), Entity created + registered + back-referenced, components applied, light/camera processed." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "Shadows → scene look → animations → settle audio/GUI/particle tasks → trigger wiring → constraints → BuildGui3DControls → Begin → (debug colliders if the export allows)." },
      { file: "packages/engine/src/core/Level.ts", symbol: "Begin",
        note: "Attach InputManager (enables every action map), run every OnStart (error-isolated), subscribe RunFrame." },
      { file: "packages/engine/src/core/Level.ts", symbol: "RunFrame",
        note: "Every frame: InputManager.Process FIRST (actions evaluate, callbacks fire) → all OnUpdate(deltaSeconds) → updaters (offset cams) → InputManager.EndFrame LAST so device edges last exactly one frame." },
    ],
  },
  {
    id: "input",
    title: "Input: key press → action → behavior",
    intro: "Unity Input System style: the Blender Input Actions panel authors the scene asset (maps > actions > bindings) plus a Scene Default map; the manifest carries inputActions + defaultInputMap; InputManager evaluates every frame.",
    steps: [
      { file: "blender_addon/scene_export.py", symbol: "_serialize_input_asset",
        note: "BLENDER — maps/actions/bindings → scene.inputActions (built-in Player asset when the panel is empty). serialize_scene also writes scene.defaultInputMap from the Scene Default picker." },
      { file: "blender_addon/scene_export.py", symbol: "serialize_scene",
        note: "BLENDER — assembles the manifest scene block: clear/ambient, environment, fog, post, inputActions, and defaultInputMap (which map scripts without @inputMap receive on behavior.input)." },
      { file: "packages/engine/src/input/DefaultAsset.ts", symbol: "DEFAULT_INPUT_ASSET",
        note: "Runtime fallback when a manifest omits inputActions — keep in sync with blender_addon/input_defaults.py." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "Load",
        note: "LOAD — InputManager.LoadAsset(manifest.scene.inputActions ?? DEFAULT, defaultInputMap) runs before the glb append so maps exist when behaviors are built." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "InjectInputMaps",
        note: "@inputMap(\"Name\") / @inputMap() fields get map handles; scripts with no @inputMap receive the scene default on behavior.input — all before OnStart." },
      { file: "packages/engine/src/input/InputManager.ts", symbol: "Process",
        note: "Called by Level.RunFrame BEFORE behaviors: poll the gamepad, evaluate every enabled map's actions, fire started/performed/canceled." },
      { file: "packages/engine/src/input/InputAction.ts", symbol: "Process",
        note: "Per action: resolve bindings (most-actuated wins), advance the BUTTON/VALUE/PASSTHROUGH phase machine, set the per-frame edge flags polling reads." },
      { file: "packages/engine/src/input/InputBinding.ts", symbol: "ResolveBinding",
        note: "Raw browser tokens: keyboard keys, gamepad button/axis/stick indices, and 1DAXIS/2DVECTOR composites built from part bindings." },
      { file: "apps/playground/src/behaviors/InputMover.ts", symbol: "OnUpdate",
        note: "CONSUMER — polls Move/Sprint off the injected map and subscribes to Jump's performed callback in OnStart; no key codes anywhere in gameplay code." },
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
  {
    id: "gui",
    title: "2D GUI: JSON layout → AdvancedDynamicTexture",
    intro: "File-backed HUDs and in-world mesh UI from Babylon's GUI Editor.",
    steps: [
      { file: "blender_addon/export.py", symbol: "_copy_asset",
        note: "EXPORT — the GUI .json is copied to gui/ next to the manifest; the component stores the manifest-relative path." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ApplyComponents",
        note: "LOAD — each GUI component queues an ApplyGui promise (fetch+parse is async); the entity loop never blocks on UI I/O." },
      { file: "packages/engine/src/ui/gui2d.ts", symbol: "ApplyGui",
        note: "FULLSCREEN → CreateFullscreenUI; MESH → CreateForMesh on the entity node. parseFromURLAsync loads the layout. Name = file stem." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "SettleTasks over guiTasks (allSettled): a bad JSON logs a warning; the level still loads. Runs alongside audio and particle settlement." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetGui",
        note: "RUNTIME — entity.GetGui(\"hud\")?.getControlByName(\"Score\") from any behavior (exact name, then contains)." },
    ],
  },
  {
    id: "particles",
    title: "Particles: JSON system → emitter",
    intro: "File-backed particle systems from Babylon's Particle Editor.",
    steps: [
      { file: "blender_addon/export.py", symbol: "_copy_asset",
        note: "EXPORT — the particle .json is copied to particles/; rootUrl for nested textures is derived from the manifest path." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ApplyComponents",
        note: "LOAD — each PARTICLE component queues an ApplyParticles promise; GPU mode is requested when supported." },
      { file: "packages/engine/src/subsystems/particles.ts", symbol: "ApplyParticles",
        note: "ParticleHelper.ParseFromFileAsync. attachToEntity: mesh emitter or absolute position clone for empties. autoStart calls system.start()." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "SettleTasks over particleTasks before triggers/constraints/3D GUI. Bad file → warn, level continues." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetParticles",
        note: "RUNTIME — entity.GetParticles(\"fire\")?.start() / .stop() from behaviors." },
    ],
  },
  {
    id: "gui3d",
    title: "3D GUI: components → GUI3DManager",
    intro: "In-scene buttons and panels authored as individual GUI3D_* components; Blender parenting defines panel hierarchy.",
    steps: [
      { file: "blender_addon/export.py", symbol: "_serialize_components",
        note: "EXPORT — GUI3D_* cases: text/image/tooltip/panel layout fields; button images via _copy_asset; click events as {target GUID, message}. Click targets force-included for GUID assignment." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ApplyComponents",
        note: "LOAD — GUI3D components don't build yet; each registration carries parentId (manifest parent GUID) for panel lookup." },
      { file: "packages/engine/src/ui/gui3d/builder.ts", symbol: "BuildGui3DControls",
        note: "FINALIZE — after constraints. BuildPanels (addControl → linkToTransformNode) → batch controls with blockLayout → ApplyControlContent → WireClickEvents. Returns level.gui3DManager." },
      { file: "packages/engine/src/ui/gui3d/controls.ts", symbol: "ApplyControlContent",
        note: "THE Babylon ordering contract: content/text/image MUST be set AFTER addControl or it is silently lost. MeshButton3D wraps the entity mesh." },
      { file: "packages/engine/src/ui/gui3d/events.ts", symbol: "WireClickEvents",
        note: "Each On Click row: onPointerClickObservable → level.ById(target) → SendMessage(message, buttonEntity) → behavior OnMessage." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetControl3D",
        note: "RUNTIME — entity.GetControl3D(\"StartButton\") to drive holographic text, visibility, or subscribe to hover observables." },
    ],
  },
];

// ---------------------------------------------------------------------------
// Build.
// ---------------------------------------------------------------------------

export function BuildEngineDocs()
{
  const shell = ReadShell();
  const areaNav = Object.entries(ENGINE_AREA_PAGES).map(([file, page]) => [file, page.navLabel]);
  const traceNav = TRACES.map((trace) => [`trace-${trace.id}.html`, trace.title.split(":")[0]]);

  for (const [file, page] of Object.entries(ENGINE_AREA_PAGES))
  {
    const pageTitle = file === "index.html"
      ? "BJS Level Kit — Engine overview"
      : `BJS Level Kit — ${page.diagram.title.replace(/^Babylon Level Kit — /, "")}`;
    EmitDiagramPage({
      shell,
      outPath: path.join(OUT_DIR, file),
      pageTitle,
      diagramData: page.diagram,
      navHtml: BuildEngineNav(file, areaNav, traceNav),
      bodyPatch: LAYOUT_PATCH_ENGINE,
    });
  }
  console.log("engine area pages:", areaNav.map(([f]) => f).join(", "));

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
    console.error("Extraction failures above — engine trace pages NOT written.");
    process.exit(1);
  }

  const traceFiles = [];
  for (const trace of TRACES)
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

    const outFile = `trace-${trace.id}.html`;
    EmitDiagramPage({
      shell,
      outPath: path.join(OUT_DIR, outFile),
      pageTitle: `Trace — ${trace.title}`,
      diagramData: { title: "Trace — " + trace.title, nodes, edges },
      navHtml: BuildEngineNav(outFile, areaNav, traceNav),
      bodyPatch: CODE_PANEL_PATCH_ENGINE,
    });
    traceFiles.push(outFile);
  }
  console.log("engine trace pages:", traceFiles.join(", "));

  const legacy = path.join(OUT_DIR, "trace.html");
  if (fs.existsSync(legacy)) { fs.unlinkSync(legacy); console.log("trace.html (list UI) removed"); }
}

if (import.meta.url === new URL(process.argv[1], "file:").href)
{
  BuildEngineDocs();
}
