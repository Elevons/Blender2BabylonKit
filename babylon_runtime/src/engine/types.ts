import type { TransformNode } from "@babylonjs/core";
import type { PhysicsBody, AnimationGroup } from "@babylonjs/core";

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

export type Component =
  | TagComponent
  | ColliderComponent
  | RigidBodyComponent
  | ScriptComponent
  | CameraComponent;

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
  scene?: SceneInfo;   // optional scene-wide render settings
  entities: EntityData[];
}

// ---- Runtime entity ----

export class Entity {
  readonly id: string;
  readonly name: string;
  readonly node: TransformNode;
  tag = "Untagged";
  behaviors: Behavior[] = [];
  body?: PhysicsBody;
  /** AnimationGroups from the glb that target this entity's node (or children). */
  animations: AnimationGroup[] = [];

  constructor(id: string, name: string, node: TransformNode) {
    this.id = id;
    this.name = name;
    this.node = node;
  }

  getBehavior<T extends Behavior>(ctor: new () => T): T | undefined {
    return this.behaviors.find((b) => b instanceof ctor) as T | undefined;
  }

  /** Find one of this entity's animation clips by name (exact, then contains). */
  getAnimation(name: string): AnimationGroup | undefined {
    const want = name.toLowerCase();
    return (
      this.animations.find((g) => g.name.toLowerCase() === want) ??
      this.animations.find((g) => g.name.toLowerCase().includes(want))
    );
  }
}
