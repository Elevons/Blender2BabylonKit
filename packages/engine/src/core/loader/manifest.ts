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
