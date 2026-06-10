# 03 — The Load Pipeline

[← Index](00-INDEX.md) · Prev: [Blender Add-on](02-BLENDER-ADDON.md) · Next: [Scripting →](04-SCRIPTING.md)

`LevelLoader.Load(manifestUrl)` (`packages/engine/src/core/LevelLoader.ts`) is
the heart of the runtime. Each numbered step below is a named private method.

1. **`FetchAndValidateManifest`** — clear errors for the two classic failures:
   HTTP 404, and the dev server returning `index.html` (HTML, not JSON).
2. **Append the glb** — `scene.useRightHandedSystem = true` is set *first* so
   the loader skips the handedness-mirroring `__root__` transform (the old
   collider-orientation bug; full story in [Physics](05-PHYSICS.md#right-handed)).
   `NeutralizeGltfRoot` remains as a guard that warns if a mirrored root ever
   reappears. Requires the `ExtrasAsMetadata` loader extension import — without
   it `node.metadata` stays empty and GUID matching silently fails.
3. **`BuildIdIndex`** — walk every transform node + mesh, map
   `metadata.gltf.extras.bjs_id` → node.
4. **`ProcessEntity`** per manifest entity:
   - resolve node (GUID first, name fallback), create `Entity`, register in
     `level.entities`, back-reference `node.metadata.bjsEntity = entity`;
   - **`ApplyComponents`** → `ClassifyComponents` sorts the component array,
     then: physics body from COLLIDER/RIGIDBODY (`BuildPhysics`), trigger-event
     registrations queued, AUDIO sound-creation promises queued,
     `InstantiateScripts` builds behaviors and applies `@exposed` values
     (entity refs deferred as `PendingRef`s);
   - `ProcessLightForEntity` / `ProcessCameraForEntity` (typed camera override
     via `BuildTypedCamera`; target bindings queued by `RegisterCameraTargets`).
5. **Second pass** — now every entity exists: `ResolveObjectReferences`
   (entity-typed `@exposed` fields + list slots) and `ResolveCameraTargets`
   (FOLLOW lockedTarget / ARC re-pivot / OFFSET per-frame updater).
6. **`FinalizeLevel`** — shadows (`SetupShadows`), scene block (`ApplyScene`:
   environment/fog/post), `ApplyAutoPlayAnimations` (stop the glTF loader's
   auto-started groups, start the chosen clips), settle the audio promises
   (`Promise.allSettled` so one bad file logs instead of rejecting the load),
   wire trigger events (`WireTriggerEvents` → `level.triggerObserver`), build
   constraints (`BuildConstraints` → `level.constraints`), then
   **`level.Begin()`** and, if `debugColliders` *and* the export's Debug Build
   flag allow, show collider wireframes.

`EnableHavokPhysics(scene)` must run before `Load` — bodies are built in step 4.

**`Level`** (`core/Level.ts`) is the runtime container: `entities` map,
`ById`/`ByTag`, `activeCamera`, `shadowGenerators`, `constraints`, `post`,
`debugEnabled`, `ShowColliders`, `AddUpdater`. `Begin` attaches
[Input](04-SCRIPTING.md#input), runs every `OnStart`, then drives `RunFrame`
each render: all `OnUpdate(deltaSeconds)`, registered updaters, `Input.Update`
last (so `WasPressed` edges last one full frame). `Dispose` detaches input,
removes observers, disposes constraints and sounds, runs `OnDestroy`.

Continue: [Scripting →](04-SCRIPTING.md)
