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
    fix: "Attach SCRIPT component to the armature object in Blender",
    mcpTool: "get_scripting_context(section=\"animation\")",
  },
  {
    mistake: "MESH-shaped trigger collider",
    symptom: "OnMessage never fires",
    fix: "Use box/sphere/capsule/convex trigger in Blender",
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
    fix: "Author Babylon Scene › Atmosphere / Post-Processing in Blender",
    mcpTool: "get_scripting_context(section=\"scene-look\")",
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
    symptom: "Does not exist",
    fix: "Use @exposed entity refs; for tag queries use this.byTag(\"Enemy\"); for runtime prefab instances use this.spawner.Spawn — app code uses level.ByTag / level.Spawn, not in behaviors as a Level field",
    mcpTool: "get_scripting_context(section=\"reaching-other-objects\")",
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
    mistake: "Trigger probe collider on a zone behavior (FogChanger, etc.)",
    symptom: "Enter/exit never fires or fires inverted; wrong fog/light preset sticks",
    fix: "Solid collider on the moving probe; poll overlap in OnStart/OnUpdate as fallback",
    mcpTool: "get_scripting_context(section=\"physics\")",
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
