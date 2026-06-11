// GENERATED from apps/playground/input.inputactions.json — do not edit by hand.
// Regenerate: npm run input:gen -- --app playground
// Usage: import { PlayerActions } from '../InputActions';
//        this.player.FindAction(PlayerActions.Jump)?.IsPressed();

export const Maps = {
  Player: "Player",
} as const;

export const PlayerActions = {
  Move: "Move",
  Look: "Look",
  Jump: "Jump",
  Interact: "Interact",
  Sprint: "Sprint",
  Crouch: "Crouch",
} as const;

export type MapName = (typeof Maps)[keyof typeof Maps];
