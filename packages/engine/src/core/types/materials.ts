/** One texture slot bound to an NME block at export time. */
export interface NodeMaterialTextureInfo {
  blockId: number;
  blockName?: string;
  /** Manifest-relative path (e.g. "materials/albedo.png"). */
  file: string;
}

/** One inspector-visible InputBlock value authored in Blender. */
export interface NodeMaterialInputInfo {
  blockId: number;
  blockName?: string;
  type: "FLOAT" | "INT" | "BOOL" | "VECTOR2" | "VECTOR3" | "VECTOR4" | "COLOR3" | "COLOR4";
  value: number | boolean | number[];
}

/** One color stop on an inspector-visible GradientBlock. */
export interface NodeMaterialGradientColorStep {
  step: number;
  color: {
    r: number;
    g: number;
    b: number;
  };
}

/** One inspector-visible GradientBlock authored in Blender. */
export interface NodeMaterialGradientInfo {
  blockId: number;
  blockName?: string;
  colorSteps: NodeMaterialGradientColorStep[];
}

/** Blender material → Babylon node material override. */
export interface NodeMaterialOverrideInfo {
  /** Blender / glTF material name used for matching at runtime. */
  name: string;
  /** Manifest-relative path to the node material JSON. */
  file: string;
  /** Optional texture bindings when the JSON omits image data. */
  textures?: NodeMaterialTextureInfo[];
  /** Optional InputBlock overrides (also patched into the exported JSON). */
  inputs?: NodeMaterialInputInfo[];
  /** Optional GradientBlock overrides (also patched into the exported JSON). */
  gradients?: NodeMaterialGradientInfo[];
}

/** Blender material → Babylon DetailMapConfiguration override for glTF PBR materials. */
export interface DetailMapOverrideInfo {
  /** Blender / glTF material name used for matching at runtime. */
  name: string;
  /** Manifest-relative path to the packed detail texture image. */
  file: string;
  /** Tile the detail map over the chosen UV layer (uScale / vScale). Default 1. */
  uvScale?: number;
  /** UV layer index (0 = TEXCOORD_0 / first UVMap). Default 0. */
  coordinatesIndex?: number;
  /** How strongly the detail albedo blends with the base albedo (0–1). Default 1. */
  diffuseBlendLevel?: number;
  /** How strongly the detail roughness blends with the base roughness (0–1). Default 1. */
  roughnessBlendLevel?: number;
  /** Strength of the detail normal bump effect. Default 1. */
  bumpLevel?: number;
  /** Normal blend method. Default WHITEOUT. */
  normalBlendMethod?: "WHITEOUT" | "RNM";
}
