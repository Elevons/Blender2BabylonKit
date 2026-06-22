# 03 — The Load Pipeline

[← Index](00-INDEX.md) · Prev: [Blender Add-on](02-BLENDER-ADDON.md) · Next: [Scripting →](04-SCRIPTING.md)

`LevelLoader.Load(manifestUrl)` (`packages/engine/src/core/LevelLoader.ts`) is
the orchestrator; each stage lives in `core/loader/` (`manifest.ts`,
`nodeResolution.ts`, `entityBuilder.ts`, `sceneSettings.ts`, `context.ts`).

1. **`FetchAndValidateManifest`** (`loader/manifest.ts`) — clear errors for the
   two classic failures: HTTP 404, and the dev server returning `index.html`
   (HTML, not JSON).
2. **Load input** — `InputManager.LoadAsset(manifest.scene.inputActions ??
   DEFAULT_INPUT_ASSET, manifest.scene.defaultInputMap ?? "Player")` so
   `@inputMap` fields and the scene-default `behavior.input` fallback can be
   injected before behaviors are built.
3. **Append the glb** — `scene.useRightHandedSystem = true` is set *first* so
   the loader skips the handedness-mirroring `__root__` transform (the old
   collider-orientation bug; full story in [Physics](05-PHYSICS.md#right-handed)).
   `NeutralizeGltfRoot` (`loader/nodeResolution.ts`) remains as a guard that
   warns if a mirrored root ever reappears. Requires the `ExtrasAsMetadata`
   loader extension import — without it `node.metadata` stays empty and GUID
   matching silently fails.
4. **`BuildIdIndex`** (`loader/nodeResolution.ts`) — walk every transform node
   + mesh, map `metadata.gltf.extras.bjs_id` → node.
5. **`ProcessEntity`** (`loader/entityBuilder.ts`) per manifest entity:
   - resolve node (GUID first, name fallback), create `Entity`, register in
     `level.entities`, back-reference `node.metadata.bjsEntity = entity`;
   - **`ApplyComponents`** → `ClassifyComponents` sorts the component array,
     then: physics body from COLLIDER/RIGIDBODY (`BuildPhysics` →
     `RegisterAttachment` per collider/rigidbody row), trigger-event
     registrations queued, AUDIO/GUI/PARTICLE async tasks queued, GUI3D
     registrations queued (with manifest `parent` GUID for panel nesting),
     `InstantiateScripts` builds behaviors (`RegisterAttachment` per SCRIPT),
     applies `@exposed` values, and `InjectInputMaps` (entity refs deferred as
     `PendingRef`s); TAG rows register during classification;
   - `ProcessLightForEntity` / `ProcessCameraForEntity` (typed camera override
     via `BuildTypedCamera`; FOLLOW/ARC/OFFSET target bindings queued by
     `QueueCameraTargets` — GEOSPATIAL resolves pose immediately).
6. **Second pass** — now every entity exists: `ResolveObjectReferences`
   (entity-typed `@exposed` fields + list slots) and `ResolveCameraTargets`
   (FOLLOW lockedTarget / ARC re-pivot / OFFSET per-frame updater).
7. **`FinalizeLevel`** — shadows (`SetupShadows`), scene block
   (`await ApplySceneSettings` → clear/ambient, async `ApplyEnvironment` + fog),
   **`ApplyAtmosphere`** when the manifest includes `scene.atmosphere` (SUN lamp
   → `@babylonjs/addons/atmosphere`; sets `level.atmosphere`),
   `ApplyAutoPlayAnimations` (stop the glTF loader's auto-started groups, start
   the chosen clips), `SettleTasks` for audio/GUI/particle promises
   (`Promise.allSettled` so one bad file logs instead of rejecting the load),
   wire trigger events (`WireTriggerEvents` → `level.triggerObserver`), build
   constraints (`BuildConstraints` → `level.constraints` + CONSTRAINT rows on
   owner entities), build 3D GUI (`BuildGui3DControls` → `level.gui3DManager` +
   GUI3D_* rows on owning entities), then **`level.Begin()`**
   (behaviors' `OnStart`, including any runtime camera creation), then
   **`ApplyPostProcessing`** (default pipeline + SSAO + volumetric light
   scattering on `scene.activeCamera`),
   and if `debugColliders` *and* the export's Debug Build flag allow, show
   collider wireframes.

See [10 — UI](10-UI.md) for the 2D GUI, particle, and 3D GUI pipelines.

`EnableHavokPhysics(scene)` must run before `Load` — bodies are built in step 5.

**`Level`** (`core/Level.ts`) is the runtime container: `entities` map,
`ById`/`ByTag`, `activeCamera`, `shadowGenerators`, `constraints`, `post`,
`atmosphere`, `debugEnabled`, `ShowColliders`, `AddUpdater`. `Begin` attaches
[Input](04-SCRIPTING.md#input), runs every `OnStart`, then drives `RunFrame`
each render: `InputManager.Process` first, all `OnUpdate(deltaSeconds)`,
registered updaters, then `InputManager.EndFrame` last (so `WasPressed` edges
last one full frame). `Dispose` detaches input, removes observers, disposes
constraints and sounds, clears `entity.attachments`, runs `OnDestroy`.

Continue: [Scripting →](04-SCRIPTING.md)
