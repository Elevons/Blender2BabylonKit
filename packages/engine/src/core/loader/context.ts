import type { Scene, TransformNode, PhysicsShape } from "@babylonjs/core";
import { Level } from "../Level";
import type { Entity } from "../Entity";
import type { AnimationInfo } from "../types";
import type { PendingRef } from "../../scripting/exposed";
import type { BehaviorRegistry } from "../../scripting/BehaviorRegistry";
import type { ShadowCaster } from "../../subsystems/shadows";
import type { EventMessageRegistration } from "../../subsystems/collisions";
import type { ConstraintRegistration } from "../../subsystems/constraints";
import type { ReflectionProbeRegistration } from "../../subsystems/reflectionProbes";
import type { LodRegistration } from "../../subsystems/lod";
import type { Gui3DRegistration } from "../../ui/gui3d/builder";
import { CreateCameraTargetSets, type CameraTargetSets } from "../../subsystems/cameras";
import { BuildIdIndex } from "./nodeResolution";
import { ComponentHost } from "../ComponentHost";
import { BindLevelToScene } from "../entityActive";

/**
 * The mutable state threaded through one load pass: the Level under
 * construction plus everything the per-entity loop defers to a post-pass
 * (entity references, camera targets, shadows, sounds, triggers, joints).
 */
export interface LoadContext {
  level: Level;
  componentHost: ComponentHost;
  baseUrl: string;
  idIndex: Map<string, TransformNode>;
  pendingReferences: PendingRef[];
  shadowLights: ShadowCaster[];
  animatedEntities: { entity: Entity; info: AnimationInfo }[];
  cameraTargets: CameraTargetSets;
  audioTasks: Promise<unknown>[];
  guiTasks: Promise<unknown>[];
  particleTasks: Promise<unknown>[];
  msdfTextTasks: Promise<unknown>[];
  eventMessageRegistrations: EventMessageRegistration[];
  constraintRegistrations: ConstraintRegistration[];
  reflectionProbeRegistrations: ReflectionProbeRegistration[];
  lodRegistrations: LodRegistration[];
  gui3dRegistrations: Gui3DRegistration[];
  /** Physics shapes built per entity id (for collision layer filter masks). */
  physicsShapesByEntity: Map<string, PhysicsShape[]>;
  /** Scene default map for scripts without @inputMap (from manifest.scene). */
  defaultInputMap: string;
}

/** A fresh context for one load pass (the glb must already be appended). */
export function CreateLoadContext(
  scene: Scene,
  baseUrl: string,
  registry: BehaviorRegistry,
  defaultInputMap = "Player"
): LoadContext
{
  const level = new Level(scene);
  const componentHost = new ComponentHost(level, scene, registry, baseUrl, defaultInputMap);
  level.componentHost = componentHost;
  BindLevelToScene(scene, level);

  return {
    level,
    componentHost,
    baseUrl,
    idIndex: BuildIdIndex(scene),
    pendingReferences: [],
    shadowLights: [],
    animatedEntities: [],
    cameraTargets: CreateCameraTargetSets(),
    audioTasks: [],
    guiTasks: [],
    particleTasks: [],
    msdfTextTasks: [],
    eventMessageRegistrations: componentHost.eventMessageRegistrations,
    constraintRegistrations: [],
    reflectionProbeRegistrations: [],
    lodRegistrations: [],
    gui3dRegistrations: [],
    physicsShapesByEntity: componentHost.physicsShapesByEntity,
    defaultInputMap,
  };
}
