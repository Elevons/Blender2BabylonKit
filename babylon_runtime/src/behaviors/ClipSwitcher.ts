import { Behavior, exposed } from "../engine";

/**
 * TEST/demo for NLA animation. Cycles through this entity's animation clips,
 * switching every `interval` seconds. Shows runtime control via
 * `entity.animations` (the alternative to the Animation panel's autoplay).
 *
 * Needs an object with 2+ NLA strips exported. The Animation panel's autoplay
 * can stay off — this behavior drives playback from OnStart.
 */
export default class ClipSwitcher extends Behavior
{
  @exposed({ min: 0.5, label: "Switch every (s)" })
  interval = 3;

  @exposed({ label: "Loop each clip" })
  loop = true;

  private elapsedSeconds = 0;
  private currentClipIndex = 0;

  /** Start on the first clip. */
  OnStart(): void
  {
    this.Play(0);
  }

  /** Advance to the next clip once the interval elapses. */
  OnUpdate(deltaSeconds: number): void
  {
    if (this.entity.animations.length < 2)
    {
      return;
    }

    this.elapsedSeconds += deltaSeconds;
    if (this.elapsedSeconds >= this.interval)
    {
      this.elapsedSeconds = 0;
      this.currentClipIndex = (this.currentClipIndex + 1) % this.entity.animations.length;
      this.Play(this.currentClipIndex);
    }
  }

  /** Stop all clips and start the one at the given index. */
  private Play(index: number): void
  {
    for (const group of this.entity.animations)
    {
      group.stop();
    }
    this.entity.animations[index]?.start(this.loop);
  }
}
