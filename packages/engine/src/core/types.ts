/**
 * The manifest schema: TypeScript mirrors of everything the Blender exporter
 * writes into `.scene.json`. Data shapes only — the runtime Entity class lives
 * in Entity.ts, and the loader that consumes these lives in LevelLoader.ts.
 */
export * from "./types/index";
