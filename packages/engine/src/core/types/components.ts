/** Optional Blender inspector instance name (exported from display_name). */
export interface ComponentInstanceName
{
  name?: string;
}

export interface TagComponent extends ComponentInstanceName {
  type: "TAG";
  tag: string;
}

export interface RenderingGroupComponent extends ComponentInstanceName {
  type: "RENDERING_GROUP";
  /** Babylon draw-order group (0–3). Lower groups render first. */
  renderingGroupId: number;
  /** When false, this entity's own meshes keep Babylon defaults. Default true. */
  applyOwnedMeshes?: boolean;
  /** When true, child entities inherit until one defines its own layer component. */
  applyChildEntities?: boolean;
}

export interface LayerMaskComponent extends ComponentInstanceName {
  type: "LAYER_MASK";
  /** Babylon visibility bitmask; camera renders when (mesh.layerMask & camera.layerMask) !== 0. */
  layerMask: number;
  /** When false, this entity's own meshes keep Babylon defaults. Default true. */
  applyOwnedMeshes?: boolean;
  /** When true, child entities inherit until one defines its own layer component. */
  applyChildEntities?: boolean;
}

export type MeshShadowMode =
  | "CAST_AND_RECEIVE"
  | "RECEIVE_ONLY"
  | "CAST_ONLY"
  | "NONE";

export interface MeshShadowsComponent extends ComponentInstanceName {
  type: "MESH_SHADOWS";
  mode: MeshShadowMode;
  /** When false, this entity's own meshes keep prior shadow settings. Default true. */
  applyOwnedMeshes?: boolean;
  /** When true, child entities inherit until one defines its own mesh-shadow component. */
  applyChildEntities?: boolean;
}

export interface CollisionLayerComponent extends ComponentInstanceName {
  type: "COLLISION_LAYER";
  /** Named layer from scene.collisionLayers.layers. */
  layer: string;
  /** When false, this entity's physics shapes keep Havok defaults. Default true. */
  applyOwnedColliders?: boolean;
  /** When true, child entities inherit until one defines its own collision layer component. */
  applyChildEntities?: boolean;
}

/** Scene-wide named collision layers + matrix (Blender Collision Layers panel). */
export interface CollisionLayersInfo {
  layers: string[];
  /** matrix[row][col] — row layer collides with column layer when true. */
  matrix: boolean[][];
}

export interface ColliderComponent extends ComponentInstanceName {
  type: "COLLIDER";
  shape: "BOX" | "SPHERE" | "CAPSULE" | "CYLINDER" | "CONVEX" | "MESH";
  isTrigger: boolean;
  /** Hide the entity mesh at runtime; physics collider stays active. */
  makeInvisible?: boolean;
  autoFit: boolean;
  /** Default on. Bakes this entity's local scale into authored data; parent scale uses the world matrix. */
  applyObjectScale?: boolean;
  size: [number, number, number];
  radius: number;
  height: number;
  center: [number, number, number];
  rotation?: [number, number, number, number]; // quaternion xyzw (manual shapes)
  /** Authored Event Messages: on a physics phase, send `message` to `target`. */
  eventMessages?: EventMessageData[];
}

/** Physics phase for an authored Event Message row on a COLLIDER. */
export type EventMessagePhase =
  | "TRIGGER_ENTER"
  | "TRIGGER_EXIT"
  | "COLLISION_ENTER"
  | "COLLISION_EXIT";

export interface EventMessageData {
  /** When this row fires relative to the collider's physics contact. */
  when: EventMessagePhase;
  /** GUID of the entity whose behaviors receive the message (null = unset). */
  target: string | null;
  message: string;
  /** Only entities carrying this tag set the event off; empty = any entity. */
  filterTag: string;
}

/** Contact data surfaced on collision lifecycle hooks. */
export interface CollisionContact {
  point: { x: number; y: number; z: number } | null;
  normal: { x: number; y: number; z: number } | null;
  impulse: number | null;
  distance: number;
}

export interface RigidBodyComponent extends ComponentInstanceName {
  type: "RIGIDBODY";
  bodyType: "DYNAMIC" | "STATIC" | "ANIMATED";
  mass: number;
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
  /** Request sleep mode at creation (DYNAMIC bodies at rest; not guaranteed). */
  startAsleep?: boolean;
  /** When true, center of mass is computed from owned mesh bounds at load time. */
  centerOfMassAutoFit?: boolean;
  /** Custom center of mass in entity local space (Babylon Y-up); used when centerOfMassAutoFit is false. */
  centerOfMass?: [number, number, number];
}

export interface ScriptComponent extends ComponentInstanceName {
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

export interface CameraComponent extends ComponentInstanceName {
  type: "CAMERA";
  cameraType: "FREE" | "UNIVERSAL" | "ARC" | "FOLLOW" | "GEOSPATIAL";
  attachControl: boolean;
  keys: CameraKeys;       // key bindings when controls are attached (not FOLLOW)
  useBlenderTransform: boolean; // FOLLOW/ORBIT: derive radius/height/angle from the exported camera
  followMode: "ORBIT" | "OFFSET"; // FOLLOW: orbit with target yaw, or keep a fixed world offset
  lockRoll: boolean;     // FREE/UNIVERSAL: lock roll (Z axis) so the camera stays upright
  speed: number;
  inertia: number;
  radius: number;        // ARC: orbit distance
  lowerRadius: number;   // ARC / GEOSPATIAL: min zoom (0 = none)
  upperRadius: number;   // ARC / GEOSPATIAL: max zoom (0 = none)
  target: string | null; // ARC orbit pivot / FOLLOW target entity GUID
  trackTarget: boolean;  // ARC: move the orbit pivot with the target each frame
  orbitSpeed: number;    // ARC / GEOSPATIAL: orbit (rotate) speed multiplier
  zoomSpeed: number;     // ARC / GEOSPATIAL: zoom speed multiplier
  panSpeed: number;      // ARC / GEOSPATIAL: pan speed multiplier
  distance: number;      // FOLLOW: follow distance
  height: number;        // FOLLOW: height offset
  rotationOffset: number;// FOLLOW: angle behind target (deg)
  planetRadius?: number; // GEOSPATIAL: radius of the globe at world origin
  checkCollisions?: boolean; // GEOSPATIAL: scene collision avoidance
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

export interface ConstraintComponent extends ComponentInstanceName {
  type: "CONSTRAINT";
  constraintType: "FIXED" | "BALL" | "HINGE" | "SLIDER" | "SPRING" | "CUSTOM";
  /** GUID of the other body's entity (null = unset). */
  target: string | null;
  /** Default on. Bakes this entity's local scale into authored pivot/limits; parent scale uses the world matrix. */
  applyObjectScale?: boolean;
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

export interface AudioComponent extends ComponentInstanceName {
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

export interface GuiComponent extends ComponentInstanceName {
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

export interface ParticleComponent extends ComponentInstanceName {
  type: "PARTICLE";
  /** Manifest-relative path ("particles/fire.json"); null if the source was missing. */
  file: string | null;
  /** Create a GPUParticleSystem when supported (falls back to CPU otherwise). */
  gpu: boolean;
  /** Begin emitting as soon as the level finishes loading. */
  autoStart: boolean;
  /** Emit from this entity's node (meshes and empties follow it at runtime). */
  attachToEntity: boolean;
  /** Override the JSON's capacity; 0 = keep the file's value. */
  capacity: number;
}

export interface MsdfTextComponent extends ComponentInstanceName {
  type: "MSDF_TEXT";
  text: string;
  /** Manifest-relative BMFont JSON ("fonts/roboto-regular.json"). */
  fontJson: string | null;
  /** Manifest-relative glyph atlas PNG paired with fontJson. */
  fontTexture: string | null;
  color: [number, number, number, number];
  /** -0.5 to 0.5; 0 = font default. */
  thickness: number;
  billboard: boolean;
  billboardScreenProjected: boolean;
  ignoreDepth: boolean;
  strokeColor: [number, number, number, number];
  strokeInset: number;
  strokeOutset: number;
  textAlign: "left" | "center" | "right";
  /** Wrap width in font units; 0 = no wrap. */
  maxWidth: number;
  lineHeight: number;
  letterSpacing: number;
}

export interface ReflectionProbeComponent extends ComponentInstanceName {
  type: "REFLECTION_PROBE";
  /** Cubemap resolution per face (256 / 512 / 1024). */
  cubeSize: number;
  /** RenderTargetTexture refresh constant (0 = once, 1 = every frame, …). */
  refreshRate: number;
  generateMipMaps: boolean;
  /** When true, every scene mesh is captured except excludes and the probe host. */
  renderAll: boolean;
  /** Entity GUIDs rendered into the cubemap when renderAll is false. */
  renderList: string[];
  /** Entity GUIDs skipped when renderAll is true. */
  renderExcludes: string[];
  influenceShape: "BOX" | "SPHERE";
  /** Box full extents or sphere diameter in Babylon Y-up axes. */
  influenceSize: [number, number, number];
  influenceOffset: [number, number, number];
  /** Higher priority wins when influence volumes overlap. */
  priority: number;
  realTimeFiltering: boolean;
  realTimeFilteringQuality: "LOW" | "MEDIUM" | "HIGH";
}

/** One LOD level: a distance threshold and the target lower-detail entity GUID. */
export interface LodLevel {
  distance: number;
  /** When true, Babylon auto-generates a simplified mesh at runtime. */
  autoLod: boolean;
  /** Auto LOD only: percentage of faces to keep (0.0–1.0). */
  quality?: number;
  /** Auto LOD only: optimize mesh indices before simplification. */
  optimizeMesh?: boolean;
  /** Manual LOD only: GUID of the lower-detail mesh entity (null = unset). */
  target?: string | null;
}

export interface LodComponent extends ComponentInstanceName {
  type: "LOD";
  levels: LodLevel[];
}

/** Animator FSM parameter authored on Parameter nodes + panel defaults. */
export interface AnimatorParameter {
  name: string;
  type: "float" | "bool" | "int" | "trigger";
  default: number | boolean;
}

/** One AND-condition on an Animator transition. */
export type AnimatorCondition =
  | {
      kind: "param";
      param: string;
      op: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "NEQ";
      value?: number;
      boolValue?: boolean;
      intValue?: number;
    }
  | { kind: "clipFinished" }
  | { kind: "afterSeconds"; seconds: number }
  | {
      kind: "input";
      action: string;
      phase: "pressed" | "held" | "released";
    }
  | { kind: "message"; message: string };

export interface AnimatorTransition {
  from: string;
  to: string;
  /** Reserved for crossfade; v1 is instant (0). */
  duration: number;
  /** All conditions must pass (AND). Empty = always true. */
  conditions: AnimatorCondition[];
}

export interface AnimatorState {
  id: string;
  clip: string;
  loop: boolean;
  speed: number;
}

/**
 * Flat animation state machine. Authored as a BJSAnimationStateTree in Blender;
 * drives NLA clips on the armature via AnimationGroups.
 */
export interface AnimatorComponent extends ComponentInstanceName {
  type: "ANIMATOR";
  defaultState: string;
  parameters: AnimatorParameter[];
  states: AnimatorState[];
  transitions: AnimatorTransition[];
  /** Panel default overrides keyed by parameter name. */
  vars?: Record<string, number | boolean>;
}

// ---- 3D GUI components (Babylon's @babylonjs/gui 3D controls + panels) ----

/** One authored click reaction: on click, send `message` to `target`. */
export interface Gui3DClickEvent {
  /** GUID of the entity whose behaviors receive the message (null = unset). */
  target: string | null;
  message: string;
}

/** Fields shared by the text/image button controls (Button3D + holographic). */
interface Gui3DTexturedButtonBase extends ComponentInstanceName {
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
export interface Gui3DMeshButtonComponent extends ComponentInstanceName {
  type: "GUI3D_MESH";
  events: Gui3DClickEvent[];
}

/** Fields shared by the volume panels (sphere/cylinder/plane/scatter). */
interface Gui3DVolumePanelBase extends ComponentInstanceName {
  /** Distance between child controls. */
  margin: number;
  /** 0 = let Babylon derive it from `rows` (Babylon default is 10 columns). */
  columns: number;
  /** 0 = derive from `columns`. Setting both prefers `rows`. */
  rows: number;
}

export interface Gui3DStackPanelComponent extends ComponentInstanceName {
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
  | RenderingGroupComponent
  | LayerMaskComponent
  | MeshShadowsComponent
  | CollisionLayerComponent
  | ColliderComponent
  | RigidBodyComponent
  | ScriptComponent
  | CameraComponent
  | AudioComponent
  | ConstraintComponent
  | GuiComponent
  | ParticleComponent
  | MsdfTextComponent
  | ReflectionProbeComponent
  | LodComponent
  | AnimatorComponent
  | Gui3DComponent;
