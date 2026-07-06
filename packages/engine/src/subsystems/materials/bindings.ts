import {
  Color3,
  Color4,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  type Scene,
} from "@babylonjs/core";
import { InputBlock } from "@babylonjs/core/Materials/Node/Blocks/Input/inputBlock";
import {
  GradientBlock,
  GradientBlockColorStep,
} from "@babylonjs/core/Materials/Node/Blocks/gradientBlock";
import { NodeMaterial } from "@babylonjs/core/Materials/Node/nodeMaterial";
import type { NodeMaterialBlock } from "@babylonjs/core/Materials/Node/nodeMaterialBlock";
import type {
  NodeMaterialGradientInfo,
  NodeMaterialInputInfo,
  NodeMaterialOverrideInfo,
} from "../../core/types";
import { ResolveManifestAssetUrl } from "../../core/loader/manifest";
import { ResolveNmeBlockUniqueId } from "./nmeUtils";

/** Locate a texture-bearing block by name first, then by mapped NME block id. */
function FindTextureBlock(
  nodeMaterial: NodeMaterial,
  blockId: number,
  blockName?: string
): (NodeMaterialBlock & { texture?: Texture | null }) | undefined
{
  if (blockName !== undefined && blockName.length > 0)
  {
    const byName = nodeMaterial.getBlockByName(blockName);
    if (byName !== null && byName !== undefined && "texture" in byName)
    {
      return byName as NodeMaterialBlock & { texture?: Texture | null };
    }
  }

  if (blockId > 0)
  {
    const runtimeId = ResolveNmeBlockUniqueId(nodeMaterial, blockId);
    const byId = nodeMaterial.attachedBlocks.find((block) => block.uniqueId === runtimeId);
    if (byId !== undefined && "texture" in byId)
    {
      return byId as NodeMaterialBlock & { texture?: Texture | null };
    }
  }

  return undefined;
}

/** Replace texture blocks with manifest-authored images (authoring wins over embedded JSON). */
export async function BindManifestTextures(
  nodeMaterial: NodeMaterial,
  textures: NodeMaterialOverrideInfo["textures"],
  baseUrl: string,
  scene: Scene
): Promise<void>
{
  if (textures === undefined || textures.length === 0)
  {
    return;
  }

  for (const binding of textures)
  {
    const block = FindTextureBlock(nodeMaterial, binding.blockId, binding.blockName);
    if (block === undefined)
    {
      console.warn(
        `[bjs] node material texture block not found (id ${binding.blockId}` +
        `${binding.blockName !== undefined ? `, name "${binding.blockName}"` : ""})`
      );
      continue;
    }

    block.texture = new Texture(ResolveManifestAssetUrl(baseUrl, binding.file), scene);
  }
}

/** Locate an InputBlock by name first, then by mapped NME block id. */
function FindInputBlock(
  nodeMaterial: NodeMaterial,
  blockId: number,
  blockName?: string
): InputBlock | undefined
{
  if (blockName !== undefined && blockName.length > 0)
  {
    const byName = nodeMaterial.getBlockByName(blockName);
    if (byName instanceof InputBlock)
    {
      return byName;
    }
  }

  if (blockId > 0)
  {
    const runtimeId = ResolveNmeBlockUniqueId(nodeMaterial, blockId);
    const byId = nodeMaterial.attachedBlocks.find((block) => block.uniqueId === runtimeId);
    if (byId instanceof InputBlock)
    {
      return byId;
    }
  }

  return undefined;
}

/** Write a manifest input value into an InputBlock with the matching Babylon type. */
function ApplyInputValue(
  block: InputBlock,
  valueType: NodeMaterialInputInfo["type"],
  value: NodeMaterialInputInfo["value"]
): void
{
  if (valueType === "FLOAT" || valueType === "INT")
  {
    block.value = value as number;
    return;
  }

  if (valueType === "BOOL")
  {
    block.value = value as boolean;
    return;
  }

  const numbers = value as number[];
  if (valueType === "VECTOR2")
  {
    block.value = new Vector2(numbers[0] ?? 0, numbers[1] ?? 0);
    return;
  }

  if (valueType === "VECTOR3")
  {
    block.value = new Vector3(numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0);
    return;
  }

  if (valueType === "VECTOR4")
  {
    block.value = new Vector4(
      numbers[0] ?? 0,
      numbers[1] ?? 0,
      numbers[2] ?? 0,
      numbers[3] ?? 0
    );
    return;
  }

  if (valueType === "COLOR3")
  {
    block.value = new Color3(numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0);
    return;
  }

  block.value = new Color4(
    numbers[0] ?? 0,
    numbers[1] ?? 0,
    numbers[2] ?? 0,
    numbers[3] ?? 1
  );
}

/** Apply every manifest inspector-parameter override to the parsed material. */
export function BindManifestInputs(
  nodeMaterial: NodeMaterial,
  inputs: NodeMaterialOverrideInfo["inputs"]
): void
{
  if (inputs === undefined || inputs.length === 0)
  {
    return;
  }

  for (const binding of inputs)
  {
    const block = FindInputBlock(nodeMaterial, binding.blockId, binding.blockName);
    if (block === undefined)
    {
      continue;
    }

    ApplyInputValue(block, binding.type, binding.value);
  }
}

/** Locate a GradientBlock by name first, then by mapped NME block id. */
function FindGradientBlock(
  nodeMaterial: NodeMaterial,
  blockId: number,
  blockName?: string
): GradientBlock | undefined
{
  if (blockName !== undefined && blockName.length > 0)
  {
    const byName = nodeMaterial.getBlockByName(blockName);
    if (byName instanceof GradientBlock)
    {
      return byName;
    }
  }

  if (blockId > 0)
  {
    const runtimeId = ResolveNmeBlockUniqueId(nodeMaterial, blockId);
    const byId = nodeMaterial.attachedBlocks.find((block) => block.uniqueId === runtimeId);
    if (byId instanceof GradientBlock)
    {
      return byId;
    }
  }

  return undefined;
}

/** Write manifest gradient color steps into a GradientBlock (sorted ascending). */
function ApplyGradientValue(
  block: GradientBlock,
  colorSteps: NodeMaterialGradientInfo["colorSteps"]
): void
{
  const sorted = [...colorSteps].sort(
    (left, right) => left.step - right.step
  );

  block.colorSteps.length = 0;
  for (const step of sorted)
  {
    block.colorSteps.push(
      new GradientBlockColorStep(
        step.step,
        new Color3(step.color.r, step.color.g, step.color.b)
      )
    );
  }

  block.colorStepsUpdated();
}

/** Apply every manifest inspector-gradient override to the parsed material. */
export function BindManifestGradients(
  nodeMaterial: NodeMaterial,
  gradients: NodeMaterialOverrideInfo["gradients"]
): void
{
  if (gradients === undefined || gradients.length === 0)
  {
    return;
  }

  for (const binding of gradients)
  {
    const block = FindGradientBlock(nodeMaterial, binding.blockId, binding.blockName);
    if (block === undefined)
    {
      continue;
    }

    ApplyGradientValue(block, binding.colorSteps);
  }
}
