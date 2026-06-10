import { Color3, Vector3 } from "@babylonjs/core";

/**
 * `@exposed` marks a behavior field as editable in Blender. Example:
 *
 *   class Rotator extends Behavior
 *   {
 *     @exposed({ min: 0, max: 360 }) speed = 45;
 *     @exposed() axis: [number, number, number] = [0, 1, 0];
 *     @exposed({ type: "color" }) tint = new Color3(1, 1, 1);
 *   }
 *
 * Blender parses these decorators from the .ts source to build its UI, and the
 * runtime applies the edited values onto the instance before OnStart().
 *
 * NOTE: the decorator name `exposed` is intentionally lower-case. It is a
 * cross-language contract — the Blender add-on's script_parse.py scans for the
 * literal token `@exposed` — so it is exempt from the PascalCase function rule.
 *
 * Uses legacy (experimental) decorators — enable "experimentalDecorators" in
 * tsconfig. The decorator only records the field name + UI hints; it never
 * changes how the field itself behaves.
 */
export type ListElement =
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
  of?: ListElement;   // list: the element type (for runtime coercion)
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

const FIELD_REGISTRY = new WeakMap<Function, ExposedField[]>();

/** Decorator factory: record an editable field's name + UI hints for Blender. */
export function exposed(options: ExposeOptions = {})
{
  return (target: object, propertyKey: string): void =>
  {
    const owningConstructor = target.constructor as Function;

    let fields = FIELD_REGISTRY.get(owningConstructor);
    if (fields === undefined)
    {
      fields = [];
      FIELD_REGISTRY.set(owningConstructor, fields);
    }

    if (!fields.some((field) => field.name === propertyKey))
    {
      fields.push({ name: propertyKey, ...options });
    }
  };
}

/** Return the exposed-field descriptors recorded for an instance's class. */
export function GetExposedFields(instance: object): ExposedField[]
{
  return FIELD_REGISTRY.get(instance.constructor) ?? [];
}

/** Coerce a scalar/array value to the runtime type implied by the field's default. */
function CoerceValue(currentValue: unknown, incomingValue: unknown): unknown
{
  if (Array.isArray(incomingValue))
  {
    if (currentValue instanceof Color3)
    {
      return Color3.FromArray(incomingValue);
    }
    if (currentValue instanceof Vector3)
    {
      return Vector3.FromArray(incomingValue);
    }
  }

  return incomingValue;
}

/** Convert one list element to its runtime type (vec3 / color become objects). */
function CoerceListElement(elementType: ListElement | undefined, element: unknown): unknown
{
  if (Array.isArray(element))
  {
    if (elementType === "vector3")
    {
      return Vector3.FromArray(element);
    }
    if (elementType === "color")
    {
      return Color3.FromArray(element);
    }
  }

  return element; // float / int / string / bool pass through
}

/**
 * Apply the manifest's stored values onto a behavior instance. Returns any
 * object references that still need resolving — entity-typed fields hold a GUID
 * that can only become an Entity once every entity exists. Plain fields are
 * assigned immediately; array values become Color3 / Vector3 when the field's
 * default is one of those.
 */
export function ApplyExposedVars(
  instance: object,
  vars?: Record<string, unknown>
): PendingRef[]
{
  const pendingReferences: PendingRef[] = [];
  if (vars === undefined)
  {
    return pendingReferences;
  }

  const targetInstance = instance as Record<string, unknown>;

  for (const field of GetExposedFields(instance))
  {
    if (!(field.name in vars))
    {
      continue;
    }

    const incomingValue = vars[field.name];

    if (field.type === "entity")
    {
      ApplyEntityReference(instance, targetInstance, field.name, incomingValue, pendingReferences);
    }
    else if (field.type === "list" && Array.isArray(incomingValue))
    {
      ApplyListValue(instance, targetInstance, field, incomingValue, pendingReferences);
    }
    else
    {
      // Plain scalar / vector / color field.
      targetInstance[field.name] = CoerceValue(targetInstance[field.name], incomingValue);
    }
  }

  return pendingReferences;
}

/** Entity reference: defer to the second pass (stored as a GUID string). */
function ApplyEntityReference(
  instance: object,
  targetInstance: Record<string, unknown>,
  fieldName: string,
  incomingValue: unknown,
  pendingReferences: PendingRef[]
): void
{
  if (typeof incomingValue === "string" && incomingValue.length > 0)
  {
    pendingReferences.push({ instance, field: fieldName, guid: incomingValue });
  }
  else
  {
    targetInstance[fieldName] = null;
  }
}

/** List: entity lists pre-size with nulls and defer; others coerce per element. */
function ApplyListValue(
  instance: object,
  targetInstance: Record<string, unknown>,
  field: ExposedField,
  incomingValue: unknown[],
  pendingReferences: PendingRef[]
): void
{
  if (field.of === "entity")
  {
    const resolvedSlots: (unknown | null)[] = new Array(incomingValue.length).fill(null);
    targetInstance[field.name] = resolvedSlots;

    for (let index = 0; index < incomingValue.length; index++)
    {
      const guid = incomingValue[index];
      if (typeof guid === "string" && guid.length > 0)
      {
        pendingReferences.push({ instance, field: field.name, guid, index });
      }
    }
  }
  else
  {
    targetInstance[field.name] = incomingValue.map((element) =>
      CoerceListElement(field.of, element)
    );
  }
}
