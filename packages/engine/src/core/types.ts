/**
 * The manifest schema: TypeScript mirrors of everything the Blender exporter
 * writes into `.scene.json`. Data shapes only — the runtime Entity class lives
 * in Entity.ts, and the loader that consumes these lives in LevelLoader.ts.
 */
/**
 * Custom-property / glTF-extras key holding each entity's GUID. Must match 
 * the
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

/** One 6DoF axis in a CUSTOM constraint (constraint-frame coordinates). */
export type ConstraintAxisName =
  | "LINEAR_X"
  | "LINEAR_Y"
  | "LINEAR_Z"
  | "ANGULAR_X"
  | "ANGULAR_Y"
  | "ANGULAR_Z";

export type ConstraintAxisMode = "free" | "locked" | "limited" | "spring";

export interface ConstraintAxisConfig {
  axis: ConstraintAxisName;
  mode: ConstraintAxisMode;
  /** Degrees for angular axes; meters for linear. LIMITED/SPRING only. */
  min?: number;
  max?: number;
  /** SPRING only. */
  stiffness?: number;
  damping?: number;
}

export interface ConstraintComponent {
  type: "CONSTRAINT";
  constraintType: "FIXED" | "BALL" | "HINGE" | "SLIDER" | "SPRING" | "CUSTOM";
  /** GUID of the other body's entity (null = unset). */
  target: string | null;
  /** Joint anchor in the OWNER's local space, already converted to Babylon Y-up. */
  pivot: [number, number, number];
  /** Frame X axis in the owner's local space (Babylon Y-up unit vector). */
  axis: [number, number, number];
  /** Allow the two jointed bodies to collide with each other. */
  collision: boolean;
  useLimits: boolean;
  /** Degrees for HINGE; meters for SLIDER/SPRING. Preset types only. */
  min: number;
  max: number;
  /** SPRING preset only. */
  stiffness: number;
  damping: number;
  /** HINGE/SLIDER preset only: drive the joint at a target speed. */
  motor: boolean;
  /** Deg/s for HINGE; m/s for SLIDER. */
  motorSpeed: number;
  motorMaxForce: number;
  /** CUSTOM only: per-axis 6DoF configuration (omit axis = FREE at runtime). */
  axes?: ConstraintAxisConfig[];
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

export interface GuiComponent {
  type: "GUI";
  /** Manifest-relative path ("gui/hud.json"); null if the source file was missing. */
  file: string | null;
  /** FULLSCREEN: a 2D overlay (HUD). MESH: drawn on this entity's mesh surface. */
  mode: "FULLSCREEN" | "MESH";
  /** FULLSCREEN only: draw in front of the scene (vs behind it). */
  foreground: boolean;
  /** MESH only: UI texture resolution. */
  width: number;
  height: number;
}

export interface ParticleComponent {
  type: "PARTICLE";
  /** Manifest-relative path ("particles/fire.json"); null if the source was missing. */
  file: string | null;
  /** Create a GPUParticleSystem when supported (falls back to CPU otherwise). */
  gpu: boolean;
  /** Begin emitting as soon as the level finishes loading. */
  autoStart: boolean;
  /** Emit from this entity's node (a mesh follows it; an empty uses its position). */
  attachToEntity: boolean;
  /** Override the JSON's capacity; 0 = keep the file's value. */
  capacity: number;
}

// ---- 3D GUI components (Babylon's @babylonjs/gui 3D controls + panels) ----

/** One authored click reaction: on click, send `message` to `target`. */
export interface Gui3DClickEvent {
  /** GUID of the entity whose behaviors receive the message (null = unset). */
  target: string | null;
  message: string;
}

/** Fields shared by the text/image button controls (Button3D + holographic). */
interface Gui3DTexturedButtonBase {
  text: string;
  /** Manifest-relative image path ("gui/icon.png"); null if unset or missing. */
  image: string | null;
  events: Gui3DClickEvent[];
}

/** A generic Button3D: a 3D plate rendering 2D content (text or image). */
export interface Gui3DButtonComponent extends Gui3DTexturedButtonBase {
  type: "GUI3D_BUTTON";
  /** Resolution of the texture rendering the button content (Babylon default 512). */
  contentResolution: number;
}

/** An MRTK-style HolographicButton (text + image + tooltip). */
export interface Gui3DHoloButtonComponent extends Gui3DTexturedButtonBase {
  type: "GUI3D_HOLO";
  tooltip: string;
}

/** A TouchHolographicButton: HolographicButton with XR near-touch support. */
export interface Gui3DTouchHoloButtonComponent extends Gui3DTexturedButtonBase {
  type: "GUI3D_TOUCH_HOLO";
  tooltip: string;
}

/** A MeshButton3D: the entity's own mesh becomes the interactive control. */
export interface Gui3DMeshButtonComponent {
  type: "GUI3D_MESH";
  events: Gui3DClickEvent[];
}

/** Fields shared by the volume panels (sphere/cylinder/plane/scatter). */
interface Gui3DVolumePanelBase {
  /** Distance between child controls. */
  margin: number;
  /** 0 = let Babylon derive it from `rows` (Babylon default is 10 columns). */
  columns: number;
  /** 0 = derive from `columns`. Setting both prefers `rows`. */
  rows: number;
}

export interface Gui3DStackPanelComponent {
  type: "GUI3D_STACK";
  margin: number;
  vertical: boolean;
}

export interface Gui3DSpherePanelComponent extends Gui3DVolumePanelBase {
  type: "GUI3D_SPHERE";
  radius: number;
}

export interface Gui3DCylinderPanelComponent extends Gui3DVolumePanelBase {
  type: "GUI3D_CYLINDER";
  radius: number;
}

export interface Gui3DPlanePanelComponent extends Gui3DVolumePanelBase {
  type: "GUI3D_PLANE";
}

export interface Gui3DScatterPanelComponent extends Gui3DVolumePanelBase {
  type: "GUI3D_SCATTER";
  /** Iterations used to scatter the controls (Babylon default 100). */
  iterations: number;
}

/** The interactive 3D controls (clickable; carry `events`). */
export type Gui3DControlComponent =
  | Gui3DButtonComponent
  | Gui3DHoloButtonComponent
  | Gui3DTouchHoloButtonComponent
  | Gui3DMeshButtonComponent;

/** The layout containers; children come from Blender child objects. */
export type Gui3DPanelComponent =
  | Gui3DStackPanelComponent
  | Gui3DSpherePanelComponent
  | Gui3DCylinderPanelComponent
  | Gui3DPlanePanelComponent
  | Gui3DScatterPanelComponent;

export type Gui3DComponent = Gui3DControlComponent | Gui3DPanelComponent;

export type Component =
  | TagComponent
  | ColliderComponent
  | RigidBodyComponent
  | ScriptComponent
  | CameraComponent
  | AudioComponent
  | ConstraintComponent
  | GuiComponent
  | ParticleComponent
  | Gui3DComponent;

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
  /** The scene's Input Actions asset (Blender "Input Actions" panel). */
  inputActions?: InputActionAssetData | null;
  /** Map name injected when a script has no @inputMap (default "Player"). */
  defaultInputMap?: string;
}

// ---- Input Actions asset (Unity Input System style) ----

export type InputDevice = "KEYBOARD" | "GAMEPAD";
/** The shape of the value an action produces. */
export type InputControlType = "BUTTON" | "AXIS" | "VECTOR2";
/** Unity's action behavior types (callback semantics differ per type). */
export type InputActionType = "BUTTON" | "VALUE" | "PASSTHROUGH";
export type InputCompositeType = "1DAXIS" | "2DVECTOR";

/**
 * One binding: either a direct control read (a keyboard key, a gamepad button,
 * or a gamepad axis) or a composite combining part bindings into an axis or
 * 2D-vector value.
 */
export interface InputBindingData {
  device?: InputDevice;
  /** Raw token: a KeyboardEvent.key string ("space", "w"), or "button"/"axis" for gamepads. */
  control?: string;
  /** Standard-mapping gamepad button/axis index (0 = A/Cross or left stick X). */
  index?: number;
  /** Multiplier applied to an analog value (-1 flips a stick). */
  scale?: number;
  /** When set, this binding composes its `parts` instead of reading a control. */
  composite?: InputCompositeType | null;
  /** 1DAXIS parts: negative/positive. 2DVECTOR parts: up/down/left/right. */
  parts?: Record<string, InputBindingData>;
}

export interface InputActionData {
  name: string;
  type: InputActionType;
  controlType: InputControlType;
  bindings: InputBindingData[];
}

export interface InputActionMapData {
  name: string;
  actions: InputActionData[];
}

export interface InputActionAssetData {
  maps: InputActionMapData[];
}

export interface LevelManifest {
  version: number;
  glb: string;
  /** Exported with "Debug Build" on: enables runtime debug keys. Missing = true. */
  debug?: boolean;
  scene?: SceneInfo;   // optional scene-wide render settings
  entities: EntityData[];
}
