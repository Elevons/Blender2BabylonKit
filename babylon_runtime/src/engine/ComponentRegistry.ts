import { Behavior } from "./Behavior";

export type BehaviorCtor = new () => Behavior;

/**
 * Maps SCRIPT component names (as typed in Blender) to Behavior classes.
 * Built-in components (TAG, COLLIDER, RIGIDBODY) are handled directly by the
 * LevelLoader; only SCRIPT components are resolved through here.
 */
export class ComponentRegistry {
  private scripts = new Map<string, BehaviorCtor>();

  registerScript(name: string, ctor: BehaviorCtor): this {
    if (this.scripts.has(name)) {
      console.warn(`[bjs] script "${name}" is already registered; overwriting`);
    }
    this.scripts.set(name, ctor);
    return this;
  }

  /** Register many at once: { Rotator, PlayerController } */
  registerScripts(map: Record<string, BehaviorCtor>): this {
    for (const [name, ctor] of Object.entries(map)) this.registerScript(name, ctor);
    return this;
  }

  create(name: string): Behavior | undefined {
    const ctor = this.scripts.get(name);
    if (!ctor) {
      console.warn(`[bjs] no script registered for "${name}"`);
      return undefined;
    }
    return new ctor();
  }
}

/**
 * Auto-register behaviors from a folder, keyed by filename stem. Pair with the
 * Blender "Open Script…" picker: selecting `behaviors/PlayerController.ts` stores
 * the registry key "PlayerController", and this maps that file's default (or
 * stem-named) export to the same key.
 *
 * Usage (Vite):
 *   const mods = import.meta.glob("./behaviors/*.{ts,js}", { eager: true });
 *   autoRegisterBehaviors(registry, mods);
 *
 * Convention: one behavior class per file, file named after the class, exported
 * as `export default class Foo` (or `export class Foo`).
 */
export function autoRegisterBehaviors(
  registry: ComponentRegistry,
  modules: Record<string, unknown>
): ComponentRegistry {
  for (const [path, mod] of Object.entries(modules)) {
    const stem = path.split("/").pop()!.replace(/\.[tj]sx?$/, "");
    const m = mod as Record<string, unknown>;
    const ctor = (m.default ?? m[stem]) as BehaviorCtor | undefined;
    if (typeof ctor === "function") {
      registry.registerScript(stem, ctor);
    }
  }
  return registry;
}
