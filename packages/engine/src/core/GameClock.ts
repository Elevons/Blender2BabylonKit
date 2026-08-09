import type { IParticleSystem, Scene } from "@babylonjs/core";

/**
 * Unified game clock — the engine's single time authority (Unity's `Time`).
 *
 * Babylon splits time across systems: behaviors receive frame deltas, scene
 * animations read `scene.animationTimeScale`, and Havok steps by its own
 * timestep. GameClock owns gameplay time in one place: Level ticks it once
 * per frame with the raw engine delta; the clock clamps hitches, applies
 * `timeScale`, accumulates elapsed time, and pushes the scale into the scene
 * animation clock, every particle system, and the physics step.
 *
 * Behaviors reach it as `this.time`. Setting `timeScale = 0` freezes
 * gameplay (behavior deltas, scene animations, physics); rendering and input
 * keep running. Drive slow-motion ramps with `unscaledDeltaSeconds` so the
 * ramp is not slowed by the scale it is writing.
 */
export class GameClock
{
  /**
   * Longest wall-clock frame delta (seconds) fed into one tick — Unity's
   * `maximumDeltaTime`. The browser pauses requestAnimationFrame in hidden
   * tabs, so the first frame back reports the whole gap as one delta; the
   * clamp turns that into one ordinary step instead of a catastrophic
   * catch-up (physics tunneling, behavior teleports).
   */
  maxFrameDeltaSeconds = 0.1;

  private currentTimeScale = 1;

  private wallDeltaSeconds = 0;

  private scaledDeltaSeconds = 0;

  private wallElapsedSeconds = 0;

  private scaledElapsedSeconds = 0;

  /** True once Havok has been switched to fixed-step mode (setTimeStep honored). */
  private physicsHonorsTimeStep = false;

  /** Authored updateSpeed per particle system, captured before the clock scales it. */
  private readonly particleBaseUpdateSpeeds = new WeakMap<IParticleSystem, number>();

  constructor(private scene: Scene) {}

  /** Gameplay time multiplier: 1 = real time, 0 = frozen. */
  get timeScale(): number
  {
    return this.currentTimeScale;
  }

  set timeScale(value: number)
  {
    this.currentTimeScale = Math.max(0, value);

    // Re-derive this frame's scaled delta and re-apply mid-frame, so physics
    // (which steps after behaviors in scene.render) sees the new scale
    // immediately — a freeze set during OnUpdate freezes this frame.
    this.scaledDeltaSeconds = this.wallDeltaSeconds * this.currentTimeScale;
    this.ApplyToScene();
  }

  /** Scaled frame delta (seconds) — what OnUpdate receives. */
  get deltaSeconds(): number
  {
    return this.scaledDeltaSeconds;
  }

  /** Wall-clock frame delta (seconds), hitch-clamped; unaffected by timeScale. */
  get unscaledDeltaSeconds(): number
  {
    return this.wallDeltaSeconds;
  }

  /** Scaled gameplay time (seconds) since the level began. */
  get elapsedSeconds(): number
  {
    return this.scaledElapsedSeconds;
  }

  /** Wall-clock time (seconds) since the level began (hitch clamp applied per frame). */
  get unscaledElapsedSeconds(): number
  {
    return this.wallElapsedSeconds;
  }

  /**
   * Advance the clock one frame from the raw engine delta and sync the scene
   * animation clock + physics step. Called by Level once per render frame,
   * before behaviors run. Returns the scaled delta for OnUpdate.
   */
  Tick(rawDeltaSeconds: number): number
  {
    this.wallDeltaSeconds = Math.min(
      Math.max(rawDeltaSeconds, 0),
      this.maxFrameDeltaSeconds
    );
    this.scaledDeltaSeconds = this.wallDeltaSeconds * this.currentTimeScale;

    this.wallElapsedSeconds += this.wallDeltaSeconds;
    this.scaledElapsedSeconds += this.scaledDeltaSeconds;

    this.ApplyToScene();
    return this.scaledDeltaSeconds;
  }

  /** Push the current scale into scene animations, particles, and the Havok step. */
  private ApplyToScene(): void
  {
    this.scene.animationTimeScale = this.currentTimeScale;
    this.ApplyToParticles();

    const physicsEngine = this.scene.getPhysicsEngine();
    // Babylon Nullable that can also be undefined at runtime.
    if (!physicsEngine)
    {
      return;
    }

    this.EnsurePhysicsHonorsTimeStep();
    // Physics steps once per render frame; in fixed-step mode the world
    // advances by exactly setTimeStep, so scaled wall delta = Unity's
    // deltaTime * timeScale (0 freezes — BJS-sanctioned slow-mo/pause path).
    physicsEngine.setTimeStep(this.scaledDeltaSeconds);
  }

  /**
   * Particle systems ignore scene.animationTimeScale — CPU and GPU systems
   * both advance by `updateSpeed * getAnimationRatio()` (wall clock). Scale
   * each system's updateSpeed instead; 0 freezes simulation and emission
   * while the frozen particles stay visible.
   */
  private ApplyToParticles(): void
  {
    for (const particleSystem of this.scene.particleSystems)
    {
      // At real time, restore the captured base once and stop touching
      // updateSpeed — runtime tweaks by behaviors stay authoritative.
      if (this.currentTimeScale === 1)
      {
        const storedBaseUpdateSpeed = this.particleBaseUpdateSpeeds.get(particleSystem);
        if (storedBaseUpdateSpeed !== undefined)
        {
          particleSystem.updateSpeed = storedBaseUpdateSpeed;
          this.particleBaseUpdateSpeeds.delete(particleSystem);
        }
        continue;
      }

      let baseUpdateSpeed = this.particleBaseUpdateSpeeds.get(particleSystem);
      if (baseUpdateSpeed === undefined)
      {
        baseUpdateSpeed = particleSystem.updateSpeed;
        this.particleBaseUpdateSpeeds.set(particleSystem, baseUpdateSpeed);
      }

      particleSystem.updateSpeed = baseUpdateSpeed * this.currentTimeScale;
    }
  }

  /**
   * HavokPlugin(true) steps by the engine delta and ignores setTimeStep.
   * Force fixed-step mode so setTimeStep drives World_Step — including 0.
   */
  private EnsurePhysicsHonorsTimeStep(): void
  {
    if (this.physicsHonorsTimeStep)
    {
      return;
    }

    const physicsEngine = this.scene.getPhysicsEngine();
    // Babylon Nullable that can also be undefined at runtime.
    if (!physicsEngine)
    {
      return;
    }

    const plugin = physicsEngine.getPhysicsPlugin() as { _useDeltaForWorldStep?: boolean };
    if (plugin._useDeltaForWorldStep === true)
    {
      plugin._useDeltaForWorldStep = false;
    }

    this.physicsHonorsTimeStep = true;
  }
}
