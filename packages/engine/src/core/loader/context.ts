import type { Scene, TransformNode } from "@babylonjs/core";
import { Level } from "../Level";
import type { Entity } from "../Entity";
import type { AnimationInfo } from "../types";
import type { PendingRef } from "../../scripting/exposed";
import type { ShadowCaster } from "../../subsystems/shadows";
import type { TriggerRegistration } from "../../subsystems/triggers";
import type { ConstraintRegistration } from "../../subsystems/constraints";
import type { Gui3DRegistration } from "../../ui/gui3d/builder";
import { CreateCameraTargetSets, type CameraTargetSets } from "../../subsystems/cameras";
import { BuildIdIndex } from "./nodeResolution";

/**
 * The mutable state threaded through one load pass: the Level under
 * construction plus everything the per-entity loop defers to a post-pass
 * (entity references, camera targets, shadows, sounds, triggers, joints).
 */
export interface LoadContext {
  level: Level;
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
  triggerRegistrations: TriggerRegistration[];
  constraintRegistrations: ConstraintRegistration[];
  gui3dRegistrations: Gui3DRegistration[];
  /** Scene default map for scripts without @inputMap (from manifest.scene). */
  defaultInputMap: string;
}

/** A fresh context for one load pass (the glb must already be appended). */
export function CreateLoadContext(
  scene: Scene,
  baseUrl: string,
  defaultInputMap = "Player"
): LoadContext
{
  return {
    level: new Level(scene),
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
    triggerRegistrations: [],
    constraintRegistrations: [],
    gui3dRegistrations: [],
    defaultInputMap,
  };
}
