/**
 * The manifest schema: TypeScript mirrors of everything the Blender exporter
 * writes into `.scene.json`. Data shapes only — the runtime Entity class lives
 * in Entity.ts, and the loader that consumes these lives in LevelLoader.ts.
 */
/**
 * Custom-property / glTF-extras key holding each entity's GUID. Must match the
 * Blender add-on's ID_KEY. Surfaces at node.metadata.gltf.extras[ID_KEY].
 */
export const ID_KEY = "bjs_id";

// ---- Manifest schema (mirrors the Blender exporter output) ----

export interface TagComponent {
  type: "TAG";
  tag: string;
}

export interface ColliderComponent {
  type: "COLLIDER";
  shape: "BOX" | "SPHERE" | "CAPSULE" | "CYLINDER" | "CONVEX" | "MESH";
  isTrigger: boolean;
  autoFit: boolean;
  size: [number, number, number];
  radius: number;
  height: number;
  center: [number, number, number];
  rotation?: [number, number, number, number]; // quaternion xyzw (manual shapes)
  /** Authored trigger reactions: on enter, send `message` to `target`. */
  events?: TriggerEventData[];
}

export interface TriggerEventData {
  /** GUID of the entity whose behaviors receive the message (null = unset). */
  target: string | null;
  message: string;
  /** Only entities carrying this tag set the event off; empty = any entity. */
  filterTag: string;
}

export interface RigidBodyComponent {
  type: "RIGIDBODY";
  bodyType: "DYNAMIC" | "STATIC" | "KINEMATIC";
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
}

export interface ScriptComponent {
  type: "SCRIPT";
  script: string;
  path?: string;
  vars?: Record<string, number | boolean | string | number[] | null>;
}

export interface CameraKeys {
  scheme: "ARROWS" | "WASD" | "BOTH" | "CUSTOM";
  up: string;    // single chars, used only for CUSTOM
  down: string;
  left: string;
  right: string;
}

export interface CameraComponent {
  type: "CAMERA";
  cameraType: "FREE" | "UNIVERSAL" | "ARC" | "FOLLOW";
  attachControl: boolean;
  keys: CameraKeys;       // key bindings when controls are attached (not FOLLOW)
  useBlenderTransform: boolean; // FOLLOW/ORBIT: derive radius/height/angle from the exported camera
  followMode: "ORBIT" | "OFFSET"; // FOLLOW: orbit with target yaw, or keep a fixed world offset
  speed: number;
  inertia: number;
  radius: number;        // ARC: orbit distance
  lowerRadius: number;   // ARC: min zoom (0 = none)
  upperRadius: number;   // ARC: max zoom (0 = none)
  target: string | null; // ARC orbit pivot / FOLLOW target entity GUID
  distance: number;      // FOLLOW: follow distance
  height: number;        // FOLLOW: height offset
  rotationOffset: number;// FOLLOW: angle behind target (deg)
}

export interface ConstraintComponent {
  type: "CONSTRAINT";
  constraintType: "FIXED" | "BALL" | "HINGE" | "SLIDER" | "SPRING";
  /** GUID of the other body's entity (null = unset). */
  target: string | null;
  /** Joint anchor in the OWNER's local space, already converted to Babylon Y-up. */
  pivot: [number, number, number];
  /** Hinge/slide/spring axis in the owner's local space (Babylon Y-up unit vector). */
  axis: [number, number, number];
  /** Allow the two jointed bodies to collide with each other. */
  collision: boolean;
  useLimits: boolean;
  /** Degrees for HINGE; meters for SLIDER/SPRING. */
  min: number;
  max: number;
  /** SPRING only. */
  stiffness: number;
  damping: number;
  /** HINGE/SLIDER only: drive the joint at a target speed. */
  motor: boolean;
  /** Deg/s for HINGE; m/s for SLIDER. */
  motorSpeed: number;
  motorMaxForce: number;
}

export interface AudioComponent {
  type: "AUDIO";
  /** Manifest-relative path ("audio/door.mp3"); null if the source file was missing. */
  file: string | null;
  volume: number;
  loop: boolean;
  autoPlay: boolean;
  /** True: 3D-positioned at the entity's node. False: ambient. */
  spatial: boolean;
  maxDistance: number;
  playbackRate: number;
}

export type Component =
  | TagComponent
  | ColliderComponent
  | RigidBodyComponent
  | ScriptComponent
  | CameraComponent
  | AudioComponent
  | ConstraintComponent;

export interface ShadowSettings {
  mapSize?: number;    // per-light resolution override; 0/undefined = loader default
  bias?: number;
  normalBias?: number;
  darkness?: number;   // 0 = black shadow, 1 = invisible
  minZ?: number;       // light.shadowMinZ; 0 = auto
  maxZ?: number;       // light.shadowMaxZ; 0 = auto
  filter?: "PCF" | "PCSS" | "POISSON" | "BLUR_ESM" | "NONE";
}

export interface LightInfo {
  type: "POINT" | "SUN" | "SPOT" | "AREA";
  color: [number, number, number];
  energy: number;
  range?: number;
  spotSize?: number;   // full cone angle, radians (spot only)
  spotBlend?: number;  // 0..1 edge softness (spot only)
  castShadows: boolean;
  shadow?: ShadowSettings; // present when castShadows; per-light Babylon controls
}

export interface CameraInfo {
  type: "PERSP" | "ORTHO" | "PANO";
  clipStart: number;
  clipEnd: number;
  fov?: number;        // vertical FOV in radians (PERSP/PANO)
  orthoScale?: number; // ORTHO only (bounds otherwise come from the glb)
  active: boolean;     // is this the Blender scene's active camera?
}

export interface AnimationInfo {
  autoPlay: boolean;
  clip: string;        // clip to auto-play (blank = first found)
  loop: boolean;
  speed: number;
  clips: string[];     // NLA strip names present (informational)
}

export interface EntityData {
  id: string;
  name: string;
  parent: string | null;
  components: Component[];
  light?: LightInfo;   // auto-derived from a Blender lamp; not a component
  camera?: CameraInfo; // auto-derived from a Blender camera; not a component
  animation?: AnimationInfo; // NLA clips + autoplay; not a component
}

export interface EnvironmentInfo {
  file: string;        // path relative to the manifest (e.g. "env/sky.env")
  intensity: number;
  rotationY: number;   // radians
  createSkybox: boolean;
}

export interface FogInfo {
  mode: "LINEAR" | "EXP" | "EXP2";
  color: [number, number, number];
  density: number;
  start: number;
  end: number;
}

export interface PostProcessingInfo {
  defaultPipeline: boolean;
  fxaa: boolean;
  bloom: { enabled: boolean; threshold: number; intensity: number };
  ssao: boolean;
  toneMapping: boolean;
  exposure: number;
  contrast: number;
}

export interface SceneInfo {
  clearColor?: [number, number, number, number];
  ambientColor?: [number, number, number];
  environment?: EnvironmentInfo | null;
  fog?: FogInfo | null;
  postProcessing?: PostProcessingInfo | null;
}

export interface LevelManifest {
  version: number;
  glb: string;
  /** Exported with "Debug Build" on: enables runtime debug keys. Missing = true. */
  debug?: boolean;
  scene?: SceneInfo;   // optional scene-wide render settings
  entities: EntityData[];
}
