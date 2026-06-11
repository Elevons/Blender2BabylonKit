import type { InputActionAssetData } from "../core/types";
import { InputActionMap } from "./InputActionMap";
import type { InputAction } from "./InputAction";
import type { DeviceState } from "./Devices";

/**
 * The project-wide collection of action maps (Unity's InputActionAsset).
 * Authored in Blender's "Input Actions" panel, exported into the manifest's
 * scene block, and loaded by the LevelLoader into InputManager.actions.
 */
export class InputActionAsset
{
  readonly maps: InputActionMap[] = [];

  private byName = new Map<string, InputActionMap>();

  constructor(data: InputActionAssetData)
  {
    for (const mapData of data.maps)
    {
      const map = new InputActionMap(mapData);
      this.maps.push(map);
      this.byName.set(map.name, map);
    }
  }

  /** Look up a map by name (no warning — callers decide how to react). */
  FindMap(name: string): InputActionMap | undefined
  {
    return this.byName.get(name);
  }

  /** Look up an action by "Map/Action" path or by bare name across all maps. */
  FindAction(path: string): InputAction | undefined
  {
    const slash = path.indexOf("/");
    if (slash >= 0)
    {
      const map = this.byName.get(path.slice(0, slash));
      return map?.FindAction(path.slice(slash + 1));
    }

    for (const map of this.maps)
    {
      const action = map.actions.find((candidate) => candidate.name === path);
      if (action !== undefined)
      {
        return action;
      }
    }

    console.warn(`[bjs] input: no action "${path}" in any map`);
    return undefined;
  }

  /** Enable every map. */
  Enable(): void
  {
    for (const map of this.maps)
    {
      map.Enable();
    }
  }

  /** Disable every map. */
  Disable(): void
  {
    for (const map of this.maps)
    {
      map.Disable();
    }
  }

  /** @internal Per-frame evaluation of all enabled maps. */
  Process(devices: DeviceState): void
  {
    for (const map of this.maps)
    {
      map.Process(devices);
    }
  }
}
