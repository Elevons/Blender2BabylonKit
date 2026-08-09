import { Scene } from "@babylonjs/core";
import type { IParticleSystem } from "@babylonjs/core";

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

  private currentFixedDeltaSeconds = 0;

  private wallDeltaSeconds = 0;

  private scaledDeltaSeconds = 0;

  private wallElapsedSeconds = 0;

  private scaledElapsedSeconds = 0;

  /** True once Havok has been switched to fixed-step mode (setTimeStep honored). */
  private physicsHonorsTimeStep = false;

  /** Authored updateSpeed per particle system, captured before the clock scales it. */
  private readonly particleBaseUpdateSpeeds = new WeakMap<IParticleSystem, number>();

  constructor(private scene: Scene)
  {
    // The scene's own physics accumulator (fixed-mode substepping) clamps its
    // input with this static — align it with the clock's hitch cap so a
    // hidden-tab gap can't queue a burst of catch-up substeps.
    Scene.MaxDeltaTime = this.maxFrameDeltaSeconds * 1000;
  }

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

  /**
   * Fixed physics step size (seconds) — Unity's `fixedDeltaTime`. 0 (default)
   * keeps variable stepping: one physics step per render frame, advancing by
   * that frame's scaled delta. Set e.g. `1 / 60` for Unity-style fixed
   * stepping: the scene accumulates wall time and runs 0..N Havok substeps of
   * exactly this size per render frame, so the simulation integrates in
   * identical slices regardless of frame rate. Behaviors hook each substep
   * with `OnFixedUpdate`.
   */
  get fixedDeltaSeconds(): number
  {
    return this.currentFixedDeltaSeconds;
  }

  set fixedDeltaSeconds(value: number)
  {
    this.currentFixedDeltaSeconds = Math.max(0, value);
    this.ApplyToScene();
  }

  /**
   * Scaled seconds the next physics step advances the world — the delta
   * OnFixedUpdate receives. Fixed mode: `fixedDeltaSeconds * timeScale`;
   * variable mode: this frame's scaled delta.
   */
  get physicsStepSeconds(): number
  {
    if (this.currentFixedDeltaSeconds > 0)
    {
      return this.currentFixedDeltaSeconds * this.currentTimeScale;
    }

    return this.scaledDeltaSeconds;
  }

  /**
   * Fraction [0..1] of the next fixed physics step already accumulated —
   * the blend factor for rendering between the last two physics poses
   * (see subsystems/physics/interpolation.ts). Reads the scene's own
   * substep accumulator so it can never drift from the real step schedule.
   * Always 1 in variable mode, where visuals match the sim exactly.
   */
  get physicsBlendAlpha(): number
  {
    if (this.currentFixedDeltaSeconds <= 0)
    {
      return 1;
    }

    const sceneWithAccumulator = this.scene as unknown as { _physicsTimeAccumulator?: number };
    const accumulatedMs = sceneWithAccumulator._physicsTimeAccumulator ?? 0;
    const alpha = accumulatedMs / (this.currentFixedDeltaSeconds * 1000);
    return Math.min(Math.max(alpha, 0), 1);
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

    if (this.currentFixedDeltaSeconds > 0)
    {
      // Fixed mode: the scene's own accumulator (scene._advancePhysicsEngineStep)
      // runs 0..N substeps of subTimeStep per render frame, and Havok advances
      // each substep by exactly setTimeStep — identical integration slices at
      // any frame rate, still scaled by timeScale (0 freezes).
      physicsEngine.setSubTimeStep(this.currentFixedDeltaSeconds * 1000);
      physicsEngine.setTimeStep(this.currentFixedDeltaSeconds * this.currentTimeScale);
      return;
    }

    // Variable mode: one physics step per render frame, advancing by the
    // frame's scaled wall delta (Unity's deltaTime * timeScale; 0 freezes).
    physicsEngine.setSubTimeStep(0);
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
