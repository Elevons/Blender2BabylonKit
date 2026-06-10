import { Behavior } from "./Behavior";

export type BehaviorConstructor = new () => Behavior;

/**
 * Maps a SCRIPT component's script name (as typed in Blender) to its Behavior
 * class. This registers *behaviors*, not components: the built-in components
 * (TAG, COLLIDER, RIGIDBODY, CAMERA) are applied directly by the LevelLoader,
 * and only the Behavior bound by a SCRIPT component is resolved through here.
 */
export class BehaviorRegistry
{
  private scripts = new Map<string, BehaviorConstructor>();

  /** Register a single behavior class under the name Blender stores. */
  RegisterScript(scriptName: string, behaviorConstructor: BehaviorConstructor): this
  {
    if (this.scripts.has(scriptName))
    {
      console.warn(`[bjs] script "${scriptName}" is already registered; overwriting`);
    }

    this.scripts.set(scriptName, behaviorConstructor);
    return this;
  }

  /** Register several behaviors at once, e.g. { Rotator, PlayerController }. */
  RegisterScripts(scriptMap: Record<string, BehaviorConstructor>): this
  {
    for (const [scriptName, behaviorConstructor] of Object.entries(scriptMap))
    {
      this.RegisterScript(scriptName, behaviorConstructor);
    }

    return this;
  }

  /** Instantiate the behavior registered under a name, or warn and return undefined. */
  Create(scriptName: string): Behavior | undefined
  {
    const behaviorConstructor = this.scripts.get(scriptName);
    if (behaviorConstructor === undefined)
    {
      console.warn(`[bjs] no script registered for "${scriptName}"`);
      return undefined;
    }

    return new behaviorConstructor();
  }
}

/**
 * Auto-register behaviors from a folder, keyed by filename stem, so the Blender
 * "Open Script..." picker (which stores the stem) resolves to the matching class.
 *
 * Usage (Vite):
 *   const modules = import.meta.glob("./behaviors/*.{ts,js}", { eager: true });
 *   AutoRegisterBehaviors(registry, modules);
 *
 * Convention: one behavior class per file, file named after the class, exported
 * as `export default class Foo` (or `export class Foo`).
 */
export function AutoRegisterBehaviors(
  registry: BehaviorRegistry,
  modules: Record<string, unknown>
): BehaviorRegistry
{
  for (const [modulePath, loadedModule] of Object.entries(modules))
  {
    const stem = modulePath.split("/").pop()!.replace(/\.[tj]sx?$/, "");
    const moduleExports = loadedModule as Record<string, unknown>;
    const behaviorConstructor = (moduleExports.default ?? moduleExports[stem]) as
      | BehaviorConstructor
      | undefined;

    if (typeof behaviorConstructor === "function")
    {
      registry.RegisterScript(stem, behaviorConstructor);
    }
  }

  return registry;
}
