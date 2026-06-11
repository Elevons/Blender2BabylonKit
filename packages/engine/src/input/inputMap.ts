/**
 * `@inputMap("Name")` marks a behavior field that receives an InputActionMap
 * handle, injected by the loader before OnStart(). Example:
 *
 *   class PlayerController extends Behavior
 *   {
 *     @inputMap("Player") player!: InputActionMap;  // or @inputMap() for scene default
 *
 *     OnUpdate(): void
 *     {
 *       const move = this.player.FindAction("Move")?.ReadVector2();
 *     }
 *   }
 *
 * Like @exposed, this is a cross-language contract: the Blender add-on scans
 * behavior sources for the literal token `@inputMap("...")` so its Input
 * Actions panel can validate references and create missing maps — hence the
 * intentionally lower-case name (exempt from the PascalCase function rule).
 *
 * Uses legacy (experimental) decorators — "experimentalDecorators" is on in
 * tsconfig. The decorator only records the field name + map name; the loader
 * does the actual injection (see core/loader/entityBuilder.ts → InjectInputMaps).
 */

export interface InputMapField {
  field: string;
  map: string;
}

const MAP_REGISTRY = new WeakMap<Function, InputMapField[]>();

/** Decorator factory: record which named map this field should receive.
 *  Omit the name (or pass "") to use the scene default from the manifest. */
export function inputMap(mapName = "")
{
  return (target: object, propertyKey: string): void =>
  {
    const owningConstructor = target.constructor as Function;

    let fields = MAP_REGISTRY.get(owningConstructor);
    if (fields === undefined)
    {
      fields = [];
      MAP_REGISTRY.set(owningConstructor, fields);
    }

    if (!fields.some((entry) => entry.field === propertyKey))
    {
      fields.push({ field: propertyKey, map: mapName });
    }
  };
}

/** Return the input-map field descriptors recorded for an instance's class. */
export function GetInputMapFields(instance: object): InputMapField[]
{
  return MAP_REGISTRY.get(instance.constructor) ?? [];
}
