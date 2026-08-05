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
import { EnrichBlenderAreaDiagram, EnrichTraceDiagram } from "./docs/diagram-links.mjs";
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
      N(1, 300, 40, "__init__.py", "registration", "Extension entry point. register()/unregister() call each subpackage's register() in dependency order — components, scene, materials & input_actions first (PropertyGroups referenced everywhere), then export, operators, ui, viewport. Reloads submodules so edits land mid-session.", [["Blender", "4.2+ extension"], ["Order", "data → ui"]]),
      N(2, 40, 60, "core/", "ids + TS parsing", "Pure helpers, nothing registered. ids.py owns ID_KEY ('bjs_id'), VISIBLE_KEY ('bjs_visible'), CAST_SHADOWS_KEY ('bjs_cast_shadows'), and ensure_object_id(); script_parse.py regex-reads @exposed(...) and @inputMap(\"...\") from behavior TypeScript — THE cross-language contract.", [["Files", "ids · script_parse"]]),
      N(3, 40, 180, "components/", "per-object data", "The component model on every Object: BJSComponent (one group switched by comp_type), exposed vars + list items, trigger/click events, light-shadow & animation blocks, and the copy/paste clipboard. constants.py isolates every enum table.", [["Key class", "BJSComponent"], ["On", "Object.bjs_components"], ["Types", "incl. MSDF_TEXT"]]),
      N(4, 40, 300, "scene/", "scene settings", "BJSSceneSettings on Scene.bjs_scene: clear/ambient, environment (World texture via scene/environment.py find_world_env_node, or useDefault flag via use_default_environment with environment_intensity / environment_rotation_y), Show Skybox (IBL without visible background when off; forced off when Atmosphere on), Skybox Ignores Fog (mesh.applyFog = false when on), fog, Atmosphere (scene/atmosphere.py — SUN lamp, scattering), freeze shadows; post-processing lives on the nested bjs_scene.post block (scene/post_processing.py) — MSAA, FXAA, bloom, SSAO, image processing (tone mapping type, exposure, contrast, vignette, color grading, curves), sharpen, DOF, chromatic aberration, grain, glow.", [["On", "Scene.bjs_scene.post"]]),
      N(5, 40, 420, "input_actions/", "Input Actions asset", "The asset end-to-end: data model (maps/actions/bindings), the built-in Player defaults, JSON serialize/apply (+ friendly-key aliases), and every bjs.input_* operator.", [["Export keys", "inputActions + defaultInputMap"]]),
      N(6, 300, 200, "operators/", "the verbs", "Component/script/export operators in operators/ (components.py, scripts.py, export_ops.py). Input Actions operators live in input_actions/operators.py — those buttons route there, not through operators/.", [["Export op", "BJS_OT_export"]]),
      N(7, 300, 340, "ui/", "panels + menus", "All presentation. Viewport **Babylon Object** N-panel = selected or pinned object + light/camera/animation children. **Properties › Material › Babylon** = NME JSON, Scan NME, Extract Textures…, texture/input overrides on the material datablock (material_panels.py). **Babylon Scene** N-panel = scene-wide settings (rendering, fog, atmosphere, post, Input Actions, export).", [["Object", "Babylon Object"], ["Material", "Properties › Babylon"], ["Scene", "Babylon Scene"]]),
      N(8, 560, 110, "export/", "the pipeline", "The output half. level.py orchestrates the glb + schema-v4 manifest (begin_asset_export resets copy reservations each pass); components / datablocks / animation / scene serialize each block (Blender→Babylon axis swap happens here); assets.py copies media with stable sanitized names (re-export overwrites; _2 only on same-pass collision); validate.py pre-flights; live_link.py re-exports on Ctrl+S.", [["Output", "glb + scene.json"], ["Schema", "v4"]]),
      N(9, 560, 320, "viewport/", "viewport gizmo", "GPU overlays. collider_preview.py draws collider wireframes; cog_preview.py draws an amber cross at dynamic rigid-body center of mass — both in Blender space so preview matches export/runtime.", [["Draw", "POST_VIEW handlers"]]),
      N(16, 40, 540, "materials/", "NME overrides", "Per Material datablock: bjs_nme_file + bjs_nme_textures + bjs_nme_inputs + bjs_nme_gradients. nme_textures.py detects embedded data: URLs / base64String; Extract Textures… writes PNG/JPG beside the JSON. export/materials.py copies each NME source once, patches external texture URLs (strips embeds on override), InputBlock values, and GradientBlock colorSteps; serialize_materials shares one exported JSON across materials that point at the same source.", [["Panel", "Properties › Material › Babylon"], ["On", "Material"]]),
    ],
    edges: [
      E(100, 1, 3, "registers"), E(101, 1, 4, "registers"), E(102, 1, 5, "registers"),
      E(114, 1, 6, "registers"), E(115, 1, 7, "registers"), E(116, 1, 8, "registers"), E(117, 1, 9, "registers"),
      E(119, 1, 16, "registers"),
      E(103, 7, 6, "buttons"), E(104, 7, 3, "draws"), E(105, 7, 4, "draws"), E(106, 7, 5, "edits"),
      E(118, 7, 5, "input_* buttons"),
      E(107, 6, 8, "Export"), E(119, 6, 8, "Validate"),
      E(108, 6, 2, "Sync"),
      E(109, 8, 3, "reads"), E(110, 8, 4, "reads"), E(111, 8, 5, "serializes"), E(112, 8, 2, "GUIDs"),
      E(113, 3, 9, "preview fields"), E(120, 7, 16, "draws"), E(121, 16, 8, "serialize"),
    ],
  },
  "data-model.html": {
    title: "Data model",
    nodes: [
      N(1, 40, 40, "ensure_object_id", "GUID assignment", "Stamps a unique bjs_id custom property on an object (and re-issues duplicates). This is what promotes a plain object into an addressable entity. ID_KEY is defined here (core/ids.py) and imported by the runtime so both halves agree on the key.", [["Prop", "obj['bjs_id']"], ["File", "core/ids.py"]]),
      N(2, 40, 170, "BJSComponent", "one group, many faces", "A single PropertyGroup holding fields for every component type, switched by comp_type (TAG/COLLIDER/RIGIDBODY/SCRIPT/CAMERA/AUDIO/CONSTRAINT/GUI/PARTICLE/MSDF_TEXT/GUI3D_*). One collection of these lives on every object (obj.bjs_components). Registered via core/props.py with LIBRARY_OVERRIDABLE (+ USE_INSERTION on collections) so prefab instances with library overrides can edit components. See PREFABS.html.", [["Switch", "comp_type enum"], ["File", "components/component.py"], ["Prefabs", "PREFABS.html"]]),
      N(3, 300, 60, "BJSExposedVar", "script values", "One per @exposed field on a SCRIPT component: name, type, and the value (float/bool/string/vector/color/entity/enum/list). LIST vars also own list_items, list_count (typed resize), and show_expanded (per-list collapse, independent of the component header). Object & enum changes fire update callbacks.", [["Lives in", "comp.vars"], ["File", "components/exposed_vars.py"]]),
      N(4, 300, 180, "BJSListItem", "list elements", "Elements of an exposed list field (e.g. entity lists). add_list_item seeds the right value type; the parent var's list_count get/set lets you type a length instead of clicking +, and bjs.list_add_selected drops every selected object into an entity list at once. ui/component_bodies.py draws each list in its own collapsible box.", [["Lives in", "var.list_items"], ["File", "components/exposed_vars.py"]]),
      N(5, 300, 290, "BJSEventMessage", "Event Messages / on-click rows", "Collider Event Messages (When + target + message + optional tag filter) AND 3D GUI button On Click reactions. Serialized into collider.eventMessages or gui3d events[].", [["Lives in", "comp.event_messages / gui3d_events"], ["File", "components/component.py"]]),
      N(6, 560, 110, "sync_exposed_vars", "reconcile", "Given freshly parsed @exposed fields, add new vars / drop removed ones / keep existing values. Called by the Sync operator (operators/scripts.py) and on script-path change.", [["Pairs with", "core/script_parse"], ["File", "components/exposed_vars.py"]]),
      N(7, 560, 230, "BJSLightShadow / BJSAnimationSettings", "per-object blocks", "Shadow parameters per lamp; autoplay clip/loop/speed + the NLA strip list per object. Parallel on Object (obj.bjs_shadow / obj.bjs_animation) — not fields inside BJSComponent.", [["On", "Object"], ["File", "components/object_settings.py"]]),
      N(8, 560, 350, "copy_component", "clipboard", "Deep-copies one component group to another (copy/cut/paste, duplicate). _copy_props handles the field-by-field clone.", [["Used by", "paste/duplicate ops"], ["File", "components/clipboard.py"]]),
    ],
    edges: [
      E(100, 2, 3, "vars"), E(101, 3, 4, "items"), E(102, 2, 5, "trigger + gui3d events"),
      E(103, 6, 3, "maintains"), E(107, 6, 2, "parsed fields"), E(104, 2, 7, "siblings on Object"), E(105, 8, 2, "clones"), E(106, 1, 3, "stamps bjs_id"),
    ],
  },
  "export.html": {
    title: "Export pipeline",
    nodes: [
      N(1, 40, 200, "export_level", "orchestrator", "The entry the Export operator and Live Link both call. begin_asset_export → dedupe GUIDs → ensure GUIDs → stamp glTF extras (visibility + shadow casting) → write glb → clear extras stamp → build manifest → attach debug flag → write .scene.json. Returns (glb, json, entity count).", [["File", "export/level.py"]]),
      N(2, 300, 60, "_dedupe_entity_ids", "step 1", "Copy-pasted objects share a GUID; this re-issues fresh ones so identity stays unique.", [["File", "export/level.py"]]),
      N(3, 300, 170, "_ensure_entity_ids", "step 2", "Assign GUIDs to everything addressable (components, lights, cameras) AND every referenced object, so refs always resolve. Must run before the glb so extras carry the IDs.", [["File", "export/level.py"]]),
      N(4, 300, 280, "_stamp_gltf_extras", "step 3", "Transient glTF extras before export: bjs_visible (eye icon off), bjs_cast_shadows (ray-visibility Shadow off). Cleared after the glb is written.", [["Keys", "VISIBLE_KEY · CAST_SHADOWS_KEY"], ["File", "export/level.py"]]),
      N(5, 300, 390, "_export_glb", "step 4", "Invokes Blender's glTF exporter (+Y-up, use_renderable=True, GUIDs + visibility in node extras, cameras/lights/animation included).", [["File", "export/level.py"]]),
      N(6, 300, 500, "_build_manifest", "step 5", "Per renderable object: serialize components, light, camera, animation. Plus the scene block and optional materials[] (serialize_materials for NME overrides). The schema-v4 dict that becomes .scene.json.", [["File", "export/level.py"]]),
      N(7, 560, 300, "serialize_components", "per object", "One dict per component, dispatched through the SERIALIZERS registry (export/component_serializers.py — one function per type). The serializers convert collider center/size/rotation and constraint pivot/axis to Babylon Y-up; attach trigger events; copy GUI JSON via copy_asset; particle JSON + texture overrides via export_particle_system; 3D button images via copy_asset; serialize GUI3D_* layout and click events.", [["Registry", "SERIALIZERS"], ["File", "export/component_serializers.py"]]),
      N(12, 560, 200, "serialize_materials", "materials block", "Per used Material with bjs_nme_file: export_node_material copies each distinct NME source once, patches external texture blocks + InputBlock values + GradientBlock colorSteps on the shared exported JSON (embedded-only slots unchanged), emits manifest.materials[] (name, file, textures[], inputs[], gradients[]).", [["File", "export/materials.py"], ["Key", "materials[]"]]),
      N(8, 560, 410, "_serialize_vars", "per script", "Exposed values → vars dict; entity refs become target GUIDs.", [["Refs", "GUID strings"], ["File", "export/component_serializers.py"]]),
      N(9, 800, 250, "serialize_light / serialize_camera", "auto blocks", "Derived from the lamp/camera datablock (no component needed); SUN angle, spot cone, cluster: false when Cluster When Over Budget is off (point/spot), shadow block; the active camera is flagged.", [["No component", "auto"], ["File", "export/datablocks.py"]]),
      N(10, 800, 380, "serialize_scene", "scene block", "Clear/ambient, environment (World Output chain → env/ via scene/environment.py, or useDefault when Default Environment is on with intensity/rotationY from bjs_scene; createSkybox forced off when Atmosphere on; skyboxIgnoreFog), fog, atmosphere (export/atmosphere.py), post (export/post_processing.py; LUTs → post/), inputActions + defaultInputMap, clusterPunctualLights + lightBudget.", [["File", "export/scene.py"]]),
      N(11, 800, 490, "serialize_animation", "per object", "Autoplay clip/loop/speed from Object.bjs_animation; NLA strip names from export/animation.py.", [["File", "export/animation.py"], ["Key", "entities[].animation"]]),
    ],
    edges: [
      E(100, 1, 2), E(120, 2, 3), E(121, 3, 4), E(122, 4, 5), E(123, 5, 6),
      E(105, 6, 7, "per-object components"), E(125, 6, 12, "materials"), E(106, 7, 8),
      E(107, 6, 9), E(108, 6, 10), E(124, 6, 11, "animation"),
    ],
  },
  "input-actions.html": {
    title: "Input Actions",
    nodes: [
      N(1, 40, 80, "Input Actions panel", "Babylon Scene", "Scene-level editor (ui/input_panel.py): maps/actions/bindings, Scene Default, labeled gamepad pickers, Stick vs 1D/2D composites, axis-half on 1D axis parts, key/gamepad capture, .inputactions.json save/load.", [["Panel", "Babylon Scene"], ["File", "ui/input_panel.py"]]),
      N(2, 280, 40, "properties.py", "data model", "BJSInputBinding: gp_button/gp_axis/gp_stick pickers, axis_half on composite parts, index + gp_control for manifest export.", [["Package", "input_actions/"]]),
      N(3, 280, 150, "defaults.py", "built-in Player", "Seeded on first export when the panel is empty — must stay in sync with engine DefaultAsset.ts.", [["Map", "Move Look Jump …"]]),
      N(4, 280, 270, "serialize.py", "→ manifest", "serialize_input_asset: axisHalf POSITIVE/NEGATIVE, gamepad axis 4/5 for LT/RT, stick binding for 2D → scene.inputActions + defaultInputMap.", [["Keys", "inputActions · defaultInputMap"]]),
      N(5, 520, 80, "operators.py", "seed / sync / capture", "Default asset, sync @inputMap maps, input_capture_key + input_capture_gamepad (Linux js).", [["Triggers", "panel buttons"]]),
      N(6, 520, 220, "script_parse.py", "@inputMap scan", "Regex-reads @inputMap(\"Name\") from behavior .ts — lowercase literal like @exposed. Used to validate refs and seed maps.", [["File", "core/script_parse.py"]]),
      N(7, 760, 150, "InputManager.LoadAsset", "runtime", "Engine loads the asset before behaviors; @inputMap fields and behavior.input injected during ApplyComponents.", [["Diagram", "../engine/input.html"], ["Trace", "trace-input.html"]]),
    ],
    edges: [
      E(100, 1, 2, "edits"), E(101, 1, 5, "buttons"), E(102, 5, 3, "seed"),
      E(103, 5, 6, "scan scripts"), E(104, 2, 4, "serialize"), E(105, 3, 4, "when empty"),
      E(106, 4, 7, "manifest"),
    ],
  },
  "scene-settings.html": {
    title: "Scene settings",
    nodes: [
      N(1, 40, 100, "Babylon Scene panel", "scene-wide UI", "ui/scene_panels.py + draw_export_controls: Rendering, Environment, Fog, Atmosphere, Post-Processing, Input Actions, Export (Light Budget, Cluster Punctual Lights, Live Link/Debug Build).", [["Panel", "Babylon Scene"]]),
      N(2, 280, 40, "scene/settings.py", "clear · env · fog · lights", "BJSSceneSettings on Scene.bjs_scene: clear/ambient, Default Environment, environment_intensity / environment_rotation_y, Show Skybox, Skybox Ignores Fog, fog mode/color, cluster_punctual_lights, light_budget.", [["Block", "scene clear/ambient/env/fog/lights"]]),
      N(3, 280, 160, "scene/environment.py", "World HDR", "find_world_env_node traces World Output → Surface → Background → env/image only. Shared by UI and export.", [["Copy", "export/assets.py → env/"]]),
      N(4, 280, 280, "scene/atmosphere.py", "physical sky", "BJSAtmosphereSettings: enable, Sun Light picker, scattering tuning, LUTs vs ray marching.", [["Export", "export/atmosphere.py"]]),
      N(5, 280, 400, "scene/post_processing.py", "post stack", "Nested bjs_scene.post: MSAA, FXAA, bloom, SSAO, tone mapping, DOF, grain, glow, LUTs.", [["Export", "export/post_processing.py → post/"]]),
      N(6, 560, 200, "serialize_scene", "manifest scene", "export/scene.py assembles the scene block: environment (createSkybox off when atmosphere on), fog, atmosphere, postProcessing, inputActions, clusterPunctualLights, lightBudget.", [["File", "export/scene.py"]]),
      N(7, 800, 200, "ApplySceneSettings", "runtime", "FinalizeLevel: clear/ambient, async env/skybox (ComputeSkyboxSize from level bounds; infiniteDistance), fog — then ApplyAtmosphere and ApplyPostProcessing (after Begin for active camera).", [["Diagram", "../engine/rendering.html"], ["Trace", "../engine/trace-post.html"]]),
    ],
    edges: [
      E(100, 1, 2, "draws"), E(101, 1, 4, "draws"), E(102, 1, 5, "draws"),
      E(103, 2, 3, "World texture"), E(104, 2, 6), E(105, 4, 6), E(106, 5, 6),
      E(107, 6, 7, "manifest"),
    ],
  },
  "validation.html": {
    title: "Validation",
    nodes: [
      N(1, 40, 200, "Validate operator", "BJS_OT_validate", "operators/export_ops.py — runs validate_scene and reports warnings in a popup. Same checks run before Export and Live Link.", [["Runs", "Validate · Export · Live Link"]]),
      N(2, 280, 60, "validate_scene", "entry", "export/validate.py — iterate renderable objects, run per-object checks, then scene-wide checks; returns warning strings (never blocks save).", [["File", "export/validate.py"]]),
      N(3, 280, 180, "Per-object checks", "components · physics", "_check_scripts, _check_entity_refs (render-disabled + stale prefab pointers), _check_physics (MESH+DYNAMIC), _check_triggers (mesh triggers), _check_constraints, _check_skinned_meshes, _check_media, _check_gui3d, _check_lights.", [["Trap", "skinned mesh on mesh object"]]),
      N(4, 280, 320, "Scene-wide checks", "identity · input · materials", "_check_duplicate_guids, _check_active_camera, _check_input_map (@inputMap refs, empty bindings, Scene Default), _check_atmosphere (SUN lamp), _check_materials (NME JSON + texture rows).", [["Input", "input_actions/"]]),
      N(5, 560, 200, "export_level", "still runs", "Warnings do not block export or Live Link — they surface silent failures before you iterate in the browser.", [["Trace", "trace-validate.html"]]),
      N(6, 560, 340, "Runtime load", "fewer surprises", "Catches issues the loader cannot fix: missing scripts, dangling GUID refs, invalid physics combos, AREA lights (glTF unsupported).", [["Diagram", "../engine/workflow.html"]]),
    ],
    edges: [
      E(100, 1, 2), E(101, 2, 3), E(102, 2, 4), E(103, 1, 5, "before export"),
      E(104, 3, 6, "prevents"), E(105, 4, 6, "prevents"),
    ],
  },
  "livelink.html": {
    title: "Live Link",
    nodes: [
      N(1, 40, 120, "Scene checkbox", "bjs_live_link", "Scene property enables save_post re-export. export_level path remembered per scene (bjs_live_link_path).", [["Panel", "Babylon Scene › Export"]]),
      N(2, 280, 60, "_on_save_post", "Ctrl+S hook", "export/live_link.py — if enabled + path set: validate_scene then export_level. Failures log; Blender save never breaks.", [["File", "export/live_link.py"]]),
      N(3, 280, 180, "export_level", "same as Export", "begin_asset_export overwrites stable sidecar paths (env/, audio/, gui/). Manifest written after glb so both artifacts are ready together.", [["Diagram", "export.html"]]),
      N(4, 280, 300, "Debug Build flag", "manifest debug", "scene.bjs_debug_build → top-level manifest \"debug\" → level.debugEnabled gates C/I keys and debugColliders.", [["Default", "missing = true"]]),
      N(5, 560, 120, "ReloadOnLevelExport", "Vite plugin", "apps/*/vite.config.ts watches all files under public/levels/ (path.resolve; 50ms debounce) → full page reload.", [["Not just", ".scene.json"]]),
      N(6, 560, 260, "LevelLoader.Load", "browser", "Full reload re-runs Load after Havok init — sees updated glb, manifest, and replaced HDRs.", [["Diagram", "../engine/workflow.html"], ["Trace", "../engine/trace-livelink.html"]]),
    ],
    edges: [
      E(100, 1, 2, "Ctrl+S"), E(101, 2, 3), E(102, 3, 4, "manifest"),
      E(103, 3, 5, "writes files"), E(104, 5, 6, "reload"),
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
      { file: "blender_addon/export/level.py", symbol: "export_level", note: "The orchestrator. begin_asset_export (stable side-file paths) → dedupe + ensure GUIDs (before the glb so extras carry them) → stamp glTF extras (bjs_visible, bjs_cast_shadows) → write the glb → clear extras stamp → build the manifest → attach the Debug Build flag → write .scene.json. Returns (glb, json, count)." },
      { file: "blender_addon/export/level.py", symbol: "_stamp_gltf_extras", note: "Transient obj['bjs_visible'] / obj['bjs_cast_shadows'] for viewport-hidden and ray-visibility Shadow-off objects. Cleared after the glb is written. Render-disabled objects are omitted entirely (_is_renderable / use_renderable=True)." },
      { file: "blender_addon/export/level.py", symbol: "_ensure_entity_ids", note: "GUIDs for everything addressable AND everything referenced (so an entity/constraint/trigger target always exists in the glb to point at)." },
      { file: "blender_addon/export/level.py", symbol: "_build_manifest", note: "Walks renderable objects; per object emits components + light + camera + animation blocks, plus the scene block. The schema-v4 dict." },
      { file: "blender_addon/export/components.py", symbol: "serialize_components", note: "The dispatcher: one dict per component via the SERIALIZERS registry (export/component_serializers.py — one function per type). All Blender→Babylon axis conversion (collider center/size/rotation, constraint pivot/axis) happens in the serializers, once." },
    ],
  },
  {
    id: "guid",
    title: "GUID identity: object → entity",
    intro: "How a Blender object becomes an addressable runtime entity.",
    steps: [
      { file: "blender_addon/core/ids.py", symbol: "ensure_object_id", note: "Stamps obj['bjs_id'] (ID_KEY). Having a GUID is what makes an object an entity; pure geometry without one just rides in the glb." },
      { file: "blender_addon/export/level.py", symbol: "_referenced_ids", note: "Collects GUIDs that MUST exist because something points at them: entity fields, camera/constraint/trigger targets — so references never dangle." },
      { file: "blender_addon/export/level.py", symbol: "_dedupe_entity_ids", note: "Duplicated objects (Shift+D) inherit the same custom prop; this detects collisions and re-issues fresh GUIDs before export." },
    ],
  },
  {
    id: "components",
    title: "Components: N-panel stack → manifest",
    intro: "How the Babylon Object component list authors entities[].components[] — one PropertyGroup row per component, serialized by type.",
    steps: [
      { file: "blender_addon/ui/view3d_panels.py", symbol: "BJS_PT_components",
        note: "The Babylon Object N-panel — lists obj.bjs_components, add/remove/toggle operators, per-type sub-panels (collider, script, light, camera, animation). Scene-wide settings live in Babylon Scene, not here." },
      { file: "blender_addon/components/component.py", symbol: "BJSComponent",
        note: "One PropertyGroup row: comp_type enum + enabled flag + type-specific fields (collider shape, script_name, audio_file, gui3d layout, event_messages on colliders, …)." },
      { file: "blender_addon/export/components.py", symbol: "serialize_components",
        note: "Called per object from _build_manifest: skip disabled rows; dispatch each row through the SERIALIZERS registry (export/component_serializers.py — one function per type, Blender→Babylon axis conversion for colliders/constraints, SCRIPT vars from _serialize_vars)." },
      { file: "blender_addon/export/components.py", symbol: "iter_referenced_objects",
        note: "Yields every object a component points at (entity @exposed targets, trigger/GUI3D click targets, constraint ends) so export assigns GUIDs and force-includes them in the glb." },
      { file: "blender_addon/export/level.py", symbol: "_build_manifest",
        note: "Per renderable object: serialize_components(obj) → entities[].components[], plus light/camera/animation blocks when present. Runtime side: trace-components.html." },
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
      { file: "blender_addon/components/exposed_vars.py", symbol: "sync_exposed_vars", note: "The reconcile itself — the function Sync and the script-path callback share. vtype FILE uses file_val (FILE_PATH picker)." },
      { file: "blender_addon/export/component_serializers.py", symbol: "_serialize_vars", note: "FILE vars: copy_asset → post/; manifest stores manifest-relative path (same pattern as scene color-grading LUT export)." },
    ],
  },
  {
    id: "validate",
    title: "Validation: catching silent failures",
    intro: "The checks that run on Validate, Export, and every Live Link save.",
    steps: [
      { file: "blender_addon/export/validate.py", symbol: "validate_scene", note: "The entry: iterate objects, run every per-object check, collect warnings, plus scene-wide checks (duplicate GUIDs, active camera)." },
      { file: "blender_addon/export/validate.py", symbol: "_check_physics", note: "Checks every enabled COLLIDER: MESH + DYNAMIC is invalid in Havok; warns when mixed trigger/non-trigger colliders share one entity (compound body)." },
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
      { file: "blender_addon/ui/input_panel.py", symbol: "BJS_PT_input_map", note: "Input Actions in **Babylon Scene**: Scene Default, maps/actions/bindings, labeled gamepad pickers (W3C mapping), Stick vs 1D/2D composites, Axis Half on 1D axis composite parts, key/gamepad capture, load/save .inputactions.json." },
      { file: "blender_addon/input_actions/gamepad_mapping.py", symbol: "GamepadAxisLabel", note: "W3C labels for gamepad pickers — stick axes 0–3, LT/RT as axis indices 4/5 (runtime maps those to analog triggers)." },
      { file: "blender_addon/input_actions/serialize.py", symbol: "serialize_input_asset", note: "Maps/actions/bindings → scene.inputActions, including axisHalf on composite axis parts, stick bindings for 2D, gamepad axis 4/5 for triggers. Built-in Player when panel empty." },
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
    id: "cog-preview",
    title: "CoM preview: the viewport gizmo",
    intro: "How rigid-body center of mass is drawn in the 3D view so the preview matches the exported body (export CoM fields apply to Dynamic bodies only).",
    steps: [
      { file: "blender_addon/viewport/cog_preview.py", symbol: "_draw", note: "POST_VIEW draw handler: for each selected object with an enabled RigidBody and Show Preview on, build an amber cross + rings at the CoM. Depth test is off so the marker stays visible inside solid meshes." },
      { file: "blender_addon/viewport/cog_preview.py", symbol: "_local_geometry", note: "Resolves the CoM in object local space — auto-fit uses compute_local_bounds (same owned-mesh rule as collider auto-fit); manual uses cog_center. Gizmo size scales with bounds (~10% of the longest axis). Export converts manual offsets to Babylon Y-up." },
    ],
  },
  {
    id: "gui3d",
    title: "3D GUI: authoring → manifest",
    intro: "How nine GUI3D_* component types serialize and validate before export.",
    steps: [
      { file: "blender_addon/components/component.py", symbol: "BJSComponent", note: "AUTHORING — one PropertyGroup, many faces. GUI3D_* types share gui3d_text/image/tooltip/events and panel layout fields. Membership sets GUI3D_CONTROLS / GUI3D_PANELS / GUI3D_TEXTURED (in components/constants.py) classify draw + export branches." },
      { file: "blender_addon/ui/component_bodies.py", symbol: "_draw_click_events", note: "The On Click Events box for 3D controls — same target+message UI as trigger colliders, wired to bjs.gui3d_event_add/remove operators." },
      { file: "blender_addon/export/component_serializers.py", symbol: "_serialize_gui3d_control", note: "GUI3D_* serializers emit type-specific fields; button images copied via copy_asset to gui/; click-event targets yielded by iter_referenced_objects for GUID assignment." },
      { file: "blender_addon/export/validate.py", symbol: "_check_gui3d", note: "Mesh button on non-mesh, panel without button children, click events without targets, missing button image files." },
      { file: "blender_addon/export/validate.py", symbol: "_check_media", note: "GUI (missing JSON, MESH mode on non-mesh), PARTICLE (missing JSON, scanned slots missing required images), alongside 3D GUI validation." },
    ],
  },
  {
    id: "particles",
    title: "Particles: authoring → patched JSON",
    intro: "Particle JSON plus optional Particle Textures copied and patched on export.",
    steps: [
      { file: "blender_addon/components/component.py", symbol: "BJSParticleTexture", note: "AUTHORING — particle_textures rows: block_id, block_name, block_type (from scan), image_file, json_url, match_url." },
      { file: "blender_addon/components/particle_scan.py", symbol: "sync_component_particle_textures", note: "Scan Textures reads ParticleTextureSourceBlock slots from the particle JSON; preserves existing image picks by block_id." },
      { file: "blender_addon/ui/component_bodies.py", symbol: "_draw_particle_textures", note: "Textures box on the PARTICLE component; Scan Textures, per-slot image pickers; bjs.particle_texture_add/remove operators." },
      { file: "blender_addon/export/particles.py", symbol: "export_particle_system", note: "EXPORT — copy JSON; copy_particle_texture per row; patch_particle_json_textures (matches by block_id) on the exported file under particles/." },
      { file: "blender_addon/export/validate.py", symbol: "_check_media", note: "Warns when particle JSON is missing, or a scanned slot needs an image file that was not picked." },
    ],
  },
  {
    id: "materials",
    title: "Node materials: authoring → patched JSON",
    intro: "Properties › Material › Babylon: NME JSON plus optional texture rows and inspector-visible InputBlock parameters copied and patched on export.",
    steps: [
      { file: "blender_addon/materials/properties.py", symbol: "BJSNmeTexture", note: "AUTHORING — Material.bjs_nme_textures rows: block_id, block_name, block_type (from scan), image_file, json_url, match_url." },
      { file: "blender_addon/materials/properties.py", symbol: "BJSNmeInput", note: "AUTHORING — Material.bjs_nme_inputs rows: block_id, block_name, value_type, typed value fields (float/int/bool/vector/color)." },
      { file: "blender_addon/materials/properties.py", symbol: "BJSNmeGradient", note: "AUTHORING — Material.bjs_nme_gradients rows: block_id, block_name, steps collection (step 0–1 + RGB per color stop)." },
      { file: "blender_addon/materials/nme_scan.py", symbol: "sync_material_nme", note: "Scan NME reads ImageSourceBlock + TextureBlock slots, inspector-visible InputBlocks (visibleInInspector, not systemValue), and inspector-visible GradientBlocks; preserves existing texture picks by block_id. Skips embedded-only slots (texture_is_embedded from nme_textures.py)." },
      { file: "blender_addon/materials/nme_textures.py", symbol: "extract_nme_textures", note: "AUTHORING — Extract Textures… decodes data: / base64String payloads to {BlockName}_{id}.png|jpg beside the JSON, rewrites block url, then Scan NME fills image_file rows." },
      { file: "blender_addon/materials/properties.py", symbol: "BJSDetailMapSettings", note: "AUTHORING — Material.bjs_detail_map: enable, packed texture (optional) or separate albedo/normal/roughness, uv_set (→ coordinatesIndex), uv_scale, blend levels, normal blend method." },
      { file: "blender_addon/materials/detail_pack.py", symbol: "pack_detail_map", note: "EXPORT — pack separate PNG/JPG/WEBP channels into Babylon Unity-layout PNG via bpy.data.images (R=albedo, G=normal G, B=roughness, A=normal R; missing → 0.5)." },
      { file: "blender_addon/ui/material_panels.py", symbol: "BJS_PT_material", note: "Properties › Material › Babylon panel (context.material); NME section + Detail Map box (packed optional, separate channels, UV set + scale, blend sliders)." },
      { file: "blender_addon/export/nme_materials.py", symbol: "export_node_material", note: "EXPORT — copy each NME source JSON once per export (shared source → patch same exported file); copy_nme_texture per row with image_file; patch_nme_json_textures (strips base64String/internalTextureLabel on override; embedded slots left intact) + patch_nme_json_inputs + patch_nme_json_gradients." },
      { file: "blender_addon/export/detail_maps.py", symbol: "serialize_detail_maps", note: "EXPORT — copy packed detail map or pack separate channels to materials/; write manifest detailMaps[] (coordinatesIndex, uvScale, blend levels); export warnings on failure." },
      { file: "blender_addon/export/validate.py", symbol: "_check_materials", note: "Warns on missing NME file, unused override, or missing images for non-embedded slots." },
      { file: "blender_addon/export/validate.py", symbol: "_check_detail_maps", note: "Warns on enabled detail map without sources, missing/unsupported channel files (PNG/JPG/WEBP only), UV set beyond mesh UV layer count, or unused override." },
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
    const navLabel = page.title.split(" ")[0] === "Add-on" ? "Overview" : page.title;
    EmitDiagramPage({
      shell,
      outPath: path.join(OUT_DIR, file),
      pageTitle: `Blender — ${page.title}`,
      diagramData: EnrichBlenderAreaDiagram(page, file, TRACES),
      navHtml: BuildBlenderNav(file, areaNav, traceNav, { currentTitle: navLabel }),
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
    const traceTitle = trace.title.split(":")[0];
    const traceDiagram = EnrichTraceDiagram(
      { title: "Trace — " + trace.title, nodes, edges },
      outFile,
      "blender",
    );
    EmitDiagramPage({
      shell,
      outPath: path.join(OUT_DIR, outFile),
      pageTitle: `Blender — ${trace.title}`,
      diagramData: traceDiagram,
      navHtml: BuildBlenderNav(outFile, areaNav, traceNav, { currentTitle: traceTitle }),
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
