import type { LevelManifest } from "../types";

/**
 * Manifest acquisition: fetch the `.scene.json` and fail with actionable
 * errors for the two common dev-server mistakes (404 and HTML fallback).
 */

/** Return the directory portion of a URL (everything up to the last slash). */
export function GetDirectory(url: string): string
{
  const lastSlash = url.lastIndexOf("/");
  return lastSlash >= 0 ? url.slice(0, lastSlash + 1) : "";
}

/**
 * Build a fetch URL for a manifest-relative asset path. Encodes each path
 * segment so filenames with spaces, parentheses, etc. still resolve (the dev
 * server otherwise 404s and may return HTML, which breaks JSON.parse).
 */
export function ResolveManifestAssetUrl(baseUrl: string, manifestPath: string): string
{
  const encodedPath = manifestPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return baseUrl + encodedPath;
}

/** Fetch the manifest JSON, with clear errors for the two common failures. */
export async function FetchAndValidateManifest(manifestUrl: string): Promise<LevelManifest>
{
  const response = await fetch(manifestUrl);
  if (!response.ok)
  {
    throw new Error(
      `[bjs] could not fetch manifest "${manifestUrl}" (HTTP ${response.status}). ` +
      `Check the file exists and the path/filename match exactly.`
    );
  }

  const text = await response.text();
  if (text.trimStart().startsWith("<"))
  {
    throw new Error(
      `[bjs] "${manifestUrl}" returned HTML, not JSON. The dev server likely ` +
      `served index.html because the file was not found at that path.`
    );
  }

  return JSON.parse(text) as LevelManifest;
}
