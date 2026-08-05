#!/usr/bin/env node
/**
 * Generate Tauri icon set from publish.icon (a square PNG).
 *
 *   npm run publish:icon -- --app my-game
 *
 * Requirements for a good icon (this is what broke the old 1×1 placeholder):
 *   - PNG format
 *   - Square (width === height)
 *   - Ideally 1024×1024 (Tauri recommends ≥1024; 512 works in a pinch)
 * Path is relative to the app root, e.g. "icon.png" or "assets/app-icon.png".
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ParseAppArg,
  ReadPublishConfig,
  ResolveAppDir,
} from "./config.mjs";

/**
 * Read IHDR width/height from a PNG file. Returns null if not a valid PNG.
 */
export function ReadPngSize(filePath)
{
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24)
  {
    return null;
  }
  // PNG signature
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let index = 0; index < signature.length; index++)
  {
    if (buffer[index] !== signature[index])
    {
      return null;
    }
  }
  // IHDR chunk starts at byte 8; width/height are big-endian u32 at 16 and 20.
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * Resolve and validate the source icon path from publish.icon.
 */
export function ResolveIconPath(appDir, iconRelative)
{
  if (!iconRelative || iconRelative.trim() === "")
  {
    return {
      ok: false,
      error:
        'publish.icon is empty — set it to a square PNG path relative to the app ' +
        '(e.g. "icon.png"). Prefer 1024×1024.',
    };
  }

  const absolutePath = path.isAbsolute(iconRelative)
    ? iconRelative
    : path.resolve(appDir, iconRelative);

  if (!fs.existsSync(absolutePath))
  {
    return {
      ok: false,
      error: `Icon not found: ${absolutePath}`,
    };
  }

  if (!absolutePath.toLowerCase().endsWith(".png"))
  {
    return {
      ok: false,
      error: `Icon must be a .png file (got ${path.basename(absolutePath)}). ` +
        "Convert your art to PNG first — tauri icon does not accept SVG/ICO as input.",
    };
  }

  const size = ReadPngSize(absolutePath);
  if (size === null)
  {
    return {
      ok: false,
      error: `Not a valid PNG: ${absolutePath}`,
    };
  }

  if (size.width !== size.height)
  {
    return {
      ok: false,
      error:
        `Icon must be square (got ${size.width}×${size.height}). ` +
        "Crop/pad to a square before running publish:icon.",
    };
  }

  if (size.width < 32)
  {
    return {
      ok: false,
      error:
        `Icon is ${size.width}×${size.height} — too small. ` +
        "Use at least 512×512; Tauri recommends 1024×1024. " +
        "(A 1×1 placeholder will produce broken .ico/.icns files.)",
    };
  }

  const warnings = [];
  if (size.width < 512)
  {
    warnings.push(
      `Icon is only ${size.width}×${size.height}; 1024×1024 is recommended for crisp desktop/store icons.`,
    );
  }

  return { ok: true, absolutePath, size, warnings };
}

/**
 * Run `npx tauri icon <png>` from the app dir. Returns true on success.
 */
export function ApplyPublishIcon(appDir, iconRelative)
{
  const resolved = ResolveIconPath(appDir, iconRelative);
  if (!resolved.ok)
  {
    console.error(`[publish:icon] ${resolved.error}`);
    return false;
  }

  for (const warning of resolved.warnings ?? [])
  {
    console.warn(`[publish:icon] warning: ${warning}`);
  }

  const tauriDir = path.join(appDir, "src-tauri");
  if (!fs.existsSync(tauriDir))
  {
    console.error(
      `[publish:icon] no src-tauri/ — run: npm run publish:init -- --app ${path.basename(appDir)}`,
    );
    return false;
  }

  console.log(
    `[publish:icon] generating icon set from ${resolved.absolutePath} ` +
    `(${resolved.size.width}×${resolved.size.height})`,
  );

  const result = spawnSync("npx", ["tauri", "icon", resolved.absolutePath], {
    cwd: appDir,
    stdio: "inherit",
  });

  if (result.status !== 0)
  {
    console.error("[publish:icon] tauri icon failed");
    return false;
  }

  console.log(`[publish:icon] wrote icons under ${path.join(tauriDir, "icons")}`);
  return true;
}

function Main()
{
  const appName = ParseAppArg(process.argv.slice(2));
  const appDir = ResolveAppDir(appName);
  const config = ReadPublishConfig(appDir);
  const ok = ApplyPublishIcon(appDir, config.icon);
  process.exit(ok ? 0 : 1);
}

const thisFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] !== undefined ? path.resolve(process.argv[1]) : "";
if (invokedFile === thisFile)
{
  Main();
}
