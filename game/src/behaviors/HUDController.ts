import { Rectangle, TextBlock, Slider, Container, Control } from "@babylonjs/gui";
import { Vector3 } from "@babylonjs/core";
import { Behavior, exposed } from "@bjs/engine";
import type { Entity } from "@bjs/engine";

/**
 * Drives the descent HUD from the Train Engine's world transform:
 * - depth readout + depth slider + tag that tracks the slider marker,
 * - artificial horizon (authored `horizonGroup` rotates with roll only;
 *   the wings, frame, and readouts stay fixed),
 * - PITCH / ROLL degree readouts,
 * - elapsed mission timer.
 *
 * Depth is measured downward from `surfaceHeight` (world Y of the surface),
 * so a Train Engine at y = -2480 with surfaceHeight = 0 reads 2 480 M.
 */
export default class HUDController extends Behavior
{
  @exposed({ type: "entity", label: "Train Engine" })
  trainEngine: Entity | null = null;

  @exposed({ min: 0, step: 1, label: "Min Depth (m)" })
  minDepth = 0;

  @exposed({ min: 1, step: 1, label: "Max Depth (m)" })
  maxDepth = 11034;

  @exposed({ step: 0.5, label: "Surface Height (world Y)" })
  surfaceHeight = 0;

  @exposed({ label: "Invert Pitch" })
  invertPitch = false;

  @exposed({ label: "Invert Roll" })
  invertRoll = false;

  private currentDepthTag: TextBlock | null = null;
  private timerTag: TextBlock | null = null;
  private depthSlider: Slider | null = null;
  private depthFill: Rectangle | null = null;
  private surfaceLabel: TextBlock | null = null;
  private floorLabel: TextBlock | null = null;

  /** Authored container holding only the horizon linework (roll rotation). */
  private horizonGroup: Container | null = null;
  private ahPitchValue: TextBlock | null = null;
  private ahRollValue: TextBlock | null = null;

  private elapsedSeconds = 0;

  /**
   * World-space probe axes (Babylon convention, Y-up):
   * `getDirection` maps these through the node's world rotation, so the
   * results are true world vectors regardless of how the mesh was authored.
   */
  private static readonly LOCAL_FORWARD = new Vector3(0, 0, 1);
  private static readonly LOCAL_UP = new Vector3(0, 1, 0);
  private static readonly LOCAL_RIGHT = new Vector3(1, 0, 0);
  private readonly worldForward = new Vector3();
  private readonly worldUp = new Vector3();
  private readonly worldRight = new Vector3();

  /** Resolve HUD controls from this entity's authored GUI component. */
  OnStart(): void
  {
    const guiAttachment = this.entity.GetAttachment("GUI");
    if (guiAttachment === undefined)
    {
      console.warn(`[HUDController] "${this.entity.name}" has no GUI component.`);
      return;
    }

    const texture = guiAttachment.texture;

    this.currentDepthTag = this.ResolveControl(texture, "currentDepthTag", TextBlock);
    this.timerTag        = this.ResolveControl(texture, "timer", TextBlock);
    this.depthSlider     = this.ResolveControl(texture, "depthSlider", Slider);
    this.depthFill       = this.ResolveControl(texture, "depthFill", Rectangle);
    this.surfaceLabel    = this.ResolveControl(texture, "surfaceLabel", TextBlock);
    this.floorLabel      = this.ResolveControl(texture, "floorLabel", TextBlock);
    this.horizonGroup    = this.ResolveControl(texture, "horizonGroup", Container);
    this.ahPitchValue    = this.ResolveControl(texture, "ahPitchValue", TextBlock);
    this.ahRollValue     = this.ResolveControl(texture, "ahRollValue", TextBlock);

    if (this.timerTag !== null)
    {
      this.timerTag.text = "T+ 00:00:00";
    }

    // Apply the exposed depth range to the slider and its end labels.
    if (this.depthSlider !== null)
    {
      this.depthSlider.minimum = this.minDepth;
      this.depthSlider.maximum = this.maxDepth;
      this.depthSlider.value = this.minDepth;

      // Display-only: no built-in value bar (it fills bottom-up, wrong
      // direction for a top-down depth gauge). depthFill handles it.
      this.depthSlider.displayValueBar = false;
      this.depthSlider.isHitTestVisible = false;
    }

    if (this.depthFill !== null)
    {
      this.depthFill.height = "0px";
    }
    if (this.surfaceLabel !== null)
    {
      this.surfaceLabel.text = `SURFACE  ${this.FormatMetres(this.minDepth)} M`;
    }
    if (this.floorLabel !== null)
    {
      this.floorLabel.text = `FLOOR  ${this.FormatMetres(this.maxDepth)} M`;
    }

    // The tag will be positioned in pixels along the slider from now on.
    if (this.currentDepthTag !== null)
    {
      this.currentDepthTag.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    }
  }

  /** Refresh depth, slider, tag position, attitude, and mission timer. */
  OnUpdate(deltaSeconds: number): void
  {
    this.UpdateDepth();
    this.UpdateAttitude();
    this.UpdateTimerTag(deltaSeconds);
  }

  /** Depth readout, slider value, and tag position along the slider track. */
  private UpdateDepth(): void
  {
    if (this.trainEngine === null)
    {
      return;
    }

    const worldY = this.trainEngine.node.getAbsolutePosition().y;
    const rawDepth = this.surfaceHeight - worldY;
    const depth = Math.min(Math.max(rawDepth, this.minDepth), this.maxDepth);

    if (this.depthSlider !== null)
    {
      this.depthSlider.value = depth;
    }

    this.UpdateDepthFill(depth);

    if (this.currentDepthTag !== null)
    {
      this.currentDepthTag.text = `\u25C4 ${this.FormatMetres(depth)} M`;
      this.SyncTagToSlider(depth);
    }
  }

  /**
   * Place the depth tag so its text centre lines up with the slider's
   * marker for the current depth. Uses the slider's live measure, so it
   * stays correct across window resizes and idealWidth scaling.
   */
  private SyncTagToSlider(depth: number): void
  {
    if (this.depthSlider === null || this.currentDepthTag === null)
    {
      return;
    }

    const range = this.maxDepth - this.minDepth;
    if (range <= 0)
    {
      return;
    }

    // 0 at the surface (top of track, invertValues), 1 at the floor.
    const t = (depth - this.minDepth) / range;

    const trackHeight = this.depthSlider.heightInPixels;
    const trackTop = this.depthSlider.centerY - trackHeight / 2;
    const markerY = trackTop + t * trackHeight;

    this.currentDepthTag.topInPixels =
      markerY - this.currentDepthTag.heightInPixels / 2;
  }

  /**
   * Slave the fill rectangle's full geometry to the slider's live measure:
   * same column as the track, anchored to the track's top edge, height
   * grows downward with depth. Overrides authored position, so the fill is
   * always aligned regardless of how it was placed in the GUI file.
   */
  private UpdateDepthFill(depth: number): void
  {
    if (this.depthFill === null || this.depthSlider === null)
    {
      return;
    }

    const range = this.maxDepth - this.minDepth;
    if (range <= 0)
    {
      return;
    }

    const t = (depth - this.minDepth) / range;
    const trackHeight = this.depthSlider.heightInPixels;
    const trackWidth = this.depthSlider.widthInPixels;
    const trackTop = this.depthSlider.centerY - trackHeight / 2;
    const trackLeft = this.depthSlider.centerX - trackWidth / 2;

    this.depthFill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.depthFill.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    this.depthFill.leftInPixels = trackLeft;
    this.depthFill.topInPixels = trackTop;
    this.depthFill.widthInPixels = trackWidth;
    this.depthFill.heightInPixels = t * trackHeight;
  }

  /**
   * Derive pitch and roll from the Train Engine's transform in *world*
   * coordinates (Babylon Y-up):
   *   pitch = elevation of the world forward axis above the horizontal,
   *   roll  = bank of the world right axis, measured about forward.
   * A level vehicle (worldUp.y = 1) reads 0deg / 0deg.
   *
   * Roll rotates the horizon linework only; pitch and roll are also
   * published as degree readouts. The horizon never translates vertically.
   */
  private UpdateAttitude(): void
  {
    if (this.trainEngine === null)
    {
      return;
    }

    const node = this.trainEngine.node;
    node.getDirectionToRef(HUDController.LOCAL_FORWARD, this.worldForward);
    node.getDirectionToRef(HUDController.LOCAL_UP, this.worldUp);
    node.getDirectionToRef(HUDController.LOCAL_RIGHT, this.worldRight);

    const forwardY = Math.min(Math.max(this.worldForward.y, -1), 1);
    let pitchDeg = Math.asin(forwardY) * (180 / Math.PI);
    let rollDeg = Math.atan2(this.worldRight.y, this.worldUp.y) * (180 / Math.PI);

    if (this.invertPitch)
    {
      pitchDeg = -pitchDeg;
    }
    if (this.invertRoll)
    {
      rollDeg = -rollDeg;
    }

    // Rotate only the horizon lines opposite the vehicle bank so the drawn
    // horizon stays level with the world while the wings stay fixed.
    if (this.horizonGroup !== null)
    {
      this.horizonGroup.rotation = -rollDeg * (Math.PI / 180);
    }

    if (this.ahPitchValue !== null)
    {
      this.ahPitchValue.text = this.FormatDegrees(pitchDeg);
    }
    if (this.ahRollValue !== null)
    {
      this.ahRollValue.text = this.FormatDegrees(rollDeg);
    }
  }

  /** Advance and format the mission timer as T+ HH:MM:SS. */
  private UpdateTimerTag(deltaSeconds: number): void
  {
    if (this.timerTag === null)
    {
      return;
    }

    this.elapsedSeconds += deltaSeconds;

    const totalSeconds = Math.floor(this.elapsedSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    this.timerTag.text =
      `T+ ${this.PadTwo(hours)}:${this.PadTwo(minutes)}:${this.PadTwo(seconds)}`;
  }

  /** Find a named control and check it is the expected type. */
  private ResolveControl<T extends Control>(
    texture: { getControlByName(name: string): Control | null },
    name: string,
    expected: new (...args: never[]) => T): T | null
  {
    const control = texture.getControlByName(name);
    if (control instanceof expected)
    {
      return control;
    }

    console.warn(`[HUDController] GUI item "${name}" was not found or has an unexpected type.`);
    return null;
  }

  /** Format a signed angle as "+12.3°" / "-4.6°". */
  private FormatDegrees(value: number): string
  {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(1)}\u00B0`;
  }

  /** Format metres with thin-space thousands grouping to match the HUD ("2 480"). */
  private FormatMetres(value: number): string
  {
    return Math.round(value)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  /** Zero-pad a numeric component to two digits. */
  private PadTwo(value: number): string
  {
    return value.toString().padStart(2, "0");
  }
}