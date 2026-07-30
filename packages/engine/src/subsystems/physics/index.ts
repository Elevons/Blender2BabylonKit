/**
 * Physics subsystem: COLLIDER / RIGIDBODY → Havok V2 bodies.
 * Split by pipeline phase — see bootstrap, geometry, shapes, bodyBuild, buildPhysics.
 */
export { EnableHavokPhysics } from "./bootstrap";
export type { HavokPhysicsOptions } from "./bootstrap";
export { BuildPhysics } from "./buildPhysics";
export { RebuildEntityPhysics, CollectPhysicsComponentData, SuspendEntityPhysics, ResumeEntityPhysics } from "./rebuildPhysics";
export {
  IsEntityInsideColliderVolume,
  IsPointInsideColliderVolume,
} from "./shapes";
