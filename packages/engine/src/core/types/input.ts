export type InputDevice = "KEYBOARD" | "GAMEPAD";
/** The shape of the value an action produces. */
export type InputControlType = "BUTTON" | "AXIS" | "VECTOR2";
/** Unity's action behavior types (callback semantics differ per type). */
export type InputActionType = "BUTTON" | "VALUE" | "PASSTHROUGH";
export type InputCompositeType = "1DAXIS" | "2DVECTOR";

/** When binding a gamepad axis inside a composite, read only + or - direction. */
export type InputAxisHalf = "NONE" | "POSITIVE" | "NEGATIVE";

/**
 * One binding: either a direct control read (a keyboard key, a gamepad button,
 * or a gamepad axis) or a composite combining part bindings into an axis or
 * 2D-vector value.
 */
export interface InputBindingData {
  device?: InputDevice;
  /** Raw token: a KeyboardEvent.key string ("space", "w"), or "button"/"axis" for gamepads. */
  control?: string;
  /** Standard-mapping gamepad button/axis index (0 = A/Cross or left stick X). */
  index?: number;
  /** Multiplier applied to an analog value (-1 flips a stick). */
  scale?: number;
  /**
   * For gamepad axis bindings in a composite: POSITIVE = only + direction,
   * NEGATIVE = only - direction (as a positive magnitude). NONE = full -1..1.
   */
  axisHalf?: InputAxisHalf;
  /** When set, this binding composes its `parts` instead of reading a control. */
  composite?: InputCompositeType | null;
  /** 1DAXIS parts: negative/positive. 2DVECTOR parts: up/down/left/right. */
  parts?: Record<string, InputBindingData>;
}

export interface InputActionData {
  name: string;
  type: InputActionType;
  controlType: InputControlType;
  bindings: InputBindingData[];
}

export interface InputActionMapData {
  name: string;
  actions: InputActionData[];
}

export interface InputActionAssetData {
  maps: InputActionMapData[];
}
