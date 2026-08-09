import {
  Behavior,
  exposed,
  IsEntityInsideColliderVolume,
  SetEntityActive,
} from "@bjs/engine";
import type { AttachmentOfType, Entity } from "@bjs/engine";

/**
 * Polls an end-game trigger volume for a target rigidbody. After the body
 * enters and an optional delay elapses, slows gameplay time to zero, then
 * enables the endgame screen.
 */
export default class Endgame extends Behavior
{
  @exposed({ type: "entity", label: "End game zone" })
  endGameZone: Entity | null = null;

  /** Entity with a Rigid Body whose collider must enter the end game zone. */
  @exposed({ type: "entity", label: "Target" })
  target: Entity | null = null;

  @exposed({ type: "entity", label: "Endgame screen" })
  endgameScreen: Entity | null = null;

  /** Wall-clock seconds to wait after the target enters before slowing time. */
  @exposed({ min: 0, max: 120, label: "Enter delay (s)" })
  enterDelay = 0;

  @exposed({ min: 0.1, max: 30, label: "Slow duration (s)" })
  slowDuration = 3;

  @exposed({ label: "Debug logs" })
  debugLogs = true;

  private zoneAttachment: AttachmentOfType<"COLLIDER"> | undefined;

  private targetInside = false;

  /** True once the target has entered and we are counting the enter delay. */
  private enterPending = false;

  private enterWaitElapsedSeconds = 0;

  private sequenceStarted = false;

  private sequenceComplete = false;

  private slowElapsedSeconds = 0;

  /** Last whole second logged during enter delay / slowdown (avoids spam). */
  private lastLoggedSecond = -1;

  /** Cache the zone collider, validate the target body, and hide the screen. */
  OnStart(): void
  {
    if (this.endGameZone === null)
    {
      console.warn(`${this.LogPrefix()} No end game zone assigned`);
    }
    else
    {
      this.zoneAttachment = this.endGameZone.GetAttachment("COLLIDER");

      if (this.zoneAttachment === undefined)
      {
        console.warn(
          `${this.LogPrefix()} End game zone "${this.endGameZone.name}" has no COLLIDER`
        );
      }
      else if (!this.zoneAttachment.data.isTrigger)
      {
        console.warn(
          `${this.LogPrefix()} End game zone "${this.endGameZone.name}" is not a trigger`
        );
      }
    }

    if (this.target === null)
    {
      console.warn(`${this.LogPrefix()} No target assigned`);
    }
    else if (this.target.body === undefined)
    {
      console.warn(
        `${this.LogPrefix()} Target "${this.target.name}" has no Rigid Body`
      );
    }

    if (this.endgameScreen === null)
    {
      console.warn(`${this.LogPrefix()} No Endgame screen assigned`);
    }
    else
    {
      // Load hide leaves active === true — disable so a later enable reveals.
      SetEntityActive(this.endgameScreen, false);
    }

    this.targetInside = this.IsTargetInsideZone();

    if (this.debugLogs)
    {
      const zoneName = this.endGameZone !== null ? this.endGameZone.name : "none";
      const targetName = this.target !== null ? this.target.name : "none";
      const screenName = this.endgameScreen !== null ? this.endgameScreen.name : "none";
      const hasBody = this.target !== null && this.target.body !== undefined;
      console.log(
        `${this.LogPrefix()} started — zone="${zoneName}", target="${targetName}", `
        + `hasBody=${hasBody}, screen="${screenName}", inside=${this.targetInside}, `
        + `enterDelay=${this.enterDelay}s, slowDuration=${this.slowDuration}s`
      );
    }

    if (this.targetInside)
    {
      this.ArmEnterDelay();
    }
  }

  /**
   * Edge-detect target rigidbody entry, wait enterDelay, then ramp time to zero
   * on wall-clock time.
   */
  OnUpdate(_deltaSeconds: number): void
  {
    if (this.sequenceComplete)
    {
      return;
    }

    if (!this.sequenceStarted)
    {
      this.PollTargetEntry();

      if (!this.enterPending)
      {
        return;
      }

      if (!this.AdvanceEnterDelay())
      {
        return;
      }

      this.BeginEndSequence();
    }

    this.AdvanceSlowdown();
  }

  /** Restore real-time scale if the level unloads mid-sequence. */
  OnDestroy(): void
  {
    if (this.sequenceStarted)
    {
      this.time.timeScale = 1;
    }
  }

  /** Detect the first frame the target rigidbody is inside the zone. */
  private PollTargetEntry(): void
  {
    if (this.enterPending)
    {
      return;
    }

    const inside = this.IsTargetInsideZone();
    if (inside === this.targetInside)
    {
      return;
    }

    this.targetInside = inside;

    if (this.debugLogs)
    {
      const targetName = this.target !== null ? this.target.name : "none";
      const worldPosition = this.target !== null
        ? this.target.node.getAbsolutePosition()
        : null;
      const positionText = worldPosition !== null
        ? `(${worldPosition.x.toFixed(1)}, ${worldPosition.y.toFixed(1)}, ${worldPosition.z.toFixed(1)})`
        : "n/a";
      console.log(
        `${this.LogPrefix()} ${inside ? "enter" : "exit"} zone `
        + `(target="${targetName}", pos=${positionText})`
      );
    }

    if (!inside)
    {
      return;
    }

    this.ArmEnterDelay();
  }

  /** Begin the one-shot enter-delay countdown. */
  private ArmEnterDelay(): void
  {
    if (this.enterPending || this.sequenceStarted)
    {
      return;
    }

    this.enterPending = true;
    this.enterWaitElapsedSeconds = 0;
    this.lastLoggedSecond = -1;

    if (this.debugLogs)
    {
      console.log(
        `${this.LogPrefix()} enter delay armed — waiting ${this.enterDelay}s`
      );
    }
  }

  /**
   * Accumulate wall-clock time since entry. Returns true when the delay has
   * elapsed and the slowdown may begin.
   */
  private AdvanceEnterDelay(): boolean
  {
    this.enterWaitElapsedSeconds += this.time.unscaledDeltaSeconds;

    const delay = Math.max(0, this.enterDelay);
    this.LogProgressOncePerSecond(
      "enter delay",
      this.enterWaitElapsedSeconds,
      delay
    );

    return this.enterWaitElapsedSeconds >= delay;
  }

  /** Start the one-shot slowdown; ignores further zone edges. */
  private BeginEndSequence(): void
  {
    if (this.sequenceStarted)
    {
      return;
    }

    this.sequenceStarted = true;
    this.enterPending = false;
    this.slowElapsedSeconds = 0;
    this.lastLoggedSecond = -1;
    this.time.timeScale = 1;

    if (this.debugLogs)
    {
      console.log(
        `${this.LogPrefix()} slowdown begin — duration=${this.slowDuration}s`
      );
    }
  }

  /**
   * Lerp time scale from 1 → 0 over slowDuration on the unscaled clock so
   * the ramp is not slowed by the scale it is writing.
   */
  private AdvanceSlowdown(): void
  {
    this.slowElapsedSeconds += this.time.unscaledDeltaSeconds;

    const duration = Math.max(0.1, this.slowDuration);
    let blend = this.slowElapsedSeconds / duration;
    if (blend > 1)
    {
      blend = 1;
    }

    // Smoothstep ease for a softer freeze.
    blend = blend * blend * (3 - 2 * blend);
    this.time.timeScale = 1 - blend;

    this.LogProgressOncePerSecond(
      `slowdown timeScale=${this.time.timeScale.toFixed(2)}`,
      this.slowElapsedSeconds,
      duration
    );

    if (this.slowElapsedSeconds < duration)
    {
      return;
    }

    this.time.timeScale = 0;
    this.RevealEndgameScreen();
    this.sequenceComplete = true;

    if (this.debugLogs)
    {
      console.log(`${this.LogPrefix()} sequence complete — time frozen`);
    }
  }

  /** Enable the authored endgame screen entity. */
  private RevealEndgameScreen(): void
  {
    if (this.endgameScreen === null)
    {
      return;
    }

    SetEntityActive(this.endgameScreen, true);

    if (this.debugLogs)
    {
      console.log(
        `${this.LogPrefix()} enable Endgame screen "${this.endgameScreen.name}"`
      );
    }
  }

  /** Log timer progress at most once per whole second. */
  private LogProgressOncePerSecond(
    label: string,
    elapsedSeconds: number,
    totalSeconds: number
  ): void
  {
    if (!this.debugLogs || totalSeconds <= 0)
    {
      return;
    }

    const wholeSecond = Math.floor(elapsedSeconds);
    if (wholeSecond === this.lastLoggedSecond || wholeSecond <= 0)
    {
      return;
    }

    if (wholeSecond > Math.floor(totalSeconds))
    {
      return;
    }

    this.lastLoggedSecond = wholeSecond;
    console.log(
      `${this.LogPrefix()} ${label} ${wholeSecond.toFixed(0)}/${totalSeconds.toFixed(1)}s`
    );
  }

  /** Console prefix for debug output. */
  private LogPrefix(): string
  {
    return `[Endgame:${this.entity.name}]`;
  }

  /**
   * Whether the target rigidbody's entity is inside the end game zone trigger.
   * Requires a physics body on the target (Rigid Body component).
   */
  private IsTargetInsideZone(): boolean
  {
    if (this.endGameZone === null || this.target === null)
    {
      return false;
    }

    if (this.target.body === undefined)
    {
      return false;
    }

    return IsEntityInsideColliderVolume(
      this.target,
      this.endGameZone,
      this.zoneAttachment
    );
  }
}
