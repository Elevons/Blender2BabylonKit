// Core: manifest schema, runtime container, and the load pipeline.
export * from "./core/types";
export * from "./core/spawnTypes";
export * from "./core/guidFields";
export * from "./core/attachments";
export * from "./core/ComponentHost";
export * from "./core/Entity";
export { SetEntityActive, IsEntityActive, EntityFromNode } from "./core/entityActive";
export {
  AssignNodeEntity,
  ReadNodeEntity,
  AssignSceneLevel,
  ReadSceneLevel,
} from "./core/bjsMetadata";
export * from "./core/GameClock";
export * from "./core/Level";
export * from "./core/LevelLoader";
export * from "./core/levelSession";
export * from "./core/LevelDirector";
export * from "./core/loadingOverlay";
export * from "./core/bootstrap";

// Scripting: the Behavior system and its Blender-facing @exposed decorator.
export * from "./scripting/Behavior";
export * from "./scripting/exposed";
export * from "./scripting/BehaviorRegistry";

// Input: the Unity-style input system (InputManager, action maps, @inputMap).
export * from "./input";

// Subsystems: each applies one slice of the manifest the glb can't express.
export * from "./subsystems/physics/index";
export * from "./subsystems/lights";
export * from "./subsystems/cameras";
export * from "./subsystems/shadows";
export * from "./subsystems/clusteredLights";
export * from "./subsystems/environment";
export * from "./subsystems/fog";
export * from "./subsystems/atmosphere";
export * from "./subsystems/postprocess";
export * from "./subsystems/animation";
export * from "./subsystems/animatorController";
export * from "./subsystems/audio";
export * from "./subsystems/particles";
export * from "./subsystems/materials/index";
export * from "./subsystems/collisions";
export * from "./subsystems/constraints";
export * from "./subsystems/reflectionProbes";
export * from "./subsystems/renderLayers";
export * from "./subsystems/lod";

// UI: 2D GUI layouts (GUI Editor JSON) and the 3D GUI (buttons + panels).
export * from "./ui/gui2d";
export * from "./ui/gui3d";
export * from "./ui/msdfText";
