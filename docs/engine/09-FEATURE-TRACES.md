# 09 — Feature Traces

[← Index](00-INDEX.md) · Prev: [Workflow](08-WORKFLOW.md)

The exact file/function chain for each feature, Blender click → runtime effect.
Format: `blender_addon/…` → manifest → `packages/engine/src/…`.

### GUID / entity identity
`properties.ensure_object_id` (custom prop `bjs_id`) → glTF node `extras` →
manifest `entities[].id` → the loader's `BuildIdIndex` (`core/loader/nodeResolution.ts`) reads
`metadata.gltf.extras.bjs_id` (needs `ExtrasAsMetadata` import) →
`ProcessEntity` matches GUID-first → `Entity` in `level.entities`, node gets
`metadata.bjsEntity` back-reference.

### Tag
TAG component (`properties` → `export._serialize_components`) → manifest
`{type:"TAG", tag}` → `entityBuilder.ClassifyComponents` sets `entity.tag` →
query `level.ByTag("Enemy")`.

### Collider / RigidBody
N-panel fields (+ `collider_preview.py` wireframe, Blender space) →
`_serialize_components` converts center/size/rotation to Y-up → manifest
COLLIDER/RIGIDBODY → `physics.BuildPhysics`: shape path chosen
(auto-fit aggregate | wrapper fit | convex/mesh merge | manual), all geometry
gathered via `OwnedColliderMeshes` (excludes child entities by GUID) → one
`PhysicsBody` on the node → `entity.body`. Sound because of right-handed
import ([why](05-PHYSICS.md#right-handed)). Debug view: **C** →
`Level.ShowColliders` → PhysicsViewer.

### Script + @exposed values
"Open Script…" stores the filename stem; **Sync** →
`script_parse.py` regex-reads `@exposed` fields → `BJSExposedVar` rows → edits
serialize into `vars` → manifest SCRIPT → `InstantiateScripts` (`core/loader/entityBuilder.ts`) →
`BehaviorRegistry.Create(stem)` (registered by `AutoRegisterBehaviors` from
`import.meta.glob`) → inject `entity`/`scene` → `ApplyExposedVars` (coerce
vector3/color; entity refs → `PendingRef`) → second pass
`ResolveObjectReferences` → `Level.Begin` calls `OnStart`.

### Entity reference field
Object picker (`BJSExposedVar.obj_val`) → `ensure_object_id(target)` +
force-include via `_iter_referenced_objects` → manifest `vars.field = guid` →
`PendingRef` → `ResolveObjectReferences` assigns the `Entity` (or list slot by
index) before `OnStart`.

### Light / Shadows
Lamp (auto-derived; no component) → `export` writes `light` block (+ `shadow`
when Cast Shadows) → `lights.ApplyBlenderLight` (parent-chain find; color
exact, intensity scaled) → casting lights collected →
`shadows.SetupShadows` in `FinalizeLevel` → `level.shadowGenerators`.

### Camera (+ typed override)
Camera object → `camera` block (clip/FOV/active) →
`cameras.ApplyBlenderCamera` onto the glb FreeCamera; active →
`scene.activeCamera`. CAMERA component → `BuildTypedCamera` per-type builder →
target bindings via `QueueCameraTargets` → second pass
`ResolveCameraTargets` (FOLLOW lockedTarget / ARC re-pivot / OFFSET
`AddUpdater`).

### Animation autoplay
NLA strips → `anim_export.serialize_animation` → `animation` block →
`FindAnimationGroups` (node-membership scoping) →
`ApplyAutoPlayAnimations` (stop loader-auto groups, start chosen clip).
Skinned characters: author on the **armature** ([rule](07-AUDIO-ANIMATION.md)).

### Audio
AUDIO component → `export._copy_audio_file` → `audio/<file>` + manifest →
`audio.ApplyAudio` (engine v2 `CreateSoundAsync`, spatial attach) → promises
settled in `FinalizeLevel`; autoplay waits `unlockAsync` → `entity.sounds`,
`GetSound(stem)`.

### Trigger event → OnMessage
Is Trigger + **On Enter Events** rows (`BJSTriggerEvent`) → manifest
`collider.events[{target guid, message, filterTag}]` → registration queued in
`ApplyComponents` → `triggers.WireTriggerEvents` (one
`onTriggerCollisionObservable`) → on TRIGGER_ENTERED: body→entity via
`metadata.bjsEntity`, tag gate → `target.SendMessage` → behavior `OnMessage`.

### Constraint
CONSTRAINT fields → `_serialize_components` (pivot/axis → Y-up; target GUID
force-included; CUSTOM also exports `axes[]` per 6DoF row) →
`constraints.BuildConstraints` in `FinalizeLevel`:
`ComputeConstraintFrame` from live world transforms (pins as-placed pose) →
Lock/BallAndSocket or 6DoF with `BuildAxisLimits` (presets) or
`BuildCustomAxisLimits` (CUSTOM) → optional `ApplyMotor` (HINGE/SLIDER only) →
`ownerBody.addConstraint` → `level.constraints`.

### Input action
Blender **Input Actions** panel (maps > actions > bindings + **Scene Default**
map picker) → `_serialize_input_asset` + `defaultInputMap` → manifest
`scene.inputActions` / `scene.defaultInputMap` → `InputManager.LoadAsset`
(loader, before behaviors) → `@inputMap("Name")` fields injected per behavior;
scripts without `@inputMap` receive the scene default on `behavior.input` →
`Level.Begin` →
`InputManager.Attach` (keyboard observable + enable maps); `RunFrame` →
`InputManager.Process` FIRST (gamepad poll, actions evaluate,
started/performed/canceled fire) → behaviors poll
`ReadValue/ReadVector2/IsPressed/WasPressedThisFrame` →
`InputManager.EndFrame` last (edge clear); `Dispose` → `Detach`.

### Live Link
Export remembers path (`scene.bjs_live_link_path`) → Ctrl+S →
`live_link._on_save_post` → `validate` + `export_level` → manifest write →
Vite `ReloadOnLevelExport` watcher → full page reload.

### Debug Build
Checkbox (`scene.bjs_debug_build`) → manifest top-level `"debug"` →
`level.debugEnabled` (missing = true) → gates **C**/**I** in `main.ts` and the
`debugColliders` option.

### 2D GUI (GUI Editor JSON)
GUI component (`properties` → `export._copy_asset` to `gui/`) → manifest
`{type:"GUI", file, mode, …}` → `ApplyComponents` queues `ApplyGui`
(`ui/gui2d.ts`) → `SettleTasks` in `FinalizeLevel` →
`entity.guiTextures`, `GetGui(stem)`. Trace: [trace-gui.html](trace-gui.html).

### Particles (Particle Editor JSON)
PARTICLE component → `_copy_asset` to `particles/` → manifest →
`ApplyParticles` (`subsystems/particles.ts`, `ParticleHelper.ParseFromFileAsync`)
→ `entity.particleSystems`, `GetParticles(stem)`. Trace:
[trace-particles.html](trace-particles.html).

### 3D GUI (buttons + panels)
Nine `GUI3D_*` types → `_serialize_components` (layout fields, click events,
button images via `_copy_asset`; click targets force-included) → registrations
queued with `parentId` → `BuildGui3DControls` in `FinalizeLevel` (panels first,
`blockLayout`, content after `addControl`) → `WireClickEvents` →
`OnMessage` on target. Trace: [trace-gui3d.html](trace-gui3d.html) · Blender:
[../blender/trace-gui3d.html](../blender/trace-gui3d.html). Full write-up:
[10-UI.md](10-UI.md).

[← Index](00-INDEX.md)
