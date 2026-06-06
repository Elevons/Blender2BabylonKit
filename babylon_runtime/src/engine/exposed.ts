import { Color3, Vector3 } from "@babylonjs/core";

/**
 * Marks a behavior field as editable in Blender. Example:
 *
 *   class Rotator extends Behavior {
 *     @exposed({ min: 0, max: 360 }) speed = 45;
 *     @exposed() axis: [number, number, number] = [0, 1, 0];
 *     @exposed({ type: "color" }) tint = new Color3(1, 1, 1);
 *   }
 *
 * Blender parses these decorators from the .ts file to build its UI, and the
 * runtime applies the edited values onto the instance before onStart().
 *
 * Uses legacy (experimental) decorators — enable "experimentalDecorators" in
 * tsconfig (esbuild/Vite support these). The decorator only records the field
 * name + UI hints; it never changes how the field itself behaves.
 */
export type ListElem =
  | "float"
  | "int"
  | "string"
  | "bool"
  | "vector3"
  | "color"
  | "entity";

export interface ExposeOptions {
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  type?:
    | "color"
    | "vector3"
    | "float"
    | "int"
    | "bool"
    | "string"
    | "entity"
    | "enum"
    | "list";
  options?: string[]; // enum: the allowed choices
  of?: ListElem;      // list: the element type (for runtime coercion)
}

export interface ExposedField extends ExposeOptions {
  name: string;
}

/** A deferred object reference: resolve `guid` to an Entity after all entities exist. */
export interface PendingRef {
  instance: object;
  field: string;
  guid: string;
  index?: number; // when set, assign into instance[field][index] (entity lists)
}

const REGISTRY = new WeakMap<Function, ExposedField[]>();

export function exposed(options: ExposeOptions = {}) {
  return (target: object, propertyKey: string) => {
    const ctor = target.constructor as Function;
    let list = REGISTRY.get(ctor);
    if (!list) {
      list = [];
      REGISTRY.set(ctor, list);
    }
    if (!list.some((f) => f.name === propertyKey)) {
      list.push({ name: propertyKey, ...options });
    }
  };
}

export function getExposedFields(instance: object): ExposedField[] {
  return REGISTRY.get(instance.constructor) ?? [];
}

function coerce(current: unknown, incoming: unknown): unknown {
  if (Array.isArray(incoming)) {
    if (current instanceof Color3) return Color3.FromArray(incoming);
    if (current instanceof Vector3) return Vector3.FromArray(incoming);
  }
  return incoming;
}

/** Convert one list element to its runtime type (vec3/color become objects). */
function coerceElem(of: ListElem | undefined, el: unknown): unknown {
  if (Array.isArray(el)) {
    if (of === "vector3") return Vector3.FromArray(el);
    if (of === "color") return Color3.FromArray(el);
  }
  return el; // float / int / string / bool pass through
}

/**
 * Apply the manifest's stored values onto a behavior instance. Returns any
 * object references that still need resolving (entity-typed fields hold a GUID
 * that can only be turned into an Entity once every entity exists). Plain
 * fields are assigned immediately; array values become Color3 / Vector3 when
 * the field's default is one of those.
 */
export function applyExposedVars(
  instance: object,
  vars?: Record<string, unknown>
): PendingRef[] {
  const pending: PendingRef[] = [];
  if (!vars) return pending;
  const inst = instance as Record<string, unknown>;
  for (const field of getExposedFields(instance)) {
    if (!(field.name in vars)) continue;
    const value = vars[field.name];
    if (field.type === "entity") {
      if (typeof value === "string" && value) {
        pending.push({ instance, field: field.name, guid: value });
      } else {
        inst[field.name] = null;
      }
    } else if (field.type === "list" && Array.isArray(value)) {
      if (field.of === "entity") {
        // Pre-size with nulls; each non-empty guid resolves into its slot later.
        const arr: (unknown | null)[] = new Array(value.length).fill(null);
        inst[field.name] = arr;
        value.forEach((g, i) => {
          if (typeof g === "string" && g) {
            pending.push({ instance, field: field.name, guid: g, index: i });
          }
        });
      } else {
        inst[field.name] = value.map((el) => coerceElem(field.of, el));
      }
    } else {
      inst[field.name] = coerce(inst[field.name], value);
    }
  }
  return pending;
}
