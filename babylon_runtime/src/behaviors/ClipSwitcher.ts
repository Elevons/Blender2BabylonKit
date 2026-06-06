import { Behavior, exposed } from "../engine";

/**
 * TEST/demo for NLA animation. Cycles through this entity's animation clips,
 * switching every `interval` seconds. Shows runtime control via
 * `entity.animations` (the alternative to the Animation panel's autoplay).
 *
 * Needs an object with 2+ NLA strips exported. The Animation panel's autoplay
 * can stay off — this behavior drives playback from onStart.
 */
export default class ClipSwitcher extends Behavior {
  @exposed({ min: 0.5, label: "Switch every (s)" })
  interval = 3;

  @exposed({ label: "Loop each clip" })
  loop = true;

  private t = 0;
  private i = 0;

  onStart() {
    this.play(0);
  }

  onUpdate(dt: number) {
    if (this.entity.animations.length < 2) return;
    this.t += dt;
    if (this.t >= this.interval) {
      this.t = 0;
      this.i = (this.i + 1) % this.entity.animations.length;
      this.play(this.i);
    }
  }

  private play(index: number) {
    for (const g of this.entity.animations) g.stop();
    this.entity.animations[index]?.start(this.loop);
  }
}
