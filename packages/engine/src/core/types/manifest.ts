import type { EntityData } from "./entity";
import type { DetailMapOverrideInfo, NodeMaterialOverrideInfo } from "./materials";
import type { SceneInfo } from "./scene";

export interface LevelManifest {
  version: number;
  glb: string;
  /** Exported with "Debug Build" on: enables runtime debug keys. Missing = true. */
  debug?: boolean;
  scene?: SceneInfo;   // optional scene-wide render settings
  /** Node Material Editor overrides keyed by Blender material name. */
  materials?: NodeMaterialOverrideInfo[];
  /** Detail map overrides keyed by Blender material name. */
  detailMaps?: DetailMapOverrideInfo[];
  entities: EntityData[];
}
