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
          "desc": "Authoring: the Babylon N-panel adds components (Tag, Collider, RigidBody, Script, Camera, Audio, Constraint) to objects. GUIDs (bjs_id) make objects addressable entities.",
          "meta": [
            [
              "Module",
              "properties.py / ui.py"
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
              "validate.py"
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
              "export.py (+scene/anim)"
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
          "desc": "Ctrl+S re-exports using the remembered path; the app's Vite plugin watches *.scene.json and full-reloads the browser. Save in Blender, see it in Babylon.",
          "meta": [
            [
              "Module",
              "live_link.py"
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
          "y": 190,
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
          "y": 290,
          "w": 140,
          "h": 40,
          "label": "level.scene.json",
          "sub": "what it can't",
          "desc": "Components, tags, physics, script bindings + exposed values, trigger events, constraints, audio, GUI/particle JSON refs, 3D GUI button/panel settings, per-light/camera and scene settings, the debug flag.",
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
          "y": 240,
          "w": 150,
          "h": 40,
          "label": "LevelLoader.Load",
          "sub": "core/LevelLoader.ts",
          "desc": "Fetch+validate manifest, LoadAsset (inputActions + defaultInputMap), append glb RIGHT-HANDED, GUID index, per-entity pass, second pass, FinalizeLevel.",
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
          "y": 30,
          "w": 140,
          "h": 40,
          "label": "Physics",
          "sub": "bodies + owned meshes",
          "desc": "COLLIDER/RIGIDBODY become one Havok V2 body per node. Auto-fit / convex-mesh / manual paths; OwnedColliderMeshes excludes child entities by GUID so colliders span only their own submeshes.",
          "meta": [
            [
              "File",
              "subsystems/physics.ts"
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
          "y": 110,
          "w": 140,
          "h": 40,
          "label": "Constraints",
          "sub": "joints",
          "desc": "Fixed/Ball/Hinge/Slider/Spring/Custom 6DoF. Frame from live world transforms (pins as-placed pose); hinge/slider motors; CUSTOM = per-axis free/locked/limited/spring on one joint.",
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
          "y": 190,
          "w": 140,
          "h": 40,
          "label": "Triggers",
          "sub": "messaging",
          "desc": "Authored On-Enter events: one plugin observable dispatches TRIGGER_ENTERED, tag filter, then target.SendMessage to behaviors' OnMessage(message, source).",
          "meta": [
            [
              "File",
              "subsystems/triggers.ts"
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
          "y": 270,
          "w": 140,
          "h": 40,
          "label": "Cameras & Lights",
          "sub": "faithful + overrides",
          "desc": "glb creates them; we copy Blender properties on (parent-chain find). CAMERA component swaps in Universal/Arc/Follow built from the exported pose; targets resolve in the second pass.",
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
          "y": 350,
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
          "y": 430,
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
          "y": 150,
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
          "y": 250,
          "w": 140,
          "h": 40,
          "label": "Behaviors",
          "sub": "your scripts",
          "desc": "One default-export class per file (filename = registry key). Lifecycle: OnStart / OnUpdate(deltaSeconds) / OnDestroy / OnMessage. @exposed fields edited per-object in Blender.",
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
          "y": 350,
          "w": 140,
          "h": 40,
          "label": "Input",
          "sub": "src/input/",
          "desc": "Unity Input System clone: Action Maps > Actions > Bindings. Scene asset + defaultInputMap from Blender; @inputMap fields and behavior.input injected at load. InputManager.Process/EndFrame driven by Level.",
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
          "id": 102,
          "src": 1,
          "tgt": 3,
          "label": ""
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
          "label": ""
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
          "label": ""
        },
        {
          "id": 112,
          "src": 7,
          "tgt": 12,
          "label": "async"
        },
        {
          "id": 113,
          "src": 7,
          "tgt": 13,
          "label": "finalize"
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
          "label": "OnStart/OnUpdate"
        },
        {
          "id": 116,
          "src": 14,
          "tgt": 16,
          "label": "attach/update"
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
          "label": "N-panel UI",
          "sub": "ui.py",
          "desc": "Draws the Babylon panel: component list with per-type fields, the Animation box, and the Export panel (Export / Live Link / Debug Build / Validate). Input Actions has its own panel in input_ui.py.",
          "meta": [
            [
              "Kind",
              "drawing only"
            ],
            [
              "Entry",
              "BJS_PT_* panels"
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
          "sub": "properties.py",
          "desc": "Component PropertyGroups: BJSComponent (Tag/Collider/RigidBody/Script/Camera/Audio/Constraint), exposed vars + list items, trigger events, light/shadow/animation settings. Input Actions data lives in input_properties.py (Scene.bjs_input_maps + default map). Owns ID_KEY + ensure_object_id().",
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
          "sub": "operators.py",
          "desc": "Add/remove/duplicate/move/copy/paste components, Assign GUID, script picker + Sync, list and trigger-event row editing, Validate, Export.",
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
          "sub": "script_parse.py",
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
          "sub": "validate.py",
          "desc": "Pre-export checks: missing scripts, dangling refs, MESH+DYNAMIC, mesh triggers, constraint ends without physics, skinned-mesh components, area lights, duplicate GUIDs, missing camera/audio, Input Actions (duplicate names, empty bindings, bad @inputMap refs, missing Scene Default map).",
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
          "sub": "export.py",
          "desc": "Writes the glb (Blender glTF, +Y-up, GUIDs into node extras) and builds the schema-v4 manifest. Converts axes Blender→Babylon (x,y,z)→(x,z,−y). Force-includes referenced objects so refs always resolve. Copies audio files.",
          "meta": [
            [
              "Schema",
              "v4"
            ],
            [
              "Axis conv",
              "at export"
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
          "sub": "scene_export.py",
          "desc": "Clear/ambient color, environment texture (copied next to export), fog, post-processing, inputActions + defaultInputMap (built-in Player asset when the panel is empty).",
          "meta": [
            [
              "Manifest key",
              "scene"
            ],
            [
              "Input",
              "input_defaults.py when empty"
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
          "sub": "anim_export.py",
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
          "sub": "live_link.py",
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
          "label": "audio/ files",
          "sub": "artifact",
          "desc": "Sound files copied next to the export so the manifest's relative paths resolve.",
          "meta": [
            [
              "Copied by",
              "export._copy_audio_file"
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
          "sub": "collider_preview.py",
          "desc": "GPU wireframe of manual colliders drawn in the viewport, in Blender space — matches what export converts, so preview == runtime body.",
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
          "sub": "input_*.py",
          "desc": "Scene-level Input Actions panel: Action Maps > Actions > Bindings editor, Scene Default picker, key capture, load/save .inputactions.json, sync @inputMap refs from scripts. First export seeds defaults when empty.",
          "meta": [
            [
              "Modules",
              "input_properties · input_ui · input_ops"
            ],
            [
              "Panel",
              "BJS_PT_input_map"
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
          "label": ""
        },
        {
          "id": 109,
          "src": 6,
          "tgt": 8,
          "label": ""
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
          "label": "values"
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
              "subsystems/physics.ts"
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
          "desc": "The orchestrator; stages live in core/loader/. InputManager.LoadAsset runs after manifest fetch.",
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
          "desc": "Clear errors for the classic failures: HTTP 404, and the dev server returning index.html (HTML, not JSON).",
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
          "desc": "useRightHandedSystem=true is set FIRST so the loader skips the __root__ handedness mirror that broke Havok collider placement. NeutralizeGltfRoot stays as a guard. Needs the ExtrasAsMetadata import for GUIDs.",
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
          "desc": "Per manifest entity: resolve node, create Entity, back-ref node.metadata.bjsEntity, then ApplyComponents + light/camera processing.",
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
          "label": "ApplyComponents",
          "sub": "per entity",
          "desc": "ClassifyComponents sorts the array → BuildPhysics (collider/body) → queue trigger registrations → queue async audio/GUI/particle tasks → queue GUI3D registrations (parent GUID for panel nesting) → InstantiateScripts (inject entity/scene, ApplyExposedVars) → InjectInputMaps (@inputMap fields + behavior.input fallback; entity refs become PendingRefs).",
          "meta": [
            [
              "Helpers",
              "InstantiateScripts / InjectInputMaps"
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
          "desc": "SetupShadows → ApplyScene (env/fog/post) → ApplyAutoPlayAnimations → settle audio/GUI/particle promises (allSettled) → WireTriggerEvents → BuildConstraints → BuildGui3DControls (panels first, then controls + click wiring) → Level.Begin → debugColliders (gated by Debug Build).",
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
          "src": 2,
          "tgt": 5,
          "label": ""
        },
        {
          "id": 104,
          "src": 2,
          "tgt": 6,
          "label": ""
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
          "src": 2,
          "tgt": 9,
          "label": "after loop"
        },
        {
          "id": 108,
          "src": 2,
          "tgt": 10,
          "label": ""
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
        },
        {
          "id": 115,
          "src": 2,
          "tgt": 13,
          "label": ""
        }
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
          "desc": "Decorator records field name + UI hints (WeakMap). Blender regex-parses the source (script_parse.py) → single-line literal defaults only; entity fields need type:'entity'; lists start []. Stays lowercase: cross-language contract.",
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
          "desc": "id/name/node/tag, behaviors, body?, animations, sounds. GetBehavior / GetAnimation / GetSound (exact then contains), SendMessage → every behavior's OnMessage.",
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
          "tgt": 7,
          "label": "refs resolve to"
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
          "id": 108,
          "src": 9,
          "tgt": 4,
          "label": "lifecycle"
        },
        {
          "id": 109,
          "src": 9,
          "tgt": 8,
          "label": "attach/update"
        }
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
          "desc": "One COLLIDER and/or RIGIDBODY → one node-attached PhysicsBody. collider-only=static/trigger; body-only=dynamic+auto box; both=shape from collider, dynamics from body. KINEMATIC→ANIMATED.",
          "meta": [
            [
              "File",
              "subsystems/physics.ts"
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
          "desc": "Includes a descendant mesh only if no node on its path up carries bjs_id — so a collider spans its own multi-material submeshes (_primitiveN, no GUID) but never a parented child entity's geometry. All paths route through it.",
          "meta": [
            [
              "Fixed in",
              "v0.29.1"
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
          "desc": "Hand-authored center/size/radius/height/rotation, already Babylon-space (converted at export; viewport preview matches).",
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
              "LevelLoader.Load step 2"
            ],
            [
              "Guard",
              "NeutralizeGltfRoot"
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
          "desc": "CONSTRAINT components → joints in FinalizeLevel (both bodies exist). FIXED→Lock, BALL→BallAndSocket, HINGE/SLIDER/SPRING/CUSTOM→6DoF (frame X = authored axis). CUSTOM: manifest axes[] → BuildCustomAxisLimits (free/locked/limited/spring per DOF).",
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
          "sub": "subsystems/triggers.ts",
          "desc": "Authored On-Enter events: one onTriggerCollisionObservable; TRIGGER_ENTERED → trigger body→registration, entering body→metadata.bjsEntity, tag gate → target.SendMessage.",
          "meta": [
            [
              "Gotcha",
              "MESH triggers never fire"
            ],
            [
              "Cleanup",
              "level.triggerObserver removed on dispose"
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
          "desc": "entity.body for impulses/velocity; OnMessage receives trigger messages; level.constraints for tuning; ShowColliders / C key for debug wireframes.",
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
          "label": "makes sound"
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
          "desc": "Automatic (no component). glb creates+places; ApplyBlenderLight copies color (exact), intensity (scaled: SUN_SCALE / PUNCTUAL_SCALE), spot cone. FindLightForNode walks the parent chain (orientation-correction node in between).",
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
          "desc": "Mirrors lights: faithful glb FreeCamera + ApplyBlenderCamera (clip, FOV/ortho); exporter flags the active one → scene.activeCamera. No controls by default (faithful playback).",
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
          "desc": "Opt-in type override built FROM the faithful camera's world pose, lens copied, original disposed. Per-type builders: Universal / Arc (re-pivot to target) / Follow-Orbit (DeriveFollowFromPosition) / Follow-Offset (AddUpdater holds world offset).",
          "meta": [
            [
              "Targets",
              "resolve in second pass"
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
          "desc": "One ShadowGenerator per casting lamp; all geometry caster+receiver. Per-light: filter (PCF/PCSS/Poisson/BlurESM/hard), bias, normalBias, darkness, mapSize, frustum minZ/maxZ on the light.",
          "meta": [
            [
              "Options",
              "{ shadows?, shadowMapSize? }"
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
          "sub": "environment / fog / postprocess",
          "desc": "From the manifest scene block in FinalizeLevel: clear/ambient color; env texture → IBL (+skybox; .env best, .exr impossible); fog LINEAR/EXP/EXP2; BuildDefaultPipeline (FXAA/bloom/tone) + separate SSAO2 → level.post.",
          "meta": [
            [
              "Attach",
              "active camera"
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
          "desc": "activeCamera, shadowGenerators, post — all reachable from gameplay code for further tuning.",
          "meta": [
            [
              "See",
              "load-pipeline.html"
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
          "id": 101,
          "src": 2,
          "tgt": 3,
          "label": "override"
        },
        {
          "id": 102,
          "src": 1,
          "tgt": 6,
          "label": ""
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
          "label": ""
        },
        {
          "id": 105,
          "src": 5,
          "tgt": 6,
          "label": "post"
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
          "desc": "Audio engine v2: one lazy CreateAudioEngineAsync; CreateSoundAsync per component with spatialEnabled at creation; spatial.attach(entity.node). Names = file stem.",
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
              "prototyped + reverted; see DEVELOPMENT_PLAN"
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
          "label": "groups"
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
      "title": "Babylon Level Kit — UI (2D GUI, particles, 3D GUI)",
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
          "desc": "CreateForMesh or CreateFullscreenUI, then parseFromURLAsync. Texture name = file stem → entity.GetGui(\"hud\"). Queued as an async task during ApplyComponents.",
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
          "desc": "References a .json from Babylon's Particle Editor. GPU toggle, autoStart, attachToEntity (mesh or empty position), optional capacity override. File copied to particles/.",
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
          "id": 4,
          "x": 300,
          "y": 200,
          "w": 150,
          "h": 40,
          "label": "ApplyParticles",
          "sub": "subsystems/particles.ts",
          "desc": "ParticleHelper.ParseFromFileAsync (GPU when supported). Emitter = entity mesh or absolute position clone. Queued async; settled in FinalizeLevel.",
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
          "desc": "Promise.allSettled for audioTasks, guiTasks, particleTasks — one bad JSON logs a warning; the level still loads.",
          "meta": [
            [
              "File",
              "core/LevelLoader.ts"
            ]
          ]
        }
      ],
      "edges": [
        { "id": 100, "src": 1, "tgt": 2, "label": "manifest" },
        { "id": 101, "src": 2, "tgt": 10, "label": "async" },
        { "id": 102, "src": 3, "tgt": 4, "label": "manifest" },
        { "id": 103, "src": 4, "tgt": 10, "label": "async" },
        { "id": 104, "src": 5, "tgt": 6, "label": "export" },
        { "id": 105, "src": 6, "tgt": 7, "label": "post-pass" },
        { "id": 106, "src": 7, "tgt": 8, "label": "controls" },
        { "id": 107, "src": 7, "tgt": 9, "label": "register" },
        { "id": 108, "src": 8, "tgt": 9, "label": "OnMessage" }
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
          "desc": "Export once (path remembered per scene) → tick Live Link → Ctrl+S re-exports (save_post) → Vite plugin watches public/levels/*.scene.json → full reload. Manifest written after glb so both are ready.",
          "meta": [
            [
              "Blender",
              "live_link.py"
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
          "desc": "Missing scripts · dangling refs · MESH+DYNAMIC · mesh triggers · events on non-triggers · constraint ends without physics · skinned-mesh components · AREA lights · duplicate GUIDs · missing audio · no camera.",
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
          "desc": "Engine package.json(s) ↔ blender_manifest.toml. Distributables: extension zip (Blender) + repo zip. Manifest schema v4.",
          "meta": [
            [
              "Plans",
              "TEST_PLAN / DEVELOPMENT_PLAN in docs/"
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
          "label": "reloads"
        },
        {
          "id": 102,
          "src": 3,
          "tgt": 7,
          "label": "gates keys"
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
