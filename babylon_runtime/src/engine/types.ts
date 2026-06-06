import type { TransformNode } from "@babylonjs/core";
import type { PhysicsBody } from "@babylonjs/core";

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

export type Component =
  | TagComponent
  | ColliderComponent
  | RigidBodyComponent
  | ScriptComponent;

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

export interface EntityData {
  id: string;
  name: string;
  parent: string | null;
  components: Component[];
  light?: LightInfo;   // auto-derived from a Blender lamp; not a component
  camera?: CameraInfo; // auto-derived from a Blender camera; not a component
}

export interface LevelManifest {
  version: number;
  glb: string;
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

  constructor(id: string, name: string, node: TransformNode) {
    this.id = id;
    this.name = name;
    this.node = node;
  }

  getBehavior<T extends Behavior>(ctor: new () => T): T | undefined {
    return this.behaviors.find((b) => b instanceof ctor) as T | undefined;
  }
}
