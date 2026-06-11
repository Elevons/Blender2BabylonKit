/**
 * Input system (Unity Input System style): InputManager owns the device state
 * and the project-wide InputActionAsset of Action Maps > Actions > Bindings.
 *
 * Usage in a behavior:
 *   @inputMap("Player") player!: InputActionMap;  // explicit map
 *   // — or omit @inputMap and use behavior.input (scene default map)
 *
 *   OnStart(): void
 *   {
 *     this.player.FindAction("Jump")?.performed.add(() => this.Hop());
 *   }
 *
 * Bindings and the scene default map are authored in Blender's "Input Actions"
 * panel and exported into the manifest's scene block (inputActions +
 * defaultInputMap).
 */
export { InputManager } from "./InputManager";
export { inputMap, GetInputMapFields } from "./inputMap";
export type { InputMapField } from "./inputMap";
export { InputActionAsset } from "./InputActionAsset";
export { InputActionMap } from "./InputActionMap";
export { InputAction, InputActionEvent } from "./InputAction";
export type { InputActionPhase, InputActionCallback } from "./InputAction";
export type { InputValue, Vector2Value } from "./InputBinding";
export { DEFAULT_INPUT_ASSET } from "./DefaultAsset";
