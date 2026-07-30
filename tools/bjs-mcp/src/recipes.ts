import { ScoreKeywordMatches, Tokenize } from "./keywords.js";

export interface Recipe
{
  name: string;
  description: string;
  keywords: string[];
  hooks: string[];
  referenceBehavior: string;
  pitfalls: string[];
  exposedFields: string[];
}

export const RECIPES: Recipe[] = [
  {
    name: "minimal-behavior",
    description: "Empty behavior shell with correct imports and class contract.",
    keywords: ["empty", "starter", "scaffold", "template", "basic"],
    hooks: [],
    referenceBehavior: "",
    pitfalls: ["Class name must match filename stem.", "Use export default."],
    exposedFields: [],
  },
  {
    name: "look-at-target",
    description: "Orient this entity to face another entity each frame.",
    keywords: ["look", "face", "aim", "turret", "target", "follow rotation"],
    hooks: ["OnUpdate"],
    referenceBehavior: "LookAt.ts",
    pitfalls: ["Guard target !== null before use.", "Attach to the entity that should rotate."],
    exposedFields: ['@exposed({ type: "entity", label: "Target" }) target: Entity | null = null'],
  },
  {
    name: "constant-rotate",
    description: "Spin around a fixed axis at a configurable rate (degrees per second).",
    keywords: ["rotate", "spin", "turn", "axis", "rpm"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "Rotator.ts",
    pitfalls: ["Convert degrees to radians in OnStart.", "Scale rotation by deltaSeconds in OnUpdate."],
    exposedFields: [
      '@exposed({ min: 0, max: 720, label: "Speed (deg/s)" }) speed = 45',
      '@exposed({ label: "Axis" }) axis: [number, number, number] = [0, 1, 0]',
    ],
  },
  {
    name: "waypoint-path",
    description: "Move along a list of waypoints with optional easing.",
    keywords: ["waypoint", "path", "train", "patrol route", "interpolate", "lerp", "points"],
    hooks: ["OnUpdate"],
    referenceBehavior: "Waypoints.ts",
    pitfalls: [
      "Need at least 2 waypoints or OnUpdate no-ops.",
      "List of vector3 starts empty — points are authored in Blender.",
      "Do not multiply Lerp result by deltaSeconds.",
    ],
    exposedFields: [
      '@exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] }) easing = "easeInOut"',
      '@exposed({ type: "list", of: "vector3", label: "Waypoints" }) points: Vector3[] = []',
      '@exposed({ min: 0.1, label: "Seconds per leg" }) legDuration = 2',
    ],
  },
  {
    name: "patrol-oscillate",
    description: "Ease back and forth between start position and start + offset.",
    keywords: ["patrol", "oscillate", "ping pong", "sine", "bob", "back and forth"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "Patrol.ts",
    pitfalls: [
      "Set physics body to ANIMATED (kinematic) before moving node each frame.",
      "Capture start position in OnStart, not in the constructor.",
    ],
    exposedFields: [
      '@exposed({ label: "Offset" }) offset: [number, number, number] = [5, 0, 0]',
      '@exposed({ min: 0.1, label: "Period (s)" }) period = 4',
    ],
  },
  {
    name: "input-poll-move",
    description: "Poll a Vector2 Move action and translate on the XZ plane.",
    keywords: ["wasd", "keyboard", "gamepad", "move", "walk", "input", "player"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "InputMover.ts",
    pitfalls: [
      "Use action names from InputActions constants, not raw key codes.",
      "Multiply position delta by deltaSeconds.",
      "Import PlayerActions from ../InputActions.",
    ],
    exposedFields: [
      '@exposed({ min: 0.1, max: 30, label: "Speed (u/s)" }) speed = 5',
      '@inputMap("Player") player!: InputActionMap',
    ],
  },
  {
    name: "on-message-handler",
    description: "React to SendMessage or Event Messages via OnMessage.",
    keywords: ["message", "trigger", "event", "onclick", "door", "pad", "boost"],
    hooks: ["OnMessage"],
    referenceBehavior: "MessageLogger.ts",
    pitfalls: [
      "Trigger colliders send messages on enter — handle in OnMessage, not OnStart.",
      "Filter by message string if multiple events target this entity.",
    ],
    exposedFields: [
      '@exposed({ label: "Only message (empty = all)" }) onlyMessage = ""',
    ],
  },
  {
    name: "animation-cycle",
    description: "Cycle through animation clips on an interval.",
    keywords: ["animation", "clip", "nla", "walk", "idle", "cycle"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "ClipSwitcher.ts",
    pitfalls: [
      "Attach behavior to the armature entity, not the skinned mesh.",
      "Need 2+ animation clips on the entity.",
      "For Idle/Walk FSMs prefer ANIMATOR (playbook animator-fsm) instead of cycling in script. Clip names = Action names.",
    ],
    exposedFields: [
      '@exposed({ min: 0.5, label: "Switch every (s)" }) interval = 3',
      '@exposed({ label: "Loop each clip" }) loop = true',
    ],
  },
  {
    name: "kinematic-body-move",
    description: "Move a node each frame when it has a physics body — set ANIMATED first.",
    keywords: ["physics", "kinematic", "animated", "body", "collider"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "Patrol.ts",
    pitfalls: [
      "Call setMotionType(PhysicsMotionType.ANIMATED) in OnStart.",
      "Do not fight DYNAMIC bodies by writing node.position every frame.",
    ],
    exposedFields: [],
  },
  {
    name: "trigger-logger",
    description: "Log physics trigger overlaps via OnTriggerEnter/OnTriggerExit hooks.",
    keywords: ["trigger", "overlap", "collision", "log", "debug"],
    hooks: ["OnTriggerEnter", "OnTriggerExit"],
    referenceBehavior: "TriggerLogger.ts",
    pitfalls: [
      "Attach to the entity that owns the trigger collider.",
      "Do not use body.getCollisionObservable() for triggers — it only receives solid collisions.",
      "For solid + trigger logging, use collision-probe instead.",
    ],
    exposedFields: ['@exposed({ label: "Message" }) message = ""'],
  },
  {
    name: "collision-probe",
    description: "Log Unity-style OnCollision/OnTrigger lifecycle hooks.",
    keywords: ["collision", "trigger", "overlap", "enter", "exit", "stay", "log", "debug"],
    hooks: ["OnCollisionEnter", "OnCollisionStay", "OnCollisionExit", "OnTriggerEnter", "OnTriggerExit"],
    referenceBehavior: "CollisionProbe.ts",
    pitfalls: ["Requires entity.body; hooks are wired automatically when overridden."],
    exposedFields: ['@exposed({ label: "Only tag (empty = all)" }) onlyTag = ""'],
  },
  {
    name: "constraint-hinge-motor",
    description:
      "Drive hinge constraint motors from input — wheels authored as HINGE constraints in Blender.",
    keywords: [
      "car",
      "wheel",
      "hinge",
      "motor",
      "constraint",
      "vehicle",
      "drive",
      "tank",
      "steer",
    ],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "CarController.ts",
    pitfalls: [
      "Joints are authored in Blender — resolve via GetAttachmentsOfType(\"CONSTRAINT\").",
      "Do not overwrite wheel node.rotation when hinge motors drive physics.",
      "Use list_input_actions for real action names (Vehicle/Main Control vs legacy Forward/Backward).",
      "Author Main Control as Value + Vector 2: WASD 2D Vector + Left Stick (not four axis-half rows).",
      "Constrained bodies work best as siblings, not parented to each other.",
    ],
    exposedFields: [
      '@exposed({ type: "entity", label: "Wheel" }) wheel: Entity | null = null',
      '@exposed({ min: 0, max: 100, label: "Motor Speed" }) speed = 10',
      '@exposed({ min: 0, max: 1000, label: "Motor Force" }) force = 100',
      '@inputMap("Player") player!: InputActionMap',
    ],
  },
  {
    name: "path-follow-advanced",
    description:
      "Follow a Path3D through entity waypoints with throttle, acceleration, and tangent facing.",
    keywords: [
      "train",
      "path",
      "path3d",
      "waypoint",
      "spline",
      "tangent",
      "throttle",
      "acceleration",
      "rail",
    ],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "TrainBehavior.ts",
    pitfalls: [
      "Set PhysicsMotionType.ANIMATED and disablePreStep = false when a body exists.",
      "Entity waypoint list starts empty — author picks targets in Blender.",
      "Snap to path start in OnStart to avoid first-frame jump.",
      "Attach to the entity that should move (train body), not the camera.",
    ],
    exposedFields: [
      '@exposed({ type: "list", of: "entity", label: "Waypoints" }) targets: (Entity | null)[] = []',
      '@exposed({ min: 0.1, label: "Speed (units/s)" }) throttleSpeed = 1',
      '@exposed({ min: 0.1, label: "Acceleration (units/s²)" }) acceleration = 5',
      '@exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] }) easing = "easeInOut"',
    ],
  },
  {
    name: "camera-follow",
    description: "Manual ArcRotateCamera around a target; raycast pulls radius in so the view does not clip through solids.",
    keywords: ["camera", "orbit", "follow", "track", "cinematic", "spectator", "clip", "collision", "manual", "raycast"],
    hooks: ["OnStart", "OnDestroy"],
    referenceBehavior: "TrainCamera.ts",
    pitfalls: [
      "Collision is line-of-sight physics raycast from target to camera — not pickWithRay and not a trigger probe.",
      "Use scene.getPhysicsEngine()?.raycastToRef — pickWithRay only hits pickable meshes, not Havok colliders.",
      "attachControl enables drag orbit and wheel zoom; clamp radius after pointer input via onBeforeRender.",
      "Sets scene.activeCamera — only one active camera per scene.",
      "Copy authored FOV/clip with FindCameraForNode + CopyLens before activating the new camera.",
      "Optional Collider Probe only tracks the camera for other scripts (e.g. FogChanger).",
      "Optional Ignore Colliders: @exposed list of entity refs — ray hits on those entities are skipped.",
      "After adding @exposed fields, Sync the Script component in Blender.",
      "For globe/planet map cameras, author Blender Camera component GEOSPATIAL — do not use this recipe.",
    ],
    exposedFields: [
      '@exposed({ type: "entity", label: "Target" }) target: Entity | null = null',
      '@exposed({ type: "list", of: "entity", label: "Ignore Colliders" }) ignoreColliders: (Entity | null)[] = []',
      '@exposed({ type: "entity", label: "Collider Probe" }) colliderProbe: Entity | null = null',
      '@exposed({ min: 0.1, max: 10000, label: "Radius" }) radius = 10',
      '@exposed({ min: -89, max: 89, label: "Pitch (deg)" }) pitch = 30',
      '@exposed({ min: 0.1, max: 10000, label: "Min Radius" }) minRadius = 1',
      '@exposed({ min: 0.1, max: 10000, label: "Max Radius" }) maxRadius = 10000',
      '@exposed({ min: 0, max: 100, label: "Collision Offset" }) collisionOffset = 0.5',
    ],
  },
  {
    name: "geospatial-camera-flyto",
    description:
      "Fly the scene's authored GeospatialCamera to a world point (requires CAMERA component GEOSPATIAL on the scene camera).",
    keywords: [
      "geospatial",
      "globe",
      "planet",
      "map",
      "earth",
      "flyto",
      "fly to",
      "zoom",
      "cinematic",
      "camera",
    ],
    hooks: ["OnStart", "OnMessage"],
    referenceBehavior: "",
    pitfalls: [
      "Globe navigation is authored in Blender as Camera component GEOSPATIAL — not a behavior.",
      "Planet mesh must be at world origin; Planet Radius must match mesh radius.",
      "Cast scene.activeCamera to GeospatialCamera — import from @babylonjs/core/Cameras/geospatialCamera.",
      "flyToPointAsync returns a Promise — await from async OnStart/OnMessage or void the call.",
    ],
    exposedFields: [
      '@exposed({ type: "entity", label: "Fly-to target" }) destination: Entity | null = null',
      '@exposed({ min: 0.05, max: 1, label: "Distance scale" }) distanceScale = 0.5',
      '@exposed({ min: 100, max: 10000, label: "Duration (ms)" }) durationMs = 1500',
      '@exposed({ label: "Trigger message (empty = OnStart)" }) triggerMessage = ""',
    ],
  },
  {
    name: "message-state-handler",
    description: "OnMessage-driven state machine — triggers and SendMessage change behavior mode.",
    keywords: ["message", "state", "fsm", "sequence", "door", "phase", "event"],
    hooks: ["OnMessage", "OnUpdate"],
    referenceBehavior: "MessageLogger.ts",
    pitfalls: [
      "Filter by message string when multiple events target this entity.",
      "Trigger enter events arrive via OnMessage, not OnStart.",
      "Optional filter tag on triggers checks entity.tag.",
    ],
    exposedFields: [
      '@exposed({ type: "enum", options: ["idle", "active", "done"] }) state = "idle"',
      '@exposed({ label: "Activate on message" }) activateMessage = "start"',
    ],
  },
  {
    name: "hover-bob",
    description: "Sine-wave vertical bob with optional look-at target.",
    keywords: ["hover", "bob", "float", "sine", "bounce", "levitate", "amplitude"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "",
    pitfalls: [
      "Capture restY in OnStart, not the constructor.",
      "Scale sine phase by deltaSeconds via elapsed time accumulator.",
      "With a physics body, set ANIMATED before writing node.position each frame.",
    ],
    exposedFields: [
      '@exposed({ min: 0, max: 5, label: "Amplitude (m)" }) amplitude = 0.5',
      '@exposed({ min: 0.1, max: 4, label: "Period (s)" }) period = 2',
      '@exposed({ type: "entity", label: "Face target" }) target: Entity | null = null',
    ],
  },
  {
    name: "reveal-on-message",
    description: "Show a hidden entity when a trigger or SendMessage delivers a matching message.",
    keywords: ["reveal", "show", "hidden", "invisible", "visibility", "trigger", "eye"],
    hooks: ["OnStart", "OnMessage"],
    referenceBehavior: "",
    pitfalls: [
      "Viewport-hidden and Make Invisible entities load hidden via HideEntityNode — physics and scripts still run.",
      "Load hide keeps entity.active === true, so SetEntityActive(entity, true) alone is a no-op — disable in OnStart, then enable on message.",
      "Render-disabled objects are not exported — they cannot be revealed.",
    ],
    exposedFields: [
      '@exposed({ label: "Reveal on message" }) revealMessage = "reveal"',
    ],
  },
  {
    name: "toggle-entity-active",
    description: "Enable or disable target entities at runtime (full SetActive — ToggleInWater pattern).",
    keywords: ["setactive", "enable", "disable", "toggle", "underwater", "zone", "active"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "ToggleInWater.ts",
    pitfalls: [
      "Use SetEntityActive — not isVisible alone (physics and OnUpdate keep running).",
      "Poll IsEntityInsideColliderVolume when the probe host is not the sample point.",
      "Set resting state in OnStart before the first inside test.",
    ],
    exposedFields: [
      '@exposed({ type: "entity", label: "Volume" }) volume: Entity | null = null',
      '@exposed({ type: "entity", label: "Probe" }) probe: Entity | null = null',
      '@exposed({ type: "list", of: "entity", label: "Targets" }) targets: (Entity | null)[] = []',
    ],
  },
  {
    name: "sound-on-message",
    description: "Play an AUDIO component sound when OnMessage fires.",
    keywords: ["sound", "audio", "play", "door", "sfx", "trigger", "message"],
    hooks: ["OnMessage"],
    referenceBehavior: "",
    pitfalls: [
      "Sound name = file stem (audio/door.mp3 → \"door\").",
      "Autoplay sounds need a prior user gesture; OnMessage from triggers is usually safe.",
      "AUDIO component must exist on this entity or use GetSound on the right entity via @exposed.",
    ],
    exposedFields: [
      '@exposed({ label: "Sound stem" }) soundName = "door"',
      '@exposed({ label: "Play on message" }) playMessage = "open"',
    ],
  },
  {
    name: "msdf-label-update",
    description: "Update MSDF_TEXT label copy at runtime (font JSON stem lookup).",
    keywords: ["msdf", "text", "label", "hud", "score", "font", "3d text"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "",
    pitfalls: [
      "MSDF_TEXT is authored in Blender — behaviors only update paragraphs, not create renderers.",
      "GetTextRenderer(fontStem) matches the font JSON file stem.",
      "clearParagraphs + addParagraph each time the string changes.",
    ],
    exposedFields: [
      '@exposed({ label: "Font stem" }) fontStem = "roboto-regular"',
      '@exposed({ label: "Label text" }) labelText = "Hello"',
    ],
  },
  {
    name: "rover-wheel-drive",
    description: "Drive multiple hinge motors for a wheeled rover (see CarController).",
    keywords: ["rover", "wheel", "drive", "vehicle", "car", "tank", "motor", "hinge", "steer"],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "CarController.ts",
    pitfalls: [
      "HINGE constraints must be authored in Blender on each wheel entity.",
      "Use GetAttachmentsOfType(\"CONSTRAINT\") — one row per wheel.",
      "Do not overwrite wheel node.rotation when motors drive physics.",
      "list_input_actions for real action names (Vehicle/Main Control).",
      "Author Main Control: Value + Vector 2, WASD + Left Stick.",
    ],
    exposedFields: [
      '@exposed({ type: "list", of: "entity", label: "Wheels" }) wheels: (Entity | null)[] = []',
      '@exposed({ min: 0, max: 100, label: "Drive speed (deg/s)" }) driveSpeed = 30',
      '@exposed({ min: 0, max: 1000, label: "Motor force" }) motorForce = 200',
      '@inputMap("Player") player!: InputActionMap',
    ],
  },
  {
    name: "animator-driver",
    description:
      "Thin SCRIPT driver for an ANIMATOR component — SetFloat / SetTrigger from input or logic.",
    keywords: [
      "animator",
      "driveanimator",
      "setfloat",
      "settrigger",
      "fsm driver",
      "locomotion driver",
      "animatorcontroller",
    ],
    hooks: ["OnStart", "OnUpdate"],
    referenceBehavior: "DriveAnimator.ts",
    pitfalls: [
      "Attach SCRIPT and ANIMATOR to the armature, not the skinned mesh.",
      "Author the FSM in Blender (ANIMATOR graph) — do not reimplement states in TypeScript.",
      "Turn off Animation panel autoplay when Animator owns playback.",
      "Clip / State names = Blender Action names (glTF ACTIONS export).",
      "list_input_actions for real Move / Jump action names.",
    ],
    exposedFields: ['@exposed({ min: 0, label: "Speed scale" }) speedScale = 1'],
  },
  {
    name: "pool-prefab-spawner",
    description:
      "Maintain a fixed pool of prefab instances — interval spawn, grow-in, lifetime, shrink, dispose (see animalSpawner).",
    keywords: [
      "pool",
      "interval",
      "grow",
      "shrink",
      "lifetime",
      "recycle",
      "steady",
      "fish",
      "animal",
      "dispose",
      "count",
      "animalspawner",
    ],
    hooks: ["OnStart", "OnUpdate", "OnDestroy"],
    referenceBehavior: "animalSpawner.ts",
    pitfalls: [
      "Use parent: null when instances must stay in world space (not follow spawner parent).",
      "Pass scaling: Vector3.Zero() in SpawnOptions for grow-in — do not spawn at full scale then hide.",
      "Do NOT use deferShadowRefresh — interval spawns need immediate shadow registration.",
      "Sample spawn positions in world space from a volume collider each spawn.",
      "await this.spawner.Spawn — never node.clone() + copy attachments.",
      "See animalSpawner.ts for trigger gating, shrink-out, and pool refill.",
    ],
    exposedFields: [
      '@exposed({ type: "list", of: "entity", label: "Prefabs", spawnTemplate: true }) prefabs: (Entity | null)[] = []',
      '@exposed({ type: "entity", label: "Spawn volume (collider)" }) spawnVolume: Entity | null = null',
      '@exposed({ min: 1, step: 1, label: "Spawn count" }) spawnCount = 10',
      '@exposed({ min: 0, step: 0.1, label: "Spawn interval (s)" }) spawnInterval = 0.5',
      '@exposed({ min: 0.1, max: 300, label: "Min lifetime (s)" }) lifetimeMin = 60',
      '@exposed({ min: 0.1, max: 600, label: "Max lifetime (s)" }) lifetimeMax = 120',
      '@exposed({ min: 0.1, max: 30, step: 0.1, label: "Grow duration (s)" }) growDuration = 3',
    ],
  },
  {
    name: "scatter-prefab-spawner",
    description:
      "Spawn full prefab instances of an @exposed template entity at authored positions, or paint-scatter on a mesh Color Attribute (see populateprefabs).",
    keywords: [
      "spawn",
      "prefab",
      "scatter",
      "instance",
      "duplicate",
      "populate",
      "spawner",
      "template",
      "clone",
      "paint",
      "vertex",
      "color",
    ],
    hooks: ["OnStart"],
    referenceBehavior: "populateprefabs.ts",
    pitfalls: [
      "Use await this.spawner.Spawn(template, { position }) — never node.clone() + copy attachments.",
      "Spawn hides the template by default when each call starts — pass keepTemplate: true to leave the source visible.",
      "Template is any in-level entity (linked collection root or in-scene hierarchy).",
      "Hide templates in Blender (viewport eye) when they should never appear at load.",
      "REFLECTION_PROBE on templates is skipped at spawn with a console warning; LOD works when its target meshes live inside the template hierarchy, are real scene members in Blender (orphan override children never export — 'target not found'), and own unique mesh data (InstancedMesh targets are rejected by Babylon LOD).",
      "Cameras spawn per instance with remapped targets but are never auto-activated — set scene.activeCamera = handle.cameras[0] explicitly.",
      "Animated templates: manifest animation block auto-plays per instance — spawn clones skeleton + AnimationGroups (independent timelines from frame 0). Templates hide at spawn start by default; use @exposed({ spawnTemplate: true }) for deferred spawners.",
      "Multi-spawn loops: deferShadowRefresh: true on each Spawn, then spawner.FlushSpawnShadowRefresh() once (populateprefabs.ts). Do not defer for interval spawners — shadows register per spawn.",
      "Spawn is async — call from OnStart via void this.SpawnAll().catch(...) or an async helper.",
      "Paint-scatter: leave color kind blank (auto). Blender may put real paint in COLOR_1 with a fake all-white COLOR_0 — do not require RGB >= 0.99; use luminance threshold (~0.5).",
      "Blender Color Attribute names (Color.001) are not glTF kinds — getVerticesData(\"Color.001\") fails; use COLOR_0 / COLOR_1 or auto-pick.",
    ],
    exposedFields: [
      '@exposed({ type: "list", of: "entity", label: "Prefabs", spawnTemplate: true }) prefabs: (Entity | null)[] = []',
      '@exposed({ type: "entity", label: "Target mesh" }) target: Entity | null = null',
      '@exposed({ type: "list", of: "vector3", label: "Spawn points" }) points: Vector3[] = []',
      '@exposed({ min: 0, max: 1, step: 0.05, label: "Paint luminance threshold" }) paintThreshold = 0.5',
      '@exposed({ label: "Vertex color kind (blank = auto)" }) colorMapName = ""',
    ],
  },
];

export function FindRecipesByIntent(intent: string): Recipe[]
{
  const normalized = intent.toLowerCase();
  const tokens = Tokenize(intent);

  const scored = RECIPES.map((recipe) =>
  {
    let score = 0;

    if (normalized.includes(recipe.name.replace(/-/g, " ")))
    {
      score += 10;
    }

    score += ScoreKeywordMatches(normalized, tokens, recipe.keywords);

    if (recipe.description.toLowerCase().split(/\W+/).some((word) => tokens.includes(word)))
    {
      score += 1;
    }

    return { recipe, score };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.recipe);
}

export function GetRecipeByName(name: string): Recipe | undefined
{
  return RECIPES.find((recipe) => recipe.name === name);
}

const TEMPLATES: Record<string, (className: string) => string> = {
  "minimal-behavior": (className) => `import { Behavior } from "@bjs/engine";

/** TODO: describe what this behavior does. */
export default class ${className} extends Behavior
{
}
`,

  "look-at-target": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";

/** Continuously orients this object to face the target entity. */
export default class ${className} extends Behavior
{
  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  /** Face the target each frame (no-op until a target is assigned). */
  OnUpdate(): void
  {
    if (this.target === null)
    {
      return;
    }

    this.node.lookAt(this.target.node.getAbsolutePosition());
  }
}
`,

  "constant-rotate": (className) => `import { Behavior, exposed } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/** Spins a node around a fixed axis at a constant rate. */
export default class ${className} extends Behavior
{
  @exposed({ min: 0, max: 720, label: "Speed (deg/s)" })
  speed = 45;

  @exposed({ label: "Axis" })
  axis: [number, number, number] = [0, 1, 0];

  private rotationAxis = new Vector3(0, 1, 0);
  private radiansPerSecond = 0;

  /** Cache the axis vector and angular speed once values are applied. */
  OnStart(): void
  {
    this.rotationAxis = Vector3.FromArray(this.axis);
    this.radiansPerSecond = (this.speed * Math.PI) / 180;
  }

  /** Advance the rotation for this frame. */
  OnUpdate(deltaSeconds: number): void
  {
    this.node.rotate(this.rotationAxis, this.radiansPerSecond * deltaSeconds);
  }
}
`,

  "waypoint-path": (className) => `import { Behavior, exposed } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/** Moves the node through a list of waypoints with configurable easing. */
export default class ${className} extends Behavior
{
  @exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] })
  easing = "easeInOut";

  @exposed({ type: "list", of: "vector3", label: "Waypoints" })
  points: Vector3[] = [];

  @exposed({ min: 0.1, label: "Seconds per leg" })
  legDuration = 2;

  private elapsedSeconds = 0;

  /** Interpolate along the current leg using the chosen easing. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.points.length < 2)
    {
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    const totalDuration = this.legDuration * (this.points.length - 1);
    const phase = (this.elapsedSeconds % totalDuration) / this.legDuration;
    const legIndex = Math.floor(phase);

    let blend = phase - legIndex;
    if (this.easing === "snap")
    {
      blend = blend < 0.5 ? 0 : 1;
    }
    else if (this.easing === "easeInOut")
    {
      blend = blend * blend * (3 - 2 * blend);
    }

    this.node.position = Vector3.Lerp(this.points[legIndex], this.points[legIndex + 1], blend);
  }
}
`,

  "patrol-oscillate": (className) => `import { Behavior, exposed } from "@bjs/engine";
import { Vector3, PhysicsMotionType } from "@babylonjs/core";

/** Eases a node back and forth between its start and start + offset. */
export default class ${className} extends Behavior
{
  @exposed({ label: "Offset" })
  offset: [number, number, number] = [5, 0, 0];

  @exposed({ min: 0.1, label: "Period (s)" })
  period = 4;

  private startPosition = new Vector3();
  private endPosition = new Vector3();
  private elapsedSeconds = 0;

  /** Capture the endpoints and make any physics body kinematic. */
  OnStart(): void
  {
    this.startPosition = this.node.position.clone();
    this.endPosition = this.startPosition.add(Vector3.FromArray(this.offset));

    if (this.entity.body !== undefined)
    {
      this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
    }
  }

  /** Lerp between the endpoints on a sine ease. */
  OnUpdate(deltaSeconds: number): void
  {
    this.elapsedSeconds += deltaSeconds;
    const blend = (Math.sin((this.elapsedSeconds / this.period) * Math.PI * 2) + 1) / 2;
    this.node.position = Vector3.Lerp(this.startPosition, this.endPosition, blend);
  }
}
`,

  "input-poll-move": (className) => `import { Behavior, exposed, inputMap } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";
import { PlayerActions } from "../InputActions";

/** Moves on the XZ plane using the Player map Move action. */
export default class ${className} extends Behavior
{
  @exposed({ min: 0.1, max: 30, label: "Speed (u/s)" })
  speed = 5;

  @inputMap("Player") player!: InputActionMap;

  /** Poll named actions each frame. */
  OnUpdate(deltaSeconds: number): void
  {
    const move = this.player.FindAction(PlayerActions.Move)?.ReadVector2() ?? { x: 0, y: 0 };

    if (move.x !== 0 || move.y !== 0)
    {
      const step = new Vector3(move.x, 0, move.y).normalize().scale(this.speed * deltaSeconds);
      this.node.position.addInPlace(step);
    }
  }
}
`,

  "on-message-handler": (className) => `import { Behavior, exposed } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

/** Logs or reacts when this entity receives a message. */
export default class ${className} extends Behavior
{
  @exposed({ label: "Only message (empty = all)" })
  onlyMessage = "";

  /** Handle messages from triggers or SendMessage. */
  OnMessage(message: string, source: Entity): void
  {
    if (this.onlyMessage.length > 0 && message !== this.onlyMessage)
    {
      return;
    }

    // {{CUSTOM_LOGIC}}
    console.log(\`[\${this.entity.name}] "\${message}" from "\${source.name}"\`);
  }
}
`,

  "animation-cycle": (className) => `import { Behavior, exposed } from "@bjs/engine";

/** Cycles through this entity's animation clips on an interval. */
export default class ${className} extends Behavior
{
  @exposed({ min: 0.5, label: "Switch every (s)" })
  interval = 3;

  @exposed({ label: "Loop each clip" })
  loop = true;

  private elapsedSeconds = 0;
  private currentClipIndex = 0;

  /** Start on the first clip. */
  OnStart(): void
  {
    this.Play(0);
  }

  /** Advance to the next clip once the interval elapses. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.entity.animations.length < 2)
    {
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    if (this.elapsedSeconds >= this.interval)
    {
      this.elapsedSeconds = 0;
      this.currentClipIndex = (this.currentClipIndex + 1) % this.entity.animations.length;
      this.Play(this.currentClipIndex);
    }
  }

  /** Stop all clips and start the one at the given index. */
  private Play(index: number): void
  {
    for (const group of this.entity.animations)
    {
      group.stop();
    }
    this.entity.animations[index]?.start(this.loop);
  }
}
`,

  "kinematic-body-move": (className) => `import { Behavior } from "@bjs/engine";
import { PhysicsMotionType } from "@babylonjs/core";

/** Template for per-frame node motion on a physics body — set kinematic first. */
export default class ${className} extends Behavior
{
  /** Make the body kinematic before driving the node each frame. */
  OnStart(): void
  {
    if (this.entity.body !== undefined)
    {
      this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
    }
  }

  /** Drive motion here — scale continuous changes by deltaSeconds. */
  OnUpdate(deltaSeconds: number): void
  {
    // {{CUSTOM_LOGIC}}
  }
}
`,

  "trigger-logger": (className) => `import { Behavior, exposed } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

/** Logs when a trigger collider is overlapped (needs a trigger COLLIDER). */
export default class ${className} extends Behavior
{
  @exposed({ label: "Message" })
  message = "";

  private LogLabel(): string
  {
    return this.message.length > 0 ? this.message : this.entity.name;
  }

  OnTriggerEnter(other: Entity): void
  {
    console.log(\`[trigger] \${this.LogLabel()} enter "\${other.name}"\`);
  }

  OnTriggerExit(other: Entity): void
  {
    console.log(\`[trigger] \${this.LogLabel()} exit "\${other.name}"\`);
  }
}
`,

  "collision-probe": (className) => `import { Behavior, exposed } from "@bjs/engine";
import type { CollisionContact, Entity } from "@bjs/engine";

/** Logs Unity-style collision/trigger lifecycle hooks. */
export default class ${className} extends Behavior
{
  @exposed({ label: "Only tag (empty = all)" })
  onlyTag = "";

  private ShouldLog(other: Entity): boolean
  {
    return this.onlyTag.length === 0 || other.tag === this.onlyTag;
  }

  OnCollisionEnter(other: Entity, contact: CollisionContact): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }
    console.log(\`[${className}:\${this.entity.name}] OnCollisionEnter "\${other.name}"\`, contact);
  }

  OnCollisionStay(other: Entity, contact: CollisionContact): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }
    console.log(\`[${className}:\${this.entity.name}] OnCollisionStay "\${other.name}"\`, contact.distance);
  }

  OnCollisionExit(other: Entity): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }
    console.log(\`[${className}:\${this.entity.name}] OnCollisionExit "\${other.name}"\`);
  }

  OnTriggerEnter(other: Entity): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }
    console.log(\`[${className}:\${this.entity.name}] OnTriggerEnter "\${other.name}"\`);
  }

  OnTriggerExit(other: Entity): void
  {
    if (!this.ShouldLog(other))
    {
      return;
    }
    console.log(\`[${className}:\${this.entity.name}] OnTriggerExit "\${other.name}"\`);
  }
}
`,

  "constraint-hinge-motor": (className) => `import { Behavior, exposed, inputMap, type Entity } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";
import {
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core";

/** Drives a hinge constraint motor from input. HINGE must be authored in Blender on the wheel entity. */
export default class ${className} extends Behavior
{
  @exposed({ type: "entity", label: "Wheel" })
  wheel: Entity | null = null;

  @exposed({ min: 0, max: 100, label: "Motor Speed" })
  speed = 10;

  @exposed({ min: 0, max: 1000, label: "Motor Force" })
  force = 100;

  @inputMap("Player") player!: InputActionMap;

  private hinge?: Physics6DoFConstraint;

  /** Resolve the hinge constraint attachment on the wheel. */
  OnStart(): void
  {
    this.hinge = this.ResolveWheelHinge(this.wheel);
  }

  /** Poll input and drive the hinge motor. */
  OnUpdate(_deltaSeconds: number): void
  {
    const forward = this.player.FindAction("Forward")?.IsPressed() === true;
    const backward = this.player.FindAction("Backward")?.IsPressed() === true;

    let motorSpeed = 0;
    if (forward)
    {
      motorSpeed = this.speed;
    }
    else if (backward)
    {
      motorSpeed = -this.speed;
    }

    this.SetWheelMotor(this.hinge, motorSpeed);
  }

  /** Find the HINGE constraint attachment on a wheel entity (built at load time). */
  private ResolveWheelHinge(wheelEntity: Entity | null): Physics6DoFConstraint | undefined
  {
    if (wheelEntity === null)
    {
      return undefined;
    }

    for (const row of wheelEntity.GetAttachmentsOfType("CONSTRAINT"))
    {
      if (row.data.constraintType !== "HINGE")
      {
        continue;
      }

      if (row.constraint instanceof Physics6DoFConstraint)
      {
        return row.constraint;
      }
    }

    console.warn(\`[\${this.entity.name}] "\${wheelEntity.name}" has no HINGE constraint\`);
    return undefined;
  }

  /** Drive a hinge motor at the given speed (degrees per second). */
  private SetWheelMotor(
    hinge: Physics6DoFConstraint | undefined,
    speedDegreesPerSecond: number
  ): void
  {
    if (hinge === undefined)
    {
      return;
    }

    const motorAxis = PhysicsConstraintAxis.ANGULAR_X;

    if (speedDegreesPerSecond === 0)
    {
      hinge.setAxisMotorTarget(motorAxis, 0);
      return;
    }

    hinge.setAxisMotorType(motorAxis, PhysicsConstraintMotorType.VELOCITY);
    hinge.setAxisMotorTarget(motorAxis, speedDegreesPerSecond * (Math.PI / 180));
    hinge.setAxisMotorMaxForce(motorAxis, this.force);
  }
}
`,

  "path-follow-advanced": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Path3D, Quaternion, Vector3, PhysicsMotionType } from "@babylonjs/core";

/** Moves along a Path3D built from waypoint entities with throttle and tangent facing. */
export default class ${className} extends Behavior
{
  @exposed({ type: "enum", options: ["linear", "easeInOut", "snap"] })
  easing = "easeInOut";

  @exposed({ type: "list", of: "entity", label: "Waypoints" })
  targets: (Entity | null)[] = [];

  @exposed({ min: 0.1, label: "Speed (units/s)" })
  throttleSpeed = 1;

  @exposed({ min: 0.1, label: "Acceleration (units/s²)" })
  acceleration = 5;

  @exposed({ min: 0.1, label: "Deceleration (units/s²)" })
  deceleration = 8;

  private path: Path3D | null = null;
  private currentProgress = 0;
  private maxDuration = 0;
  private currentThrottle = 0;
  private currentQuaternion = new Quaternion();

  /** Build Path3D from waypoint entities and configure any physics body. */
  OnStart(): void
  {
    const points: Vector3[] = [];
    for (const target of this.targets)
    {
      if (target !== null)
      {
        points.push(target.node.getAbsolutePosition());
      }
    }

    if (points.length >= 2)
    {
      this.path = new Path3D(points);
      this.maxDuration = this.path.length();
      this.node.position = this.path.getPointAt(0);
      const forward = this.path.getTangentAt(0, true);
      this.currentQuaternion = Quaternion.FromLookDirectionRH(forward, Vector3.Up());
      this.node.rotationQuaternion = this.currentQuaternion;
    }

    if (this.entity.body !== undefined)
    {
      this.entity.body.setMotionType(PhysicsMotionType.ANIMATED);
      this.entity.body.disablePreStep = false;
    }
  }

  /** Advance along the path with smoothed throttle input. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.path === null || this.maxDuration <= 0)
    {
      return;
    }

    let targetThrottle = 0;
    if (this.input?.FindAction("Throttle Up")?.IsPressed() === true && this.currentProgress < this.maxDuration)
    {
      targetThrottle += 1;
    }
    if (this.input?.FindAction("Throttle Down")?.IsPressed() === true && this.currentProgress > 0)
    {
      targetThrottle -= 1;
    }

    const accelerating = targetThrottle > this.currentThrottle;
    const rate = accelerating ? this.acceleration : this.deceleration;
    const throttleStep = rate * deltaSeconds;
    if (Math.abs(targetThrottle - this.currentThrottle) <= throttleStep)
    {
      this.currentThrottle = targetThrottle;
    }
    else if (accelerating)
    {
      this.currentThrottle += throttleStep;
    }
    else
    {
      this.currentThrottle -= throttleStep;
    }

    this.currentProgress += this.currentThrottle * this.throttleSpeed * deltaSeconds;
    this.currentProgress = Math.max(0, Math.min(this.maxDuration, this.currentProgress));

    let normalizedProgress = this.currentProgress / this.maxDuration;
    if (this.easing === "snap")
    {
      normalizedProgress = normalizedProgress < 0.5 ? 0 : 1;
    }
    else if (this.easing === "easeInOut")
    {
      normalizedProgress = normalizedProgress * normalizedProgress * (3 - 2 * normalizedProgress);
    }

    this.node.position = this.path.getPointAt(normalizedProgress);
    const forward = this.path.getTangentAt(normalizedProgress, true);
    Quaternion.FromRotationMatrixToRef(this.node.getWorldMatrix(), this.currentQuaternion);
    const targetQuaternion = Quaternion.FromLookDirectionRH(forward, Vector3.Up());
    Quaternion.SmoothToRef(this.currentQuaternion, targetQuaternion, deltaSeconds, 0.1, this.currentQuaternion);
    this.node.rotationQuaternion = this.currentQuaternion;
  }
}
`,

  "camera-follow": (className) => `import { Behavior, exposed, CopyLens, FindCameraForNode, type Entity } from "@bjs/engine";
import { Vector3, UniversalCamera, Tools } from "@babylonjs/core";

/** Orbits a UniversalCamera around a target entity. */
export default class ${className} extends Behavior
{
  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  @exposed({ min: 0, max: 360, label: "Orbit Speed (deg/s)" })
  orbitSpeed = 45;

  @exposed({ min: 0.1, max: 100, label: "Radius" })
  radius = 10;

  @exposed({ min: -10, max: 10, label: "Height Offset" })
  heightOffset = 2;

  private camera: UniversalCamera | null = null;
  private angle = 0;
  private orbitSpeedRadians = 0;

  /** Create the camera, copy Blender lens settings, and make it active. */
  OnStart(): void
  {
    this.orbitSpeedRadians = Tools.ToRadians(this.orbitSpeed);
    const position = this.node.getAbsolutePosition();
    const authoredCamera = FindCameraForNode(this.scene, this.node);
    this.camera = new UniversalCamera(this.node.name, position, this.scene);
    if (authoredCamera !== null)
    {
      CopyLens(authoredCamera, this.camera);
    }
    this.scene.activeCamera = this.camera;
  }

  /** Orbit around the target each frame. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.target === null || this.camera === null)
    {
      return;
    }

    this.angle += this.orbitSpeedRadians * deltaSeconds;
    const targetPosition = this.target.node.getAbsolutePosition();
    const offsetX = Math.cos(this.angle) * this.radius;
    const offsetZ = Math.sin(this.angle) * this.radius;

    this.camera.position = new Vector3(
      targetPosition.x + offsetX,
      targetPosition.y + this.heightOffset,
      targetPosition.z + offsetZ
    );
    this.camera.setTarget(targetPosition);
  }
}
`,

  "geospatial-camera-flyto": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";
import { GeospatialCamera } from "@babylonjs/core/Cameras/geospatialCamera";

/** Fly the authored GeospatialCamera toward a target (Camera component GEOSPATIAL in Blender). */
export default class ${className} extends Behavior
{
  @exposed({ type: "entity", label: "Fly-to target" })
  destination: Entity | null = null;

  @exposed({ min: 0.05, max: 1, label: "Distance scale" })
  distanceScale = 0.5;

  @exposed({ min: 100, max: 10000, label: "Duration (ms)" })
  durationMs = 1500;

  @exposed({ label: "Trigger message (empty = OnStart)" })
  triggerMessage = "";

  /** Fly on load when no trigger message is set. */
  OnStart(): void
  {
    if (this.triggerMessage.length === 0)
    {
      void this.FlyToDestination();
    }
  }

  /** Fly when a matching message arrives (e.g. trigger or GUI click). */
  OnMessage(message: string, _source: Entity): void
  {
    if (this.triggerMessage.length > 0 && message === this.triggerMessage)
    {
      void this.FlyToDestination();
    }
  }

  /** Fly the active GeospatialCamera toward the configured destination. */
  private async FlyToDestination(): Promise<void>
  {
    if (this.destination === null)
    {
      return;
    }

    const activeCamera = this.scene.activeCamera;
    // scene.activeCamera is Nullable<Camera> — truthiness catches null and undefined at runtime.
    if (!activeCamera)
    {
      return;
    }
    if (!(activeCamera instanceof GeospatialCamera))
    {
      console.warn(\`[\${this.entity.name}] active camera is not a GeospatialCamera\`);
      return;
    }

    const destinationPoint = this.destination.node.getAbsolutePosition();
    await activeCamera.flyToPointAsync(destinationPoint, this.distanceScale, this.durationMs);
  }
}
`,

  "message-state-handler": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";

/** Simple message-driven state machine — customize OnUpdate for each state. */
export default class ${className} extends Behavior
{
  @exposed({ type: "enum", options: ["idle", "active", "done"] })
  state = "idle";

  @exposed({ label: "Activate on message" })
  activateMessage = "start";

  /** React to incoming messages and transition state. */
  OnMessage(message: string, source: Entity): void
  {
    if (message === this.activateMessage && this.state === "idle")
    {
      this.state = "active";
      console.log(\`[\${this.entity.name}] activated by "\${source.name}"\`);
    }
  }

  /** Run logic for the current state each frame. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.state === "idle")
    {
      return;
    }

    if (this.state === "active")
    {
      // {{CUSTOM_LOGIC}}
    }
  }
}
`,

  "hover-bob": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/** Bobs the node up and down, optionally facing a target. */
export default class ${className} extends Behavior
{
  @exposed({ min: 0, max: 5, step: 0.1, label: "Amplitude (m)" })
  amplitude = 0.5;

  @exposed({ min: 0.1, max: 4, label: "Period (s)" })
  period = 2;

  @exposed({ type: "entity", label: "Face target" })
  target: Entity | null = null;

  private restY = 0;
  private elapsedSeconds = 0;

  OnStart(): void
  {
    this.restY = this.node.position.y;
  }

  OnUpdate(deltaSeconds: number): void
  {
    this.elapsedSeconds += deltaSeconds;
    const offset = Math.sin((this.elapsedSeconds / this.period) * Math.PI * 2) * this.amplitude;
    this.node.position.y = this.restY + offset;

    if (this.target !== null)
    {
      this.node.lookAt(this.target.node.getAbsolutePosition());
    }
  }
}
`,

  "reveal-on-message": (className) => `import { Behavior, exposed, SetEntityActive, type Entity } from "@bjs/engine";

/** Reveals this entity when a matching message arrives (trigger or SendMessage). */
export default class ${className} extends Behavior
{
  @exposed({ label: "Reveal on message" })
  revealMessage = "reveal";

  OnStart(): void
  {
    // Load hide keeps entity.active === true, so create a real transition first —
    // otherwise the enable below would be a no-op.
    SetEntityActive(this.entity, false);
  }

  OnMessage(message: string, _source: Entity): void
  {
    if (message !== this.revealMessage)
    {
      return;
    }

    SetEntityActive(this.entity, true);
  }
}
`,

  "toggle-entity-active": (className) => `import { Behavior, exposed, IsEntityInsideColliderVolume, SetEntityActive } from "@bjs/engine";
import type { AttachmentOfType, Entity } from "@bjs/engine";

/** Toggle target entities when a probe enters or exits a trigger volume. */
export default class ${className} extends Behavior
{
  @exposed({ type: "entity", label: "Volume" })
  volume: Entity | null = null;

  @exposed({ type: "entity", label: "Probe" })
  probe: Entity | null = null;

  @exposed({ type: "list", of: "entity", label: "Targets" })
  targets: (Entity | null)[] = [];

  private volumeAttachment: AttachmentOfType<"COLLIDER"> | undefined;
  private probeInside = false;

  OnStart(): void
  {
    if (this.volume !== null)
    {
      this.volumeAttachment = this.volume.GetAttachment("COLLIDER");
    }

    this.ApplyTargets(false);
    this.probeInside = this.IsProbeInsideVolume();
    this.ApplyTargets(this.probeInside);
  }

  OnUpdate(_deltaSeconds: number): void
  {
    const inside = this.IsProbeInsideVolume();
    if (inside === this.probeInside)
    {
      return;
    }

    this.probeInside = inside;
    this.ApplyTargets(inside);
  }

  private IsProbeInsideVolume(): boolean
  {
    if (this.volume === null || this.probe === null)
    {
      return false;
    }

    return IsEntityInsideColliderVolume(this.probe, this.volume, this.volumeAttachment);
  }

  private ApplyTargets(active: boolean): void
  {
    for (const target of this.targets)
    {
      if (target !== null)
      {
        SetEntityActive(target, active);
      }
    }
  }
}
`,

  "sound-on-message": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";

/** Plays an AUDIO component sound when a matching message arrives. */
export default class ${className} extends Behavior
{
  @exposed({ label: "Sound stem" })
  soundName = "door";

  @exposed({ label: "Play on message" })
  playMessage = "open";

  OnMessage(message: string, _source: Entity): void
  {
    if (message !== this.playMessage)
    {
      return;
    }

    this.entity.GetSound(this.soundName)?.play();
  }
}
`,

  "msdf-label-update": (className) => `import { Behavior, exposed } from "@bjs/engine";

/** Updates MSDF_TEXT label copy (MSDF_TEXT component must be authored in Blender). */
export default class ${className} extends Behavior
{
  @exposed({ label: "Font stem" })
  fontStem = "roboto-regular";

  @exposed({ label: "Label text" })
  labelText = "Hello";

  OnStart(): void
  {
    this.RefreshLabel();
  }

  OnUpdate(_deltaSeconds: number): void
  {
    // Call RefreshLabel() when labelText changes at runtime, or poll here if needed.
  }

  private RefreshLabel(): void
  {
    const label = this.entity.GetTextRenderer(this.fontStem);
    if (label === undefined)
    {
      return;
    }

    label.clearParagraphs();
    label.addParagraph(this.labelText, { textAlign: "center" });
  }
}
`,

  "rover-wheel-drive": (className) => `import { Behavior, exposed, inputMap, type Entity } from "@bjs/engine";
import type { InputActionMap } from "@bjs/engine";
import {
  Physics6DoFConstraint,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core";

/** Drives hinge motors on multiple wheel entities (HINGE constraints authored in Blender). */
export default class ${className} extends Behavior
{
  @exposed({ type: "list", of: "entity", label: "Wheels" })
  wheels: (Entity | null)[] = [];

  @exposed({ min: 0, max: 100, label: "Drive speed (deg/s)" })
  driveSpeed = 30;

  @exposed({ min: 0, max: 1000, label: "Motor force" })
  motorForce = 200;

  @inputMap("Player") player!: InputActionMap;

  private hinges: Physics6DoFConstraint[] = [];

  OnStart(): void
  {
    for (const wheel of this.wheels)
    {
      if (wheel === null)
      {
        continue;
      }

      const hinge = this.ResolveHinge(wheel);
      if (hinge !== undefined)
      {
        this.hinges.push(hinge);
      }
    }
  }

  OnUpdate(_deltaSeconds: number): void
  {
    const forward = this.player.FindAction("Forward")?.IsPressed() === true;
    const backward = this.player.FindAction("Backward")?.IsPressed() === true;

    let motorSpeed = 0;
    if (forward)
    {
      motorSpeed = this.driveSpeed;
    }
    else if (backward)
    {
      motorSpeed = -this.driveSpeed;
    }

    for (const hinge of this.hinges)
    {
      this.SetMotor(hinge, motorSpeed);
    }
  }

  private ResolveHinge(wheelEntity: Entity): Physics6DoFConstraint | undefined
  {
    for (const row of wheelEntity.GetAttachmentsOfType("CONSTRAINT"))
    {
      if (row.data.constraintType !== "HINGE")
      {
        continue;
      }

      if (row.constraint instanceof Physics6DoFConstraint)
      {
        return row.constraint;
      }
    }

    return undefined;
  }

  private SetMotor(hinge: Physics6DoFConstraint, speedDegreesPerSecond: number): void
  {
    const motorAxis = PhysicsConstraintAxis.ANGULAR_X;

    if (speedDegreesPerSecond === 0)
    {
      hinge.setAxisMotorTarget(motorAxis, 0);
      return;
    }

    hinge.setAxisMotorType(motorAxis, PhysicsConstraintMotorType.VELOCITY);
    hinge.setAxisMotorTarget(motorAxis, speedDegreesPerSecond * (Math.PI / 180));
    hinge.setAxisMotorMaxForce(motorAxis, this.motorForce);
  }
}
`,

  "scatter-prefab-spawner": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/**
 * Spawns full prefab instances of a template entity at authored points.
 * Each instance goes through this.spawner.Spawn — colliders, scripts,
 * constraints, and internal GUID refs all work per instance.
 */
export default class ${className} extends Behavior
{
  @exposed({ type: "entity", label: "Prefab", spawnTemplate: true })
  prefab: Entity | null = null;

  @exposed({ type: "list", of: "vector3", label: "Spawn points" })
  points: Vector3[] = [];

  /** Kick off async spawn once the level has begun. */
  OnStart(): void
  {
    if (this.prefab === null)
    {
      console.warn("[${className}] prefab not assigned");
      return;
    }

    void this.SpawnAll().catch((error) =>
    {
      console.error("[${className}] spawn failed", error);
    });
  }

  /** Duplicate the template at every authored spawn point. */
  private async SpawnAll(): Promise<void>
  {
    if (this.prefab === null)
    {
      return;
    }

    for (const point of this.points)
    {
      await this.spawner.Spawn(this.prefab, {
        position: point.clone(),
        deferShadowRefresh: true,
      });
    }

    this.spawner.FlushSpawnShadowRefresh();
  }
}
`,

  "animator-driver": (className) => `import { Behavior, exposed, type AnimatorController } from "@bjs/engine";

/**
 * Thin driver for an ANIMATOR component on the same entity (the armature).
 * Sets animator parameters from input — the FSM graph lives in Blender.
 */
export default class ${className} extends Behavior
{
  @exposed({ min: 0, label: "Speed scale" })
  speedScale = 1;

  private animator: AnimatorController | undefined;

  OnStart(): void
  {
    const attachment = this.entity.GetAttachment("ANIMATOR");
    if (attachment === undefined || attachment.type !== "ANIMATOR")
    {
      console.warn(
        \`[${className}] no ANIMATOR on "\${this.entity.name}" — attach Animator in Blender\`
      );
      return;
    }

    this.animator = attachment.behavior;
  }

  OnUpdate(_deltaSeconds: number): void
  {
    if (this.animator === undefined)
    {
      return;
    }

    const move = this.input?.FindAction("Move");
    const magnitude = move !== undefined ? move.ReadValue() : 0;
    this.animator.SetFloat("Speed", magnitude * this.speedScale);
  }
}
`,

  "pool-prefab-spawner": (className) => `import { Behavior, exposed, type Entity } from "@bjs/engine";
import { Vector3 } from "@babylonjs/core";

/**
 * Maintains a fixed pool of prefab instances. Spawns at intervals with
 * grow-in scaling; disposes and replaces when lifetime expires.
 * See animalSpawner.ts for trigger gating, shrink-out, and volume sampling.
 */
export default class ${className} extends Behavior
{
  @exposed({ type: "list", of: "entity", label: "Prefabs", spawnTemplate: true })
  prefabs: (Entity | null)[] = [];

  @exposed({ type: "entity", label: "Spawn volume (collider)" })
  spawnVolume: Entity | null = null;

  @exposed({ min: 1, step: 1, label: "Spawn count" })
  spawnCount = 10;

  @exposed({ min: 0, step: 0.1, label: "Spawn interval (s)" })
  spawnInterval = 0.5;

  @exposed({ min: 0.1, max: 300, label: "Min lifetime (s)" })
  lifetimeMin = 60;

  @exposed({ min: 0.1, max: 600, label: "Max lifetime (s)" })
  lifetimeMax = 120;

  @exposed({ min: 0.1, max: 30, step: 0.1, label: "Grow duration (s)" })
  growDuration = 3;

  private readonly zeroScale = new Vector3(0, 0, 0);

  OnStart(): void
  {
    void this.FillPool().catch((error) =>
    {
      console.error("[${className}] spawn failed", error);
    });
  }

  OnUpdate(_deltaSeconds: number): void
  {
    // Tick lifetimes, lerp grow/shrink scales, dispose expired — see animalSpawner.ts
  }

  /** Spawn one instance at a world position — parent: null, zero initial scale. */
  private async SpawnOne(template: Entity, position: Vector3): Promise<Entity | null>
  {
    const targetScale = template.node.scaling.clone();

    const handle = await this.spawner.Spawn(template, {
      position,
      parent: null,
      scaling: this.zeroScale,
    });

    // Lerp handle.rootEntity.node.scaling from zero → targetScale in OnUpdate
    return handle.rootEntity;
  }

  private async FillPool(): Promise<void>
  {
    // Sample spawnVolume collider bounds in world space; call SpawnOne on an interval
    // Do NOT pass deferShadowRefresh — spawns are spread over time
  }
}
`,
};

export function GetRecipeTemplate(recipeName: string, className: string): string | undefined
{
  const builder = TEMPLATES[recipeName];
  if (builder === undefined)
  {
    return undefined;
  }

  const safeName = className.replace(/[^A-Za-z0-9_]/g, "");
  if (safeName.length === 0)
  {
    return undefined;
  }

  return builder(safeName);
}
