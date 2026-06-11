// Core: manifest schema, runtime container, and the load pipeline.
export * from "./core/types";
export * from "./core/Entity";
export * from "./core/Level";
export * from "./core/LevelLoader";

// Scripting: the Behavior system and its Blender-facing @exposed decorator.
export * from "./scripting/Behavior";
export * from "./scripting/exposed";
export * from "./scripting/BehaviorRegistry";

// Input: the Unity-style input system (InputManager, action maps, @inputMap).
export * from "./input";

// Subsystems: each applies one slice of the manifest the glb can't express.
export * from "./subsystems/physics";
export * from "./subsystems/lights";
export * from "./subsystems/cameras";
export * from "./subsystems/shadows";
export * from "./subsystems/environment";
export * from "./subsystems/fog";
export * from "./subsystems/postprocess";
export * from "./subsystems/animation";
export * from "./subsystems/audio";
export * from "./subsystems/triggers";
export * from "./subsystems/constraints";
