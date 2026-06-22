# 09 — Feature Traces

[← Index](00-INDEX.md) · Prev: [Workflow](08-WORKFLOW.md)

The exact file/function chain for each feature, Blender click → runtime effect.
Format: `blender_addon/…` → manifest → `packages/engine/src/…`.

### GUID / entity identity
`core/ids.ensure_object_id` (custom prop `bjs_id`) → glTF node `extras` →
manifest `entities[].id` → the loader's `BuildIdIndex` (`core/loader/nodeResolution.ts`) reads
`metadata.gltf.extras.bjs_id` (needs `ExtrasAsMetadata` import) →
`ProcessEntity` matches GUID-first → `Entity` in `level.entities`, node gets
`metadata.bjsEntity` back-reference.

### Tag
TAG component (`components/` → `export/components.serialize_components`) → manifest
`{type:"TAG", tag}` → `entityBuilder.ClassifyComponents` sets `entity.tag` and
`RegisterAttachment({type:"TAG", data})` → query `level.ByTag("Enemy")` or
`entity.HasAttachment("TAG")`.

### Collider / RigidBody
N-panel fields (+ `viewport/collider_preview.py` wireframe, Blender space) →
`serialize_components` converts center/size/rotation to Y-up; DYNAMIC rigid
bodies also export `centerOfMassAutoFit` and optional `centerOfMass` → manifest
COLLIDER/RIGIDBODY → `physics.BuildPhysics`: shape path chosen
(auto-fit aggregate | wrapper fit | convex/mesh merge | manual), all geometry
gathered via `OwnedColliderMeshes` (excludes child entities by GUID) →
`ApplyMassProperties` (`ResolveCenterOfMass` + `setMassProperties`) → one
`PhysicsBody` on the node → `entity.body` + `RegisterAttachment` per COLLIDER
and/or RIGIDBODY row (same `body` ref when both). Sound because of right-handed
import ([why](05-PHYSICS.md#right-handed)). Debug view: **C** →
`Level.ShowColliders` → PhysicsViewer.

### Script + @exposed values
"Open Script…" stores the filename stem; **Sync** →
`core/script_parse.py` regex-reads `@exposed` fields → `BJSExposedVar` rows → edits
serialize into `vars` → manifest SCRIPT → `InstantiateScripts` (`core/loader/entityBuilder.ts`) →
`BehaviorRegistry.Create(stem)` (registered by `AutoRegisterBehaviors` from
`import.meta.glob`) → inject `entity`/`scene` → `ApplyExposedVars` (coerce
vector3/color; entity refs → `PendingRef`) → `RegisterAttachment({type:"SCRIPT",
data, behavior})` → second pass
`ResolveObjectReferences` → `Level.Begin` calls `OnStart`.

### Entity reference field
Object picker (`BJSExposedVar.obj_val`) → `ensure_object_id(target)` +
force-include via `iter_referenced_objects` → manifest `vars.field = guid` →
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
target bindings via `QueueCameraTargets` (FOLLOW / ARC / OFFSET only) → second
pass `ResolveCameraTargets` (FOLLOW lockedTarget / ARC re-pivot / OFFSET
`AddUpdater`). GEOSPATIAL skips the target pass — `BuildGeospatialCamera` derives
`center` / `yaw` / `pitch` / `radius` from the exported pose and `planetRadius`.

### Atmosphere
Properties › Scene › Atmosphere (`ui/scene_panels.py`) edits
`scene.bjs_scene.atmosphere` (`scene/atmosphere.py`) →
`export/atmosphere.serialize_atmosphere` (optional `sunLightId` GUID; scattering
tuning) → manifest `scene.atmosphere` → `LevelLoader.FinalizeLevel`:
`ApplySceneSettings` (env skybox forced off at export when atmosphere is on) →
`ApplyAtmosphere` (`subsystems/atmosphere.ts`: resolves SUN →
`DirectionalLight`, optional π intensity for PBR, `@babylonjs/addons/atmosphere`)
→ `level.atmosphere` (disposed with the level). Time of day follows the sun
lamp's direction in Blender. See [Rendering — Atmosphere](06-RENDERING.md).

### Post-processing
Properties › Scene › Post-Processing (`ui/post_panels.py`) edits
`scene.bjs_scene.post` (`scene/post_processing.py`) →
`export/post_processing.serialize_post_processing` (LUTs via `copy_asset` →
`post/`; VLS `lightSource` GUID + axis-converted `customMeshPosition`) → manifest
`scene.postProcessing` → `LevelLoader.FinalizeLevel`:
`ApplySceneSettings` (clear/ambient, env, fog) → `ApplyAtmosphere` (when
enabled) → … → `Level.Begin` (runtime cameras) → `ApplyPostProcessing` (`subsystems/postprocess.ts`: Default Pipeline
+ SSAO2 + `VolumetricLightScatteringPostProcess` on `scene.activeCamera`,
resolving `lightSource` via `level.ById`) → `level.post`. See
[Rendering — Scene look](06-RENDERING.md).

### Animation autoplay
NLA strips → `export/animation.serialize_animation` → `animation` block →
`FindAnimationGroups` (node-membership scoping) →
`ApplyAutoPlayAnimations` (stop loader-auto groups, start chosen clip).
Skinned characters: author on the **armature** ([rule](07-AUDIO-ANIMATION.md)).

### Audio
AUDIO component → `export/assets.copy_asset` → `audio/<file>` + manifest →
`audio.ApplyAudio` (engine v2 `CreateSoundAsync`, spatial attach) → promises
settled in `FinalizeLevel`; autoplay waits `unlockAsync` → `entity.sounds`,
`RegisterAttachment({type:"AUDIO", data, sound})`, `GetSound(stem)`.

### Trigger event → OnMessage
Is Trigger + **On Enter Events** rows (`BJSTriggerEvent`) → manifest
`collider.events[{target guid, message, filterTag}]` → registration queued in
`ApplyComponents` → `triggers.WireTriggerEvents` (one
`onTriggerCollisionObservable`) → on TRIGGER_ENTERED: body→entity via
`metadata.bjsEntity`, tag gate → `target.SendMessage` → behavior `OnMessage`.

### Constraint
CONSTRAINT fields → `serialize_components` (pivot/axis → Y-up; target GUID
force-included; CUSTOM also exports `axes[]` per 6DoF row) →
`constraints.BuildConstraints` in `FinalizeLevel`:
`ComputeConstraintFrame` from live world transforms (pins as-placed pose) →
Lock/BallAndSocket or 6DoF with `BuildAxisLimits` (presets) or
`BuildCustomAxisLimits` (CUSTOM) → optional `ApplyMotor` (HINGE/SLIDER only) →
`ownerBody.addConstraint` → `level.constraints` +
`RegisterAttachment` on owner (`{type:"CONSTRAINT", data, constraint}`).

### Input action
Blender **Input Actions** panel (maps > actions > bindings + **Scene Default**
map picker) → `input_actions/serialize.serialize_input_asset` + `defaultInputMap` → manifest
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
`export/live_link._on_save_post` → `validate` + `export_level` (side files
overwrite stable paths via `begin_asset_export` / `unique_asset_path`) →
manifest write → Vite `ReloadOnLevelExport` watches all of `public/levels/`
(`path.resolve` path matching; 50ms debounce) → full page reload.

### Debug Build
Checkbox (`scene.bjs_debug_build`) → manifest top-level `"debug"` →
`level.debugEnabled` (missing = true) → gates **C**/**I** in `main.ts` and the
`debugColliders` option.

### 2D GUI (GUI Editor JSON)
GUI component (`components/` → `export/assets.copy_asset` to `gui/`) → manifest
`{type:"GUI", file, mode, …}` → `ApplyComponents` queues `ApplyGui`
(`ui/gui2d.ts`) → `SettleTasks` in `FinalizeLevel` →
`entity.guiTextures`, `RegisterAttachment({type:"GUI", data, texture})`,
`GetGui(stem)`. Trace: [trace-gui.html](trace-gui.html).

### Particles (Particle / Node Particle Editor JSON)
PARTICLE component → `export_particle_system` (`export/particles.py`: copy JSON,
copy **Particle Textures** images, patch `ParticleTextureSourceBlock.url` in the
exported file) → manifest → `ApplyParticles` (`subsystems/particles.ts`:
`ResolveNodeParticleSetTextureUrls` + legacy or `NodeParticleSystemSet`) → mesh
emitter or owned `Vector3` + optional `emptyEmitter` → `SettleTasks` →
`WireParticleEmitterTracking` (`level.particleEmitterManager`, empties only) →
`entity.particleSystems`, `RegisterAttachment`, `GetParticles(stem)`. Trace:
[trace-particles.html](trace-particles.html) · Blender:
[../blender/trace-particles.html](../blender/trace-particles.html).

### 3D GUI (buttons + panels)
Nine `GUI3D_*` types → `serialize_components` (layout fields, click events,
button images via `copy_asset`; click targets force-included) → registrations
queued with `parentId` → `BuildGui3DControls` in `FinalizeLevel` (panels first,
`blockLayout`, content after `addControl`) → `RegisterAttachment` per panel/control
→ `WireClickEvents` → `OnMessage` on target. Trace: [trace-gui3d.html](trace-gui3d.html) · Blender:
[../blender/trace-gui3d.html](../blender/trace-gui3d.html). Full write-up:
[10-UI.md](10-UI.md).

[← Index](00-INDEX.md)
