import { Mesh } from "@babylonjs/core";
import {
  Button3D,
  HolographicButton,
  TouchHolographicButton,
  MeshButton3D,
  TextBlock,
  Image as GuiImage,
  type Control3D,
} from "@babylonjs/gui";
import type { Entity } from "../../core/Entity";
import type { Gui3DControlComponent } from "../../core/types";
import { ResolveManifestAssetUrl } from "../../core/loader/manifest";

/**
 * Control construction for the 3D GUI. Creation and content application are
 * separate steps because Babylon requires a control to be added to a container
 * (or the manager root) BEFORE its content/text is set — content assigned
 * earlier is silently ignored. The builder sequences: create -> addControl ->
 * link -> ApplyControlContent.
 */

/** Find the mesh a MeshButton3D can wrap: the node itself, or a child mesh
 *  (multi-material objects import as a TransformNode wrapper over per-material
 *  child meshes). */
function FindButtonMesh(entity: Entity): Mesh | undefined
{
  if (entity.node instanceof Mesh)
  {
    return entity.node;
  }

  return entity.node.getChildMeshes().find(
    (childMesh): childMesh is Mesh => childMesh instanceof Mesh
  );
}

/** Create the (still content-less) Babylon control for one component. */
export function CreateGui3DControl(
  controlComponent: Gui3DControlComponent,
  entity: Entity
): Control3D | undefined
{
  switch (controlComponent.type)
  {
    case "GUI3D_BUTTON":
      return new Button3D(entity.name);
    case "GUI3D_HOLO":
      return new HolographicButton(entity.name);
    case "GUI3D_TOUCH_HOLO":
      return new TouchHolographicButton(entity.name);
    case "GUI3D_MESH":
    {
      const buttonMesh = FindButtonMesh(entity);
      if (buttonMesh === undefined)
      {
        console.warn(
          `[bjs] "${entity.name}" has a 3D Mesh Button component but no mesh to wrap — skipping`
        );
        return undefined;
      }
      return new MeshButton3D(buttonMesh, entity.name);
    }
  }
}

/** Build the 2D content (image preferred, else text) for a Button3D facade. */
function BuildButton3DContent(text: string, imageUrl: string | null): TextBlock | GuiImage
{
  if (imageUrl !== null)
  {
    const imageContent = new GuiImage("content", imageUrl);
    imageContent.stretch = GuiImage.STRETCH_UNIFORM;
    return imageContent;
  }

  const textContent = new TextBlock("content", text);
  textContent.color = "white";
  textContent.fontSize = 48;
  return textContent;
}

/**
 * Apply text/image/tooltip to a freshly added control. MUST run after the
 * control is added to its container — Babylon creates the control's internal
 * plates on add, and content set before that is lost.
 */
export function ApplyControlContent(
  control: Control3D,
  controlComponent: Gui3DControlComponent,
  baseUrl: string
): void
{
  const imageUrl = "image" in controlComponent && controlComponent.image !== null
    ? ResolveManifestAssetUrl(baseUrl, controlComponent.image)
    : null;

  switch (controlComponent.type)
  {
    case "GUI3D_BUTTON":
    {
      const button = control as Button3D;
      button.contentResolution = controlComponent.contentResolution;
      button.content = BuildButton3DContent(controlComponent.text, imageUrl);
      break;
    }
    case "GUI3D_HOLO":
    case "GUI3D_TOUCH_HOLO":
    {
      // Both classes share the holographic text/image/tooltip surface.
      const button = control as HolographicButton;
      if (controlComponent.text.length > 0)
      {
        button.text = controlComponent.text;
      }
      if (imageUrl !== null)
      {
        button.imageUrl = imageUrl;
      }
      if (controlComponent.tooltip.length > 0)
      {
        button.tooltipText = controlComponent.tooltip;
      }
      break;
    }
    case "GUI3D_MESH":
      break; // The wrapped mesh is the visual; nothing to apply.
  }
}
