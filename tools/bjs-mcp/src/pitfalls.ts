export interface PitfallEntry
{
  mistake: string;
  symptom: string;
  fix: string;
  mcpTool?: string;
}

/** Silent failures and wrong approaches — returned by get_do_not_list. */
export const PITFALLS: PitfallEntry[] = [
  {
    mistake: "Lifecycle hook named `onStart` instead of `OnStart`",
    symptom: "Hook never runs; no error",
    fix: "Rename to PascalCase: OnStart, OnUpdate, OnDestroy, OnMessage",
    mcpTool: "get_scripting_context(section=\"lifecycle\")",
  },
  {
    mistake: "Decorator `@Exposed` or `@InputMap`",
    symptom: "Blender Sync/parser breaks",
    fix: "Keep lowercase: @exposed, @inputMap — literal tokens Blender scans",
    mcpTool: "get_exposed_field_snippet",
  },
  {
    mistake: "Class name ≠ filename stem",
    symptom: "Behavior not registered; Blender script picker mismatch",
    fix: "Patrol.ts must contain `export default class Patrol`",
    mcpTool: "validate_behavior",
  },
  {
    mistake: "Writing `this.node.position` every frame on a DYNAMIC body",
    symptom: "Mesh jitters or snaps back",
    fix: "Use velocity/impulse, or set Rigid Body to ANIMATED in Blender",
    mcpTool: "get_physics_movement(mode=\"dynamic\")",
  },
  {
    mistake: "ANIMATED body without `disablePreStep = false`",
    symptom: "Position logs correctly but mesh does not move",
    fix: "In OnStart: body.setMotionType(ANIMATED); body.disablePreStep = false",
    mcpTool: "get_physics_movement(mode=\"animated-teleport\")",
  },
  {
    mistake: "`setTargetTransform` called once on kinematic body",
    symptom: "Body drifts forever",
    fix: "Call every frame in OnUpdate, or drive node.position instead",
    mcpTool: "get_physics_movement(mode=\"animated-continuous\")",
  },
  {
    mistake: "SCRIPT behavior on skinned mesh instead of armature",
    symptom: "Animation / transform ignored",
    fix: "Attach SCRIPT / ANIMATOR components to the armature object in Blender",
    mcpTool: "get_scripting_context(section=\"animation\")",
  },
  {
    mistake: "ANIMATOR on skinned mesh instead of armature",
    symptom: "No clips found; states never play",
    fix: "Add ANIMATOR on the armature; Validate before export",
    mcpTool: "get_playbook(name=\"animator-fsm\")",
  },
  {
    mistake: "ANIMATOR + Animation panel autoplay both enabled",
    symptom: "Clips fight each other / wrong clip on load",
    fix: "Turn off autoplay — Animator owns playback",
    mcpTool: "get_scripting_context(section=\"animation\")",
  },
  {
    mistake: "Hand-written SCRIPT FSM instead of ANIMATOR for Idle/Walk",
    symptom: "Duplicated state logic; hard to author",
    fix: "Author ANIMATOR node graph in Blender; thin driver script only sets parameters",
    mcpTool: "get_playbook(name=\"animator-fsm\")",
  },
  {
    mistake: "Using NLA strip display names as Animator / GetAnimation clip ids",
    symptom: "Clip not found; dropdown empty or wrong name vs runtime",
    fix: "Use Action names (glTF ACTIONS mode). Renamed NLA tracks override. One Action per track; stashed muted tracks still count",
    mcpTool: "get_scripting_context(section=\"animation\")",
  },
  {
    mistake: "Reusing one Animator graph / wrong State clip across two armatures",
    symptom: "WhaleSwim on shark (or clip list stuck on the other object)",
    fix: "Each armature gets its own ANIMATOR + Edit Animator; State clips must be that object's Actions",
    mcpTool: "get_playbook(name=\"animator-fsm\")",
  },
  {
    mistake: "Looping Action with hold / dead frames at the end",
    symptom: "Character freezes briefly every cycle (worse on short clips)",
    fix: "Trim the Action so last pose matches first; remove end ease-out holds before export",
    mcpTool: "get_scripting_context(section=\"animation\")",
  },
  {
    mistake: "MESH-shaped trigger collider",
    symptom: "OnMessage never fires",
    fix: "Use box/sphere/capsule/convex trigger in Blender",
    mcpTool: "get_scripting_context(section=\"physics\")",
  },
  {
    mistake: "Treating far-away CONVEX/MESH hulls on duplicated prefabs as a Blender origin bug",
    symptom: "First copy's collider matches the mesh; later copies' physics shapes float far away (often near 2× world position)",
    fix: "Shared glTF mesh data loads as InstancedMesh. Hull verts must be in the body local frame — baking the instance world matrix double-applies pose. Current engines fix this in ResolvePhysicsMesh (geometry.ts). On older kits: update the engine, or make mesh data single-user in Blender",
    mcpTool: "get_scripting_context(section=\"physics\")",
  },
  {
    mistake: "scene.pickWithRay for obstacle / ground / line-of-sight checks",
    symptom: "Rays miss terrain and colliders; avoidance or grounding never triggers",
    fix: "pickWithRay only hits pickable render meshes, not Havok colliders. Terrain and obstacles are physics bodies, so rays often miss them. Use scene.getPhysicsEngine()?.raycastToRef(start, end, PhysicsRaycastResult) instead — same as TrainCamera.ts, CarController.ts, fishNavigator.ts",
    mcpTool: "get_scripting_context(section=\"physics\")",
  },
  {
    mistake: "`body.getCollisionObservable()` for trigger overlaps",
    symptom: "Trigger log/orbit gate never fires; no error",
    fix: "Override OnTriggerEnter/OnTriggerExit on the trigger entity, or subscribe to HavokPlugin.onTriggerCollisionObservable when listening from another entity",
    mcpTool: "get_recipe_template(recipe=\"trigger-logger\", className=\"TriggerDebug\")",
  },
  {
    mistake: "Invented `FindAction(\"Jump\")` name not in Input Actions",
    symptom: "Always undefined; input does nothing",
    fix: "Call list_input_actions; use PlayerActions constants from InputActions.ts",
    mcpTool: "list_input_actions",
  },
  {
    mistake: "Expecting Save Asset (.json) alone to persist Input Actions across .blend reload",
    symptom: "Change looks fine after Load Asset; reopening the scene shows the old maps/bindings",
    fix: "Live data is scene.bjs_input_maps in the .blend. Save Asset writes the JSON sidecar only. File → Save the .blend after edits (or Load Asset again if the JSON is newer)",
    mcpTool: "get_scripting_context(section=\"input\")",
  },
  {
    mistake: "Gamepad face-button binding reverts to Axis/Stick after .blend reload",
    symptom: "Reset (or similar) set to Button index 2/3; after reload export shows control: \"axis\" (0/1 often become Stick)",
    fix: "W3C indices overlap Button/Axis/Stick. Reload the Blender addon so picker sync suppresses update callbacks and RepairCorruptedGamepadBinding restores Button for BUTTON actions. Confirm the row, save the .blend, Save Asset, re-export",
    mcpTool: "get_scripting_context(section=\"input\")",
  },
  {
    mistake: "`window.addEventListener` for keys",
    symptom: "Leaks; breaks focus model",
    fix: "Use @inputMap + FindAction, or scene.onKeyboardObservable + OnDestroy cleanup",
    mcpTool: "get_fragment(name=\"cleanup-keyboard-observer\")",
  },
  {
    mistake: "Building orbit/globe camera entirely in a behavior",
    symptom: "Fights exported camera; wrong controls",
    fix: "Author Camera component in Blender (ARC / FOLLOW / GEOSPATIAL)",
    mcpTool: "get_scripting_context(section=\"cameras\")",
  },
  {
    mistake: "`new ArcRotateCamera` / UniversalCamera without CopyLens",
    symptom: "Authored FOV / clip planes ignored; Babylon defaults (~0.8 rad FOV)",
    fix: "FindCameraForNode(scene, entity.node) then CopyLens(authored, newCamera) before setting scene.activeCamera",
    mcpTool: "get_fragment(name=\"copy-lens-from-authored-camera\")",
  },
  {
    mistake: "Creating Atmosphere / DefaultRenderingPipeline in behavior",
    symptom: "Duplicates loader; wrong on reload",
    fix: "Author Babylon Scene › Atmosphere / Post-Processing in Blender; zone LUT swaps use ApplyColorGradingLut on level.post.pipeline.imageProcessing",
    mcpTool: "get_scripting_context(section=\"scene-look\")",
  },
  {
    mistake: "ApplyColorGradingLut or level.post access in OnStart",
    symptom: "Zone LUT skipped; pipeline undefined at startup",
    fix: "Use OnPostReady for level.post.pipeline work — post attaches after Begin/OnStart, then NotifyPostReady runs",
    mcpTool: "get_scripting_context(section=\"load-order\")",
  },
  {
    mistake: "Loading a .cube color-grading LUT as Texture or ad-hoc fetch in behavior",
    symptom: "Black/red image or no visible grade",
    fix: "Scene-wide: Post-Processing › Color Grading in Blender. Per-zone: @exposed({ type: \"file\" }) + ApplyColorGradingLut from @bjs/engine (see FogChanger.ts)",
    mcpTool: "get_fragment(name=\"zone-lut-swap\")",
  },
  {
    mistake: "Manifest-relative LUT path typed into @exposed({ type: \"string\" })",
    symptom: "No file picker; export does not copy the asset",
    fix: "Use @exposed({ type: \"file\" }) — export copies to post/ via copy_asset",
    mcpTool: "get_exposed_field_snippet(type=\"file\")",
  },
  {
    mistake: "Creating MSDF TextRenderer in behavior",
    symptom: "Missing font assets; no draw pass",
    fix: "Author MSDF_TEXT component in Blender; update with GetTextRenderer",
    mcpTool: "get_playbook(name=\"update-msdf-label\")",
  },
  {
    mistake: "Physics joints / hinges in TypeScript only",
    symptom: "No constraint at load",
    fix: "Author CONSTRAINT component in Blender; resolve at runtime via attachments",
    mcpTool: "get_playbook(name=\"rover-drive\")",
  },
  {
    mistake: "Expecting `level` or `Level` on Behavior",
    symptom: "Does not exist / wrong surface for reload",
    fix: "Use @exposed entity refs; for tag queries use this.byTag(\"Enemy\"); for prefabs use this.spawner.Spawn; for soft restart/load use await this.session.Restart() / Load(url). App code still owns the full Level via LevelDirector.GetLevel()",
    mcpTool: "get_scripting_context(section=\"level-session\")",
  },
  {
    mistake: "window.location.reload() to restart a level from a behavior",
    symptom: "Works but drops soft-restart (full page flash); unnecessary when LevelDirector is wired",
    fix: "await this.session.Restart() — app main should construct LevelDirector and pass it as LevelLoaderOptions.session",
    mcpTool: "get_scripting_context(section=\"level-session\")",
  },
  {
    mistake: "Calling level.componentHost or entity.AddComponent from a behavior",
    symptom: "No Level on Behavior; no add API on Entity",
    fix: "Mutate components from app code via level.componentHost after load",
    mcpTool: "get_doc_chapter(chapter=\"14-API-GUIDE.html\")",
  },
  {
    mistake: "Cloning Babylon nodes and copying attachment rows to \"spawn\" a prefab",
    symptom: "No physics bodies, scripts never OnStart, wheel constraints / entity refs point at the template",
    fix: "await this.spawner.Spawn(templateEntity, { position }) — full load pipeline per instance",
    mcpTool: "get_fragment(name=\"spawn-prefab-instance\")",
  },
  {
    mistake: "Sampling only VertexBuffer.ColorKind / requiring RGB >= 0.99 for paint-scatter",
    symptom: "Prefabs spawn everywhere (or nowhere) despite a painted Color Attribute in Blender",
    fix: "Leave color kind blank (auto-pick) or use COLOR_1; threshold on luminance (~0.5). Stock Babylon drops COLOR_1+ — LevelLoader registers bjs_extra_vertex_colors so getVerticesData(\"COLOR_1\") works. Blender often invents all-white COLOR_0 when Export all vertex colors is on.",
    mcpTool: "get_scripting_context(section=\"prefab-spawn\")",
  },
  {
    mistake: "Multi-spawn loop without batched shadow registration",
    symptom: "Hitches when scattering many prefabs; repeated shadow map refresh per instance",
    fix: "Pass deferShadowRefresh: true on each this.spawner.Spawn in the loop, then this.spawner.FlushSpawnShadowRefresh() once after. Skip defer for interval spawners (spawn seconds apart).",
    mcpTool: "get_scripting_context(section=\"prefab-spawn\")",
  },
  {
    mistake: "Spawning at full scale then setting scale to zero after Spawn() returns",
    symptom: "One-frame flash of full-size prefab at the template pose or spawn position",
    fix: "Pass scaling (and position / rotation) in SpawnOptions — loader/prefabSpawn applies transform on the hidden clone before reveal (clone.ts → ApplySpawnTransform). For grow-in, use scaling: Vector3.Zero() and lerp to template.node.scaling in OnUpdate (animalSpawner.ts).",
    mcpTool: "get_scripting_context(section=\"prefab-spawn\")",
  },
  {
    mistake: "Expecting spawned skinned prefabs to share the template animation phase",
    symptom: "All instances swim in sync or spawn mid-cycle from the template pose",
    fix: "Spawn clones skeletons and AnimationGroups per instance and hides the template at spawn start by default. Pass keepTemplate: true when the source rig should stay visible; use @exposed({ spawnTemplate: true }) for deferred spawners.",
    mcpTool: "get_scripting_context(section=\"prefab-spawn\")",
  },

  {
    mistake: "Expecting loose /levels/*.scene.json files after Publish with Encrypt / obfuscate",
    symptom: "HTTP 404 on manifest (e.g. Train Scene); engine throws could not fetch manifest",
    fix: "Encrypted builds pack levels into assets.pak and remove loose files. Serve over http/https (not file://); index bootstrap must register pak-sw.js and control the page before the app loads. Republish after kit fixes — bootstrap uses pak-sw.js?v=… + update() so a stale worker is not kept. Spaces in level names are decoded in the worker.",
    mcpTool: "get_scripting_context(section=\"published-encrypted-builds\")",
  },

  {
    mistake: "Runtime-adding REFLECTION_PROBE or RENDERING_GROUP",
    symptom: "ComponentHost logs policy warning; nothing applied",
    fix: "Author those components in Blender at export time",
    mcpTool: "get_engine_basics(topic=\"components-vs-behaviors\")",
  },
  {
    mistake: "Multi-line or computed @exposed default",
    symptom: "Blender ignores field; runtime keeps code default",
    fix: "Single-line literal only: = 5, = true, = \"x\", = [], = null",
    mcpTool: "get_exposed_field_snippet",
  },
  {
    mistake: "Forgot Sync after changing @exposed fields in code",
    symptom: "Inspector missing new fields",
    fix: "Blender › Script component › Sync button",
    mcpTool: "get_kernel",
  },
  {
    mistake: "Scaled Babylon velocity by deltaSeconds",
    symptom: "Movement too slow / wrong",
    fix: "Velocities are per-second already; only scale position deltas by deltaSeconds",
    mcpTool: "get_scripting_context(section=\"lifecycle\")",
  },
  {
    mistake: "Resolving lamps via `scene.lights` or `getLightByName` on large rigs",
    symptom: "increaselights / runtime dimming does nothing; no error after OnStart",
    fix: "Use `FindLightForNode(scene, entity.node)` from `@bjs/engine` — clustered point/spot lights are removed from `scene.lights` but stay drivable through the helper",
    mcpTool: "get_scripting_context(section=\"lights\")",
  },
  {
    mistake: "Toggling entity.node.isVisible / setEnabled manually for full enable/disable",
    symptom: "Mesh hides but Havok still collides; behaviors keep running OnUpdate",
    fix: "Use `SetEntityActive(entity, active)` from `@bjs/engine` — not `isVisible` alone (physics and OnUpdate keep running)",
    mcpTool: "get_fragment(name=\"set-entity-active\")",
  },
  {
    mistake: "Writing `node.metadata.bjsEntity = entity` (or spreading it) as an enumerable property",
    symptom: "Babylon Inspector Properties pane crashes with InternalError: too much recursion in ObjectCanSafelyStringify / MetadataProperties",
    fix: "Use AssignNodeEntity(node, entity) / EntityFromNode(node) from @bjs/engine — bjsEntity and scene bjsLevel are stored non-enumerable so Inspector Object.values walks stay acyclic",
    mcpTool: "get_scripting_context(section=\"entity\")",
  },
  {
    mistake: "Slow motion / pause via scene.animationTimeScale, physicsEngine.setTimeStep, or a hand-rolled multiplier",
    symptom: "Some systems keep real-time speed (spawner timers, physics, or animations drift apart); tab-switch hitch launches bodies",
    fix: "Write `this.time.timeScale` (GameClock is the single time authority) — it scales OnUpdate deltas, scene animations, and the Havok step together, with hitch clamping built in",
    mcpTool: "get_scripting_context(section=\"time\")",
  },
  {
    mistake: "Forces or repeated impulses applied in OnUpdate",
    symptom: "Physics strength varies with frame rate (144 Hz players accelerate faster); inconsistent behavior at low FPS",
    fix: "Apply continuous forces / repeated impulses in OnFixedUpdate (once per physics step). One-shot impulses on input edges stay in OnUpdate — edges must not be read in OnFixedUpdate",
    mcpTool: "get_scripting_context(section=\"time\")",
  },
  {
    mistake: "Treating a DYNAMIC body's node.position as the authoritative sim pose under fixed stepping",
    symptom: "Trigger polls / aim rays / follow logic feel one step late; teleports briefly streak",
    fix: "Under fixed stepping the engine interpolates dynamic-body visuals — node is the visual pose (up to one step behind). Prefer body APIs / OnFixedUpdate for sim-accurate reads; teleports snap past 10 m automatically",
    mcpTool: "get_scripting_context(section=\"time\")",
  },
  {
    mistake: "Ramp that writes timeScale (or a pause-menu timer) advances by OnUpdate deltaSeconds",
    symptom: "Slow-mo ease decelerates itself and never reaches zero; timers freeze while paused",
    fix: "Advance those timers with `this.time.unscaledDeltaSeconds` — OnUpdate's deltaSeconds is scaled game time (0 while frozen); see Endgame.ts",
    mcpTool: "get_scripting_context(section=\"time\")",
  },
  {
    mistake: "Zone behavior relies on Havok OnTriggerEnter/Exit only (FogChanger, ToggleInWater, etc.)",
    symptom: "Enter/exit never fires or state sticks — common when the probe collider is also a trigger",
    fix: "Poll with `IsEntityInsideColliderVolume(probe, volume)` in OnStart/OnUpdate; assign an explicit probe entity when the script host is not the moving sample point (e.g. CameraBlock for TrainCamera rigs)",
    mcpTool: "get_fragment(name=\"poll-trigger-volume\")",
  },
  {
    mistake: "Linear fog with equal or inverted start/end (e.g. `[10000, 10000]`)",
    symptom: "Fog disappears or water NME fog math breaks (divide by zero)",
    fix: "Use a valid span (start < end) or a far end for “no visible fog”; sanitize before SyncWaterFogOpacityRange",
    mcpTool: "get_scripting_context(section=\"scene-look\")",
  },
  {
    mistake: "LOD target entity has components (collider, script, etc.)",
    symptom: "Target's behaviors keep running and its physics body stays in the world — likely causes bugs",
    fix: "LOD targets must be mesh-only empties with no components; Blender UI shows a red warning when a picked target has components. Or use Auto LOD to generate the simplified mesh at runtime instead",
    mcpTool: "get_scripting_context(section=\"lod\")",
  },
  {
    mistake: "LOD target object is render-disabled or in no collection (orphan override child)",
    symptom: "Runtime logs `LOD on \"…\": target \"<guid>\" not found — skipping level`; the GUID changes every export",
    fix: "The target must be a real scene member to export. In the prefab library, make LOD meshes members of the prefab's collection (Blender's library override leaves non-member children as orphan datablocks). Export validation warns about both cases",
    mcpTool: "get_scripting_context(section=\"lod\")",
  },
  {
    mistake: "LOD target mesh shares mesh data with other objects (linked prefab duplicates)",
    symptom: "Runtime logs `target \"…\" only owns instanced meshes` — Babylon addLODLevel requires unique Mesh geometry",
    fix: "Make the LOD meshes single-user in the prefab library so they export as unique meshes instead of glTF instances",
    mcpTool: "get_scripting_context(section=\"lod\")",
  },
  {
    mistake: "`lookAt` on a node parented to the camera (or any rotated parent) without `Space.WORLD`",
    symptom: "HUD arrow / child marker never rotates toward the target; no error",
    fix: "Pass `Space.WORLD`: `node.lookAt(targetPos, 0, 0, 0, Space.WORLD)`. Default LOCAL space uses the parent's frame.",
    mcpTool: "get_axis_conversion(topic=\"look-at\")",
  },
  {
    mistake: "Assuming `lookAt` / `setDirection` aligns local +Z (Babylon forward)",
    symptom: "Mesh rotates but tip points sideways — authored forward was Blender +Y",
    fix: "Model forward along Blender local +Y. `setDirection` aligns local +Y, not +Z. See ObjectiveArrow.ts, BoatRocker.ts",
    mcpTool: "get_axis_conversion(topic=\"look-at\")",
  },
  {
    mistake: "Using `Vector3.Forward()` or Babylon +Z as Blender object forward in local-space math",
    symptom: "Offsets or rotations 90° off — pitch on wrong axis, forward vector sideways",
    fix: "Local frame is Blender Z-up (+Y forward, +Z up). World helpers (Vector3.Forward, Up) are Babylon Y-up. See get_axis_conversion.",
    mcpTool: "get_axis_conversion(topic=\"manifest-vs-local\")",
  },
];

export function FormatDoNotList(): string
{
  const lines = [
    "# Do NOT do this (silent failures)",
    "",
    "If something \"does nothing\", check this list first.",
    "",
  ];

  for (const entry of PITFALLS)
  {
    lines.push(`## ${entry.mistake}`);
    lines.push(`- **Symptom:** ${entry.symptom}`);
    lines.push(`- **Fix:** ${entry.fix}`);
    if (entry.mcpTool !== undefined)
    {
      lines.push(`- **MCP:** \`${entry.mcpTool}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}
