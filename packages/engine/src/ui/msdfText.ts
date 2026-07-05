import { Color4, type Scene } from "@babylonjs/core";
import { FontAsset, TextRenderer } from "@babylonjs/addons/msdfText";
import type { Entity } from "../core/Entity";
import type { MsdfTextComponent } from "../core/types";
import { RegisterAttachment } from "../core/attachments";
import { ResolveManifestAssetUrl } from "../core/loader/manifest";

/**
 * MSDF text subsystem: attach Babylon's TextRenderer to an entity using font
 * assets exported from Blender (BMFont JSON + glyph atlas PNG). Font assets
 * are cached per scene; TextRenderer instances are drawn each frame via
 * {@link WireMsdfTextRendering} after the main scene pass.
 */

const fontCache = new Map<string, Promise<FontAsset>>();

/**
 * Drop cached font assets for a scene. Called from Level.Dispose so repeated
 * level loads in one session (playground reloads, live link) don't accumulate
 * entries forever — keys embed scene.uniqueId, so stale scenes never hit again.
 */
export function ClearFontCacheForScene(scene: Scene): void
{
  const prefix = `${scene.uniqueId}|`;
  for (const key of fontCache.keys())
  {
    if (key.startsWith(prefix))
    {
      fontCache.delete(key);
    }
  }
}

type MsdfParagraphOptions = {
  textAlign: MsdfTextComponent["textAlign"];
  maxWidth?: number;
  lineHeight?: number;
  letterSpacing?: number;
};

/** Fetch (once per scene + URL pair) and return a shared FontAsset. */
async function LoadFontAsset(
  fontJson: string,
  fontTexture: string,
  baseUrl: string,
  scene: Scene
): Promise<FontAsset>
{
  const jsonUrl = ResolveManifestAssetUrl(baseUrl, fontJson);
  const textureUrl = ResolveManifestAssetUrl(baseUrl, fontTexture);
  const key = `${scene.uniqueId}|${jsonUrl}|${textureUrl}`;

  let promise = fontCache.get(key);
  if (promise === undefined)
  {
    promise = (async () =>
    {
      const definition = await (await fetch(jsonUrl)).text();
      return new FontAsset(definition, textureUrl, scene);
    })();
    fontCache.set(key, promise);
  }

  try
  {
    return await promise;
  }
  catch (error)
  {
    fontCache.delete(key);
    throw error;
  }
}

/** Map manifest paragraph fields to Babylon paragraph options (omit defaults). */
function BuildParagraphOptions(component: MsdfTextComponent): MsdfParagraphOptions
{
  const options: MsdfParagraphOptions = { textAlign: component.textAlign };

  if (component.maxWidth > 0)
  {
    options.maxWidth = component.maxWidth;
  }
  if (component.lineHeight !== 1)
  {
    options.lineHeight = component.lineHeight;
  }
  if (component.letterSpacing !== 1)
  {
    options.letterSpacing = component.letterSpacing;
  }

  return options;
}

/** Apply manifest-authored appearance fields to a TextRenderer. */
function ConfigureTextRenderer(
  textRenderer: TextRenderer,
  entity: Entity,
  component: MsdfTextComponent
): void
{
  textRenderer.parent = entity.node;
  textRenderer.color = new Color4(...component.color);
  textRenderer.thicknessControl = component.thickness;
  textRenderer.isBillboard = component.billboard;
  textRenderer.isBillboardScreenProjected = component.billboardScreenProjected;
  textRenderer.ignoreDepthBuffer = component.ignoreDepth;
  textRenderer.strokeColor = new Color4(...component.strokeColor);
  textRenderer.strokeInsetWidth = component.strokeInset;
  textRenderer.strokeOutsetWidth = component.strokeOutset;
}

/**
 * Create a TextRenderer for one MSDF_TEXT component and parent it to the entity.
 * Shader compilation is async; queue the returned promise during entity load.
 */
export async function ApplyMsdfText(
  entity: Entity,
  component: MsdfTextComponent,
  baseUrl: string
): Promise<TextRenderer | undefined>
{
  if (component.fontJson === null || component.fontTexture === null)
  {
    console.warn(`[bjs] "${entity.name}" has MSDF Text with missing font assets`);
    return undefined;
  }

  if (component.text.length === 0)
  {
    console.warn(`[bjs] "${entity.name}" has MSDF Text with no text`);
    return undefined;
  }

  const scene = entity.node.getScene();
  const engine = scene.getEngine();

  let fontAsset: FontAsset;
  try
  {
    fontAsset = await LoadFontAsset(
      component.fontJson, component.fontTexture, baseUrl, scene
    );
  }
  catch (error)
  {
    console.warn(`[bjs] "${entity.name}" failed to load MSDF font`, error);
    return undefined;
  }

  const unsupported = fontAsset._unsupportedChars(component.text);
  if (unsupported.length > 0)
  {
    console.warn(
      `[bjs] "${entity.name}" MSDF font is missing glyphs for: ${unsupported}`
    );
  }

  let textRenderer: TextRenderer;
  try
  {
    textRenderer = await TextRenderer.CreateTextRendererAsync(fontAsset, engine);
  }
  catch (error)
  {
    console.warn(`[bjs] "${entity.name}" failed to create TextRenderer`, error);
    return undefined;
  }

  ConfigureTextRenderer(textRenderer, entity, component);
  textRenderer.addParagraph(component.text, BuildParagraphOptions(component));

  RegisterAttachment(entity, { type: "MSDF_TEXT", data: component, renderer: textRenderer });

  return textRenderer;
}

/** Hooks every TextRenderer into the scene's after-render pass. */
export interface MsdfTextManager
{
  dispose(): void;
}

/** Draw all MSDF text renderers once per frame using the active camera. */
export function WireMsdfTextRendering(
  scene: Scene,
  renderers: readonly TextRenderer[]
): MsdfTextManager | undefined
{
  if (renderers.length === 0)
  {
    return undefined;
  }

  const observer = scene.onAfterRenderObservable.add(() =>
  {
    const camera = scene.activeCamera;
    // activeCamera is Nullable but may be undefined at runtime; truthiness covers both.
    if (!camera)
    {
      return;
    }

    const view = camera.getViewMatrix();
    const projection = camera.getProjectionMatrix();

    for (const renderer of renderers)
    {
      if (renderer.characterCount > 0)
      {
        renderer.render(view, projection);
      }
    }
  });

  return {
    dispose(): void
    {
      scene.onAfterRenderObservable.remove(observer);
    },
  };
}

/** Gather every TextRenderer created during level load. */
export function CollectTextRenderers(entities: Iterable<Entity>): TextRenderer[]
{
  const renderers: TextRenderer[] = [];
  for (const entity of entities)
  {
    renderers.push(...entity.textRenderers);
  }
  return renderers;
}
