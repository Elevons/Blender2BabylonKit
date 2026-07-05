import { AbstractMesh } from "@babylonjs/core";
import { AdvancedDynamicTexture } from "@babylonjs/gui";
import type { Entity } from "../core/Entity";
import type { GuiComponent } from "../core/types";
import { RegisterAttachment } from "../core/attachments";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

/**
 * 2D GUI subsystem: attach a Babylon GUI layout (the JSON saved by the online
 * GUI Editor) to an entity. FULLSCREEN mode renders a 2D overlay (a HUD); MESH
 * mode draws the layout onto the entity's mesh surface for in-world UI. The
 * layout is parsed asynchronously (it's fetched from disk), so callers queue
 * the returned promise and await it during FinalizeLevel.
 *
 * The texture is named after its file stem, so `entity.GetGui("hud")` finds
 * "gui/hud.json", and `texture.getControlByName(...)` reaches its controls.
 */
export async function ApplyGui(
  entity: Entity,
  guiComponent: GuiComponent,
  baseUrl: string
): Promise<AdvancedDynamicTexture | undefined>
{
  if (guiComponent.file === null || guiComponent.file.length === 0)
  {
    console.warn(`[bjs] "${entity.name}" has a GUI component with no JSON file`);
    return undefined;
  }

  const url = ResolveManifestAssetUrl(baseUrl, guiComponent.file);
  const fileName = guiComponent.file.split("/").pop() ?? guiComponent.file;
  const textureName = fileName.replace(/\.[^.]+$/, "");

  let texture: AdvancedDynamicTexture;
  if (guiComponent.mode === "MESH")
  {
    // Mesh mode needs renderable geometry to project the UI onto.
    if (!(entity.node instanceof AbstractMesh))
    {
      console.warn(
        `[bjs] "${entity.name}" GUI is in Mesh mode but its node is not a mesh — skipping`
      );
      return undefined;
    }
    texture = AdvancedDynamicTexture.CreateForMesh(
      entity.node,
      guiComponent.width,
      guiComponent.height
    );
    texture.name = textureName;
  }
  else
  {
    texture = AdvancedDynamicTexture.CreateFullscreenUI(
      textureName,
      guiComponent.foreground,
      entity.node.getScene()
    );
  }

  await texture.parseFromURLAsync(url);
  RegisterAttachment(entity, { type: "GUI", data: guiComponent, texture });

  return texture;
}
