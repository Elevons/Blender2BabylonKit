import type {
  Scene,
  TransformNode,
  PhysicsShape,
  PhysicsConstraint,
  AnimationGroup,
  StaticSound,
  IParticleSystem,
} from "@babylonjs/core";
import { SoundState } from "@babylonjs/core/AudioV2/soundState";
import type { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import type { Entity } from "../Entity";
import { ApplyNodeSubtreeVisibility } from "./subtreeVisibility";
import { ResumeEntityPhysics, SuspendEntityPhysics } from "../../subsystems/physics/rebuildPhysics";

/** Playback state preserved while an entity is effectively inactive. */
export interface SuspendedRuntimeState
{
  playingSounds: StaticSound[];
  playingAnimations: AnimationGroup[];
  emittingParticles: IParticleSystem[];
  enabledConstraints: PhysicsConstraint[];
  probeRefreshRates: Array<{ probe: ReflectionProbe; refreshRate: number }>;
}

/** Whether a sound was playing when suspended. */
function IsSoundPlaying(sound: StaticSound): boolean
{
  return sound.state === SoundState.Started;
}

/** Whether an animation group was playing when suspended. */
function IsAnimationPlaying(animationGroup: AnimationGroup): boolean
{
  return animationGroup.isPlaying === true;
}

/** Whether a particle system was emitting when suspended. */
function IsParticleEmitting(system: IParticleSystem): boolean
{
  return system.isStarted();
}

/** Capture runtime attachment state before an entity becomes effectively inactive. */
function CaptureSuspendedRuntime(entity: Entity): SuspendedRuntimeState
{
  const playingSounds: StaticSound[] = [];
  for (const sound of entity.sounds)
  {
    if (IsSoundPlaying(sound))
    {
      playingSounds.push(sound);
    }
  }

  const playingAnimations: AnimationGroup[] = [];
  for (const animationGroup of entity.animations)
  {
    if (IsAnimationPlaying(animationGroup))
    {
      playingAnimations.push(animationGroup);
    }
  }

  const emittingParticles: IParticleSystem[] = [];
  for (const particleSystem of entity.particleSystems)
  {
    if (IsParticleEmitting(particleSystem))
    {
      emittingParticles.push(particleSystem);
    }
  }

  const enabledConstraints: PhysicsConstraint[] = [];
  for (const attachment of entity.GetAttachmentsOfType("CONSTRAINT"))
  {
    if (attachment.constraint.isEnabled)
    {
      enabledConstraints.push(attachment.constraint);
    }
  }

  const probeRefreshRates: Array<{ probe: ReflectionProbe; refreshRate: number }> = [];
  for (const probe of entity.reflectionProbes)
  {
    if (probe.refreshRate !== 0)
    {
      probeRefreshRates.push({ probe, refreshRate: probe.refreshRate });
    }
  }

  return {
    playingSounds,
    playingAnimations,
    emittingParticles,
    enabledConstraints,
    probeRefreshRates,
  };
}

/** Pause runtime attachments owned by one effectively inactive entity. */
export function SuspendEntityRuntime(entity: Entity, scene: Scene): void
{
  entity.suspendedRuntime = CaptureSuspendedRuntime(entity);

  ApplyNodeSubtreeVisibility(scene, entity.node, false);
  SuspendEntityPhysics(entity);

  for (const particleSystem of entity.particleSystems)
  {
    particleSystem.stop();
  }

  for (const sound of entity.suspendedRuntime.playingSounds)
  {
    sound.stop();
  }

  for (const animationGroup of entity.suspendedRuntime.playingAnimations)
  {
    animationGroup.stop();
  }

  for (const guiTexture of entity.guiTextures)
  {
    guiTexture.rootContainer.isVisible = false;
  }

  for (const control of entity.controls3D)
  {
    control.isVisible = false;
  }

  for (const constraint of entity.suspendedRuntime.enabledConstraints)
  {
    constraint.isEnabled = false;
  }

  for (const entry of entity.suspendedRuntime.probeRefreshRates)
  {
    entry.probe.refreshRate = 0;
  }
}

/** Restore runtime attachments after an entity becomes effectively active again. */
export function ResumeEntityRuntime(
  entity: Entity,
  scene: Scene,
  shapesRegistry: Map<string, PhysicsShape[]> | undefined
): boolean
{
  let resumedPhysics = false;

  ApplyNodeSubtreeVisibility(scene, entity.node, true);

  if (shapesRegistry !== undefined && entity.suspendedPhysics !== undefined)
  {
    ResumeEntityPhysics(entity, scene, shapesRegistry);
    resumedPhysics = true;
  }

  const suspended = entity.suspendedRuntime;

  if (suspended !== undefined)
  {
    for (const particleSystem of suspended.emittingParticles)
    {
      particleSystem.start();
    }

    for (const sound of suspended.playingSounds)
    {
      void sound.play();
    }

    for (const animationGroup of suspended.playingAnimations)
    {
      animationGroup.play(animationGroup.loopAnimation);
    }

    for (const guiTexture of entity.guiTextures)
    {
      guiTexture.rootContainer.isVisible = true;
    }

    for (const control of entity.controls3D)
    {
      control.isVisible = true;
    }

    for (const constraint of suspended.enabledConstraints)
    {
      constraint.isEnabled = true;
    }

    for (const entry of suspended.probeRefreshRates)
    {
      entry.probe.refreshRate = entry.refreshRate;
    }

    entity.suspendedRuntime = undefined;
  }
  else
  {
    for (const particleSystem of entity.particleSystems)
    {
      particleSystem.start();
    }

    for (const guiTexture of entity.guiTextures)
    {
      guiTexture.rootContainer.isVisible = true;
    }

    for (const control of entity.controls3D)
    {
      control.isVisible = true;
    }
  }

  return resumedPhysics;
}
