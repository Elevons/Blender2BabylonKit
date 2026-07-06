// Diagram data for engine area pages. Edit here, then npm run docs:build.
export const ENGINE_AREA_PAGES = {
  "index.html": {
    "navLabel": "Overview",
    "diagram": {
      "title": "Babylon Level Kit — Engine overview",
      "nodes": [
        {
          "id": 1,
          "x": 30,
          "y": 40,
          "w": 150,
          "h": 40,
          "label": "Blender scene",
          "sub": "objects + components",
          "desc": "Authoring: the **Babylon Object** viewport N-panel adds components (Tag, Collider, RigidBody, Script, Camera, Audio, Constraint, GUI, Particle, MSDF Text, GUI3D_*) to objects. Scene-wide settings (rendering, fog, atmosphere, post, Input Actions, export) live in the **Babylon Scene** N-panel. GUIDs (bjs_id) make objects addressable entities.",
          "meta": [
            [
              "Module",
              "components/ · ui/view3d_panels"
            ],
            [
              "Identity",
              "ID_KEY = bjs_id"
            ]
          ]
        },
        {
          "id": 2,
          "x": 30,
          "y": 140,
          "w": 150,
          "h": 40,
          "label": "Validator",
          "sub": "pre-export checks",
          "desc": "Catches silent failures at export: missing scripts, dangling refs, MESH+DYNAMIC, mesh triggers, skinned-mesh components, duplicate GUIDs, area lights, no camera, Input Actions (duplicate names, empty bindings, bad @inputMap refs, missing Scene Default).",
          "meta": [
            [
              "Module",
              "export/validate.py"
            ],
            [
              "Runs",
              "Validate / Export / Live Link"
            ]
          ]
        },
        {
          "id": 3,
          "x": 30,
          "y": 240,
          "w": 150,
          "h": 40,
          "label": "Exporter",
          "sub": "glb + manifest",
          "desc": "Writes the glb (Blender glTF, +Y-up, GUIDs in extras) and builds the schema-v4 manifest. Converts axes Blender→Babylon at export. Copies audio/env files. Seeds Input Actions on first export.",
          "meta": [
            [
              "Module",
              "export/ (+ scene/ · animation/)"
            ],
            [
              "Schema",
              "v4"
            ]
          ]
        },
        {
          "id": 4,
          "x": 30,
          "y": 340,
          "w": 150,
          "h": 40,
          "label": "Live Link",
          "sub": "save_post hook",
          "desc": "Ctrl+S re-exports using the remembered path; the app's Vite plugin watches all files under public/levels/ (path.resolve matching; 50ms debounce) and full-reloads the browser — not only .scene.json, so replaced env HDRs still refresh.",
          "meta": [
            [
              "Module",
              "export/live_link.py"
            ],
            [
              "Runtime",
              "vite.config.ts"
            ]
          ]
        },
        {
          "id": 5,
          "x": 260,
          "y": 220,
          "w": 140,
          "h": 40,
          "label": "level.glb",
          "sub": "what glTF expresses",
          "desc": "Meshes, transforms, hierarchy, materials, lights, cameras, animation clips. Multi-material objects import as a wrapper node + one child mesh per material.",
          "meta": [
            [
              "Owner",
              "Babylon glTF importer"
            ],
            [
              "GUIDs",
              "node extras"
            ]
          ]
        },
        {
          "id": 6,
          "x": 260,
          "y": 300,
          "w": 140,
          "h": 40,
          "label": "level.scene.json",
          "sub": "what it can't",
          "desc": "Components, tags, physics, script bindings + exposed values, trigger events, constraints, audio, GUI/particle JSON refs, node material (NME) overrides, 3D GUI button/panel settings, per-light/camera and scene settings, the debug flag.",
          "meta": [
            [
              "Owner",
              "LevelLoader"
            ],
            [
              "Version",
              "4"
            ]
          ]
        },
        {
          "id": 7,
          "x": 480,
          "y": 260,
          "w": 150,
          "h": 40,
          "label": "LevelLoader.Load",
          "sub": "core/LevelLoader.ts",
          "desc": "Fetch+validate manifest, LoadAsset (inputActions + defaultInputMap), append glb RIGHT-HANDED, ApplyNodeVisibility, ApplyNodeMaterials (optional materials[]), GUID index, per-entity pass, second pass, FinalizeLevel.",
          "meta": [
            [
              "Passes",
              "2 + finalize"
            ],
            [
              "Matching",
              "GUID first, name fallback"
            ]
          ]
        },
        {
          "id": 8,
          "x": 700,
          "y": 40,
          "w": 140,
          "h": 40,
          "label": "Physics",
          "sub": "bodies + owned meshes",
          "desc": "COLLIDER/RIGIDBODY become one Havok V2 body per node. Multiple COLLIDER rows → PhysicsShapeContainer compound. bodyType STATIC/DYNAMIC/ANIMATED → PhysicsMotionType; DYNAMIC may set startAsleep. Auto-fit / convex-mesh / manual paths; the shared ownership rule (core/meshOwnership.ts) excludes child entities by GUID so colliders span only their own submeshes.",
          "meta": [
            [
              "File",
              "subsystems/physics/"
            ],
            [
              "Engine",
              "Havok V2"
            ]
          ]
        },
        {
          "id": 9,
          "x": 700,
          "y": 340,
          "w": 140,
          "h": 40,
          "label": "Constraints",
          "sub": "joints",
          "desc": "Fixed/Ball/Hinge/Slider/Spring/Custom 6DoF. Frame from live world transforms (pins as-placed pose); hinge/slider motors; CUSTOM = per-axis free/locked/limited/spring on one joint. Bodies Collide (collision, default off) → Havok isCollisionsEnabled for that body pair only.",
          "meta": [
            [
              "File",
              "subsystems/constraints.ts"
            ],
            [
              "Core",
              "Physics6DoFConstraint"
            ]
          ]
        },
        {
          "id": 10,
          "x": 700,
          "y": 400,
          "w": 140,
          "h": 40,
          "label": "Triggers",
          "sub": "messaging",
          "desc": "Authored On-Enter events: one plugin observable dispatches TRIGGER_ENTERED, tag filter, then target.SendMessage to behaviors' OnMessage(message, source).",
          "meta": [
            [
              "File",
              "subsystems/collisions.ts"
            ],
            [
              "Gotcha",
              "MESH triggers never fire"
            ]
          ]
        },
        {
          "id": 11,
          "x": 700,
          "y": 100,
          "w": 140,
          "h": 40,
          "label": "Cameras & Lights",
          "sub": "faithful + overrides",
          "desc": "glb creates them; we copy Blender properties on (parent-chain find). CAMERA component swaps in Universal/Arc/Follow/Geospatial built from the exported pose; FOLLOW/ARC targets resolve in the second pass.",
          "meta": [
            [
              "Files",
              "subsystems/cameras/ / lights.ts"
            ],
            [
              "Shadows",
              "shadows.ts per light"
            ]
          ]
        },
        {
          "id": 12,
          "x": 700,
          "y": 160,
          "w": 140,
          "h": 40,
          "label": "Audio",
          "sub": "engine v2",
          "desc": "AUDIO components become StaticSounds (spatial attach to the entity node). Autoplay waits for the browser's gesture unlock without blocking the load. entity.GetSound(stem).",
          "meta": [
            [
              "File",
              "subsystems/audio.ts"
            ],
            [
              "API",
              "CreateSoundAsync"
            ]
          ]
        },
        {
          "id": 13,
          "x": 700,
          "y": 460,
          "w": 140,
          "h": 40,
          "label": "Animation",
          "sub": "NLA clips",
          "desc": "Clips scoped to entities by node membership (no name reliance). Autoplay stops loader-auto groups first. Skinned characters: author on the ARMATURE (mesh node transform is ignored).",
          "meta": [
            [
              "File",
              "subsystems/animation.ts"
            ],
            [
              "Rule",
              "armature owns it"
            ]
          ]
        },
        {
          "id": 14,
          "x": 920,
          "y": 160,
          "w": 140,
          "h": 40,
          "label": "Level",
          "sub": "runtime container",
          "desc": "entities, ById/ByTag, activeCamera, constraints, shadowGenerators, debugEnabled. Begin attaches InputManager + runs OnStart; RunFrame drives InputManager.Process, OnUpdate, updaters, InputManager.EndFrame.",
          "meta": [
            [
              "File",
              "core/Level.ts"
            ],
            [
              "Debug",
              "C wireframes / I inspector"
            ]
          ]
        },
        {
          "id": 15,
          "x": 920,
          "y": 260,
          "w": 140,
          "h": 40,
          "label": "Behaviors",
          "sub": "your scripts",
          "desc": "InstantiateScripts + ApplyExposedVars during the entity pass; OnStart / OnUpdate / OnDestroy / OnMessage after Level.Begin. One default-export class per file (filename = registry key). @exposed fields edited per-object in Blender.",
          "meta": [
            [
              "Base",
              "scripting/Behavior.ts"
            ],
            [
              "Registry",
              "BehaviorRegistry"
            ]
          ]
        },
        {
          "id": 16,
          "x": 920,
          "y": 360,
          "w": 140,
          "h": 40,
          "label": "Input",
          "sub": "src/input/",
          "desc": "Unity Input System clone: Action Maps > Actions > Bindings. InputManager.LoadAsset runs at the start of Load (before the glb append) so @inputMap fields and behavior.input can be injected; Level.Begin enables maps and RunFrame drives Process/EndFrame.",
          "meta": [
            [
              "Module",
              "src/input/"
            ],
            [
              "Panel",
              "Input Actions"
            ]
          ]
        },
        {
          "id": 17,
          "x": 700,
          "y": 220,
          "w": 140,
          "h": 40,
          "label": "UI",
          "sub": "2D · particles · 3D",
          "desc": "GUI / PARTICLE / MSDF_TEXT queue async fetches during the entity pass (settled in FinalizeLevel); GUI3D_* registrations build panels and controls after constraints. entity.GetGui / GetParticles / GetControl3D.",
          "meta": [
            [
              "Files",
              "ui/ · subsystems/particles.ts"
            ],
            [
              "Diagram",
              "ui.html"
            ]
          ]
        },
        {
          "id": 18,
          "x": 700,
          "y": 280,
          "w": 140,
          "h": 40,
          "label": "Scene look",
          "sub": "env · fog · post",
          "desc": "FinalizeLevel: SetupShadows, ApplySceneSettings (clear/ambient, HDR env, fog), ApplyAtmosphere when enabled, then ApplyPostProcessing on the active camera after Level.Begin.",
          "meta": [
            [
              "Files",
              "loader/sceneSettings.ts · atmosphere.ts"
            ],
            [
              "Post",
              "subsystems/postprocess.ts"
            ]
          ]
        }
      ],
      "edges": [
        {
          "id": 100,
          "src": 1,
          "tgt": 2,
          "label": ""
        },
        {
          "id": 101,
          "src": 2,
          "tgt": 3,
          "label": "warnings"
        },
        {
          "id": 103,
          "src": 3,
          "tgt": 5,
          "label": "glTF"
        },
        {
          "id": 104,
          "src": 3,
          "tgt": 6,
          "label": "serialize"
        },
        {
          "id": 105,
          "src": 4,
          "tgt": 3,
          "label": "Ctrl+S"
        },
        {
          "id": 118,
          "src": 4,
          "tgt": 7,
          "label": "reload"
        },
        {
          "id": 106,
          "src": 5,
          "tgt": 7,
          "label": "appendSceneAsync"
        },
        {
          "id": 107,
          "src": 6,
          "tgt": 7,
          "label": "fetch"
        },
        {
          "id": 108,
          "src": 7,
          "tgt": 8,
          "label": "entity pass"
        },
        {
          "id": 109,
          "src": 7,
          "tgt": 9,
          "label": "finalize"
        },
        {
          "id": 110,
          "src": 7,
          "tgt": 10,
          "label": "finalize"
        },
        {
          "id": 111,
          "src": 7,
          "tgt": 11,
          "label": "entity pass"
        },
        {
          "id": 112,
          "src": 7,
          "tgt": 12,
          "label": "entity pass"
        },
        {
          "id": 119,
          "src": 7,
          "tgt": 17,
          "label": "entity pass"
        },
        {
          "id": 120,
          "src": 7,
          "tgt": 18,
          "label": "finalize"
        },
        {
          "id": 113,
          "src": 7,
          "tgt": 13,
          "label": "finalize"
        },
        {
          "id": 121,
          "src": 7,
          "tgt": 16,
          "label": "LoadAsset"
        },
        {
          "id": 122,
          "src": 7,
          "tgt": 15,
          "label": "entity pass"
        },
        {
          "id": 114,
          "src": 7,
          "tgt": 14,
          "label": "builds"
        },
        {
          "id": 115,
          "src": 14,
          "tgt": 15,
          "label": "OnStart"
        },
        {
          "id": 116,
          "src": 14,
          "tgt": 16,
          "label": "Process"
        },
        {
          "id": 117,
          "src": 10,
          "tgt": 15,
          "label": "OnMessage"
        }
      ]
    }
  },
  "architecture.html": {
    "navLabel": "Architecture",
    "diagram": {
      "title": "Babylon Level Kit — Architecture (two artifacts)",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 60,
          "w": 160,
          "h": 40,
          "label": "Blender authoring",
          "sub": "editor half",
          "desc": "Objects + components in the **Babylon Object** panel; scene-wide settings in **Babylon Scene**. Export / Live Link writes two artifacts beside sidecar media (audio/, gui/, env/, …).",
          "meta": [
            ["Add-on", "blender_addon/"],
            ["Prose", "01-ARCHITECTURE.html"]
          ]
        },
        {
          "id": 2,
          "x": 280,
          "y": 40,
          "w": 150,
          "h": 40,
          "label": "level.glb",
          "sub": "glTF expresses",
          "desc": "Meshes, transforms, hierarchy, materials, lights, cameras, animation clips. Multi-material objects → wrapper + child meshes. GUIDs in node extras (bjs_id).",
          "meta": [
            ["Consumer", "Babylon glTF importer"],
            ["Rule", "if glTF can do it, glb owns it"]
          ]
        },
        {
          "id": 3,
          "x": 280,
          "y": 140,
          "w": 150,
          "h": 40,
          "label": "level.scene.json",
          "sub": "manifest v4",
          "desc": "Components, tags, physics, scripts + @exposed values, triggers, constraints, audio, GUI/particle refs, per-light/camera + scene block (env, fog, atmosphere, post, inputActions), debug flag.",
          "meta": [
            ["Consumer", "LevelLoader"],
            ["Rule", "never duplicates glb geometry"]
          ]
        },
        {
          "id": 4,
          "x": 280,
          "y": 240,
          "w": 150,
          "h": 40,
          "label": "GUID (bjs_id)",
          "sub": "identity bridge",
          "desc": "Custom prop on addressable Blender objects → glTF extras → manifest entities[].id → loader BuildIdIndex (GUID first, name fallback). Multi-material submeshes have no GUID; parented child entities do.",
          "meta": [
            ["Key", "ID_KEY = bjs_id"],
            ["Files", "core/ids.py · nodeResolution.ts"]
          ]
        },
        {
          "id": 5,
          "x": 520,
          "y": 90,
          "w": 150,
          "h": 40,
          "label": "LevelLoader.Load",
          "sub": "@bjs/engine",
          "desc": "Fetch manifest → InputManager.LoadAsset → right-handed glb append → entity pass → second pass → FinalizeLevel. Each manifest-only feature routes to a subsystem under packages/engine/src/.",
          "meta": [
            ["Diagram", "load-pipeline.html"],
            ["Trace", "trace-load.html"]
          ]
        },
        {
          "id": 6,
          "x": 720,
          "y": 90,
          "w": 150,
          "h": 40,
          "label": "Level + Entity",
          "sub": "runtime container",
          "desc": "entities, ById/ByTag, behaviors, attachments registry, activeCamera, shadowGenerators, post, atmosphere. RunFrame drives input + OnUpdate.",
          "meta": [
            ["Files", "core/Level.ts · Entity.ts"],
            ["Diagram", "scripting.html"]
          ]
        },
        {
          "id": 7,
          "x": 40,
          "y": 200,
          "w": 160,
          "h": 40,
          "label": "Monorepo",
          "sub": "npm workspaces",
          "desc": "packages/engine = @bjs/engine (symlinked into apps/*). Blender add-on versions lockstep with engine package.json / blender_manifest.toml. Apps own behaviors/ + public/levels/.",
          "meta": [
            ["Template", "apps/playground"],
            ["Diagram", "workflow.html"]
          ]
        }
      ],
      "edges": [
        { "id": 100, "src": 1, "tgt": 2, "label": "glTF export" },
        { "id": 101, "src": 1, "tgt": 3, "label": "serialize" },
        { "id": 102, "src": 1, "tgt": 4, "label": "stamps GUIDs" },
        { "id": 103, "src": 2, "tgt": 4, "label": "extras" },
        { "id": 104, "src": 3, "tgt": 4, "label": "entities[].id" },
        { "id": 105, "src": 2, "tgt": 5, "label": "append" },
        { "id": 106, "src": 3, "tgt": 5, "label": "fetch" },
        { "id": 107, "src": 5, "tgt": 6, "label": "builds" },
        { "id": 108, "src": 7, "tgt": 5, "label": "apps import" }
      ]
    }
  },
  "blender-addon.html": {
    "navLabel": "Blender add-on",
    "diagram": {
      "title": "Babylon Level Kit — Blender add-on",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 40,
          "w": 150,
          "h": 40,
          "label": "Object UI",
          "sub": "ui/view3d_panels",
          "desc": "Viewport N-panel **Babylon Object**: component list with per-type fields, light/camera/animation child panels. Scene-wide settings live in the **Babylon Scene** N-panel — see Scene block and Input Actions nodes.",
          "meta": [
            [
              "Kind",
              "drawing only"
            ],
            [
              "Entry",
              "BJS_PT_components"
            ]
          ]
        },
        {
          "id": 2,
          "x": 40,
          "y": 160,
          "w": 150,
          "h": 40,
          "label": "Data model",
          "sub": "components/",
          "desc": "Component PropertyGroups in components/: BJSComponent (Tag/Collider/RigidBody/Script/Camera/Audio/Constraint/GUI/PARTICLE/MSDF_TEXT/GUI3D_*), exposed vars + list items, trigger/click events, light/shadow/animation settings. GUID assignment lives in core/ids.py (ID_KEY = bjs_id). Scene render settings in scene/settings.py (Scene.bjs_scene): clear/ambient, Default Environment, environment_intensity / environment_rotation_y (default env), Show Skybox, Skybox Ignores Fog, fog, Atmosphere (scene/atmosphere.py), freeze shadows.",
          "meta": [
            [
              "Identity",
              "bjs_id custom prop"
            ],
            [
              "Registered on",
              "Object / Scene"
            ]
          ]
        },
        {
          "id": 3,
          "x": 40,
          "y": 280,
          "w": 150,
          "h": 40,
          "label": "Operators",
          "sub": "operators/",
          "desc": "Component verbs (components.py), script pick + Sync (scripts.py), Validate + Export (export_ops.py). Input Actions operators live in input_actions/operators.py.",
          "meta": [
            [
              "Export op",
              "BJS_OT_export"
            ],
            [
              "Validate op",
              "BJS_OT_validate"
            ]
          ]
        },
        {
          "id": 4,
          "x": 280,
          "y": 40,
          "w": 150,
          "h": 40,
          "label": "Script parser",
          "sub": "core/script_parse.py",
          "desc": "Regex-parses @exposed(...) and @inputMap(\"…\") out of behavior .ts source. THE cross-language contract: decorators must stay literally lowercase.",
          "meta": [
            [
              "Trigger",
              "Open Script / Sync / Create Maps Used by Scripts"
            ],
            [
              "Reads",
              "apps/<app>/src/behaviors/*.ts"
            ]
          ]
        },
        {
          "id": 5,
          "x": 280,
          "y": 160,
          "w": 150,
          "h": 40,
          "label": "Validator",
          "sub": "export/validate.py",
          "desc": "Pre-export checks: missing scripts, dangling refs, MESH+DYNAMIC, mesh triggers, constraint ends without physics, skinned-mesh components, Rendering Group id outside 0–3, Custom Layer Mask out of 32-bit range, area lights, duplicate GUIDs, missing camera/audio, Input Actions (duplicate names, empty bindings, bad @inputMap refs, missing Scene Default map).",
          "meta": [
            [
              "Runs from",
              "Validate / Export / Live Link"
            ],
            [
              "Output",
              "report warnings"
            ]
          ]
        },
        {
          "id": 6,
          "x": 280,
          "y": 280,
          "w": 150,
          "h": 40,
          "label": "Exporter",
          "sub": "export/level.py",
          "desc": "export_level orchestrates the glb (Blender glTF, +Y-up, GUIDs in extras) and schema-v4 manifest. begin_asset_export + copy_asset (export/assets.py): sanitized names, re-export overwrites stable paths; _2 suffix only when two different sources collide in one pass. serialize_components dispatches the SERIALIZERS registry (component_serializers.py), which converts axes Blender→Babylon (x,y,z)→(x,z,−y). Force-includes referenced objects.",
          "meta": [
            [
              "Schema",
              "v4"
            ],
            [
              "Axis conv",
              "export/components.py"
            ]
          ]
        },
        {
          "id": 7,
          "x": 520,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "Scene block",
          "sub": "export/scene.py",
          "desc": "Clear/ambient color, environment (World texture on active World Output chain via scene/environment.py → env/ with Background/Mapping intensity+rotation — Mapping Z negated on export; or useDefault when Default Environment is enabled with intensity/rotationY from bjs_scene; createSkybox forced off when Atmosphere is on; skyboxIgnoreFog when skybox on), fog, atmosphere (export/atmosphere.py), post-processing (via export/post_processing.py — default pipeline, SSAO), inputActions + defaultInputMap. Scene data edited via scene/settings.py + scene/atmosphere.py + scene/post_processing.py (nested bjs_scene.post); inputActions serialized by input_actions/serialize.py (built-in Player asset when empty).",
          "meta": [
            [
              "Manifest key",
              "scene"
            ],
            [
              "Input",
              "input_actions/defaults.py when empty"
            ]
          ]
        },
        {
          "id": 8,
          "x": 520,
          "y": 300,
          "w": 150,
          "h": 40,
          "label": "Animation block",
          "sub": "export/animation.py",
          "desc": "Per-object NLA strip names + autoplay clip/loop/speed. nla_clip_names() also feeds the validator.",
          "meta": [
            [
              "Manifest key",
              "entities[].animation"
            ],
            [
              "Source",
              "NLA strips"
            ]
          ]
        },
        {
          "id": 9,
          "x": 520,
          "y": 80,
          "w": 150,
          "h": 40,
          "label": "Live Link",
          "sub": "export/live_link.py",
          "desc": "save_post handler: when the Scene checkbox is on, every Ctrl+S re-runs validate + export with the remembered path. Failures never break the save. Also owns the Debug Build scene property.",
          "meta": [
            [
              "Props",
              "bjs_live_link*, bjs_debug_build"
            ],
            [
              "No",
              "timers/sockets"
            ]
          ]
        },
        {
          "id": 10,
          "x": 760,
          "y": 160,
          "w": 150,
          "h": 40,
          "label": "level.glb",
          "sub": "artifact",
          "desc": "Geometry, transforms, hierarchy, materials, lights, cameras, animation clips. GUIDs ride in node extras.",
          "meta": [
            [
              "Consumer",
              "Babylon glTF importer"
            ]
          ]
        },
        {
          "id": 11,
          "x": 760,
          "y": 260,
          "w": 150,
          "h": 40,
          "label": "level.scene.json",
          "sub": "artifact",
          "desc": "Components, per-light/camera settings, scene block (incl. inputActions + defaultInputMap), animation blocks, debug flag.",
          "meta": [
            [
              "Consumer",
              "LevelLoader"
            ],
            [
              "Version",
              "4"
            ]
          ]
        },
        {
          "id": 12,
          "x": 760,
          "y": 360,
          "w": 150,
          "h": 40,
          "label": "Sidecar files",
          "sub": "artifact",
          "desc": "Media copied beside the export via copy_asset: audio/, gui/, env/, fonts/, post/, particles/ (patched particle JSON), materials/ (each NME source copied once; external texture overrides patch URLs and strip embeds; embedded-only slots stay in JSON + InputBlock values + GradientBlock colorSteps). Stable sanitized names; re-export overwrites.",
          "meta": [
            [
              "Copied by",
              "export/assets.copy_asset"
            ],
            [
              "Particles",
              "export/particles.py patches URLs"
            ]
          ]
        },
        {
          "id": 13,
          "x": 520,
          "y": 420,
          "w": 150,
          "h": 40,
          "label": "Collider preview",
          "sub": "viewport/collider_preview.py",
          "desc": "GPU wireframe of colliders drawn in the viewport when Show Preview is on, in Blender space — matches what export converts, so preview == runtime body.",
          "meta": [
            [
              "Draw",
              "SpaceView3D POST_VIEW"
            ]
          ]
        },
        {
          "id": 15,
          "x": 700,
          "y": 420,
          "w": 150,
          "h": 40,
          "label": "CoM preview",
          "sub": "viewport/cog_preview.py",
          "desc": "Amber cross + rings at rigid-body center of mass when Show Preview is on (any body type; export CoM is Dynamic only). Drawn without depth test so it stays visible inside the mesh; size scales with owned-mesh bounds. Auto-fit uses bounds center; manual uses cog_center in Blender space.",
          "meta": [
            [
              "Draw",
              "SpaceView3D POST_VIEW"
            ]
          ]
        },
        {
          "id": 14,
          "x": 40,
          "y": 400,
          "w": 150,
          "h": 40,
          "label": "Input Actions",
          "sub": "input_actions/",
          "desc": "Scene-level Input Actions asset: data model (properties.py), JSON serialize/apply (serialize.py), built-in defaults (defaults.py), operators (operators.py). Edited in the **Babylon Scene** N-panel via ui/input_panel.py (BJS_PT_input_map). First export seeds defaults when empty.",
          "meta": [
            [
              "Modules",
              "properties · serialize · operators"
            ],
            [
              "Panel",
              "Babylon Scene › Input Actions"
            ]
          ]
        }
      ],
      "edges": [
        {
          "id": 100,
          "src": 1,
          "tgt": 3,
          "label": "buttons"
        },
        {
          "id": 101,
          "src": 1,
          "tgt": 2,
          "label": "draws"
        },
        {
          "id": 102,
          "src": 3,
          "tgt": 2,
          "label": "edits"
        },
        {
          "id": 103,
          "src": 3,
          "tgt": 4,
          "label": "pick/Sync"
        },
        {
          "id": 104,
          "src": 4,
          "tgt": 2,
          "label": "fields"
        },
        {
          "id": 105,
          "src": 3,
          "tgt": 5,
          "label": "Validate"
        },
        {
          "id": 106,
          "src": 3,
          "tgt": 6,
          "label": "Export"
        },
        {
          "id": 107,
          "src": 5,
          "tgt": 6,
          "label": "warnings"
        },
        {
          "id": 108,
          "src": 6,
          "tgt": 7,
          "label": "scene block"
        },
        {
          "id": 109,
          "src": 6,
          "tgt": 8,
          "label": "animation"
        },
        {
          "id": 110,
          "src": 9,
          "tgt": 6,
          "label": "Ctrl+S"
        },
        {
          "id": 111,
          "src": 6,
          "tgt": 10,
          "label": "glTF"
        },
        {
          "id": 112,
          "src": 6,
          "tgt": 11,
          "label": "serialize"
        },
        {
          "id": 113,
          "src": 6,
          "tgt": 12,
          "label": "copy"
        },
        {
          "id": 114,
          "src": 2,
          "tgt": 13,
          "label": "collider"
        },
        {
          "id": 118,
          "src": 2,
          "tgt": 15,
          "label": "rigidbody CoM"
        },
        {
          "id": 115,
          "src": 4,
          "tgt": 14,
          "label": "@inputMap"
        },
        {
          "id": 116,
          "src": 3,
          "tgt": 14,
          "label": "seed/sync"
        },
        {
          "id": 117,
          "src": 14,
          "tgt": 7,
          "label": "values"
        }
      ]
    }
  },
  "load-pipeline.html": {
    "navLabel": "Load pipeline",
    "diagram": {
      "title": "Babylon Level Kit — Load pipeline",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "EnableHavokPhysics",
          "sub": "precondition",
          "desc": "Must run before Load — bodies are built during the entity pass. main.ts does this.",
          "meta": [
            [
              "File",
              "subsystems/physics/"
            ]
          ]
        },
        {
          "id": 2,
          "x": 230,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "Load(manifestUrl)",
          "sub": "core/LevelLoader.ts",
          "desc": "The orchestrator; stages live in core/loader/. Fetch manifest, then InputManager.LoadAsset, then right-handed glb append.",
          "meta": [
            [
              "Returns",
              "Level"
            ]
          ]
        },
        {
          "id": 3,
          "x": 420,
          "y": 60,
          "w": 150,
          "h": 40,
          "label": "FetchAndValidateManifest",
          "sub": "step 1",
          "desc": "Clear errors for the classic failures: HTTP 404, and the dev server returning index.html (HTML, not JSON). ValidateManifest then checks schema version (must equal SUPPORTED_SCHEMA_VERSION), the glb path, and per-entity id/name/components shape — malformed manifests fail fast with the problem named.",
          "meta": [
            [
              "Output",
              "LevelManifest"
            ]
          ]
        },
        {
          "id": 4,
          "x": 420,
          "y": 180,
          "w": 150,
          "h": 40,
          "label": "appendSceneAsync",
          "sub": "step 3 — RIGHT-HANDED",
          "desc": "useRightHandedSystem=true is set FIRST so the loader skips the __root__ handedness mirror that broke Havok collider placement. NeutralizeGltfRoot stays as a guard; ApplyNodeVisibility reads bjs_visible from extras; SetupShadows (finalize) skips bjs_cast_shadows meshes as casters; ApplyNodeMaterials replaces glTF PBR when manifest.materials[] is set. Needs the ExtrasAsMetadata import for GUIDs.",
          "meta": [
            [
              "Why",
              "see physics page"
            ],
            [
              "Guard",
              "negative determinant warn"
            ]
          ]
        },
        {
          "id": 5,
          "x": 420,
          "y": 260,
          "w": 150,
          "h": 40,
          "label": "BuildIdIndex",
          "sub": "step 4",
          "desc": "Walk transform nodes + meshes; map metadata.gltf.extras.bjs_id → node.",
          "meta": [
            [
              "Match",
              "GUID first, name fallback"
            ]
          ]
        },
        {
          "id": 6,
          "x": 420,
          "y": 340,
          "w": 150,
          "h": 40,
          "label": "ProcessEntity (loop)",
          "sub": "step 5",
          "desc": "Per manifest entity: resolve node, create Entity, back-ref node.metadata.bjsEntity, then ApplyEntityComponents + light/camera processing.",
          "meta": [
            [
              "Light",
              "ProcessLightForEntity"
            ],
            [
              "Camera",
              "ProcessCameraForEntity"
            ]
          ]
        },
        {
          "id": 7,
          "x": 640,
          "y": 240,
          "w": 150,
          "h": 40,
          "label": "ApplyEntityComponents",
          "sub": "per entity",
          "desc": "The component registry (loader/componentRegistry.ts): one handler per component type, run in table order. Physics handler collects all COLLIDER rows → HideEntityNode when any collider has makeInvisible → BuildPhysics (compound PhysicsShapeContainer when multiple) → RegisterAttachment per TAG/COLLIDER/RIGIDBODY/SCRIPT → queue trigger registrations (merged per entity) → queue async audio/GUI/particle/MSDF text tasks → queue GUI3D registrations (parent GUID for panel nesting) → script handler (loader/scripts.ts) runs InstantiateScripts (inject entity/scene, ApplyExposedVars) + InjectInputMaps (@inputMap fields + behavior.input fallback; entity refs become PendingRefs).",
          "meta": [
            [
              "Registry",
              "COMPONENT_HANDLERS"
            ]
          ]
        },
        {
          "id": 8,
          "x": 640,
          "y": 340,
          "w": 150,
          "h": 40,
          "label": "QueueCameraTargets",
          "sub": "per entity",
          "desc": "Typed-camera target bindings (FOLLOW / ARC / OFFSET) queued for the post-pass.",
          "meta": [
            [
              "From",
              "BuildTypedCamera result"
            ]
          ]
        },
        {
          "id": 9,
          "x": 640,
          "y": 140,
          "w": 150,
          "h": 40,
          "label": "Second pass",
          "sub": "step 6",
          "desc": "ResolveObjectReferences: entity-typed @exposed fields + list slots get real Entities. ResolveCameraTargets: lockedTarget / re-pivot / offset updater.",
          "meta": [
            [
              "Why two passes",
              "targets may not exist yet"
            ]
          ]
        },
        {
          "id": 10,
          "x": 860,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "FinalizeLevel",
          "sub": "step 7",
          "desc": "ClusterPunctualLightsIfNeeded (when over light budget) → SetupShadows → ApplySceneSettings (clear/ambient, env, fog) → BuildNodeMaterials (single NME compile after IBL) → ApplyAtmosphere (when scene.atmosphere set; SUN → @babylonjs/addons/atmosphere → level.atmosphere) → ApplyAutoPlayAnimations → settle audio/GUI/particle/MSDF promises (allSettled) → WireParticleEmitterTracking + WireMsdfTextRendering → WireCollisionEvents → BuildConstraints → BuildGui3DControls → BuildReflectionProbes + AssignProbeMaterials → ApplyRenderLayers (RENDERING_GROUP / LAYER_MASK on owned meshes) → Level.Begin (OnStart, runtime cameras) → ApplyPostProcessing (DefaultRenderingPipeline + SSAO2 on active camera) → debugColliders (gated by Debug Build).",
          "meta": [
            [
              "Order matters",
              "constraints need bodies"
            ]
          ]
        },
        {
          "id": 11,
          "x": 1080,
          "y": 140,
          "w": 150,
          "h": 40,
          "label": "Level.Begin",
          "sub": "core/Level.ts",
          "desc": "Attach Input, run every behavior's OnStart, subscribe RunFrame to onBeforeRender.",
          "meta": [
            [
              "Errors",
              "caught per behavior"
            ]
          ]
        },
        {
          "id": 12,
          "x": 1080,
          "y": 260,
          "w": 150,
          "h": 40,
          "label": "RunFrame",
          "sub": "every frame",
          "desc": "InputManager.Process first (actions evaluate, callbacks fire) → all OnUpdate(deltaSeconds) → registered updaters (offset cams) → InputManager.EndFrame last so device edges last one full frame.",
          "meta": [
            [
              "Dispose",
              "detach input, dispose sounds/constraints, OnDestroy"
            ]
          ]
        },
        {
          "id": 13,
          "x": 420,
          "y": 100,
          "w": 150,
          "h": 40,
          "label": "InputManager.LoadAsset",
          "sub": "step 2",
          "desc": "Load scene.inputActions (built-in Player asset when the panel was empty) and scene.defaultInputMap so @inputMap fields and behavior.input can be injected before InstantiateScripts.",
          "meta": [
            [
              "File",
              "src/input/InputManager.ts"
            ]
          ]
        }
      ],
      "edges": [
        {
          "id": 100,
          "src": 1,
          "tgt": 2,
          "label": "before"
        },
        {
          "id": 101,
          "src": 2,
          "tgt": 3,
          "label": "step 1"
        },
        {
          "id": 115,
          "src": 3,
          "tgt": 13,
          "label": "step 2"
        },
        {
          "id": 116,
          "src": 13,
          "tgt": 4,
          "label": "step 3"
        },
        {
          "id": 117,
          "src": 4,
          "tgt": 5,
          "label": "step 4"
        },
        {
          "id": 118,
          "src": 5,
          "tgt": 6,
          "label": "step 5"
        },
        {
          "id": 105,
          "src": 6,
          "tgt": 7,
          "label": ""
        },
        {
          "id": 106,
          "src": 6,
          "tgt": 8,
          "label": ""
        },
        {
          "id": 107,
          "src": 6,
          "tgt": 9,
          "label": "after loop"
        },
        {
          "id": 108,
          "src": 9,
          "tgt": 10,
          "label": "step 7"
        },
        {
          "id": 109,
          "src": 10,
          "tgt": 11,
          "label": ""
        },
        {
          "id": 110,
          "src": 11,
          "tgt": 12,
          "label": "each render"
        }
      ]
    }
  },
  "runtime-loop.html": {
    "navLabel": "Runtime loop",
    "diagram": {
      "title": "Babylon Level Kit — Runtime loop (one frame)",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 200,
          "w": 160,
          "h": 40,
          "label": "runRenderLoop",
          "sub": "apps/.../main.ts",
          "desc": "App responsibility — requestAnimationFrame tick calls scene.render() each frame. The kit never starts this loop.",
          "meta": [
            ["After", "LevelLoader.Load + level.Begin"],
            ["Trace", "trace-runtime-loop.html"]
          ]
        },
        {
          "id": 2,
          "x": 240,
          "y": 200,
          "w": 160,
          "h": 40,
          "label": "scene.render()",
          "sub": "Babylon.js",
          "desc": "One frame: observables → physics step → GPU draw → after-render callbacks.",
          "meta": [
            ["Prose", "02-RUNTIME-BASICS.html"]
          ]
        },
        {
          "id": 3,
          "x": 440,
          "y": 80,
          "w": 160,
          "h": 40,
          "label": "onBeforeRender (first)",
          "sub": "particles.ts",
          "desc": "WireParticleEmitterTracking — insertFirst=true so empty-node emitters copy entity world position before RunFrame.",
          "meta": [
            ["File", "subsystems/particles.ts"]
          ]
        },
        {
          "id": 4,
          "x": 440,
          "y": 200,
          "w": 160,
          "h": 40,
          "label": "Level.RunFrame",
          "sub": "core/Level.ts",
          "desc": "onBeforeRenderObservable — InputManager.Process → all behavior.OnUpdate(deltaSeconds) → AddUpdater callbacks → InputManager.EndFrame.",
          "meta": [
            ["deltaSeconds", "getDeltaTime()/1000"],
            ["Trace", "trace-lifecycle.html"]
          ]
        },
        {
          "id": 5,
          "x": 640,
          "y": 200,
          "w": 160,
          "h": 40,
          "label": "Havok step",
          "sub": "inside scene.render",
          "desc": "Physics integrates after beforeRender callbacks — OnUpdate sees the previous step's state.",
          "meta": [
            ["Prose", "06-PHYSICS.html#physics-vs-onupdate"]
          ]
        },
        {
          "id": 6,
          "x": 840,
          "y": 200,
          "w": 160,
          "h": 40,
          "label": "GPU draw",
          "sub": "meshes · shadows · post",
          "desc": "Main render pass — meshes, lights, shadow maps, post-processing on activeCamera.",
          "meta": [
            ["Setup", "FinalizeLevel + ApplyPostProcessing"]
          ]
        },
        {
          "id": 7,
          "x": 640,
          "y": 320,
          "w": 160,
          "h": 40,
          "label": "onAfterRender",
          "sub": "ui/msdfText.ts",
          "desc": "WireMsdfTextRendering — MSDF text draw pass after the main scene render.",
          "meta": [
            ["Trace", "trace-msdfText.html"]
          ]
        }
      ],
      "edges": [
        { "id": 100, "src": 1, "tgt": 2, "label": "each frame" },
        { "id": 101, "src": 2, "tgt": 3, "label": "beforeRender" },
        { "id": 102, "src": 3, "tgt": 4, "label": "then" },
        { "id": 103, "src": 4, "tgt": 5, "label": "then" },
        { "id": 104, "src": 5, "tgt": 6, "label": "then" },
        { "id": 105, "src": 6, "tgt": 7, "label": "afterRender" }
      ]
    }
  },
  "scripting.html": {
    "navLabel": "Scripting",
    "diagram": {
      "title": "Babylon Level Kit — Scripting",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 60,
          "w": 150,
          "h": 40,
          "label": "behaviors/ folder",
          "sub": "one class per file",
          "desc": "THE contract: file named after the class, export default. The filename stem is the registry key Blender stores.",
          "meta": [
            [
              "Where",
              "apps/<app>/src/behaviors"
            ]
          ]
        },
        {
          "id": 2,
          "x": 40,
          "y": 180,
          "w": 150,
          "h": 40,
          "label": "AutoRegisterBehaviors",
          "sub": "main.ts wiring",
          "desc": "import.meta.glob('./behaviors/*') eagerly loads every file; each registers by stem in the BehaviorRegistry.",
          "meta": [
            [
              "File",
              "scripting/BehaviorRegistry.ts"
            ]
          ]
        },
        {
          "id": 3,
          "x": 40,
          "y": 300,
          "w": 150,
          "h": 40,
          "label": "BehaviorRegistry",
          "sub": "name → class",
          "desc": "Maps a SCRIPT component's name to a Behavior class. Registers BEHAVIORS, not components — TAG/COLLIDER/etc. are applied directly by the loader.",
          "meta": [
            [
              "Create",
              "warns on unknown name"
            ]
          ]
        },
        {
          "id": 4,
          "x": 280,
          "y": 120,
          "w": 150,
          "h": 40,
          "label": "Behavior",
          "sub": "scripting/Behavior.ts",
          "desc": "Lifecycle: OnStart (after refs resolve) / OnUpdate(deltaSeconds) / OnDestroy / OnMessage(message, source). Injected: entity, scene; node getter. PascalCase — a lowercase onStart silently never runs.",
          "meta": [
            [
              "Order",
              "cross-entity OnStart unspecified"
            ]
          ]
        },
        {
          "id": 5,
          "x": 280,
          "y": 240,
          "w": 150,
          "h": 40,
          "label": "@exposed",
          "sub": "scripting/exposed.ts",
          "desc": "Decorator records field name + UI hints (WeakMap). Blender regex-parses the source (core/script_parse.py) → single-line literal defaults only; entity fields need type:'entity'; lists start []. Stays lowercase: cross-language contract.",
          "meta": [
            [
              "Types",
              "float int bool string vector3 color entity enum list"
            ]
          ]
        },
        {
          "id": 6,
          "x": 280,
          "y": 360,
          "w": 150,
          "h": 40,
          "label": "ApplyExposedVars",
          "sub": "before OnStart",
          "desc": "Writes the manifest's stored values onto the instance. vector3/color arrays coerced; entity refs deferred as PendingRefs; entity lists pre-sized with nulls.",
          "meta": [
            [
              "Second pass",
              "ResolveObjectReferences"
            ]
          ]
        },
        {
          "id": 7,
          "x": 520,
          "y": 180,
          "w": 150,
          "h": 40,
          "label": "Entity",
          "sub": "core/Entity.ts",
          "desc": "id/name/node/tag, attachments (live component registry), behaviors, body?, animations, sounds. GetAttachment / GetBehavior / GetAnimation / GetSound (exact then contains), SendMessage → every behavior's OnMessage.",
          "meta": [
            [
              "Back-ref",
              "node.metadata.bjsEntity"
            ]
          ]
        },
        {
          "id": 8,
          "x": 520,
          "y": 320,
          "w": 150,
          "h": 40,
          "label": "Input",
          "sub": "src/input/",
          "desc": "Unity-style: InputManager owns an asset of Action Maps > Actions > Bindings. @inputMap(\"Player\") injects a map handle; actions poll (ReadValue/ReadVector2/IsPressed/WasPressedThisFrame) and fire started/performed/canceled.",
          "meta": [
            [
              "Defaults",
              "Player map · Move Look Jump Interact Sprint Crouch"
            ]
          ]
        },
        {
          "id": 9,
          "x": 760,
          "y": 250,
          "w": 150,
          "h": 40,
          "label": "Level",
          "sub": "runs them",
          "desc": "Begin → OnStart for all; RunFrame → InputManager.Process, OnUpdate for all, then updaters, then InputManager.EndFrame; Dispose → OnDestroy + teardown.",
          "meta": [
            [
              "File",
              "core/Level.ts"
            ]
          ]
        },
        {
          "id": 10,
          "x": 520,
          "y": 360,
          "w": 150,
          "h": 40,
          "label": "ResolveObjectReferences",
          "sub": "second pass",
          "desc": "After every entity exists: each PendingRef GUID resolves via level.ById and the real Entity is assigned (or placed into its list slot). Runs before Level.Begin.",
          "meta": [
            [
              "File",
              "loader/entityBuilder.ts"
            ]
          ]
        }
      ],
      "edges": [
        {
          "id": 100,
          "src": 1,
          "tgt": 2,
          "label": "glob"
        },
        {
          "id": 101,
          "src": 2,
          "tgt": 3,
          "label": "by stem"
        },
        {
          "id": 102,
          "src": 3,
          "tgt": 4,
          "label": "Create()"
        },
        {
          "id": 103,
          "src": 4,
          "tgt": 5,
          "label": "fields"
        },
        {
          "id": 104,
          "src": 5,
          "tgt": 6,
          "label": "values"
        },
        {
          "id": 105,
          "src": 6,
          "tgt": 10,
          "label": "defers refs"
        },
        {
          "id": 111,
          "src": 10,
          "tgt": 7,
          "label": "assigns"
        },
        {
          "id": 106,
          "src": 4,
          "tgt": 7,
          "label": "this.entity"
        },
        {
          "id": 107,
          "src": 4,
          "tgt": 8,
          "label": "reads"
        },
        {
          "id": 112,
          "src": 5,
          "tgt": 8,
          "label": "@inputMap"
        },
        {
          "id": 108,
          "src": 9,
          "tgt": 4,
          "label": "lifecycle"
        },
        {
          "id": 109,
          "src": 9,
          "tgt": 8,
          "label": "Process"
        }
      ]
    }
  },
  "input.html": {
    "navLabel": "Input",
    "diagram": {
      "title": "Babylon Level Kit — Input",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 80,
          "w": 150,
          "h": 40,
          "label": "Input Actions panel",
          "sub": "Blender Scene N-panel",
          "desc": "Scene-level asset: Action Maps > Actions > Bindings + Scene Default map picker. Edited via input_actions/ (properties, serialize, operators) and ui/input_panel.py. First export seeds built-in Player when empty.",
          "meta": [
            ["Package", "input_actions/"],
            ["Panel", "Babylon Scene › Input Actions"]
          ]
        },
        {
          "id": 2,
          "x": 280,
          "y": 80,
          "w": 150,
          "h": 40,
          "label": "serialize_input_asset",
          "sub": "export/scene.py",
          "desc": "Writes scene.inputActions + scene.defaultInputMap into the manifest scene block alongside env, fog, atmosphere, and post.",
          "meta": [
            ["File", "input_actions/serialize.py"]
          ]
        },
        {
          "id": 3,
          "x": 520,
          "y": 40,
          "w": 150,
          "h": 40,
          "label": "InputManager.LoadAsset",
          "sub": "step 2 of Load",
          "desc": "Runs before glb append and InstantiateScripts so maps exist when @inputMap fields and behavior.input are injected.",
          "meta": [
            ["File", "src/input/InputManager.ts"]
          ]
        },
        {
          "id": 4,
          "x": 520,
          "y": 160,
          "w": 150,
          "h": 40,
          "label": "InjectInputMaps",
          "sub": "entity pass",
          "desc": "@inputMap(\"Name\") on a field → that map; @inputMap() / empty → scene default; no @inputMap fields → behavior.input receives the scene default.",
          "meta": [
            ["File", "core/loader/scripts.ts"]
          ]
        },
        {
          "id": 5,
          "x": 760,
          "y": 100,
          "w": 150,
          "h": 40,
          "label": "Level.Begin",
          "sub": "attach + enable",
          "desc": "InputManager.Attach: keyboard observable + enable every action map before OnStart runs.",
          "meta": [
            ["File", "core/Level.ts"]
          ]
        },
        {
          "id": 6,
          "x": 760,
          "y": 220,
          "w": 150,
          "h": 40,
          "label": "RunFrame loop",
          "sub": "every frame",
          "desc": "InputManager.Process FIRST (gamepad poll, actions evaluate, callbacks) → OnUpdate for behaviors → updaters → InputManager.EndFrame LAST so WasPressedThisFrame edges last one frame.",
          "meta": [
            ["Polling", "ReadValue / IsPressed / WasPressedThisFrame"]
          ]
        },
        {
          "id": 7,
          "x": 280,
          "y": 220,
          "w": 150,
          "h": 40,
          "label": "@inputMap in behaviors",
          "sub": "script_parse.py",
          "desc": "Blender regex-parses @inputMap(\"…\") from behavior .ts — lowercase literal token like @exposed. Create Maps Used by Scripts operator can seed maps from scripts.",
          "meta": [
            ["See", "12-INPUT.html prose"]
          ]
        }
      ],
      "edges": [
        { "id": 100, "src": 1, "tgt": 2, "label": "export" },
        { "id": 101, "src": 2, "tgt": 3, "label": "manifest" },
        { "id": 102, "src": 3, "tgt": 4, "label": "before scripts" },
        { "id": 103, "src": 7, "tgt": 1, "label": "authoring" },
        { "id": 104, "src": 4, "tgt": 5, "label": "before Begin" },
        { "id": 105, "src": 5, "tgt": 6, "label": "each render" }
      ]
    }
  },
  "physics.html": {
    "navLabel": "Physics",
    "diagram": {
      "title": "Babylon Level Kit — Physics",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "BuildPhysics",
          "sub": "dispatch",
          "desc": "One or more COLLIDER components and/or RIGIDBODY → one node-attached PhysicsBody. Multiple colliders → PhysicsShapeContainer compound (BuildCompoundBody). Single collider: collider-only=static/trigger; body-only=dynamic+auto box; both=shape from collider, dynamics from body. bodyType ANIMATED→PhysicsMotionType.ANIMATED; startAsleep on DYNAMIC.",
          "meta": [
            [
              "File",
              "subsystems/physics/"
            ],
            [
              "Input struct",
              "BuildBodyInput"
            ]
          ]
        },
        {
          "id": 2,
          "x": 280,
          "y": 60,
          "w": 150,
          "h": 40,
          "label": "OwnedColliderMeshes",
          "sub": "the ownership rule",
          "desc": "Includes a descendant mesh only if no node on its path up carries bjs_id — so a collider spans its own multi-material submeshes (_primitiveN, no GUID) but never a parented child entity's geometry. The rule lives in core/meshOwnership.ts, shared with reflection probes; all physics paths route through it.",
          "meta": [
            [
              "Fixed in",
              "v0.29.1"
            ],
            [
              "Shared rule",
              "core/meshOwnership.ts"
            ]
          ]
        },
        {
          "id": 3,
          "x": 280,
          "y": 160,
          "w": 150,
          "h": 40,
          "label": "Auto-fit path",
          "sub": "BuildAutoFitBody",
          "desc": "Real mesh → PhysicsAggregate sizes the primitive. Multi-material wrapper (TransformNode) → FitColliderShape fits box/sphere/capsule/cylinder to ComputeLocalBounds (aggregate would crash on a non-mesh node).",
          "meta": [
            [
              "Default",
              "when autoFit or no collider"
            ]
          ]
        },
        {
          "id": 4,
          "x": 280,
          "y": 260,
          "w": 150,
          "h": 40,
          "label": "Convex/Mesh path",
          "sub": "BuildGeometryShapeBody",
          "desc": "Real hull / triangle shapes. Wrapper submeshes are cloned, baked into the wrapper frame, merged (MergeChildrenIntoLocalMesh), fed to the shape, disposed. Box fallback on failure. MESH can't be DYNAMIC (validator warns).",
          "meta": [
            [
              "Moving bodies",
              "use CONVEX"
            ]
          ]
        },
        {
          "id": 5,
          "x": 280,
          "y": 360,
          "w": 150,
          "h": 40,
          "label": "Manual path",
          "sub": "BuildManualShape",
          "desc": "Hand-authored center/size/radius/height/rotation, already Babylon-space (converted at export; viewport preview matches). No mesh sampling — uses authored dimensions only.",
          "meta": [
            [
              "Rotation",
              "box/capsule/cylinder"
            ]
          ]
        },
        {
          "id": 6,
          "x": 40,
          "y": 380,
          "w": 150,
          "h": 40,
          "label": "Right-handed import",
          "sub": "why it all works",
          "desc": "Babylon's default LH glTF path adds a mirrored __root__; Havok decomposes world matrices and a reflection looks like a 180° rotation → mis-oriented colliders. useRightHandedSystem=true before append removes the mirror entirely.",
          "meta": [
            [
              "Where",
              "before appendSceneAsync"
            ],
            [
              "Guard",
              "NeutralizeGltfRoot"
            ]
          ]
        },
        {
          "id": 10,
          "x": 40,
          "y": 60,
          "w": 150,
          "h": 40,
          "label": "EnableHavokPhysics",
          "sub": "precondition",
          "desc": "Must run before Load — BuildPhysics warns if the Havok plugin is missing. main.ts calls this once at startup.",
          "meta": [
            [
              "File",
              "subsystems/physics/"
            ]
          ]
        },
        {
          "id": 7,
          "x": 560,
          "y": 120,
          "w": 150,
          "h": 40,
          "label": "Constraints",
          "sub": "subsystems/constraints.ts",
          "desc": "CONSTRAINT components → joints in FinalizeLevel (both bodies exist). FIXED→Lock, BALL→BallAndSocket, HINGE/SLIDER/SPRING/CUSTOM→6DoF (frame X = authored axis). collision (Bodies Collide) → isCollisionsEnabled on every joint type. CUSTOM: manifest axes[] → BuildCustomAxisLimits (free/locked/limited/spring per DOF).",
          "meta": [
            [
              "Frame",
              "ComputeConstraintFrame: live world transforms — pins as-placed pose"
            ],
            [
              "Motors",
              "VELOCITY + target + max force"
            ]
          ]
        },
        {
          "id": 8,
          "x": 560,
          "y": 260,
          "w": 150,
          "h": 40,
          "label": "Triggers",
          "sub": "subsystems/collisions.ts",
          "desc": "Authored On-Enter events: one onTriggerCollisionObservable; TRIGGER_ENTERED → trigger body→registration, entering body→metadata.bjsEntity, tag gate → target.SendMessage.",
          "meta": [
            [
              "Gotcha",
              "MESH triggers never fire"
            ],
            [
              "Cleanup",
              "level.collisionEventHandles removed on dispose"
            ]
          ]
        },
        {
          "id": 9,
          "x": 800,
          "y": 190,
          "w": 150,
          "h": 40,
          "label": "Behaviors",
          "sub": "consume it",
          "desc": "entity.body / GetAttachment(\"COLLIDER\") for impulses/velocity; OnMessage receives trigger messages; level.constraints for tuning; ShowColliders / C key for debug wireframes.",
          "meta": [
            [
              "See",
              "scripting.html"
            ]
          ]
        }
      ],
      "edges": [
        {
          "id": 100,
          "src": 1,
          "tgt": 3,
          "label": ""
        },
        {
          "id": 101,
          "src": 1,
          "tgt": 4,
          "label": ""
        },
        {
          "id": 102,
          "src": 1,
          "tgt": 5,
          "label": ""
        },
        {
          "id": 103,
          "src": 3,
          "tgt": 2,
          "label": "geometry via"
        },
        {
          "id": 104,
          "src": 4,
          "tgt": 2,
          "label": "geometry via"
        },
        {
          "id": 105,
          "src": 6,
          "tgt": 1,
          "label": "RH import"
        },
        {
          "id": 109,
          "src": 10,
          "tgt": 1,
          "label": "precondition"
        },
        {
          "id": 106,
          "src": 7,
          "tgt": 9,
          "label": "level.constraints"
        },
        {
          "id": 107,
          "src": 8,
          "tgt": 9,
          "label": "OnMessage"
        },
        {
          "id": 108,
          "src": 1,
          "tgt": 9,
          "label": "entity.body"
        }
      ]
    }
  },
  "rendering.html": {
    "navLabel": "Rendering",
    "diagram": {
      "title": "Babylon Level Kit — Rendering",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 80,
          "w": 150,
          "h": 40,
          "label": "Lights",
          "sub": "subsystems/lights.ts",
          "desc": "Automatic (no component). glb creates+places; ApplyBlenderLight copies color and intensity 1:1 (manifest energy → light.intensity), spot cone. SUN bakes world aim (BakeSunLightWorldTransform) and detaches — empty position ignored for shadows. SUN exports sunAngle; shadow pass maps it to PCSS penumbra (0–45° → 0–1). FindLightForNode walks the parent chain (orientation-correction node in between). Atmosphere may override sun intensity to π. Large rigs: see Punctual light budget.",
          "meta": [
            [
              "AREA",
              "unsupported by glTF"
            ],
            [
              "No fallback light",
              "add a lamp"
            ]
          ]
        },
        {
          "id": 2,
          "x": 40,
          "y": 220,
          "w": 150,
          "h": 40,
          "label": "Cameras",
          "sub": "subsystems/cameras/",
          "desc": "Mirrors lights: faithful glb FreeCamera + ApplyBlenderCamera (clip, FOV/ortho); exporter flags the active one → scene.activeCamera. Without a CAMERA component override, the exported camera is used directly.",
          "meta": [
            [
              "Fallback",
              "main.ts ArcRotate only if none shipped"
            ]
          ]
        },
        {
          "id": 3,
          "x": 300,
          "y": 220,
          "w": 150,
          "h": 40,
          "label": "BuildTypedCamera",
          "sub": "CAMERA component",
          "desc": "Opt-in type override built FROM the faithful camera's world pose, lens copied, original disposed. Per-type builders: Universal / Arc (re-pivot to target; trackTarget updater; orbit/zoom/pan speeds) / Follow-Orbit (DeriveFollowFromPosition) / Follow-Offset (AddUpdater holds world offset) / Geospatial (planet at origin; DeriveGeospatialPose seeds center/yaw/pitch/radius; orbit/zoom/pan speeds). Free-fly cameras honor a Keep Upright toggle (lockRoll): LockCameraRoll bakes the world pose, detaches the orientation-correction parent, and pins look-at to world up so yaw/pitch stay level.",
          "meta": [
            [
              "Targets",
              "resolve in second pass"
            ],
            [
              "Keep Upright",
              "lockRoll → world-axis rotation"
            ]
          ]
        },
        {
          "id": 4,
          "x": 40,
          "y": 360,
          "w": 150,
          "h": 40,
          "label": "Shadows",
          "sub": "subsystems/shadows.ts",
          "desc": "FinalizeLevel (SetupShadows): one ShadowGenerator per casting lamp; all meshes receive; casters respect bjs_cast_shadows (ray-visibility Shadow off → receive-only) and outlier-size heuristics. Directional suns: AnchorDirectionalShadowOrigin on caster bounds + autoCalcShadowZBounds when clip planes are auto. Per-light filter, bias, normalBias, darkness, mapSize, frustum tuning. SUN sunAngle → PCSS contactHardeningLightSizeUVRatio (0–45° → 0–1). Static-world freeze (scene flag / freezeShadows) bakes maps once; level.RefreshShadows() re-arms.",
          "meta": [
            [
              "Options",
              "{ shadows?, shadowMapSize?, freezeShadows?, cleanBoneMatrixWeights? }"
            ],
            [
              "Exposed",
              "level.shadowGenerators"
            ]
          ]
        },
        {
          "id": 5,
          "x": 300,
          "y": 80,
          "w": 150,
          "h": 40,
          "label": "Scene look",
          "sub": "environment / fog / atmosphere / postprocess",
          "desc": "await ApplySceneSettings in FinalizeLevel: clear/ambient, async ApplyEnvironment (useDefault → Babylon CDN studio .env; file-based .env/.hdr/equirect → createDefaultSkybox with same texture as IBL; ResolveEnvironmentRotation +π/2 for panorama sources; ApplyEnvironmentRotation on texture not mesh; Mapping Z exported as -rotationY; waits for texture before skybox; ComputeSkyboxSize max(1000, diagonal×3); infiniteDistance + ignoreCameraMaxZ; EnvironmentHelper skybox unparented without double rotation; createSkybox off when atmosphere on; skyboxIgnoreFog → mesh.applyFog = false; .exr impossible), fog LINEAR/EXP/EXP2. ApplyAtmosphere after scene settings when manifest has scene.atmosphere (@babylonjs/addons/atmosphere; SUN lamp; PBR π intensity; LUTs or ray marching; isLinearSpaceComposition from HDR post flag) → level.atmosphere. ApplyPostProcessing after Begin: DefaultRenderingPipeline (MSAA, FXAA, bloom, sharpen, DOF, chromatic aberration, grain, glow, image processing with tone mapping type / exposure / contrast / vignette / color grading / color curves) + SSAO2 → level.post. RetargetPostProcessing if the active camera changes at runtime.",
          "meta": [
            [
              "Attach",
              "active camera after Begin"
            ],
            [
              "Blender",
              "Babylon Scene › Post-Processing"
            ]
          ]
        },
        {
          "id": 6,
          "x": 560,
          "y": 180,
          "w": 150,
          "h": 40,
          "label": "Level",
          "sub": "holds the handles",
          "desc": "activeCamera, shadowGenerators, punctualLightingMode, clusteredLights, post, atmosphere — all reachable from gameplay code for further tuning.",
          "meta": [
            [
              "See",
              "load-pipeline.html"
            ]
          ]
        },
        {
          "id": 7,
          "x": 300,
          "y": 360,
          "w": 150,
          "h": 40,
          "label": "Node materials",
          "sub": "subsystems/materials/",
          "desc": "Optional manifest.materials[]: ApplyNodeMaterials parses NME JSON and binds manifest overrides (no build); BuildNodeMaterials in FinalizeLevel compiles once after environment IBL. Cache per file+name; embedded data: / base64String or urlRewriter paths; textures[] override embeds; inputs[] and gradients[] patch InputBlock values and GradientBlock colorSteps; editorData.map for blockId. NME IBL needs ReflectionBlock on PBR reflection input.",
          "meta": [
            [
              "Editor",
              "nme.babylonjs.com"
            ],
            [
              "Blender",
              "Properties › Material › Babylon"
            ]
          ]
        },
        {
          "id": 8,
          "x": 560,
          "y": 280,
          "w": 150,
          "h": 40,
          "label": "Punctual budget",
          "sub": "subsystems/clusteredLights.ts",
          "desc": "FinalizeLevel (before SetupShadows): when enabled lights exceed lightBudget (default 8), cluster point/spot into ClusteredLightContainer or disable light UBOs (forward-expanded). Suns stay forward for shadows. Sets level.punctualLightingMode and level.clusteredLights.",
          "meta": [
            [
              "Modes",
              "forward · clustered · forward-expanded"
            ],
            [
              "Override",
              "scene.clusterPunctualLights · lightBudget"
            ]
          ]
        }
      ],
      "edges": [
        {
          "id": 100,
          "src": 1,
          "tgt": 4,
          "label": "casting lamps"
        },
        {
          "id": 107,
          "src": 1,
          "tgt": 8,
          "label": "entity pass"
        },
        {
          "id": 108,
          "src": 8,
          "tgt": 6,
          "label": "punctualLightingMode"
        },
        {
          "id": 101,
          "src": 2,
          "tgt": 3,
          "label": "override"
        },
        {
          "id": 102,
          "src": 1,
          "tgt": 6,
          "label": "entity pass"
        },
        {
          "id": 103,
          "src": 3,
          "tgt": 6,
          "label": "activeCamera"
        },
        {
          "id": 104,
          "src": 4,
          "tgt": 6,
          "label": "shadowGenerators"
        },
        {
          "id": 105,
          "src": 5,
          "tgt": 6,
          "label": "env · fog · atmosphere · post"
        },
        {
          "id": 106,
          "src": 7,
          "tgt": 6,
          "label": "after glTF load"
        }
      ]
    }
  },
  "audio-animation.html": {
    "navLabel": "Audio/Anim",
    "diagram": {
      "title": "Babylon Level Kit — Audio & Animation",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 80,
          "w": 150,
          "h": 40,
          "label": "AUDIO component",
          "sub": "Blender",
          "desc": "File picker (copied to audio/), volume, loop, autoplay, 3D spatial + max distance, playback rate.",
          "meta": [
            [
              "Validator",
              "missing file warn"
            ]
          ]
        },
        {
          "id": 2,
          "x": 300,
          "y": 80,
          "w": 150,
          "h": 40,
          "label": "ApplyAudio",
          "sub": "subsystems/audio.ts",
          "desc": "Audio engine v2: one lazy CreateAudioEngineAsync; CreateSoundAsync per component with spatialEnabled at creation; spatial.attach(entity.node). Queued by the audio handler in the component registry; promises settled in FinalizeLevel. Names = file stem.",
          "meta": [
            [
              "Legacy Sound class",
              "deprecated — not used"
            ]
          ]
        },
        {
          "id": 3,
          "x": 560,
          "y": 40,
          "w": 150,
          "h": 40,
          "label": "Autoplay & unlock",
          "sub": "browser policy",
          "desc": "Auto-play sounds await audioEngine.unlockAsync() (first user gesture) WITHOUT blocking the load — creation promises settle in FinalizeLevel via allSettled.",
          "meta": [
            [
              "Bad file",
              "logs, level still loads"
            ]
          ]
        },
        {
          "id": 4,
          "x": 560,
          "y": 140,
          "w": 150,
          "h": 40,
          "label": "entity.sounds",
          "sub": "runtime",
          "desc": "GetSound('door') → play/stop/pitch from behaviors. Disposed with the level.",
          "meta": [
            [
              "Demo",
              "MessageLogger plays on message"
            ]
          ]
        },
        {
          "id": 5,
          "x": 40,
          "y": 280,
          "w": 150,
          "h": 40,
          "label": "NLA strips",
          "sub": "Blender",
          "desc": "Strips export as glTF animations → global AnimationGroups. The Animation box sets autoplay clip/loop/speed.",
          "meta": [
            [
              "Block",
              "entities[].animation"
            ]
          ]
        },
        {
          "id": 6,
          "x": 300,
          "y": 280,
          "w": 150,
          "h": 40,
          "label": "FindAnimationGroups",
          "sub": "membership scoping",
          "desc": "A group belongs to an entity if any targeted animation targets its node or a descendant — no global-name reliance.",
          "meta": [
            [
              "File",
              "subsystems/animation.ts"
            ]
          ]
        },
        {
          "id": 7,
          "x": 560,
          "y": 280,
          "w": 150,
          "h": 40,
          "label": "ApplyAutoPlayAnimations",
          "sub": "FinalizeLevel",
          "desc": "Stops the glTF loader's auto-started groups first, then plays each entity's chosen clip (exact → contains → first).",
          "meta": [
            [
              "Runtime control",
              "entity.GetAnimation('Walk')?.start()"
            ]
          ]
        },
        {
          "id": 8,
          "x": 300,
          "y": 400,
          "w": 150,
          "h": 40,
          "label": "Skinned-mesh rule",
          "sub": "author on the ARMATURE",
          "desc": "glTF skinning ignores the mesh node's transform (joints define the pose) and clips target the joints under the armature — so GUID, Animation settings, and Scripts on the mesh object silently do nothing. Validator warns.",
          "meta": [
            [
              "State machine",
              "prototyped + reverted"
            ]
          ]
        }
      ],
      "edges": [
        {
          "id": 100,
          "src": 1,
          "tgt": 2,
          "label": "manifest"
        },
        {
          "id": 101,
          "src": 2,
          "tgt": 3,
          "label": ""
        },
        {
          "id": 102,
          "src": 2,
          "tgt": 4,
          "label": ""
        },
        {
          "id": 103,
          "src": 5,
          "tgt": 6,
          "label": "glb clips at load"
        },
        {
          "id": 104,
          "src": 6,
          "tgt": 7,
          "label": ""
        },
        {
          "id": 105,
          "src": 5,
          "tgt": 8,
          "label": "if rigged"
        },
        {
          "id": 106,
          "src": 6,
          "tgt": 8,
          "label": "joints scope"
        }
      ]
    }
  },
  "ui.html": {
    "navLabel": "UI",
    "diagram": {
      "title": "Babylon Level Kit — UI (2D GUI, particles, MSDF, 3D GUI)",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 60,
          "w": 150,
          "h": 40,
          "label": "GUI component",
          "sub": "2D — Blender",
          "desc": "References a .json from Babylon's GUI Editor. FULLSCREEN = HUD overlay; MESH = projected onto this entity's mesh surface (needs a mesh). File copied to gui/ next to the export.",
          "meta": [
            [
              "Editor",
              "gui.babylonjs.com"
            ],
            [
              "Validator",
              "MESH mode needs mesh"
            ]
          ]
        },
        {
          "id": 2,
          "x": 300,
          "y": 60,
          "w": 150,
          "h": 40,
          "label": "ApplyGui",
          "sub": "ui/gui2d.ts",
          "desc": "CreateForMesh or CreateFullscreenUI, then parseFromURLAsync. Texture name = file stem → entity.GetGui(\"hud\"). Queued as an async task by the GUI handler in the component registry.",
          "meta": [
            [
              "Peer dep",
              "@babylonjs/gui"
            ],
            [
              "Storage",
              "entity.guiTextures"
            ]
          ]
        },
        {
          "id": 3,
          "x": 40,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "PARTICLE component",
          "sub": "Blender",
          "desc": "References a .json from Babylon's Particle or Node Particle Editor. GPU, autoStart, attachToEntity, capacity. Scan Textures lists ParticleTextureSourceBlock slots; per-slot image picks copy + patch JSON URL on export.",
          "meta": [
            [
              "Editor",
              "particles.babylonjs.com"
            ],
            [
              "Validator",
              "missing file warn"
            ]
          ]
        },
        {
          "id": 12,
          "x": 170,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "export_particle_system",
          "sub": "export/particles.py",
          "desc": "Copy particle JSON + scanned texture images into particles/; patch ParticleTextureSourceBlock.url in the exported JSON (match by block id).",
          "meta": [
            [
              "Export",
              "serialize_components"
            ],
            [
              "Images",
              "beside JSON"
            ]
          ]
        },
        {
          "id": 4,
          "x": 300,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "ApplyParticles",
          "sub": "subsystems/particles.ts",
          "desc": "LoadParticleSystems + ResolveNodeParticleSetTextureUrls (rootUrl). attachToEntity: mesh or owned Vector3 + emptyEmitter. Queued async; settled in FinalizeLevel.",
          "meta": [
            [
              "Storage",
              "entity.particleSystems"
            ],
            [
              "Lookup",
              "GetParticles(stem)"
            ]
          ]
        },
        {
          "id": 11,
          "x": 560,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "WireParticleEmitterTracking",
          "sub": "subsystems/particles.ts",
          "desc": "After SettleTasks: CollectEmptyParticleEmitters → level.particleEmitterManager. Each frame (insertFirst onBeforeRender) copies getAbsolutePosition() into the owned Vector3 emitter for empty nodes.",
          "meta": [
            [
              "Meshes",
              "use mesh emitter directly"
            ],
            [
              "Disposal",
              "level.particleEmitterManager"
            ]
          ]
        },
        {
          "id": 5,
          "x": 40,
          "y": 380,
          "w": 150,
          "h": 40,
          "label": "GUI3D_* components",
          "sub": "9 control/panel types",
          "desc": "One component per Babylon 3D control: Button3D, Holographic/TouchHolographic, MeshButton3D, plus Stack/Sphere/Cylinder/Plane/Scatter panels. Buttons carry On Click events (target + message). Panels lay out Blender child objects.",
          "meta": [
            [
              "No external editor",
              "Blender is the editor"
            ],
            [
              "Images",
              "gui/ via _copy_asset"
            ]
          ]
        },
        {
          "id": 6,
          "x": 300,
          "y": 340,
          "w": 150,
          "h": 40,
          "label": "gui3dRegistrations",
          "sub": "entity pass",
          "desc": "Each GUI3D component queued with {entity, component, parentId}. parentId = manifest parent GUID so a button finds its panel. Built only in FinalizeLevel (panels + click targets must exist).",
          "meta": [
            [
              "File",
              "loader/context.ts"
            ]
          ]
        },
        {
          "id": 7,
          "x": 560,
          "y": 300,
          "w": 150,
          "h": 40,
          "label": "BuildGui3DControls",
          "sub": "ui/gui3d/builder.ts",
          "desc": "One GUI3DManager per level. Panels first (addControl → linkToTransformNode). Controls: parent panel addControl OR manager root + link. blockLayout while batching children. ApplyControlContent AFTER addControl.",
          "meta": [
            [
              "Disposal",
              "level.gui3DManager"
            ]
          ]
        },
        {
          "id": 8,
          "x": 560,
          "y": 400,
          "w": 150,
          "h": 40,
          "label": "WireClickEvents",
          "sub": "ui/gui3d/events.ts",
          "desc": "onPointerClickObservable → targetEntity.SendMessage(message, buttonEntity). Same OnMessage hook trigger colliders use — zero sender-side code.",
          "meta": [
            [
              "Requires",
              "click target GUID in manifest"
            ]
          ]
        },
        {
          "id": 9,
          "x": 820,
          "y": 340,
          "w": 150,
          "h": 40,
          "label": "entity.controls3D",
          "sub": "runtime",
          "desc": "Every panel/control created for this entity. GetControl3D(name) for scripts — exact match, then contains. HolographicButton.text, visibility, hover observables, etc.",
          "meta": [
            [
              "Hierarchy",
              "Blender parenting = panel children"
            ]
          ]
        },
        {
          "id": 10,
          "x": 300,
          "y": 480,
          "w": 150,
          "h": 40,
          "label": "SettleTasks",
          "sub": "FinalizeLevel",
          "desc": "Promise.allSettled for audioTasks, guiTasks, particleTasks, msdfTextTasks — one bad JSON logs a warning; the level still loads. Particle and MSDF wire hooks run immediately after.",
          "meta": [
            [
              "File",
              "core/LevelLoader.ts"
            ]
          ]
        },
        {
          "id": 13,
          "x": 40,
          "y": 520,
          "w": 150,
          "h": 40,
          "label": "MSDF_TEXT component",
          "sub": "Blender",
          "desc": "bmfont JSON + glyph atlas PNG copied to fonts/ with stable names. Resolution-independent 3D labels via @babylonjs/addons TextRenderer.",
          "meta": [
            [
              "Export",
              "copy_asset → fonts/"
            ],
            [
              "Validator",
              "missing font files"
            ]
          ]
        },
        {
          "id": 14,
          "x": 300,
          "y": 520,
          "w": 150,
          "h": 40,
          "label": "ApplyMsdfText",
          "sub": "ui/msdfText.ts",
          "desc": "FontAsset cached per scene (cleared on Level.Dispose); TextRenderer.CreateTextRendererAsync; parent = entity.node. Queued async by the MSDF text handler in the component registry.",
          "meta": [
            [
              "Storage",
              "entity.textRenderers"
            ],
            [
              "Lookup",
              "GetTextRenderer(stem)"
            ]
          ]
        },
        {
          "id": 15,
          "x": 560,
          "y": 520,
          "w": 150,
          "h": 40,
          "label": "WireMsdfTextRendering",
          "sub": "ui/msdfText.ts",
          "desc": "After SettleTasks: CollectTextRenderers → level.msdfTextManager (onAfterRenderObservable draw pass).",
          "meta": [
            [
              "Disposal",
              "level.msdfTextManager"
            ]
          ]
        },
        {
          "id": 16,
          "x": 820,
          "y": 480,
          "w": 150,
          "h": 40,
          "label": "Behaviors",
          "sub": "OnMessage target",
          "desc": "WireClickEvents and trigger colliders both fan out to behavior.OnMessage(message, source) — zero sender-side gameplay code.",
          "meta": [
            [
              "See",
              "scripting.html"
            ]
          ]
        }
      ],
      "edges": [
        { "id": 100, "src": 1, "tgt": 2, "label": "manifest" },
        { "id": 101, "src": 2, "tgt": 10, "label": "async" },
        { "id": 102, "src": 3, "tgt": 12, "label": "export" },
        { "id": 110, "src": 12, "tgt": 4, "label": "manifest" },
        { "id": 103, "src": 4, "tgt": 10, "label": "async" },
        { "id": 109, "src": 10, "tgt": 11, "label": "wire" },
        { "id": 111, "src": 13, "tgt": 14, "label": "manifest" },
        { "id": 112, "src": 14, "tgt": 10, "label": "async" },
        { "id": 113, "src": 10, "tgt": 15, "label": "wire" },
        { "id": 104, "src": 5, "tgt": 6, "label": "manifest" },
        { "id": 105, "src": 6, "tgt": 7, "label": "finalize" },
        { "id": 106, "src": 7, "tgt": 8, "label": "controls" },
        { "id": 107, "src": 7, "tgt": 9, "label": "register" },
        { "id": 108, "src": 8, "tgt": 16, "label": "OnMessage" }
      ]
    }
  },
  "workflow.html": {
    "navLabel": "Workflow",
    "diagram": {
      "title": "Babylon Level Kit — Workflow & tooling",
      "nodes": [
        {
          "id": 1,
          "x": 40,
          "y": 60,
          "w": 150,
          "h": 40,
          "label": "Live Link loop",
          "sub": "save → see",
          "desc": "Export once (path remembered per scene) → tick Live Link → Ctrl+S re-exports (save_post; begin_asset_export overwrites stable env/audio/gui paths) → Vite plugin watches all files under public/levels/ (path.resolve; 50ms debounce) → full reload. Manifest written after glb so both are ready.",
          "meta": [
            [
              "Blender",
              "export/live_link.py"
            ],
            [
              "App",
              "ReloadOnLevelExport in vite.config.ts"
            ]
          ]
        },
        {
          "id": 2,
          "x": 40,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "Validator",
          "sub": "catch it at export",
          "desc": "Missing scripts · dangling refs · MESH+DYNAMIC · mesh triggers · events on non-triggers · constraint ends without physics · skinned-mesh components · AREA lights · duplicate GUIDs · missing audio · no camera · Input Actions (duplicate names, empty bindings, bad @inputMap, missing Scene Default).",
          "meta": [
            [
              "Runs",
              "Validate button / Export / Live Link"
            ]
          ]
        },
        {
          "id": 3,
          "x": 40,
          "y": 340,
          "w": 150,
          "h": 40,
          "label": "Debug Build",
          "sub": "release gate",
          "desc": "Export-panel checkbox → manifest 'debug' (missing = true) → level.debugEnabled → gates the C/I keys and the debugColliders option. Untick for release exports.",
          "meta": [
            [
              "Keys",
              "C colliders · I inspector (lazy import)"
            ]
          ]
        },
        {
          "id": 4,
          "x": 360,
          "y": 100,
          "w": 150,
          "h": 40,
          "label": "Monorepo",
          "sub": "npm workspaces",
          "desc": "packages/engine = '@bjs/engine' shared via symlink; apps/* each a game. Edit the engine once, every app updates instantly (Vite hot-reloads across the link).",
          "meta": [
            [
              "Install",
              "npm install at the ROOT only"
            ],
            [
              "Typecheck",
              "npm run typecheck"
            ]
          ]
        },
        {
          "id": 5,
          "x": 360,
          "y": 240,
          "w": 150,
          "h": 40,
          "label": "Scaffolder",
          "sub": "npm run create",
          "desc": "-- --name my-game [--title …] [--level …]: stamps apps/my-game from the playground (own main.ts/behaviors/empty public/levels); the engine is NOT copied.",
          "meta": [
            [
              "File",
              "scripts/create-app.mjs"
            ]
          ]
        },
        {
          "id": 6,
          "x": 360,
          "y": 380,
          "w": 150,
          "h": 40,
          "label": "Versioning & artifacts",
          "sub": "lockstep",
          "desc": "Engine package.json(s) ↔ blender_manifest.toml (see __KIT_VERSION__ in prose docs). Distributables: extension zip (Blender) + repo zip. Manifest schema v4.",
          "meta": [
            [
              "Versions",
              "packages/engine + blender_manifest.toml"
            ]
          ]
        },
        {
          "id": 7,
          "x": 660,
          "y": 240,
          "w": 150,
          "h": 40,
          "label": "Per-app dev server",
          "sub": "each app owns one",
          "desc": "npm run dev --workspace apps/<name> (root npm run dev = playground). Imports resolve by Node's upward node_modules walk → the root symlink.",
          "meta": [
            [
              "Levels",
              "apps/<name>/public/levels/"
            ]
          ]
        },
        {
          "id": 8,
          "x": 660,
          "y": 100,
          "w": 150,
          "h": 40,
          "label": "Runtime load",
          "sub": "main.ts",
          "desc": "LevelLoader.Load after browser reload. debugEnabled from manifest gates C/I keys and the debugColliders loader option.",
          "meta": [
            [
              "File",
              "packages/engine/src/core/LevelLoader.ts"
            ]
          ]
        }
      ],
      "edges": [
        {
          "id": 100,
          "src": 2,
          "tgt": 1,
          "label": "warnings on save"
        },
        {
          "id": 101,
          "src": 1,
          "tgt": 7,
          "label": "serves"
        },
        {
          "id": 106,
          "src": 1,
          "tgt": 8,
          "label": "reload → Load"
        },
        {
          "id": 102,
          "src": 3,
          "tgt": 8,
          "label": "debugEnabled"
        },
        {
          "id": 103,
          "src": 4,
          "tgt": 5,
          "label": ""
        },
        {
          "id": 104,
          "src": 5,
          "tgt": 7,
          "label": "new app"
        },
        {
          "id": 105,
          "src": 4,
          "tgt": 7,
          "label": "symlink"
        }
      ]
    }
  }
};
