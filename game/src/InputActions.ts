// GENERATED from game/input.inputactions.json — do not edit by hand.
// Regenerate: npm run input:gen
// Usage: import { PlayerActions } from '../InputActions';
//        this.player.FindAction(PlayerActions.Jump)?.IsPressed();

export const Maps = {
  Player: "Player",
  Vehicle: "Vehicle",
} as const;

export const PlayerActions = {
  Move: "Move",
  Look: "Look",
  Jump: "Jump",
  Interact: "Interact",
  Sprint: "Sprint",
  Crouch: "Crouch",
} as const;

export const VehicleActions = {
  MainControl: "Main Control",
  Look: "Look",
  Zoom: "Zoom",
  Reset: "Reset",
} as const;

export type MapName = (typeof Maps)[keyof typeof Maps];
