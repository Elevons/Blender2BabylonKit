import {
  AbstractEngine,
  BaseTexture,
  Matrix,
  Scene,
} from "@babylonjs/core";
import type { Nullable } from "@babylonjs/core/types";

/** Matches Babylon ColorGradingTexture empty-line detection. */
const NON_EMPTY_LINE = /\S+/;

const TEXTURE_FORMAT_RGBA = 5;
const TEXTURE_SAMPLINGMODE_TRILINEAR = 2;
const TEXTURETYPE_UNSIGNED_BYTE = 0;

interface ParsedCubeLut
{
  size: number;
  rgba: Uint8Array;
}

/**
 * Parse an Adobe/IRIDAS .cube LUT into RGBA texels for a 3D color-grading texture.
 * File lines are R-fastest; layout matches Babylon's ColorGradingTexture (.3dl) upload order.
 */
function ParseCubeLutText(text: string): ParsedCubeLut | null
{
  let size = 0;
  const rgbFloats: number[] = [];

  for (const rawLine of text.split("\n"))
  {
    const line = rawLine.trim();
    if (!NON_EMPTY_LINE.test(line) || line.startsWith("#"))
    {
      continue;
    }
    if (line.startsWith("TITLE") || line.startsWith("DOMAIN_"))
    {
      continue;
    }
    if (line.startsWith("LUT_3D_SIZE"))
    {
      size = parseInt(line.split(/\s+/)[1] ?? "", 10);
      continue;
    }
    if (line.startsWith("LUT_1D_SIZE"))
    {
      console.warn("[bjs] post-processing: 1D .cube LUTs are not supported");
      return null;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 3)
    {
      continue;
    }
    rgbFloats.push(
      parseFloat(parts[0]),
      parseFloat(parts[1]),
      parseFloat(parts[2])
    );
  }

  const expectedFloatCount = size * size * size * 3;
  if (size <= 0 || rgbFloats.length !== expectedFloatCount)
  {
    console.warn(
      `[bjs] post-processing: .cube LUT size mismatch (expected ${expectedFloatCount} floats, got ${rgbFloats.length})`
    );
    return null;
  }

  const rgba = new Uint8Array(size * size * size * 4);
  for (let index = 0; index < size * size * size; index++)
  {
    const floatIndex = index * 3;
    const rgbaIndex = index * 4;
    rgba[rgbaIndex + 0] = Math.min(255, Math.max(0, Math.round(rgbFloats[floatIndex + 0] * 255)));
    rgba[rgbaIndex + 1] = Math.min(255, Math.max(0, Math.round(rgbFloats[floatIndex + 1] * 255)));
    rgba[rgbaIndex + 2] = Math.min(255, Math.max(0, Math.round(rgbFloats[floatIndex + 2] * 255)));
    rgba[rgbaIndex + 3] = 255;
  }

  return { size, rgba };
}

/**
 * 3D color-grading texture loaded from an Adobe .cube LUT.
 * Format reference: babylon-cube-luts (Heaust-ops, MIT) — https://github.com/Heaust-ops/babylon-cube-luts
 */
export class CubeColorGradingTexture extends BaseTexture
{
  url!: string;
  private _textureMatrix = Matrix.Identity();
  private _onLoad: Nullable<() => void> = null;

  /**
   * Load a .cube LUT from `url` for use with ImageProcessingConfiguration.colorGradingTexture.
   */
  constructor(
    url: string,
    sceneOrEngine: Scene | AbstractEngine,
    onLoad: Nullable<() => void> = null
  )
  {
    super(sceneOrEngine);
    if (!url)
    {
      return;
    }

    this._textureMatrix = Matrix.Identity();
    this.name = url;
    this.url = url;
    this._onLoad = onLoad;
    this._texture = this._getFromCache(url, true);

    if (!this._texture)
    {
      const scene = this.getScene();
      if (scene !== null && scene.useDelayedTextureLoading)
      {
        this.delayLoadState = 4;
      }
      else
      {
        this.LoadTexture();
      }
    }
    else
    {
      this.TriggerOnLoad();
    }
  }

  /** @returns Identity matrix (unused for grading; kept for ColorGradingTexture parity). */
  getTextureMatrix(): Matrix
  {
    return this._textureMatrix;
  }

  /** Fire the optional constructor callback once the LUT is ready. */
  private TriggerOnLoad(): void
  {
    if (this._onLoad !== null)
    {
      this._onLoad();
    }
  }

  /** Fetch, parse, and upload the .cube LUT into a 3D (or flattened 2D) raw texture. */
  private LoadTexture(): void
  {
    const engine = this._getEngine();
    if (engine === null)
    {
      return;
    }

    const support3D = engine._features.support3DTextures;
    const texture = support3D
      ? engine.createRawTexture3D(
        null, 1, 1, 1, TEXTURE_FORMAT_RGBA, false, false,
        TEXTURE_SAMPLINGMODE_TRILINEAR, null, TEXTURETYPE_UNSIGNED_BYTE
      )
      : engine.createRawTexture(
        null, 1, 1, TEXTURE_FORMAT_RGBA, false, false,
        TEXTURE_SAMPLINGMODE_TRILINEAR, null, TEXTURETYPE_UNSIGNED_BYTE
      );

    this._texture = texture;
    this._texture.isReady = false;
    this.isCube = false;
    this.is3D = support3D;
    this.wrapU = 0;
    this.wrapV = 0;
    this.wrapR = 0;
    this.anisotropicFilteringLevel = 1;

    void this.FetchAndUploadCubeLut(engine, texture);
  }

  /** Load LUT text over fetch (avoids Firefox XHR responseXML noise on plain-text assets). */
  private async FetchAndUploadCubeLut(
    engine: AbstractEngine,
    texture: NonNullable<CubeColorGradingTexture["_texture"]>
  ): Promise<void>
  {
    let loadedText: string;
    try
    {
      const response = await fetch(this.url);
      if (!response.ok)
      {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      loadedText = await response.text();
    }
    catch (error)
    {
      console.warn(`[bjs] post-processing: failed to load .cube LUT "${this.url}"`, error);
      return;
    }

    const parsed = ParseCubeLutText(loadedText);
    if (parsed === null)
    {
      return;
    }

    if (texture.is3D)
    {
      texture.updateSize(parsed.size, parsed.size, parsed.size);
      engine.updateRawTexture3D(texture, parsed.rgba, TEXTURE_FORMAT_RGBA, false);
    }
    else
    {
      texture.updateSize(parsed.size * parsed.size, parsed.size);
      engine.updateRawTexture(texture, parsed.rgba, TEXTURE_FORMAT_RGBA, false);
    }

    texture.isReady = true;
    this.TriggerOnLoad();
  }

  /** @returns A new texture pointing at the same LUT URL. */
  clone(): CubeColorGradingTexture
  {
    const host = this.getScene() ?? this._getEngine();
    if (host === null)
    {
      throw new Error("[bjs] CubeColorGradingTexture.clone: no scene or engine");
    }
    const cloned = new CubeColorGradingTexture(this.url, host);
    cloned.level = this.level;
    return cloned;
  }

  /** Deferred load entry point (mirrors ColorGradingTexture). */
  delayLoad(): void
  {
    if (this.delayLoadState !== 4)
    {
      return;
    }
    this.delayLoadState = 1;
    this._texture = this._getFromCache(this.url, true);
    if (!this._texture)
    {
      this.LoadTexture();
    }
  }
}
