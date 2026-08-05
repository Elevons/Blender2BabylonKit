import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import express, { type Express } from "express";

import { REPO_ROOT } from "./paths.js";

export const DOCS_DIR = path.join(REPO_ROOT, "docs");
const DOCS_INDEX = path.join(DOCS_DIR, "index.html");

export interface DocsStatus
{
  built: boolean;
  indexPath: string;
  url: string;
}

function IsDocsBuilt(): boolean
{
  return fs.existsSync(DOCS_INDEX);
}

export function GetDocsStatus(): DocsStatus
{
  return {
    built: IsDocsBuilt(),
    indexPath: DOCS_INDEX,
    url: "/docs/",
  };
}

export async function BuildDocs(): Promise<DocsStatus>
{
  await new Promise<void>((resolve, reject) =>
  {
    const child = spawn("npm", ["run", "docs:build"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) =>
    {
      if (code === 0) { resolve(); }
      else { reject(new Error(`docs:build failed (${code})`)); }
    });
  });
  return GetDocsStatus();
}

export function MountDocsStatic(app: Express): void
{
  if (!fs.existsSync(DOCS_DIR))
  {
    return;
  }
  app.use("/docs", express.static(DOCS_DIR, { index: "index.html", extensions: ["html"] }));
}
