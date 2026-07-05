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
import { EnrichEngineAreaDiagram, EnrichTraceDiagram } from "./docs/diagram-links.mjs";
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

export const TRACES = [
  {
    id: "physics",
    title: "Physics: collider → Havok body",
    intro: "From the N-panel checkbox to a body on the node. Authored in Blender space, converted once at export, built at load. Multiple colliders on one entity become a PhysicsShapeContainer compound body.",
    steps: [
      { file: "blender_addon/export/component_serializers.py", symbol: "_serialize_collider",
        note: "EXPORT — the COLLIDER entry in the SERIALIZERS registry. Converts center (x,y,z)→(x,z,−y), swaps size axes, converts the rotation quaternion, exports makeInvisible, and attaches trigger events. Output: one dict in the manifest's components array (multiple COLLIDER rows allowed)." },
      { title: "The manifest (data between the two halves)",
        code: `{ "type": "COLLIDER", "shape": "BOX", "isTrigger": false, "makeInvisible": true, "autoFit": true,\n  "size": [1,1,1], "radius": 0.5, "height": 2, "center": [0,0,0],\n  "rotation": [0,0,0,1] },\n{ "type": "COLLIDER", "shape": "SPHERE", "isTrigger": true, "autoFit": false,\n  "radius": 0.5, "center": [0, 1.5, 0] },\n{ "type": "RIGIDBODY", "bodyType": "DYNAMIC", "mass": 1,\n  "friction": 0.5, "restitution": 0.2,\n  "linearDamping": 0, "angularDamping": 0, "startAsleep": false }`,
        note: "Already Babylon-space (Y-up). Two COLLIDER rows on one entity are intentional — the runtime combines them. makeInvisible hides the mesh at load; physics is unchanged." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "PhysicsHandler",
        note: "LOAD, per entity — the registry's physics handler owns COLLIDER + RIGIDBODY together: HideEntityNode when any collider has makeInvisible; BuildPhysics builds one body (compound when length > 1); RegisterAttachment per COLLIDER/RIGIDBODY row; trigger events from all trigger colliders are merged." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "BuildPhysics",
        note: "The dispatcher. In: node + ColliderComponent[] + RigidBodyComponent? + scene. Single collider → one of three shape paths; multiple → BuildCompoundBody (PhysicsShapeContainer). Out: PhysicsBody | undefined." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "BuildCompoundBody",
        note: "Two or more colliders: each BuildColliderShape → ConfigureColliderShape (material + trigger per child) → container.addChild → one PhysicsBody on the node." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "BuildBodyInput",
        note: "The data every path shares: motion type (STATIC/DYNAMIC/ANIMATED), mass (DYNAMIC only), startAsleep (DYNAMIC only), material, colliders[], and the geometry facts (isMesh / hasGeometry via the ownership rule below)." },
      { file: "packages/engine/src/core/meshOwnership.ts", symbol: "CollectOwnedChildMeshes",
        note: "THE ownership rule (v0.29.1), shared with reflection probes: include a descendant mesh only if no node on its path up carries bjs_id — multi-material submeshes yes, parented child entities no. physics.ts routes through it via OwnedColliderMeshes." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "BuildAutoFitBody",
        note: "Default path. Real mesh → PhysicsAggregate sizes the primitive. Multi-material wrapper → FitColliderShape over ComputeLocalBounds (an aggregate would crash on the non-mesh node)." },
      { file: "packages/engine/src/subsystems/physics.ts", symbol: "AttachShape",
        note: "Shared tail: material + trigger flag onto the shape, then a PhysicsBody on the node (startsAsleep from startAsleep). ApplyBodyDynamics adds motion type + damping." },
    ],
  },
  {
    id: "exposed",
    title: "Scripting: @exposed field → Blender → behavior instance",
    intro: "The cross-language round trip: TS source parsed by Python, values stored per-object, applied back onto the instance before OnStart.",
    steps: [
      { file: "packages/engine/src/scripting/exposed.ts", symbol: "exposed",
        note: "RUNTIME DECLARATION — records field name + UI hints in a WeakMap at class-definition time. Lowercase on purpose: the regex below matches it literally." },
      { file: "blender_addon/core/script_parse.py", symbol: "parse_exposed",
        note: "BLENDER — regex-parses the .ts source (no TS runtime in Blender). This is why defaults must be single-line literals. Output feeds the BJSExposedVar rows you edit in the panel." },
      { file: "blender_addon/export/component_serializers.py", symbol: "_serialize_vars",
        note: "EXPORT — per-object edited values → the SCRIPT component's vars dict. Entity references serialize as the target's GUID (target force-included so it exists in the glb)." },
      { file: "packages/engine/src/core/loader/scripts.ts", symbol: "InstantiateScripts",
        note: "LOAD — registry.Create(name) → inject entity/scene → ApplyExposedVars → RegisterAttachment({type:'SCRIPT', data, behavior}). Entity refs come back as PendingRefs (the target may not exist yet)." },
      { file: "packages/engine/src/scripting/exposed.ts", symbol: "ApplyExposedVars",
        note: "Writes stored values onto the instance: scalars coerced (vector3/color arrays → Babylon types), lists per element, entity fields deferred." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ResolveObjectReferences",
        note: "SECOND PASS — every entity exists now; each PendingRef's GUID resolves via level.ById and the real Entity is assigned (or placed into its list slot). Then Begin → OnStart." },
    ],
  },
  {
    id: "lifecycle",
    title: "Behavior lifecycle: hooks → Babylon render loop",
    intro: "How OnStart / OnUpdate / OnDestroy / OnMessage plug into Level.Begin, scene.onBeforeRenderObservable, and Entity.SendMessage — from class definition through teardown.",
    steps: [
      { file: "packages/engine/src/scripting/Behavior.ts", symbol: "Behavior",
        note: "THE contract — four overridable hooks (PascalCase only; lowercase names never run). Injected before OnStart: entity, scene; node getter; optional behavior.input. No Unity-style Awake/Enable — only these four." },
      { file: "packages/engine/src/core/loader/scripts.ts", symbol: "InstantiateScripts",
        note: "LOAD ENTITY PASS — registry.Create → inject entity/scene → ApplyExposedVars → InjectInputMaps → RegisterAttachment (which mirrors into entity.behaviors). Hooks are NOT called here; behaviors sit idle until Level.Begin." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ResolveObjectReferences",
        note: "SECOND PASS — @exposed entity refs resolve to real Entity instances (or list slots) while hooks are still idle. Cross-entity OnStart order is unspecified after this." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "Async tasks settle → triggers/constraints/GUI3D wire → level.Begin() → ApplyPostProcessing (after Begin so OnStart cameras get the stack). OnStart never runs before physics bodies and trigger observers exist." },
      { file: "packages/engine/src/core/Level.ts", symbol: "Begin",
        note: "InputManager.Attach (keyboard observable + enable maps) → every behavior.OnStart (error-isolated) → subscribe RunFrame on scene.onBeforeRenderObservable. This is the Babylon hook that drives the whole game loop." },
      { file: "packages/engine/src/core/Level.ts", symbol: "RunFrame",
        note: "EVERY RENDER FRAME — InputManager.Process FIRST → all OnUpdate(deltaSeconds) → registered updaters (offset cameras) → InputManager.EndFrame LAST. deltaSeconds = scene.getEngine().getDeltaTime() / 1000 (seconds, not ms)." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "SendMessage",
        note: "RUNTIME MESSAGE FAN-OUT — every behavior on this entity gets OnMessage(message, source). Used by trigger volumes, 3D GUI clicks, and gameplay SendMessage calls. Each call error-isolated." },
      { file: "packages/engine/src/ui/gui3d/events.ts", symbol: "WireClickEvents",
        note: "One OnMessage path — 3D GUI button OnPointerClick → targetEntity.SendMessage(message, buttonEntity). Same hook triggers use; see trace-trigger.html for the physics path." },
      { file: "packages/engine/src/core/Level.ts", symbol: "Dispose",
        note: "TEARDOWN — detach input, remove onBeforeRenderObservable + trigger observer, dispose constraints/sounds/GUI → every behavior.OnDestroy (errors swallowed). Unsubscribe anything you registered in OnStart." },
    ],
  },
  {
    id: "runtime-loop",
    title: "Runtime loop: main.ts → scene.render → OnUpdate",
    intro: "How the app render loop connects to Babylon observables and the kit's Level.RunFrame — including particle and MSDF hooks on the same frame.",
    steps: [
      { file: "apps/playground/src/main.ts", symbol: "Main",
        note: "APP BOOT — after Load returns, engine.runRenderLoop(() => scene.render()) starts the browser frame loop. The kit never calls runRenderLoop; without this, OnUpdate never runs." },
      { file: "packages/engine/src/core/Level.ts", symbol: "Begin",
        note: "END OF LOAD — InputManager.Attach, every OnStart once, then subscribe RunFrame on scene.onBeforeRenderObservable (registered during FinalizeLevel → level.Begin)." },
      { file: "packages/engine/src/subsystems/particles.ts", symbol: "WireParticleEmitterTracking",
        note: "BEFORE RunFrame — onBeforeRenderObservable with insertFirst=true keeps empty-node emitter positions synced each frame." },
      { file: "packages/engine/src/core/Level.ts", symbol: "RunFrame",
        note: "EVERY FRAME (onBeforeRender) — InputManager.Process → all OnUpdate(deltaSeconds) → Level.AddUpdater callbacks → InputManager.EndFrame. deltaSeconds = getDeltaTime()/1000." },
      { file: "packages/engine/src/scripting/Behavior.ts", symbol: "OnUpdate",
        note: "BEHAVIOR HOOK — override in your script; called once per scene.render(), typically before Havok's step and before the GPU draw." },
      { file: "packages/engine/src/ui/msdfText.ts", symbol: "WireMsdfTextRendering",
        note: "AFTER DRAW — onAfterRenderObservable draws MSDF text labels when any exist; runs after the main scene pass for that frame." },
    ],
  },
  {
    id: "components",
    title: "Components: Blender stack → manifest → attachments",
    intro: "Component vs behavior: authored data (TAG, COLLIDER, SCRIPT, …) serialized once, applied per entity during load, recorded on entity.attachments — only SCRIPT rows become Behavior instances.",
    steps: [
      { file: "blender_addon/components/component.py", symbol: "BJSComponent",
        note: "AUTHORING — one PropertyGroup per row in the Babylon Object stack (comp_type enum: TAG, COLLIDER, RIGIDBODY, SCRIPT, AUDIO, …). Enabled rows export; disabled rows are skipped." },
      { file: "blender_addon/export/components.py", symbol: "serialize_components",
        note: "EXPORT — one manifest dict per enabled row, dispatched through the SERIALIZERS registry (export/component_serializers.py: one function per type; axis conversion for colliders/constraints happens there). SCRIPT carries script stem + vars; force-included GUID targets via iter_referenced_objects." },
      { title: "The manifest (per entity)",
        code: `"components": [\n  { "type": "TAG", "tag": "Player" },\n  { "type": "COLLIDER", "shape": "BOX", "autoFit": true, … },\n  { "type": "RIGIDBODY", "bodyType": "DYNAMIC", "mass": 1, … },\n  { "type": "SCRIPT", "script": "Patrol", "path": "behaviors/Patrol.ts", "vars": { … } }\n]`,
        note: "Pure data — no code runs until load. Multiple rows of the same type are allowed (e.g. two COLLIDERs compound into one body). Lights/cameras/animation live outside components[] on the entity block." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ProcessEntity",
        note: "LOAD — resolve glTF node by GUID → new Entity + metadata.bjsEntity back-ref → ApplyEntityComponents(entityData.components) → auto-derived light/camera blocks." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "COMPONENT_HANDLERS",
        note: "THE registry — one ComponentHandler per component type, in apply order (physics owns COLLIDER + RIGIDBODY together; scripts run last). Adding a component type = adding one entry here; scripts/check-component-types.mjs verifies it against the Blender registries." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "ApplyEntityComponents",
        note: "Groups the entity's components by handler, then runs each claimed handler once in table order: BuildPhysics + RegisterAttachment for COLLIDER/RIGIDBODY; queue triggers/audio/constraints/GUI/particles/GUI3D; InstantiateScripts last. Unknown types warn. Non-SCRIPT types never touch BehaviorRegistry." },
      { file: "packages/engine/src/core/attachments.ts", symbol: "RegisterAttachment",
        note: "The single write path — one EntityAttachment row per successfully applied component: { type, data } plus runtime handle when one exists (behavior, body, sound, texture, system, constraint, control). Also mirrors the matching convenience field (entity.tag, entity.body, entity.behaviors, …)." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetAttachment",
        note: "QUERY — GetAttachment(type) (first row), GetAttachmentsOfType (all rows), HasAttachment. SCRIPT → ?.behavior; COLLIDER/RIGIDBODY → ?.body (same PhysicsBody ref when both). Convenience: entity.behaviors, entity.body, entity.sounds." },
    ],
  },
  {
    id: "trigger",
    title: "Event Messages & collision hooks",
    intro: "Authored Event Messages and Unity-style OnCollision/OnTrigger lifecycle hooks.",
    steps: [
      { file: "blender_addon/components/component.py", symbol: "BJSEventMessage",
        note: "AUTHORING — one row: When phase + target + message + optional tag filter, on any collider." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "PhysicsHandler",
        note: "LOAD — colliders with eventMessages queue EventMessageRegistration {sourceEntity, messagesByPhase}; wiring waits for FinalizeLevel." },
      { file: "packages/engine/src/subsystems/collisions.ts", symbol: "WireCollisionEvents",
        note: "Plugin observers on collision + trigger observables. Relays hooks to both bodies; dispatches Event Messages by phase." },
      { file: "packages/engine/src/subsystems/collisions.ts", symbol: "DeliverEventMessages",
        note: "Per matching phase: other entity, tag gate, target GUID lookup, SendMessage(message, otherEntity)." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "SendMessage",
        note: "Fan-out to every behavior on the target, each call error-isolated." },
      { file: "packages/engine/src/scripting/Behavior.ts", symbol: "OnMessage",
        note: "RECEIVE Event Messages. Also OnCollisionEnter/Stay/Exit and OnTriggerEnter/Exit for programmatic hooks." },
    ],
  },
  {
    id: "constraint",
    title: "Constraints: component → Havok joint",
    intro: "Joints pin the as-placed pose — position things in Blender how they should rest.",
    steps: [
      { file: "blender_addon/export/component_serializers.py", symbol: "_serialize_constraint",
        note: "EXPORT — the CONSTRAINT entry in the SERIALIZERS registry: pivot/axis → Y-up, target GUID, collision (Bodies Collide), preset limits/motor/spring. CUSTOM also exports axes[] (six rows: axis id, mode, min/max, stiffness/damping)." },
      { file: "packages/engine/src/subsystems/constraints.ts", symbol: "BuildConstraints",
        note: "FINALIZE — both bodies exist now. Per registration: resolve target, require body on both ends, compute the frame, create, addConstraint, RegisterAttachment on owner, set isCollisionsEnabled from manifest collision (all types), optional motor. Out: level.constraints." },
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
      { file: "blender_addon/export/assets.py", symbol: "copy_asset",
        note: "EXPORT — copies the sound file to audio/ with a URL-safe name via unique_asset_path; re-exports overwrite the same path (begin_asset_export resets reservations each export_level pass)." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "AudioHandler",
        note: "LOAD — each AUDIO component queues an ApplyAudio promise (fetch+decode is async); the entity loop never blocks on sound I/O." },
      { file: "packages/engine/src/subsystems/audio.ts", symbol: "ApplyAudio",
        note: "CreateSoundAsync with spatialEnabled at creation; spatial.attach(entity.node) so 3D sounds follow. Name = file stem. entity.sounds.push + RegisterAttachment. Autoplay: void unlockAsync().then(play) — fire-and-forget." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "Promise.allSettled over the audio tasks: a bad file logs a warning; the level still loads. Then triggers, constraints, Begin." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetAttachment",
        note: "RUNTIME — entity.GetAttachment(\"AUDIO\")?.sound or GetAttachmentsOfType(\"AUDIO\") for every row. GetSound(\"door\") still works by file stem." },
    ],
  },
  {
    id: "load",
    title: "Level load, end to end",
    intro: "The spine everything above hangs off.",
    steps: [
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "Load",
        note: "The orchestrator: fetch/validate → InputManager.LoadAsset (inputActions + defaultInputMap) → right-handed glb append → ApplyNodeVisibility → entity loop → second pass → FinalizeLevel. Returns the Level." },
      { file: "packages/engine/src/core/loader/nodeResolution.ts", symbol: "ApplyNodeVisibility",
        note: "For each glTF node with extras.bjs_visible === false (Blender viewport-hidden): node.isVisible = false; descendant lights setEnabled(false) and cameras hidden. Render-disabled objects never reach this step." },
      { file: "packages/engine/src/core/loader/nodeResolution.ts", symbol: "BuildIdIndex",
        note: "GUID → node map from metadata.gltf.extras.bjs_id (needs the ExtrasAsMetadata import or this is empty and matching silently falls back to names)." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ProcessEntity",
        note: "Per manifest entity: node match (GUID first), Entity created + registered + back-referenced, components applied, light/camera processed." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "Shadows → scene look (env, fog, atmosphere when enabled) → animations → settle audio/GUI/particle/MSDF tasks → WireParticleEmitterTracking + WireMsdfTextRendering → trigger wiring → constraints → BuildGui3DControls → Begin → ApplyPostProcessing → (debug colliders if the export allows)." },
      { file: "packages/engine/src/core/Level.ts", symbol: "Begin",
        note: "Attach InputManager (enables every action map), run every OnStart (error-isolated), subscribe RunFrame." },
      { file: "packages/engine/src/core/Level.ts", symbol: "RunFrame",
        note: "Every frame: InputManager.Process FIRST (actions evaluate, callbacks fire) → all OnUpdate(deltaSeconds) → updaters (offset cams) → InputManager.EndFrame LAST so device edges last exactly one frame." },
    ],
  },
  {
    id: "atmosphere",
    title: "Atmosphere: SUN lamp → physical sky",
    intro: "Babylon @babylonjs/addons/atmosphere for sky and aerial perspective; integrates with PBRMaterial.",
    steps: [
      { file: "blender_addon/scene/atmosphere.py", symbol: "BJSAtmosphereSettings",
        note: "BLENDER — scene.bjs_scene.atmosphere: enable toggle, Sun Light picker (SUN lamp GUID), PBR sun intensity, LUTs vs ray marching, scattering tuning." },
      { file: "blender_addon/export/atmosphere.py", symbol: "serialize_atmosphere",
        note: "EXPORT — scene.atmosphere block (sunLightId, pbrSunIntensity, useLuts, multiScattering, groundAlbedo, physical.*). Null when disabled." },
      { file: "blender_addon/export/validate.py", symbol: "_check_atmosphere",
        note: "Warns when Atmosphere is on but no renderable SUN lamp is available (picked Sun Light or any exported sun)." },
      { file: "blender_addon/export/scene.py", symbol: "_serialize_environment",
        note: "When atmosphere is enabled, export forces createSkybox: false — the addon renders the sky; IBL from World/useDefault still loads. useDefault writes intensity/rotationY from bjs_scene.environment_intensity / environment_rotation_y." },
      { file: "packages/engine/src/subsystems/atmosphere.ts", symbol: "ApplyAtmosphere",
        note: "LOAD — Atmosphere.IsSupported check; resolve SUN → DirectionalLight (GUID or first sun); optional π intensity; new Atmosphere(scene, [sunLight], options); physical property tuning." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "After ApplySceneSettings: ApplyAtmosphere when manifest.scene.atmosphere is set → level.atmosphere (disposed in Level.Dispose). isLinearSpaceComposition follows postProcessing.defaultPipeline." },
    ],
  },
  {
    id: "input",
    title: "Input: key press → action → behavior",
    intro: "Unity Input System style: the Blender Input Actions panel authors the scene asset (maps > actions > bindings) plus a Scene Default map; the manifest carries inputActions + defaultInputMap; InputManager evaluates every frame.",
    steps: [
      { file: "blender_addon/input_actions/serialize.py", symbol: "serialize_input_asset",
        note: "BLENDER — maps/actions/bindings → scene.inputActions (built-in Player asset when the panel is empty). Called from export/scene.py alongside defaultInputMap from the Scene Default picker." },
      { file: "blender_addon/export/scene.py", symbol: "serialize_scene",
        note: "BLENDER — assembles the manifest scene block: clear/ambient, environment (World Output chain via scene/environment.py → env/, or useDefault with intensity/rotationY from bjs_scene; createSkybox forced off when Atmosphere on; skyboxIgnoreFog), fog, atmosphere (export/atmosphere.py), post (via export/post_processing.py — default pipeline, SSAO), inputActions, and defaultInputMap." },
      { file: "packages/engine/src/input/DefaultAsset.ts", symbol: "DEFAULT_INPUT_ASSET",
        note: "Runtime fallback when a manifest omits inputActions — keep in sync with blender_addon/input_actions/defaults.py." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "Load",
        note: "LOAD — InputManager.LoadAsset(manifest.scene.inputActions ?? DEFAULT, defaultInputMap) runs before the glb append so maps exist when behaviors are built." },
      { file: "packages/engine/src/core/loader/scripts.ts", symbol: "InjectInputMaps",
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
      { file: "blender_addon/export/live_link.py", symbol: "_on_save_post",
        note: "BLENDER — save_post handler: checkbox on + path remembered → validate + export. Failures log; the save never breaks." },
      { file: "apps/playground/vite.config.ts", symbol: "ReloadOnLevelExport",
        note: "APP — Vite plugin watches all files under public/levels/ (glb, env/, manifest, …); IsLevelAsset uses path.resolve for chokidar paths; 50ms debounced full reload so replaced HDRs refresh even when .scene.json bytes are unchanged." },
    ],
  },
  {
    id: "gui",
    title: "2D GUI: JSON layout → AdvancedDynamicTexture",
    intro: "File-backed HUDs and in-world mesh UI from Babylon's GUI Editor.",
    steps: [
      { file: "blender_addon/export/assets.py", symbol: "copy_asset",
        note: "EXPORT — the GUI .json is copied to gui/ with a sanitized stable name; re-exports overwrite the same file." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "GuiHandler",
        note: "LOAD — each GUI component queues an ApplyGui promise (fetch+parse is async); the entity loop never blocks on UI I/O." },
      { file: "packages/engine/src/ui/gui2d.ts", symbol: "ApplyGui",
        note: "FULLSCREEN → CreateFullscreenUI; MESH → CreateForMesh on the entity node. parseFromURLAsync loads the layout. Name = file stem. RegisterAttachment after guiTextures.push." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "SettleTasks over guiTasks (allSettled): a bad JSON logs a warning; the level still loads. Runs alongside audio and particle settlement." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetAttachment",
        note: "RUNTIME — entity.GetAttachment(\"GUI\")?.texture or GetGui(\"hud\")?.getControlByName(\"Score\") (exact name, then contains)." },
    ],
  },
  {
    id: "particles",
    title: "Particles: JSON system → emitter",
    intro: "File-backed particle systems from Babylon's Particle Editor or Node Particle Editor.",
    steps: [
      { file: "blender_addon/components/particle_scan.py", symbol: "sync_component_particle_textures",
        note: "AUTHORING — Scan Textures reads ParticleTextureSourceBlock slots from the particle JSON; per-slot image pickers preserved by block_id." },
      { file: "blender_addon/export/particles.py", symbol: "export_particle_system",
        note: "EXPORT — copy particle JSON to particles/; copy each texture image; patch_particle_json_textures (match by block_id) on the exported file." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "ParticleHandler",
        note: "LOAD — each PARTICLE component queues an ApplyParticles promise; GPU mode is requested when supported." },
      { file: "packages/engine/src/subsystems/particles.ts", symbol: "ApplyParticles",
        note: "LoadParticleSystems: ResolveNodeParticleSetTextureUrls (rootUrl beside JSON) then legacy/GPU or NodeParticleSystemSet.buildAsync. attachToEntity: mesh or owned Vector3 + emptyEmitter. autoStart calls system.start()." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "SettleTasks over particleTasks (bad file → warn, level continues)." },
      { file: "packages/engine/src/subsystems/particles.ts", symbol: "WireParticleEmitterTracking",
        note: "After settlement: CollectEmptyParticleEmitters → level.particleEmitterManager. Each frame (insertFirst onBeforeRender) copies entity.node.getAbsolutePosition() into the owned Vector3 emitter." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetAttachment",
        note: "RUNTIME — entity.GetAttachment(\"PARTICLE\")?.system or GetParticles(\"fire\") for stem lookup." },
    ],
  },
  {
    id: "materials",
    title: "Node materials: NME JSON → mesh override",
    intro: "Per Blender Material datablock: Node Material Editor JSON replaces glTF PBR at runtime by material name.",
    steps: [
      { file: "blender_addon/materials/nme_scan.py", symbol: "sync_material_nme",
        note: "AUTHORING — Scan NME reads ImageSourceBlock/TextureBlock slots, inspector-visible InputBlocks, and inspector-visible GradientBlocks from the NME JSON; preserves texture image picks by block_id; parameter and gradient values refresh from JSON on each scan." },
      { file: "blender_addon/materials/nme_textures.py", symbol: "extract_nme_textures",
        note: "AUTHORING — Extract Textures… (bjs.extract_nme_textures): decode embedded data: / base64String to PNG/JPG beside the JSON, rewrite block url, rescan texture rows." },
      { file: "blender_addon/export/materials.py", symbol: "export_node_material",
        note: "EXPORT — copy each distinct NME source once; copy external texture images; patch_nme_json_textures (strip embeds on override; leave embedded-only slots) + patch_nme_json_inputs + patch_nme_json_gradients on the exported copy." },
      { file: "blender_addon/export/level.py", symbol: "_build_manifest",
        note: "serialize_materials adds optional top-level manifest.materials[] (name, file, textures[], inputs[], gradients[]) for exportable meshes using a Material with bjs_nme_file set." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "Load",
        note: "LOAD — after appendSceneAsync + ApplyNodeVisibility, await ApplyNodeMaterials(scene, manifest.materials, baseUrl) before the entity pass (parse + bind overrides; no build yet)." },
      { file: "packages/engine/src/subsystems/materials.ts", symbol: "ApplyNodeMaterials",
        note: "parseSerializedObject + urlRewriter; cache per file+name; BindManifestTextures + BindManifestInputs + BindManifestGradients; assign mesh.material. Shader compile deferred." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "FINALIZE — after await ApplySceneSettings (environment IBL when declared), await BuildNodeMaterials(scene): whenTexturesReadyAsync then a single build() per unique NodeMaterial so ReflectionBlock sees scene.environmentTexture." },
      { file: "packages/engine/src/subsystems/materials.ts", symbol: "BuildNodeMaterials",
        note: "Collect every scene NodeMaterial (incl. MultiMaterial sub-slots), await whenTexturesReadyAsync, build() once each." },
    ],
  },
  {
    id: "msdfText",
    title: "MSDF text: font assets → TextRenderer",
    intro: "Resolution-independent 3D labels via @babylonjs/addons TextRenderer.",
    steps: [
      { file: "blender_addon/export/assets.py", symbol: "copy_asset",
        note: "EXPORT — BMFont JSON + glyph atlas PNG copied to fonts/ with stable sanitized names; re-exports overwrite." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "MsdfTextHandler",
        note: "LOAD — each MSDF_TEXT component queues an ApplyMsdfText promise (font fetch + async shader compile)." },
      { file: "packages/engine/src/ui/msdfText.ts", symbol: "ApplyMsdfText",
        note: "FontAsset cached per scene; TextRenderer.CreateTextRendererAsync; parent = entity.node; addParagraph with authored options. RegisterAttachment after textRenderers.push." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "SettleTasks over msdfTextTasks, then WireMsdfTextRendering → level.msdfTextManager (onAfterRenderObservable draw pass)." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetTextRenderer",
        note: "RUNTIME — entity.GetAttachment(\"MSDF_TEXT\")?.renderer or GetTextRenderer(\"roboto-regular\") by JSON stem; clearParagraphs/addParagraph for dynamic copy." },
    ],
  },
  {
    id: "gui3d",
    title: "3D GUI: components → GUI3DManager",
    intro: "In-scene buttons and panels authored as individual GUI3D_* components; Blender parenting defines panel hierarchy.",
    steps: [
      { file: "blender_addon/export/component_serializers.py", symbol: "_serialize_gui3d_control",
        note: "EXPORT — the GUI3D_* entries in the SERIALIZERS registry: text/image/tooltip/panel layout fields; button images via copy_asset; click events as {target GUID, message}. Click targets force-included via iter_referenced_objects for GUID assignment." },
      { file: "packages/engine/src/core/loader/componentRegistry.ts", symbol: "Gui3DHandler",
        note: "LOAD — GUI3D components don't build yet; each registration carries parentId (manifest parent GUID) for panel lookup." },
      { file: "packages/engine/src/ui/gui3d/builder.ts", symbol: "BuildGui3DControls",
        note: "FINALIZE — after constraints. BuildPanels (addControl → linkToTransformNode → RegisterAttachment) → batch controls with blockLayout → ApplyControlContent → WireClickEvents. Returns level.gui3DManager." },
      { file: "packages/engine/src/ui/gui3d/controls.ts", symbol: "ApplyControlContent",
        note: "THE Babylon ordering contract: content/text/image MUST be set AFTER addControl or it is silently lost. MeshButton3D wraps the entity mesh." },
      { file: "packages/engine/src/ui/gui3d/events.ts", symbol: "WireClickEvents",
        note: "Each On Click row: onPointerClickObservable → level.ById(target) → SendMessage(message, buttonEntity) → behavior OnMessage." },
      { file: "packages/engine/src/core/Entity.ts", symbol: "GetAttachment",
        note: "RUNTIME — entity.GetAttachmentsOfType(\"GUI3D_HOLO\") for component rows; GetControl3D(\"StartButton\") for stem lookup." },
    ],
  },
  {
    id: "lights",
    title: "Lights: lamp → faithful Babylon light",
    intro: "No component — glb creates and places the lamp; the loader copies Blender properties onto it via parent-chain lookup.",
    steps: [
      { file: "blender_addon/export/datablocks.py", symbol: "serialize_light",
        note: "EXPORT — per lamp object: color, intensity, sunAngle (SUN) / spot cone (SPOT), shadow block when Cast Shadows is on. Written into entities[].light on the manifest." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ProcessEntity",
        note: "LOAD — after ApplyEntityComponents, ProcessLightForEntity runs when entityData.light is set." },
      { file: "packages/engine/src/subsystems/lights.ts", symbol: "FindLightForNode",
        note: "Walks the entity node's parent chain — the glb orientation-correction node may sit between the GUID node and the actual Light." },
      { file: "packages/engine/src/subsystems/lights.ts", symbol: "ApplyBlenderLight",
        note: "Copies color and intensity 1:1 (manifest energy → light.intensity), spot cone. SUN angle is passed through to shadow setup (PCSS penumbra). Atmosphere may override sun intensity to π. AREA lamps are unsupported by glTF — validator warns at export." },
      { file: "packages/engine/src/subsystems/clusteredLights.ts", symbol: "ClusterPunctualLightsIfNeeded",
        note: "FINALIZE (before SetupShadows) — when enabled scene lights exceed lightBudget (default 8): move point/spot into ClusteredLightContainer (glTF falloff converted) or disable light UBOs. Sets level.punctualLightingMode and level.clusteredLights. Directional suns stay forward for shadows." },
    ],
  },
  {
    id: "cameras",
    title: "Cameras: export → faithful or typed override",
    intro: "Faithful glb FreeCamera by default; an optional CAMERA component rebuilds Universal/Arc/Follow/Geospatial from the exported pose.",
    steps: [
      { file: "blender_addon/export/datablocks.py", symbol: "serialize_camera",
        note: "EXPORT — clip range, FOV/ortho, active flag. Active camera becomes scene.activeCamera at load." },
      { file: "packages/engine/src/subsystems/cameras/apply.ts", symbol: "ApplyBlenderCamera",
        note: "LOAD — copies clip and lens onto the glb FreeCamera created by the importer." },
      { file: "packages/engine/src/subsystems/cameras/typed.ts", symbol: "BuildTypedCamera",
        note: "When a CAMERA component is present: build the typed camera FROM the faithful pose, copy lens, dispose the original." },
      { file: "packages/engine/src/subsystems/cameras/speeds.ts", symbol: "ApplyArcRotateControlSpeeds",
        note: "ARC / GEOSPATIAL — orbitSpeed / zoomSpeed / panSpeed multipliers from the manifest." },
      { file: "packages/engine/src/subsystems/cameras/targets.ts", symbol: "QueueCameraTargets",
        note: "FOLLOW / ARC / OFFSET target bindings queued during the entity pass — targets may not exist yet." },
      { file: "packages/engine/src/subsystems/cameras/targets.ts", symbol: "ResolveCameraTargets",
        note: "SECOND PASS — lockedTarget, Arc re-pivot (+ trackTarget updater), Follow-Offset AddUpdater. GEOSPATIAL skips this pass." },
    ],
  },
  {
    id: "shadows",
    title: "Shadows: casting lamp → ShadowGenerator",
    intro: "One ShadowGenerator per casting light; applied in FinalizeLevel after all bodies exist.",
    steps: [
      { file: "blender_addon/export/datablocks.py", symbol: "serialize_light",
        note: "EXPORT — shadow block (filter, bias, map size, frustum tuning) rides on the light entry when Cast Shadows is enabled; sunAngle on SUN lamps drives PCSS penumbra at load (0–45° → 0–1)." },
      { file: "blender_addon/export/level.py", symbol: "_stamp_gltf_extras",
        note: "EXPORT — transient bjs_visible (viewport eye off) and bjs_cast_shadows (ray-visibility Shadow off) stamped into glTF extras before the glb write; cleared after export." },
      { file: "packages/engine/src/core/loader/entityBuilder.ts", symbol: "ProcessEntity",
        note: "LOAD — casting lights are collected into context.shadowLights during the entity pass (sunAngle forwarded for SUN lamps; disabled lights skipped)." },
      { file: "packages/engine/src/subsystems/shadows.ts", symbol: "SetupShadows",
        note: "FINALIZE — one generator per casting lamp; all meshes receive; casters skip bjs_cast_shadows meshes and size outliers. SUN sunAngle → PCSS contactHardeningLightSizeUVRatio (0–45° → 0–1)." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "ClusterPunctualLightsIfNeeded runs first when over budget; then SetupShadows; level.shadowGenerators exposed for runtime tuning. freezeShadows bakes maps once for static worlds." },
    ],
  },
  {
    id: "post",
    title: "Post-processing: panel → DefaultRenderingPipeline",
    intro: "Scene-wide post stack attached to the active camera after Level.Begin so runtime cameras from OnStart still receive the pipeline.",
    steps: [
      { file: "blender_addon/export/post_processing.py", symbol: "serialize_post_processing",
        note: "EXPORT — scene.postProcessing block: MSAA, FXAA, bloom, DOF, SSAO, tone mapping, LUTs (copied to post/)." },
      { file: "packages/engine/src/core/LevelLoader.ts", symbol: "FinalizeLevel",
        note: "Order: scene settings → atmosphere → animations → async tasks → constraints → Begin (OnStart may swap camera) → ApplyPostProcessing." },
      { file: "packages/engine/src/subsystems/postprocess.ts", symbol: "ApplyPostProcessing",
        note: "DefaultRenderingPipeline + SSAO2 on scene.activeCamera → level.post. isLinearSpaceComposition follows HDR post flag." },
      { file: "packages/engine/src/subsystems/postprocess.ts", symbol: "RetargetPostProcessing",
        note: "If the active camera changes at runtime, retarget the pipeline without rebuilding every effect." },
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
    const navLabel = page.navLabel
      ?? page.diagram.title.replace(/^Babylon Level Kit — /, "");
    EmitDiagramPage({
      shell,
      outPath: path.join(OUT_DIR, file),
      pageTitle,
      diagramData: EnrichEngineAreaDiagram(page, file, TRACES),
      navHtml: BuildEngineNav(file, areaNav, traceNav, { currentTitle: navLabel }),
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
    const traceTitle = trace.title.split(":")[0];
    const traceDiagram = EnrichTraceDiagram(
      { title: "Trace — " + trace.title, nodes, edges },
      outFile,
      "engine",
    );
    EmitDiagramPage({
      shell,
      outPath: path.join(OUT_DIR, outFile),
      pageTitle: `Trace — ${trace.title}`,
      diagramData: traceDiagram,
      navHtml: BuildEngineNav(outFile, areaNav, traceNav, { currentTitle: traceTitle }),
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
