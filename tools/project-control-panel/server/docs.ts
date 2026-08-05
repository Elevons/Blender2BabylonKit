import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";

import { ResolveKitRepoRoot } from "./paths.js";

const KIT_REPO_ROOT_OR_NULL = ResolveKitRepoRoot();
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const DOCS_DIR = KIT_REPO_ROOT_OR_NULL !== null
  ? path.join(KIT_REPO_ROOT_OR_NULL, "docs")
  : path.join(PACKAGE_ROOT, "docs");

const DOCS_INDEX = DOCS_DIR.length > 0 ? path.join(DOCS_DIR, "index.html") : "";

export interface DocsStatus
{
  /** False only when the versioned documentation is missing. */
  available: boolean;
  built: boolean;
  indexPath: string;
  url: string;
}

function IsDocsBuilt(): boolean
{
  return DOCS_INDEX.length > 0 && fs.existsSync(DOCS_INDEX);
}

export function GetDocsStatus(): DocsStatus
{
  return {
    available: IsDocsBuilt(),
    built: IsDocsBuilt(),
    indexPath: DOCS_INDEX,
    url: "/docs/",
  };
}

export function MountDocsStatic(app: Express): void
{
  if (DOCS_DIR.length === 0 || !fs.existsSync(DOCS_DIR))
  {
    return;
  }
  app.use("/docs", express.static(DOCS_DIR, { index: "index.html", extensions: ["html"] }));
}
